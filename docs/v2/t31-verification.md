# T31 — Internal recurring processor

Date: 2026-10-09. Status: **Completed locally. Production not applied.**

## Processor API and scope

`createRecurringProcessor(database).processDueRecurring(input)` accepts required `referenceDate` (explicit Cairo YYYY-MM-DD), optional userId/definitionId scopes, optional reduced maxPerDefinition/maxAttempts limits, and a caller-supplied shouldStop deadline predicate. Invalid dates, UUIDs, unsupported fields, unsafe limits and invalid predicates fail before connecting. The service reads no system clock, and callers must supply the actual business date. Existing database Cairo future-date guards remain intact.

Due discovery selects only active definitions with a nonnull next_occurrence <= referenceDate. Results are oldest cursor first, then UUID, limited to the invocation attempt budget. Owner scope is an additional parameterized predicate; global processing trusts each row's stored user_id. Paused, archived, future and exhausted schedules are ignored. Processing begins exclusively at the persisted cursor: T29 creation/resume history is never reconstructed or backfilled.

Return counters: definitionsVisited, attempts, posted, skipped, alreadyTerminal, failed, conflicts, recordedFailures, failureRecordingErrors. Return flags: limitReached, deadlineReached and scoped hasRemaining. Results contain no IDs, descriptions, SQL/errors, connection strings or credentials. The service emits no logs. Top-level discovery/database outages may reject to the internal caller; T33 must use safe error handling when it adds orchestration.

## Limits and deadline behavior

Hard ceilings are **100 attempts per definition and 1000 attempts per invocation**. Callers may reduce them, never increase them. Attempts include reservation/revalidation and failed/terminal inspection, so financial writes cannot exceed these ceilings. Due discovery itself is bounded. Per-definition exhaustion of the budget leaves the cursor at the next eligible unprocessed date; other selected definitions may still run. Global exhaustion stops cleanly. limitReached indicates budget exhaustion with observed due work; hasRemaining also reports failed/otherwise unresolved active cursors.

The caller's deadline predicate is checked before discovery, before claims and after committed reservation. A stop before any work makes no database mutation. A stop after reservation leaves a durable pending row, without a financial transaction. Cursor advancement can jump over existing terminal dates using the durable T32 ledger; it never enumerates missing historical dates or pre-generates future reservations.

## T30/T32/T21 integration and transaction boundary

One occurrence uses two short transactions:

1. Lock/reread the owned definition, recheck due status, reserve its exact persisted cursor through T32, then commit.
2. Invoke T32's parent-first posting path, lock/reread the definition and occurrence, recheck active parents and expected cursor, insert via the shared T21 writer, mark/link posted, and advance next_occurrence through T30 in the **same transaction**, then commit.

T32 reservation/transition code was extracted into caller-owned transaction helpers; standalone wrappers delegate to those same implementations. No alternative occurrence table, reservation logic, transaction insertion or recurrence implementation was added. T32's posting composition accepts an explicit validated business date and expected cursor. T21 validation now has an explicit-date internal entry; the existing HTTP/manual wrapper still derives Cairo today exactly as before. The native database future-date guard was not changed.

T30 alone supplies on-or-after validation and strictly-after anchored progression. Terminal-date inspection reuses the T32 ledger helper. Posted/skipped dates cannot become a new cursor, including posted markers with null transaction links after deletion. Failed/pending dates are not skipped by advancement. Inclusive ends and the supported upper bound exhaust to null. Monthly and yearly anchor semantics never derive from a previously clamped date.

Locks remain account FOR UPDATE → category FOR SHARE → definition FOR UPDATE → occurrence FOR UPDATE for posting. Claim/failure recording take definition/occurrence locks without subsequently taking parents. The processor never locks a definition and then enters a parent-acquiring posting path. Each transaction owns one client; rollback failure discards it. There is no automatic uncertain-write retry or optimistic versioning.

## Failure and recovery policy

