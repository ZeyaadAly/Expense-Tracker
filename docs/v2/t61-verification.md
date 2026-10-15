# T61 — Recurring Reliability Tests

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Started on clean `main`, fetched and fast-forward synchronized with `origin/main`, at `2e3637a0200728227f457f072afbd55bd07d0050`. No unresolved recurring reliability or financial-duplication issue remains in the implemented scope. Optional T35/T41/T47/T50–T56 remain deferred. T62 is unstarted. Hosted financial acceptance remains intentionally deferred.

## Scope and local environment

The verified story is durable recurring definitions → T30 calendar selection → committed T32 occurrence claim → atomic generated transaction/posted marker/cursor advancement → exact financial reads, under duplicate delivery, lost acknowledgements, interrupted processes/connections, lifecycle contention and bounded backlog.

A new UTF-8 PostgreSQL 17.11 cluster was initialized at ignored `.tmp-v2-t61/pgdata`, listening only on 127.0.0.1:55451. A starting-HEAD `git archive` source snapshot installed both committed lockfiles from the local npm cache. Node 24.19.0/npm 11.17.0 ran checks without application `.env` files. Frontend dependencies support the backend transport-test loader and targeted local browser smoke. All application operations use `expense_tracker_app`; postgres is limited to disposable migration/setup/observation, restart and deliberate termination of one test backend connection.

The eight migrations, nine-system-category seed, T15 ownership constraints, T32 occurrence invariants and runtime/browser privileges are applied by fresh initializers. Before any reset, runners verify the resolved server data directory and absence of preceding clients. Synthetic A/B Auth uses real ES256/JWKS verification for HTTP. No hosted Auth, retained data or remote database is used. The focused parent also starts two disposable worker processes and kills only those workers at acknowledged checkpoints.

## Recurrence and state matrix

| Case | Executed result |
| --- | --- |
| Exact due / early invocation | Exact date posts once; early run has zero attempts and no occurrence reservation |
| Daily backlog | Ordered catch-up; five-day recovery regression and 102-date focused backlog reconcile every date |
| Weekly | April 17→24→May 1 retains seven-day calendar spacing across Cairo seasonal change |
| Monthly | 2024 Jan 31→Feb 29→Mar 31→Apr 30→May 31; non-leap Jan 31→Feb 28→Mar 31 also passes fresh T29/T31 regression |
| Yearly | Real posted 2020 Feb 29→2021/22/23 Feb 28→2024 Feb 29; calculator verifies 2024→2028 and 2100 non-leap/2000 leap |
| Daily Cairo change | April 24/25/26/27 generated dates remain consecutive calendar dates |
| Inclusive end / exhaustion | End date posts, cursor becomes null; later runs make zero attempts and do not resurrect schedule |
| Old start create | All four frequencies jump to current eligible date with no old ledger;120 additional service-created 1900-start definitions create no transactions or occurrence rows |
| Paused gap / exact-date resume | Resume chooses first unreserved anchored date on/after today, with no materialized missed history |
| Pending edit/pause/archive | Same occurrence identity becomes skipped; no financial row; failed unposted reservations follow the same frozen policy in T29 regression |
| Posted history edit | Old generated transaction and posted marker remain unchanged; new posting uses one coherent updated account/category/type/amount/description |
| Double lifecycle calls | Concurrent pause/resume and repeated archive preserve coherent state and idempotent timestamps |
| Future dates | No early processing or unlimited future rows; future financial posting remains database-rejected |

Tests use explicit date fixtures and T30 production functions; no alternate production recurrence engine is introduced. Finite daily test arrays are an independent expected-date oracle. Future 2028/2100 calendar assertions are calculator-level because current financial guards intentionally forbid posting future transactions.

## Backlog, ordering, deadlines and statistics

The focused 102-date daily schedule posts 100, retains the next cursor 2025-04-11 with hasRemaining/limitReached, then posts the remaining 2 with no missing/duplicate dates. A mixed daily/weekly/monthly/yearly B fixture verifies the actual candidate scan order (oldest next date, then ID), four definitions/eight attempts/eight posts, and no exhausted resurrection. The contract processes each visited definition up to its cap before continuing; it does not promise round-robin fairness or globally interleaved occurrence dates.

Protected HTTP backlog uses 11 definitions with 101 due dates each. The first request posts exactly 1000 attempts, each definition bounded by 100. Two overlapping continuation requests plus bounded subsequent invocations finish all 1111 dates exactly once; a stable repeat posts zero. Per-definition caps may leave a final date even when two calls overlap. A verifier assertion was corrected to allow this documented continuation rather than assuming overlap drains everything immediately.

