# Production migration and V1 retirement runbook

Prepared by T65. **Preparation only: this document does not authorize T66, a deployment, remote SQL, credential rotation, public financial access or cron.** T66 requires its own explicit authorization and verified operator inputs. T65 evidence is [the local dress rehearsal](t65-verification.md).

## T66 operational checkpoint — 2026-10-17

**Blocked at the required-input gate; no production operation performed.** The user authorized T66 subject to its STOP conditions. Starting clean synchronized main was `beaf4a0839cdf5b7a3a03b3bbabb53ebd3298f64`. Only a limited runtime connection is configured locally; explicit production administrative recovery access, owner/Main Account mapping, accessible approved backup/recovery target, maintenance window/artifact and stale-deployment strategy are missing. The historical T37 archive is absent at its documented workspace location. Live target/history/catalog, deployed SHAs, maintenance/write/cron gates and rollback window remain unverified. No stage was skipped as already verified; none was replayed. See [T66 checkpoint](t66-verification.md) for evidence and exact resume inputs.

Resume **T66 target verification** after the missing inputs are supplied. Do not infer Window A, restore a historical backup, select an Auth owner, or start T67. This dated checkpoint does not replace the procedure below or turn historical preview claims into current proof.

## Establish the actual starting state

The [historical T37 production-preview record](production-preview-t37-verification.md) says that the eight migrations, owner backfill and permanent V1 retirement were already executed, while hosted financial acceptance was subsequently deferred. **Do not assume production is a fresh V1 database. Do not replay applied migrations/backfill, infer the owner, recreate Main Account, or reuse historical counts/fingerprints as current inventory.**

At T66 preflight, privately verify the intended project, database, operator role, client TLS, migration history, catalog, owners/accounts, financial rows and all reachable deployments. Classify the actual database:

| Observed state | Authorized next path after T66 approval |
| --- | --- |
| Genuine V1 with only the verified V1 foundation applied | Full staged cutover below, after verified backup/restore and maintenance |
| Additive V2 schema with ownerless retained V1 rows | Verify every already-applied file/history/catalog; execute only reviewed missing stages, never replay foundations |
| Valid completed backfill and constraints | Reconcile against retained original inventory and current post-cutover activity; skip applied schema/backfill. Continue only the still-pending authorized deployment/acceptance gates. |
| Conflicting owner, partial references, unexpected financial activity, history/catalog disagreement or unknown baseline | **STOP.** Keep/establish financial maintenance. Obtain an operator-approved recovery/forward-fix plan. No guessed reassignment/history repair. |

The local T65 runner accepts only newly created loopback clusters. It is deliberately **not** a production migration command. Its `migrateLegacy` dependency also retains its original disposable-only guard. Do not remove these guards to make a production command work.

## Required operator inputs and artifacts

Provide privately, without sending secrets in chat or adding them to Git:

- Verified project/database/host and administrative identity; explicit production execution acknowledgment and maintenance window.
- Approved administrative libpq service/password files and CA; a separate limited runtime connection/configuration. Verify `verify-full` and the client connection's TLS result, not only a pooler's separate database hop.
- Fresh complete application inventory, original-row snapshot and its digest; migration history/catalog; current financial-write/rollback-window status.
- Explicit verified intended existing-data owner UUID and recorded Main Account UUID/state. Verify the real Auth identity through the approved provider workflow; never invent ownership.
- Private backup destination, recovery target, retention policy and recorded checksum. Isolated restore target must be empty, separate and positively identified.
- Inventory of every backend/frontend alias, immutable deployment URL, old artifact SHA, runtime credential and active process/pooler session that could bypass maintenance.
- Reviewed maintenance, retirement, V2 backend and frontend artifacts with exact Git SHA. `server.mjs` and local runtime entries currently select `financialMode: "v2"`; there is no undocumented environment switch that turns them into a maintenance deployment.
- Reviewed per-stage privileged SQL/history wrappers and final backfill transaction, based on the verified current inventory and the tested T14 algorithm. These must be concrete reviewable files before permission to execute them. The unknown production state/owner/backup must not be embedded in a generic one-click runner.
- Verified runtime/public Auth configuration, deployment access controls and an explicit controlled-write authorization checkpoint. Keep public financial UI gates and cron closed through the relevant later acceptance tasks.

