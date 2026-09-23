# Repository Guidelines

## Project Structure

- `src/` contains the React/Vite SPA: pages, auth, API wrappers, validation, and scheduling rules.
- `server/` contains the Express API, routes, Apps Script client, auth validation, and rate limiters.
- `apps-script/` contains the Google Apps Script source copied into the deployed spreadsheet project. `Scheduling.gs` routes actions to `Users.gs`, `Slots.gs`, and `Admin.gs`.
- `tests/` contains Vitest coverage for scheduling rules, frontend/server validation, and Apps Script calls.
- `scripts/` contains deployment-support scripts; `Dockerfile` builds and runs the app on Cloud Run.

## Build, Test, and Development Commands

```bash
npm install
npm run server       # Express API on :8080
npm run dev          # Vite UI on :6100; proxies /api to the API
npm run typecheck    # TypeScript checks without emitting files
npm run lint         # ESLint
npm run test         # Vitest suite
npm run build        # Production frontend in dist/
npm run check        # typecheck + lint + test + build
```

Copy `.env.example` to `.env` and configure the Apps Script URL and secrets before authenticated flows. Run `npm run check` before opening a PR.

## Coding Style and Naming

Use two-space indentation, semicolons, double-quoted imports/strings, and trailing commas. Use `PascalCase` for React components, `camelCase` for functions/variables, and lower-case route filenames. Keep shared scheduling behavior in `src/config/schedulingRules.ts`; mirror changes in Apps Script when rules change. ESLint and strict TypeScript are the correctness gates.

## Testing Guidelines

Tests use Vitest with a Node environment. Name files `*.test.ts` or `*.test.js`, keep server tests under `tests/server/`, and cover rule boundaries, validation failures, and API contracts. Use `npx vitest run tests/schedulingRules.test.ts` or `npx vitest run -t "test name"` for focused runs. No coverage threshold is configured.

## Commits and Pull Requests

Use short, imperative commit subjects such as `Add admin assignment` or `Harden server for production`; keep unrelated changes separate. PRs should explain behavior and affected layers, link the relevant issue or task, list validation commands, and include UI screenshots when relevant. Call out required Apps Script redeployment or Cloud Run configuration changes. Never commit `.env` files or secrets.

## Architecture and Security Notes

The browser calls Express only; Express is the sole holder of `APPS_SCRIPT_TOKEN`. Do not send secrets to the client, store plaintext passwords, bypass server-side scheduling validation, or merge the Apps Script auth token with a user session token. Apps Script edits are not live until manually pasted and deployed as a new version.

## Apps Script Deployment Gate

Any change to a file under `apps-script/` (including any `.gs` file) must be copied into the live Google Apps Script project and deployed as a new version on the existing active web-app deployment before the work is considered complete. Verify the deployed version and at least one live API or UI path afterward; changing the repository source alone does not update the backend used by production.
