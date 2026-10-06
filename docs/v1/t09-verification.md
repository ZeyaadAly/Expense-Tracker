# T09 — Transaction editing verification

> **Historical checkpoint:** This report preserves the results and task/deployment state at its recorded date. Later-task and fixture-only statements are historical. Current local V1 evidence is in [T12 verification](t12-verification.md); current setup/status is in [handoff](07-handoff.md). T14 integrated deployment has not started.


**Date:** 2026-10-03  
**Status:** Completed. T10 has not started.

## Implemented flow

PUT `/api/v1/transactions/:id` validates unsupported queries, the UUID and the full replacement body using the existing T05 validators. All five editable fields are required strings; unknown fields, invalid category/type pairs, amounts, descriptions and calendar dates are rejected before SQL. No PATCH behavior or upsert was added.

The existing service executes one parameterized UPDATE with the ID and five values bound separately, followed by RETURNING and the existing transaction mapper. PostgreSQL enforces constraints and its existing trigger preserves ID/creation time and refreshes update time, including unchanged editable values. No schema, role, TLS, credentials, authentication or remote database changes were made. A valid absent ID returns 404 `TRANSACTION_NOT_FOUND` with the centralized error envelope. SQL/database failures use the existing sanitized 503/500 responses. The item method policy now allows GET and PUT; DELETE, PATCH, POST and HEAD remain unsupported. Existing collection and summary policies remain intact.

The typed client's `updateTransaction(id, input)` reuses the request/envelope/error machinery, sends PUT with exactly type, amount, category, date and description, expects 200 and verifies the returned transaction ID. PUT is now classified as a write for timeout, connection loss, unexpected errors and malformed successful responses. It issues one fetch and never automatically retries. 400/404/503 structured rejections remain definite; unexpected 500 and unconfirmed outcomes retain T08's conservative uncertainty handling.

Edit uses the selected row's ID internally and its five values to prefill the existing T07 dialog. It does not fetch that record again. Local validation runs before submission; known server field errors reuse safe field messages and focus handling, while unknown/body details use form-level feedback. Entered values survive rejection. No raw server error text is shown.

Confirmed success closes the dialog, restores focus using the existing trigger/Transactions-heading fallback, announces `Transaction updated.`, and refetches the current filtered list and unfiltered summary. Filters stay selected. A record that no longer matches gets `It is hidden by your current filters.` and the existing Reset Filters action. No optimistic row editing or client summary calculation occurs. A confirmed write followed by failed reads uses the existing saved-but-refresh-failed banner and GET-only retry.

A missing record retains the form/draft, shows `This transaction is no longer available.`, disables further editing/saving and offers Close and Refresh dashboard. Refresh performs GETs and never turns the edit into creation. Uncertain updates retain the draft and block submission until a deliberate dashboard refresh succeeds; failed read checks retain the block. The user can then inspect the refreshed dashboard and deliberately retry. No success is claimed for the unconfirmed write.

Delete remains an explicitly unavailable preview. No DELETE persistence was implemented, and T10 remains unchecked.

## Exact money and dates

Backend HTTP/database, frontend-client and browser checks update `0.10`, `0.20`, `1000.00` and `999999999.99` exactly. Values remain decimal strings through validation, SQL, mapper, request and display; PostgreSQL computes summaries. No monetary Number/parseFloat conversion was added. Dates remain YYYY-MM-DD calendar strings, display DD/MM/YYYY, and use the existing Africa/Cairo today validation. ID and createdAt remain unchanged; updatedAt changes.

## Executed checks

| Check | Result |
| --- | --- |
| Backend lint, TypeScript and build | Passed |
| Backend automated tests | 16 groups passed, zero skips, including T05/T06 and real limited-role PostgreSQL update integration |
| Frontend lint and TypeScript | Passed without warnings |
| Frontend production build | Passed |
| Frontend API client tests | 13 groups passed, zero skips |
| T07 domain validation/formatting checks | Passed |
| T09 real browser → Express → PostgreSQL suite | 58 checks passed |
| T09 responsive/edit accessibility | 360/768/1440px, three audits with zero violations; focus entry, Escape/return and overflow checks passed |
| T08 browser regression | 61 checks passed, including six zero-violation accessibility audits |
| T07 fixture browser regression | 69 checks passed, including six zero-violation accessibility audits |
| Fresh disposable migrations and seed | Passed; repeatable seed, constraints, exact sums, timestamp invariants and denied DDL/TRUNCATE verified |
| T04 health regression | Exact 200 and simulated 503 responses passed |
| Database restart persistence | Updated record, ID, creation/update timestamps, exact amount/date and summary identical after PostgreSQL restart |

