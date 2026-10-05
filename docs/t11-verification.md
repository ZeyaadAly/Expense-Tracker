# T11 — Filtering, stale requests, and recovery verification

**Date:** 2026-10-05  
**Status:** Completed. T12 has not started.

## Audit: existing behavior and genuine gaps

T06 already implements parameterized backend filters and deterministic date/creation/ID descending ordering. T08 already connects lowercase type/category selectors, AND queries, omitted All values, category reset, shared Other, independent list/summary states, AbortController cancellation, obsolete-response protection and filtered-list/global-summary refresh. T09/T10 already provide authoritative edit/delete persistence and conservative uncertain-write handling. These behaviors were reused, not rebuilt.

The audit found and hardened these gaps:

- Async mutation callbacks could retain a loader from an earlier filter selection. `useApiRead` now exposes a stable reload that uses the latest committed key/loader.
- Repeated read retries restarted the same request. A small `read-request.ts` controller shares the in-flight promise for a resource key. Explicit mutation/check refreshes supersede earlier snapshots; per-request identity and abort checks prevent obsolete success/error callbacks, even when transport cancellation is ignored. Effect cleanup cancels obsolete requests, and settlements release active references.
- Resetting to All showed initial-loading wording. The hook retains whether a successful list was previously loaded, so refiltering/reset uses `Updating transactions…` while old rows remain hidden.
- A failed refresh could leave mutation-warning state armed after later successful recovery. That state now clears once both reads succeed, preventing unrelated subsequent failures from being labelled as failed save/delete refreshes.
- Hidden-by-filter success copy could contradict the selection after reset or rapid filter changes. The saved transaction's confirmed values now determine that copy against current filters; Reset removes the explanation when the record matches again. This affects feedback only, never locally filters/inserts rows or calculates totals.
- Observable conflicting count snapshots were not consistently identified. Unfiltered list/global counts must agree; a filtered count cannot exceed the global count. Conflicts use neutral empty wording, visibly mark summary uncertainty, and offer a refresh of both reads. No client-side financial calculation is involved.
- Supported query validation details were not linked to selectors. Type/category errors now have safe local copy, `aria-invalid` and `aria-describedby`; server internals remain hidden.
- Cancellation during response-body parsing could be classified as invalid response before cancellation was recognized. The client now prioritizes external read cancellation in its catch path.
- DELETE uncertainty recovery fetched the All list twice. It now reuses the accepted unfiltered reload result. An additional unfiltered GET is performed only when the current list is filtered and cannot establish the selected ID's absence.

No new filter, pagination, sorting control, state library, database schema, role change, authentication, direct browser database access, optimistic write or automatic write retry was added. The backend implementation remains unchanged.

## Final behavior

Type-only, category-only and combined filters use the documented lowercase API codes. All is omitted. Type changes clear incompatible categories; Other survives either type and appears once. Summary requests never receive filter parameters. Active selections survive create/update/delete and failures.

Initial list loading and refiltering are distinguished. Old-key data, counts and errors are masked immediately; canceled/obsolete responses cannot replace current rows or surface errors. Repeated Retry during an active read shares that read. Confirmed mutations force fresh generations so older pre-write list/summary responses cannot become authoritative. Filter changes during post-write refresh use the newest loader, and hidden-success feedback follows current selection.

Empty state is shown only with successful reads and global count zero. Filtered empty lists with known nonempty global count show no-match. Missing summary/count or observable conflicts use neutral wording. Unfiltered empty list/nonempty summary and nonempty list/zero summary are tested explicitly. Independent REST reads cannot prove a common snapshot when counts happen to agree; no stronger atomic-snapshot guarantee is claimed.

Failed sections retain scoped retries and successful sections remain usable. Lists hide old rows on failed refresh; retained summary totals explicitly say `Previously loaded totals; could not refresh.` Conflicting snapshots get a separate uncertainty explanation. Both failures offer Retry all. Confirmed mutation followed by failed reads preserves its success announcement and uses Saved/Deleted refresh-failure wording; Retry sends only failed GETs. Later unrelated failures do not reuse that mutation warning.

