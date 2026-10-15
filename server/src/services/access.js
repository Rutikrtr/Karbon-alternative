import { ClientAssignment, ClientPermission, TeamMembership, AuditLog } from '../models/index.js';

/**
 * Central access rules. Every route asks this module; nothing else decides visibility.
 *
 *  super_admin  -> everything
 *  admin        -> clients they are assigned to manage (+ any explicit permission)
 *  employee     -> only clients with an active explicit ClientPermission
 *
 * Team membership alone never grants client access.
 */

export const isSuper = (u) => u.role === 'super_admin';

export const activePermissionFilter = () => ({
  revokedAt: null,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

/**
 * Client ids this admin manages: clients of the team(s) they lead (each team has one TL),
 * plus any client they were added to directly as an extra manager.
 */
export async function managedClientIds(user) {
  if (isSuper(user)) return null; // null = unrestricted
  if (user.role !== 'admin') return [];
  const led = await ledTeamIds(user);
  const rows = await ClientAssignment.find({ endedAt: null, $or: [{ admin: user._id }, { team: { $in: led } }] }).select('client');
  return [...new Set(rows.map((r) => String(r.client)))];
}

/** The TL of each team, keyed by team id. */
export async function teamLeads(teamIds) {
  const rows = await TeamMembership.find({ team: { $in: teamIds }, teamRole: 'lead', removedAt: null }).populate('user', 'name email');
  return Object.fromEntries(rows.filter((r) => r.user).map((r) => [String(r.team), r.user]));
}

/** Client ids the user may see. null means "all". */
export async function visibleClientIds(user) {
  if (isSuper(user)) return null;
  const perms = await ClientPermission.find({ user: user._id, ...activePermissionFilter() }).select('client');
  const ids = new Set(perms.map((p) => String(p.client)));
  for (const id of (await managedClientIds(user)) || []) ids.add(id);
  return [...ids];
}

export async function canSeeClient(user, clientId) {
  const ids = await visibleClientIds(user);
  return ids === null || ids.includes(String(clientId));
}

export async function canManageClient(user, clientId) {
  const ids = await managedClientIds(user);
  return ids === null || ids.includes(String(clientId));
}

/** Teams where the user is lead (super admin: all). */
export async function ledTeamIds(user) {
  if (isSuper(user)) return null;
  const rows = await TeamMembership.find({ user: user._id, teamRole: 'lead', removedAt: null }).select('team');
  return rows.map((r) => String(r.team));
}

export async function userTeamIds(userId) {
  const rows = await TeamMembership.find({ user: userId, removedAt: null }).select('team');
  return rows.map((r) => String(r.team));
}

/**
 * Can `actor` grant client access to `targetUserId` directly?
 * Super admin: yes. Admin: only for clients they manage AND people in a team they lead.
 * Otherwise it must go through an AccessRequest for super admin approval.
 */
export async function canGrantDirectly(actor, clientId, targetUserId) {
  if (isSuper(actor)) return true;
  if (!(await canManageClient(actor, clientId))) return false;
  const led = await ledTeamIds(actor);
  const theirs = await userTeamIds(targetUserId);
  return theirs.some((t) => led.includes(t));
}

/** Mongo filter for tasks the user can see. */
export async function taskScope(user) {
  if (isSuper(user)) return {};
  const managed = await managedClientIds(user);
  const visible = await visibleClientIds(user);
  // Admins see every task on clients they manage; anyone sees their own assigned tasks
  // provided they still have access to that client.
  return {
    $or: [
      { client: { $in: managed } },
      { assignees: user._id, client: { $in: visible } },
    ],
  };
}

export function audit(actor, action, { entity, entityId, client, summary } = {}) {
  return AuditLog.create({ actor: actor?._id, action, entity, entityId, client, summary }).catch(() => {});
}
