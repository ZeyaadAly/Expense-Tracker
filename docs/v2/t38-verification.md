# T38 — Analytics query foundation verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `722b95a303c31e73410430bea7ba2c34f17d5414`. T39 remains unstarted.

## Implemented scope

`createAnalyticsRepository` supplies summary, monthly income/expense/savings series, expense and income category breakdowns, account activity and recurring commitments. `createAnalyticsService().getOverview()` composes these reads in one REPEATABLE READ, READ ONLY snapshot. Optional accounts are owner-checked inside that snapshot; foreign and missing IDs both return the same safe 404. Validation precedes connection checkout; failures use sanitized errors, with failed rollback connections discarded and no retry.

Summary income, expenses and net savings reuse the T36 aggregate CTE. Savings rate is net savings / income × 100, null for zero income. Average daily expense divides by every inclusive calendar day. All money, products, sums, percentages and rounding stay in PostgreSQL NUMERIC; strings serialize exact results. JavaScript handles calendar integers and occurrence multiplicities only. PostgreSQL numeric rounding uses two decimal places with ties away from zero; see [PostgreSQL mathematical functions](https://www.postgresql.org/docs/17/functions-math.html).

Ranges accept canonical dates from 1900-01-01 through 9999-12-31, at most 366 inclusive days, and an optional owned account. Date-only values are never converted into instants. The service accepts explicit dates and reports Africa/Cairo; callers retain responsibility for Cairo-derived presets/today. No new clock or adaptive bucketing exists. Monthly buckets are chronological, zero-filled and clipped at both boundaries using [PostgreSQL generate_series](https://www.postgresql.org/docs/17/functions-srf.html).

Categories use category IDs and owned/system joins, include archived history, sort by numeric amount then ID, and calculate each transaction type's percentages independently. Rounded percentages need not total 100. Account activity includes owned accounts with zero activity and archived history, ordered by name/ID. Transfers appear only as separate incoming/outgoing account movement; they never enter income, expenses, savings or category totals.

Recurring commitments reuse T30 daily/weekly/monthly/yearly anchored occurrence enumeration, respecting start/end and active definitions/parents. They exclude skipped dates, use the requested range rather than the processing cursor, and include posted dates as current-definition forecast assumptions. Forecasts remain separate from actuals; no artificial monthly equivalents are introduced. Posted generated transactions count as actual transactions. Deleting one removes its actual amount while preserving the durable occurrence marker and forecast semantics.

## Verification

Backend lint, typecheck and build passed. General suite: **117 tests, 93 passed, 24 explicitly database-gated skips, zero failures**. Dedicated integration suites ran sequentially against fresh databases in a newly initialized synthetic-only loopback PostgreSQL 17.11 cluster; no production database or retained production restore was used.

- T38: **73 grouped integration checks**, plus range-validation and sanitized-failure unit tests; all three tests passed.
- T36: **214 checks**, all four tests passed; exact agreement across all five dashboard periods and Cairo midnight boundaries.
- T31: **403 checks**, 12 forced races and 12 rollback/lost-ack probes; all three tests passed.
- T32: **103 checks**, all two tests passed.
- T29: **357 checks**, 10 races and 11 faults; all three tests passed.
- T18/shared: all three tests passed; T16 599, T17 263, balances 285, transactions 244, search 263, filters 3263, pagination 6065, transfers 917, recurring isolation 31 and new Analytics isolation **10 checks**, zero failures.

Exact fixtures cover 0.10 + 0.20, totals above one billion, negative savings/rates, zero income, half-cent positive/negative ties, independently rounded thirds, numeric category ordering and UUID ties. Date cases cover from/to inclusion, excluded adjacent dates, month/year rollover, leap-day anchoring, maximum year and session-timezone independence. Archived history, account filters, transfer exclusion, actual processor-generated rows/deletion, skipped/posted forecasts and A/B isolation pass. SQL independently sums series values back to summary totals. A forced concurrent commit between overview reads confirms snapshot consistency; runtime settings confirm read-only repeatable-read behavior. Before/after financial snapshots confirm analytics writes nothing.

## Performance and indexes

Synthetic fixture: **30,023 transactions, 2,001 transfers, two processor-generated transactions**, multiple owners/accounts/categories. Eight warm local overview reads: **45.21–49.92 ms**, median **46.24 ms**. EXPLAIN ANALYZE execution times: summary 7.152 ms, monthly series 10.549 ms, categories 13.401 ms, account activity 11.287 ms, recurring definitions 0.093 ms, skipped occurrences 0.022 ms, recurring totals 0.060 ms. These are local measurements, not production guarantees. No measured need for a new index; **zero schema changes/migrations**. Compact evidence: [performance.json](assets/t38/performance.json); full synthetic plans remain in ignored local artifacts.

## API and production boundaries

No Analytics router, public endpoint, frontend connection, budgets/goals or T39 implementation was added. Only the shared aggregate was refactored for T36; existing behavior remains covered by regressions. Frontend production financial 404 gate and empty active cron configuration are unchanged. Git pushes to main can trigger existing Vercel builds, but the internal Analytics service is not imported into application startup or exposed publicly. No deployment command, remote migration, financial mutation or production acceptance check belongs to this task.

Production-preview remains **partial / intentionally deferred** by explicit user authorization. Manual hosted Auth sign-in, refresh and sign-out passed by user report. Hosted financial API/UI walkthrough, multi-user isolation, responsive/accessibility, network/log and recurring acceptance remain deferred. This local evidence does not substitute for them.

## Changes and next task

Added internal range/service modules, dedicated Analytics integration tests, shared isolation helper and compact performance evidence. Updated transaction totals, isolation runner, temporary-artifact ignore rule and current checkpoint documentation. Database-design contracts require no change. Credential/artifact scan and `git diff --check` are required before commit. The disposable T38 server is stopped after verification; synthetic artifacts remain ignored.

No known T38 blocker remains. Ready for **T39 — Build Analytics API**, with HTTP validation/authentication/route acceptance still owned by that task. Do not start it automatically or reopen the deferred production-preview workflow.
