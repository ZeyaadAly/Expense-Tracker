# Expense Tracker

## Overview

Expense Tracker V1 records income and expenses in EGP and shows the overall balance. The local application is verified through T12; documentation and handoff are T13. Deployment of the integrated application remains T14.

V1 has one shared transaction collection and no authentication. Use sample data for any hosted demonstration. Start with this README; [developer handoff](docs/07-handoff.md) records maintenance notes and remaining work.

## Features

- Dashboard with total income, total expenses, and current balance.
- Create, list, read, edit, and permanently delete transactions with confirmation.
- Type/category filters, combined filters, and reset. Summary stays global.
- Responsive transaction cards on mobile and a table from 768px.
- Field validation, loading/empty states, scoped read retries, and recovery for uncertain writes.
- Exact decimal amounts and date-only values, with Africa/Cairo date boundaries.

## Tech Stack

| Layer | Implementation |
| --- | --- |
| Frontend | Next.js 16.3.8, React 19.2.8, TypeScript, Tailwind CSS 4 |
| Backend | Express 5, TypeScript, node-postgres (`pg`) |
| Database | Supabase PostgreSQL, versioned SQL migrations, limited application role, Session Pooler |
| Verification | Node test runner; existing browser scripts using external agent-browser/Chrome and accessibility audits |

Each package has its own committed lockfile. T12 used Node 26.5.0, npm 12.0.2 and disposable PostgreSQL 17.11; these are recorded verification versions, not additional exact-version requirements.

## Architecture

```text
Browser → Next.js frontend → Express REST API → PostgreSQL / Supabase
```

The browser calls Express using native fetch and never connects directly to Supabase. Express owns validation and parameterized SQL and connects as `expense_tracker_app`, not an administrator. PostgreSQL calculates all financial totals. Amounts and totals remain exact decimal strings throughout the API and frontend; the browser never sums persisted financial data.

Transaction dates remain `YYYY-MM-DD` calendar strings and display as `DD/MM/YYYY`. Today's default and future-date validation use Africa/Cairo. [API contract](docs/04-api-design.md) and [database design](docs/03-database-design.md) contain the detailed rules.

## Repository Structure

| Path | Purpose |
| --- | --- |
| `frontend/src/app/` | Next.js App Router page, layout and shared CSS |
| `frontend/src/components/` | Dashboard, transactions, accessible dialogs and shared UI |
| `frontend/src/lib/` | API client/read state, types, money/date helpers and development-only fixtures |
| `frontend/tests/`, `frontend/scripts/` | Automated tests and optional browser verification |
| `backend/src/` | Express entry point, routes, validation, services, pool and error handling |
| `backend/tests/`, `backend/scripts/` | HTTP/database tests and verification runners |
| `supabase/migrations/`, `supabase/seed.sql` | Authoritative SQL history and separate repeatable sample seed |
| `docs/` | Contracts, approved design specification, historical reports and handoff |

Generated `backend/dist`, `frontend/.next`, dependencies, local environments and verification artifacts are ignored.

## Prerequisites

- Node.js 22 or newer with npm, as required by the backend.
- Access to a configured Supabase PostgreSQL project and the limited role's privately provisioned password for the normal application.
- For a new database: administrative migration access and a PostgreSQL SQL client such as `psql`. Administrative access is used only for setup, not the Express runtime.
- For database integration tests: a separate disposable loopback PostgreSQL cluster with database `postgres`. Docker is optional; T12 used portable PostgreSQL.
- Supabase CLI authentication is needed only for linked remote migration-history inspection. End users and routine frontend/backend checks need no ChatGPT plugins.
- Agent-browser and a local Chrome installation are needed only for the optional browser runners; neither is an application dependency.

## Environment Setup

From repository root, copy the examples:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

PowerShell equivalent:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Edit the copies privately. Existing files are not a prerequisite and secrets are never supplied by the repository.

