import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, ToastProvider, useAuth } from './lib.jsx';
import Layout from './Layout.jsx';
import { MyWork, Overview } from './pages/work.jsx';
import { Clients, ClientDetail } from './pages/clients.jsx';
import { Teams, People, Recurring, Access, Audit, Login } from './pages/org.jsx';

try { const t = localStorage.getItem('ka.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }

function App() {
  const { user, ready, can } = useAuth();
  if (!ready) return null;
  if (!user) return <Login />;
  const guard = (ok, el) => (ok ? el : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={can.super ? <Navigate to="/overview" replace /> : <MyWork />} />
        <Route path="overview" element={guard(can.manage, <Overview />)} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="teams" element={<Teams />} />
        <Route path="recurring" element={guard(can.manage, <Recurring />)} />
        <Route path="people" element={guard(can.super, <People />)} />
        <Route path="access" element={guard(can.manage, <Access />)} />
        <Route path="audit" element={guard(can.manage, <Audit />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
