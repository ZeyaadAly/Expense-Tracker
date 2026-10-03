# Expense Tracker

V1 uses a Next.js frontend, an Express API, and Supabase PostgreSQL. The frontend sends application requests only to Express. V1 has one shared transaction collection and no authentication; use sample data only for any hosted demo.

T04 is verified for Supabase project `kpbyvbgcfwavcsgtcdws`. The existing baseline `20261001144302_initial_expense_tracker_schema.sql` matches the remote schema and was already recorded as applied. Migration `20261003163341_backend_application_role.sql` adds the limited backend role and is also recorded remotely. See [T04 verification](docs/t04-verification.md). [T05 foundations](docs/t05-verification.md) and [T06 create/read/summary endpoints](docs/t06-verification.md) are verified. PUT/DELETE remain planned. T07 dashboard layout follows the outstanding T03 design prerequisite.

## Prerequisites

- Node.js 22 or newer and npm.
- A Supabase CLI login for linked migration-history inspection.
- A disposable PostgreSQL database for migration verification; Docker is optional.
- A server-only PostgreSQL connection string for backend health and later API work.

## Install application dependencies

```sh
cd frontend
npm ci
cd ../backend
npm ci
```

The packages have separate lockfiles. In PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

## Supabase CLI and migrations

The root `supabase/config.toml` already exists. The initial migration was created with `supabase migration new initial_expense_tracker_schema`; its version is `20261001144302`. It contains the exact documented V1 SQL. Do not run `db pull` or `db push` for this existing remote baseline.

After authenticating, run from the repository root:

```sh
npx supabase login
npx supabase link --project-ref kpbyvbgcfwavcsgtcdws
```

Verify that `supabase/.temp/project-ref` contains exactly `kpbyvbgcfwavcsgtcdws` before running:

```sh
npx supabase migration list --linked
```

Both migration versions are already recorded remotely. Repair is needed only if a missing history entry is discovered after verifying that its SQL is already applied. In that case, use `npx supabase migration repair --linked --status applied VERSION`; it records history without executing SQL. Enter any database password only in the CLI prompt. Never run the initial migration against the existing remote schema. Keep sample seeding separate and explicit.

`supabase/seed.sql` contains three fixed sample transactions and `ON CONFLICT (id) DO NOTHING`, so rerunning it does not duplicate rows. It is for disposable local/demo data and is not applied to the remote project during setup. With an empty database, the sample totals are 1,000.00 EGP income, 296.25 EGP expenses, and 703.75 EGP balance.

## Backend environment

Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL`. The file contains only:

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
DATABASE_URL=
DATABASE_SSL_CA_FILE=certs/supabase-ca.crt
```

`PORT` and `CLIENT_ORIGIN` have those development defaults. `DATABASE_URL` is required, stays on the backend, and must not be committed. The root and Supabase ignore files exclude local environment files and CLI link state.

Use **Connect → Session pooler** in the Supabase Dashboard. Keep the supplied host, database, and session port (5432), but use username `expense_tracker_app.kpbyvbgcfwavcsgtcdws` and that role's password, not the administrative database password. Percent-encode reserved password characters. The current ignored environment is already configured. A new environment needs the role's password provisioned privately through an administrative connection; passwords never belong in migration SQL or documentation.

The pool explicitly enables TLS with certificate and hostname verification. `DATABASE_SSL_CA_FILE` points to a PEM CA certificate, with relative paths resolved from `backend/`. The public Supabase CA is included at `backend/certs/supabase-ca.crt`; its source is recorded in the verification report. Do not put `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, or `uselibpqcompat` in `DATABASE_URL`: these can override node-postgres TLS configuration and are rejected. Keep the complete URL out of frontend variables and Git.

The backend creates one reusable `pg` Pool. A missing or malformed `DATABASE_URL` stops startup. The health query checks PostgreSQL with `SELECT 1`; it does not inspect or change transaction data.

## Run and test the backend

```sh
cd backend
npm run dev
```

In a second terminal:

```sh
curl http://localhost:4000/api/v1/health
```

A reachable database returns HTTP 200:

```json
{"data":{"api":"running","database":"reachable"}}
```

An unavailable database returns HTTP 503 with `error.code` set to `DATABASE_UNAVAILABLE` and an empty `details` array. Neither response includes connection strings, SQL, or provider details.

## Frontend

Copy `frontend/.env.example` to `frontend/.env.local`, run the backend using its documented server-only configuration, then run `npm run dev` from `frontend/` and open `http://localhost:3000`. The public `NEXT_PUBLIC_API_BASE_URL` defaults in the example to `http://localhost:4000/api/v1`. Restart dev after changing it; configure it before a production build. No database credentials belong in the frontend.