Uncertain POST/PUT/DELETE preserve draft/context, block automatic writes and offer read-only checks. All-view recovery now performs exactly two GETs: list and summary. Filtered DELETE recovery additionally checks the unfiltered collection when required. Existing pending locks, missing-record behavior, safe rejection messages, exact decimal strings, date-only values and dialog focus behavior remain intact.

Filter controls stay operable during refresh. Background reads do not move focus; user-initiated Reset places focus on the Type selector because the reset action may become disabled/disappear. One status announcement exists in the loading list region; success and errors retain their established status/alert semantics. Stale-summary warnings are polite status messages.

## Executed verification

| Check | Result |
| --- | --- |
| Backend lint, typecheck, production build | Passed |
| Backend tests | 23 groups passed, zero skips; includes three new T11 filtering groups and real limited-role CRUD integration |
| Frontend lint, typecheck, production build | Passed without warnings |
| Frontend tests | 22 groups passed, zero skips; 16 client groups plus six request/count-state groups |
| T07 domain validation/formatting | Passed |
| T11 browser → Express → disposable PostgreSQL | 86 checks passed |
| T11 responsive/accessibility | 360/768/1440px; nine audits with zero violations; no-match, errors, hidden feedback, stale totals, retries and updating states fit |
| Reduced motion | Browser `matchMedia` confirms reduce; skeleton and pending-spinner computed animation names are none |
| T10 regression | 34 browser checks passed |
| T09 regression | 58 browser checks passed |
| T08 regression | 61 browser checks passed |
| T07 regression | 69 fixture checks passed with media emulation enabled in the working shared session |
| Configured TLS health | Exact 200 response and simulated unavailable-database 503 passed |
| Fresh migration/security | Repeatable seed, constraints, exact sums, timestamps, limited-role CRUD and denied DDL/TRUNCATE passed |
| Diff/visual review | Whitespace check passed; mobile updating/stale and desktop partial-failure screenshots reviewed |

New automated groups cover supported filters/Other, repeated/unsupported/empty/All/case/incompatible query rejection, parameter binding and deterministic ordering; cancellation during JSON reading; slower obsolete responses even with ignored abort; same-key retry deduplication; mutation-superseded snapshots; silent canceled/obsolete rejection; rapid filter sequences and recovery; observable count conflicts.

The T11 browser suite covers frontend query serialization, compatible categories, rapid changes with cancellation deliberately ignored, silent obsolete errors, current rows/focus, reset/loading announcements, true empty/no-match/unknown/conflicting states, both/partial read failures, deduplicated scoped retries, linked query errors, matching creation, editing into newly selected filters, hidden feedback/reset, old summary snapshot versus deletion, filter changes during each mutation's refresh, partial post-write read failure/scoped recovery, stale-warning cleanup, uncertainty checks for all three writes, actual reduced-motion preference, and responsive/a11y states. Filter changes while an edit dialog is open are deliberately dispatched programmatically to stress async callbacks despite normal dialog inertness.

Existing T07–T10 suites cover unchanged creation/edit/deletion validation and persistence, exact amounts/dates, hidden updates, record disappearance, pending duplicate/dismissal locks, focus return, committed-but-truncated mutation responses, failed/successful GET-only uncertainty checks and read-error recovery. Tests do not automatically repeat writes.

## Isolation, evidence and reproduction

All integration writes were confined to disposable loopback PostgreSQL on 55438. Fresh migration/security verification used a new cluster on 55441. The configured database was contacted only by the read-only TLS health runner. Production schema, grants, pool, TLS and environment files were unchanged.

