import { Router } from 'express';
import { Task, TaskTemplate, AuditLog, User, ClientPermission } from '../models/index.js';
import { ah, HttpError } from '../middleware/auth.js';
import {
  audit, isSuper, taskScope, canManageClient, canSeeClient, managedClientIds, activePermissionFilter,
} from '../services/access.js';
import { generateRecurringTasks } from '../services/recurrence.js';

const r = Router();
const populateTask = (q) => q.populate('client', 'name').populate('team', 'name color')
  .populate('assignees', 'name').populate('owner', 'name').populate('completedBy', 'name');

/** Assignees must be able to see the client, otherwise they'd get a task they can't open. */
async function assertAssignable(clientId, userIds = []) {
  for (const id of userIds) {
    const u = await User.findById(id);
    if (!u) throw new HttpError(400, 'Unknown assignee');
    if (!(await canSeeClient(u, clientId))) throw new HttpError(400, `${u.name} has no access to this client yet. Grant access first.`);
  }
}

/* ---------- Tasks ---------- */

r.get('/tasks', ah(async (req, res) => {
  const { scope = 'mine', status, client, team, assignee, from, to } = req.query;
  const filter = { $and: [await taskScope(req.user)] };
  if (scope === 'mine') filter.$and.push({ assignees: req.user._id });
  if (status) filter.$and.push({ status: { $in: String(status).split(',') } });
  if (client) filter.$and.push({ client });
  if (team) filter.$and.push({ team });
  if (assignee) filter.$and.push({ assignees: assignee });
  if (from || to) filter.$and.push({ dueDate: { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) } });
  const tasks = await populateTask(Task.find(filter).sort({ dueDate: 1 }).limit(500)).lean();
  res.json(tasks);
}));

r.get('/tasks/:id', ah(async (req, res) => {
  const task = await populateTask(Task.findOne({ _id: req.params.id, ...(await taskScope(req.user)) })).populate('checklist.doneBy', 'name').lean();
  if (!task) throw new HttpError(404, 'Task not found');
  const activity = await AuditLog.find({ entity: 'Task', entityId: task._id }).sort({ createdAt: -1 }).populate('actor', 'name').lean();
  res.json({ ...task, activity, canEdit: await canManageClient(req.user, task.client._id) });
}));

r.post('/tasks', ah(async (req, res) => {
  const { title, client, team, assignees = [], owner, dueDate, priority, sop, checklist = [] } = req.body || {};
  if (!title || !client || !dueDate) throw new HttpError(400, 'Title, client and due date are required');
  if (!(await canManageClient(req.user, client))) throw new HttpError(403, 'You can only create work for clients you manage');
  await assertAssignable(client, assignees);
  const task = await Task.create({
    title, client, team: team || undefined, assignees, owner: owner || assignees[0], dueDate, priority, sop,
    checklist: checklist.filter(Boolean).map((text) => ({ text })), createdBy: req.user._id,
  });
  audit(req.user, 'task.create', { entity: 'Task', entityId: task._id, client, summary: `Created “${title}”` });
  res.status(201).json(task);
}));

r.patch('/tasks/:id', ah(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, ...(await taskScope(req.user)) });
  if (!task) throw new HttpError(404, 'Task not found');
  const manager = await canManageClient(req.user, task.client);
  const isAssignee = task.assignees.some((a) => String(a) === String(req.user._id));
  if (!manager && !isAssignee) throw new HttpError(403, 'Only assignees or managing admins can update this task');
  const body = req.body || {};
  const notes = [];

  if (body.status && body.status !== task.status) {
    notes.push(`status ${task.status} → ${body.status}`);
    task.status = body.status;
    task.completedAt = body.status === 'done' ? new Date() : undefined;
    task.completedBy = body.status === 'done' ? req.user._id : undefined;
  }
  if (body.checklistItem) {
    const item = task.checklist.id(body.checklistItem.id);
    if (!item) throw new HttpError(404, 'Checklist item not found');
    item.done = !!body.checklistItem.done;
    item.doneBy = item.done ? req.user._id : undefined;
    item.doneAt = item.done ? new Date() : undefined;
    notes.push(`${item.done ? 'ticked' : 'unticked'} “${item.text}”`);
  }
  if (manager) {
    for (const k of ['title', 'dueDate', 'priority', 'sop', 'owner', 'team']) {
      if (body[k] !== undefined) { task[k] = body[k] || undefined; notes.push(`changed ${k}`); }
    }
    if (body.assignees) {
      await assertAssignable(task.client, body.assignees);
      task.assignees = body.assignees; notes.push('changed assignees');
      if (!body.assignees.some((a) => String(a) === String(task.owner))) task.owner = body.assignees[0];
    }
  }
  await task.save();
  if (notes.length) audit(req.user, 'task.update', { entity: 'Task', entityId: task._id, client: task.client, summary: notes.join(', ') });
  res.json(task);
}));

