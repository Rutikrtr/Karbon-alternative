import { useEffect } from 'react';
import { X, Inbox } from 'lucide-react';
import { colorFor, initials, STATUS } from './lib.jsx';

export const Avatar = ({ name, size = '' }) => (
  <span className={`avatar ${size && `avatar-${size}`}`} style={{ background: colorFor(name) }} title={name} aria-hidden="true">
    {initials(name)}
  </span>
);

export const Avatars = ({ people = [], max = 3 }) => (
  <span className="avatars">
    {people.slice(0, max).map((p) => <Avatar key={p._id} name={p.name} size="sm" />)}
    {people.length > max && <span className="avatar avatar-sm" style={{ background: 'var(--text-3)' }}>+{people.length - max}</span>}
  </span>
);

export const Badge = ({ cls = '', dot, children }) => <span className={`badge ${cls}`}>{dot && <span className="dot" />}{children}</span>;
export const StatusBadge = ({ status }) => <Badge cls={STATUS[status]?.cls} dot>{STATUS[status]?.label || status}</Badge>;
export const TeamTag = ({ team }) => team ? (
  <span className="row small" style={{ gap: 6 }}><span className="team-dot" style={{ background: team.color }} />{team.name}</span>
) : null;

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(720px, calc(100vw - 32px))' } : undefined}>
        <div className="modal-head"><h2>{title}</h2><button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, label }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
    </div>
  );
}

export const Empty = ({ icon: Icon = Inbox, title, children }) => (
  <div className="empty"><div className="empty-icon"><Icon size={22} /></div><strong style={{ color: 'var(--text-2)' }}>{title}</strong>{children && <span className="small">{children}</span>}</div>
);

export const Skeleton = ({ rows = 4 }) => (
  <div className="stack" style={{ padding: 20 }} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 40, opacity: 1 - i * 0.15 }} />)}
  </div>
);

export const Field = ({ label, hint, children }) => (
  <div className="field"><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>
);

export const PageHead = ({ title, subtitle, children }) => (
  <div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="row-wrap">{children}</div>}</div>
);

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="form-error" role="alert">{error.message || String(error)}</div>;
}
