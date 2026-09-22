# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run server       # Express API on :8080
npm run dev           # Vite dev server on :6100, proxies /api/* to :8080

npm run typecheck
npm run lint
npm run test          # vitest run (all tests)
npm run build
npm run check          # typecheck && lint && test && build — run before any PR

npx vitest run tests/schedulingRules.test.ts   # single test file
npx vitest run -t "allows tirtha kainkaryam"    # single test by name
```

`.env.example` documents the env vars `npm run server` needs
(`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, `TOKEN_SIGNING_SECRET`,
`CORS_ORIGINS`) — copy to `.env` and point at a deployed Apps Script (or a
local mock implementing the same action contract; see "Apps Script is not
synced automatically" below).

## Architecture

Three tiers, browser never talks to Apps Script directly:

```
Browser (React SPA) → Express server (this repo, one Cloud Run service) → Apps Script Web App → Google Sheet
```

- **`server/lib/appsScript.js`** (`callAppsScript(action, payload)`) is the
  only way server code reaches Apps Script. It appends `authToken` (the
  shared secret proving the request came from this server — the "WAF"
  check). `authToken` is deliberately a different field name than any
  payload's own `token` (a session token, e.g. for `validateToken`) —
  under a naive `{ ...payload, action, token }` spread these collide and
  the WAF secret silently clobbers the session token. This already
  happened once and was fixed; don't reintroduce it.
- **Apps Script action router**: `apps-script/Scheduling.gs`'s
  `ACTION_HANDLERS` maps an action name to a handler function implemented
  in `Users.gs`, `Slots.gs`, or `Admin.gs`. All four files are pasted into
  **one** Apps Script project and share a global scope (no imports) — e.g.
  `verifyToken_` is defined once in `Users.gs` and called directly from
  `Slots.gs`/`Admin.gs`.
- **Auth model**: the two self-serve roles (`perumal_kainkaryam`,
  `tirtha_kainkaryam`) register/login with email+password — salted
  SHA-256 hash in the `Users` sheet tab, no plaintext password ever
  stored. **Admin is not a user account.** `/admin` is publicly
  reachable and gated by a single shared password (Apps Script Script
  Property `ADMIN_PASSWORD`), exchanged via `POST /api/admin/login` for a
  synthetic `{ userId: "admin", email: "admin", role: "admin" }` identity
  using the same signed-token mechanism as normal login, so the rest of
  the app (`requireAdmin_`, `AdminRoute`, the other admin API routes)
  doesn't need to know the difference.
- **Scheduling rules source of truth**: `src/config/schedulingRules.ts`
  (weekday/weekend open-hour windows, Tirtha Kainkaryam's Fri/Sat/Sun-only
  restriction). Apps Script can't import that module, so
  `apps-script/Slots.gs` and `Admin.gs` duplicate the same constants —
  keep both in sync if the open hours ever change, and never trust a
  client-supplied date/window without recomputing eligibility server-side.
- **Slots are derived, with assignment rows.** Listing derives the open slot
  set on the fly from the scheduling rules plus whatever assignment rows
  already exist; rows may be pre-seeded or created by booking/admin actions.
  Multiple booked rows may share the same date, window, and role because
  overlaps are allowed.
- Full endpoint contracts (`/api/auth/*`, `/api/slots/*`, `/api/admin/*`)
  are documented in `README.md` — read that before adding or changing a
  route rather than re-deriving the shapes from the handlers.

## Apps Script is not synced automatically

`apps-script/*.gs` in this repo is the source of truth, but it is **not**
deployed automatically — it's pasted manually into the Apps Script editor
(spreadsheet → Extensions → Apps Script). Editing a `.gs` file here has no
live effect until you:
1. Paste the updated file content into the corresponding file in the
   editor.
2. Manage deployments → edit (pencil icon) → Version: **New version** →
   Deploy. (Editing files and saving alone does *not* update the live
   `/exec` URL — that only happens on a new deployment version.)

Script Properties (`SPREADSHEET_ID`, `APPS_SCRIPT_TOKEN`,
`TOKEN_SIGNING_SECRET`, `ADMIN_PASSWORD`), by contrast, take effect
immediately with no redeploy needed — they're read at request time.

## Deployment

A live Cloud Run service + Apps Script deployment + Google Sheet already
exist under GCP project `namabiksha-v1`. See `README.md`'s "Deploying Apps
Script" and "Deploy to Cloud Run" sections for exact commands, and
`scripts/setup-secrets.ps1` for Secret Manager setup. One gotcha not
obvious from the command itself: `gcloud run deploy --set-secrets` does
**not** grant the runtime service account access to those secrets — the
first deploy fails with a permission error until
`gcloud secrets add-iam-policy-binding` grants
`roles/secretmanager.secretAccessor` on each secret to
`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`.

## Verifying changes

There's no CI in this repo. Before opening a PR: run `npm run check`, then
verify behavior in-browser — either against a temporary local mock of the
Apps Script action contract (POST `/exec`, same actions/response shapes as
`apps-script/*.gs`) for fast iteration, or against the real deployed Apps
Script for a final check. Don't consider a change done on typecheck/lint/
test alone if it touches auth, booking, or admin flows.
