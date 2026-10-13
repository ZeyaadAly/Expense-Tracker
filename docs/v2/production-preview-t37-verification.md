# T37 production-preview release attempt

Updated: 2026-10-13 (Africa/Cairo). **Status: Partial / intentionally deferred.** The user reported successful hosted sign-in, refresh persistence and sign-out, then explicitly deferred remaining production-preview acceptance and authorized T38 on main. Hosted financial API/UI acceptance, multi-user isolation, responsive/accessibility, network/log and recurring acceptance remain deferred. Financial routes stay gated and cron stays disabled. T38 internal queries are complete; T39 remains unstarted. No production-preview acceptance was resumed during T38. Earlier checkpoints below are historical and do not override this deferral.

## 2026-10-13 production cutover and manual Auth checkpoint

The user explicitly chose to sign in personally and instructed the agent to stop when manual hosted authentication is required. No password was requested, entered or stored. Manual login URL: https://expensetracker-inky-mu.vercel.app/v2/login?next=%2Fv2%2Frelease-check . Sign in with the designated account, confirm **Signed in successfully**, refresh once to check persistence, then Sign out and confirm return to login. Report the outcome without sending identity details, credentials or tokens. The confirmation page is protected by the existing session/profile bootstrap boundary; it displays no financial fixtures.

Maintenance source was already committed externally at 4d95e61 when work resumed. Its existing Vercel build had failed before build logs with git_info_fail. The entry-point smoke test was corrected to reflect deliberate maintenance blocking, and the next production build passed at `27d52ef856c72a2d17418efe7d51c420cad7c145`, deployment `dpl_5dv3UephYqaqMv4uGfygYDoVdMbd`. Direct HTTPS verified V1 list/summary/create/edit/delete, V2 financial access and internal recurring processing returned no-store 503 MAINTENANCE; both health endpoints returned 200. The earlier unguarded deployment URL redirected to Vercel authentication. Runtime financial-table CRUD privileges were then suspended at **2026-10-13 06:19:14 UTC**.

The fresh production inventory retained the exact original fingerprint. A second archive restore into fresh local t37_cutover_rehearsal_20261013 rehearsed the complete controlled backfill and T15/T32 application. An initial final fingerprint used the local session's non-UTC timestamp text after SET LOCAL ended; approval review correctly blocked production execution pending clarification. Repeating the entire rehearsal with session-wide UTC produced the exact baseline fingerprint, all field checks passed, and review approved execution. No production backfill occurred before that second successful rehearsal.

Production backfill used bounded timeouts and ACCESS EXCLUSIVE locks, exact inventory/history/owner/empty-domain/category/trigger/privilege preflight, the explicitly designated sole confirmed Auth identity, an EGP/en/Africa-Cairo profile and exactly one cash Main Account with opening balance 0.00 and permanently locked opening semantics. All nine T12 fixed system categories were inserted from the reviewed seed; the actual legacy salary category mapped explicitly to the fixed Salary income category. Unknown categories fail closed. Only transactions_validate_write was transactionally disabled for reference updates and restored before validation/commit. IDs, type, exact amount text, description, original legacy category, date and microsecond timestamps were compared bidirectionally before commit; recurring linkage remains null.

After exact production reconciliation, T15 `20261006171715` and then T32 `20261008135130` were applied from the unchanged reviewed migration files. Each wrapper atomically committed DDL with the original version/name/SQL in Supabase migration history. No db push, history repair, baseline replay or constraint weakening occurred. All eight repository migration versions are now applied. Catalog validation reports zero missing transaction ownership references, zero unvalidated constraints and zero generated-pair errors. No RLS changes were made.

Backend release `43948ba70df63015cfe0923b15ac547b1c14ddd9`, deployment `dpl_E1p7ciEBg1rwgK753M2VPyewhHUT`, reached READY for expense-tracker-api. Runtime entry points now select V2 mode: V1 financial routes permanently return no-store 410 API_RETIRED. Health now verifies current_user is expense_tracker_app internally without exposing identity. Hosted V1/V2 health returned 200; HTTPS/HSTS, exact frontend CORS and no-store passed. Anonymous Accounts/Dashboard calls return 401. Reviewed V2 grants were restored at **2026-10-13 06:32:47 UTC** after retirement/health acceptance; occurrence DELETE/TRUNCATE and all runtime DDL/admin capabilities remain absent. Browser roles have no private schema access. A real public-key REST probe returned 406 PGRST106 for expense_tracker, proving Data API exclusion. The backend uses its existing private DATABASE_URL, the packaged CA and certificate-verifying pg pool; the secret URL was not decrypted/exported.

Production backend key names configured/verified: DATABASE_URL, DATABASE_SSL_CA_FILE, CLIENT_ORIGIN, SUPABASE_URL, CURSOR_SIGNING_SECRET and CRON_SECRET. Cursor and cron values were separately generated from 32 cryptographic random bytes and stored as production-only Vercel sensitive variables; their values are not in Git/output. Frontend public configuration targets the hosted Express API and intended Supabase project with an active modern publishable key. Public Auth settings confirm email authentication, required email confirmation and ES256 JWKS availability. Redirect-email delivery and password recovery completion still require manual/hosted acceptance.