| Variable | Location | Required/default | Visibility |
| --- | --- | --- | --- |
| `PORT` | Backend | Optional; 4000 | Server configuration |
| `CLIENT_ORIGIN` | Backend | Optional; `http://localhost:3000` | Server configuration; one exact browser origin |
| `DATABASE_URL` | Backend | Required; replace every `YOUR_...` placeholder | Secret, server-only |
| `DATABASE_SSL_CA_FILE` | Backend | Optional; example `certs/supabase-ca.crt` | Server file path; public CA certificate |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend | Configure explicitly; example `http://localhost:4000/api/v1` | Public, embedded in browser code |

A missing/unsafe frontend API URL shows a configuration error; it has no automatic production fallback. Restart frontend development after changing it and set it before a production build. The backend resolves `.env` and relative CA paths from `backend/`, even when launched from repository root.

Get **Connect → Session pooler** from the Supabase Dashboard. Copy the supplied host/database and port 5432; use username `expense_tracker_app.YOUR_PROJECT_REF` and that role's password. Percent-encode reserved password characters. Do not use an administrative connection as the backend URL.

The included [public CA certificate](backend/certs/supabase-ca.crt) supports the verified configuration; its source is recorded in [T04](docs/t04-verification.md). The pool always verifies TLS certificates and hostname. It rejects `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, and `uselibpqcompat` URL parameters because they can override its TLS settings. Do not disable TLS for ordinary app setup.

## Local Development

Run from repository root:

```sh
npm --prefix backend ci
npm --prefix frontend ci
```

Configure the environment copies and database as above/below, then start each application in a separate terminal:

```sh
npm --prefix backend run dev
```

```sh
npm --prefix frontend run dev
```

Open `http://localhost:3000`. The backend API is `http://localhost:4000/api/v1`. On Windows, use `npm.cmd` if execution policy blocks `npm.ps1`.

Check database connectivity:

```sh
curl http://localhost:4000/api/v1/health
```

Success is HTTP 200 with `{"data":{"api":"running","database":"reachable"}}`. Database unavailability returns sanitized HTTP 503 with `DATABASE_UNAVAILABLE`; both use `Cache-Control: no-store`. Missing/malformed backend configuration prevents startup.

To run local compiled builds, build each package before starting it, in separate terminals:

```sh
npm --prefix backend run build
npm --prefix backend run start
```

```sh
npm --prefix frontend run build
npm --prefix frontend run start
```

The frontend build embeds the configured public API URL. These commands run locally and do not deploy anything.

Development-only `/?preview=populated` or other scenes in `frontend/src/lib/fixtures.ts` display isolated visual fixtures. They do not establish persistence. Production ignores the preview query and uses Express.

## Database Setup

Authoritative migrations, in order:

1. `supabase/migrations/20261001144302_initial_expense_tracker_schema.sql`: private schema/table, checks, timestamp/date trigger and ordering index.
2. `supabase/migrations/20261003163341_backend_application_role.sql`: limited `expense_tracker_app` login and grants.

The role migration expects database `postgres` and creates a cluster-wide role. Start with a fresh cluster/project where neither application schema nor role already exists. Creating another database in an old cluster does not remove an existing role.

### Existing linked project

Project `kpbyvbgcfwavcsgtcdws` has both migration versions recorded as applied, according to T04. Do not replay the baseline, run `db pull`/`db push`, seed retained data, or repair history automatically during onboarding. Link/history facts are historical verification; this guide does not assert a fresh remote inspection.

If history inspection is needed, authenticate and link deliberately:

```sh
npx supabase login
npx supabase link --project-ref kpbyvbgcfwavcsgtcdws
npx supabase migration list --linked
```

Before the list command, confirm `supabase/.temp/project-ref` matches the intended project. CLI link state remains ignored. Resolve any history discrepancy only after catalog inspection; the historical [T04 report](docs/t04-verification.md) describes the original reconciliation.

### Fresh database or project

Provision the PostgreSQL instance separately; this repository does not automatically create it. Use a database named `postgres`. For a new Supabase project, obtain its administrative SQL connection privately. Supply it in a temporary `MIGRATION_DATABASE_URL` shell variable, then apply the existing files from repository root:

