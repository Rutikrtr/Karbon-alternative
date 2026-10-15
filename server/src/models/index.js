import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;
const ref = (name) => ({ type: Types.ObjectId, ref: name });
const opts = { timestamps: true };

/** One record per person. `role` is the global role; team-level roles live on TeamMembership. */
export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['super_admin', 'admin', 'employee'], default: 'employee' },
  title: String,
  active: { type: Boolean, default: true },
  deletedAt: Date, // removed people keep their name on past tasks and logs
}, opts));

export const Team = model('Team', new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  color: { type: String, default: '#3b5bdb' },
  archived: { type: Boolean, default: false },
}, opts));

/** Many-to-many users <-> teams. Removing someone sets `removedAt`; other teams are untouched. */
const membershipSchema = new Schema({
  user: { ...ref('User'), required: true },
  team: { ...ref('Team'), required: true },
  teamRole: { type: String, enum: ['lead', 'member'], default: 'member' },
  removedAt: Date,
}, opts);
membershipSchema.index({ user: 1, team: 1 }, { unique: true });
export const TeamMembership = model('TeamMembership', membershipSchema, 'team_memberships');

export const Client = model('Client', new Schema({
  name: { type: String, required: true, trim: true },
  accountingId: { type: String, trim: true },
  contactName: String,
  contactEmail: String,
  contactPhone: String,
  status: { type: String, enum: ['active', 'onboarding', 'inactive'], default: 'active' },
  notes: String,
}, opts));

/**
 * Who manages a client: a team, and the admins (managers/TLs) accountable for it.
 * Several admins can manage one client. Reassignment ends a row (`endedAt`) instead of
 * deleting it, so task and document history stays attached to the client.
 */
const assignmentSchema = new Schema({
  client: { ...ref('Client'), required: true },
  team: ref('Team'),
  admin: ref('User'),
  endedAt: Date,
}, opts);
export const ClientAssignment = model('ClientAssignment', assignmentSchema, 'client_assignments');

/**
 * Explicit per-employee client access. Team membership NEVER implies client access.
 * Optional `expiresAt` supports temporary access.
 */
const permissionSchema = new Schema({
  client: { ...ref('Client'), required: true },
  user: { ...ref('User'), required: true },
  level: { type: String, enum: ['view', 'work'], default: 'work' },
  grantedBy: ref('User'),
  expiresAt: Date,
  revokedAt: Date,
  revokedBy: ref('User'),
}, opts);
permissionSchema.index({ client: 1, user: 1 });
export const ClientPermission = model('ClientPermission', permissionSchema, 'client_permissions');

/** Admin asks to give client access to someone outside their own teams -> Super Admin approves. */
export const AccessRequest = model('AccessRequest', new Schema({
  client: { ...ref('Client'), required: true },
  user: { ...ref('User'), required: true },
  requestedBy: { ...ref('User'), required: true },
  expiresAt: Date,
  reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  decidedBy: ref('User'),
  decidedAt: Date,
}, opts), 'access_requests');

const checklistItem = new Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneBy: ref('User'),
  doneAt: Date,
});

/** Recurring work definition; the scheduler materialises Tasks from it. */
export const TaskTemplate = model('TaskTemplate', new Schema({
  title: { type: String, required: true },
  client: { ...ref('Client'), required: true },
  team: ref('Team'),
  assignees: [ref('User')],
  owner: ref('User'),
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  weekday: { type: Number, min: 0, max: 6 },    // weekly: 0=Sun
  monthDay: { type: Number, min: 1, max: 28 },  // monthly
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  sop: String,
  checklist: [String],
  active: { type: Boolean, default: true },
  startsOn: { type: Date, default: Date.now },
  createdBy: ref('User'),
}, opts), 'task_templates');

const taskSchema = new Schema({
  title: { type: String, required: true },
  client: { ...ref('Client'), required: true },
  team: ref('Team'),
  assignees: [ref('User')],
  owner: ref('User'), // single accountable person even when several are assigned
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['todo', 'in_progress', 'waiting', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  sop: String,
  checklist: [checklistItem],
  template: ref('TaskTemplate'),
  completedAt: Date,
  completedBy: ref('User'),
  createdBy: ref('User'),
}, opts);
taskSchema.index({ template: 1, dueDate: 1 }, { unique: true, partialFilterExpression: { template: { $exists: true } } });
taskSchema.index({ assignees: 1, dueDate: 1 });
export const Task = model('Task', taskSchema);

const auditSchema = new Schema({
  actor: ref('User'),
  action: { type: String, required: true },
  entity: String,
  entityId: Types.ObjectId,
  client: ref('Client'),
  summary: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // auto-delete after 30 days
export const AuditLog = model('AuditLog', auditSchema, 'audit_logs');
