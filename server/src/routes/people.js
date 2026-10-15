import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Team, TeamMembership, ClientPermission, ClientAssignment } from '../models/index.js';
import { ah, requireRole, HttpError } from '../middleware/auth.js';
import { audit, isSuper, ledTeamIds } from '../services/access.js';

const r = Router();

/* ---------- Users ---------- */

r.get('/users', ah(async (req, res) => {
  // Everyone signed in may look up colleagues by name (needed for assigning work);
  // memberships are attached so the UI can show which teams each person is in.
  const users = await User.find({ deletedAt: null }).sort({ name: 1 }).lean();
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

/**
 * Remove a person. Their account is closed and they lose every team and client access,
 * but their name stays on past tasks and in the activity log.
 */
r.delete('/users/:id', requireRole('super_admin'), ah(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot remove yourself');
  const user = await User.findOne({ _id: req.params.id, deletedAt: null });
  if (!user) throw new HttpError(404, 'User not found');
  const leads = await TeamMembership.find({ user: user._id, teamRole: 'lead', removedAt: null }).populate('team', 'name archived');
  const ledActive = leads.filter((l) => l.team && !l.team.archived);
  if (ledActive.length) throw new HttpError(400, `${user.name} is TL of ${ledActive.map((l) => l.team.name).join(', ')}. Choose a new TL first.`);
  const now = new Date();
  await TeamMembership.updateMany({ user: user._id, removedAt: null }, { removedAt: now });
  await ClientPermission.updateMany({ user: user._id, revokedAt: null }, { revokedAt: now, revokedBy: req.user._id });
  await ClientAssignment.updateMany({ admin: user._id, endedAt: null }, { endedAt: now });
  user.active = false; user.deletedAt = now;
  user.email = `removed-${user._id}-${user.email}`; // frees the email so it can be used again
  await user.save();
  audit(req.user, 'user.remove', { entity: 'User', entityId: user._id, summary: `Removed ${user.name}` });
  res.json({ ok: true });
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

/** Each team has exactly one TL. Setting a new one turns the previous TL into a member. */
async function setTeamLead(teamId, leadId) {
  const lead = await User.findById(leadId);
  if (!lead || lead.role !== 'admin') throw new HttpError(400, 'The team lead must be a person with the Admin / TL role');
  await TeamMembership.updateMany({ team: teamId, teamRole: 'lead', user: { $ne: lead._id } }, { teamRole: 'member' });
  await TeamMembership.findOneAndUpdate({ team: teamId, user: lead._id }, { teamRole: 'lead', removedAt: null }, { upsert: true });
  return lead;
}

r.post('/teams', requireRole('super_admin'), ah(async (req, res) => {
  const { name, description, color, leadId } = req.body || {};
  if (!name) throw new HttpError(400, 'Team name is required');
  if (!leadId) throw new HttpError(400, 'Choose the TL / manager for this team');
  if (await Team.exists({ name })) throw new HttpError(409, 'A team with that name already exists');
  const team = await Team.create({ name, description, color });
  const lead = await setTeamLead(team._id, leadId).catch(async (e) => { await team.deleteOne(); throw e; });
  audit(req.user, 'team.create', { entity: 'Team', entityId: team._id, summary: `Created team ${name} led by ${lead.name}` });
  res.status(201).json(team);
}));

r.patch('/teams/:id', requireRole('super_admin'), ah(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) throw new HttpError(404, 'Team not found');
  const { name, description, color, leadId } = req.body || {};
  if (name) team.name = name;
  if (description !== undefined) team.description = description;
  if (color) team.color = color;
  await team.save();
  if (leadId) {
    const lead = await setTeamLead(team._id, leadId);
    audit(req.user, 'team.lead', { entity: 'Team', entityId: team._id, summary: `${lead.name} is now TL of ${team.name}` });
  }
  res.json(team);
}));

r.delete('/teams/:id', requireRole('super_admin'), ah(async (req, res) => {
  const team = await Team.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
  if (!team) throw new HttpError(404, 'Team not found');
  await TeamMembership.updateMany({ team: team._id, removedAt: null }, { removedAt: new Date() });
  audit(req.user, 'team.delete', { entity: 'Team', entityId: team._id, summary: `Deleted team ${team.name}` });
  res.json({ ok: true });
}));

async function assertCanManageTeam(user, teamId) {
  if (isSuper(user)) return;
  const led = await ledTeamIds(user);
  if (!led.includes(String(teamId))) throw new HttpError(403, 'Only this team’s lead or a Super Admin can change members');
}

r.post('/teams/:id/members', ah(async (req, res) => {
  await assertCanManageTeam(req.user, req.params.id);
  const { userId } = req.body || {};
  const teamRole = 'member'; // the TL is set on the team itself
  const target = await User.findById(userId);
  if (!target || target.deletedAt) throw new HttpError(404, 'User not found');
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
  const isLead = await TeamMembership.exists({ user: req.params.userId, team: req.params.id, teamRole: 'lead', removedAt: null });
  if (isLead) throw new HttpError(400, 'This person is the team’s TL. Choose a new TL first.');
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