```sh
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261001144302_initial_expense_tracker_schema.sql
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261003163341_backend_application_role.sql
psql "$MIGRATION_DATABASE_URL"
```

At the interactive psql prompt, provision the limited login's password without placing it in SQL files:

```text
\password expense_tracker_app
\q
```

In PowerShell, use `$env:MIGRATION_DATABASE_URL` instead of `$MIGRATION_DATABASE_URL` when passing an environment variable. This setup variable is not an application `.env` key. Keep it private and remove it after setup and any intended optional seeding. Direct SQL application does not record Supabase CLI migration history; reconcile a new project's history before future managed migrations. Do not apply the files twice or copy the documented existing-project history to a different project without verification.

Configure the backend limited-role Session Pooler connection afterward. Keep `expense_tracker` outside Data API exposed schemas and preserve the baseline revocations; no browser Supabase API keys are required.

For a **fresh disposable/sample-only database**, optional sample seed:

```sh
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

The seed uses three fixed IDs and `ON CONFLICT (id) DO NOTHING`: Freelance payment 1000.00, Grocery shopping 250.50 and Taxi fare 45.75. Running it twice retains three rows. Exact totals are **1000.00 income, 296.25 expenses, 703.75 balance**. Do not use the seed to reset retained data.

A plain local non-TLS database works with the isolated verification wrapper, not the normal TLS-enforced backend. For ordinary local app development, use the configured Supabase connection or a PostgreSQL server with correctly verified TLS.

## API

All paths below are relative to `/api/v1`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Read-only database health; 200 or sanitized 503 |
| GET | `/transactions` | Deterministic list; optional lowercase type/category filters |
| POST | `/transactions` | Validate five string fields; save; 201 plus Location |
| GET | `/transactions/:id` | One record, or 404 |
| PUT | `/transactions/:id` | Replace all five editable fields; 200 or 404; no upsert |
| DELETE | `/transactions/:id` | Permanent deletion; empty 204 or 404 |
| GET | `/summary` | Global exact income/expenses/balance and count |

Success JSON uses `{data}`; lists add `meta`; errors use `{error:{code,message,details}}`. DELETE 204 has no JSON. Unsupported methods return 405 with Allow. Amount is a positive decimal string from 0.01 through 999999999.99; descriptions are trimmed, 1–200 Unicode code points; dates are valid calendar days from 1900-01-01 through today in Cairo. Unknown fields, unsupported/repeated queries and invalid type/category pairs are rejected.

Read [the full API specification](docs/04-api-design.md) for payloads, filters, status codes and recovery contracts.

## Testing

Routine checks from repository root:

```sh
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test

npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend test
```

Backend tests import compiled modules, so build first. Without `T06_DISPOSABLE_DATABASE_URL`, four PostgreSQL integration groups are explicitly skipped; do not interpret that run as the complete 24-group T12 gate. Integration fixtures reset data and must never point at retained development or remote data.

Optional verification scripts:

| Runner | Purpose / prerequisites |
| --- | --- |
| `frontend/scripts/verify-t07-domain.mjs` | Lightweight frontend money/date/category checks; run from frontend |
| `backend/scripts/verify-t04-health.mjs` | Starts/stops configured backend health processes; needs free ports 4000/4001 or alternate HEALTH_SUCCESS_PORT/HEALTH_FAILURE_PORT |
| `backend/scripts/verify-t04-database.mjs` | Fresh disposable loopback cluster/database `postgres`; DISPOSABLE_DATABASE_URL; applies migrations/seed and checks constraints/role |
| `backend/scripts/verify-t12-database.mjs` | Additional catalog/permission checks; fixed loopback port 55442 |
| `backend/scripts/verify-t12-security.mjs` | Lightweight source/history/configuration scan; also requires an existing frontend build |
| `frontend/scripts/verify-t12.mjs` | Production CRUD/responsive/a11y and read-only restart phases; disposable test API and external agent-browser |

For example, from `frontend/`: `node scripts/verify-t07-domain.mjs`. From `backend/`: `node scripts/verify-t12-security.mjs` after a frontend build.

[Complete T12 reproduction](docs/t12-verification.md#reproduction-and-changed-files) documents T07–T12 browser runners, test environment variables and restart phases. Use the disposable test API on 4108 only for verification. Run suites sharing fixture data sequentially; rebuild the frontend after changing its API URL. Historical browser/database suites are optional for normal development and are not rerun merely for documentation changes.

## Verified V1 Status

[T12 verification](docs/t12-verification.md) is the accepted local baseline:

- Backend: 24 named test groups passed, zero failures/skips.
- Frontend: 22 named automated groups passed, zero failures/skips; domain runner passed.
- Browser: 429 named checks passed across regressions, T12, restart/reconnect and production hygiene.
- Accessibility: 47 audits with zero violations, alongside actual keyboard/focus checks.
- Fresh disposable clusters: migrations, repeatable seed, constraints, triggers, indexes and permissions passed.
- Exact money/dates and persistence through browser refresh, frontend/backend restarts and repeated database reconnect passed.
- Isolated current-source snapshot: locked dependency installations, builds, checks and tests passed without copied application build artifacts.

These are T12 results, not new T13 executions. Check counts are not combined with test-group or audit counts. See [T13 documentation verification](docs/t13-verification.md) for the lightweight handoff audit.

## Security Model

The backend role has database CONNECT, schema USAGE, table SELECT/INSERT/UPDATE/DELETE and trigger-function EXECUTE. It has no role memberships or application DDL/admin privileges. SQL values are parameterized; public errors are sanitized; secrets remain server-side and ignored.

CORS configures one browser origin but is not authentication and does not prevent direct HTTP clients from accessing the shared collection. Do not host real personal financial data under V1's unauthenticated access model. Writes are never automatically retried; uncertain outcomes require refresh/check before deliberate retry.

## Known Limitations

- No authentication/ownership isolation; single shared collection; EGP only.
- No search, pagination, budgets, charts, custom categories, exports or recurring transactions.
- No undo, idempotency keys or optimistic edit conflict protection; concurrent edits are last-write-wins.
- List and summary are separate reads, without an atomic cross-endpoint snapshot.
- T12 used Chrome viewport emulation; physical mobile keyboard/safe-area behavior, Safari/Firefox and screen-reader sessions were not exercised.
- Cairo midnight was tested with deterministic instants. Clean verification used a source snapshot, not a fresh clone of committed HEAD.
- npm's local policy blocked selected tooling postinstall scripts; builds/tests passed, but clean `tsx watch` startup under that policy was not separately verified.
- Historical Figma dialog/state comparison limits remain documented in T07.

## Deployment

**The integrated full-stack V1 is not verified as deployed. T14 is blocked on Vercel owning-team access.** See [T14 deployment audit](docs/t14-verification.md).

The [Vercel production page](https://expensetracker-inky-mu.vercel.app) now serves Git commit `087c78f` with the API-connected frontend, superseding the October 3 fixture build. The T14 read-only browser audit found missing API configuration: summary/list cannot load because `NEXT_PUBLIC_API_BASE_URL` is unset. No backend production URL was found. See [historical deployment verification](docs/vercel-deployment-verification.md) and the current T14 report.

T14 still needs to restore Vercel team access, confirm/configure Express hosting and provider limits, configure production frontend API URL and backend CORS/secrets/TLS, deploy sample data only, and verify deployed CRUD, filters, totals, persistence, accessibility and error recovery. Re-authenticate the Vercel connection with access to `zeyadali408-1717s-projects` before resuming. No deployment or production configuration was changed during the audit.

## Design

Approved [Figma design](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA), [T03 specification](docs/06-t03-ui-specification.md) and [T07 implementation evidence](docs/t07-verification.md).

Implementation uses Arial, Helvetica, sans-serif; Inter is a Figma fallback. Transactions switch from cards to a table at 768px. T12 checked 320/360/768/1024/1440px; the approved reference frames are 360/768/1440px.