All connection values remain in ignored/private operator configuration. `*.private-cutover.json` is ignored because it contains complete private row inventories. Backup binaries and current/post-write snapshots must remain outside tracked paths. Do not print passwords/URLs/tokens or paste private output into evidence.

## Ordered command/checkpoint procedure

Commands below are templates for a separately authorized T66 operator session, **not commands executed by T65**. Values in angle brackets and named files are required operator inputs. Use PostgreSQL 17 clients compatible with the verified source. Prefer private libpq service/password files over credentials in command arguments.

### 1. Read-only target, history and artifact preflight

```powershell
$env:PGSERVICEFILE = '<private verified service file>'
$env:PGPASSFILE = '<private password file>'
$env:PGSERVICE = $env:CUTOVER_ADMIN_SERVICE
psql --version
pg_dump --version
pg_restore --version
psql -X --set=ON_ERROR_STOP=1 --command='\conninfo'
psql -X --set=ON_ERROR_STOP=1 --command='SELECT current_database(), current_user, version();'
psql -X --set=ON_ERROR_STOP=1 --command='SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version;'
```

Keep output private. Verify source SHA and the SHA deployed by each actual backend/frontend artifact; a READY status alone is insufficient. Compare history SQL and catalog to the tracked migration inventory, including already-applied files. Verify disabled cron and current financial gates. **STOP on wrong identity, stale source/artifact or unexpected history.**

The reusable read-only inspector requires separately provisioned `CUTOVER_INSPECT_DATABASE_URL` in the process environment; it loads no dotenv and has no `DATABASE_URL` fallback. Supply the expected host/database/user independently and a verified CA file. It refuses URL TLS overrides and requires verified client TLS outside the explicitly guarded disposable T65 case.

```powershell
$env:CUTOVER_INSPECT_ACK = 'READ_ONLY_VERIFIED_TARGET'
$env:CUTOVER_EXPECTED_HOST = '<verified host>'
$env:CUTOVER_EXPECTED_DATABASE = '<verified database>'
$env:CUTOVER_EXPECTED_USER = '<verified operator role>'
$env:CUTOVER_SSL_CA_FILE = '<approved CA file>'
$env:CUTOVER_INSPECT_PHASE = 'inventory'
$env:CUTOVER_PRIVATE_INVENTORY_FILE = '<private directory>/initial.private-cutover.json'
node backend/scripts/v2-cutover-inspect.mjs
```

The command opens a repeatable-read, read-only transaction, writes a new private inventory file without overwriting an old one and prints only counts/totals/digests. Inventory includes every original ID/type/amount/description/legacy category/date/microsecond timestamp plus catalog/privileges. It does not authorize mutation or determine the real owner.

### 2. Create and independently restore a real backup

```powershell
pg_dump --format=custom --file=$env:PRE_V2_BACKUP_FILE
Get-FileHash -Algorithm SHA256 -LiteralPath $env:PRE_V2_BACKUP_FILE
pg_restore --list $env:PRE_V2_BACKUP_FILE
```

Verify zero exit status and review all warnings. Record private artifact identity/timestamp/coverage/checksum. Dumping one database does not include global role definitions/passwords, provider configuration or Storage object bytes; retain separately reviewed recovery handling for those dependencies.

Switch the **separate operator service** to the positively identified empty isolated restore target. Provision only reviewed role/dependency prerequisites, never overwrite the source, and inspect the complete archive before selecting any application recovery subset required for managed Supabase objects.

