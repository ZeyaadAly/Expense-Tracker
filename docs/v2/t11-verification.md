# T11 — Prepare V2 Additive Schema Migrations

**Status:** ✅ Completed — 2026-10-06. T01–T11 complete; T12 next, not started.

## Scope and migration files

Prepared stage A/B only. No remote database was contacted, no production data changed, no ownership backfill or real profile provisioning occurred. Existing V1 migrations and seed were left unchanged. Supabase CLI 2.119.0 generated the filenames after help/version inspection; files are atomic BEGIN/COMMIT migrations.

| Migration | Purpose |
|---|---|
| `20261006132717_v2_core_tables.sql` | Eight empty P0 tables, basic checks/FKs, initial browser-role revocations |
| `20261006132719_v2_transaction_references.sql` | Five nullable transaction columns and simple RESTRICT FKs |
| `20261006132721_v2_indexes_and_triggers.sql` | V2 timestamp/date functions, nine new triggers and 26 explicit query/FK/unique indexes |
| `20261006132723_v2_runtime_privileges.sql` | Explicit private-schema revocations and limited runtime grants |

New tables: profiles, accounts, categories, transfers, recurring_transactions, recurring_occurrences, budgets, goals. Existing transactions remain in the same private expense_tracker schema. Final catalog: **nine tables, 42 indexes including PK/UNIQUE indexes, ten application triggers** (the original transaction trigger plus nine new triggers). No balance/spent materialization, notification/history/preferences table, search extension or seed was added.

Notifications and goal history are P1 and deferred according to database §3 and T11a. Recurrence anchors derive from start_date, so independent day_of_month/day_of_week columns are absent per frozen §§17–18. Budgets use the frozen NOT NULL threshold/default 90 rather than the request's provisional nullable suggestion. Accounts include opening_balance_locked=false for later permanent locking.

## V1 compatibility and ownership staging

All eight V1 columns retain their original types, nullability and defaults. Six original checks, PK, both indexes, transaction-date/ID/timestamp write trigger and its function definition remain identical. Legacy category stays required with its existing compatibility check; transaction_date is not renamed. Existing INSERT/UPDATE column lists still work because new fields have no defaults or NOT NULL requirements.

Added nullable user_id, account_id, category_id, recurring_transaction_id and recurring_occurrence_date. Simple owner/account/category/definition FKs accept legacy nulls. Every pre-migration legacy row retains null references after application; migrations perform no UPDATE/INSERT/backfill against transactions. New tables require owners (except system categories) and use RESTRICT references to auth.users. Empty categories/profiles remain valid.

New transfers, recurring definitions, occurrence definition references and optional goal account references use composite same-owner account/definition FKs now; they have no legacy rows to invalidate. Existing transaction composite ownership enforcement remains deferred.

**T15 after T12 mapping/T14 rehearsal:** reconciled transaction ownership NOT NULL, composite transaction owner FKs, category kind/ownership/active-parent integrity, ownership immutability, account opening-lock/lifecycle enforcement and legacy-category compatibility transition. Generic T11 timestamp triggers only preserve IDs/created_at and maintain updated_at; they do not claim to enforce domain lifecycle or owner immutability.

**T32 before the processor:** paired generated fields, generated-pair uniqueness/occurrence FK, terminal occurrence transition restrictions and generated-link same-owner/definition/date triggers. T11 supplies ledger uniqueness, state checks, same-owner definition FK, unique generated link and its ON DELETE SET NULL behavior. T11 is structural preparation, not a safe recurring processor or complete cross-user resource authorization system. No V2 financial writes may be enabled against a still-public V1 deployment.

## Money, dates and timestamps

All seven persisted monetary columns use unrestricted NUMERIC and explicit scale <= 2/range checks. Positive amounts/targets are 0.01–999999999.99; saved amount is 0.00–999999999.99; opening balance is ±999999999.99. No NUMERIC(p,2) cast/typmod can silently round excess precision. Direct tests reject 1.230, 1.234, out-of-range values, NaN and infinities and accept exact boundaries. Goal saved amount may exceed target; completed requires saved >= target.

Numeric storage does not preserve lexical forms such as a negative zero, exponent or leading zeros; later V2 API validators must reject those input strings before SQL, following the existing V1 pattern. No claim is made that NUMERIC alone enforces input syntax.

DATE checks cover 1900-01-01–9999-12-31 where applicable and reject infinities. Existing V1 manual/generated transaction dates retain the Cairo-today write trigger. Transfers get a separate Cairo-today trigger; recurring definitions/goal targets permit future dates. Recurring end/next date ordering and null next occurrence for inactive/exhausted schedules are supported. TIMESTAMPTZ audit fields use database statement timestamps. One generic SECURITY INVOKER timestamp function serves all eight new tables, preserving created_at on update and rejecting changed IDs; a second small invoker function validates transfer dates. Both fix search_path to pg_catalog and are revoked from browser roles.

## Privileges and Data API boundary

Runtime keeps LOGIN/NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS with no memberships or schema/table ownership. It receives schema USAGE and SELECT/INSERT/UPDATE/DELETE on ordinary domain tables; recurring_occurrences receives **SELECT/INSERT/UPDATE only**, never DELETE. Only the three required trigger functions receive EXECUTE. UUID defaults require no sequences. No runtime grant on auth schema/users, schema CREATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN or migration/role administration is added.

Schema/table/function/sequence privileges are explicitly revoked from PUBLIC, anon and authenticated. Per-executor schema defaults are tightened, but PostgreSQL schema-level defaults cannot override global defaults; explicit revokes remain mandatory in future migrations, particularly function creation. There are no automatic runtime grants to future tables. Tests verify effective grants, real denied SQL and safe future-table defaults on this fresh cluster.

