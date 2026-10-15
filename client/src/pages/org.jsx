import { useState } from 'react';
import { Plus, UserPlus, X, Repeat, Pause, Play, ShieldCheck, Check, History, Crown, Users, Layers, Building2, Lock, CalendarCheck, Trash2, Pencil } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtDate, fmtTime, ROLE_LABEL } from '../lib.jsx';
import { Avatar, Avatars, Badge, Empty, ErrorBox, Field, Modal, PageHead, Skeleton, TeamTag } from '../ui.jsx';
import { TaskForm } from '../tasks.jsx';

/* ---------- Teams ---------- */

export function Teams() {
  const { can, user } = useAuth();
  const { data, loading, reload } = useApi('/teams');
  const users = useApi('/users');
  const toast = useToast();
  const [adding, setAdding] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const removeTeam = async (team) => {
    if (!confirm(`Delete ${team.name}? Members leave the team; clients, tasks and history are kept.`)) return;
    try { await api(`/teams/${team._id}`, { method: 'DELETE' }); toast(`${team.name} deleted`); reload(); } catch (e) { toast(e.message); }
  };
  const remove = async (team, m) => {
    if (!confirm(`Remove ${m.name} from ${team.name}? Their other teams and client access are not affected.`)) return;
    try { await api(`/teams/${team._id}/members/${m._id}`, { method: 'DELETE' }); toast(`${m.name} removed from ${team.name}`); reload(); } catch (e) { toast(e.message); }
  };
  const visible = can.super ? data : data?.filter((t) => t.canManage || t.members.some((m) => m._id === user._id));

  return (
    <>
      <PageHead title="Teams" subtitle="Each team is run by one TL / manager. The TL manages the team’s clients and assigns its work.">
        {can.super && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />New team</button>}
      </PageHead>
      {loading && !data ? <div className="card"><Skeleton /></div> : (
        <div className="grid grid-3">
          {visible.map((t) => (
            <div key={t._id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ height: 6, background: t.color }} />
              <div className="card-head">
                <div><h3>{t.name}</h3><p className="small muted">{t.description}</p></div>
                <div className="row" style={{ gap: 4 }}>
                  {t.canManage && <button className="btn btn-tonal icon-btn" aria-label={`Add member to ${t.name}`} title="Add member" onClick={() => setAdding(t)}><UserPlus size={18} /></button>}
                  {can.super && <button className="btn btn-ghost icon-btn" aria-label={`Edit ${t.name}`} title="Edit team / change TL" onClick={() => setEditing(t)}><Pencil size={16} /></button>}
                  {can.super && <button className="btn btn-ghost icon-btn" aria-label={`Delete ${t.name}`} title="Delete team" onClick={() => removeTeam(t)}><Trash2 size={16} /></button>}
                </div>
              </div>
              {!t.members.some((m) => m.teamRole === 'lead') && <div className="form-note" style={{ margin: 12, background: 'var(--warning-soft)', color: 'var(--warning)' }}>No TL yet. {can.super ? 'Click the pencil to choose one.' : 'Ask a Super Admin to choose one.'}</div>}
              <div className="list">
                {[...t.members].sort((a, b) => (a.teamRole === 'lead' ? -1 : b.teamRole === 'lead' ? 1 : 0)).map((m) => (
                  <div key={m._id} className="list-item" style={{ cursor: 'default' }}>
                    <Avatar name={m.name} size="sm" />
                    <div className="li-main"><div className="title">{m.name}</div><div className="li-meta">{m.title}</div></div>
                    {m.teamRole === 'lead' && <Badge cls="b-warning"><Crown size={12} />TL</Badge>}
                    {t.canManage && m.teamRole !== 'lead' && <button className="btn btn-ghost icon-btn" aria-label={`Remove ${m.name}`} onClick={() => remove(t, m)}><X size={16} /></button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <AddMember team={adding} users={users.data || []} onClose={() => setAdding(null)} onSaved={reload} />}
      {creating && <TeamForm users={users.data || []} onClose={() => setCreating(false)} onSaved={reload} />}
      {editing && <TeamForm team={editing} users={users.data || []} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function AddMember({ team, users, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState(null);
  const ids = new Set(team.members.map((m) => m._id));
  const submit = async (e) => { e.preventDefault(); try { await api(`/teams/${team._id}/members`, { method: 'POST', body: { userId } }); onSaved(); onClose(); } catch (err) { setError(err); } };
  return (
    <Modal title={`Add to ${team.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="am" disabled={!userId}>Add</button></>}>
      <form id="am" className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Person"><select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Select…</option>
          {users.filter((u) => !ids.has(u._id) && u.active && u.role === 'employee').map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
        <div className="form-note">Members get access to a client automatically when their TL assigns them work for it.</div>
      </form>
    </Modal>
  );
}

function TeamForm({ team, users, onClose, onSaved }) {
  const currentLead = team?.members.find((m) => m.teamRole === 'lead');
  const [f, setF] = useState({ name: team?.name || '', description: team?.description || '', color: team?.color || '#2f9e44', leadId: currentLead?._id || '' });
  const [error, setError] = useState(null);
  const admins = users.filter((u) => u.role === 'admin' && u.active);
  const submit = async (e) => {
    e.preventDefault();
    try { await api(team ? `/teams/${team._id}` : '/teams', { method: team ? 'PATCH' : 'POST', body: f }); onSaved(); onClose(); } catch (err) { setError(err); }
  };
  return (
    <Modal title={team ? `Edit ${team.name}` : 'New team'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="nt" disabled={!f.name || !f.leadId}>{team ? 'Save' : 'Create team'}</button></>}>
      <form id="nt" className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Team name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="TL / Manager" hint={admins.length ? 'One TL runs each team and manages all of its clients.' : 'First add a person with the Admin / TL role on the People page.'}>
          <select className="select" value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })} required>
            <option value="">Choose a TL…</option>
            {admins.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Bookkeeping & bills" /></Field>
        <Field label="Colour"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 64, height: 40, border: 0, background: 'none' }} /></Field>
      </form>
    </Modal>
  );
}

/* ---------- People (Super Admin) ---------- */

export function People() {
  const { user: me } = useAuth();
  const { data, loading, reload } = useApi('/users');
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const update = async (u, body) => { try { await api(`/users/${u._id}`, { method: 'PATCH', body }); toast('Saved'); reload(); } catch (e) { toast(e.message); } };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.name}? They can no longer sign in and lose all team and client access. Their name stays on past tasks.`)) return;
    try { await api(`/users/${u._id}`, { method: 'DELETE' }); toast(`${u.name} removed`); reload(); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <PageHead title="People" subtitle="Everyone in the practice. One account per person, however many teams they work in.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />Add person</button>
      </PageHead>
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading && !data ? <Skeleton /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Teams</th><th>Status</th><th /></tr></thead>
            <tbody>{data.map((u) => (
              <tr key={u._id} style={!u.active ? { opacity: .55 } : undefined}>
                <td><div className="row" style={{ gap: 12 }}><Avatar name={u.name} /><div><strong>{u.name}</strong><div className="small muted">{u.email}</div></div></div></td>
                <td><select className="select" style={{ minHeight: 36, width: 'auto' }} value={u.role} disabled={u._id === me._id} onChange={(e) => update(u, { role: e.target.value })} aria-label={`Role for ${u.name}`}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><div className="row-wrap">{u.teams.map((t) => <span key={t.team._id} className="badge"><span className="team-dot" style={{ background: t.team.color }} />{t.team.name}{t.teamRole === 'lead' && <><Crown size={12} />TL</>}</span>)}</div></td>
                <td>{u._id === me._id ? <Badge cls="b-primary">You</Badge> : (
                  <button className={`btn btn-sm ${u.active ? 'btn-outline' : 'btn-tonal'}`} onClick={() => update(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                )}</td>
                <td style={{ textAlign: 'right' }}>{u._id !== me._id && <button className="btn btn-danger btn-sm" onClick={() => remove(u)}><Trash2 size={14} />Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {creating && <NewPerson onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

function NewPerson({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'employee', title: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); try { await api('/users', { method: 'POST', body: f }); onSaved(); onClose(); } catch (err) { setError(err); } };
  return (
    <Modal title="Add person" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="np">Create account</button></>}>
      <form id="np" className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid grid-2">
          <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} required autoFocus /></Field>
          <Field label="Job title"><input className="input" value={f.title} onChange={set('title')} /></Field>
        </div>
        <Field label="Work email"><input className="input" type="email" value={f.email} onChange={set('email')} required /></Field>
        <div className="grid grid-2">
          <Field label="Temporary password" hint="At least 8 characters"><input className="input" type="password" minLength={8} value={f.password} onChange={set('password')} required autoComplete="new-password" /></Field>
          <Field label="Role"><select className="select" value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Recurring work ---------- */

const FREQ = (t) => t.frequency === 'daily' ? 'Every working day'
  : t.frequency === 'weekly' ? `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][t.weekday ?? 1]}`
  : `Monthly on day ${t.monthDay}`;

export function Recurring() {
  const { data, loading, reload } = useApi('/templates');
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const toggle = async (t) => { try { await api(`/templates/${t._id}`, { method: 'PATCH', body: { active: !t.active } }); toast(t.active ? 'Paused' : 'Resumed'); reload(); } catch (e) { toast(e.message); } };
  return (
    <>
      <PageHead title="Recurring work" subtitle="Templates create the next task automatically, whether or not the previous one was finished.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />Schedule work</button>
      </PageHead>
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading && !data ? <Skeleton /> : data.length === 0 ? <Empty icon={Repeat} title="No recurring work yet" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Work</th><th>Client</th><th>Schedule</th><th>Assigned</th><th /></tr></thead>
            <tbody>{data.map((t) => (
              <tr key={t._id} style={!t.active ? { opacity: .55 } : undefined}>
                <td><strong>{t.title}</strong><div className="small muted">{t.checklist.length} checklist steps{t.sop ? ' · SOP attached' : ''}</div></td>
                <td><div>{t.client.name}</div><TeamTag team={t.team} /></td>
                <td><span className="row"><CalendarCheck size={16} className="muted" />{FREQ(t)}</span></td>
                <td><Avatars people={t.assignees} /></td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-outline btn-sm" onClick={() => toggle(t)}>{t.active ? <><Pause size={14} />Pause</> : <><Play size={14} />Resume</>}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {creating && <TaskForm recurring onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

/* ---------- Access requests ---------- */

export function Access() {
  const { can } = useAuth();
  const { data, loading, reload } = useApi('/access-requests');
  const toast = useToast();
  const decide = async (r, d) => { try { await api(`/access-requests/${r._id}/${d}`, { method: 'POST' }); toast(d === 'approve' ? 'Access approved' : 'Request rejected'); reload(); } catch (e) { toast(e.message); } };
  const pending = (data || []).filter((r) => r.status === 'pending');
  const past = (data || []).filter((r) => r.status !== 'pending');
  const row = (r) => (
    <div key={r._id} className="list-item" style={{ cursor: 'default' }}>
      <Avatar name={r.user.name} />
      <div className="li-main">
        <div className="title">{r.user.name} → {r.client.name}</div>
        <div className="li-meta">Requested by {r.requestedBy.name} · {fmtTime(r.createdAt)}{r.expiresAt && <> · until {fmtDate(r.expiresAt)}</>}{r.reason && <> · “{r.reason}”</>}</div>
      </div>
      {r.status === 'pending' && can.super ? <>
        <button className="btn btn-outline btn-sm" onClick={() => decide(r, 'reject')}><X size={14} />Reject</button>
        <button className="btn btn-primary btn-sm" onClick={() => decide(r, 'approve')}><Check size={14} />Approve</button>
      </> : <Badge cls={r.status === 'approved' ? 'b-success' : r.status === 'rejected' ? 'b-danger' : 'b-warning'}>{r.status}</Badge>}
    </div>
  );
  return (
    <>
      <PageHead title="Access requests" subtitle={can.super ? 'Admins asking to give client access to people outside their own teams.' : 'Requests you have sent to a Super Admin.'} />
      <div className="stack" style={{ gap: 24 }}>
        <div className="card">
          <div className="card-head"><h3>Pending</h3><Badge cls={pending.length ? 'b-warning' : ''}>{pending.length}</Badge></div>
          {loading && !data ? <Skeleton rows={2} /> : pending.length ? <div className="list">{pending.map(row)}</div> : <Empty icon={ShieldCheck} title="No pending requests" />}
        </div>
        {past.length > 0 && <div className="card"><div className="card-head"><h3>History</h3></div><div className="list">{past.map(row)}</div></div>}
      </div>
    </>
  );
}

/* ---------- Activity log ---------- */

export function Audit() {
  const { data, loading } = useApi('/audit');
  return (
    <>
      <PageHead title="Activity log" subtitle="Who did what, and when. Kept for every access change and task update." />
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading && !data ? <Skeleton /> : data.length === 0 ? <Empty icon={History} title="No activity yet" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Client</th></tr></thead>
            <tbody>{data.map((a) => (
              <tr key={a._id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.createdAt)}</td>
                <td><span className="row"><Avatar name={a.actor?.name || 'System'} size="sm" />{a.actor?.name || 'System'}</span></td>
                <td><Badge>{a.action}</Badge> <span style={{ marginLeft: 6 }}>{a.summary}</span></td>
                <td>{a.client?.name || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

/* ---------- Login ---------- */

const DEMO = [
  ['owner@demo.test', 'Priya Sharma', 'Super Admin'],
  ['anita@demo.test', 'Anita Rao', 'Admin · Team A'],
  ['rahul@demo.test', 'Rahul Mehta', 'Admin · Team B'],
  ['neha@demo.test', 'Employee 2 · Neha', 'Teams A + B'],
  ['pooja@demo.test', 'Employee 4 · Pooja', 'Teams A + B + C'],
  ['amit@demo.test', 'Employee 1 · Amit', 'Team A'],
];

export function Login() {
  const { login, offline } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const config = useApi('/config');
  const go = async (e, p = password, em = email) => {
    e?.preventDefault(); setBusy(true); setError(null);
    try { await login(em, p); } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <div className="login">
      <section className="login-hero">
        <div className="row" style={{ gap: 10 }}><div className="brand-mark" style={{ background: 'rgba(255,255,255,.18)' }}><Layers size={18} /></div><span className="brand-name">Practice Hub</span></div>
        <div>
          <h1>Every client, task and team — one calm workspace.</h1>
          <p>Built for accounting practices where people work across several teams, and every client’s data stays private.</p>
        </div>
        <div className="hero-points">
          <div><Users size={20} />One login across all your teams</div>
          <div><Lock size={20} />Each team is run by its own TL / manager</div>
          <div><Repeat size={20} />Recurring work with SOPs and checklists</div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div><h1>Sign in</h1><p className="muted" style={{ marginTop: 4 }}>Use your work account.</p></div>
          <form className="stack" style={{ gap: 16 }} onSubmit={go}>
            <ErrorBox error={error || (offline ? new Error('Can’t reach the server. Make sure the API server is running, then reload.') : null)} />
            <Field label="Email"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn btn-primary" disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {config.data?.demo && <div>
            <div className="row" style={{ margin: '4px 0 10px' }}><Building2 size={14} className="muted" /><span className="small muted">Demo accounts — try each role</span></div>
            <div className="demo-grid">
              {DEMO.map(([em, name, role]) => (
                <button key={em} className="demo-btn" disabled={busy} onClick={() => go(null, 'demo1234', em)}>
                  <Avatar name={name} size="sm" /><span><strong style={{ display: 'block' }}>{name.replace(/Employee \d+ · /, '')}</strong><span className="muted small">{role}</span></span>
                </button>
              ))}
            </div>
          </div>}
        </div>
      </section>
    </div>
  );
}