Deadline probes stop immediately after a committed pending claim (zero financial effect), and after two committed postings in a five-date backlog. The latter retains cursorOctober 12 and posts the remaining three on a later run. T33's actual HTTP harness verifies its 45,000 ms cooperative threshold with a deterministic monotonic clock, the 100/1000 limits, deadlineReached and safe response/log projection. No 45-second wall-clock sleep or real scheduler activation is used. In-flight SQL is not forcibly canceled by this cooperative budget; the 60-second deployment configuration and 15-second safety margin remain unchanged.

Counters are checked against known noncontended results and bounded contention results. Eight overlapping processors report 128 acknowledged posts across 128 unique committed definition/date pairs. Attempts can include terminal/already-handled/conflicted work. A lost COMMIT acknowledgement can report a failed attempt even though the durable posting succeeded; counters describe acknowledged invocation outcomes, not an authoritative persisted transaction count. Durable SQL/financial reconciliation, rather than counter addition alone, proves exactly-once effects.

## Failure matrix

| Failure point / source | Durable DB state afterward | Recovery and financial/cursor result |
| --- | --- | --- |
| Definition lock/reservation failure before claim COMMIT (T31) | Claim absent; no generated row | Normal later invocation claims/posts once; due cursor unchanged until successful post |
| Claim COMMIT acknowledgement lost (T31/T32) | One pending row with stable identity | Reuse pending identity, then one posting; no duplicate claim |
| Worker killed after actual reservation COMMIT (T61) | Pending row survives worker death and PostgreSQL restart | New process verifies original occurrence ID and posts once |
| Deadline after durable claim (T61/T33) | Pending marker; no transaction; due cursor retained | Later invocation resumes same claim |
| INSERT error/divide-by-zero/disconnected runtime backend (T31/T61) | Posting unit rolled back; separately recorded failed marker when recording succeeds | No orphan financial row or false advancement; explicit owner-scoped retry→pending→one post |
| After generated INSERT / posted-link update / before or after cursor UPDATE but before COMMIT (T31) | Entire posting unit rolls back | Account/transaction/definition snapshots reconcile; old cursor retained; explicit failed recovery |
| Worker killed after INSERT + posted-link UPDATE before COMMIT (T61) | Server rolls back uncommitted transaction/link; prior pending marker remains | Actual DB restart/new process sees zero financial rows, original marker ID; one later posting |
| Posting COMMIT acknowledgement lost (T31/T32/T60) | Posted marker, generated transaction and advanced cursor committed together | Inspect/reprocess finds success; no second effect |
| Failure-recording connection outage (T31) | Pending claim remains recoverable; no false cursor advancement | Later pending recovery posts once; failureRecordingErrors reflects outage |
| Deliberate 100 ms posting lock timeout (T61) | Zero financial rows; failed occurrence and original cursor | Release test lock, explicit retry, then exactly one post; no automatic retry policy added |
| Failed marker presented to processor (T31/T61) | Failed state retained | No silent auto-retry; foreign recovery helper 404; owned explicit recovery required |
| Successful processing but HTTP response destroyed (T33) | Posting already committed | Retry protected endpoint posts zero; same financial row remains |
| Generated transaction hard-delete (T21/T31/T61) | Posted terminal marker with null generated link | Actual financial effect removed, original occurrence never regenerates; later historical schedule date continues normally |

The focused runner uses real `pg_terminate_backend` after a generated INSERT to interrupt a runtime connection. Recovery records failed safely, then requires the internal explicit retry helper. The process-kill probes use real child termination, not a thrown exception. Raw snapshots/worker IDs/signing material remain ignored. PostgreSQL restart is a real graceful fast restart; no disk/power-loss certification is claimed.

## Concurrency and lifecycle matrix

| Competing operations | Valid final state / observed result | Duplicates / deadlocks |
| --- | --- | --- |
| Two processors, same definition (T31) | One ledger row, one generated row and coherent cursor | None observed |
| Eight processors, 32 owners/128 definitions (T61) |128 unique postings; all cursors exhausted; generated owner equals stored definition owner | Zero duplicate pairs and zero increase in DB deadlock counter |
| Processor vs pause/archive, both forced orders (T31) | Post wins→one coherent posting then lifecycle; lifecycle wins→no post/skipped claim | None observed |
| Processor vs edit, both forced orders (T31) | Entire old or new snapshot; no mixed fields | None observed |
| Processor vs account archive, both orders (T31) | Post first or zero post if archive wins; schedule paused | None observed |
| Processor vs category archive, both orders (T31) | Same serialized outcomes through parent/category lock and existing trigger | None observed |
| Account/category API archive + restore (T61) | Pending reservation skipped, schedule paused, restore leaves paused; explicit resume skips reserved date | No financial row from lifecycle |
| Pause/update, resume/archive, update/archive, account archive/resume (T29) | Ten forced races match valid serialized lifecycle states; stale discovery returns safe 409 | None observed |
| Double pause/resume/archive (T29/T61) | Idempotent coherent state/cursor/timestamps | No corruption |
| Parent lock held through posting (T61) | Explicit test lock timeout yields recoverable failure | No duplicate, no hidden retry |

