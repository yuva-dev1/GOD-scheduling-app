# Kainkaryam Scheduler (GOD Scheduling App)

Internal scheduling app for signing up and assigning **kainkaryam** slots.
People create an account and pick one of two service roles; an admin assigns
them into open time slots. Vite + React + TypeScript frontend, Express
backend on Cloud Run, Google Sheets (via Apps Script) as the data store —
following the same pattern as `GOD-nama-log` and `GOD-Bookings-Page`.

> **Status:** feature-complete and live. Signup/login, self-service slot
> booking, admin assignment (password-gated), and deployment hardening are
> all implemented and deployed — see [Roadmap](#roadmap). What's left is a
> custom subdomain, which depends on the host organization's DNS access.

## Roles

- **Kainkaryam for Perumal** — self-serve signup, open every day.
- **Tirtha Kainkaryam** — self-serve signup, **only open Friday, Saturday,
  and Sunday** (not Monday–Thursday).
- **Admin** — assigns people to slots. Not a user account at all: `/admin`
  is reachable by anyone and is gated by a single shared password (Script
  Property `ADMIN_PASSWORD`), not email/password signup.

Role IDs and labels live in [`src/config/roles.ts`](./src/config/roles.ts).

## Open Hours

| Days      | Morning     | Evening     |
| --------- | ----------- | ----------- |
| Mon – Fri | 6:00 – 11:00 | 16:00 – 21:00 |
| Sat – Sun | 8:00 – 12:00 | 19:00 – 21:00 |

Tirtha Kainkaryam only opens on the Fri/Sat/Sun rows above. These windows are
encoded in [`src/config/schedulingRules.ts`](./src/config/schedulingRules.ts)
(covered by [`tests/schedulingRules.test.ts`](./tests/schedulingRules.test.ts)),
which the slot engine uses as its single source of truth for which
(date, window) pairs are open for a role. Apps Script can't import that
module, so [`apps-script/Slots.gs`](./apps-script/Slots.gs) mirrors the same
constants server-side (never trusts a client-supplied date/window without
recomputing eligibility itself) — keep the two in sync if the open hours
ever change.

## Architecture

```
Browser (React SPA)
   |  fetch /api/...
   v
Express server (server/index.js)   <- one Cloud Run service, this repo
   |  POST { ...payload, token: APPS_SCRIPT_TOKEN }
   v
Apps Script Web App (apps-script/Scheduling.gs)
   |  validates token, reads/writes
   v
Google Sheet (Users, Slots tabs)
```

- The **browser never talks to Apps Script directly** — it only calls this
  server, which is the only holder of `APPS_SCRIPT_TOKEN`.
- Apps Script checks that token (sent as `authToken`, kept distinct from any
  payload's own `token` field — e.g. a session token — so the two can never
  collide) on every request before touching the sheet. This is the "WAF"
  layer described in the project brief.
- Session auth uses a signed token (`TOKEN_SIGNING_SECRET`), following the
  same model as `GOD-nama-log`'s `Users.gs`. No plaintext password is ever
  stored — only a per-user salt + SHA-256 hash.
- In production the Express server also serves the built frontend
  (`dist/`), so the whole app is one Cloud Run service mapped to one domain.

## Project Structure

```
src/
  config/       roles + scheduling-window constants + slot generator (shared source of truth)
  features/auth/  AuthContext, LoginPage, SignupPage, ProtectedRoute, AdminRoute, AdminPasswordGate
  components/   NavBar
  services/     authApi.ts, slotsApi.ts, adminApi.ts — fetch wrappers for /api/*
  lib/          shared frontend validation (email/password/role)
  pages/        HomePage, SchedulePage (protected), AdminPage (admin-only)
server/
  index.js      Express app: health check, static hosting, mounts routers
  routes/       auth.js (/api/auth/*), slots.js (/api/slots/*), admin.js (/api/admin/*)
  lib/          appsScript.js (Apps Script client), validation.js, authHeader.js
apps-script/
  Scheduling.gs Apps Script entry point, token check, action router
  Users.gs       register/login/validateToken, Users sheet tab
  Slots.gs       listSlots/bookSlot/cancelSlot, Slots sheet tab
  Admin.gs       adminListUsers/adminListSlots/adminAssignSlot/adminUnassignSlot
tests/
  schedulingRules.test.ts, validation.test.ts
  server/        validation.test.js, appsScript.test.js
```

## Local Development

```bash
npm install
cp .env.example .env   # fill in APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN once Apps Script is deployed
npm run server          # Express API on :8080
npm run dev              # Vite dev server on :6100, proxies /api to :8080
```

Checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check   # all of the above
```

## Google Sheet

Data lives in this spreadsheet (`Users` and `Slots` tabs are created
automatically by Apps Script on first use):

<https://docs.google.com/spreadsheets/d/1BQt33T5z9p9HvXKSK4dqPLhmeneZaZdsbtAkmCfu1vs/edit>

## Auth API

- `POST /api/auth/register` — `{ email, password, role }`, `role` must be
  `perumal_kainkaryam` or `tirtha_kainkaryam`. Returns `{ success, token, user }`.
- `POST /api/auth/login` — `{ email, password }`. Returns `{ success, token, user }`.
- `GET /api/auth/me` — `Authorization: Bearer <token>`. Returns `{ success, user }`.

## Slots API

All three require `Authorization: Bearer <token>`. The role that lists/books
is always the caller's own account role — there is no way to book on behalf
of another role or another user from this API (that's admin assignment, a
follow-up PR).

- `GET /api/slots?startDate=YYYY-MM-DD&days=14` — lists open (date, window)
  slots for the caller's role over `days` (max 60) days starting `startDate`
  (defaults to today). Returns `{ success, slots: [{ date, day, window,
  start, end, status, bookedByMe }] }`.
- `POST /api/slots/book` — `{ date, window }`. Fails with 409 if already
  booked, 400 if that role isn't open on that day/date is in the past.
- `POST /api/slots/cancel` — `{ date, window }`. Only the user who booked a
  slot can cancel it (403 otherwise).

## Admin API

- `POST /api/admin/login` — `{ password }`, checked against Apps Script's
  `ADMIN_PASSWORD` Script Property. No prior account/token needed — this is
  the only way to become an admin. Returns `{ success, token, user }` with a
  synthetic `{ userId: "admin", email: "admin", role: "admin" }` identity,
  same token shape as self-serve login so the rest of the app treats it
  identically. Rate-limited like `/api/auth/login`.

The other four require `Authorization: Bearer <token>` from that admin
token (403 otherwise). Unlike the self-serve Slots API, `role` is an
explicit parameter here since an admin manages both roles.

- `GET /api/admin/users?role=perumal_kainkaryam` — lists non-admin accounts
  for a role, for populating an assignment picker. Returns `{ success,
  users: [{ userId, email, role }] }`.
- `GET /api/admin/slots?role=...&startDate=...&days=14` — like `GET
  /api/slots` but for any role, and includes `assignedEmail` on booked slots
  instead of a `bookedByMe` boolean.
- `POST /api/admin/assign` — `{ date, window, role, email }`. Assigns (or
  reassigns, overwriting any existing booking) that email into the slot.
  Fails with 400 if the email's account role doesn't match `role`, 404 if no
  account exists for that email.
- `POST /api/admin/unassign` — `{ date, window, role }`. Frees the slot
  regardless of who booked it (self-service cancel only allows the booker).

## Rate Limiting & CORS

- `POST /api/auth/register` and `/login` are limited to 20 requests per
  15 minutes per IP (`server/lib/rateLimiters.js` → `authLimiter`); slot
  booking and admin writes to 100 per 15 minutes (`writeLimiter`). Both
  return `429 { success: false, message: "Too many requests..." }` once
  exceeded.
- The SPA only ever calls `/api/*` on its own origin (Vite's dev proxy
  locally, the same Cloud Run service in production), so CORS is not
  needed for the documented setup. If `CORS_ORIGINS` is unset: development
  (`NODE_ENV !== "production"`) allows any origin for convenience;
  production rejects all cross-origin requests and logs a warning at
  startup. Set `CORS_ORIGINS` (comma-separated) only if you host the
  frontend on a different origin than this API.

## Deploying Apps Script

1. Open the spreadsheet above → Extensions → Apps Script.
2. Paste in [`apps-script/Scheduling.gs`](./apps-script/Scheduling.gs),
   [`apps-script/Users.gs`](./apps-script/Users.gs),
   [`apps-script/Slots.gs`](./apps-script/Slots.gs), and
   [`apps-script/Admin.gs`](./apps-script/Admin.gs) (and whatever files a
   follow-up PR adds alongside them — all in the same Apps Script project).
3. Project Settings → Script Properties, set:
   - `SPREADSHEET_ID` — the spreadsheet ID above
   - `APPS_SCRIPT_TOKEN` — a long random secret, must match the Cloud Run
     server's `APPS_SCRIPT_TOKEN`
   - `TOKEN_SIGNING_SECRET` — a long random secret for session tokens
   - `ADMIN_PASSWORD` — the shared password admins type in at `/admin`.
     Rotate by changing this property and redeploying; existing admin
     sessions with the old password stay valid until their token expires
     (12h) since only login is checked against it, not each request.
4. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone
   with the link**. Copy the `/exec` URL into `APPS_SCRIPT_URL`.

## Deploy to Cloud Run

This app is its own Cloud Run service under the **Namabiksha V1** GCP
project (`namabiksha-v1`), mapped to a subdomain provided by the host
organization. Nothing in this repo runs `gcloud` automatically — these are
manual steps a person runs when actually ready to go live.

1. **Set up secrets** (one-time, or whenever a secret value changes):

   ```powershell
   ./scripts/setup-secrets.ps1 -Project namabiksha-v1 `
     -AppsScriptUrl "https://script.google.com/macros/s/XXX/exec" `
     -AppsScriptToken "<the same value as Apps Script's APPS_SCRIPT_TOKEN property>" `
     -TokenSigningSecret "<the same value as Apps Script's TOKEN_SIGNING_SECRET property>"
   ```

   Creates (or adds a new version to) the `apps-script-url`,
   `apps-script-token`, and `token-signing-secret` Secret Manager secrets.
   Safe to re-run.

2. **Deploy:**

   ```powershell
   $PROJECT = "namabiksha-v1"
   $REGION  = "us-central1"
   $SERVICE = "god-scheduling-app"

   gcloud run deploy $SERVICE `
     --project $PROJECT `
     --region $REGION `
     --source . `
     --allow-unauthenticated `
     --set-secrets APPS_SCRIPT_URL=apps-script-url:latest,APPS_SCRIPT_TOKEN=apps-script-token:latest,TOKEN_SIGNING_SECRET=token-signing-secret:latest `
     --set-env-vars CORS_ORIGINS=https://<your-subdomain>
   ```

   (`--source .` builds the `Dockerfile` via Cloud Build; swap in the
   `gcloud builds submit` + `--image` two-step form if you'd rather build
   and deploy separately.)

3. **Map the domain** once the host organization has pointed a subdomain
   here: `gcloud run domain-mappings create --service $SERVICE --domain <your-subdomain> --region $REGION --project $PROJECT`.

## Roadmap

Scaffolding is split from feature work into separate PRs:

1. ~~**Scaffolding**~~ — repo, build tooling, Express skeleton, Apps Script
   entry point, Dockerfile, docs.
2. ~~**Auth & roles**~~ — signup/login, salted-hash password storage, signed
   session tokens, the `Users` sheet tab, role selection at signup.
3. ~~**Slot engine & booking**~~ — generates open slots from the rules above,
   lets users book/cancel their own slots, the `Slots` sheet tab.
4. ~~**Admin assignment**~~ — admin UI to assign/reassign *other* people into
   slots, view coverage per role.
5. ~~**Deployment hardening (code)**~~ — rate limiting, production-safe CORS
   default, Docker `HEALTHCHECK`, `scripts/setup-secrets.ps1`.
6. ~~**Go live**~~ — Apps Script deployed to the real spreadsheet, secrets
   created, Cloud Run service deployed and serving traffic.
7. ~~**Admin password gate**~~ — replaced the role-promotion admin model
   with a shared-password gate at `/admin`, reachable without an account.
8. **Custom domain** (next) — map the host organization's subdomain once
   they've granted DNS access and pointed it at this Cloud Run service; set
   `CORS_ORIGINS` accordingly.
