import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Building2, Users, UsersRound, Repeat, ShieldCheck, History, LogOut, Menu, Moon, Sun, Layers,
} from 'lucide-react';
import { useAuth, useApi, ROLE_LABEL } from './lib.jsx';
import { Avatar } from './ui.jsx';

function ThemeToggle() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ka.theme'); } catch { return null; } });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    try { theme ? localStorage.setItem('ka.theme', theme) : localStorage.removeItem('ka.theme'); } catch { /* ignore */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  return (
    <button className="btn btn-ghost icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle dark mode">
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const requests = useApi(can.super ? '/access-requests' : null, [loc.pathname]);
  const pending = (requests.data || []).filter?.((r) => r.status === 'pending').length || 0;

  const item = (to, Icon, label, extra) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={20} />{label}{extra}
    </NavLink>
  );

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main">
        <div className="brand"><div className="brand-mark"><Layers size={18} /></div><span className="brand-name">Practice Hub</span></div>
        {!can.super && item('/', CheckSquare, 'My work')}
        {can.manage && item('/overview', LayoutDashboard, 'Overview')}
        {item('/clients', Building2, 'Clients')}
        {can.manage && item('/recurring', Repeat, 'Recurring work')}
        <div className="nav-label">Organisation</div>
        {item('/teams', UsersRound, 'Teams')}
        {can.super && item('/people', Users, 'People')}
        {can.manage && item('/access', ShieldCheck, 'Access', pending ? <span className="count">{pending}</span> : null)}
        {can.manage && item('/audit', History, 'Activity log')}
        <div className="sidebar-foot">
          <div className="me">
            <Avatar name={user.name} />
            <div className="me-info"><div className="me-name">{user.name}</div><div className="small muted">{ROLE_LABEL[user.role]}</div></div>
            <button className="btn btn-ghost icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
          </div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="spacer" />
          <ThemeToggle />
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
