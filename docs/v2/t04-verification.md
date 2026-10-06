# T04 — P0 Fixture Prototype Verification

**Date:** 2026-10-06. **Acceptance status:** T04 ✅ Completed — implementation, browser verification and explicit user visual approval recorded. T05 is next and has not started.

## Review

Run `npm.cmd run dev` in `frontend` and open [the dashboard](http://localhost:3000/v2/dashboard). This browser UI is the visual source of truth. The existing [design system](http://localhost:3000/v2/design-system) stays available with its original specimen navigation.

Review the desktop [full dashboard](assets/t04/dashboard-full-1440.png), [analytics](assets/t04/analytics-1440.png), [ledger](assets/t04/transactions-1440.png) and mobile [dashboard](assets/t04/dashboard-360.png), [large accounts](assets/t04/accounts-stress-360.png), [stress ledger](assets/t04/transactions-stress-360.png), [card overpayment](assets/t04/account-overpayment-360.png), [exceeded budget](assets/t04/budget-exceeded-360.png), [over-target goal](assets/t04/goal-over-target-360.png), [validation](assets/t04/transaction-validation-360.png), [uncertain write](assets/t04/transaction-uncertain-360.png) and [pending transfer](assets/t04/transfer-pending-360.png). [Machine-readable browser results](assets/t04/browser-results.json) contain the final 39 route/viewport audits, 40 mobile state checks, network/error results and V1 isolation result.

**Explicit visual approval — 2026-10-06:** The user confirmed “T04 visual review is approved.” The reviewed code-first V2 browser prototype is approved as the visual source of truth, satisfying UX §39 and the T04 implementation-plan visual approval gate. The user instructed that the UI design remain unchanged. This acceptance update changes documentation only; all existing responsive, accessibility, build, test and V1-regression evidence below is preserved.

## Implemented routes and behavior

| Route | Fixture behavior |
| --- | --- |
| `/v2/login` | Email/password validation, show/hide password, pending, invalid credentials, session expiry, simulated sign-in and workspace bootstrap recovery |
| `/v2/register` | Display name/email/password/confirmation, validation, submitting, verification-required success and resend simulation |
| `/v2/forgot-password` | Email validation and neutral success; no email is sent |
| `/v2/reset-password` | New password/confirmation, validation, success and expired-link review state |
| `/v2/dashboard` | Dominant net position, subordinate actual income/expenses/savings, account rail, cash flow, ledger activity, expected recurring timeline, budget and manual-goal previews |
| `/v2/transactions` | Local description/account/category search; type/account/category/inclusive date filters; removable chips/clear; 25-row pagination; desktop ledger/mobile cards; create/edit/delete and neutral transfer examples |
| `/v2/accounts` | Net position including archived balances, six accounts/five active account types, status filter, add/edit/archive/restore, permanent opening-balance lock, transfer list/create/review/edit/delete |
| `/v2/recurring` | All/Income/Expenses/Upcoming filters, expected next-occurrence totals, sorted timeline, daily/weekly/monthly/yearly schedules, add/edit/pause/resume/archive |
| `/v2/analytics` | Savings narrative; actual income/expenses, category spending, savings bars, account activity, income sources, daily spending and separate expected commitments; six period choices and custom dates |
| `/v2/budgets` | Month selector, monthly category create/edit/delete, exact category spending, normal/near-limit/exceeded states and duplicate-category validation |
| `/v2/goals` | Manual saved/target amounts, optional target date/account metadata, create/edit, over-target suggestion, explicit completion, explicit reopen when reducing a completed goal and read-only archived goals |
| `/v2/settings` | Editable display name, read-only email/EGP/en/Africa-Cairo preferences, immutable system categories, custom category add/edit/archive/restore, accounts link and future security placeholder |

## Visual decisions

Warm neutral canvas, dark sidebar, thin borders, local outline icons, tabular numbers and restrained blue actions reuse T03. The dashboard uses asymmetric columns rather than equal summary cards. Ledger, schedule and planning pages emphasize rows and dividers. Analytics leads with a financial sentence; CSS bar plots require no chart package and retain textual amounts/percentages. Mobile uses a top bar and native navigation drawer, stacked finance sections and transaction cards. Prototype review controls are collapsed to keep normal pages focused on the product.

The initial overview reconciles to **53,880.00 EGP net position**, **20,000.00 EGP income**, **11,900.00 EGP expenses** and **8,100.00 EGP savings** for the fixture October activity. Income retained is **40.50%**. Account position includes all history and is independent of the selected reporting period.

## Fixtures and simulation

`frontend/src/features/v2/fixtures/index.ts` contains fictional user/accounts/categories/transactions/transfers/schedules/analytics/budgets/goals and reconciled opening balances. Older monthly summary records provide lightweight history. Fixture strings remain exact decimals; isolated integer-cent helpers support local presentation updates without floating-point money arithmetic. Production calculations remain the later backend's responsibility.

A V2-only React context keeps edits across client navigation, with no localStorage, sessionStorage, auth SDK, network client or fake API layer. Reload resets everything. Direct development navigation begins with a fictional session; sign-out/sign-in and the local expired-session view are simulations, not authorization. Transactions and transfers update the local account display; transfers never enter income/expense totals. Budget spending follows matching fixture expenses. Account/category archive pauses linked schedules; restore does not resume them.

## State coverage

All eight workspace pages provide populated/loading/empty/error/stale/stress review states, through collapsed controls or `?state=...`. Dashboard adds partial-error; analytics adds zero-income; recurring adds exhausted/overdue/posting-failed feedback. Empty analytics explains insufficient activity. Custom dates validate range boundaries. Transaction no-results and a month without budgets have dedicated empty views.

Every fixture editor supports field validation, success, simulated rejection, explicit pending preview and uncertain outcome. Pending disables fields/close/submit; the explicit finish control resolves the review simulation. Rejected drafts remain available. Uncertain writes disable resubmission and offer “Check latest records”, without automatic retry. Transfers validate distinct accounts, then show a separate review step. Destructive/lifecycle actions use confirmations.

## Responsive and accessibility evidence

All twelve P0 routes plus `/v2/design-system` were checked in Chrome at **360 × 900**, **768 × 900** and **1440 × 900**: 39 route/viewport combinations. Page scroll width matched each viewport; no horizontal page overflow was found. Desktop uses the ledger; mobile/tablet use cards. All eight workspace pages additionally passed mobile overflow checks for loading/empty/error/stale/stress: 40 combinations.

Axe-core audited the V2 region with WCAG 2 A/AA, WCAG 2.1 AA and best-practice tags. Final route audits reported **zero violations**. Initial mobile dashboard/ledger heading-order findings were fixed with page section headings and re-audited successfully. T03 audits remained at zero violations at all three widths. Mobile maximum-money/long-name/200-character-description pages and validation/uncertain/pending dialogs were audited separately.

Keyboard checks cover Tab/Shift+Tab containment, Escape, focus return, navigation drawer and blocked cancellation while pending. Native dialog cancellation is intercepted synchronously, and pending focus moves to an enabled control or the dialog when disabling submit would shift focus outside it. Deleted triggers fall back to the main landmark. Labels and associated multiline errors, headings, landmarks, focus-visible, 44px controls, non-color type/debt/transfer labels and textual chart summaries reuse the T03 components. Reduced-motion emulation reported spinner animation `none` and transition duration `0s`; existing T03 progress rules remain in effect. Automated audits and these keyboard checks are not a full accessibility certification.

Stress previews include `999,999,999.99 EGP`, long account/category names, exactly 200 description characters, multiline money errors, negative net position, negative card debt/credit balance, exceeded budgets and a 105% manual goal. Money stays exact; only bar geometry uses bounded numeric conversion.

## Checks and V1 isolation

- Frontend lint, TypeScript type-check and production build pass.
- Frontend tests: **27 passed** (22 existing V1 tests plus five meaningful exact-money/period/reconciliation tests).
- Browser checks cover filters, real local pagination, transaction add/edit/delete, preserved rejected/uncertain drafts, transfer same-account validation/review/pending/success, goal completion, period changes, account lifecycle, budgets, custom categories and auth forms.
- Browser resource inspection verifies zero API/Supabase requests during V2 interactions and no uncaught page errors.
- Production local server: all twelve prototype routes and `/v2/design-system` return **404**; `/` returns **200**.
- V1 populated fixture still renders Grocery shopping after V2 navigation, with no `.v2-theme` or inherited V2 token.
- V1 components/services/styles/root layout, backend, database, Supabase, migrations, configuration and application dependencies were not changed.

## Files

- Twelve `frontend/src/app/v2/<route>/page.tsx` entry points, V2 `layout.tsx` provider wiring and isolated `prototype.css`.
- `frontend/src/features/v2/{auth,charts,editor,pages,prototype-context,shell}.tsx`, `money.ts`, `periods.ts`, `fixtures/index.ts`.
- V2 `components/v2/primitives.tsx`: pending Escape/cancel robustness only; T03 components remain reused.
- `frontend/tests/v2-prototype.test.mjs`.
- UX/implementation-plan updates, this report and `docs/v2/assets/t04/` browser evidence.

Existing uncommitted T02/T03 work was preserved. No deployment or commit was performed.

## Limitations and handoff

This is a development-only product prototype. Simulated credentials accept any valid fictional inputs; no email, real session, persistence, database constraint, recurrence posting engine, cursor service or production financial computation is implemented. Recurring dates and historical summary records are illustrative fixtures. These are deliberate T04 boundaries, not incomplete T05 work.

T04 is ✅ Completed following explicit user visual approval on 2026-10-06. The approved code-first browser prototype remains the visual source of truth; its UI design must remain unchanged. Current checkpoint: T01 ✅ Completed; T02 ✅ Completed; T03 ✅ Completed; T04 ✅ Completed; T05 ⬜ Next.

Next task: **T05 — Configure Supabase Auth for V2**, in a separate task. T05 has not started. No frontend implementation, Auth/API, backend, database or migration work was performed for this documentation-only approval update.
