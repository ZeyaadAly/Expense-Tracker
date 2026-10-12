# T37 production-preview release attempt

Date: 2026-10-12 (Africa/Cairo). **Status: Blocked at Phase 7 — backup/recovery verification.** This is a partial release attempt, not hosted V2 acceptance or whole-project completion. T38 was not started.

## Git and release gate

Source branch `V2` was already clean and committed at `12cce0f22462231be706a9b177b67b12faf6e02a`. Fetch revealed GitHub PR #1 had already merged it into `main` at `e36cc1f7567a14c50d7a10298d465fc8e0799715`. Both trees are identical. Local main was fast-forwarded without conflicts or discarded work; push reported Everything up-to-date. No redundant checkpoint or merge commit was created.

Frontend lint/typecheck/build and all 140 tests passed on the checkpoint and again on main. Backend lint/typecheck/build passed on both; the general suite passed 89 of 112 tests, with 23 explicitly database-gated skips and zero failures. Dedicated fresh disposable suites separately passed T36 (214 checks), T31 (403 checks, 12 races, 12 failure probes), T32 (103 checks), T29 (357 checks, 10 races, 11 faults), and T18/shared regressions: T16 599, T17 263, balances 285, transactions 244, search 263, filters 3263, pagination 6065, transfers 917, recurring isolation 31. These dedicated runs tested the exact tree subsequently fast-forwarded onto main.

Current-source T37 browser verification passed 447 checks and 20 axe audits, zero violations, at 360/768/1440. It used synthetic sessions, real local JWT verification and limited-role disposable PostgreSQL. These are local results, not hosted production tests. Source/docs/compiled-backend credential scanning passed across 352 source and 56 build files; no private environment values were available locally. No real environment file is tracked. git diff --check passed.

## Read-only production inventory

Project `expense-tracker`, ref `kpbyvbgcfwavcsgtcdws`, eu-central-1, ACTIVE_HEALTHY, PostgreSQL 17.11.0.002. Organization capability reports Free plan. Baseline captured at **2026-10-12 11:39:02 UTC**:

| Measure | Observed |
| --- | --- |
| Retained transactions | 1 |
| Income | 9500.00 EGP |
| Expenses | 0.00 EGP |
| Balance | 9500.00 EGP |
| Minimum / maximum transaction date | 2026-10-05 / 2026-10-05 |
| Legacy category / type | salary / income |
| Rows missing ownership references | 1 |
| Auth users / confirmed users | 0 / 0 |
| Profiles / accounts / categories | 0 / 0 / 0 |
| Transfers / definitions / occurrences / budgets / goals | All 0 |

The ordered original-field inventory fingerprint (PostgreSQL MD5 over JSON arrays including IDs, type, amount text, description, legacy category, date and timestamp text) is `434c087400fa7760625c24b75bfc4021`. The transaction ID was inventoried privately through provider SQL, without adding personal row content to Git. This fingerprint is reconciliation evidence, **not a backup**. Capture a fresh full recovery artifact and locked inventory before any later cutover; V1 is still writable.

Remote migration history already contains:

- `20261001144302` initial schema
- `20261003163341` application role
- `20261006132717` V2 core tables
- `20261006132719` nullable transaction references
- `20261006132721` indexes/triggers
- `20261006132723` runtime privileges

The four T11 additions predate this attempt. None were reapplied. T15 `20261006171715` and T32 `20261008135130` are absent. Catalog columns match the additive stage: transaction ownership remains nullable and legacy category remains required. There is no backfill or category seed. The observed salary mapping is known, but no production mapping was executed.

## Recovery gate and resumption

No usable backup artifact, backup timestamp, recovery point or successful isolated restore could be verified. Connected Supabase tools provide project/catalog access but no backup-list/download operation. No private database/admin connection or Supabase management access token is configured in this workspace for a supported logical dump and restore test. Do not interpret the Free-plan capability as proof that a recovery artifact exists or does not exist.