- Existing pending rows resume safely through the same T32 atomic post path; no second reservation or timeout policy is needed.
- Existing failed rows are counted and retain the due cursor. They require explicit `transitionOccurrence(..., 'retry')` before another posting attempt. T31 never performs fail→pending automatically.
- Posting failure rolls back financial insert/link/cursor advancement. A separate transaction records only a sanitized T32 code (POSTING_FAILED, DATABASE_UNAVAILABLE or INVALID_REFERENCE), only if the same active cursor and pending row remain.
- Invalid active account/category references are recorded failed with INVALID_REFERENCE; no silent category substitution occurs. Real account/category archive normally pauses the definition, so that lifecycle outcome wins instead of being overwritten by delayed failure recording. T17/T29 already skip unposted reservations where their contract requires it; the existing category archive trigger's pause behavior remains unchanged.
- Lifecycle/other-processor conflicts stop that definition's attempt without marking a terminal outcome failed. Other selected definitions continue.
- Claim failure or lost reservation acknowledgement leaves any committed reservation pending. Lost posting acknowledgement may have committed both financial effect and cursor advancement; delayed failure recording cannot overwrite that success. Later invocations inspect durable state and never duplicate it. Counters describe acknowledged outcomes: an uncertain committed post can be reported as a failed attempt.
- If failure recording is itself unavailable, increment failureRecordingErrors. The original pending state remains recoverable on a later invocation; no corrupted partial financial state persists.

## Calendar, history and financial verification

Tests cover one daily posting, multi-day catch-up, weekly schedules, Jan 31 → Feb 28 → Mar 31 → Apr 30, and a five-year Feb 29 → Feb 28 → leap Feb 29 cycle. Actual processor leap fixtures use 2020–2024, and monthly fixtures use 2025, because future financial posting is correctly forbidden. T30's independent tests additionally cover the 2024–2028 calendar semantics and the 9999 upper bound. The initial fixture attempted future posting and failed against the unchanged guard; it was corrected rather than bypassing that security rule. An initial expected T18 summary omitted its currency field; the fixture assertion was corrected without changing production behavior.

Inclusive endDate is posted once, then the cursor becomes null. Repeated invocations do not change records/timestamps/totals. Posted/skipped terminal snapshots survive processing. Actual T21 generated deletion preserves its posted marker, which is never regenerated. T29 past-start creation/resume schedules produce only their persisted eligible dates. Generated transaction_date and occurrence_date remain identical, including four dates around Cairo seasonal transitions.

T18 verifies exact one-time income/expense/balance/net effects. Amounts 0.10, 0.20 and 999999999.99 persist exactly; the money fixture reports income 1000000000.29, expense 0.20 and balance 1000000000.09. No JS financial arithmetic occurs and no transfers are created. Concurrent User A/B schedules inherit the correct stored owners; A-scoped processing cannot select B's definition. The final generated identity/owner query has zero mismatches.

## Concurrency and crash evidence

**Twelve forced races** observe actual waiting through pg_blocking_pids:

- two processors on the same definition;
- different definitions sharing an account;
- both orders of processor vs pause, archive, edit, account archive and category archive.

Each produces one coherent serialized result, with one ledger identity, at most one generated transaction per date and valid final cursor/status. If posting wins, lifecycle follows it; if lifecycle wins, no transaction posts after it. Generated transactions retain coherent old amount/category/description in posting-first edit races, while edit-first cancellation preserves the terminal skipped marker. No deadlock was observed.

Crash/restart tests stop after two of five due dates, close/reopen the pool and reconstruct the processor: the next invocation posts only the remaining three. Separate pending recovery closes all clients between reservation and processing. Deadline tests stop before any work and immediately after a committed claim; both preserve durable continuation.

