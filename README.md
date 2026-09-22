# Kainkaryam Scheduler (GOD Scheduling App)

Internal scheduling app for signing up and assigning **kainkaryam** slots.
People create an account and pick one of two service roles; an admin assigns
them into open time slots. Vite + React + TypeScript frontend, Express
backend on Cloud Run, Google Sheets (via Apps Script) as the data store —
following the same pattern as `GOD-nama-log` and `GOD-Bookings-Page`.

> **Status:** scaffolding only. Auth, the slot-booking engine, and the admin
> assignment UI land in follow-up PRs (see [Roadmap](#roadmap)).

## Roles

- **Kainkaryam for Pirumar** — self-serve signup, open every day.
- **Tirtha Kainkaryam** — self-serve signup, **only open Friday, Saturday,
  and Sunday** (not Monday–Thursday).
- **Admin** — assigns people to slots; granted manually, not chosen at
  signup.

Role IDs and labels live in [`src/config/roles.ts`](./src/config/roles.ts).

## Open Hours

| Days      | Morning     | Evening     |
| --------- | ----------- | ----------- |
| Mon – Fri | 6:00 – 11:00 | 16:00 – 21:00 |
| Sat – Sun | 8:00 – 12:00 | 19:00 – 21:00 |

Tirtha Kainkaryam only opens on the Fri/Sat/Sun rows above. These windows are
encoded in [`src/config/schedulingRules.ts`](./src/config/schedulingRules.ts)
(covered by [`tests/schedulingRules.test.ts`](./tests/schedulingRules.test.ts))
so the slot-generation engine (a follow-up PR) has a single source of truth.

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
- Apps Script checks that token on every request before touching the sheet —
  this is the "WAF" layer described in the project brief.
- Session auth uses a signed token (`TOKEN_SIGNING_SECRET`), following the
  same model as `GOD-nama-log`'s `Users.gs`.
- In production the Express server also serves the built frontend
  (`dist/`), so the whole app is one Cloud Run service mapped to one domain.

## Project Structure

```
src/
  config/       roles + scheduling-window constants (shared source of truth)
  styles/
  App.tsx, main.tsx
server/
  index.js      Express app: health check, static hosting, future API routes
apps-script/
  Scheduling.gs Apps Script entry point + token check (business logic TBD)
tests/
  schedulingRules.test.ts
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

Data lives in this spreadsheet (currently empty — tabs/columns are created
by the auth and slot-engine PRs):

<https://docs.google.com/spreadsheets/d/1BQt33T5z9p9HvXKSK4dqPLhmeneZaZdsbtAkmCfu1vs/edit>

## Deploying Apps Script

1. Open the spreadsheet above → Extensions → Apps Script.
2. Paste in [`apps-script/Scheduling.gs`](./apps-script/Scheduling.gs) (and
   whatever files a follow-up PR adds alongside it).
3. Project Settings → Script Properties, set:
   - `SPREADSHEET_ID` — the spreadsheet ID above
   - `APPS_SCRIPT_TOKEN` — a long random secret, must match the Cloud Run
     server's `APPS_SCRIPT_TOKEN`
   - `TOKEN_SIGNING_SECRET` — a long random secret for session tokens
4. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone
   with the link**. Copy the `/exec` URL into `APPS_SCRIPT_URL`.

## Deploy to Cloud Run

This app is its own Cloud Run service under the **Namabiksha V1** GCP
project, mapped to a subdomain provided by the host organization.

```powershell
$PROJECT = "namabiksha-v1"          # replace with the actual GCP project ID
$REGION  = "us-central1"
$SERVICE = "god-scheduling-app"

gcloud builds submit --project $PROJECT --tag "$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE"

gcloud run deploy $SERVICE `
  --project $PROJECT `
  --image "$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE" `
  --region $REGION `
  --allow-unauthenticated `
  --set-secrets APPS_SCRIPT_URL=apps-script-url:latest,APPS_SCRIPT_TOKEN=apps-script-token:latest,TOKEN_SIGNING_SECRET=token-signing-secret:latest `
  --set-env-vars CORS_ORIGINS=https://<your-subdomain>
```

`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, and `TOKEN_SIGNING_SECRET` are stored
in Secret Manager, per the project brief, rather than passed as plain
`--set-env-vars`. Once deployed, map the given subdomain to this Cloud Run
service (`gcloud run domain-mappings create`).

## Roadmap

Scaffolding is split from feature work into separate PRs:

1. **Scaffolding** (this PR) — repo, build tooling, Express skeleton, Apps
   Script entry point, Dockerfile, docs.
2. **Auth & roles** — signup/login, password storage, session tokens, the
   `Users` sheet tab, role selection at signup.
3. **Slot engine & booking** — generates open slots from the rules above,
   lets users book/cancel, the `Slots` sheet tab.
4. **Admin assignment** — admin UI to assign/reassign people into slots,
   view coverage.
5. **Deployment hardening** — Secret Manager wiring, domain mapping,
   production CORS/rate limiting.