1. Build backend and prepare a disposable database with the existing migrations/seed. Set `T06_DISPOSABLE_DATABASE_URL` and run backend `npm test` to include real limited-role groups.
2. Set `T08_DISPOSABLE_DATABASE_URL` to the administrative loopback connection for database postgres; run `node frontend/scripts/t08-test-api.mjs` from repository root. It serves 4108. Its new snapshot delays, count overrides and failures are test-only; never deploy this wrapper.
3. Start frontend dev with process-scoped `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4108/api/v1`.
4. From frontend run `node scripts/verify-t11.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE`, then T10/T09/T08 sequentially. Run T07 as `node scripts/verify-t07.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE http://localhost:3000 expense-t08`. Its optional fourth argument reuses the working browser session; all original assertions/media setup remain enabled. Default session remains expense-t07.
5. Run both packages' lint/typecheck/build/tests and `node frontend/scripts/verify-t07-domain.mjs`. Windows execution-policy restrictions can be handled with npm.cmd.
6. For independent fresh security checks, initialize a new disposable cluster, set `DISPOSABLE_DATABASE_URL`, and run `node backend/scripts/verify-t04-database.mjs`. A fresh database inside an old cluster is insufficient because the role migration creates a cluster-wide role. The final check used a fresh cluster and passed unchanged migrations.
7. Run `node backend/scripts/verify-t04-health.mjs` for configured read-only verified-TLS health and simulated failure.
8. Stop verification-only browsers, API, frontend and disposable clusters after testing.

Evidence is ignored `.tmp-t11/verification.json`, `recovery-360.png`, `recovery-768.png`, `recovery-1440.png`, and the corresponding updating screenshots. Existing suite evidence remains in its own ignored directories. Initial browser-test assumptions about focus and input text were corrected: selecting via CLI did not itself focus a selector, and an edit description is an input value rather than dialog text. Final checks establish those preconditions explicitly. The final T09 run initially checked field focus before its existing requestAnimationFrame callback; its runner now waits for that focus transition, and the complete 58-check rerun passed without changing form behavior. The earlier T10 reduced-motion limitation is resolved by actual preference/computed-style checks and reuse of the working browser session.

## Changed/created files for T11

- `.gitignore`: ignore T11 artifacts/cluster.
- `README.md`: filtering/recovery status and verification entry point.
- `docs/05-implementation-plan.md`: T11 completion and T12 next, unstarted.
- `docs/t11-verification.md`: this report.
- `backend/tests/filtering.test.mjs`: query/SQL regression groups.
- `frontend/src/lib/api/client.ts`: prioritize canceled body reads.
- `frontend/src/lib/api/read-request.ts`: small cancellable, deduplicated read controller.
- `frontend/src/lib/api/use-api-read.ts`: stable current-loader reload, data masking, accepted-result callback and loading history.
- `frontend/src/lib/dashboard-state.ts`: observable count-conflict check.
- `frontend/src/components/dashboard/dashboard.tsx`: fresh mutation reads, current-filter feedback, conflict handling and recovery cleanup/deduplication.
- `frontend/src/components/dashboard/summary.tsx`: uncertain/stale copy and polite announcement.
- `frontend/src/components/transactions/transaction-panel.tsx`: updating state, query-error wiring and reset focus.
- `frontend/src/components/transactions/filter-bar.tsx`: safe linked query errors and reset focus.
- `frontend/tests/api-client.test.mjs`: response-body cancellation case.
- `frontend/tests/read-request.test.mjs`: request races/deduplication/cancellation/count conflicts.
- `frontend/scripts/t08-test-api.mjs`: test-only delayed snapshots and partial/contradictory read controls.
- `frontend/scripts/verify-t07.mjs`: optional browser session argument for reproducible media verification.
- `frontend/scripts/verify-t09.mjs`: wait for the existing animation-frame validation focus before asserting it.
- `frontend/scripts/verify-t10.mjs`: assert reduced GET count for All-view uncertainty recovery.
- `frontend/scripts/verify-t11.mjs`: T11 live browser suite.

Earlier T10 edits were already present when T11 began and were preserved. No T12 work was performed.

## Completion decision

All required T11 behavior and relevant regressions passed. No unresolved T11 issue remains. Ready for T12 ? V1 validation and testing; T12 was not started or marked complete. Verification-only processes were stopped after the checks.
