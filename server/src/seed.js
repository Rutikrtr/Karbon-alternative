import bcrypt from 'bcryptjs';
import {
  User, Team, TeamMembership, Client, ClientAssignment, ClientPermission, TaskTemplate, Task,
} from './models/index.js';
import { generateRecurringTasks } from './services/recurrence.js';

export const DEMO_PASSWORD = 'demo1234';

/** Demo data that mirrors the Hamilton example. Runs only when the users collection is empty. */
export async function seedIfEmpty() {
  if (await User.estimatedDocumentCount()) return;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mk = (name, email, role, title) => User.create({ name, email, role, title, passwordHash });

  const owner = await mk('Priya Sharma', 'owner@demo.test', 'super_admin', 'Managing Partner');
  const adminA = await mk('Anita Rao', 'anita@demo.test', 'admin', 'Team Lead · A');
  const adminB = await mk('Rahul Mehta', 'rahul@demo.test', 'admin', 'Team Lead · B');
  const adminC = await mk('Sneha Kulkarni', 'sneha@demo.test', 'admin', 'Team Lead · C');
  const e1 = await mk('Employee 1 · Amit', 'amit@demo.test', 'employee', 'Accountant');
  const e2 = await mk('Employee 2 · Neha', 'neha@demo.test', 'employee', 'Senior Accountant');
  const e3 = await mk('Employee 3 · Karan', 'karan@demo.test', 'employee', 'Bookkeeper');
  const e4 = await mk('Employee 4 · Pooja', 'pooja@demo.test', 'employee', 'Accountant');

  const [tA, tB, tC] = await Team.create([
    { name: 'Team A', description: 'Bookkeeping & bills', color: '#3b5bdb' },
    { name: 'Team B', description: 'Reconciliations', color: '#0c8599' },
    { name: 'Team C', description: 'Monthly reviews & payroll', color: '#9c36b5' },
  ]);

  const member = (user, team, teamRole = 'member') => ({ user: user._id, team: team._id, teamRole });
  await TeamMembership.insertMany([
    member(adminA, tA, 'lead'), member(adminB, tB, 'lead'), member(adminC, tC, 'lead'),
    member(e1, tA),
    member(e2, tA), member(e2, tB),
    member(e3, tB), member(e3, tC),
    member(e4, tA), member(e4, tB), member(e4, tC),
  ]);

  const [hamilton, cB, cC, cD, cE] = await Client.create([
    { name: 'Hamilton', accountingId: 'HAM-001', contactName: 'J. Hamilton', contactEmail: 'accounts@hamilton.example', status: 'active' },
    { name: 'Client B', accountingId: 'CLB-014', contactName: 'B. Contact', status: 'active' },
    { name: 'Client C', accountingId: 'CLC-022', contactName: 'C. Contact', status: 'active' },
    { name: 'Client D', accountingId: 'CLD-031', contactName: 'D. Contact', status: 'onboarding' },
    { name: 'Client E', accountingId: 'CLE-047', contactName: 'E. Contact', status: 'active' },
  ]);

  await ClientAssignment.insertMany([
    { client: hamilton._id, team: tA._id }, { client: hamilton._id, admin: adminA._id },
    { client: cB._id, team: tA._id }, { client: cB._id, admin: adminA._id },
    { client: cC._id, team: tB._id }, { client: cC._id, admin: adminB._id },
    { client: cD._id, team: tB._id }, { client: cD._id, admin: adminB._id },
    { client: cE._id, team: tC._id }, { client: cE._id, admin: adminC._id },
    // One client managed by multiple admins
    { client: hamilton._id, admin: adminB._id },
  ]);

  const grant = (user, client, by, days) => ({
    user: user._id, client: client._id, grantedBy: by._id,
    expiresAt: days ? new Date(Date.now() + days * 864e5) : null,
  });
  await ClientPermission.insertMany([
    grant(e1, hamilton, adminA), grant(e1, cB, adminA),
    // Employee 2 is in Team A and Team B but only sees Hamilton + Client D
    grant(e2, hamilton, adminA), grant(e2, cD, adminB),
    grant(e3, cC, adminB), grant(e3, cE, adminC),
    grant(e4, cB, adminA), grant(e4, cC, adminB), grant(e4, cE, adminC),
    // Temporary access that expires in 5 days
    grant(e4, cD, adminB, 5),
  ]);

  const sop = (steps) => steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const monday = 1;
  const today = new Date().getDate();
  await TaskTemplate.create([
    { title: 'Daily Mail Checking', client: hamilton._id, team: tA._id, assignees: [e1._id], frequency: 'daily', createdBy: adminA._id,
      sop: sop(['Open the shared Hamilton inbox', 'File invoices into the Bills folder', 'Flag anything urgent to the team lead']),
      checklist: ['Inbox checked', 'Invoices filed', 'Urgent items flagged'] },
    { title: 'Bill Updation', client: hamilton._id, team: tA._id, assignees: [e2._id, e1._id], owner: e2._id, frequency: 'weekly', weekday: monday, priority: 'high', createdBy: adminA._id,
      sop: sop(['Download new bills from the inbox folder', 'Enter each bill in Xero with the correct account code', 'Attach the PDF to the bill', 'Mark the email as processed']),
      checklist: ['Bills downloaded', 'Entered in Xero', 'PDFs attached', 'Emails marked processed'] },
    { title: 'Bank Reconciliation', client: cD._id, team: tB._id, assignees: [e2._id], frequency: 'weekly', weekday: 3, createdBy: adminB._id,
      sop: sop(['Import bank feed', 'Match transactions', 'Investigate unmatched items over ₹10,000']),
      checklist: ['Feed imported', 'Transactions matched', 'Exceptions noted'] },
    { title: 'Monthly Xero Reconciliation', client: hamilton._id, team: tA._id, assignees: [e2._id], frequency: 'monthly', monthDay: Math.min(28, today + 3), createdBy: adminA._id,
      sop: sop(['Reconcile all bank accounts to month end', 'Review aged payables', 'Send summary to the team lead']),
      checklist: ['Bank accounts reconciled', 'Aged payables reviewed', 'Summary sent'] },
    { title: 'Payroll Prep', client: cE._id, team: tC._id, assignees: [e3._id, e4._id], owner: e3._id, frequency: 'monthly', monthDay: Math.min(28, today + 1), createdBy: adminC._id,
      sop: sop(['Collect timesheets', 'Prepare payroll report', 'Send for approval']),
      checklist: ['Timesheets collected', 'Report prepared', 'Sent for approval'] },
  ]);
  await generateRecurringTasks();

  // A few one-off and overdue tasks so dashboards aren't empty
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(17, 0, 0, 0); return d; };
  await Task.create([
    { title: 'Monthly Review', client: cE._id, team: tC._id, assignees: [e3._id], owner: e3._id, dueDate: day(-2), status: 'in_progress', createdBy: adminC._id,
      sop: 'Review P&L and balance sheet against last month. Note variances above 10%.', checklist: [{ text: 'P&L reviewed' }, { text: 'Balance sheet reviewed' }, { text: 'Variances noted' }] },
    { title: 'GST Return Prep', client: cB._id, team: tA._id, assignees: [e1._id, e4._id], owner: e4._id, dueDate: day(-1), priority: 'high', createdBy: adminA._id,
      sop: 'Compile sales and purchase registers for the quarter.', checklist: [{ text: 'Sales register' }, { text: 'Purchase register' }] },
    { title: 'Vendor Statement Match', client: cC._id, team: tB._id, assignees: [e3._id, e4._id], owner: e4._id, dueDate: day(0), createdBy: adminB._id,
      checklist: [{ text: 'Statements requested' }, { text: 'Matched to ledger' }] },
    { title: 'Opening Balances Setup', client: cD._id, team: tB._id, assignees: [e2._id], dueDate: day(0), status: 'waiting', priority: 'high', createdBy: adminB._id,
      sop: 'Waiting on prior-year trial balance from the client.', checklist: [{ text: 'Trial balance received' }, { text: 'Balances entered' }] },
  ]);
  console.log(`✓ Seeded demo data. All demo passwords: ${DEMO_PASSWORD}`);
}
