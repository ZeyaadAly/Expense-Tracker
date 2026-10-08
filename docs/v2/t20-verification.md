# T20 — Account detail verification

**Status: completed locally, 2026-10-08.** Focused P1 is explicitly promoted by the task request. T21 remains unstarted. No transaction CRUD, transfer API, analytics, report, forecasting, schema change or remote deployment was introduced.

## Route and real-data boundary

`/v2/accounts/[id]` renders the connected AccountDetailPage. The Accounts list provides an accessible View account link. Dynamic account routes now participate in the existing T08 ProtectedBoundary, profile bootstrap gate and safe sign-in return-path handling. V2 remains development-only under the existing layout; no production visibility is promoted.

The detail page reads real authenticated `/api/v2/accounts/:id` and `/api/v2/accounts/:id/summary` through T10. It does not import account fixtures, create client financial totals, simulate activity or submit transfers. Synthetic records exist only in isolated tests. The shared shell's development label and existing prototype provider for other routes are preserved; financial account content comes exclusively from the authenticated API.

## Authoritative summary and backend scope

The only new API is GET `/api/v2/accounts/:id/summary`, returning exact decimal strings for currentBalance, openingBalance, totalIncome, totalExpenses, incomingTransfers and outgoingTransfers plus EGP. It authenticates through T09, validates the UUID, rejects query parameters and unsupported methods, uses no-store, scopes every aggregate by verified user ID, and hides missing/foreign accounts identically with 404 NOT_FOUND. It has no ownership output or mutation.

T18's existing materialized scoped-account CTE and balance formula are reused. Transaction and transfer aggregates gain directional totals; they still group independently before joining accounts. Each summary is one parameterized PostgreSQL statement; SQL NUMERIC performs all financial arithmetic. Existing list/detail/mutation/net-position resources retain their shape and exact balances. No additional balance formula, schema, grants, index or mutable balance cache is added.

Resource and summary reads run concurrently. Because separate requests can straddle a write, the store publishes the pair only if current and opening balances agree exactly. A mismatch or refresh failure keeps the last consistent data with stale feedback; initial failure renders no invented zeros. Foreign/missing reads clear retained content and show the same generic not-found state. Retry is read-only.

All six summary values represent all posted owned history, not a selected analytics period. Transfers are directional movement totals and are not counted as transaction income/expense. Archived accounts remain readable with historical balances. Metadata uses supported name/type/status/created date/opening fields; dates display in Africa/Cairo. No notes or other fields are invented.

## Activity, actions and credit cards

Recent activity deliberately says “Activity becomes available with Transactions.” Detailed activity is deferred until T21. Transfer and filtered transaction CTAs are omitted; no fixture feed or simulated successful action appears beside real data.

The existing T19 AccountDialog and accounts mutation store are shared by both routes. Detail edit sends the real full PUT, respects permanent opening and asset/card conversion locks, preserves draft and safe error feedback, and refreshes after confirmed success. Pending/uncertain writes retain T19 protections and are never automatically retried. Dialog focus return and cancellation are inherited and verified on detail.

Archive requires explicit confirmation and explains linked recurring pause and historical retention. Success leaves the detail page usable with Archived status and Restore action. Restore explicitly explains that schedules remain paused. Real database inspection verified pause on archive and no automatic resumption on restore. No new activity actions are exposed on archived detail.

Credit-card current balances use the shared MoneyDisplay debt semantics: positive is Amount owed; negative is Credit / overpayment and Credit balance. Asset balances retain signed presentation. Neither card debt nor overpayment is labelled cash income.

## Ownership and session isolation

Detail components are keyed by user ID and account ID. User changes unmount account content and dialogs immediately; store cleanup aborts reads and writes, increments lifetime/request generations, and suppresses obsolete responses even if a transport ignores abort. The account client's token supplier refuses a different current user. A 401 clears resource and summary and delegates session invalidation to T08.

Browser verification used actual Supabase SDK session events with synthetic A/B identities and real ES256 JWT/JWKS Express verification. Switching A to B removed A's account while B's reads were pending. B requesting A's detail and summary received generic 404; direct reload showed no A content. Missing IDs produce the same state. Tests also verify deep-link protection before sign-in and safe post-login return URLs.

## Responsive and accessibility

Verified at **360, 768 and 1440px** with a long account name, a derived 1000000000.00 balance, -999999999.99 asset balance, positive card debt, negative card overpayment, and archived state. Detail headings, action controls, summary grids, metadata and edit/archive dialogs had no horizontal overflow. Mobile and desktop screenshots were visually inspected.

**13 axe-core 4.14.0 audits** (detail/edit/archive/archived at each width, plus not found) found **zero WCAG 2 A/AA or 2.1 AA violations**. Heading structure, text statuses, debt/credit labels, loading announcements, error alerts, accessible fields, locked controls and trigger focus return are covered. Existing T19 shared dialog focus containment/pending safeguards remain unchanged.

