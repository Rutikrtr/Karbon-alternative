import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, AlertTriangle, CalendarRange, Plus, Search, Users, Clock, CheckCircle2 } from 'lucide-react';
import { useApi, useAuth, dueInfo, STATUS, fmtDate } from '../lib.jsx';
import { Avatar, Badge, Empty, PageHead, Skeleton, TeamTag } from '../ui.jsx';
import { TaskDrawer, TaskForm, TaskListCard, useTaskToggle } from '../tasks.jsx';

function Stat({ icon: Icon, label, value, tone, selected, onClick }) {
  return (
    <button className={`card stat clickable ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="stat-label">{label}</span>
        <span className="stat-icon" style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}><Icon size={18} /></span>
      </div>
      <span className="stat-value">{value ?? '–'}</span>
    </button>
  );
}

/* ---------- My work (every role) ---------- */

const RECENT_DONE_DAYS = 7;
const recentlyDone = (t) => t.status === 'done' && Date.now() - new Date(t.completedAt || t.updatedAt) < RECENT_DONE_DAYS * 864e5;

export function MyWork() {
  const { user, can } = useAuth();
  // TLs land on their team's work; everyone can switch to just their own tasks
  const [view, setView] = useState(() => (can.manage ? 'team' : 'mine'));
  const [bucket, setBucket] = useState('active');
  const [team, setTeam] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const tasks = useApi(`/tasks?scope=${view === 'team' ? 'all' : 'mine'}`, [view]);
  const reload = () => tasks.reload();
  const toggle = useTaskToggle(reload);

  const teams = useMemo(() => {
    const m = new Map(); (tasks.data || []).forEach((t) => t.team && m.set(t.team._id, t.team)); return [...m.values()];
  }, [tasks.data]);

  const filtered = (tasks.data || []).filter((t) => {
    const b = dueInfo(t).bucket;
    // Completed work stays visible for a week so nobody wonders where it went
    if (bucket === 'active' && b === 'done' && !recentlyDone(t)) return false;
    if (bucket !== 'active' && bucket !== 'all' && b !== bucket) return false;
    if (team && t.team?._id !== team) return false;
    if (q && !`${t.title} ${t.client?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const count = (b) => (tasks.data ? tasks.data.filter((t) => dueInfo(t).bucket === b && (!team || t.team?._id === team)).length : undefined);
  const m = { dueToday: count('today'), overdue: count('overdue'), upcoming: count('upcoming'), done: (tasks.data || []).filter(recentlyDone).length };
  const hour = new Date().getHours();
  const pick = (b) => setBucket((cur) => (cur === b ? 'active' : b));

  return (
    <>
      <PageHead title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' · ').pop().split(' ')[0]}`}
        subtitle={view === 'team' ? 'All work for your team’s clients — who is doing what, and how far they are.' : 'Everything assigned to you, across all your teams, in one place.'}>
        {can.manage && (
          <div className="chips" role="tablist" aria-label="Whose work">
            <button className={`chip ${view === 'team' ? 'on' : ''}`} role="tab" aria-selected={view === 'team'} onClick={() => setView('team')}><Users size={16} />Team work</button>
            <button className={`chip ${view === 'mine' ? 'on' : ''}`} role="tab" aria-selected={view === 'mine'} onClick={() => setView('mine')}>Assigned to me</button>
          </div>
        )}
        {can.manage && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />New task</button>}
      </PageHead>
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <Stat icon={CalendarClock} label="Due today" value={m?.dueToday} tone="warning" selected={bucket === 'today'} onClick={() => pick('today')} />
        <Stat icon={AlertTriangle} label="Overdue" value={m?.overdue} tone="danger" selected={bucket === 'overdue'} onClick={() => pick('overdue')} />
        <Stat icon={CalendarRange} label="Upcoming" value={m?.upcoming} tone="primary" selected={bucket === 'upcoming'} onClick={() => pick('upcoming')} />
        <Stat icon={CheckCircle2} label={`Done · last ${RECENT_DONE_DAYS} days`} value={tasks.data ? m.done : undefined} tone="success" selected={bucket === 'done'} onClick={() => pick('done')} />
      </div>
      <div className="row-wrap" style={{ marginBottom: 16 }}>
        <div className="chips">
          <button className={`chip ${!team ? 'on' : ''}`} onClick={() => setTeam('')}>All teams</button>
          {teams.map((t) => (
            <button key={t._id} className={`chip ${team === t._id ? 'on' : ''}`} onClick={() => setTeam(team === t._id ? '' : t._id)}>
              <span className="team-dot" style={{ background: t.color }} />{t.name}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <select className="select" style={{ width: 'auto', minHeight: 40, borderRadius: 999 }} value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Show">
          <option value="active">Open + recently done</option><option value="today">Due today</option><option value="overdue">Overdue</option>
          <option value="upcoming">Upcoming</option><option value="done">Completed</option><option value="all">All</option>
        </select>
        <div className="search" style={{ width: 240 }}><Search size={16} /><input className="input" placeholder="Search tasks or clients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" /></div>
      </div>
      <TaskListCard tasks={filtered} loading={tasks.loading} showPeople={view === 'team'} onOpen={(t) => setOpenId(t._id)} onToggle={toggle}
        emptyTitle={bucket === 'overdue' ? 'Nothing overdue — nice work' : 'No tasks match'} />
      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
      {creating && <TaskForm onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

/* ---------- Overview (Admin / Super Admin) ---------- */

export function Overview() {
  const { can } = useAuth();
  const dash = useApi('/dashboard');
  const all = useApi('/tasks?scope=all&status=todo,in_progress,waiting');
  const [openId, setOpenId] = useState(null);
  const [person, setPerson] = useState('');
  const d = dash.data;
  const statusTotal = (d?.byStatus || []).reduce((a, s) => a + s.n, 0) || 1;
  const statusColor = { todo: 'var(--text-3)', in_progress: 'var(--info)', waiting: 'var(--warning)', done: 'var(--success)' };
  const overdue = (all.data || []).filter((t) => dueInfo(t).bucket === 'overdue');
  const shown = person ? (all.data || []).filter((t) => t.assignees.some((a) => a._id === person)) : overdue;

  return (
    <>
      <PageHead title="Overview" subtitle={can.super ? 'Workload across every team and client.' : 'Workload for the clients you manage.'} />
      {!d ? <div className="card"><Skeleton /></div> : (
        <div className="split">
          <div className="stack" style={{ gap: 16 }}>
            <div className="card">
              <div className="card-head"><h3>Workload by person</h3><span className="small muted">Open tasks · click a row to filter</span></div>
              {d.byPerson.length === 0 ? <Empty icon={Users} title="No open work" /> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Person</th><th>Today</th><th>Overdue</th><th style={{ width: '40%' }}>Open</th></tr></thead>
                  <tbody>
                    {d.byPerson.map((p) => {
                      const max = Math.max(...d.byPerson.map((x) => x.open));
                      return (
                        <tr key={p._id} className="clickable" onClick={() => setPerson(person === p._id ? '' : p._id)} style={person === p._id ? { background: 'var(--primary-soft)' } : undefined}>
                          <td><span className="row"><Avatar name={p.name} size="sm" />{p.name}</span></td>
                          <td className="mono">{p.today}</td>
                          <td>{p.overdue ? <Badge cls="b-danger">{p.overdue}</Badge> : <span className="muted">0</span>}</td>
                          <td><div className="row"><div className="bar" style={{ flex: 1 }}><span style={{ width: `${(p.open / max) * 100}%`, background: 'var(--primary)' }} /></div><span className="mono small" style={{ width: 24, textAlign: 'right' }}>{p.open}</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </div>
            <div>
              <div className="row" style={{ margin: '8px 0 12px' }}>
                <h3>{person ? `Open work · ${d.byPerson.find((p) => p._id === person)?.name}` : 'Overdue work'}</h3>
                {person && <button className="btn btn-ghost btn-sm" onClick={() => setPerson('')}>Show overdue</button>}
              </div>
              <TaskListCard tasks={shown} loading={all.loading} groups={!!person} onOpen={(t) => setOpenId(t._id)} emptyTitle="Nothing overdue" />
            </div>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad">
              <h3 style={{ marginBottom: 4 }}>Status mix</h3><p className="small muted" style={{ marginBottom: 14 }}>Tasks due up to 7 days ahead</p>
              <div className="bar" style={{ height: 12, marginBottom: 14 }}>
                {d.byStatus.map((s) => <span key={s._id} style={{ width: `${(s.n / statusTotal) * 100}%`, background: statusColor[s._id] }} title={`${STATUS[s._id]?.label}: ${s.n}`} />)}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {Object.keys(STATUS).map((k) => (
                  <div key={k} className="row"><span className="team-dot" style={{ background: statusColor[k] }} />{STATUS[k].label}<div className="spacer" /><span className="mono">{d.byStatus.find((s) => s._id === k)?.n || 0}</span></div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>By team</h3></div>
              <div className="list">
                {d.byTeam.map((t) => (
                  <div key={t._id || 'none'} className="list-item" style={{ cursor: 'default' }}>
                    <div className="li-main"><TeamTag team={t._id ? t : { name: 'No team', color: 'var(--text-3)' }} /></div>
                    {t.overdue > 0 && <Badge cls="b-danger">{t.overdue} overdue</Badge>}<span className="mono">{t.open} open</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Access expiring soon</h3><Clock size={16} className="muted" /></div>
              {d.expiringSoon.length === 0 ? <p className="small muted" style={{ padding: 20 }}>No temporary access ends in the next 7 days.</p> : (
                <div className="list">{d.expiringSoon.map((p) => (
                  <div key={p._id} className="list-item" style={{ cursor: 'default' }}>
                    <Avatar name={p.user.name} size="sm" /><div className="li-main"><div className="title">{p.user.name}</div><div className="li-meta">{p.client.name}</div></div>
                    <Badge cls="b-warning">{fmtDate(p.expiresAt)}</Badge>
                  </div>
                ))}</div>
              )}
            </div>
          </div>
        </div>
      )}
      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => { all.reload(); dash.reload(); }} />}
    </>
  );
}

export function useGoto() { const nav = useNavigate(); return (p) => () => nav(p); }
