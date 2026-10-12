# T14 — Rehearse V1 Data Migration

Local verification on 2026-10-06 (Africa/Cairo). This is a disposable rehearsal, not production migration approval. No hosted data/Auth identities, remote migrations, Supabase push, deployment, frontend change, Accounts CRUD, V1 retirement or T15 constraints were introduced. Existing T11–T13 workspace changes were preserved.

**Status: ✅ Completed.** T01–T14 complete; T15 next and not started.

## Environment and inputs

Fresh portable PostgreSQL 17.11 clusters used only 127.0.0.1:55451, postgres database/admin, local test authentication and ignored `.tmp-v2-t14/` artifacts. A minimal private auth.users UUID table and NOLOGIN browser roles model FK/grant prerequisites; they do not model hosted Auth verification. T14_MIGRATION_OWNER_ID is required explicitly and is inserted only as a synthetic disposable identity by the verification runner. No real owner ID is hardcoded. The utility also takes an explicit operator-recorded Main Account UUID and frozen inventory object.

Connection guards reject remote hosts, other ports/databases/users, URL passwords/options and missing disposable marker. Nothing loads .env or falls back to DATABASE_URL. The runner requires fresh schema/role namespaces and creates a local-only marker. No backfill SQL enters automatic migration history.

The final fixture applies both unchanged V1 migrations, the unchanged three-row V1 seed, ten representative legacy records, all four unchanged T11 files, and the separate T12 category seed twice. All nine legacy strings are represented, with both income and expense Other. Fixtures cover 0.01, 999999999.99, Arabic/emoji descriptions, 1900-01-01/leap-day dates and distinct historical microsecond timestamps. The additive schema/seed are compared against the pre-T11 history. These counts/totals are synthetic test evidence, never production inventory assumptions.

## Owner and Main Account

The synthetic Auth owner exists before controlled T13 ensureProfile creates EGP/en/Africa/Cairo/null-name defaults. Migration preflight requires both owner and correct profile. It never depends on frontend bootstrap and grants no Auth-table access to runtime.

Create exactly one active cash Main Account for that owner, opening_balance=0.00 and opening_balance_locked=true when retained history exists. Opening balance is not the V1 balance, preventing double counting. New users are not automatically given this migration account. A pre-existing account in ownerless state is a collision and aborts, even if name/type look plausible. A rerun reuses only the exact operator-recorded account UUID/state with the complete inventory already assigned; it performs no updates.

## Explicit mapping

The utility contains literal T12 UUIDs; no environment-derived identifiers or unknown-to-Other fallback.

| Legacy string | System category | Kind | Stable UUID suffix |
|---|---|---|---|
| salary | Salary | income | 001 |
| freelance | Freelance | income | 002 |
| gift | Gift | income | 003 |
| food | Food | expense | 004 |
| transport | Transport | expense | 005 |
| shopping | Shopping | expense | 006 |
| bills | Bills | expense | 007 |
| entertainment | Entertainment | expense | 008 |
| other | Other | both | 009 |

The full UUID prefix is `c1200000-0000-4000-8000-000000000`; exact literals are in scripts/seed. Preflight verifies every expected system row's UUID/name/kind/active/unowned state. Both kinds of Other resolve to the same UUID. Legacy category text remains intact and recurring fields remain NULL.

## Transaction, inventory and timestamps

The utility takes ACCESS EXCLUSIVE locks on the affected private tables, with bounded lock/statement timeouts. Before any data mutation it verifies runtime V1 financial privileges are revoked, original write trigger is enabled, owner/profile, quiet V2 domain tables, known compatible categories, full inventory equality, ownership state and account collision rules.

Inventory includes every original id/type/category/amount text/description/transaction date/created_at/updated_at, PostgreSQL exact count/SUM/min/max, legacy category/type groups and SHA-256 of ordered original rows. Timestamps are compared as PostgreSQL UTC text, preserving all microseconds rather than truncating them through JavaScript Date. No money passes through JS floating point or a rounding cast.

Within one transaction, insert Main Account; disable **only transactions_validate_write**; set the three ownership references in place using parameterized explicit mapping; re-enable that trigger; verify count, every original field, digest, exact totals, account balance, owned income/expense/net-savings, category/type grouping and ownership readiness; then commit. FKs/check constraints and unrelated triggers remain active. Any error rolls back account creation, reference changes and trigger state. No session_replication_role, DISABLE TRIGGER ALL, timestamp rewrite or NOT NULL operation is used. See PostgreSQL's [specific-trigger controls](https://www.postgresql.org/docs/17/sql-altertable.html) and [transactional locks](https://www.postgresql.org/docs/17/explicit-locking.html).

## Financial reconciliation

| Measure | Before | After |
|---|---:|---:|
| Retained rows | 13 | 13 |
| Income | 1000001000.59 | 1000001000.59 |
| Expenses | 418.58 | 418.58 |
| Balance / Main Account current balance | 1000000582.01 | 1000000582.01 |
| Minimum amount | 0.01 | 0.01 |
| Maximum amount | 999999999.99 | 999999999.99 |

All original per-row values and exact numeric scale stayed unchanged. IDs/descriptions/type/legacy strings/dates/created/updated timestamps matched byte-for-byte in the machine snapshot. PostgreSQL category/type totals and owner-scoped analytics totals matched. No transfer balance component exists during backfill; opening balance is exactly zero.

## Failure safety and rollback windows

