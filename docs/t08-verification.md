# T08 — Frontend API integration verification

**Date:** 2026-10-03  
**Status:** ✅ Completed. T09/T10 have not started.

## Scope and architecture

The normal dashboard uses GET `/api/v1/transactions`, GET `/api/v1/summary`, and POST `/api/v1/transactions` through Express only. Existing T07 components and styles are reused. Browser access to Supabase, update/delete integration, authentication, schema changes and new dependencies were not added. Backend source, exact-origin CORS, limited-role privileges and production verified TLS remain unchanged.

`frontend/src/lib/api/client.ts` reuses transaction/summary types, validates successful envelopes and list metadata, and supplies a typed `ApiError`. Raw server messages and detail text are never shown; known fields map to safe local validation copy, and other failures use form-level feedback. Missing/unsafe API configuration produces a readable configuration error before fetching. Requests omit credentials, use no-store, and have a 15-second timeout. The public API prefix is configured with `NEXT_PUBLIC_API_BASE_URL`; production embeds it at build time.

## Reads and filters

`use-api-read.ts` manages each resource independently, with an AbortController and request version. Older or canceled requests cannot commit state. Key mismatches hide old list rows immediately when filters change. Retries can target list, summary or both; successful creation and uncertainty checks refresh both. Filters send only supported lowercase type/category values, omit All values and preserve AND semantics. No filter parameters reach summary. The backend list ordering and `meta.count` are used directly without local filtering or insertion.

Summary values come solely from the server as decimal strings. Initial loading never invents zeros. Previously loaded summary values may remain during refresh, labelled Updating, or stale after failure with Retry. Empty database and no-filter-results states use the summary count; unknown or inconsistent counts use neutral wording.

## Creation and recovery

The existing Add form validates locally, then POSTs exactly five string fields: type, amount, category, date, description. Backend validation is authoritative; values remain available on rejection. A validation focus defect found during integration was fixed by focusing after pending controls are re-enabled.

Confirmed 201 with a valid transaction closes the dialog, returns focus, announces success and refetches the filtered list and unfiltered summary. Active filters remain; a hidden saved record gets the existing explanatory message and Reset action. No optimistic row insertion or browser summary arithmetic occurs.

Known validation/503 rejections preserve the draft with safe error feedback. Network/timeout failures, malformed success responses and unexpected 500 outcomes are uncertain: no automatic application POST retry or success claim. Refresh dashboard performs reads only, keeps the draft, and enables deliberate resubmission only after both reads succeed. Similar records cannot prove which request created them. Confirmed save plus failed reads displays Saved, but the dashboard could not refresh, with read-only recovery.

The loss simulation truncates JSON after a committed POST and response headers. Dropping a socket before headers caused Chrome transport retries in an initial harness attempt; the revised test isolates post-commit response loss and verifies one recorded POST. The application itself issues one fetch and never retries a write.

Edit opens the prefilled T07 form with explicit preview messaging and disabled Save changes. Delete shows identifying confirmation context and explicit unavailable messaging; confirmation performs no mutation. Neither action sends PUT, DELETE or a mock persisted mutation.

## Exact money and dates

Amounts `0.10`, `0.20`, `1000.00`, `999999999.99`, and unrestricted summary strings remain strings. No monetary Number/parseFloat conversion or balance recomputation is used in the live dashboard. Exact formatting and signed presentation reuse T07 helpers. Calendar dates remain YYYY-MM-DD on the wire and DD/MM/YYYY in rows/cards; today's form boundary uses Africa/Cairo.

## Executed checks

