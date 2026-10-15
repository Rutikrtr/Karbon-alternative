import { Router } from 'express';
import { Client, ClientAssignment, ClientPermission, AccessRequest, User, Task } from '../models/index.js';
import { ah, requireRole, HttpError } from '../middleware/auth.js';
import {
  audit, isSuper, visibleClientIds, managedClientIds, canSeeClient, canManageClient,
  canGrantDirectly, activePermissionFilter,
} from '../services/access.js';

const r = Router();

r.get('/clients', ah(async (req, res) => {
  const ids = await visibleClientIds(req.user);
  const managed = await managedClientIds(req.user);
  const clients = await Client.find(ids === null ? {} : { _id: { $in: ids } }).sort({ name: 1 }).lean();
  const assignments = await ClientAssignment.find({ client: { $in: clients.map((c) => c._id) }, endedAt: null })
    .populate('team', 'name color').populate('admin', 'name').lean();
  const openCounts = await Task.aggregate([
    { $match: { client: { $in: clients.map((c) => c._id) }, status: { $ne: 'done' } } },
    { $group: { _id: '$client', open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, 1, 0] } } } },
  ]);
  const counts = Object.fromEntries(openCounts.map((c) => [String(c._id), c]));
  res.json(clients.map((c) => ({
    ...c,
    teams: assignments.filter((a) => String(a.client) === String(c._id) && a.team).map((a) => a.team),
    admins: assignments.filter((a) => String(a.client) === String(c._id) && a.admin).map((a) => a.admin),
    openTasks: counts[c._id]?.open || 0,
    overdueTasks: counts[c._id]?.overdue || 0,
    canManage: managed === null || managed.includes(String(c._id)),
  })));
}));

r.post('/clients', requireRole('super_admin'), ah(async (req, res) => {
  const { name, accountingId, contactName, contactEmail, contactPhone, status, notes, teamIds = [], adminIds = [] } = req.body || {};
  if (!name) throw new HttpError(400, 'Client name is required');
  const client = await Client.create({ name, accountingId, contactName, contactEmail, contactPhone, status, notes });
  await ClientAssignment.insertMany([
    ...teamIds.map((team) => ({ client: client._id, team })),
    ...adminIds.map((admin) => ({ client: client._id, admin })),
  ]);
  audit(req.user, 'client.create', { entity: 'Client', entityId: client._id, client: client._id, summary: `Created client ${name}` });
  res.status(201).json(client);
}));

r.get('/clients/:id', ah(async (req, res) => {
  if (!(await canSeeClient(req.user, req.params.id))) throw new HttpError(403, 'You do not have access to this client');
  const client = await Client.findById(req.params.id).lean();
  if (!client) throw new HttpError(404, 'Client not found');
  const manage = await canManageClient(req.user, client._id);
  const assignments = await ClientAssignment.find({ client: client._id, endedAt: null })
    .populate('team', 'name color').populate('admin', 'name email').lean();
  const permissions = manage
    ? await ClientPermission.find({ client: client._id, ...activePermissionFilter() })
      .populate('user', 'name email role title').populate('grantedBy', 'name').sort({ createdAt: -1 }).lean()
    : [];
  const requests = manage
    ? await AccessRequest.find({ client: client._id, status: 'pending' }).populate('user', 'name').populate('requestedBy', 'name').lean()
    : [];
  res.json({
    ...client,
    teams: assignments.filter((a) => a.team).map((a) => ({ ...a.team, assignmentId: a._id })),
    admins: assignments.filter((a) => a.admin).map((a) => ({ ...a.admin, assignmentId: a._id })),
    permissions, requests, canManage: manage, isSuper: isSuper(req.user),
  });
}));

r.patch('/clients/:id', ah(async (req, res) => {
  if (!(await canManageClient(req.user, req.params.id))) throw new HttpError(403, 'Only managing admins can edit this client');
  const allowed = ['name', 'accountingId', 'contactName', 'contactEmail', 'contactPhone', 'status', 'notes'];
  const update = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true });
  audit(req.user, 'client.update', { entity: 'Client', entityId: client._id, client: client._id, summary: `Updated ${client.name}` });
  res.json(client);
}));

/* Assign / reassign managing teams & admins (Super Admin). History is kept via endedAt. */
r.post('/clients/:id/assignments', requireRole('super_admin'), ah(async (req, res) => {
  const { teamId, adminId } = req.body || {};
  if (!teamId && !adminId) throw new HttpError(400, 'Pick a team or an admin');
  if (adminId) {
    const admin = await User.findById(adminId);
    if (!admin || admin.role === 'employee') throw new HttpError(400, 'Only Admins can manage clients');
  }
  const filter = { client: req.params.id, endedAt: null, ...(teamId ? { team: teamId } : { admin: adminId }) };
  const a = (await ClientAssignment.findOne(filter)) || (await ClientAssignment.create(filter));
  audit(req.user, 'client.assign', { entity: 'Client', entityId: req.params.id, client: req.params.id, summary: teamId ? 'Assigned a team' : 'Assigned an admin' });
  res.status(201).json(a);
}));

