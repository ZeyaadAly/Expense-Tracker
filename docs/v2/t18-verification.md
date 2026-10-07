# T18 — Build Account Balance Queries

**Status: ✅ Completed locally on 2026-10-07 (Africa/Cairo).** T19 remains unstarted. No frontend integration, V2 transaction CRUD, transfer API, dashboard/analytics endpoint, remote DB/Auth access, deployment or production migration occurred. V1 behavior, existing schema/migrations and runtime privileges are unchanged.

## Authoritative model and query architecture

Asset current balance = opening + income − expenses + incoming transfers − outgoing transfers.

Credit-card debt = opening + expenses − income + outgoing transfers − incoming transfers. Positive means debt; negative means credit/overpayment. Opening is included once. Net position = sum(asset balances) − sum(card debt), including archived accounts and negative balances. All-history balances have no period/date filter or zero clamp.

`backend/src/services/account-balances.ts` owns the only production account-balance formula. It exposes getAccountBalance(userId, accountId), getAccountBalances(userId, optional status) and getNetPosition(userId). Account reads return typed full public resources extending AccountBalance; net position returns `{netPosition: decimalString, currency: 'EGP'}`. No internal deltas/owner columns escape the explicit mapper.

One parameterized CTE statement scopes accounts by owner and optional ID/status. Posted transaction deltas group by account. UNION ALL turns transfer source/destination into signed entries, then groups by account. Separate one-row-per-account aggregates join onto openings, avoiding transaction×transfer multiplication. Resources and net position share the same CTE; the final net-position projection applies card debt inversion. No SQL appears in routes, no money is calculated in JavaScript, and no schema object/mutable balance/cache is added.

Current transactions/transfers have no draft/pending status: all persisted owned rows count. Recurring definitions and occurrence rows never count by themselves; a generated persisted transaction counts once. Deleted generated rows cease affecting balance while their durable posted markers remain. Pending, failed and skipped reservations have no financial effect.

## Account integration and exact money

T17's correlated projection was removed. List/detail plus create/PUT/archive/restore response reads use the repository. Mutation reads use their checked-out transaction client; ordinary reads use the pool. Existing created_at ASC/id ASC order, active default/archived filter, ownership hiding, resource shape and timestamps are preserved. Net position is an internal reusable operation, not a new HTTP endpoint.

NUMERIC SUM/arithmetic remains in PostgreSQL. The mapper normalizes numeric text with the existing string-only formatDecimal helper. Inputs retain frozen bounds, but derived balances/net positions are unrestricted two-decimal strings. Tests prove 0.10 + 0.20 = 0.30, negative -0.30, positive 2000000000.08, negative -2000000000.18 and negative net position -1999999999.98 without float artifacts or exponent notation.

Opening-only fixtures cover positive/negative/zero assets, all five asset families, debt/overpaid/zero cards. Income-only, expense-only and mixed transaction/transfer fixtures verify unclamped results and guard join multiplication. Corrections and deletes immediately recalculate balances. Queries do not mutate openings, locks, timestamps or history.

## Transfer and net-position fixtures

For source opening 200.00, destination opening 100.00 and transfer 25.00:

| Transfer | Source balance | Destination balance |
|---|---:|---:|
| Asset → asset | 175.00 | 125.00 |
| Asset → card | 175.00 | 75.00 debt |
| Card → asset | 225.00 debt | 125.00 |
| Card → card | 225.00 debt | 75.00 debt |

Both ends are asserted, net position is invariant, and independently queried income/expense totals remain unchanged for each transfer. Transfer rows are direct disposable fixtures; no T26 implementation was added.

A separate four-account fixture contains bank 100.00, negative cash -20.00, card debt 40.00 and overpaid card -10.00: net position exactly 50.00. Payment preserves net worth; subsequent income 0.10 and expense 0.20 produce 49.90. Archiving debt/credit/negative accounts preserves 49.90. A user with no accounts returns 0.00. A card fixture explicitly checks purchases, refunds, payment beyond debt and outgoing cash advance. Archives/restores preserve balances and net worth; archived list filtering changes membership only.

## Isolation, snapshots and concurrency

Fresh synthetic owners use actual limited-role PostgreSQL and T09 ES256/JWKS Account API. Repository list/detail and HTTP resources agree exactly for each owner's active/archived accounts. Independent admin SELECT verifies expected owned IDs/order, without reusing production balance SQL. A/B net positions stay separate, including a large foreign card fixture. Foreign and missing repository IDs return the same 404 NOT_FOUND behavior; actual foreign Account GET returns 404. Output keys contain no ownership or internal aggregate columns.

