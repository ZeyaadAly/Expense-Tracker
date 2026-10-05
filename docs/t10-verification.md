# T10 — Transaction deletion verification

**Date:** 2026-10-05  
**Status:** Completed. T11 has not started.

## Implemented behavior

DELETE `/api/v1/transactions/:id` uses the existing query/body policy and UUID validator before calling the shared transaction service. One parameterized statement, `DELETE FROM expense_tracker.transactions WHERE id = $1 RETURNING id`, deletes only the selected UUID. The existing limited-role pool, schema, grants, TLS configuration and centralized error handling remain unchanged. No returned row produces structured 404 `TRANSACTION_NOT_FOUND`; confirmed deletion produces 204 with no body and existing no-store headers. GET and PUT remain supported; unsupported item methods return 405 with `Allow: GET, PUT, DELETE`.

The typed `deleteTransaction(id)` sends one bodyless DELETE. The shared request helper returns immediately for the expected 204 without parsing JSON. Other statuses reuse structured errors and safe messages. DELETE joins POST/PUT in conservative uncertainty handling for network loss, timeouts, unexpected statuses, malformed responses and unexpected 500 errors. No write is automatically retried.

The existing T07 confirmation shows description, type, category, exact amount and DD/MM/YYYY date. Cancel writes nothing. Explicit confirmation uses both a synchronous lock and disabled pending controls; `Deleting…` retains visible context and blocks dismissal. Confirmed 204 closes the dialog, restores focus, announces `Transaction deleted.`, and refreshes the current filtered list and unfiltered global summary. No optimistic deletion or client totals were added.

A structured 404 closes the confirmation, shows `This transaction is no longer available.`, and refreshes both reads without claiming success. Definite rejection keeps context with safe feedback and permits deliberate retry. Uncertain outcomes retain context and block confirmation until a deliberate read-only refresh succeeds. That recovery reloads the filtered list and summary and additionally checks the unfiltered list for the selected ID, preventing filters from falsely implying absence. An absent record closes the dialog with availability feedback; an existing record permits deliberate retry. Failed reads keep the retry gate. Recovery never sends DELETE and never claims unconfirmed success.

After confirmed deletion, failed refresh uses `Deleted, but the dashboard could not refresh.` and Retry requests only failed reads. Active filters remain selected. The existing create/edit refresh wording stays unchanged. Decimal strings, date-only values, design tokens and dialog focus behavior remain intact.

## Executed checks

| Check | Result |
| --- | --- |
| Backend lint, typecheck, production build | Passed |
| Backend automated groups | 20 passed, zero skips, including real limited-role PostgreSQL create/read/update/delete |
| Frontend lint, typecheck, production build | Passed; final lint has no warnings |
| Frontend API-client groups | 15 passed, zero skips |
| T07 domain validation/formatting | Passed |
| T10 browser → Express → PostgreSQL | 34 checks passed |
| T10 responsive/accessibility | 360/768/1440px; three audits, zero violations; pending dismissal and focus checks passed |
| T09 browser regression | 58 passed, including three zero-violation accessibility audits |
| T08 browser regression | 61 passed, including six zero-violation accessibility audits |
| T07 fixture regression | 69 passed, including six zero-violation accessibility audits; browser setup workaround below |
| Fresh migrations/security | Repeatable seed, constraints, exact totals, timestamp invariants, limited-role CRUD and denied DDL/TRUNCATE passed |
| T04 configured TLS health | Exact 200 success and simulated 503 failure passed |
| PostgreSQL restart persistence | Deleted ID remains absent; list and global summary identical before/after restart |

Backend deletion coverage verifies empty no-store 204, UUID/query/body rejection before SQL, parameter binding, missing-record envelope, sanitized 503/500 errors, target isolation, GET/list absence, exact summary/count and reconnect persistence. Existing T05/T06/T09 groups verify unchanged reads, create/update validation, method policy, ordering, exact money and timestamps. API-client checks verify method/path, no body, no 204 JSON parsing, structured 400/404/503 errors, network failure, timeout and unexpected response uncertainty without retry.