/* ---------- Recurring templates ---------- */

r.get('/templates', ah(async (req, res) => {
  const managed = await managedClientIds(req.user);
  const filter = managed === null ? {} : { client: { $in: managed } };
  res.json(await TaskTemplate.find(filter).sort({ createdAt: -1 })
    .populate('client', 'name').populate('team', 'name color').populate('assignees', 'name').lean());
}));

r.post('/templates', ah(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.client || !b.frequency) throw new HttpError(400, 'Title, client and frequency are required');
  if (!(await canManageClient(req.user, b.client))) throw new HttpError(403, 'You can only schedule work for clients you manage');
  await assertAssignable(b.client, b.assignees || []);
  const tpl = await TaskTemplate.create({ ...b, team: b.team || undefined, checklist: (b.checklist || []).filter(Boolean), createdBy: req.user._id });
  const created = await generateRecurringTasks(tpl._id);
  audit(req.user, 'template.create', { entity: 'TaskTemplate', entityId: tpl._id, client: b.client, summary: `Scheduled ${b.frequency} “${b.title}” (${created} upcoming tasks)` });
  res.status(201).json({ template: tpl, created });
}));

r.patch('/templates/:id', ah(async (req, res) => {
  const tpl = await TaskTemplate.findById(req.params.id);
  if (!tpl || !(await canManageClient(req.user, tpl.client))) throw new HttpError(404, 'Template not found');
  if (typeof req.body.active === 'boolean') tpl.active = req.body.active;
  await tpl.save();
  if (tpl.active) await generateRecurringTasks(tpl._id);
  audit(req.user, 'template.update', { entity: 'TaskTemplate', entityId: tpl._id, client: tpl.client, summary: `${tpl.active ? 'Resumed' : 'Paused'} “${tpl.title}”` });
  res.json(tpl);
}));

/* ---------- Dashboard / workload ---------- */

r.get('/dashboard', ah(async (req, res) => {
  const now = new Date();
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);
  const eod = new Date(now); eod.setHours(23, 59, 59, 999);
  const scope = await taskScope(req.user);
  const mine = { ...scope, assignees: req.user._id, status: { $ne: 'done' } };
  const [dueToday, overdue, upcoming] = await Promise.all([
    Task.countDocuments({ ...mine, dueDate: { $gte: sod, $lte: eod } }),
    Task.countDocuments({ ...mine, dueDate: { $lt: sod } }),
    Task.countDocuments({ ...mine, dueDate: { $gt: eod } }),
  ]);
  const result = { mine: { dueToday, overdue, upcoming } };

  if (req.user.role !== 'employee') {
    // Workload across everything this user manages
    const open = { ...scope, status: { $ne: 'done' } };
    const byPerson = await Task.aggregate([
      { $match: open }, { $unwind: '$assignees' },
      { $group: {
        _id: '$assignees',
        open: { $sum: 1 },
        overdue: { $sum: { $cond: [{ $lt: ['$dueDate', sod] }, 1, 0] } },
        today: { $sum: { $cond: [{ $and: [{ $gte: ['$dueDate', sod] }, { $lte: ['$dueDate', eod] }] }, 1, 0] } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $project: { open: 1, overdue: 1, today: 1, name: { $first: '$u.name' } } },
      { $sort: { overdue: -1, open: -1 } },
    ]);
    const byStatus = await Task.aggregate([{ $match: { ...scope, dueDate: { $lte: new Date(eod.getTime() + 7 * 864e5) } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const byTeam = await Task.aggregate([
      { $match: open },
      { $group: { _id: '$team', open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', sod] }, 1, 0] } } } },
      { $lookup: { from: 'teams', localField: '_id', foreignField: '_id', as: 't' } },
      { $project: { open: 1, overdue: 1, name: { $first: '$t.name' }, color: { $first: '$t.color' } } },
      { $sort: { open: -1 } },
    ]);
    const expiringSoon = await ClientPermission.find({
      ...activePermissionFilter(), expiresAt: { $ne: null, $lte: new Date(now.getTime() + 7 * 864e5) },
      ...(isSuper(req.user) ? {} : { client: { $in: await managedClientIds(req.user) } }),
    }).populate('user', 'name').populate('client', 'name').lean();
    Object.assign(result, { byPerson, byStatus, byTeam, expiringSoon });
  }
  res.json(result);
}));

r.get('/audit', ah(async (req, res) => {
  if (req.user.role === 'employee') throw new HttpError(403, 'Not available');
  const managed = await managedClientIds(req.user);
  const filter = managed === null ? {} : { $or: [{ client: { $in: managed } }, { actor: req.user._id }] };
  res.json(await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).populate('actor', 'name role').populate('client', 'name').lean());
}));

export default r;