Evidence: [browser results](assets/t20/browser-results.json), [360px](assets/t20/detail-360.png), [768px](assets/t20/detail-768.png), [1440px](assets/t20/detail-1440.png).

## Tests and quality

- Frontend lint, type-check and production build passed. Full suite: **86 passed, zero failures/skips**, including eight new T20 client/store/auth-boundary tests and all existing T19 tests. The extended T20 teardown test verifies both read and write cancellation.
- Backend lint, type-check and build passed. Regular suite: **41 passed, zero failures, 12 explicitly environment-gated integration skips**. Explicit ESLint for both browser scripts and the modified integration helper passed.
- Separate real disposable integration: **3 tests passed, no skips**, including **599 T16 isolation checks + 263 T17 lifecycle checks + 285 T18/T19/T20 balance/summary checks**. New assertions cover known exact breakdowns, foreign/missing summary 404, authentication, query/method rejection, read-only snapshots, and list/detail/summary balance equality across owned active/archived asset/card accounts. The existing four transfer combinations, locking races, rollback faults and 5,000-transaction/2,000-transfer query-plan regression pass.
- Browser acceptance: **46 passed**, including 13 axe audits. Covers the requested A lifecycle through edit/archive/restore/reload and B direct access, locked editing, definite rejection/draft retention, aborted network requests and recovery, service failures, stale data and initial no-data failures. Final evidence is stored in the linked JSON.
- Git whitespace check passed. No dependency or package lockfile changed.

## Disposable environment and reproduction

Only password-free loopback PostgreSQL 17 test data and synthetic A/B users were used. No application .env or hosted financial credentials were used by the fixture API. Windows Application Control blocked fresh initdb loading dict_snowball.dll. Verification instead used an isolated workspace copy of the existing synthetic T11 cluster, checked its exact data_directory, replaced only that copy's database with an empty template0 database and removed copied test roles. The original cluster was unchanged. Existing guarded setup then prepared the required baseline in that empty database. A separate fresh database was used for browser verification; no unrelated migration rehearsal was rerun.

To reproduce on an empty disposable cluster: build backend, set T18_DISPOSABLE_DATABASE_URL to `postgresql://postgres@127.0.0.1:55451/postgres`, and run `node --test backend/tests/v2-account-balances.test.mjs`. Use a different empty database/cluster for the browser fixture; do not reuse initialized integration data.

Start `backend/scripts/t19-browser-api.mjs` with the same explicit loopback URL in T19_DISPOSABLE_DATABASE_URL. Start frontend dev with NEXT_PUBLIC_SUPABASE_URL=`https://t19-auth.invalid`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`sb_publishable_localfixture`, and NEXT_PUBLIC_API_BASE_URL=`http://127.0.0.1:4000/api/v1`. Origin must be `http://localhost:3000`.

Temporary browser tools used Playwright 1.64.0 and axe-core 4.14.0 installed only under ignored `.tmp-v2-t20/`. Run `node backend/scripts/verify-t20-browser.mjs`; T20_PLAYWRIGHT_MODULE, T20_AXE_PATH and T20_CHROME_EXE can override local tooling paths. The default executable is installed Chrome on Windows. The driver requires fresh synthetic data and writes token-free evidence to docs/v2/assets/t20. Stop the fixture/dev servers and copied database after verification.

The Supabase security guidance and [JWT/JWKS documentation](https://supabase.com/docs/guides/auth/jwts) were reviewed; the existing verified-sub authorization remains intact. The markdown changelog fetch was unsupported, so the breaking-change index was checked. No Supabase SDK/API feature or hosted configuration was changed.

## File inventory

Created:

- frontend/src/app/v2/accounts/[id]/page.tsx
- frontend/src/features/v2/account-detail-page.tsx
- frontend/tests/v2-account-detail.test.mjs
- backend/scripts/verify-t20-browser.mjs
- docs/v2/t20-verification.md
- docs/v2/assets/t20/browser-results.json and detail-360/768/1440.png

Updated:

- frontend/src/features/v2/accounts-page.tsx — navigation and shared dialog export
- frontend/src/lib/accounts-store.ts — detail reads, consistent summaries and isolation
- frontend/src/lib/api/accounts.ts — validated authenticated detail/summary reads
- frontend/src/lib/auth/redirects.ts and frontend/src/features/v2/protected-boundary.tsx — dynamic route protection
- frontend/src/app/v2/v2.css — responsive detail layout
- backend/src/services/account-balances.ts — focused grouped summary
- backend/src/services/accounts.ts and backend/src/routes/accounts.ts — read-only endpoint
- backend/tests/helpers/account-balances.mjs — direct database/API isolation and balance regressions
- backend/scripts/t19-browser-api.mjs — test-only detail failure/latency controls
- docs/v2/03-ux-specification.md, 06-api-design.md, 07-implementation-plan.md — promotion/contracts/checkpoint
- .gitignore — disposable T20 tooling/data

No genuine blocker remains. Ready for **T21 — Upgrade Transaction Backend to V2 Ownership**, which has not been implemented.