T31 adds 12 forced processor races and 12 rollback/lost-ack probes; T29 adds 10 lifecycle races and 11 rollback probes; T32 adds six faults. These are separately executed matrices, not a claim of exhaustive interleavings. Category-service regression also covers its modern management API and rollback behavior. Parent-first lock order remains accounts by UUID, categories, definitions, then occurrences for posting; claim/failure recording does not subsequently acquire earlier parent locks.

## Financial effects, history, forecasts and security

The focused expected ledger is built from declared input amounts and expected posted dates using BigInt cents. Account/card balances, net position, Dashboard income/expenses/savings, Analytics actuals and matching Budget spending agree with that independent model. Exact 0.10/0.20/999999999.99 posting passes. Card expenses increase debt and card income/refunds reduce it. Generated posting DATE equals its occurrence date at creation; later permitted T21 edits preserve immutable recurring identity and terminal history.

Before posting, projections have no actual effect. Adding a two-date expense definition adds exactly 0.40 forecast, posting adds only its actual transaction, and deletion removes actual/Budget spending without removing that current-schedule forecast. This follows frozen Analytics semantics: active current definitions can project already-posted/deleted historical dates; forecast never merges into actuals. Dashboard upcoming omits terminal dates even after deletion, includes the next unposted eligible date, and excludes paused/archived definitions.

T60's complete independent financial reconciliation is rerun: 9,445 initial plus 728 database/backend restart checks pass at 30,047 transactions/2,025 transfers/116 budgets. That includes generated deletion, uncertain commits, exact aggregates, lifecycle non-effect and A/B separation. T59 rerun passes its 612 foundation checks plus domain extensions and full attack matrix: 156 route-authentication, 561 owner-injection, 275 mass-assignment, six foreign occurrence denials, two concurrent processor checks, 19 boundary/log checks and 192 timing requests. Verified JWT subject remains the only public owner authority. Internal global processing propagates trusted DB owners.

Fresh T15/T32/T59 suites reject duplicate definition/date occurrences, foreign/wrong-definition generated links, owner reassignment, orphan generated commits, invalid terminal transitions and ledger deletion. Posted/skipped states are terminal; the deletion-driven FK null-link change is the documented exception. Browser roles cannot access the private financial schema. No public processing or failed-retry API was invented.

## Targeted frontend smoke

Seven real browser checks pass on local `/v2/recurring`: active, paused, archived and exhausted display; no Run now/Retry processor/cron/server-secret controls; real posting advances nextOccurrence toNovember 15 without a duplicate; and UI pause/explicit resume retains the coherent cursor. The flow is browser→T10→real Express/ES256→limited-role PostgreSQL→authoritative rendering; only Auth provider responses are synthetic. There are zero page errors. The test-only processing endpoint belongs solely to the local fixture server and is never exposed by production UI/API. This is intentionally narrower than a full T58 rerun.

## Load, plans, source of truth and logs

The fresh T31 load has 40 users, 2,000 definitions, 1,200 due/800 future schedules. Its first 1000 attempts/posts took **8544.7 ms**, followed by 200 posts and a zero-post repeat. Each owner's exact 3.00 balance/net position and total 120.00 generated amount reconcile. The due query took **0.901 ms** under EXPLAIN ANALYZE. Existing partial `recurring_due_idx(next_occurrence,id)` with active/non-null predicate and owner/status/date indexes remain appropriate; no new index is justified.

The final focused protected HTTP 1000-post batch took **10280 ms**, including HTTP/orchestration on its concentrated backlog fixture. These are different workloads. Historical T31 was 9547.3 ms and T57's isolated repeat 8120 ms; this run's matched T31 workload shows no material regression. Local cache/scheduling/fixture effects remain, and none of these timings certifies hosted execution. The actual 45-second cooperative boundary is verified deterministically, not inferred from elapsed benchmark time.

