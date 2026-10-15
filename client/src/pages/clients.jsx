import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Plus, Search, ArrowLeft, ShieldCheck, Trash2, Mail, Phone, Hash, UserPlus, Clock, X } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtDate, toInputDate, ROLE_LABEL } from '../lib.jsx';
import { Avatar, Avatars, Badge, Empty, ErrorBox, Field, Modal, PageHead, Skeleton, TeamTag } from '../ui.jsx';
import { TaskDrawer, TaskForm, TaskListCard, useTaskToggle } from '../tasks.jsx';

const STATUS_CLS = { active: 'b-success', onboarding: 'b-info', inactive: '' };

export function Clients() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { data, loading, reload } = useApi('/clients');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const rows = (data || []).filter((c) => `${c.name} ${c.accountingId}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Clients" subtitle={can.super ? 'All clients in the practice.' : 'Only clients you have been given access to are shown.'}>
        <div className="search" style={{ width: 240 }}><Search size={16} /><input className="input" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" /></div>
        {can.super && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />New client</button>}
      </PageHead>
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading && !data ? <Skeleton /> : rows.length === 0 ? <Empty icon={Building2} title="No clients" >Ask your admin for access to a client.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Client</th><th>Team</th><th>TL / managers</th><th>Open work</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c._id} className="clickable" onClick={() => nav(`/clients/${c._id}`)}>
                  <td><div className="row" style={{ gap: 12 }}>
                    <span className="stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}><Building2 size={18} /></span>
                    <div><Link to={`/clients/${c._id}`} style={{ color: 'var(--text)', fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>{c.name}</Link><div className="small muted">{c.accountingId}</div></div>
                  </div></td>
                  <td><div className="stack" style={{ gap: 4 }}>{c.teams.map((t) => <TeamTag key={t._id} team={t} />)}</div></td>
                  <td><Avatars people={c.admins} /></td>
                  <td><span className="row"><span className="mono">{c.openTasks}</span>{c.overdueTasks > 0 && <Badge cls="b-danger">{c.overdueTasks} overdue</Badge>}</span></td>
                  <td><Badge cls={STATUS_CLS[c.status]} dot>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {creating && <ClientForm onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

function ClientForm({ onClose, onSaved }) {
  const teams = useApi('/teams');
  const users = useApi('/users');
  const toast = useToast();
  const [f, setF] = useState({ name: '', accountingId: '', contactName: '', contactEmail: '', contactPhone: '', status: 'active', teamIds: [], adminIds: [] });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (k, id) => setF((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/clients', { method: 'POST', body: f }); toast(`${f.name} created`); onSaved(); onClose(); } catch (err) { setError(err); }
  };
  return (
    <Modal wide title="New client" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="client-form" disabled={!f.name}>Create client</button></>}>
      <form id="client-form" className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid grid-2">
          <Field label="Client name"><input className="input" value={f.name} onChange={set('name')} required autoFocus /></Field>
          <Field label="Accounting ID"><input className="input" value={f.accountingId} onChange={set('accountingId')} placeholder="HAM-001" /></Field>
          <Field label="Contact name"><input className="input" value={f.contactName} onChange={set('contactName')} /></Field>
          <Field label="Contact email"><input className="input" type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
        </div>
        <Field label="Team" hint="The team’s TL manages this client and assigns its work."><div className="chips">{(teams.data || []).map((t) => (
          <button type="button" key={t._id} className={`chip ${f.teamIds.includes(t._id) ? 'on' : ''}`} onClick={() => toggle('teamIds', t._id)}><span className="team-dot" style={{ background: t.color }} />{t.name}</button>
        ))}</div></Field>
        <Field label="Extra managers (optional)" hint="Only if another Admin / TL should also manage this client."><div className="chips">{(users.data || []).filter((u) => u.role === 'admin').map((u) => (
          <button type="button" key={u._id} className={`chip ${f.adminIds.includes(u._id) ? 'on' : ''}`} onClick={() => toggle('adminIds', u._id)} style={{ paddingLeft: 4 }}><Avatar name={u.name} size="sm" />{u.name}</button>
        ))}</div></Field>
      </form>
    </Modal>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const { data: c, error, reload } = useApi(`/clients/${id}`, [id]);
  const tasks = useApi(`/tasks?scope=all&client=${id}`, [id]);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [granting, setGranting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [show, setShow] = useState('open');
  const toast = useToast();
  const toggle = useTaskToggle(tasks.reload);

  if (error) return <div className="card"><Empty icon={ShieldCheck} title={error.status === 403 ? 'You don’t have access to this client' : 'Client not found'}><Link to="/clients">Back to clients</Link></Empty></div>;
  if (!c) return <div className="card"><Skeleton rows={6} /></div>;

  const revoke = async (p) => {
    if (!confirm(`Remove ${p.user.name}'s access to ${c.name}?`)) return;
    try { await api(`/clients/${id}/permissions/${p._id}`, { method: 'DELETE' }); toast('Access removed'); reload(); } catch (e) { toast(e.message); }
  };
  const unassign = async (a) => {
    if (!confirm(`Stop ${a.name} managing ${c.name}? Existing tasks and history are kept.`)) return;
    try { await api(`/clients/${id}/assignments/${a.assignmentId}`, { method: 'DELETE' }); reload(); } catch (e) { toast(e.message); }
  };
  const list = (tasks.data || []).filter((t) => (show === 'open' ? t.status !== 'done' : show === 'done' ? t.status === 'done' : true));

  return (
    <>
      <Link to="/clients" className="row small" style={{ color: 'var(--text-3)', marginBottom: 8 }}><ArrowLeft size={16} />Clients</Link>
      <PageHead title={c.name} subtitle={<span className="row-wrap"><Badge cls={STATUS_CLS[c.status]} dot>{c.status}</Badge>{c.teams.map((t) => <TeamTag key={t._id} team={t} />)}</span>}>
        {c.canManage && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />New task</button>}
      </PageHead>
      <div className="split">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h3>Work</h3><div className="spacer" />
            <div className="chips">{[['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(([k, l]) => <button key={k} className={`chip ${show === k ? 'on' : ''}`} onClick={() => setShow(k)}>{l}</button>)}</div>
          </div>
          <TaskListCard tasks={list} loading={tasks.loading} onOpen={(t) => setOpenId(t._id)} onToggle={toggle} emptyTitle="No tasks for this client" />
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h3>Details</h3>
            <div className="row small"><Hash size={16} className="muted" />{c.accountingId || '—'}</div>
            <div className="row small"><Avatar name={c.contactName || '?'} size="sm" />{c.contactName || '—'}</div>
            {c.contactEmail && <div className="row small"><Mail size={16} className="muted" />{c.contactEmail}</div>}
            {c.contactPhone && <div className="row small"><Phone size={16} className="muted" />{c.contactPhone}</div>}
          </div>
          <div className="card">
            <div className="card-head"><h3>Team & managers</h3>{c.isSuper && <button className="btn btn-tonal btn-sm" onClick={() => setAssigning(true)}><Plus size={16} />Assign</button>}</div>
            <div className="list">
              {[...c.teams.map((t) => ({ ...t, kind: 'team' })), ...c.admins.map((a) => ({ ...a, kind: 'admin' }))].map((a) => (
                <div key={a.assignmentId} className="list-item" style={{ cursor: 'default' }}>
                  {a.kind === 'admin' ? <Avatar name={a.name} size="sm" /> : <span className="team-dot" style={{ background: a.color, margin: '0 8px' }} />}
                  <div className="li-main"><div className="title">{a.name}</div><div className="li-meta">{a.kind === 'admin' ? 'Extra manager' : a.lead ? `Team · TL ${a.lead.name}` : 'Team · no TL yet'}</div></div>
                  {c.isSuper && <button className="btn btn-ghost icon-btn" aria-label={`Unassign ${a.name}`} onClick={() => unassign(a)}><X size={16} /></button>}
                </div>
              ))}
            </div>
          </div>
          {c.canManage && (
            <div className="card">
              <div className="card-head"><div><h3>People with access</h3><p className="small muted">People get access automatically when their TL assigns them work here.</p></div>
                <button className="btn btn-tonal btn-sm" onClick={() => setGranting(true)}><UserPlus size={16} />Grant</button></div>
              {c.permissions.length === 0 ? <p className="small muted" style={{ padding: 20 }}>No employees have access yet.</p> : (
                <div className="list">{c.permissions.map((p) => (
                  <div key={p._id} className="list-item" style={{ cursor: 'default' }}>
                    <Avatar name={p.user.name} size="sm" />
                    <div className="li-main"><div className="title">{p.user.name}</div>
                      <div className="li-meta">{p.expiresAt ? <span className="row" style={{ gap: 4, color: 'var(--warning)' }}><Clock size={12} />Until {fmtDate(p.expiresAt)}</span> : 'Permanent'}{p.grantedBy && <> · by {p.grantedBy.name}</>}</div></div>
                    <button className="btn btn-ghost icon-btn" aria-label={`Revoke ${p.user.name}`} onClick={() => revoke(p)}><Trash2 size={16} /></button>
                  </div>
                ))}</div>
              )}
              {c.requests.length > 0 && <>
                <div className="group-label" style={{ borderTop: '1px solid var(--border)' }}>Awaiting Super Admin</div>
                {c.requests.map((r) => <div key={r._id} className="list-item" style={{ cursor: 'default' }}><Avatar name={r.user.name} size="sm" /><div className="li-main"><div className="title">{r.user.name}</div><div className="li-meta">Requested by {r.requestedBy.name}</div></div><Badge cls="b-warning">Pending</Badge></div>)}
              </>}
            </div>
          )}
        </div>
      </div>
      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onChanged={tasks.reload} />}
      {creating && <TaskForm presetClient={id} onClose={() => setCreating(false)} onSaved={tasks.reload} />}
      {granting && <GrantAccess client={c} onClose={() => setGranting(false)} onSaved={reload} />}
      {assigning && <AssignManager client={c} onClose={() => setAssigning(false)} onSaved={reload} />}
    </>
  );
}

function GrantAccess({ client, onClose, onSaved }) {
  const { can } = useAuth();
  const users = useApi('/users');
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [temporary, setTemporary] = useState(false);
  const [expiresAt, setExpiresAt] = useState(toInputDate(Date.now() + 14 * 864e5));
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const has = new Set(client.permissions.map((p) => p.user._id));
  const options = (users.data || []).filter((u) => u.role === 'employee' && u.active && !has.has(u._id));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await api(`/clients/${client._id}/permissions`, { method: 'POST', body: { userId, reason, expiresAt: temporary ? new Date(`${expiresAt}T23:59:59`).toISOString() : null } });
      toast(res.pending ? res.message : 'Access granted'); onSaved(); onClose();
    } catch (err) { setError(err); }
  };
  return (
    <Modal title={`Grant access to ${client.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="grant-form" disabled={!userId}>Grant access</button></>}>
      <form id="grant-form" className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Employee">
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Select…</option>
            {options.map((u) => <option key={u._id} value={u._id}>{u.name} — {u.teams.map((t) => t.team.name).join(', ') || 'no team'}</option>)}
          </select>
        </Field>
        <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} />Temporary access</label>
        {temporary && <Field label="Access ends on"><input type="date" className="input" value={expiresAt} min={toInputDate(new Date())} onChange={(e) => setExpiresAt(e.target.value)} /></Field>}
        {!can.super && <>
          <div className="form-note">If this person isn’t in a team you lead, the request goes to a Super Admin for approval.</div>
          <Field label="Reason (optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Covering during month-end" /></Field>
        </>}
      </form>
    </Modal>
  );
}

function AssignManager({ client, onClose, onSaved }) {
  const teams = useApi('/teams');
  const users = useApi('/users');
  const [error, setError] = useState(null);
  const assign = async (body) => { try { await api(`/clients/${client._id}/assignments`, { method: 'POST', body }); onSaved(); onClose(); } catch (e) { setError(e); } };
  const hasTeam = new Set(client.teams.map((t) => t._id));
  const hasAdmin = new Set(client.admins.map((a) => a._id));
  return (
    <Modal title={`Who manages ${client.name}?`} onClose={onClose}>
      <ErrorBox error={error} />
      <Field label="Add a team"><div className="chips">{(teams.data || []).filter((t) => !hasTeam.has(t._id)).map((t) => (
        <button key={t._id} className="chip" onClick={() => assign({ teamId: t._id })}><span className="team-dot" style={{ background: t.color }} />{t.name}</button>
      ))}</div></Field>
      <Field label="Add an extra manager" hint="The team’s TL already manages the client. Add someone here only if another Admin / TL should too."><div className="chips">{(users.data || []).filter((u) => u.role !== 'employee' && !hasAdmin.has(u._id)).map((u) => (
        <button key={u._id} className="chip" style={{ paddingLeft: 4 }} onClick={() => assign({ adminId: u._id })}><Avatar name={u.name} size="sm" />{u.name}<span className="muted small">{ROLE_LABEL[u.role]}</span></button>
      ))}</div></Field>
    </Modal>
  );
}