Supabase's [backup documentation](https://supabase.com/docs/guides/platform/backups) recommends logical exports for Free projects. It also documents that database backups exclude Storage object bytes and custom-role passwords, which require separate recovery handling. Provider documentation alone does not satisfy this project's recovery gate.

To resume, privately provision an administrative database connection for this project (for example through an ignored operator environment using MIGRATION_DATABASE_URL), or make a supported existing recovery artifact available. Do not send credentials in chat or commit a backup. Create/inspect the artifact, record timestamp and coverage, restore into an isolated database, and reconcile schema, retained fields/timestamps/totals and privileges before production mutation. Account for role-password reprovisioning and any provider configuration outside the dump.

Phase 8 has not been executed. The inventory already shows there is no production Auth user to select. After recovery passes, create/confirm the intended account through supported Auth behavior and explicitly designate it as the historical-data owner. Do not infer ownership or hardcode a real UUID into SQL.

## Database security observations

The existing expense_tracker_app role is NOINHERIT, non-superuser, without create-role/create-database/replication/bypass-RLS attributes or memberships. Private schema is owned by postgres; runtime schema CREATE is denied. Observed table grants are CRUD on the eight ordinary domain tables and SELECT/INSERT/UPDATE on occurrences, with no TRUNCATE grant. anon/authenticated have no private-schema USAGE or reported table grants. These observations precede T15/T32 and do not replace the post-migration security gate.

The provider SQL session reported TLS. The actual backend Session Pooler TLS configuration was not accepted/tested in this attempt. No pgrst.db_schemas role/database setting was returned; actual Data API exposed-schema configuration remains unverified. No grants, roles, RLS or API configuration were changed.

## Deployments and hosted verification

Read-only Vercel inspection found backend project expense-tracker-api, Express, Node 24.x, existing production deployment `dpl_4sLFb9VwdT8DKvAgWcU7qJXiKMbu`, READY, Git main SHA `e36cc1f7567a14c50d7a10298d465fc8e0799715`. This deployment already existed through the Git integration; no deployment was created or promoted by this attempt. READY is not functional acceptance.

- Backend alias: https://expense-tracker-api-green.vercel.app/
- Frontend documented alias: https://expensetracker-inky-mu.vercel.app/
- Frontend expected project: expense_tracker; current deployment SHA was not inspected/accepted at its later gate.

No private provider environment was read or configured. Required backend key names remain DATABASE_URL, DATABASE_SSL_CA_FILE, CLIENT_ORIGIN, SUPABASE_URL, CURSOR_SIGNING_SECRET and CRON_SECRET. Frontend key names remain NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Listing these names does not assert correct production values.

The development-only production 404 gate remains unchanged for all V2 routes, including Auth, dashboard, accounts/detail, transactions, transfer UI and recurring. No hosted authenticated API/UI CRUD, lifecycle, A/B isolation, responsive/a11y, bundle/network, cron processing, health acceptance or log review was performed after the stop gate. Local test evidence must not be substituted for those gates.

## Cutover, cleanup and next work

Maintenance was not started. Old unauthenticated V1 financial handlers remain present; reads and writes have not been retired or claimed safe for multi-user V2 data. No production financial record, Auth user, profile, category, account, schema, grant or environment was mutated. No temporary production-preview data was created, so no production cleanup was necessary. The task's disposable API/database and isolated audit Chrome were stopped; an existing local Next development process was left alone.

Recognized backend/vercel.json still has crons=[]; the prepared 0 3 * * * template remains inactive. Production cron processing acceptance and activation are pending.

Documentation for this blocked attempt is committed separately from the tested application merge; a documentation commit can cause Git-integrated deployment activity and is not evidence that the production cutover passed. Consult Git for the documentation commit SHA; the accepted application-source SHA above remains explicit.

Remaining V2 work includes deferred optional T35 suggestions, T38 analytics, budgets, goals, category/settings enhancements, optional reports/exports and later security/hardening/release tasks. First finish recovery, owner selection and the ordered production-preview gates. Then manually inspect the accepted live application before resuming development at T38. Do not start T38 automatically.
