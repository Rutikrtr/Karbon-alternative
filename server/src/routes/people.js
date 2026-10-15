import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Team, TeamMembership } from '../models/index.js';
import { ah, requireRole, HttpError } from '../middleware/auth.js';
import { audit, isSuper, ledTeamIds } from '../services/access.js';

const r = Router();

/* ---------- Users ---------- */

r.get('/users', ah(async (req, res) => {
  // Everyone signed in may look up colleagues by name (needed for assigning work);
  // memberships are attached so the UI can show which teams each person is in.
  const users = await User.find({}).sort({ name: 1 }).lean();
  const memberships = await TeamMembership.find({ removedAt: null }).populate('team', 'name color').lean();
  const byUser = {};
  for (const m of memberships) (byUser[m.user] ||= []).push({ team: m.team, teamRole: m.teamRole });
  res.json(users.map((u) => ({ ...u, teams: byUser[u._id] || [] })));
}));

r.post('/users', requireRole('super_admin'), ah(async (req, res) => {
  const { name, email, password, role = 'employee', title } = req.body || {};
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
  if (await User.exists({ email: email.toLowerCase() })) throw new HttpError(409, 'That email is already in use');
  const user = await User.create({ name, email, role, title, passwordHash: await bcrypt.hash(password, 10) });
  audit(req.user, 'user.create', { entity: 'User', entityId: user._id, summary: `Created ${role.replace('_', ' ')} ${name}` });
  res.status(201).json(user);
}));

r.patch('/users/:id', requireRole('super_admin'), ah(async (req, res) => {
  const allowed = ['name', 'role', 'title', 'active'];
  const update = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (String(req.params.id) === String(req.user._id) && (update.role && update.role !== 'super_admin' || update.active === false)) {
    throw new HttpError(400, 'You cannot demote or deactivate yourself');
  }
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) throw new HttpError(404, 'User not found');
  audit(req.user, 'user.update', { entity: 'User', entityId: user._id, summary: `Updated ${user.name}` });
  res.json(user);
}));

/* ---------- Teams ---------- */

r.get('/teams', ah(async (req, res) => {
  const teams = await Team.find({ archived: false }).sort({ name: 1 }).lean();
  const memberships = await TeamMembership.find({ removedAt: null }).populate('user', 'name email role title').lean();
  const led = await ledTeamIds(req.user);
  res.json(teams.map((t) => ({
    ...t,
    members: memberships.filter((m) => String(m.team) === String(t._id)).map((m) => ({ ...m.user, teamRole: m.teamRole })),
    canManage: led === null || led.includes(String(t._id)),
  })));
}));

r.post('/teams', requireRole('super_admin'), ah(async (req, res) => {
  const { name, description, color } = req.body || {};
  if (!name) throw new HttpError(400, 'Team name is required');
  const team = await Team.create({ name, description, color });
  audit(req.user, 'team.create', { entity: 'Team', entityId: team._id, summary: `Created team ${name}` });
  res.status(201).json(team);
}));

async function assertCanManageTeam(user, teamId) {
  if (isSuper(user)) return;
  const led = await ledTeamIds(user);
  if (!led.includes(String(teamId))) throw new HttpError(403, 'Only this team’s lead or a Super Admin can change members');
}

r.post('/teams/:id/members', ah(async (req, res) => {
  await assertCanManageTeam(req.user, req.params.id);
  const { userId, teamRole = 'member' } = req.body || {};
  if (teamRole === 'lead' && !isSuper(req.user)) throw new HttpError(403, 'Only a Super Admin can appoint team leads');
  const target = await User.findById(userId);
  if (!target) throw new HttpError(404, 'User not found');
  const m = await TeamMembership.findOneAndUpdate(
    { user: userId, team: req.params.id },
    { teamRole, removedAt: null },
    { upsert: true, new: true },
  );
  const team = await Team.findById(req.params.id);
  audit(req.user, 'team.member_add', { entity: 'Team', entityId: team._id, summary: `Added ${target.name} to ${team.name} as ${teamRole}` });
  res.status(201).json(m);
}));

r.delete('/teams/:id/members/:userId', ah(async (req, res) => {
  await assertCanManageTeam(req.user, req.params.id);
  // Soft removal: only this team is affected; client permissions are not touched.
  const m = await TeamMembership.findOneAndUpdate(
    { user: req.params.userId, team: req.params.id, removedAt: null },
    { removedAt: new Date() }, { new: true },
  ).populate('user', 'name').populate('team', 'name');
  if (!m) throw new HttpError(404, 'Membership not found');
  audit(req.user, 'team.member_remove', { entity: 'Team', entityId: m.team._id, summary: `Removed ${m.user.name} from ${m.team.name}` });
  res.json({ ok: true });
}));

export default r;