T08 is complete: the dashboard reads transactions and unfiltered summary from Express, applies type/category filters through the API, and creates transactions with authoritative validation and refresh. Saved records survive reloads. Failed saves retain the draft; uncertain outcomes require a read-only refresh/check before deliberate retry. T09 now connects Edit to PUT with full replacement validation, retained drafts on errors, and authoritative refreshes. Delete remains a UI-only preview until T10. See [T08 verification](docs/t08-verification.md).

The approved [Figma design](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA) is recorded in the [T03 UI specification](docs/06-t03-ui-specification.md). T07 is complete; see [T07 verification](docs/t07-verification.md) for final checks and the non-blocking Figma-provider comparison limitation.

Development-only state previews use `/?preview=populated`, `loading`, `empty`, `no-results`, `error`, `summary-error`, `list-error`, `success`, `stale`, `negative`, `stress`, `submitting`, `validation`, `save-error`, `uncertain`, `edit-missing`, `delete-pending`, or `delete-error`. These explicitly selected T07 fixtures never contact the API; fixture edits reset on reload. Production ignores this query and uses the API dashboard. Pending fixture dialogs intentionally remain pending until the page is reloaded.

Frontend checks, from `frontend/`: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, and `node scripts/verify-t07-domain.mjs`. With the dev server running and a local agent-browser session named `expense-t07` open against the preview, run `node scripts/verify-t07.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE`. Browser evidence is saved to ignored `.tmp-t07/`; the executable is an external verification tool, not an application dependency.

The real T08 browser integration runner is `node scripts/verify-t08.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE`; it requires the disposable local test API setup documented in [T08 verification](docs/t08-verification.md). Its test wrapper and fixture-reset controls must never run against retained data or be deployed. Evidence is saved in ignored `.tmp-t08/`.

## Vercel frontend deployment

Live dashboard: https://expensetracker-inky-mu.vercel.app.

For the Vercel project `expense_tracker`, set **Root Directory** to `frontend` in Project Settings → Build and Deployment. Use the Next.js framework preset, Node.js 24.x, and default install/build/output settings. The repository root has no Next.js app directory; building there fails with “Couldn't find any pages or app directory.” Root Directory is a Vercel project setting, rather than a `vercel.json` property.

This existing deployment serves the earlier fixture build. T08/T09 integration is verified locally; deploying the integrated frontend and separately hosted Express API remains T14. See [deployment verification](docs/vercel-deployment-verification.md).

## Backend checks

Run `npm run lint`, `npm run typecheck`, `npm run build`, then `npm test` in `backend/`. Tests load compiled modules, so rebuild after source changes. The tests use isolated HTTP servers and do not write to Supabase. After building, run `node scripts/verify-t04-health.mjs` with ports 4000 and 4001 free; it starts and stops test backend processes and checks live success plus simulated database failure. Set `HEALTH_SUCCESS_PORT` and `HEALTH_FAILURE_PORT` to alternate ports when a development server is running.

To repeat the SQL checks, use a fresh disposable PostgreSQL database named `postgres` on loopback. From `backend/`, set `DISPOSABLE_DATABASE_URL` privately and run `node scripts/verify-t04-database.mjs`. The runner refuses non-loopback hosts and an existing application schema, applies both migrations, runs the seed twice, and checks constraints, exact money, timestamp behavior, limited-role CRUD, and denied DDL. Do not point it at retained data.

For T06 PostgreSQL integration tests, prepare that disposable database first, set `T06_DISPOSABLE_DATABASE_URL` to its administrative test connection, and run `npm test`. The API tests connect as `expense_tracker_app`; the administrative connection manages fixtures. The runner uses the local trust-auth fixture, resets transaction data only in the selected loopback database, and must never target retained development data. Without this explicit variable, the PostgreSQL integration group is skipped; other tests still run. T04–T06 passed; T07 layout follows T03 design.

Implemented application endpoints are POST/GET `/api/v1/transactions`, GET `/api/v1/transactions/:id`, and GET `/api/v1/summary`. List filters are optional `type` and `category` parameters only. Summary totals always cover all transactions. The API also retains `/api/v1/health`. PUT `/api/v1/transactions/:id` is implemented and verified in T09. DELETE remains unimplemented.

T09 verification and reproduction steps: [Transaction editing](docs/t09-verification.md). From `frontend/`, run `node scripts/verify-t09.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE` with the disposable T08 test wrapper and local dev server configured as documented. Evidence is saved in ignored `.tmp-t09/`. Backend test files run serially because the disposable fixture suite resets the shared test database.