Complete financial snapshots before/after read-only queries prove no row/timestamp changes. Separate runtime writer and pooled reader connections verify uncommitted transaction/transfer changes are invisible, committed transaction changes appear on the next read, and one account-list statement sees both committed transfer ends together. A transaction containing both expense and transfer rolls back without balance drift. Reads add no row locks or retries. PostgreSQL READ COMMITTED statement snapshots underpin this behavior; see [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

The T16 runner invokes T17 account verification, then T18 balance verification. Original 599 T16 and 263 T17 grouped checks pass, followed by 191 T18 checks. T17 still verifies opening/type locks, owner injection, four forced locking races, two archive rollback faults and all endpoint error envelopes. Counts are grouped helper checks, not individual HTTP operations/assertions. Other unbuilt domain API matrix cells remain deferred.

## Migrated V1 reconciliation

The existing guarded T15 verifier still runs the unchanged T14 history: 13 retained transactions, income 1000001000.59, expense 418.58, historical balance 1000000582.01. Its final Main Account check now executes the production repository as expense_tracker_app rather than a separate verifier balance formula.

Main opening is 0.00. List currentBalance, detail currentBalance and netPosition are exactly **1000000582.01**. Original inventory/digest/timestamp checks still pass. This demonstrates no migrated-history double counting, no fixture rewrite and no financial drift. The extended T15 run has 210 checks (207 original plus 3 repository reconciliation assertions), with 64 T14 checks, zero failures. Legacy V1 reads succeed; ownerless V1 POST still fails as intended. No legacy handlers changed.

## Performance and runtime review

Each repository operation makes one driver query; list never performs a query per account. A counting wrapper around the real driver asserts this. Existing owner/order/account/FK indexes are retained; no speculative index or grant change is required.

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on the actual captured production list statement used 27 scoped accounts and an additional 5,000 transactions/2,000 transfers. The local PostgreSQL 17.11 plan used grouped aggregates/hash joins and no correlated SubPlan. Measured execution 4.287 ms, planning 12.785 ms. These are one synthetic local sample, not a hosted performance guarantee. Sequential scans are appropriate in this fixture where one owner represents most activity; deployment-volume/selectivity tuning remains evidence-driven.

Plan fixture setup/ANALYZE uses local admin inside a disposable transaction; execution uses SET LOCAL ROLE expense_tracker_app and rolls back all added financial rows. Actual repository correctness/isolation tests use the real runtime pool. No role receives extra privileges. Existing T16 denied DDL/TRUNCATE/escalation/browser-schema checks remain passing.

Reviewed the Supabase Postgres best-practices N+1/index/EXPLAIN rules. CTE behavior was checked against [PostgreSQL WITH documentation](https://www.postgresql.org/docs/17/queries-with.html). The markdown changelog fetch was unsupported; the [Supabase breaking-change index](https://supabase.com/changelog?types=breaking-change) was checked instead. This task uses plain PostgreSQL SQL and adds no Supabase API/extension/schema dependency. The existing private-schema/Express authorization architecture is preserved.

## Quality, disposable boundaries and reproduction

- Backend lint, typecheck and production build passed. Build required approved sandbox escalation to overwrite generated dist files. Explicit ESLint for both modified verification runners passed.
- Full backend suite on a fresh T18 cluster: **53 tests, 42 passed, 0 failed, 11 environment-gated groups skipped**. T18 runs all T16/T17 checks internally; their separate fresh-init test groups are deliberately unset.
- Separate fresh migrated T15/T14 suite: **2 tests passed**, 210 + 64 checks, no failures/skips.
- Git whitespace review passed. No frontend/shared frontend source or dependency/lockfile changed, so no frontend suite was required.

Only password-free local PostgreSQL 17.11 clusters under ignored `.tmp-v2-t18/` on 127.0.0.1:55451 were used. Existing guards reject remote hosts/credentials/options/used schemas; no .env/DATABASE_URL fallback. Account cluster sequence remains V1 → T11 → T12 seed → T15 → synthetic users/profile bootstrap → T16/T17/T18. The migration cluster uses the existing T14/T15 guarded rehearsal. All clusters started for T18 were stopped. Production is not applied.

Build backend, initialize an empty guarded loopback cluster and set only T18_DISPOSABLE_DATABASE_URL explicitly, then run `npm.cmd test` or `node --test tests/v2-account-balances.test.mjs`. T16 or T17 fresh-init runners also execute the T18 extension; do not set several such gates against one cluster. Run T15_DISPOSABLE_DATABASE_URL on a different empty cluster for migrated-history verification. Stop both after use.

## Changes and next task

Created backend/src/services/account-balances.ts, backend/tests/helpers/account-balances.mjs, backend/tests/v2-account-balances.test.mjs and this report. Updated backend/src/services/accounts.ts, backend/src/types/account.ts, backend/scripts/verify-v2-isolation.mjs, backend/scripts/verify-v2-ownership-constraints.mjs, .gitignore, database/API design, implementation plan and T16 matrix. Earlier T16/T17 workspace changes are preserved.

No genuine blocker remains. Ready for **T19 — Build Accounts Page**, which is not implemented.
