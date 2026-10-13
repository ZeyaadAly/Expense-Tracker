# T43 — Budget status semantics verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `58800d9b8bb5115dc4671f82764d42c8130c283a`. T35/T41 remain optional/deferred; T44 remains unstarted. Hosted financial acceptance remains intentionally deferred.

## Relationship to T42

Review of the frozen PRD/UX/API/plan, existing Budget service/types/validator, schema and T42 evidence found no implementation gap. T42 already uses one centralized PostgreSQL NUMERIC status expression for list and single, separately rounds percentUsed, preserves negative remaining and derives progress from actual transactions. **No production implementation, CRUD/query/mapper/type/validator, schema, index, dependency or frontend change was necessary.** T43 adds acceptance tests and exact contract/checkpoint documentation; it does not rewrite working T42 code.

## Frozen thresholds

Default alertThresholdPercent is **90**, configurable integer **1–100**. For positive budget amount A, exact matching expense total S and stored threshold T:

| Status | Exact condition |
| --- | --- |
| normal | S=0, or S×100<T×A |
| near_limit | 0<S<=A and S×100>=T×A |
| exceeded | S>A |

Exactly100% is **near_limit**, including threshold100; no at_limit enum exists. Zero spending is always normal. Values above budget remain informational: transactions are allowed, remaining becomes negative and percentUsed is not capped. The spelling remains normal / near_limit / exceeded.

Status compares exact NUMERIC spending/amount/threshold products; it never depends on JavaScript Number, formatted strings or rounded percentUsed. PostgreSQL separately rounds the percentage to two decimals with ties away from zero. A just-exceeded budget can therefore display100.00 while correctly returning exceeded.

Representative verified HTTP cases:

| Amount | Spent | Threshold | Display percentUsed | Status |
| --- | --- | --- | --- | --- |
| 200.00 | 179.99 | 90 | 90.00 | normal (exact89.995%) |
| 1000.00 | 899.99 | 90 | 90.00 | normal |
| 1000.00 | 900.00 | 90 | 90.00 | near_limit |
| 1000.00 | 900.01 | 90 | 90.00 | near_limit |
| 1000.00 | 999.99 | 90 | 100.00 | near_limit |
| 1000.00 | 999.99 | 100 | 100.00 | normal |
| 1000.00 | 1000.00 | 100 | 100.00 | near_limit |
| 1000.00 | 1000.01 | 90 | 100.00 | exceeded |
| 0.01 | 0.00 / 0.01 / 0.02 | 90 | 0.00 / 100.00 / 200.00 | normal / near_limit / exceeded |
| 999999999.99 | 999999999.98 | 100 | 100.00 | normal |
| 999999999.99 | 1000000000.00 | 100 | 100.00 | exceeded |

The matrix also verifies exact0.10+0.20=0.30, maximum amount at limit, positive rounding ties0.125→0.13 and0.005→0.01, small spending, threshold1, zero spending and uncapped120/160/200% cases.

## Dynamic reconciliation and exclusions

Real authenticated transaction creation drives normal→near_limit→exceeded without changing budget rows. Deleting expenses reverses progression; amount edits, category moves and month moves recalculate old/new budgets on the next read. Editing only the stored threshold/amount also changes classification; category/year/month remain rejected immutable PUT fields.

Real T31 generated expense posting crosses the threshold exactly once. Repeated processing leaves the same spent/status; deleting the generated transaction restores normal while preserving the durable posted occurrence with null transaction link. Unposted recurring definitions, same-category income and transfers do not alter spending/percentage/status. Archiving a historical custom category retains its expenses and status; permitted historical transaction deletion recalculates downward.

User A's spending cannot affect B's budget for the same system category/month or identically named custom categories. Both users have independent actual values/statuses, and B receives safe404 for A's budget resource. Every focused status read compares real GET single with its matching list resource, including spent/remaining/percentUsed/status and timestamps.

## Determinism and concurrent visibility

Repeated reads of all boundary fixtures return identical complete resources. Before/after raw database budget snapshots stay unchanged, proving GET does not update stored rows/timestamps. Runtime schema inspection confirms no mutable status/spent/remaining/percentUsed columns.

Six controlled concurrent writer/read scenarios hold insert, update or delete uncommitted while real HTTP status reads continue. Reads retain the prior committed coherent tuple; after commit they show the new tuple, while rollback has no effect. This covers committed and rolled-back insert/update/delete independently. The shared SQL statement remains the single-snapshot authority for all derived fields; no cached status reconciliation is needed.

## Verification and regressions

New focused suite: **two tests passed**, including **671 grouped integration checks**, **23 boundary cases** and **six concurrent visibility scenarios**. Failed list/single status reads return safe503/500 error envelopes with no data or fabricated normal status, no SQL/constraint/stack leakage. Real ES256/JWKS JWT HTTP and limited expense_tracker_app PostgreSQL reads/writes are used.

Backend lint/typecheck/build pass. General suite: **126 tests,100 passed,26 explicitly database-gated skips,zero failures**. Dedicated fresh disposable regressions separately passed:

- T42: four tests,194 grouped checks,10 concurrency groups and three rollback fault probes;
- T31: three tests,403 checks,12 forced races and12 fault probes;
- T29: three tests,357 checks,10 races and11 faults;
- T18/shared: three tests; T16 599, accounts263, balances285, transactions244, search263, filters3263, pagination6065, transfers917, recurring isolation31, Analytics isolation14 and Budget isolation15 checks; zero failures.

The general suite includes T39/T42 auth/error/production-boundary tests. Shared aggregate code did not change, so no additional dedicated T38/T39 matrix or frontend tests were necessary. All fixtures use a freshly initialized synthetic-only PostgreSQL17.11 cluster in ignored `.tmp-v2-t43/pgdata`; reset guards verify the exact directory. Production and retained production restores were never used.

## Performance and production boundaries

No query implementation changed. The required T42 regression nevertheless reran its scale fixture: **30,012 transactions,777 budgets,32 scale categories,24 months**. Eight warm local authenticated list reads: **7.75–18.43 ms,median13.45 ms**; EXPLAIN ANALYZE execution1.586 ms/planning2.663 ms. These local samples are descriptive, not a hosted SLA. No new index/migration or optimization was warranted.

Production Budget registration, frontend financial404 gate and disabled cron remain unchanged and covered by existing T42 boundary tests. No remote DB/environment change, manual deployment, hosted acceptance or Budget frontend integration occurred. Existing main Git integration may build the push without opening Budgets. The disposable T43 server is stopped after verification; ignored synthetic artifacts remain local. Secret/artifact scan and git diff --check pass.

## Changes and next task

Added `backend/tests/budget-status.test.mjs`, compact [verification evidence](assets/t43/verification.json) and this report. Updated `.gitignore`, README, API boundary wording and implementation-plan checkpoint only. PRD/UX already express the correct thresholds and require no edits.

No known T43 blocker remains. Ready for **T44 — Build Budgets Page**, unstarted. Do not implement it automatically, promote T41 or reopen deferred production-preview acceptance.