Durable source of truth remains `recurring_transactions`, `recurring_occurrences`, and normal generated `transactions`. Each invocation rediscovers due DB rows; no hidden in-memory queue, aggregate or checkpoint controls recovery. Creating definitions never posts. Only due processing/reservation and explicit lifecycle history transitions create/change ledger state; no unlimited future occurrence materialization occurs. New API/JWKS/Pool/Node processes and actual database restart recover from DB state alone.

Source, development chunks/source maps, and local reliability/API/test logs are scanned. Cron logs contain projected counters/request metadata only; no JWT, CRON secret, cursor secret, database URL or financial description is logged. Raw synthetic sessions/keys/cursors/snapshots remain ignored. The source/development artifact scan covered 376 files, including 50 source maps, and 40 logs (416 file-level checks), with zero findings. The separate backend configuration/source/history scan passed 33 checks over 362 files with zero recognized secrets; nine documented/synthetic placeholders were classified separately. Existing production gates and absent browser processing controls are checked independently of these scans.

## Findings, limitations and quality

No application recurring defect was found. The focused verifier's overlap assertion initially assumed two continuation calls must drain the full backlog; it was corrected to require bounded eventual completion under the frozen per-definition cap. Subsequent explicit date/cardinality and financial checks pass. Application source, recurrence math, schema/migrations, privileges, dependencies/lockfiles, frontend production source and deployment configuration are unchanged.

Limits: synthetic local Auth/PostgreSQL/Edge, finite concurrency schedules, a deterministic 45-second clock probe, and graceful database restart rather than disk/power-loss testing. Future calendar dates are tested through T30 without bypassing financial future-date guards. Shared runtime authorization and current-definition forecasts retain their documented design. No unresolved duplication, cursor mismatch or financial mismatch is deferred.

Backend lint/typecheck/build/full tests pass: 132 named tests, 104 passed and 28 explicitly database-gated wrappers. All gates are covered by 17 fresh regression runs/57 passing groups with zero failures/skips. The 14 T30 calculator tests execute in the full suite; fresh T29/T31/T32/T33 integrations pass 357/403/103/104 counted checks respectively, alongside account/balance/Budget regressions. Focused T61 passes **1,689 initial checks across 12 groups plus 43 recovery checks**, and the browser smoke passes seven. New verifier scripts pass explicit ESLint. Git whitespace and final secret review pass. Shared assertions repeated in regressions are not combined into a unique test count.

## Reproduction, evidence and production boundary

Create a new `.tmp-v2-t61/pgdata` cluster and isolated starting-HEAD snapshot with locked installs; build backend. Set T61_DISPOSABLE_DATABASE_URL to the password-free loopback postgres URL, T61_DATA_DIRECTORY to the absolute new data directory, T61_OUTPUT_DIRECTORY to an ignored T61 subdirectory and T61_PG_BIN to the PostgreSQL binary directory. Run `node backend/scripts/verify-t61-recurring-reliability.mjs`. The parent validates/reset guards, runs initial checks, kills its own reservation/posting workers at explicit IPC checkpoints, restarts PostgreSQL using pg_ctl.exe, and invokes recovery in a fresh process. Windows child-process/restart permission is needed; no production credential is needed. Never commit private-state.json.

Run database-resetting suites serially. Reuse T57 matrix with only snapshot T57/t57 guards/variables adapted to T61/t61 and MATRIX_ONLY=1; T59 security and T60 reconciliation similarly adapt only their snapshot guards/variables. Browser smoke reuses the local T58 fixture/orchestrator with `.tmp-v2-t58` guards adapted to `.tmp-v2-t61`, T58 variables retained, and a single selected hook running `frontend/scripts/verify-t61-recurring-smoke.mjs`. Only that hook runs, not the full frontend matrix. Development source-map scanning points to Next's `.next/dev` output.

Evidence: [focused reliability/crashes](assets/t61/reliability.json), [regression/security/quality summary](assets/t61/result.json), [financial reconciliation](assets/t61/financial.json), [browser smoke](assets/t61/recurring-smoke.json), [browser screenshot](assets/t61/recurring-smoke.png), [migration inventory](assets/t61/migration-inventory.json), [source/log scan](assets/t61/artifacts.json).

No production access/write, remote Supabase/Vercel environment change, manual deployment, release-gate removal or real cron activation occurred. Financial UI/Settings and category-write gates remain; hosted recurring/financial acceptance remains deferred. Production Analytics/Budgets/Goals remain unregistered and `backend/vercel.json` retains `crons: []`.

Changes are two verification scripts, this report/sanitized evidence, `.gitignore`, README and implementation-plan checkpoints. **Next core task: T62 — Responsive / Accessibility Validation. It is not implemented automatically.**