**Twelve rollback/lost-ack probes** cover failure after definition lock/reservation, after generated insert/link, before/during advancement, before both COMMIT boundaries, after both real COMMITs, an actual SQL divide-by-zero that aborts posting, and failure-recording connection loss. Financial/definition/account/transfer snapshots—including timestamps—remain unchanged on rollback; only the separately committed reservation/failure marker may remain. Explicit retry or pending recovery yields exactly one eventual transaction. Terminal histories never revert and no orphan generated row survives.

## Representative local performance

Fresh synthetic workload: **40 users, 2000 definitions, 1200 due and 800 future**. Application work uses expense_tracker_app; admin is limited to disposable setup/observation and ANALYZE. The first invocation performs exactly **1000 attempts/posts in 9547.3 ms**, then leaves backlog. The next posts the remaining **200**, and a third posts zero. Each user's T18 income/net position is exactly 3.00; aggregate generated amount is exactly 120.00 across 1200 rows.

Runtime-role EXPLAIN ANALYZE of the due query took **1.276 ms** in that fixture. Existing recurring_due_idx and recurring_user_status_next_idx are available for the discovery predicates/order; no speculative index, migration or grants were added. A separate runtime probe of the exact scoped discovery SQL after the workload took **1.447 ms**, selecting Limit → Sort → Seq Scan at this small, densely due fixture. No concrete query bottleneck justified another index. These are local observations, not remote scheduler duration guarantees; T33 owns deployment-duration benchmarking and deadline policy.

## Quality and regression

- Backend lint, typecheck and production build pass.
- Final full suite selecting T31: **103 tests; 83 passed, 20 other database-gated skips, zero failures**. T31's three tests pass; focused integration: **403 checks, 12 forced races, 12 failure/recovery probes**.
- Fresh T29 suite: **3 tests passed**, **357 lifecycle checks**, ten forced races, eleven rollback faults.
- Fresh T32/T30 suite: **16 tests passed**, **103 T32 checks** and all **14 T30 calculator tests**.
- Fresh full suite selecting T27: **103 tests; 83 passed, 20 gated skips, zero failures**. Actual regressions pass T16 599, T17 263, T18 285, T21 244, T22 263, T23 3263, T24 6065, T26 917 and T27 4833 checks, plus 31 real recurring API isolation checks. T27 retains its 29 forced races and zero observed deadlocks.

Gated integration initializers each require a separate fresh local database. No skipped relevant integration is presented as passed: the required domains were selected in separate runs. Each copied cluster installs migrations through T32 plus the T12 seed; all application operations run through the limited runtime role. The local clusters are stopped after verification. No frontend suite was run because no frontend source changed.

Reproduce: initialize a fresh disposable copy on 127.0.0.1:55451/postgres; build backend; set only T31_DISPOSABLE_DATABASE_URL to `postgresql://postgres@127.0.0.1:55451/postgres`; run `npm.cmd --prefix backend test`. Fresh copies and T29/T32/T27 selection variables reproduce the separate regressions. Ignored `.tmp-v2-t31` contains local logs/results, without production credentials.

## Files and boundary

Created:

- backend/src/services/recurring-processor.ts
- backend/tests/recurring-processor.test.mjs
- docs/v2/t31-verification.md

Updated:

- backend/src/services/recurring-occurrences.ts — compose existing persistence paths and expected-cursor/business-date checks
- backend/src/validators/v2-transaction.ts — reuse one validator with an explicit internal business date
- docs/v2/04-architecture.md — clarify transaction/recovery mechanics and T33 HTTP boundary
- docs/v2/07-implementation-plan.md — completion and next-task checkpoint
- .gitignore — disposable T31 directory

Previously uncommitted T29 work is preserved. No application startup/route wiring, cron, CRON_SECRET, public/internal processing endpoint, frontend, schema/grants, hosted database, production data or deployment changed. V1 behavior is preserved. No remaining T31 blockers.

Next: **T33 — Configure Daily Vercel Scheduled Execution**, including the protected orchestration handler under the revised boundary. T33 is not started automatically.