T09 browser cases cover all-field prefill, category clearing on type change, cancel without writes, exact PUT bodies, correct global totals, list refresh, focus return, persistence on reload, hidden-by-filter updates, safe backend field/body rejection, 503 rejection, unexpected 500, missing-record disabled saving/read recovery, committed-but-truncated response, failed and successful GET-only uncertainty checks, confirmed update plus read failure, and pending duplicate/dismissal locks. The API client separately tests network failure, timeout, malformed JSON and wrong-ID success envelopes without retries. Backend checks verify missing rows, invalid full bodies/UUIDs, parameter binding, sanitized failures, exact updated values/timestamps, summary changes, and reconnect persistence.

The test wrapper loses a PUT response after the update commits and headers are sent. This verifies one application PUT and four GET recovery requests without inducing transport-level retry behavior. Browser evidence is in ignored `.tmp-t09/verification.json` and `edit-360.png`, `edit-768.png`, `edit-1440.png`; T07/T08 evidence remains in their existing ignored directories.

An initial parallel backend run exposed the T06 fixture's TRUNCATE racing with the new T09 integration group. Backend test files now run serially, and all 16 groups pass against disposable PostgreSQL. A stale T07 browser session was closed/reopened; its full regression then passed. Neither issue required application behavior changes.

## Isolation and reproduction

No retained remote data was written. Browser integration used the existing disposable loopback PostgreSQL cluster on 55438 with `expense_tracker_app`. Fresh migration/security and restart checks used a newly initialized loopback cluster on 55439. Administrative fixture operations are test-only. The production backend still uses its unchanged configured pool and verified TLS.

1. Build the backend. Prepare disposable PostgreSQL using the existing T04 migrations/seed workflow. Never select retained data.
2. Set `T06_DISPOSABLE_DATABASE_URL` to the disposable administrative connection and run `npm test` in backend. The package runs test files serially; no database integration groups are skipped when this variable is set.
3. Set `T08_DISPOSABLE_DATABASE_URL` to a disposable loopback database named postgres; run `node frontend/scripts/t08-test-api.mjs` from the repository root. The wrapper serves loopback 4108 and now provides test-only update rejection/loss modes. It must never be deployed.
4. Start frontend dev with process-scoped `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4108/api/v1`; open http://localhost:3000. No real environment file needs changing.
5. From frontend run `node scripts/verify-t09.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE`, then the existing T08 and T07 runners. The T09/T08 runners reuse session expense-t08; run them sequentially. The T07 runner uses expense-t07 and development preview URLs.
6. Run frontend lint/typecheck/build/test/domain checks and backend lint/typecheck/build/tests.
7. For the separate restart test, prepare a fresh disposable cluster on 127.0.0.1:55439, apply the migrations using `verify-t04-database.mjs`, set `T09_DISPOSABLE_DATABASE_URL`, run `node backend/scripts/verify-t09-persistence.mjs prepare`, restart that cluster, then run the same script with `verify`. Its explicit host/port guard limits this write test to that disposable setup; the snapshot is ignored `.tmp-t09/restart.json`.
8. Stop verification-only API/database processes after testing.

## Changed and created files

- `.gitignore`: ignore T09 artifacts.
- `backend/package.json`: serial test execution for shared disposable fixtures.
- `backend/src/routes/transactions.ts`: PUT route and GET/PUT method policy.
- `backend/src/services/transactions.ts`: parameterized update/RETURNING mapper.
- `backend/tests/transactions.test.mjs`: updated item Allow regression expectation.
- `backend/tests/update.test.mjs`: new update validation, SQL, errors and PostgreSQL coverage.
- `backend/scripts/verify-t09-persistence.mjs`: restart verification.
- `frontend/src/lib/api/client.ts`: typed PUT and write uncertainty classification.
- `frontend/src/components/dashboard/dashboard.tsx`: live edit submission/refetch/success integration.
- `frontend/src/components/transactions/transaction-form.tsx`: missing-record and read-only recovery state.
- `frontend/tests/api-client.test.mjs`: update contract, errors and timeout coverage.
- `frontend/scripts/t08-test-api.mjs`: disposable update fault controls.
- `frontend/scripts/verify-t08.mjs`: Edit regression expects enabled persistence; Delete remains unavailable.
- `frontend/scripts/verify-t09.mjs`: new real integration browser suite.
- `README.md`, `docs/04-api-design.md`, `docs/05-implementation-plan.md`, `docs/t09-verification.md`: current endpoint/status and verification documentation.

## Completion decision

T09's full edit flow is implemented and verified locally. No unresolved T09 issue remains. T07/T08 and earlier backend regressions pass. The deployed site remains the earlier fixture build; integrated deployment is still T14. Ready for T10 — Add transaction deletion; T10 has not started.