Frontend Auth release `dfe0dcd96f9530ee1f77f09717aefcdcb7e7d6f7`, deployment `dpl_8pbA1eqWrJt2q71jmPEypz2DSS47`, reached READY for expense_tracker. Auth pages moved into a public route group while preserving /v2/login, /v2/register, /v2/forgot-password and /v2/reset-password URLs. The existing global financial preview gate remains in its original V2 layout. /v2/release-check uses real session/profile protection and contains no financial data. Production root redirects to the manual login URL, retiring the old V1 write UI. Local production HTTP verified the five allowed routes return 200 and all ten financial/prototype routes return 404. The application source SHAs above are explicit acceptance points; subsequent documentation-only Git deployments should be checked against the final main SHA rather than treated as new functional acceptance.

Current frontend lint/typecheck/build and all 140 tests passed. Backend lint/typecheck/build and 91 tests passed, with 23 other database-gated tests explicitly skipped; the preceding dedicated domain evidence remains separate. Public hosted sign-in browser verification passed **10 checks, 3 axe audits, zero violations**, no overflow at 360/768/1440, keyboard email-to-password navigation, signed-out release-check redirect, zero runtime exceptions, HTTPS-only traffic and no direct Supabase financial requests. No form credentials were entered. This is Auth-page evidence, not financial-page or authenticated functional acceptance. The credential scanner now also checks ignored backend/.env.local privately and tolerates moved/deleted source paths; source/build scan and diff whitespace checks pass.

Final production read-only reconciliation: **1 transaction, income 9500.00 EGP, expenses 0.00, balance 9500.00**, original fingerprint `434c087400fa7760625c24b75bfc4021`, zero ownership/mapping errors, one zero-opening cash Main Account, one profile, nine system categories, zero transfers/recurring definitions/occurrences. No temporary production-preview financial records were created. Authenticated endpoint/domain tests, A/B isolation, financial responsive/a11y, email/recovery completion, protected processor execution and runtime-log review remain pending the user's manual authentication. Cron remains disabled (crons=[]), with 0 3 * * * prepared only. The isolated local restore server, local production smoke server and signed-out audit browser were stopped; ignored recovery artifacts remain available.

When explicitly resuming the deferred release, obtain a supported controlled authenticated verification path without requesting their password. Complete authenticated API acceptance before opening implemented financial routes, then perform the original hosted CRUD/lifecycle/isolation/cleanup/cron/log gates. Never restore public V1 financial access. Full V2 is not complete; T35 remains deferred and analytics/budgets/goals/categories/settings/reports and later release work remain. T38 was subsequently explicitly authorized and completed as internal queries only.

## Resumption — verified logical application recovery

Administrative access used only BACKUP_DATABASE_URL from ignored backend/.env.local, with libpq verify-full and the packaged CA. psql 17.11 confirmed the intended project/database/admin identity and client TLS 1.3, TLS_AES_256_GCM_SHA384. Pooler server-side pg_stat_ssl reported false for its separate database hop; this is not the client TLS result.

Full-database pg_dump 17.11 completed with exit 0, custom format, source PostgreSQL 17.11. Artifact: ignored `.tmp-v2-t37/production-backups/20261012T115846Z.dump`, created 2026-10-12 11:58:46 UTC, 423887 bytes, SHA-256 `6fa8267d84be92c93ac7a413edec3aea536d3afb440706e7ca3f377eae27dba0`. pg_restore --list confirmed application objects/data plus Auth and migration-history dependencies. No backup or private snapshot is committed.

The archive's complete expense_tracker schema/data, supabase_migrations history and real auth.users table/data/primary key restored into fresh local t37_restore_20261012 on the guarded ignored loopback cluster. pg_restore used --exit-on-error --single-transaction --no-owner --no-privileges and an explicit archive TOC selection, exit 0. No application restore failure was ignored. Provider-managed services/extensions were deliberately excluded from this local application recovery test; a full Supabase platform disaster recovery is not claimed. The full archive is retained. Role definitions/passwords, provider configuration and Storage object bytes require separate recovery handling; privileges/ownership were not replayed locally and must be reapplied from reviewed migration/catalog evidence on a real recovery target.

All nine application tables' complete row JSON matched production exactly, including original IDs, type, exact amount, description, legacy category, date and microsecond timestamps. Column definitions, indexes, functions, triggers and migration-history rows matched. Seventeen CHECK definitions had normal PostgreSQL dump/reparse representation changes (AND association and array cast placement); adding the original CHECK expressions transactionally in the isolated database produced exactly the restored definitions, then rolled back. All remaining constraints matched directly. The legacy fingerprint equals the original `434c087400fa7760625c24b75bfc4021`; count 1, income 9500.00, expenses 0.00, balance 9500.00. Production backup/validation sessions were read-only.

Production now has one confirmed Auth user. The user explicitly designated that sole confirmed account as the historical-data owner during this resumption. No UUID or sensitive identity is placed in Git. Auth user count also matches the restored archive; identity credentials/session contents were not printed. Financial baseline remains unchanged.

At the initial preparation checkpoint, maintenance enforcement was prepared before production backfill. The 2026-10-13 section above records its successful deployment, migration and subsequent permanent V1 retirement.

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
