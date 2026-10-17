# T65 — V1→V2 Migration Dress Rehearsal

**Status: Completed locally, 2026-10-17 (Africa/Cairo).** Starting clean synchronized `main`: `809c9a8f79ec6b8242d444941cbf007caa57d297`. Two clean complete rehearsals passed, with **32 named groups each / 64 total**, exact retained-data reconciliation, real backup/restore, Window A recovery and Window B refusal. No unresolved local cutover blocker remains. **T66 is not started.**

The [operator runbook](production-migration-runbook.md) is preparation for a separately authorized T66. The historical T37 record already describes a production-preview backfill/eight-file schema and V1 retirement, followed by deferred hosted financial acceptance. T65 does not overwrite that history or assume the current hosted database is V1. A future T66 must freshly classify the real state and skip verified applied stages; it must not replay foundations, guess an owner or repeat a completed backfill.

## Scope and disposable environment

Windows, Node 26.5.0, portable PostgreSQL 17.11, official PostgreSQL 17.11 `pg_dump`, `pg_restore` and `psql`; existing locked backend/frontend dependencies and Edge/Chromium. No new dependency/lockfile, application source, production entry, migration, seed, grant contract or frontend financial-gate change.

Each round uses independent fresh UTF8/C-locale clusters under ignored `.tmp-v2-t65/run-N/`: **source**, **restore**, **cutover**, and a separate **window-a** recovery target. A fifth empty **schema-reference** cluster independently applies every tracked file to compare the final catalog. All use only 127.0.0.1:55451/postgres sequentially; they are never active together. The original source remains untouched financially after backup and is reopened for exact independent comparison after the cutover. Completed stopped synthetic clusters are reclaimed after evidence, retaining backups and the final cutover target; no production recovery artifact is removed.

Admin is local password-free postgres. Runtime is the unchanged `expense_tracker_app` role, with synthetic per-round SCRAM credentials and a runtime-specific pg_hba rule. No real hosted token, production user/owner, backup/admin URL, service-role key or provider session is used. A minimal private `auth.users(id uuid)` table and NOLOGIN browser roles model FK/ACL dependencies; they are not a Supabase Auth installation. Real local ES256/JWKS verification authenticates API calls.

The initial retained bundle lacked client tools. PostgreSQL 17.11 clients/DLLs were fetched from the official distributor into ignored storage and versions checked. A partial full-archive download hit the disk limit; it was removed and only required files were fetched. Only verified stopped synthetic T64 cluster files were reclaimed; committed T64 evidence/logs were retained. No tool binary or backup is committed.

## Evidence and source inventory

[Complete sanitized rehearsal results](assets/t65/dress-rehearsal.json), [quality/regressions](assets/t65/quality.json), [browser flow](assets/t65/browser.json), [optimized production gates](assets/t65/production-gates.json), [read-only commands](assets/t65/read-only-inspection.json) and [security/ignore checks](assets/t65/security.json) contain reproducible counts/check names, hashes and synthetic-only metadata. Full row snapshots, credentials, sessions, raw archives and database files stay ignored. No screenshots/private financial data or binary database contents are published.

The source applies the exact two tracked V1 migrations, with no invented financial columns and no production demo seeding. It contains 510 deterministic retained rows, all nine legacy category strings and both Other types; 1900-01-01, leap/year/month boundaries; 0.01 through 999999999.99; Arabic/emoji, quotes/backslash and literal `%_!`; deterministic UUIDs and distinct historical six-digit audit timestamps.

| Immutable V1 measure | Each source / restored / backfilled target |
| --- | ---: |
| Rows |510 |
| Income |51000000030.09 |
| Expenses |5229.03 |
| Balance |50999994801.06 |
| Original-field SHA-256 |`ac53e2da67a60f06ea8078e11102210bf975977ee5fe81761b3dfc02e00a5a35` |