Automated failures cover missing owner, missing profile, changed expected inventory/count, unknown category, mismatched non-null ownership, account collision and system-category drift. Each compares pre/post snapshots to show no partial mutation. Unknown-category injection temporarily removes/recreates V1's category CHECK **only in the disposable harness**, because real V1 ordinarily rejects the row; it proves the migration itself still fails closed. No unknown value is remapped.

A disposable CHECK(category_id IS NULL) fault forces failure after account insertion and trigger suppression. PostgreSQL rollback restores account absence, all references and enabled trigger. The fault CHECK is removed afterward; it is not a T15 constraint or versioned SQL change.

Both successful in-transaction rollback and a committed **window A compatibility rollback** were rehearsed. Window A clears only added transaction references and removes only the recorded migration account, with identical legacy snapshots/totals and restored trigger. T11 schema, reference seed, profile and Auth identity remain. This is not a full production schema/deployment restore or backup certification.

For window B, a new synthetic V2 account/transfer was added. The window A rollback utility refused with V2_WRITES_PRESENT and preserved the new activity. It also rejects changed inventories, custom-category activity, recurring/budget/goal/occurrence rows and additional accounts. After any real V2 user/cron financial writes, retain maintenance/authentication and forward-fix; point-in-time recovery/replay and operator approval remain future production-runbook work. The test does not claim complete production rollback is solved.

## Maintenance and V1 compatibility window

An isolated Express wrapper returned 503 MAINTENANCE for all V1 financial GET/list/summary/detail/POST/PUT/DELETE while health remained public. This wrapper exists only in the rehearsal harness, not application routes. The unchanged V1 app represented a stale deployment. Revoking its existing transaction SELECT/INSERT/UPDATE/DELETE grants made all six direct requests fail safely with generic 500 and no data; no grants were widened. Migration requires this privilege boundary before writing.

Only in the disposable experiment, original T11 CRUD grants were restored to demonstrate old V1 list/summary/historical read/create/read/update/delete still work with retained legacy columns. An old V1 POST produced NULL user_id/account_id/category_id, making readiness fail. The probe was then deleted, restoring the frozen retained inventory, and financial runtime grants were revoked again before final no-op migration verification.

This proves why production maintenance must precede final backfill and neutralize old deployments. Structural V1 compatibility is not authorization to expose migrated/multi-user data. Production blocking/retirement remains later cutover work; no compatibility trigger or real endpoint retirement was added here.

## T15 readiness and privileges

Final SQL readiness found 13 total rows, zero missing references, zero invalid owner/account/category/kind/recurring references. All reference the synthetic owner's exact Main Account and active system categories. Three ownership columns remain nullable; no final constraints/check transition was applied. Readiness is a dataset result, not implemented T15 integrity enforcement.

Runtime could not CREATE/ALTER tables, TRUNCATE, disable the timestamp trigger or alter table ownership. T11 private/browser boundaries remain; no migration/admin privileges were granted. Final rehearsal transaction CRUD grants stay revoked to represent maintenance. This intentionally differs from the separate regression cluster, where unchanged T11 grants permit V1 regression tests.

## Verification and reproduction

Backend build/lint/typecheck passed; both new scripts additionally passed ESLint and node syntax checks. A separate fresh regression cluster passed the 339-check T11 harness and the full serial backend suite including real T12/T13 integration: 39 passed, zero failures; T11/T14 fresh-cluster groups skipped there because they require their own fresh instances. Dedicated T14 tests ran on another fresh cluster. No frontend files changed or unrelated UI suite reran.

Final dedicated T14 run: two tests passed, no skips/failures; **64 database/API checks, zero failures**. Inventory digests differ across fresh synthetic runs because fixture UUIDs/seed creation timestamps are generated anew; the before/after digest within each run is identical. Both regression and final rehearsal clusters were stopped, confirmed by PostgreSQL logs. A bounded scan of the two scripts, test and report found zero recognized secret/private-key/credential-bearing database-URL/JWT patterns; only counts were printed. git diff --check passed. This is a scoped current-file scan, not production or Git-history certification.

1. Build backend using locked dependencies. Initialize a fresh disposable PG17 cluster on 127.0.0.1:55451 with postgres admin/database and local trust auth.
2. For existing regression: set T11_DISPOSABLE_DATABASE_URL and run the T11 test, then unset it; set T06/T12/T13_DISPOSABLE_DATABASE_URL to that same instance and run backend npm test serially. Stop that cluster.
3. Start a **different fresh cluster** on the now-free port. Set T14_DISPOSABLE_DATABASE_URL to its password-free local admin URL and T14_MIGRATION_OWNER_ID to an explicitly chosen synthetic canonical UUID. Run `node --test backend/tests/v2-migration-rehearsal.test.mjs` from root. The test applies V1/T11/T12, creates synthetic FK/profile prerequisites, freezes the inventory and exercises all rehearsal cases. Alternatively run the verification script directly with the same explicit inputs.
4. Stop the disposable cluster. Never combine T14's fresh-schema initialization with the already-migrated regression cluster or point these scripts at retained/remote data.

## Changes

Created backend/scripts/v2-migration-rehearsal.mjs, backend/scripts/verify-v2-migration-rehearsal.mjs, backend/tests/v2-migration-rehearsal.test.mjs and this report. Updated implementation-plan checkpoint and ignored `.tmp-v2-t14/`. No application source, database migration/seed, schema contract, actual environment, runtime credentials, dependency/lockfile or frontend source changed by T14.

No T14 blocker remains. Ready for **T15 — Prepare and Test Ownership Constraints**. T15 is not implemented; production constraint enforcement remains T66 after maintenance/reconciliation gates.
