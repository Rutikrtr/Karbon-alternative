# Practice Hub — Karbon alternative

Work management for an accounting practice: **Users ↔ Teams ↔ Clients ↔ Tasks**, with role-based access and explicit per-client permissions.

**Stack:** React (Vite) · Node/Express · MongoDB (Mongoose) · JWT auth.
Document storage (Backblaze B2) and the client portal are the next phase and are not built yet.

## Run locally

```bash
npm run install:all
cp server/.env.example server/.env   # set MONGODB_URI, or leave empty for a temporary in-memory DB
npm run dev:server                   # API on :4000 (seeds demo data on first run)
npm run dev:client                   # UI on :5173
```

## First login on a real database

1. In `server/.env` set `MONGODB_URI` (e.g. MongoDB Atlas), a long random `JWT_SECRET`, and
   `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ characters). Keep `SEED_DEMO=false`.
2. Start the server. On an empty database it creates that person as the first **Super Admin**.
   Then remove `ADMIN_PASSWORD` from `.env`.
3. Sign in, then from the app: **Teams** → create teams → **People** → add Admins and Employees →
   add them to teams (choose a Lead) → **Clients** → create clients and assign teams/admins →
   on each client, **Grant** access to employees.

Locked out, or need another Super Admin? Run from `server/`:

```bash
npm run create-admin -- --email you@firm.com --name "Your Name" --password "a-strong-password"
```

It creates the user, or promotes an existing one and resets their password.

## Demo data

Set `SEED_DEMO=true` to fill an empty database with demo data. Demo accounts (password `demo1234`): `owner@` (Super Admin), `anita@` / `rahul@` / `sneha@` (Admin/TL),
`amit@`, `neha@`, `karan@`, `pooja@` (Employees) — all `@demo.test`. Buttons on the login screen sign in directly.

## Access model

| Role | Sees |
|---|---|
| Super Admin | Every team, client, person and task |
| Admin / TL | Clients they are assigned to manage, and all tasks on them |
| Employee | Only clients they have an **active explicit permission** for, and tasks assigned to them |

Rules (all enforced server-side in `server/src/services/access.js`):

- Team membership **never** grants client access. Employee 2 in Team A + B sees only Hamilton + Client D.
- One login per person, any number of teams; removing someone from one team leaves the others untouched.
- One client can be managed by several admins; reassignment ends an assignment row instead of deleting it, so history stays.
- Client access can be temporary (`expiresAt`).
- An admin can grant access directly only to people in a team they lead; anyone else becomes an **access request** a Super Admin approves.
- Tasks can have several assignees with one **owner**; they can only be assigned to people who can see the client.
- Recurring templates (daily / weekly / monthly) generate tasks 14 days ahead, independent of whether the previous one was finished.
- Every login, access change and task update is written to `audit_logs`.

## Collections

`users`, `teams`, `team_memberships`, `clients`, `client_assignments`, `client_permissions`, `access_requests`,
`tasks`, `task_templates`, `audit_logs`. (`documents` arrives with the document-storage phase.)