Inventory orders by ID and captures id/type/amount text/description/legacy category/date/created_at/updated_at using session-wide UTC PostgreSQL text, preserving microseconds. It also captures exact SQL totals/category totals, columns/defaults, constraints/validation, indexes, triggers/functions and privileges. An independent BigInt-cent oracle checks money, including sums above the per-input maximum. No amount is reconciled using JS floating point. V1 catalog has8 columns,7 constraints,2 indexes,1 trigger and1 function.

## Real backup and isolated recovery

Each source produces a real custom-format logical archive using `pg_dump`, zero exit/warnings, inspected by `pg_restore --list`. Both pre-V2 archives are 18,246 bytes with 23 TOC entries, including schema, transaction data, constraints/index and timestamp trigger. V1 uses UUIDs and no sequence/identity state; an explicit catalog check confirms this. Role prerequisites are provisioned separately; the archive restores original object ACLs without widening privileges. The recorded archive checksum is rechecked immediately before restoration.

| Round | Conventional SHA-256 of the verified pre-V2 archive |
| --- | --- |
|1 |`963c886b0b857e89affe86a2b003ea464b44271a5d9d4fc081ef8e39d6b0536e` |
|2 |`71c322e28acad490815af39277f216d2e56f5ad33b0f4dfed2287c488dcbbe65` |

`pg_restore --exit-on-error --single-transaction --no-owner` restores each artifact into a second freshly initialized empty cluster, never over source/cutover data. Every original field/row/hash/totals and all required schema/ACL objects match. Missing/corrupt archives, wrong checksum, wrong URL/database, nonempty targets and missing/invalid explicit owner/configuration fail closed. Additional focused guards refuse pre-existing application/Auth/history namespaces or public data. Backup binaries remain ignored.

PostgreSQL dump/reparse flattens associative AND parentheses in `transactions_description_check`. The comparison does not ignore this constraint or rewrite application schema: it recreates the original expression only in a temporary table inside a rolled-back transaction, and requires PostgreSQL's normalized definition to equal the restored definition exactly. Every other catalog field compares directly. The same proof is required when comparing the cutover to the independently migrated empty-schema reference. This is representation normalization, not financial/schema drift.