r.delete('/clients/:id/assignments/:aid', requireRole('super_admin'), ah(async (req, res) => {
  await ClientAssignment.updateOne({ _id: req.params.aid, client: req.params.id }, { endedAt: new Date() });
  audit(req.user, 'client.unassign', { entity: 'Client', entityId: req.params.id, client: req.params.id, summary: 'Ended an assignment' });
  res.json({ ok: true });
}));

/* ---------- Explicit client permissions ---------- */

r.post('/clients/:id/permissions', ah(async (req, res) => {
  const clientId = req.params.id;
  if (!(await canManageClient(req.user, clientId))) throw new HttpError(403, 'Only managing admins can grant access');
  const { userId, expiresAt, level = 'work', reason } = req.body || {};
  const target = await User.findById(userId);
  if (!target) throw new HttpError(404, 'User not found');
  const client = await Client.findById(clientId);

  if (!(await canGrantDirectly(req.user, clientId, userId))) {
    const reqDoc = await AccessRequest.create({ client: clientId, user: userId, requestedBy: req.user._id, expiresAt, reason });
    audit(req.user, 'access.request', { entity: 'AccessRequest', entityId: reqDoc._id, client: clientId, summary: `Requested ${client.name} access for ${target.name}` });
    return res.status(202).json({ pending: true, request: reqDoc, message: `${target.name} is not in a team you lead, so a Super Admin must approve this.` });
  }
  await ClientPermission.updateMany({ client: clientId, user: userId, revokedAt: null }, { revokedAt: new Date(), revokedBy: req.user._id });
  const perm = await ClientPermission.create({ client: clientId, user: userId, level, expiresAt: expiresAt || null, grantedBy: req.user._id });
  audit(req.user, 'access.grant', { entity: 'ClientPermission', entityId: perm._id, client: clientId, summary: `Granted ${target.name} ${level} access to ${client.name}${expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ''}` });
  res.status(201).json(perm);
}));

r.delete('/clients/:id/permissions/:pid', ah(async (req, res) => {
  if (!(await canManageClient(req.user, req.params.id))) throw new HttpError(403, 'Only managing admins can revoke access');
  const perm = await ClientPermission.findOneAndUpdate(
    { _id: req.params.pid, client: req.params.id }, { revokedAt: new Date(), revokedBy: req.user._id }, { new: true },
  ).populate('user', 'name').populate('client', 'name');
  if (!perm) throw new HttpError(404, 'Permission not found');
  audit(req.user, 'access.revoke', { entity: 'ClientPermission', entityId: perm._id, client: req.params.id, summary: `Revoked ${perm.user.name}'s access to ${perm.client.name}` });
  res.json({ ok: true });
}));

/* ---------- Access requests (cross-team grants) ---------- */

r.get('/access-requests', ah(async (req, res) => {
  const filter = isSuper(req.user) ? {} : { requestedBy: req.user._id };
  const rows = await AccessRequest.find(filter).sort({ createdAt: -1 }).limit(100)
    .populate('client', 'name').populate('user', 'name email').populate('requestedBy', 'name').populate('decidedBy', 'name').lean();
  res.json(rows);
}));

r.post('/access-requests/:id/:decision', requireRole('super_admin'), ah(async (req, res) => {
  if (!['approve', 'reject'].includes(req.params.decision)) throw new HttpError(404, 'Unknown action');
  const ar = await AccessRequest.findOne({ _id: req.params.id, status: 'pending' }).populate('user', 'name').populate('client', 'name');
  if (!ar) throw new HttpError(404, 'Request not found or already decided');
  const approve = req.params.decision === 'approve';
  ar.status = approve ? 'approved' : 'rejected';
  ar.decidedBy = req.user._id; ar.decidedAt = new Date();
  await ar.save();
  if (approve) {
    await ClientPermission.create({ client: ar.client._id, user: ar.user._id, expiresAt: ar.expiresAt || null, grantedBy: req.user._id });
  }
  audit(req.user, `access.${ar.status}`, { entity: 'AccessRequest', entityId: ar._id, client: ar.client._id, summary: `${approve ? 'Approved' : 'Rejected'} ${ar.client.name} access for ${ar.user.name}` });
  res.json(ar);
}));

export default r;
