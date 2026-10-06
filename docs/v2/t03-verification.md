# T03 — Design System & App Shell Verification

**Status:** Completed — 2026-10-06. T04 is not started.

## Review surface and boundaries

Run `npm.cmd run dev` from `frontend`, then open <http://localhost:3000/v2/design-system>.
The browser implementation is the visual source of truth. Navigation jumps to component specimens; it does not pretend that T04 application routes exist.

`frontend/src/app/v2/layout.tsx` returns `notFound()` outside development. A local production server on port 3001 returned **404** for `/v2/design-system` with no showcase content, and **200** for `/`. No deployment was performed.

V2 CSS variables and selectors live under `.v2-theme`; the V1 root layout, page, global styles, components, services and configuration were not edited. After visiting V2, the existing `/?preview=populated` V1 fixture page rendered Grocery shopping correctly, had no `.v2-theme`, and inherited no `--v2-primary` variable. Browser resource inspection recorded zero API/Supabase requests during the fixture interactions. There are no fetch/auth clients, credentials, storage persistence or backend/database changes in the new area.

## Tokens and visual choices

Tokens are defined in `frontend/src/app/v2/v2.css`, with V2-prefixed Tailwind CSS 4 theme mappings. Canvas `#F5F6F2`, white surface, warm secondary surface `#EEF0E9`, sidebar `#11130F`, primary text `#161914`, secondary text `#666B62`, border `#DDE0D8`, blue primary `#2457E6`, income `#16845B`, expense `#CF3E46`, warning `#B7791F` and transfer `#5564C9` retain the approved direction. Separate dark income/expense/warning text tokens provide contrast on subtle surfaces. Focus, hover, active, selected, disabled, success/danger/info and subtle background tokens are included.

Local Arial/Helvetica sans-serif avoids an external font request or new font dependency. Text roles use 30/21/16px headings, 15px body, 13px supporting text and 12px captions; money uses tabular numbers. Spacing spans 4–64px; control/surface/dialog radii are 6/8/12/16px. Shadows are restrained and reserved principally for overlays.

The shell has a 232px persistent desktop sidebar, a 1400px maximum content width and 32px desktop gutters. Below 1024px, a top bar opens a native modal navigation drawer; tablet gutters are 24px, mobile gutters 16px. Composition uses a prominent flat metric, subordinate metric strip, account rail, dividers and schedule rows rather than uniform dashboard cards.

## Component inventory

| Source | Reusable components |
| --- | --- |
| `components/v2/app-shell.tsx` | V2AppShell, Sidebar, SidebarSection, SidebarItem, MobileHeader, MobileNavigationDrawer, PageHeader, UserArea |
| `components/v2/primitives.tsx` | Button (five variants); FormField, TextInput, MoneyInput, SearchInput, PasswordInput, DateInput, Select, Textarea, Checkbox, Toggle, SegmentedControl; FeedbackBanner, EmptyState, ErrorState, StaleIndicator, ArchivedState, Skeleton; DialogShell, ConfirmationDialog, Drawer, MobileFullScreenDialog, Pagination |
| `components/v2/finance.tsx` | MoneyDisplay, SummaryCard, AccountCard, AccountRow, AccountTypeBadge, TypeBadge, TransferBadge; TransactionRow, TransactionCard, TransactionTableHeader, TransactionActions, TransactionDateGroup; FrequencyBadge, RecurringStatusBadge, UpcomingItem, RecurringRow, RecurringCard; BudgetStatus, BudgetProgress, BudgetRow, GoalProgress, GoalCard, ChartShell |
| `components/v2/forms.tsx` | AddAccountForm, EditAccountForm, TransferForm, TransferSummary, RecurringForm, BudgetForm, GoalForm, CategoryForm, ProfileForm; CategoryRow, SettingsNav, SettingsSection, CompleteGoalConfirmation, ArchiveAccountConfirmation; SearchBar, FilterSelect, DateRangeField, FilterChip, ClearFilters, MobileFilterSheet |
| `components/v2/icon.tsx` | One local 24px outline SVG system; decorative icons hidden from assistive technology |
| `components/v2/dev/` | Isolated fictional exact-string data and the interactive component showcase |

PageHeader supports optional description, one action or multiple actions. Form examples demonstrate filled, invalid and disabled controls, linked labels/hints/errors, and preserved draft presentation. Filters expose idle/loading/error specimens, active removable chips and local search. Pagination demonstrates Previous/Next history, disabled/loading states, without showing cursor internals or invented page totals. Its three fixture rows deliberately remain the same when exercising controls; integration is later work.

Forms preview interactions only. Edit callbacks announce a local specimen interaction; they do not implement application editing flows. Chart shells have title, period, legend, text summary and loaded/loading/empty/error states; final charts are not built. System categories are read-only, custom categories expose edit/restore presentation. P1 reports/notifications/history/projections/suggestions are not required or implemented.

