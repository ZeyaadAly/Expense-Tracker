# Expense Tracker

V1 uses a Next.js frontend, an Express API, and Supabase PostgreSQL. The frontend sends application requests only to Express. V1 has one shared transaction collection and no authentication; use sample data only for any hosted demo.

The remote V1 schema for Supabase project `kpbyvbgcfwavcsgtcdws` was reported applied. The CLI-generated baseline is `supabase/migrations/20261001144302_initial_expense_tracker_schema.sql`, copied exactly from the V1 schema SQL in the database design. Remote migration history repair and live database verification remain pending. No transaction CRUD routes are implemented.

## Prerequisites

- Node.js 22 or newer and npm.
- A Supabase CLI login for the remote schema pull.
- A running Docker-compatible engine for `supabase db pull` to create its shadow database.
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
npx supabase migration repair --status applied 20261001144302
npx supabase migration list --linked
```

Repair records the existing schema as applied; it does not execute the migration SQL. Enter any database password only in the CLI prompt. Never run the initial migration against the existing remote schema. Keep sample seeding separate and explicit.

`supabase/seed.sql` contains three fixed sample transactions and `ON CONFLICT (id) DO NOTHING`, so rerunning it does not duplicate rows. It is for disposable local/demo data and is not applied to the remote project during setup. With an empty database, the sample totals are 1,000.00 EGP income, 296.25 EGP expenses, and 703.75 EGP balance.

## Backend environment

Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL`. The file contains only:

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
DATABASE_URL=
```

`PORT` and `CLIENT_ORIGIN` have those development defaults. `DATABASE_URL` is required, stays on the backend, and must not be committed. The root and Supabase ignore files exclude local environment files and CLI link state.

To obtain the URL, open your Supabase project in the Dashboard and select **Connect**. Copy the **Direct connection** string if your backend can reach IPv6; otherwise copy the **Session pooler** string for an IPv4 network. Replace the password placeholder with your database password, percent-encoding reserved characters. Use the host, port, and username provided by the Dashboard. Configure TLS in the URL, for example with `sslmode=require`; use the Supabase certificate and `sslmode=verify-full` when certificate verification is configured. Keep the complete URL out of frontend variables and Git.

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

Copy `frontend/.env.example` to `frontend/.env.local`. Its only public value is the Express API base URL, `http://localhost:4000/api/v1`. Then run `npm run dev` from `frontend/` and open `http://localhost:3000`. The page remains a setup placeholder; it does not connect to Supabase.

## Checks

Run `npm run lint`, `npm run typecheck`, and `npm run build` in `backend/`. T04 remains open until the remote baseline is recorded as applied, the database connection succeeds, and the migration and seed are verified on a disposable database. T05 API foundations starts afterward.