```powershell
$env:PGSERVICE = $env:ISOLATED_RESTORE_SERVICE
psql -X --set=ON_ERROR_STOP=1 --command='SELECT current_database(),current_user;'
pg_restore --exit-on-error --single-transaction --no-owner --dbname=$env:ISOLATED_RESTORE_CONNECTION $env:PRE_V2_BACKUP_FILE
```

`ISOLATED_RESTORE_CONNECTION` must be a nonsecret verified service connection descriptor, not a password-bearing URL. No `--clean` against a retained database. Confirm the archive checksum is unchanged, exact row/ID/money/date/timestamp equality, all required schema/index/trigger objects, and intended grants/role ownership. UUID-based V1 has no sequences; verify actual source sequence requirements rather than assuming this for a different schema.

For CHECK-expression text differences, reproduce the original expression through PostgreSQL's parser in a temporary table/rolled-back transaction and require exact normalized output. Do not strip parentheses, ignore constraints or alter real application CHECKs just to make comparison pass. T65 does this for PostgreSQL's associative-AND normalization.

**STOP if restore fails or any unexplained catalog/row/totals difference remains. A dump file or transaction rollback alone is not backup proof.** Return the service to the explicitly reverified source afterward.

### 3. Freeze every financial access path before any final schema/backfill work

Deploy only the separately reviewed maintenance artifact when T66 explicitly authorizes it. Its actual entry must select the tested `createApp({financialMode: "maintenance", ...})` behavior. Verify current and direct/stale-deployment V1 list/detail/summary/create/update/delete cannot reach financial services. V2 financial access and internal processing must also remain blocked. Both sanitized health routes may stay public; public Auth pages/provider login can remain available without financial access.

Use the verified admin service to suspend the old shared role's financial DML as needed:

```sql
BEGIN;
REVOKE SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA expense_tracker FROM expense_tracker_app;
COMMIT;
```

Verify effective privileges and real old HTTP/direct-client attempts, not only frontend navigation. Missing/ambiguous cutover configuration must never select ordinary V1 mode. Capture the final frozen inventory in a **new** private file. Compare it with the restored backup snapshot; if rows changed since backup, take and independently restore a fresh frozen-source backup before continuing.

**STOP if any V1 financial read/write succeeds, any unauthenticated V2 access succeeds, health exposes secrets, a writer/cron remains active or the backup no longer matches the frozen source.**

### 4. Apply only the verified missing stages

The current tracked order is:

1. Existing V1 foundation `20261001144302`, role `20261003163341` — verify; never replay against an existing production schema.
2. Missing T11 additive files, ordered: `20261006132717`, `20261006132719`, `20261006132721`, `20261006132723`.
3. Repeatable `supabase/seeds/v2-system-categories.sql`; validate all nine fixed IDs/name/kind/active/unowned values. Unknown legacy categories or seed drift abort.
4. Explicit owner verification and T13 profile defaults; atomic zero-opening cash Main Account/backfill under maintenance, preserving original fields. Use the tested T14 account-collision/idempotency rules.
5. Exact row/count/money/date/timestamp/ownership/category reconciliation before constraints.
6. Missing T15 `20261006171715` ownership constraints, then T32 `20261008135130` occurrence invariants.

Discover the current file list at execution time and review any additions; do not blindly assume this historical list is exhaustive. Do not run `supabase/seed.sql` against retained production data; it is a V1 demo seed.

Each reviewed migration wrapper must atomically execute the original file body and its exact version/name/SQL history record. Preserve maintenance by revoking newly granted financial DML **inside that same transaction before COMMIT**. Running the original runtime-grant migration and revoking in a later transaction creates an unsafe access gap while stale deployments remain reachable. No migration-history repair, schema push, suppressed error or casually edited applied file.

```powershell
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_ADDITIVE_STAGE_SQL
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_CATEGORY_SEED_SQL
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_OWNER_PROFILE_BACKFILL_SQL
```