Database dumps do not include global role passwords or all provider configuration/Storage bytes. This verifies logical application recovery with modeled prerequisites, not full managed Supabase disaster recovery. [PostgreSQL 17 dump](https://www.postgresql.org/docs/17/app-pgdump.html), [restore](https://www.postgresql.org/docs/17/app-pgrestore.html) and [Supabase backup](https://supabase.com/docs/guides/platform/backups) documentation informed these boundaries; the Supabase breaking-change index was checked without contacting a project.

## Maintenance, actual stale process and fail-closed state

A separate Node child runs the retained unauthenticated V1-compatible factory/service with its own pool and the old synthetic credential. Before maintenance it reads 510 rows, matching detail and summary. This is a real local process using the retained legacy implementation, not an actual historical Vercel artifact.

The current application's actual `financialMode: "maintenance"` path then returns no-store503 for all six V1 list/detail/summary/POST/PUT/DELETE cases, V2 financial reads/writes and internal processing. Both health routes remain200. The shared role's financial DML is revoked and all six direct stale-process requests fail without data or sensitive diagnostics. The source inventory remains exact. Missing/ambiguous local cutover modes throw before serving; no automatic ordinary V1 fallback.

Each additive migration and its exact history record commits atomically with financial DML suspended **before COMMIT**, including the T11 file which ordinarily grants runtime CRUD. This avoids a transient stale-role access gap. The unchanged migrations are not rewritten. Later a privileged transaction-only, limited-role SELECT compatibility probe verifies legacy list/detail/summary against migrated data, then rolls its temporary grant back; external old/current financial endpoints remain blocked throughout final backfill.

Public Auth pages/provider login can remain available independently; API financial/profile bootstrap can still report maintenance. Auth availability never enables financial access. The local production Next build confirms four public Auth pages200 and ten financial/Settings/design/account-detail pages404, including debug/bypass query probes. No hosted gate is removed. Cron remains `crons: []` throughout.

## Migration order, owner and categories

The runner discovers/sorts the complete current file list and records conventional file hashes, then uses this staged order:

1. `20261001144302_initial_expense_tracker_schema.sql`
2. `20261003163341_backend_application_role.sql`
3. `20261006132717_v2_core_tables.sql`
4. `20261006132719_v2_transaction_references.sql`
5. `20261006132721_v2_indexes_and_triggers.sql`
6. `20261006132723_v2_runtime_privileges.sql`
7. Separate unchanged T12 category seed, repeated and compared including timestamps.
8. Explicit synthetic owner → actual T13 ensureProfile → unchanged T14 `migrateLegacy`/reconciliation under maintenance.
9. `20261006171715_v2_ownership_constraints.sql`
10. `20261008135130_v2_occurrence_invariants.sql`

Version/name/original SQL history rows are checked exactly. Published file hashes distinguish executed working-tree bytes from Git-canonical bytes where Windows CRLF differs; normalized content matches Git and historical CRLF hashes are explicitly verified. No applied SQL content changed. The final schema is independently reproduced through the tracked chain on empty data:9 financial tables /92 columns /92 constraints /44 indexes /31 user triggers /11 functions, all expected NOT NULL/composite references/checks/indexes/functions/triggers/grants and zero unvalidated constraints. No manual financial-schema correction between files was required; temporary corruption/DDL probes belong only to explicitly rolled-back local fault scenarios.

The operator must explicitly supply canonical synthetic owner and Main Account IDs to this runner. No migration-generated owner default exists. The local FK identity is a fixture; runtime T13 profile creation uses EGP/en/Africa/Cairo/null displayName and cannot read auth.users. The backfill creates exactly one active cash Main Account owned by that identity, EGP, opening0.00 and permanently locked opening/card-conversion semantics after retained activity. It never puts the legacy balance into opening balance or duplicates Main Account. A valid recorded already-mapped state is a no-op; incompatible collision or partial/foreign ownership aborts rather than reassigning rows.

| Legacy | T12 system category | Kind | Fixed ID suffix under `c1200000-0000-4000-8000-000000000` |
| --- | --- | --- | --- |
|salary |Salary |income |001 |
|freelance |Freelance |income |002 |
|gift |Gift |income |003 |
|food |Food |expense |004 |
|transport |Transport |expense |005 |
|shopping |Shopping |expense |006 |
|bills |Bills |expense |007 |
|entertainment |Entertainment |expense |008 |
|other |Other |both |009 |

Unknown values have no Other fallback. Unknown category, incompatible seed name/kind/state, inventory mismatch, missing owner/profile, Main Account collision, conflicting owner and inconsistent partial references stop with complete snapshots unchanged by the attempted backfill. The unknown-category fault temporarily removes V1's category CHECK only on the disposable cutover fixture; the real source remains untouched.

## Preservation, constraints, privileges and V2 acceptance

T14 locks affected tables with bounded timeouts, inserts Main Account, suppresses only the original timestamp trigger inside its transaction, updates only owner/account/category references, restores the trigger, and compares every original field/count/hash/totals/mapping before commit. An injected error after the actual reference UPDATE rolls back references, account creation and trigger state. An idempotent rerun changes zero rows/timestamps. Before T15, readiness is510 total /0 missing /0 invalid references.

T15 rejects intentionally corrupted owner readiness; a fault after its DDL also rolls back all DDL/history while preserving the preceding fully backfilled stage. T15 and T32 then commit unchanged, preserving all original rows. No migrated transfers, definitions, occurrence markers, Budgets or Goals are fabricated; all recurring linkage stays null.

Current V2 under the limited role reads every migrated transaction over six signed pages and representative details/search/filter. Main Account list/detail/summary agree exactly. Dashboard's current-month actuals reconcile; Analytics covers the retained history using five separate annual ranges, each within 366 days, with independently summed mapped category allocations. No transfer/recurring contamination. Database audit timestamps retain six digits; public DTO timestamps keep their existing millisecond serialization contract, while cursor ordering preserves the database microseconds. No API precision contract changed.

Runtime remains LOGIN/NOINHERIT, non-superuser, no CREATEDB/CREATEROLE/replication/BYPASSRLS/memberships/schema CREATE. Actual DDL/TRUNCATE/trigger disabling/role escalation/Auth reads fail. Browser roles lack private schema/table/function access; occurrence DELETE remains absent. This is shared-role + Express owner scoping/composite constraints, not tenant RLS.

After constraint acceptance, the same runtime role receives a new **synthetic local** SCRAM credential; a held old session is terminated. Current V2 gets only the reviewed required grants. The old process still cannot read/write after regrant, a fresh old-password connection fails 28P01, and current limited-role V2 reads/mutations work. No new role split is invented. This rehearses DB-level neutralization rather than assuming new-route410 protects old code. Actual hosted pooler/old-deployment protection must be freshly verified in T66.

S7 controlled read acceptance keeps financial writes 503 and the processor absent. A second synthetic user bootstraps without an account, sees empty accounts/transactions/recurring/zero position and cannot read owner details or filter foreign accounts. JWT metadata cannot override its subject. All new V1 financial routes return410 before legacy service execution.

## Window A and Window B

**Window A:** after full constraints but before any financial V2 user/cron write, the durable guard accepts the exact baseline. The verified pre-V2 archive restores into a separate clean recovery cluster. Exact original fields/hash/totals/catalog, V1-only financial schema and the designated synthetic Auth identity return. Actual V1 create/update/delete works on a new probe, then removing that probe returns the exact original baseline. The original migrated target remains separate and is reopened to continue acceptance. T14's pre-T15 compatibility rollback is separately covered by regression; it is not used to reverse installed T15/T32 constraints.

**Explicit write checkpoint:** after S7 passes, the runner records write-enable before permitting a genuine API expense 0.01. The first committed transaction's database timestamp is recorded in evidence. Main balance becomes 50999994801.05. Normal subsequent updates change updated_at while preserving created_at; every historical microsecond timestamp remains unchanged. Opening-balance and credit-card conversion attempts fail 409.

Controlled writes then add a second account, a neutral 0.10 transfer, an unprocessed recurring definition, a Budget integrating historical/new expenses and a Goal with no balance effect. There remain 511 transactions, exactly one controlled new expense, no occurrence/generated transaction and unchanged income. Exact final income51000000030.09, expenses5229.04, balance 50999994801.05. Cross-user detail/reference/owner injection and direct foreign-account writes fail. Dashboard/Analytics and the independent account/ledger oracle reconcile after these writes.

**Window B:** both direct guard and attempted old-archive restore are refused before any restore process. Complete financial/catalog snapshots stay equal. An old510-row V1 backup demonstrably lacks the new transaction, second account, transfer, definition, Budget and Goal. Write-enable alone conservatively closes A, even if no row subsequently remains. A simulated post-write access/configuration incident re-enters maintenance, denies mutations, captures a current logical preservation backup, then forward-restores controlled reads without modifying any financial record. The new activity and all original history remain. Post-write archives are inspected/checksummed snapshots; their independent restoration is not claimed.

## State machine and failure matrix

The evidence records S0 original V1 →S1 verified backup →S2 all-financial maintenance/old DML suspension →S3 additive schema →S4 reconciled backfill →S5 constraints/no V2 user writes →S6 permanent retirement/stale-config neutralization →S7 controlled read acceptance →S8 explicit controlled write enable/first commit. Later public release/cron eligibility belongs to separately authorized acceptance/T72. The migration never enables writes or cron implicitly.

| Failure point | Result and safe action |
| --- | --- |
|Before/after maintenance | Target/backup/mode mismatch stops progression; establish maintenance and a matching verified frozen backup before schema work |
|After additive schema | Keep all financial access blocked; owner/profile/category/inventory checks reject without partial backfill |
|Mid-backfill | One transaction restores rows/account/trigger; compare exact snapshots before retry |
|After backfill/before constraints | Complete S4 remains; failed T15 preflight/DDL/history transaction leaves no partial constraint state; keep maintenance and retry reviewed correction or Window A restore |
|After constraints, no V2 user write | Window A guard passes; full separate-target restore proves exact V1 recovery |
|After write enable/first financial commit | Window B rejects blind restore; freeze, inventory/preserve current activity and forward-fix/reconcile |

Versioned migration/history transactions, seed, backfill and constraint files have distinct atomic boundaries; deployment/maintenance/credential/session/backup gates are external. A failure does not mean previously committed stages disappeared. The detailed runbook includes mandatory STOP checks and no best-effort continuation.

## Repeatability, timing and reusable commands

The second clean source/backup/cutover has the same510-row original digest, logical pre/post-write totals and final catalog as the first, with no hidden schema patch. Archive bytes/checksums and runtime-created UUIDs/timestamps can differ; each restore verifies its own immutable archive. Per-group timing is published in the result file: backup/restore, additive migration, backfill/idempotency, constraints, reconciliation and recovery are local planning observations, not production guarantees.

| Timed group (includes its validation work) | Round1 / Round2 |
| --- | ---: |
| Dump + TOC/checksum |211 /235 ms |
| Isolated restore + exact comparison |541 /543 ms |
| Four additive migrations + maintenance checks |106 /101 ms |
| Backfill + reconciliation + no-op rerun |104 /104 ms |
| T15/T32 + final readiness/history checks |65 /62 ms |
| Signed V2 read/API reconciliation |799 /777 ms |
| Window A full restore + V1 CRUD verification |898 /1019 ms |
| Post-write preservation/forward-read recovery |348 /336 ms |

`v2-cutover-inventory.mjs` provides deterministic read-only inventory/reconciliation and the local durable Window A/B guard. `v2-cutover-inspect.mjs` makes read-only inventory/reconciliation reusable for T66: explicit expected target/phase/private file and acknowledgment, no dotenv/default connection, rejected URL SSL overrides, verified CA/client TLS outside guarded loopback, repeatable-read read-only transaction, no overwrite of the original private snapshot. Both command phases passed against the final migrated local target. Original510-row digest remains exact while post-write policy explicitly preserves/reconciles the511-row current ledger. No remote handshake/inspection was performed.

To reproduce, build backend from its lockfile, install compatible PG17 server/client tools and provide:

```powershell
$env:T65_DISPOSABLE_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55451/postgres'
$env:T65_MIGRATION_OWNER_ID = '<explicit synthetic canonical UUID>'
$env:T65_MAIN_ACCOUNT_ID = '<explicit distinct synthetic UUID>'
$env:T65_ACK = 'LOCAL_DISPOSABLE_ONLY'
$env:T65_PG_BIN = '<absolute local PG17 server bin>'
$env:T65_CLIENT_BIN = '<absolute local PG17 client bin>'
$env:T65_SOURCE_SHA = git rev-parse HEAD
node backend/scripts/verify-t65-migration-dress-rehearsal.mjs
```

The loopback port must be unused; `.tmp-v2-t65/result.json` and requested PG data directories must not already exist. Preserve prior successful artifacts and use fresh task-owned paths before rerunning; the runner does not overwrite a retained cluster. It stops its servers and reclaims only verified stopped task-owned synthetic clusters after successful independent comparison, leaving final ignored cutover state for optional UI smoke. The local browser helper rechecks the exact final directory and permits only controlled reads. Never substitute a real database URL or remove guards.

## Quality and regression

| Gate | Result |
| --- | --- |
|Two complete dress rehearsals |64 named groups, zero failures; real source/restore/cutover/recovery/reference clusters |
|Focused T65 safety/oracle/inspection tests |5 pass, no skip/failure |
|Backend lint/typecheck/build |Pass; new scripts additionally lint/syntax checked |
|Backend ordinary tests |111 pass,0 fail,28 guarded database wrappers covered separately |
|Fresh T57 matrix |17 suites /57 tests,0 skip/fail; includes T11 schema339, original T14 rehearsal64 and T15 ownership210 checks |
|Fresh T59 |Complete isolation/attack suite passes;156 route-auth,561 owner injection,275 mass assignment,192 timing samples; migrated-owner subset also runs on the actual cutover target |
|Fresh T60 |9445 reconciliation +728 database/backend restart checks, zero failures; independent migrated-dataset reconciliation is part of each dress rehearsal |
|Frontend migrated-target smoke |6 checks across Dashboard/Accounts/Transactions/Analytics + literal search/write gate;4 axe audits,0 violations,0 page errors;25 private API responses no-store |
|Optimized frontend gate smoke |14 Auth/financial route cases pass; no frontend product-source change or full unrelated frontend rerun |
|Relevant T64 checks |Pool TLS/header tests included in backend suite; focused HTTP/security/history/build/source/evidence scan passes |
|Repository/evidence |Diff whitespace, artifact ignore, no tracked backup/private snapshot and finite credential/value checks pass |

Earlier harness corrections concerned Windows inherited subprocess pipes, the expected PostgreSQL CHECK representation and explicitly holding an old session before termination (pool.query discards clients on permission errors). These were verification corrections, not financial/application migration defects. No applied migration was edited or new schema correction introduced. Historical T45 timing artifacts regenerated by regression were restored to the clean starting version.

## T66 readiness, limitations and production boundary

T66 still requires actual verified project/database/admin access and TLS; operator-selected owner/Main Account; fresh production inventory/history/rollback-window classification; a matching verified backup/restore target; maintenance approval/window; exact artifact SHAs and reviewed stage SQL; runtime/public configuration; stale deployment/credential/session/pooler strategy and its live denial proof; explicit controlled-write approval. These are not guessed from synthetic data or historical T37 output. The runbook prepares commands/checkpoints but does not execute them or authorize production.

Local fixed-port/Windows/Edge tests do not certify hosted Supabase Auth, provider-managed schemas, full platform recovery, pooler credential caches, deployment protection, production TLS or load/timing. The read-only inspector's remote TLS path is guard-tested, not remotely exercised. The stale specimen is the retained V1-compatible implementation in a separate process, not a hosted historical artifact. Post-write preservation backups were not independently restored. Public API timestamp serialization remains its frozen contract; SQL/cursor evidence verifies stored microseconds.

No production database connection, administrative credential use, remote Supabase/Auth change, Vercel environment change, deployment, real user creation/write, hosted acceptance, gate removal or cron activation occurred. Only official documentation/tool-download research used the external network. T35/T41/T47/T50–T56 remain deferred. **Next: T66 — Execute Production Migration and V1 Retirement. Do not start automatically.**

## Request coverage index

| Requested items | Coverage |
| --- | --- |
|1–9 |Local-only topology; actual V1 shape/inventory/hash; real dump/TOC/checksum/restore; unsafe target/archive/owner guards |
|10–17 |Explicit owner/profile/Main Account/collision; all V1 maintenance; separate stale process; explicit fail-closed mode |
|18–37 |Discovered ordered files/seed/mapping; exact T14 backfill; fault rollback; T15/T32/catalog; runtime/browser grants |
|38–52 |Complete original fields/count/money/timestamps; Main/Dashboard/Analytics/list/detail/filter; no invented transfers/recurring/occurrences/Budgets/Goals |
|53–66 |Controlled real V2 domains; explicit first write; actual Window A restore; Window B refusal/preservation/forward recovery |
|67–81 |V1410; stale same-role denial after regrant; health/Auth/gates/cron; transaction boundaries; failure/state/abort tables |
|82–93 |Second clean run; explicit guarded automation; inventory/reconciliation commands; prepared runbook and required production-specific inputs |
|94–103 |Fresh security/reconciliation/backend regressions; migrated frontend; legacy pre/post-retirement; unchanged applied migrations/product sources |
|104–118 |Ignored archives/checksums; empty isolated restores; source immutability; synthetic owner/token; new-user privacy; partial/conflicting/no-op states; trigger/ID behavior |
|119–131 |Controlled transaction/transfer/recurring/Budget/Goal; write denial/enable; same-role transition; SHA/retention/post-write/failure policy; placeholder-only commands |
|132–140 |This report/runbook; focused runner/counts; README/plan checkpoint; quality/secret/artifact checks; direct main commit/push |
