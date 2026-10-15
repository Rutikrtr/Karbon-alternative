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
| Admin / TL | The clients of the team they lead (plus any client they're added to as an extra manager), and all work on them |
| Employee | Only clients they have access to, and the tasks assigned to them |

How it works (enforced server-side in `server/src/services/access.js`):

- **Each team has exactly one TL / manager**, chosen when the team is created (changeable by a Super Admin).
- A client is assigned to a team, so the team's TL manages it automatically.
- When a TL assigns a task to someone in their team, that person gets access to the client automatically.
  Being in a team alone does not show someone every client of the team.
- The TL's home page shows **Team work**: every task for their clients, who it is assigned to, checklist progress,
  and who completed it. Completed tasks stay visible for 7 days (and always under the "Completed" filter).
- Giving access to someone outside your own team becomes an **access request** that a Super Admin approves.
- Access can be temporary (`expiresAt`).
- Removing a person closes their account and removes their team and client access; their name stays on past tasks.
  A TL can't be removed until their team has a new TL.
- The activity log records logins, access changes and task updates, and **entries are deleted automatically after 30 days**.

## Collections

`users`, `teams`, `team_memberships`, `clients`, `client_assignments`, `client_permissions`, `access_requests`,
`tasks`, `task_templates`, `audit_logs`. (`documents` arrives with the document-storage phase.)