The final backfill file requires explicit verified owner/account IDs and frozen inventory; takes bounded locks/timeouts; refuses missing profile, unknown/kind-incompatible categories, ownership conflicts, partial assignment or incompatible Main Account; suppresses only the original timestamp trigger inside its transaction; updates only the three references; restores the trigger; compares every original field/count/totals/mapping before COMMIT. Failure restores rows/account/trigger state. Profiles are provisioned through the approved T13 path without granting the runtime Auth-table administration.

The inspector verifies migration owner/profile/Main Account, fixed categories, complete original rows and expected totals without mutation:

```powershell
$env:CUTOVER_INSPECT_PHASE = 'reconcile'
$env:CUTOVER_PRIVATE_INVENTORY_FILE = '<private directory>/frozen.private-cutover.json'
$env:CUTOVER_MIGRATION_OWNER_ID = '<verified UUID>'
$env:CUTOVER_MAIN_ACCOUNT_ID = '<recorded UUID>'
Remove-Item Env:CUTOVER_POST_WRITE_POLICY -ErrorAction SilentlyContinue
node backend/scripts/v2-cutover-inspect.mjs
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_T15_STAGE_SQL
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_T32_STAGE_SQL
node backend/scripts/v2-cutover-inspect.mjs
```

**STOP on any missing/null/mismatched owner/account/category, row or money drift, timestamp change, unvalidated constraint, role mismatch or unexpected V2 activity.** A constraint failure leaves the prior complete stage committed; stay in maintenance and either retry a reviewed forward correction or use Window A recovery. Do not guess repairs.

### 5. Permanently retire stale V1 access before restoring V2 authority

Current protected V2 endpoints still depend on a shared SQL role. Regranting that same role while an old deployment retains a usable credential/session can re-enable unscoped V1 SELECT, even though new V1 INSERT fails NOT NULL constraints.

Require an independently verified retirement strategy: remove/protect every old artifact/alias/direct deployment, or an approved same-role runtime credential rollover with updated V2 private configuration and termination of stale runtime sessions. T65 rehearses the latter using synthetic SCRAM credentials; it does not certify hosted pooler/session-cache behavior. Do not invent a production role split or assume a password update alone terminates existing sessions.

Only after current V2 identity/configuration and stale-process denial are proven, restore the exact reviewed required V2 grants. Preserve no DELETE/TRUNCATE on occurrences, no DDL/admin/Auth access, no browser private-schema access and no broad future-object grants.

```powershell
psql -X --set=ON_ERROR_STOP=1 --file=$env:REVIEWED_RUNTIME_REGRANT_SQL
```

Require real old-credential/client/deployment read/write denial **after** regrant, while current limited V2 operations work. New backend V1 financial paths must return410 before service execution. **STOP if stale access succeeds.** Frontend404 alone is insufficient backend protection.

### 6. Controlled read acceptance, then explicit first-write checkpoint

Deploy/verify the separately authorized T67/T68 artifacts under controlled access. Preserve financial write denial until the operator authorizes the controlled-write checkpoint; T65's local dispatcher is a test helper, not an installed production write gate. The production strategy must provide a reviewed real backend/deployment control and direct-request denial, not a query/localStorage flag.

Read-only acceptance must reconcile Main Account list/detail/summary, all paginated original transactions, representative search/filter and Dashboard/Analytics/category totals. A second controlled user must see empty finances and foreign resources404. Validate constraints, limited grants, verified TLS, ES256 issuer/audience, no-store, health and permanent V1 retirement. No cron.

Record write enable **before** permitting controlled financial mutation. Record the first committed V2 user/cron financial write and its exact accounting effect. This includes controlled production acceptance writes, not merely later public release. From this point, treat recovery as Window B even if a test row is later deleted. The local guard conservatively closes Window A as soon as write-enable is recorded.

