import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* ---------- API ---------- */
const TOKEN_KEY = 'ka.token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export async function api(path, { method = 'GET', body } = {}) {
  const offline = () => Object.assign(new Error('Can’t reach the server. Make sure the API server is running, then try again.'), { offline: true });
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(getToken() && { authorization: `Bearer ${getToken()}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw offline(); }
  const data = await res.json().catch(() => null);
  // The dev proxy answers 5xx with no JSON body when the API server is down
  if (!data && res.status >= 500) throw offline();
  if (res.status === 401 && path !== '/auth/login') { setToken(null); window.dispatchEvent(new Event('ka:logout')); }
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Request failed'), { status: res.status });
  return Object.assign(data, { __status: res.status });
}

/** Tiny data hook: { data, error, loading, reload }. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    api(path).then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

/* ---------- Auth ---------- */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('ka:logout', out);
    if (getToken()) {
      api('/auth/me').then((d) => setUser(d.user)).catch((e) => setOffline(!!e.offline)).finally(() => setReady(true));
    } else setReady(true);
    return () => window.removeEventListener('ka:logout', out);
  }, []);

  const login = async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(d.token); setUser(d.user);
  };
  const logout = () => { setToken(null); setUser(null); };
  const can = {
    super: user?.role === 'super_admin',
    manage: user?.role === 'super_admin' || user?.role === 'admin',
  };
  return <AuthCtx.Provider value={{ user, ready, offline, login, logout, can }}>{children}</AuthCtx.Provider>;
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return <ToastCtx.Provider value={setMsg}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}

/* ---------- Formatting ---------- */
export const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin / TL', employee: 'Employee' };
export const STATUS = {
  todo: { label: 'To do', cls: '' },
  in_progress: { label: 'In progress', cls: 'b-info' },
  waiting: { label: 'Waiting', cls: 'b-warning' },
  done: { label: 'Completed', cls: 'b-success' },
};

const sod = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export function dueInfo(task) {
  const due = new Date(task.dueDate);
  const days = Math.round((sod(due) - sod()) / 864e5);
  if (task.status === 'done') return { label: 'Completed', cls: 'b-success', bucket: 'done' };
  if (days < 0) return { label: days === -1 ? 'Overdue · yesterday' : `Overdue · ${-days}d`, cls: 'b-danger', bucket: 'overdue' };
  if (days === 0) return { label: 'Due today', cls: 'b-warning', bucket: 'today' };
  if (days === 1) return { label: 'Tomorrow', cls: 'b-primary', bucket: 'upcoming' };
  return { label: due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), cls: '', bucket: 'upcoming' };
}
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const toInputDate = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

const PALETTE = ['#3b5bdb', '#0c8599', '#9c36b5', '#e8590c', '#2f9e44', '#c2255c', '#5f3dc4', '#1971c2'];
export const colorFor = (s = '') => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const initials = (name = '') => name.replace(/Employee \d+ · /, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
