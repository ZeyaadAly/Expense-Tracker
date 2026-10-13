# T40 — Connected Analytics page verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `8bf26bcd84d2163cdea032e253d5cc12334bd69e`. Production-preview financial acceptance remains intentionally deferred. T41 remains optional/unstarted and is not promoted by this task.

## Real API integration and controls

`/v2/analytics` now renders a user-keyed connected page through the existing protected/profile boundary, without mounting the prototype fixture provider. A domain-specific client uses the T10 session-bound transport for `GET /api/v2/analytics/overview`, validates the frozen T39 response structure and retains exact strings/nulls. T10 continues to own token lookup, cancellation and safe transport errors. The route sends only required explicit from/to and optional accountId; no backend preset/category/owner parameter is introduced.

The frozen Analytics presets are **7 days, 30 days (default), 3 months, 6 months, 1 year and Custom**. Daily presets end on Cairo today inclusively; month presets begin at the first day 2/5/11 calendar months earlier. Custom keeps entered calendar strings, validates both dates/order/1900–9999/max 366 days without clamping and focuses invalid range input. Backend validation errors retain the selected range and show recognized field messages. There is no URL synchronization or browser-persisted financial state. Active and archived accounts come from the authenticated Accounts client; archived labels remain selectable. All accounts omits accountId. A safe 404 retains the prior labelled snapshot and offers choosing All accounts/another account without ownership disclosure.

## Presentation and authority

The factual narrative leads with backend net savings, income, expenses, savings rate and average daily spend. Null rate renders **Not applicable**; negative savings retains its sign and **Expenses exceed income** text. No P1 insights, budgets or goals were added. All monetary display uses the existing string-safe formatter; no Number/parseFloat money conversion or frontend totals/percentages/recurrence calculations occur.

Monthly income/expense bars and savings line reuse the approved lightweight chart language and T39's chronological zero-filled/clipped series. BigInt arithmetic computes only bounded plot coordinates relative to a visual scale; it never sums or changes financial values. An exact monthly table supplies each plotted value/date as a readable equivalent. Category rows display backend IDs/names/amounts/percentages directly, including archived history, with backend percentages driving decorative horizontal bars. Income sources are shown separately from expense categories. Empty breakdowns explain the missing history.

Account activity preserves separate income, expenses, savings, transferred in and transferred out. Recurring commitments use backend projected income/expenses/net cash flow and range, clearly labelled **Expected / Projected**, with current-active-definition assumptions explained. No projection is combined with posted actual summary values. Month-end and leap-year forecast displays were checked against real T38/T30 outputs.

## Loading, recovery and session isolation

Initial loading has skeletons and no invented financial zeros. Refresh retains the previous successful content, with its loaded date/account scope, and announces progress. Initial failure renders a safe retry state without money; refresh failure labels retained data stale. GET retry is user-triggered. AbortController, request identity and lifetime checks prevent old success/failure from replacing newer filters. Accounts and overview reads start together.

The mounted page/store is keyed by authenticated user ID and existing profile/session epoch. Session replacement unmounts the old store, cancels requests, clears metrics/chart rows/account options and initializes B independently. A late A result or 401 cannot alter B. A current 401 uses the existing Auth invalidation/sign-out flow; Analytics adds no login mechanism. Real browser A→B replacement during delayed A reads passed with no A values/options remaining.

## Browser evidence

The browser talks through T10 to a loopback Express app using real T09 ES256/JWKS verification and limited-role PostgreSQL services. The database is a newly initialized synthetic-only PostgreSQL 17.11 cluster in ignored `.tmp-v2-t40/pgdata`; guards check the exact directory before local resets. No production URL, credential, retained restore or remote mutation is used. The harness uses synthetic public frontend configuration and blocks external browser fetches; test setup endpoints exist only in the loopback runner, never application entry points.

Final browser suite: **894 checks, 20 axe audits, zero violations**, at **360 / 768 / 1440**, no page-level horizontal overflow. Audits cover empty/populated, retained stale, initial error, large/negative/long-content stress, B-empty, validation and reduced motion. Headings/labels, chart text equivalents, retry, account selection and keyboard controls are exercised. Charts have keyboard-focusable internal scrolling where needed, and no chart animation is required. Representative desktop/tablet/mobile screenshots were visually inspected.