Do not automatically release public financial UI or enable cron when a migration command finishes. Public release still depends on the explicitly authorized T69–T71 acceptance gates; T72 owns cron activation. T65 starts none of those tasks.

## Rollback and failure decisions

| Failure/checkpoint | Durable state | Safe action | Window/risk |
| --- | --- | --- | --- |
| Before verified maintenance | Original V1 may still change | Stop progression; fix recovery/maintenance evidence; refresh backup if inventory changed | No cutover yet; stale backup may omit later V1 writes |
| After maintenance, before schema | Frozen original V1 | Keep maintenance; correct operational issue or restore only a verified original baseline | A, no V2 user writes |
| After additive schema | Nullable refs/empty new domains | Keep all writers blocked; reviewed retry or clean-target verified application restore | A; do not enable V1 over partial multi-user state |
| Mid-backfill | Transaction rolls back account/references/trigger changes | Compare exact snapshot and trigger state; investigate and rerun only after correction | A; no half-owned dataset accepted |
| After backfill, before/failed constraints | Complete reconciled backfill; failed DDL/history transaction rolled back | Keep maintenance; reviewed forward retry or Window A clean-target recovery | A; do not assume earlier committed stages rolled back |
| Constraints complete, no financial V2 writes | Valid migrated baseline | Guard Window A, restore verified pre-cutover application backup to a separate clean target; reconcile schema/rows/totals/trigger/grants and preserve Auth identities | A; V1 reopening valid only for original shared/demo-only baseline |
| After any controlled/public/cron financial V2 write or write-enable uncertainty | Original history plus new V2 activity | Block writes; capture current complete snapshot/backup; inventory all new owners/accounts/transactions/transfers/categories/occurrences/budgets/goals; forward-fix or explicitly reconcile/replay recovery | B; blind V1 restore/deploy forbidden |

Window A in-place compatibility reversal from T14 is limited to its pre-T15 additive stage. Do not run it through installed T15/T32 constraints; the full post-constraint rehearsal uses an actual clean-target backup restore. Never automatically delete newly created Auth users as part of financial rollback.

Window B: retain authentication/maintenance, capture a current preservation artifact before a forward fix, and reconcile every subsequent write afterward. A pre-cutover backup remains historical recovery input; it is not a blind restore target. Recovery/replay or acknowledged data loss requires explicit operator approval. A maintenance/restart/configuration repair must not erase financial data.

## Cutover states and transaction boundaries

| State | Required evidence before advancing |
| --- | --- |
| S0 normal V1 | Verified actual source/state; no guessed replay |
| S1 backup verified | Real dump checksum + isolated exact restore |
| S2 maintenance | Every V1/V2 financial bypass closed; stale role DML suspended; final frozen backup/inventory agree |
| S3 additive schema | Exact missing file/history transactions; runtime remains suspended |
| S4 backfilled | Explicit owner/profile/Main Account; every original field and aggregate equal |
| S5 constrained | T15/T32/catalog/privileges validated; no financial V2 writes |
| S6 retired | V1410 plus old credential/session/deployment denial after reviewed regrant |
| S7 controlled read acceptance | Real protected reads/isolation pass; financial writes remain denied |
| S8 controlled write enabled | Explicit operator checkpoint; first commit recorded; Window B applies |
| Later cron eligibility | Separately authorized acceptance/public release and T72; not part of T65 |

Backup/restore, artifact deployment/access protection, credential rollover and approval are external operational gates. Each versioned migration/history wrapper is a separate atomic DB transaction; the seed is separate; the T14 Main Account/backfill/trigger restoration/reconciliation is one transaction; T15 and T32 are separate atomic DDL steps. The overall cutover is not one rollbackable transaction.

Retain pre-migration backup and recovery/deployment artifacts through controlled acceptance according to operator retention policy. After V2 writes, retain both original and current preservation evidence; never delete a production backup merely because schema migration completed.
