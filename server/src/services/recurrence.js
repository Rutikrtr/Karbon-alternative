import { Task, TaskTemplate } from '../models/index.js';

const LOOKAHEAD_DAYS = 14;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function matches(tpl, day) {
  if (tpl.frequency === 'daily') return day.getDay() !== 0 && day.getDay() !== 6; // working days
  if (tpl.frequency === 'weekly') return day.getDay() === (tpl.weekday ?? 1);
  if (tpl.frequency === 'monthly') return day.getDate() === (tpl.monthDay ?? 1);
  return false;
}

/**
 * Materialise tasks from active templates for today .. today+LOOKAHEAD.
 * Each occurrence is created independently of whether the previous one was finished,
 * so overdue work stays visible. Idempotent via unique (template, dueDate).
 */
export async function generateRecurringTasks(templateId) {
  const filter = { active: true };
  if (templateId) filter._id = templateId;
  const templates = await TaskTemplate.find(filter);
  const today = startOfDay(new Date());
  let created = 0;
  for (const tpl of templates) {
    const from = startOfDay(tpl.startsOn > today ? tpl.startsOn : today);
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const day = new Date(from); day.setDate(from.getDate() + i);
      if (!matches(tpl, day)) continue;
      const due = new Date(day); due.setHours(17, 0, 0, 0);
      const res = await Task.updateOne(
        { template: tpl._id, dueDate: due },
        { $setOnInsert: {
          title: tpl.title, client: tpl.client, team: tpl.team, assignees: tpl.assignees,
          owner: tpl.owner || tpl.assignees[0], priority: tpl.priority, sop: tpl.sop,
          checklist: tpl.checklist.map((text) => ({ text })), createdBy: tpl.createdBy,
        } },
        { upsert: true },
      );
      created += res.upsertedCount || 0;
    }
  }
  return created;
}

export function startScheduler() {
  generateRecurringTasks().catch(console.error);
  setInterval(() => generateRecurringTasks().catch(console.error), 60 * 60 * 1000);
}
