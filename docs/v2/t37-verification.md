# T37 — Build V2 Dashboard UI

Date: 2026-10-12. **Completed locally for implemented T36 core domains. Production not applied.** T38 is unstarted. No backend financial semantics, schema, migrations, secrets, V1 source or remote resources changed. Earlier uncommitted T33/T34/T36 work is preserved.

## Data flow and authoritative presentation

The protected `/v2/dashboard` route mounts DashboardPage instead of PrototypePage and bypasses PrototypeProvider. Profile/bootstrap and usable-session gating remain in T08. The shell identifies a connected development dashboard. The story is page load/period selection → T10 authenticated GET → T09 verified JWT → T36 read-only snapshot → exact-string dashboard presentation.

The typed dashboard client uses createSessionClient with the mounted user ID. T10 owns fresh token retrieval, destination normalization, HTTP parsing, structured safe errors and cancellation. The client validates the frozen period, summary, account/transaction resources, upcoming occurrences and staged metadata; it rejects numeric financial values, owner fields in resources, invalid dates, wrong-period responses and malformed collections. Existing account/transaction parsers are exported and reused without changing their semantics.

Net Position uses T36 `summary.totalBalance` (the API name for net position). Assets, signed card debt, income, expenses and netSavings are rendered from their corresponding server fields. MoneyDisplay retains strings and only inserts grouping/sign/currency presentation. The browser never sums account/transaction arrays, subtracts debt, derives savings, predicts occurrences or invents chart values. Positive debt is labelled Amount owed; negative debt is labelled Credit balance and Overpayment; negative savings states Expenses exceed income. Status and debt meanings are textual as well as colored.

Exactly five human-readable options map to this_month, last_month, 3_months, 6_months and 1_year. Backend resolved from/to and Africa/Cairo are displayed unchanged. Account balances/net position and global recent activity remain independent of the selected period. Each period change issues a new GET, aborts its predecessor and suppresses obsolete responses by controller identity/lifetime, even if cancellation is ignored. Prior values remain visible with their own returned period label and bounds while refreshing or after failure. The selected requested period is never applied as a label to an older snapshot. Retry performs GET only.

## Accounts, activity, recurring and deferred sections

The asymmetric overview, dominant net position, account rail, fine dividers, warm surfaces, tabular money and editorial typography reuse T04 structure and T03 primitives. T36's active and archived account resources appear in deterministic server order with currentBalance and status; each links to the existing T20 detail route. Archived balances remain explicitly included. No sorting or balance calculation occurs in the UI.

Recent activity displays T36's latest five owned transactions in returned order, with description, exact type/amount, account, category, date and Generated badge when supplied. View all links to Transactions without invented filters. Upcoming uses the shared UpcomingItem presentation and the returned occurrence dates, names, amounts, account names and horizon; it is explicitly expected activity separate from posted actuals. View all links to Recurring. No processing controls or scheduler requests are exposed.

Charts, budget cards and goal cards are hidden for the T36 core stage, together with their unfinished navigation destinations on this dashboard. There are no placeholder financial values or derived chart series. Other fixture pages and design-system specimens retain their existing infrastructure. Future T38/T42/T43/T45 data integration is still required for full P0 previews; it does not prevent the implemented domains from rendering real data now.

Empty sections are independent: accounts offer Add account, recent activity offers Add transaction and upcoming offers Add recurring item through existing connected pages. Initial loading shows skeletons without invented zeros; initial failure shows a safe error and retry without money. Definitive empty responses render authoritative zero strings. Refresh failure retains a clearly stale complete snapshot. Shared errors never expose raw backend or network details.

## Session isolation

ConnectedDashboard is keyed by authenticated user ID. User/epoch replacement unmounts the old page/store through the existing protected/profile boundary. Cleanup aborts reads and clears retained snapshots; request lifetime checks suppress late old-user success and failure. B gets a fresh default this_month store, with no A values, accounts, recent rows or schedules during loading. A 401 clears financial content, invalidates the existing Auth session and invokes existing sign-out/redirect behavior; the dashboard adds no custom redirect path. Tokens and money are not stored in browser persistence by this feature.

Browser A→B testing replaces the actual synthetic Supabase session through the existing broadcast mechanism while an A read is delayed. The guard immediately removes A's content, B receives its own empty dashboard, and the delayed A response does not reappear. Unit tests additionally cover ignored aborts, late rejections and 401 read shutdown.

## Browser and cross-domain evidence

Fresh password-free PostgreSQL 17 at 127.0.0.1:55451, migrations through T32 and system categories, synthetic ES256/JWKS Auth, real production services and limited expense_tracker_app operations. The test-only backend binds to loopback and never loads application .env. Browser public configuration is synthetic; external fetches are blocked. Operational fixture endpoints are absent from application entry points.

Final browser suite: **447 checks, 20 axe audits, zero audited violations**, no horizontal overflow at **360/768/1440**. Audited states include empty, populated, retained stale, initial error, large negative/overpaid-card stress, B-empty, keyboard period control and reduced motion. The period selector has a label, metrics have meaningful labels, panels have associated headings, account links retain focus outlines, and loading/error/stale announcements are available. Representative desktop/tablet/mobile screenshots were visually inspected; exact large amounts remain visible and long descriptions wrap. A primary link-button inherited the base anchor color during the first empty-state axe audit; a dashboard-scoped inverse text rule corrected its contrast, followed by the passing full run.