## Responsive and visual checks

Local Chrome verification used agent-browser 0.38.2.

| Viewport | Page width / scroll width | Result |
| --- | --- | --- |
| 360 × 900 | 360 / 360 | Top bar/drawer; stacked sections/forms/accounts; transaction cards; mobile filter sheet; no horizontal page overflow |
| 768 × 900 | 768 / 768 | Top bar/drawer; 24px gutters; paired specimens and compact metric strip; transaction cards; no horizontal page overflow |
| 1440 × 1000 | 1440 / 1440 | Persistent sidebar; asymmetric rail; desktop ledger; 32px gutters; no horizontal page overflow |

Screenshots preserve reviewed specimens (before the final addition of explicit Active account badges and filter-state selector): [mobile shell](assets/t03/mobile-shell.png), [tablet shell](assets/t03/tablet-shell.png), [desktop shell](assets/t03/desktop-shell.png), [mobile account stress](assets/t03/mobile-account-stress.png), [mobile ledger stress](assets/t03/mobile-ledger-stress.png), [full-screen mobile error dialog](assets/t03/mobile-dialog-error.png).

Native dialog width initially retained the browser's default maximum width. An explicit mobile `max-width: 100%` corrected this; final measurement was **360 × 900**, with page scroll width 360. Regular form dialogs had matching client/scroll widths (322px at mobile); drawers retain comfortable margins. Long content remains vertically scrollable.

## Accessibility checks

Temporary axe-core audits ran WCAG 2 A/AA, WCAG 2.1 AA and best-practice tags on the V2 area. **Zero violations** were reported at all three widths: 37 passing rules at mobile/tablet and 41 at desktop. Additional modal-only audits reported zero violations for navigation, transfer form, confirmation pending, drawer uncertain and mobile error states. Filter loading/error, chart error/recovery and custom category states also passed. These are recorded automated and manual checks, not a full accessibility certification.

Verified manually through browser keyboard interaction:

- Landmarks, skip link, heading hierarchy, labels and associated helper/error text.
- Visible focus; forward Tab and Shift+Tab wrap inside the form dialog.
- Native modal/inert background; Escape closes ordinary dialogs and returns focus to the originating button (including navigation).
- Pending confirmation has `aria-busy=true`, remains open on Escape, disables close/submit, and offers a clearly labeled fixture-only finish control. Error/uncertain dialogs preserve the form/context.
- Buttons, summaries and navigation items have at least 44px height; checkbox/switch/radio labels enlarge their activation areas. Product links also have 44px height.
- Financial meaning uses signs, words and type labels alongside color; credit-card debt is explicitly Amount owed, and overpayment is Credit balance.
- Reduced-motion emulation disabled spinner animation (`none`) and progress transitions (`0s`).

## Stress and financial presentation checks

- `999,999,999.99 EGP` remains an exact decimal string, grouping without Number/parseFloat conversion; it fits the mobile savings card.
- National Bank Savings and Emergency Reserve Account and Professional Education and Certification Expenses wrap in account/history/budget specimens.
- Exactly 200 characters of description render in the transaction card/ledger without clipping or page overflow. Multiline validation copy preserves line breaks and wraps.
- All six account types, archived history, zero, negative asset balance, positive card debt and negative card credit are represented. Transfers are neutral and distinct from income/expense; card payments do not invent another expense.
- Budget 75.33%, 92% and 108% states show remaining/over-budget text. Manual goal progress of 105% remains explicit and requires a separate completion action.
- Only progress-bar geometry converts supplied percentages to a bounded Number; exact financial amounts/totals are never calculated with floating point. Goal completion eligibility is supplied explicitly, never inferred from a rounded percentage. Specimens have independent data, not a reconciled full dashboard.
- Search for groceries reduced three cards to one; Clear filters restored three. Loading disabled search/pagination; error retained last loaded rows. A form preview closed and announced nothing was saved, with zero API requests.

## Quality checks and dependencies

`npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` passed. `npm.cmd test` passed all **22 existing frontend tests**. Chrome reported no page errors during the final checks. Production route exclusion and the V1 fixture regression were checked separately as described above.

No application dependencies, package manifests or lockfiles changed. Existing dependencies were restored with `npm.cmd ci`. agent-browser, axe-core and Prettier were used temporarily under ignored `.npm-cache` for verification/formatting, without adding runtime packages. No Figma tools were used.

## Handoff

T03 acceptance is satisfied. Continue with **T04 — Build V2 P0 UI Prototype with Fixtures**, reusing these components to implement the approved P0 routes/states. T04 has not begun. Real Auth/API integration, financial services, production data and final chart implementations remain their later planned tasks.
