# V1 handoff

## Current status

T01–T14 are complete. Local verification, documentation, and hosted acceptance passed; T14 cleanup restored the baseline. [README](../README.md) is the onboarding guide. [T12 verification](t12-verification.md) is the accepted functional baseline; [T13 verification](t13-verification.md) records documentation checks; [T14 audit](t14-verification.md) records current hosted state.

## Architecture

Browser → Next.js frontend → Express API → PostgreSQL/Supabase. The browser calls the API and never connects to Supabase. The backend uses `expense_tracker_app`, a limited database role. PostgreSQL calculates global totals; monetary values travel as exact decimal strings. Type/category filters affect the list, not the summary.

See [API contract](04-api-design.md) and [database design](03-database-design.md). Source lives in `frontend/src/` and `backend/src/`; authoritative migrations and optional sample seed live in `supabase/`.

## Completed milestones

| Milestones | Completed work |
| --- | --- |
| T01–T02 | Project preparation and frontend/backend foundations. |
| T03 | Approved Figma interface specification. |
| T04 | PostgreSQL schema, migration history and limited application role. |
| T05–T06 | Validation, API foundations, create/read and summary. |
| T07–T08 | Responsive dashboard and connected create/read flow. |
| T09–T10 | Editing and deletion. |
| T11 | Type/category filtering and error recovery. |
| T12 | Complete local acceptance verification. |

T12 passed 24 backend test groups, 22 frontend test groups, 429 browser checks and 47 accessibility audits with zero violations. Clean-source builds/tests, two fresh disposable PostgreSQL clusters, constraints/permissions, exact money/date boundaries and restart persistence also passed. These are existing results, not T13 reruns.

## How to run

Use Node.js 22 or newer and npm. From the repository root:

```sh
npm --prefix backend ci
npm --prefix frontend ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

On PowerShell use `Copy-Item backend/.env.example backend/.env` and `Copy-Item frontend/.env.example frontend/.env.local` for copying. Configure the backend privately with the limited-role Session Pooler connection and trusted CA; follow [database setup](../README.md#database-setup) before starting. The frontend public variable points to `http://localhost:4000/api/v1`.

Run these in separate terminals from the root:

```sh
npm --prefix backend run dev
npm --prefix frontend run dev
```

Frontend: `http://localhost:3000`; backend health: `http://localhost:4000/api/v1/health`. The normal backend requires verified TLS; a plain local PostgreSQL instance is supported by disposable test wrappers, not by the normal runtime connection configuration.

## How to test

Primary development checks, from the root:

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

Backend build precedes tests. Four database integration groups skip without the explicitly configured `T06_DISPOSABLE_DATABASE_URL`. Never point destructive test fixtures at a shared or production database. [README testing](../README.md#testing) lists optional browser/database tools; [T12 reproduction](t12-verification.md#reproduction-and-changed-files) explains the exhaustive checks. Run affected checks after code changes; documentation edits do not require repeating that baseline.

## Database / Supabase notes

- Preserve existing remote migration history. The two checked-in migrations are authoritative; do not automatically replay them against an existing project or restore old pull/push instructions.
- A fresh disposable setup uses a database named `postgres` and requires authority to create the cluster-wide application role. Assign its password privately, outside tracked SQL.
- Use the Supabase Session Pooler on port 5432 and the limited role in the backend URL. The backend pool has at most five connections and verifies the configured CA. SSL URL overrides are rejected.
- Amounts use `numeric(12,2)`; dates follow Africa/Cairo. Triggers reject future dates, protect identity/creation timestamps and refresh update timestamps.
- The optional seed inserts three fixed-ID rows with conflict protection: income 1000.00, expenses 296.25, balance 703.75. Seed only an intended sample/disposable collection.

## Security notes

The application role has table CRUD rights, not administrative or schema-changing rights. Keep backend credentials in ignored environment files or hosting secret settings. Only `NEXT_PUBLIC_API_BASE_URL` is public frontend configuration. TLS verification stays enabled; API database errors are sanitized. CORS restricts browser origins but provides no authentication. V1 is an unauthenticated shared collection, so any future public demo must contain sample data only.

## Design reference

[Approved Figma design](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA) and [T03 specification](06-t03-ui-specification.md). Implementation uses Arial/Helvetica; Figma uses Inter as a fallback. Preserve the documented responsive behavior and reference widths.

## Known limitations

EGP only; no authentication, search, pagination, budgets or charts. List and summary requests use independent snapshots. No idempotency keys or concurrent-edit conflict handling. Browser coverage uses Chrome device emulation, not native mobile keyboards/safe areas, Safari/Firefox or screen-reader sessions. Cairo midnight checks are synthetic. T12 clean-source verification used a source snapshot rather than a new clone of HEAD; startup of tooling whose install scripts were blocked was not separately verified.

Frontend: https://expensetracker-inky-mu.vercel.app/

Backend: https://expense-tracker-api-green.vercel.app/

Both production deployments serve `b7e0d9f`. Hosted health, UI CRUD, filters, exact totals, reload/new-session persistence and baseline cleanup passed on 2026-10-06. Responsive checks at 360/768/1440 and 12 accessibility audits passed. See [T14 verification](t14-verification.md) for evidence and smoke-test limits.

## Next work

No remaining T14 work. Maintain the unauthenticated demo with sample data only; keep server credentials private and verified TLS enabled. Run affected checks for future changes.