The browser creates real accounts, boundary transactions, a card payment and recurring definition through a loopback setup calling the existing production services. All six displayed summary values and all account/recent/upcoming rows are compared to real T36 responses after each stage and for all five periods. Known dates bracket the 1-year, 6-month, 3-month, last-month and current-month boundaries. The full backend T36 suite separately verifies Cairo midnight/leap/year transitions; the browser displays its returned bounds without recomputation.

Cross-domain checks compare dashboard net position with Accounts summary, all account balances with active/archived Accounts resources, recent transaction resources with Transactions and upcoming with the first five T29 occurrences. Account, Transactions, Recurring and account-detail navigation successfully loads the existing pages. Transfers affect balances but preserve posted income/expenses. Internal test setup runs T31 once: the real generated row appears in recent activity/period totals; deletion via the existing transaction service removes it from dashboard after refresh while the durable posted marker remains. Reload retains database-backed values.

Slow-period tests verify only the latest requested snapshot renders. Retained-stale error/retry preserves the earlier period identity; initial error renders no money. Stress uses actual persisted maximum-value expenses and a card credit, producing derived multi-billion negative asset/net/savings values and signed card overpayment. No fixture-only financial override is used.

Evidence: [browser result](assets/t37/browser-verification.json), [desktop](assets/t37/populated-1440.png), [tablet](assets/t37/populated-768.png), [mobile stress](assets/t37/negative-overpaid-large-360.png), [mobile empty](assets/t37/empty-360.png).

## Quality, regressions and production boundary

- Frontend lint, typecheck and production build pass.
- Full frontend suite: **140 passed, zero failed/skipped**, including **10 focused T37 client/store/boundary tests**.
- Browser: **447 checks, 20 axe audits, zero violations**, as above.
- Fresh T36: **4 tests passed, 214 grouped integration checks**.
- Fresh T31: **3 tests passed, 403 checks**, 12 forced races and 12 recovery/failure probes.
- Fresh T32: **2 tests passed, 103 checks**.
- Fresh T29: **3 tests passed, 357 checks**, 10 races and 11 rollback faults.
- Fresh T18/shared regression: **3 tests passed**; T16 599, T17 263, T18 285, T21 244, search 263, filters 3263, pagination 6065, T26 917 and recurring isolation 31 checks; zero failures. This provides the requested focused T18/T21/T26 regression coverage.
- Local production smoke: V1 root HTTP **200**, `/v2/dashboard` HTTP **404**. V2 remains development-only behind the unchanged layout gate. Existing V1 transport tests confirm no V2 Authorization header leaks into V1 requests.
- Source/docs/compiled-backend credential scan and git diff --check pass. No production secrets are required, printed or committed.

## Reproduction and file inventory

Build backend. Initialize a fresh isolated loopback PostgreSQL 17 cluster at 127.0.0.1:55451/postgres with password-free postgres admin and no app/Auth schema or application/browser roles. Set only T37_DISPOSABLE_DATABASE_URL to the guarded disposable URL, then run `node scripts/t37-browser-api.mjs` from backend. It refuses non-disposable URLs and existing schemas/roles. Existing migrations and seed are applied only to this fresh database. Separate fresh copies are needed for each gated backend suite; the ignored reset runner checks the exact `.tmp-v2-t37/pgdata` directory before resetting its own database.

Start frontend dev with synthetic NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1, NEXT_PUBLIC_SUPABASE_URL=https://t37-fixture.supabase.co and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t37_fixture_only. Launch isolated local Chrome/CDP on port 9224 and run `node scripts/verify-v2-dashboard.mjs` from frontend. The fixture reference date is 2026-10-12, with only past/current financial writes. Adapt the explicit test date for future reproduction without changing application period semantics. The runner is designed for a fresh fixture database. All local helpers and the disposable cluster are stopped after verification.

Added:

- frontend/src/lib/api/dashboard.ts
- frontend/src/lib/dashboard-store.ts
- frontend/src/features/v2/dashboard-page.tsx
- frontend/tests/v2-dashboard.test.mjs
- frontend/scripts/verify-v2-dashboard.mjs
- backend/scripts/t37-browser-api.mjs
- docs/v2/t37-verification.md and assets/t37 evidence

Updated:

- frontend/src/app/v2/dashboard/page.tsx
- frontend/src/features/v2/protected-boundary.tsx and shell.tsx
- frontend/src/lib/api/accounts.ts and v2-transactions.ts (export existing parsers)
- frontend/src/app/v2/prototype.css (scoped layout/amount/focus/link contrast)
- frontend/tests/v2-transactions.test.mjs and v2-recurring.test.mjs (expanded connected-route boundary)
- docs/v2/03-ux-specification.md and 07-implementation-plan.md
- .gitignore (disposable scratch directory)

No local T37 blocker remains. Next core task: **T38 — Implement Analytics Queries**. It is not implemented here.