Browser coverage verifies selected context, cancel, pending locks, exactly one DELETE, confirmed success, focus, filter preservation, authoritative reads, reload persistence, missing records, definite failure and deliberate retry, successful deletion plus failed refresh, committed-but-truncated responses, unexpected 500, failed/successful read-only uncertainty checks and responsive accessibility.

The standard T07 runner stalled at its browser `set media light reduced-motion` setup command even after resetting its session. Its 69 unchanged assertions passed using the working expense-t08 session and an ignored temporary runner that omits only media emulation. Application/UI code and the tracked T07 runner were not changed for this tool issue. Existing default media settings were used; this run does not claim reduced-motion emulation coverage. T08/T09/T10 runners use the working session normally.

Initial sandboxed quality commands could not replace existing generated files; approved execution outside the sandbox succeeded. Initial new-test lint/type errors and a browser selector that targeted the dialog close button were corrected before final verification.

## Isolation and reproduction

No retained remote data was written. Integration/browser tests used disposable loopback PostgreSQL on 55438; fresh migrations and restart verification used a newly initialized cluster on 55440. Fixture administration remains test-only. The configured production database was contacted only by the read-only TLS health check.

1. Build backend and prepare disposable PostgreSQL with existing migrations and seed. Set `T06_DISPOSABLE_DATABASE_URL` to its administrative loopback connection; run backend `npm test` (serial execution avoids shared fixture races).
2. Set `T08_DISPOSABLE_DATABASE_URL` to that loopback database named postgres; run `node frontend/scripts/t08-test-api.mjs` from the repository root. This test-only wrapper serves 4108 and must never be deployed.
3. Run frontend dev with process-scoped `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4108/api/v1`.
4. From frontend, run `node scripts/verify-t10.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE`, then T09/T08 sequentially. T07 uses fixture preview URLs. Evidence is ignored `.tmp-t10/verification.json` and `delete-360.png`, `delete-768.png`, `delete-1440.png`.
5. Run package lint/typecheck/build/tests and `node frontend/scripts/verify-t07-domain.mjs`.
6. For fresh security verification, initialize a disposable PostgreSQL cluster on 55440, set `DISPOSABLE_DATABASE_URL`, and run `node backend/scripts/verify-t04-database.mjs`.
7. Set `T10_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55440/postgres`; run `node backend/scripts/verify-t10-persistence.mjs prepare`, restart that cluster, then run with `verify`. The script explicitly guards host/port/database and snapshots only test data in ignored `.tmp-t10/restart.json`.
8. Stop verification-only processes when finished. No environment files or credentials need changing.

## Changed and created files

- `.gitignore`: ignore T10 evidence and disposable cluster.
- `backend/src/routes/transactions.ts`: DELETE and item Allow policy.
- `backend/src/services/transactions.ts`: parameterized deletion with RETURNING.
- `backend/tests/transactions.test.mjs`: completed item method regression.
- `backend/tests/delete.test.mjs`: deletion contract, validation, SQL, errors, integration and reconnect checks.
- `backend/scripts/verify-t10-persistence.mjs`: guarded deletion restart verification.
- `frontend/src/lib/api/client.ts`: typed DELETE, empty 204 and uncertainty classification.
- `frontend/src/components/dashboard/dashboard.tsx`: confirmation integration, feedback, refresh and recovery.
- `frontend/src/components/transactions/delete-confirmation.tsx`: confirmation retry gate.
- `frontend/tests/api-client.test.mjs`: DELETE contract and error coverage.
- `frontend/scripts/t08-test-api.mjs`: test-only DELETE fault controls.
- `frontend/scripts/verify-t08.mjs`: replace obsolete delete-placeholder expectation with enabled confirmation/cancel regression.
- `frontend/scripts/verify-t10.mjs`: deletion browser suite.
- `README.md`: current deletion behavior and verification link.
- `docs/04-api-design.md`: implemented status and verified deletion contract.
- `docs/05-implementation-plan.md`: T10 completion; T11 remains unchecked.
- `docs/t10-verification.md`: this report.

## Completion decision

T10 deletion is fully implemented and verified locally. No unresolved application issue remains. The browser media-emulation limitation is documented above. Ready for T11 — Filtering, stale requests, and recovery polish; T11 was not implemented or marked started. Integrated deployment remains T14.