| Check | Result |
| --- | --- |
| Frontend lint | Passed, no warnings |
| Frontend type-check | Passed |
| Production build | Passed; main route statically prerendered with client API loading |
| `npm test` | 10 API-client groups passed; no skips |
| T07 domain verification | Passed |
| T08 browser integration | 61 checks passed against unchanged T06 routes/service and disposable PostgreSQL |
| Live responsive/accessibility | 360/768/1440px; six axe audits with zero violations |
| T07 fixture browser regression | 69 checks passed, including six zero-violation audits |
| Restart persistence | Identical seven records, IDs, dates, money, timestamps and summary after frontend/Express/PostgreSQL stop/start; browser showed retained rows and 999.20 balance / 1000.00 income / 0.80 expenses |
| Disposable migration/role regression | Unchanged migrations, repeatable seed, constraints, exact arithmetic and limited-role checks passed |
| Scope/whitespace review | No backend/schema/role changes; no PUT/DELETE API functions or direct Supabase browser calls; diff check passed |

Browser cases cover independent loading, success, partial/both failures, scoped retry, empty database, exact POST bodies, focus return, exact totals, persistence, filter queries/category reset, obsolete-request protection, hidden records, field rejection, 503, unexpected 500, committed-but-unconfirmed POST, failed/successful read-only recovery, refresh failure after success, pending locks and unavailable edit/delete actions. Expected HTTP/network errors were deliberately generated in failure tests; final restart inspection found no framework overlay or horizontal overflow.

## Changed and created files

- API/state: `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/use-api-read.ts`.
- Dashboard/preview: `frontend/src/app/page.tsx`, `frontend/src/components/dashboard/dashboard.tsx`, `frontend/src/components/dashboard/fixture-dashboard.tsx`, `frontend/src/components/dashboard/summary.tsx`.
- Shared UI: `frontend/src/components/transactions/transaction-form.tsx`, `frontend/src/components/transactions/transaction-dialog.tsx`, `frontend/src/components/transactions/transaction-panel.tsx`, `frontend/src/components/ui/feedback.tsx`.
- Verification: `frontend/tests/api-client.test.mjs`, `frontend/scripts/verify-t08.mjs`, `frontend/scripts/t08-test-api.mjs`, `frontend/scripts/verify-t07.mjs`.
- Configuration/docs: `frontend/package.json`, `frontend/.env.example`, `.gitignore`, `README.md`, `docs/05-implementation-plan.md`, `docs/t07-verification.md`, `docs/t08-verification.md`.

## Test isolation and reproduction

All writes used a newly initialized disposable PostgreSQL cluster at loopback port 55438, with the unchanged migrations and application role `expense_tracker_app`. No retained remote data was written. The administrative connection is used only by the test wrapper for explicit fixture setup and independent inspection. Trust authentication is confined to this local test cluster; production connection code is unchanged.

1. Prepare a disposable loopback database named `postgres` with the existing T04 migration runner. Never select retained data.
2. From repository root, set `T08_DISPOSABLE_DATABASE_URL` privately to that disposable administrative connection; run `node frontend/scripts/t08-test-api.mjs`. It serves loopback 4108 and uses existing compiled backend modules. Build the backend first if `dist` is absent. Its `/__test` controls are test-only and must never be deployed.
3. From `frontend/`, start dev with process-scoped `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4108/api/v1`; open `http://localhost:3000` in Chrome through agent-browser session `expense-t08`. CORS uses the existing documented localhost origin.
4. Run `node scripts/verify-t08.mjs PATH_TO_AGENT_BROWSER`. The runner resets/seeds only that selected disposable database through the test wrapper. Evidence is saved in ignored `.tmp-t08/verification.json`, screenshots and persistence snapshots.
5. Run frontend lint/typecheck/build/test and `node scripts/verify-t07-domain.mjs`. For the fixture regression suite, use session `expense-t07` and run the existing T07 browser script; it now explicitly chooses development preview URLs.
6. Stop the test wrapper, test frontend and disposable PostgreSQL when finished. No real `.env.local` or database secret was written by this verification.

## Completion decision

T08's first full-stack create/read/summary flow works and is verified with real Express and PostgreSQL, including restart persistence. T07's provider limitation remains historical and non-blocking. No unresolved T08 implementation issue remains in the verified scope. The deployed Vercel URL remains the earlier fixture build; integrated hosting is a separate T14 task.

Ready for **T09 — Add transaction editing**. T09 and T10 were not implemented or marked started.