Browser stages create accounts, actual history, a transfer and recurring definition; run T31; compare DOM values/monthly rows/categories/accounts/forecast with real T39 responses; verify transfer exclusion, generated actual inclusion/deletion and reload persistence; archive an account and custom category; inspect month-end/leap projections; exercise all five presets, custom max/rejected over-limit range, account filtering, stale 404, retry, out-of-order requests and A/B isolation. Stress uses persisted maximum amounts and long account/category names, not response overrides. Summary income/expenses/savings reconcile with real Dashboard responses for **all five T36 periods** and with displayed Analytics values through the browser.

Evidence: [browser result](assets/t40/browser-result.json), [desktop](assets/t40/populated-1440.png), [tablet](assets/t40/populated-768.png), [mobile stress](assets/t40/stress-360.png), [mobile empty](assets/t40/empty-360.png).

## Quality and regressions

- Frontend lint, typecheck and production build passed.
- Full frontend suite: **149 passed**, zero failures/skips, including **nine focused T40 tests** for range/client/store/session/authority boundaries.
- T39 real HTTP/auth/validation/gate tests: **three passed**.
- Fresh direct T38 and T39 HTTP matrices: **77 grouped checks each**, three tests each.
- Fresh T36: **214 checks**, four tests passed.
- Fresh T31: **403 checks**, three tests passed; 12 forced races and 12 fault probes.
- Fresh T32: **103 checks**, two tests passed.
- Fresh T29: **357 checks**, three tests passed; 10 races and 11 faults.
- Fresh T18/shared: three tests passed; T16 599, T17 263, balances 285, transactions 244, search 263, filters 3263, pagination 6065, transfers 917, recurring isolation 31 and Analytics API isolation 14 checks; zero failures.
- Secret/artifact scan and `git diff --check` pass. React review confirmed keyed session lifecycle, stable store subscription, bounded geometry, parallel reads, accessible controls and no new chart dependency.

## Fixture, V1 and production boundaries

Analytics fixture rendering was removed only from the runtime route. Existing `pages.tsx`, `charts.tsx`, fixture definitions and isolated T03/T04 specimens remain available; the connected page uses separate authoritative chart adapters. Dashboard navigation now includes the implemented Analytics page while planning placeholders remain hidden in the connected Dashboard/Analytics shell.

V1 application/API/transport source is unchanged; existing frontend V1 transport tests pass without V2 Authorization leakage. Production root retains its existing Auth redirect. Local production smoke returned **404 /v2/analytics**, **404 /v2/dashboard**, **200 /v2/login**, **307 /**. The unchanged financial layout remains the gate; the Vercel backend still does not register Analytics, and cron remains empty/disabled. No remote database/environment change, manual deployment or hosted acceptance was performed. Existing main Git integration may build the push, with gates preserved. Local browser/API/Next/PostgreSQL helpers are stopped after verification; ignored synthetic artifacts remain local.

## Reproduction and changed files

Build backend. Initialize a fresh password-free loopback PostgreSQL 17 cluster at 127.0.0.1:55451/postgres with no app/Auth schema or application/browser roles. Set T40_DISPOSABLE_DATABASE_URL only to that disposable admin connection; run `node scripts/t40-browser-api.mjs` from backend. Never point it at retained data. The harness uses fixed October 2026 test dates; for future reproduction, update its explicit fixture clock/reference dates together, preserving production date semantics.

Run frontend development with synthetic NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1, NEXT_PUBLIC_SUPABASE_URL=https://t37-fixture.supabase.co and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t37_fixture_only. Launch isolated Chrome/CDP on port 9224, then run `node scripts/verify-v2-analytics.mjs` from frontend against a fresh fixture database. Browser result/screenshots are written to ignored `.tmp-v2-t40`.

Added frontend API/range/store modules, connected page/chart components, nine focused tests, browser runner, synthetic backend browser harness, this report and evidence. Updated Analytics route, shared shell/profile fixture boundary, scoped styling, ignore rule, README/UX/implementation-plan/production-preview checkpoints. No backend application/service, dependency, schema or Vercel configuration changed.

## Remaining work

No known T40 blocker remains. Exact next numbered task: **T41 — Add Deterministic Financial Insights — P1 Optional**, requiring explicit promotion. It remains unstarted. Next core task: **T42 — Build Budget Backend**. Neither starts automatically; deferred production-preview acceptance remains separate.
