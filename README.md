# Expense Tracker

Next.js frontend and Express API for a personal Expense Tracker. Supabase PostgreSQL is the selected database, and Supabase Auth will protect one approved account. This repository currently contains only the frontend placeholder and backend setup; sign-in, transaction routes, and database tables are not implemented.

## Architecture

The frontend uses Next.js, TypeScript, Tailwind CSS, and the App Router. Application data requests go to Express. Express will verify Supabase Auth access tokens, allow only the configured account, apply validation and business rules, and use a limited PostgreSQL connection to Supabase. The frontend may use Supabase Auth for sign-in in the next phase, but it does not call the Supabase Data API for transaction data. The service-role key and database credentials remain on the backend.

## Prerequisites

- Node.js 22 or newer and npm.
- Supabase project credentials for backend startup. The health route checks local configuration syntax, not remote Supabase access.

## Install

From the repository root:

```sh
cd frontend
npm ci
cd ../backend
npm ci
```

The packages have separate lockfiles. In PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

## Backend configuration

Copy `backend/.env.example` to `backend/.env` and set the following values:

| Variable | Current requirement | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Required | Supabase project URL, usually `https://<project-ref>.supabase.co`. Local HTTP is accepted for a local Supabase instance. |
| `SUPABASE_ANON_KEY` | Required | Supabase anon key used by the server-only Auth client for future token verification. |
| `PORT` | Optional; defaults to `4000` | Express listening port. |
| `CLIENT_ORIGIN` | Optional; defaults to `http://localhost:3000` | Allowed frontend origin for CORS. |
| `APP_OWNER_USER_ID` | Optional now; required for Auth integration | UUID of the one approved Supabase Auth user. |
| `DATABASE_URL` | Optional now; required for database setup | Server-only Supabase PostgreSQL connection URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional and unused now | Reserved for future server-only admin work; never expose it to the frontend. |

Startup rejects missing required values and malformed ports or URLs. `GET /api/health` confirms only that Express started after these local checks; it does not verify keys, a Supabase connection, or a database connection. Do not commit `backend/.env` or real credentials. The example file contains no secrets.

## Run and check the backend

```sh
cd backend
npm run dev
```

In another terminal:

```sh
curl http://localhost:4000/api/health
```

Expected response:

```json
{"status":"ok","api":"running","configuration":"valid"}
```

The route is public and outside the future `/api/v1` application API. Transaction routes do not exist yet.

## Run the frontend

Copy `frontend/.env.example` to `frontend/.env.local`. Its `NEXT_PUBLIC_API_BASE_URL` points to Express at `http://localhost:4000/api/v1`; it contains no database credentials. Then run:

```sh
cd frontend
npm run dev
```

Open `http://localhost:3000`. The page still shows the setup placeholder.

## Checks and builds

Run these scripts in each package directory:

```sh
npm run lint
npm run typecheck
npm run build
```

The planning documents are in [`docs/`](docs/05-implementation-plan.md). The next phase is **T02B — Integrate Supabase Auth for the approved account**. Create transaction tables only in the later database task.