Local supabase/config.toml remains unchanged: exposed schemas public/graphql_public; extra search paths public/extensions; expense_tracker excluded. Browser roles cannot use the schema/read tables/execute functions. No RLS activation or browser-facing policy was added, consistent with T02. Hosted Data API dashboard settings were not inspected or changed; local config/catalog checks do not certify remote settings.

## Disposable verification

Portable **PostgreSQL 17.11** ran only on IPv4 loopback port **55451**, using ignored `.tmp-t11/` data/tool directories. No Docker or hosted Supabase was needed. `verify-v2-t11-database.mjs` guards explicit T11_DISPOSABLE_DATABASE_URL host/port/database/admin username and requires a fresh app/Auth/role namespace. It never loads backend/.env or falls back to DATABASE_URL. A minimal auth.users UUID table and NOLOGIN anon/authenticated roles model FK/ACL prerequisites; this is not a real Supabase Auth server. No passwords, keys, production identities or database credentials were introduced.

The test applies unchanged V1 migrations/seed, adds two synthetic retained-data fixtures (maximum income and exact-cent Unicode expense), snapshots all original IDs/fields/timestamps/totals/catalog definitions, rehearses T11 inside a transaction and rolls it back, verifies the original catalog/rows, then commits the exact four versioned files. Seed repetition remains duplicate-free. Baseline fixture totals: five rows, income 1000000999.99, expenses 296.35, balance 1000000703.64. These are test fixtures, not an assertion about current production inventory.

**Final migration harness: 339 checks, zero failures.** Coverage includes original row/catalog/totals preservation, all nullable legacy fields, empty new tables, unrestricted numeric types/boundaries/rejections, future recurrence, defaults/enums/ranges/name uniqueness, same-owner FKs, duplicate occurrence/budget rejection, ledger state checks and generated deletion retention, timestamp/ID behavior, identity/parent RESTRICT, all table privilege combinations, denied DDL/TRUNCATE/role changes/auth reads/trigger disabling, browser-role denial and actual unchanged V1 service CRUD/list/summary under the limited role.

The first trial caught only a test-harness issue: CREATE DATABASE must be checked outside a transaction to reach privilege validation. It was corrected, and final verification used a fresh cluster. No production workaround or schema weakening was needed.

Backend **build, lint and type-check passed**. Full serial backend suite against the final migrated disposable schema: **33 passed, zero failed; one fresh-cluster T11 test skipped because it already ran separately and cannot reapply to that cluster**. All four previously skipped V1 database groups ran and passed, covering real HTTP/service CRUD, exact totals/dates/timestamps and reconnection. T09 cryptographic middleware and T10 frontend-transport integration also passed.

The three legacy integration test files now use administrative DELETE for fixture reset instead of single-table TRUNCATE. The new incoming occurrence FK makes single-table TRUNCATE illegal even when the ledger is empty. This changes only disposable test cleanup; application SQL/HTTP/V1 behavior and runtime denied-TRUNCATE checks remain unchanged.

No frontend source changed and no visual/browser suite was rerun. Financial fixture pages and approved UI remain unchanged. `git diff --check` passed. A bounded scan of T11 migrations, runner, test and documentation found no credential URLs, key/private-key literals or role-password statements; only counts were reported.

## Reproduction and rollback boundary

Build backend. Start a fresh standalone PG17 cluster bound to 127.0.0.1:55451 with database postgres and local test authentication. Supply its password-free administrative connection privately through T11_DISPOSABLE_DATABASE_URL, then run `node --test backend/tests/v2-schema.test.mjs` from repository root. Do not reuse a retained cluster or an already-applied T11 cluster. The runner creates fixture schemas/roles, tests transactional reversal, applies versioned SQL and leaves migrated structure available. Unset T11_DISPOSABLE_DATABASE_URL; set T06_DISPOSABLE_DATABASE_URL to that same disposable instance and run backend npm test serially. Existing V1 integration tests intentionally reset test transactions. Stop only the created test cluster when finished.

Transactional reversal was verified before any V2 financial writes and restored exact V1 catalog/rows. No production down migration or destructive rollback was attempted. After committed V2 financial writes, do not drop new tables/columns or restore public V1: retain maintenance/auth protection and follow the frozen forward-fix/reconciliation runbook. Production A–E application remains T66 under maintenance; T11 files must not be pushed to the retained project now. The local test cluster was stopped after verification; ignored test artifacts remain available.

## Changes and next task

Created four migrations, `backend/scripts/verify-v2-t11-database.mjs`, `backend/tests/v2-schema.test.mjs` and this report. Updated disposable reset SQL in `backend/tests/delete.test.mjs`, `t12.test.mjs`, `transactions.test.mjs`, implementation-plan checkpoint and README migration workflow. Corrected the stale/malformed T10 checkpoint while updating the plan. No application source, dependencies/lockfiles, actual environment files, V1 SQL baselines, seed or Supabase config was changed by T11. Existing workspace changes from prior tasks were preserved.

Frozen database design is unchanged; no database-design amendment was needed. The current Supabase changelog was checked, including the [PG17.11 breaking-change note](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes); these migrations do not use its affected ltree/GiST/encryption/custom-operator features. SQL behavior was checked against [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), and portable binaries came from [EDB's official archive](https://www.enterprisedb.com/download-postgresql-binaries).

No T11 blocker remains. Ready for **T12 — Add Default Category Seed and Early Category Reads**. T12 seed/endpoints were not implemented; all new tables remain unseeded outside rolled-back test fixtures.
