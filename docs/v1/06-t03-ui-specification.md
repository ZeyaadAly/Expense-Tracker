# T03 Design Specification

**Date:** 2026-10-03  
**Status:** Approved T03 design reference; T07 implemented it and T08–T11 connected persistence/recovery. Local V1 is verified through T12.

> This document retains the original design-stage decisions and T07 notes. Skeleton/fixture/later-task statements describe those checkpoints, not the current application. See [handoff](07-handoff.md) and [T12 verification](t12-verification.md) for current behavior.

**Approved design:** [Expense Tracker in Figma](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA).
**Deliverable:** UI specification; actual Figma creation occurred after this document was prepared. The implementation font remains Arial/Helvetica, with Inter used only as a Figma fallback.

## Basis and scope

Read alongside [brief](01-project-brief.md), [requirements](02-requirements.md), [database design](03-database-design.md), [API design](04-api-design.md), and [implementation plan](05-implementation-plan.md). Requirements and API rules govern behavior; the layout and tokens below are proposed design decisions for Figma.

At the specification checkpoint, the frontend was a Next.js 16.3.8 / React 19 / Tailwind 4 skeleton with Arial/Helvetica, one placeholder page, and no component library. `frontend/CLAUDE.md` points to `frontend/AGENTS.md`; that file requires consulting installed Next.js guides before code changes. No additional project frontend skill files were found. This specification preserves the existing font family and proposes mobile-first Tailwind-compatible rules without writing code.

V1 has one English dashboard, EGP only, a shared transaction collection, and no login. Include create, read, edit, delete, summary, and type/category filtering. Exclude charts, budgets, search, date filters, pagination, sorting controls, accounts, export, currency selection, category management, and extra navigation. PUT/DELETE are planned for T09/T10; their designs are required now but their endpoints are not implemented in T06.

## Screens

### 1. Dashboard — route `/`

Reading order: header → feedback region → financial summary → transactions heading → filters → list/state. Use one centered content column, maximum width 1200px. No sidebar or separate detail screen is needed.

| Section | Purpose and content | Hierarchy and desktop layout | Mobile layout |
| --- | --- | --- | --- |
| Header | Identify app and expose primary action | H1 “Expense Tracker”, subtitle “Track your income and expenses in EGP”; Add Transaction button aligned right | Title/subtitle followed by full-width Add Transaction button |
| Feedback region | Announce mutation success, refresh failures, or uncertain outcomes | Inline banner between header and summary; absent when unused | Same location, wrapped text, actions below message |
| Summary | Explain overall finances | H2 “Financial summary”, visible caption “All transactions”; three equal cards: Current Balance, Total Income, Total Expenses | Three stacked cards in the same order |
| Transactions heading | Introduce recorded activity and list count | H2 “Transactions”, caption “Newest transaction dates first”, optional “2 transactions” from list `meta.count` | Heading and count wrap naturally |
| Filters | Narrow only the list | Labelled type and category selects, Reset Filters on same row; note “Filters apply to the transaction list only.” | Controls and Reset Filters stacked, full width |
| Transaction list | Review every matching record and edit/delete it | Semantic table with six columns; state panel replaces table body when necessary | Stacked transaction cards; no horizontal page scrolling |

Sections use 24px internal padding on desktop and 16px on mobile; major section gaps are 32px desktop / 24px mobile. Filters and list form one bordered transaction panel. Keep Add Transaction available in empty/error states. Do not use a fixed floating button or sticky header.

### 2. Summary cards

Exactly three financial cards; no fourth count card. The API's `transactionCount` is used to classify empty states, not introduced as a financial metric.

| Label | API value | Display and semantic treatment | Optional decorative icon |
| --- | --- | --- | --- |
| Current Balance | `data.balance` | Largest emphasis; normal text when nonnegative, danger text when negative; visible minus sign for negative values | Wallet |
| Total Income | `data.totalIncome` | Two decimal places; income text role; no minus sign | Arrow into wallet |
| Total Expenses | `data.totalExpenses` | Two decimal places; expense text role; show positive expense total, not a negated total | Arrow out of wallet |

Each card: 14px medium label, 28px semibold tabular-digit value, 14px EGP label. Use explicit `EGP`, not an ambiguous currency symbol. Format decimal strings with grouping separators and exactly two fractional digits without converting through floating-point numbers. Zero values are `0.00 EGP`. Summary totals can exceed the maximum single-transaction amount; cards grow and amounts wrap gracefully with EGP on another line when needed. Do not truncate money or abbreviate it to K/M.

Icons, if used, share an 18–20px stroke style and are hidden from assistive technology. Labels and signs convey meaning without color. A failed summary read displays “Summary unavailable” with Retry; never invent zero values. During initial load, retain card labels and show value skeletons.

### 3. Transaction list and record presentation

Use the T06 response fields `id`, `type`, `amount`, `currency`, `description`, `category`, `date`, `createdAt`, `updatedAt`. Show friendly labels for lowercase type/category codes. IDs and timestamps remain internal keys, action identifiers, and ordering metadata; they are not user-facing columns.

**Desktop/tablet at 768px and above:** Date | Description | Category | Type | Amount | Actions. Approximate widths: 12% / 30% / 14% / 12% / 18% / 14%; allow intrinsic adjustment. Date and type remain readable, description wraps, amount is right aligned, actions expose text buttons Edit and Delete. Use a 48px header minimum and 64px row minimum; rows grow for long descriptions. No whole-row click interaction or selectable checkboxes.

**Mobile below 768px:** Each card shows a type badge and signed amount on the first row (allow wrapping), description below, labelled category/date metadata, then visible Edit and Delete buttons. Use 16px padding and 12px internal gaps. Render all description text, including a 200-character unbroken string, using safe plain text and word wrapping. Never rely on hover to reveal details or actions.

Display amounts as `+1,000.00 EGP` for income and `−250.50 EGP` for expense. These signs are presentation only; API amounts stay unsigned positive strings. Use income/expense text roles plus explicit Income/Expense badges. Display calendar dates as `DD/MM/YYYY` with English digits, e.g. `30/09/2026`. Do not shift dates through timestamp/timezone conversion.

Keep API ordering: date descending → creation timestamp descending → ID descending. Show every returned match with ordinary page scrolling; no pagination/load-more control.

| List state | Visual content and action |
| --- | --- |
| Initial loading | Five desktop skeleton rows / three mobile skeleton cards, “Loading transactions…”; no zero count or empty message yet |
| Confirmed empty database | “No transactions yet” / “Add your first income or expense to get started.” / Add Transaction; requires successful list and summary reads with overall count zero |
| No filter results | “No transactions match these filters” / “Try another type or category.” / Reset Filters; requires active filters and known nonempty collection |
| Read error | “Transactions could not load” with public explanation and Retry; keep filters visible |
| Refiltering | “Updating transactions…”; prevent old rows from appearing to match new selections by hiding old results until the new list arrives |
| Empty list with summary unavailable | “No transactions to display. The overall summary is unavailable.” Show relevant Retry; do not assert empty database or known nonempty collection |

If unfiltered list and summary disagree because they observed different committed moments, use neutral empty wording and allow Refresh; never infer hidden records solely from conflicting responses.

### 4. Filters

Use native labelled selects. Apply on change, without an Apply button. Both filters use AND logic and affect only GET `/transactions`; GET `/summary` receives no query parameters.

| Control | Label / default | Options | Change and reset rules |
| --- | --- | --- | --- |
| Type select | “Type” / “All types” | All types, Income (`income`), Expense (`expense`) | Type changes recompute categories; clear incompatible category to All categories |
| Category select | “Category” / “All categories” | With All types: Salary, Freelance, Gift, Food, Transport, Shopping, Bills, Entertainment, Other, preceded by All categories | With Income: Salary, Freelance, Gift, Other. With Expense: Food, Transport, Shopping, Bills, Entertainment, Other. Other appears once and may stay selected across type changes |
| Reset button | “Reset Filters” | No options | Restores both All defaults; disabled when already at defaults; preserve keyboard focus |

Map labels to lowercase codes; omit parameters for All, never send literal `all` or empty strings. Preserve selections after mutations and read failures. Reload persistence is unnecessary. Refiltering shows progress and discards outdated responses. If a filter request is rejected, associate supported query errors with the relevant selector and offer reset/retry; no fabricated empty result.

### 5. Add / edit transaction dialog

One reusable modal dialog, centered and maximum 560px wide on desktop/tablet. Mobile uses a full-screen dialog with safe viewport height, an internally scrolling form, and footer in normal flow. No extra application route is needed. Title: “Add transaction” or “Edit transaction”; supporting text: “All fields are required. Amounts are in EGP.”

Order: Type → Amount → Category → Date → Description → feedback → actions. Use a full-width type group, then two equal columns for Amount/Category and full-width Date/Description on desktop/tablet. Mobile stacks every field. All five fields are required and use explicit labels.

| Field | Control and initial state | Helper / placeholder | Validation and presentation |
| --- | --- | --- | --- |
| `type` | Native radio group with Expense and Income styled as two segments; Add defaults to Expense | Legend “Type” | Require `expense` or `income`; keyboard radio behavior remains native |
| `amount` | Text input with decimal keyboard hint; Add empty; visual EGP suffix outside value | Label “Amount (EGP)”; placeholder “250.50”; helper “0.01–999,999,999.99; up to 2 decimal places.” | Canonical unsigned decimal string; reject zero, negatives, excess precision, leading zeros, whitespace, grouping separators, symbols and exponent notation; do not round or silently clean invalid syntax |
| `category` | Native select; Add empty disabled placeholder “Choose a category” | Label “Category”; options determined by type as above | Required valid code for type; clear invalid selection on type change; preserve Other |
| `date` | Native date input; Add defaults to current Africa/Cairo date | Label “Date”; helper “From 01/01/1900 through today (Cairo).” | Strict valid date between 1900-01-01 and today in Africa/Cairo inclusive; API uses YYYY-MM-DD; native display may follow browser locale while list dates use DD/MM/YYYY |
| `description` | Three-row textarea; Add empty | Label “Description”; placeholder “Grocery shopping”; helper “1–200 characters after trimming.” | Trim leading/trailing whitespace; count Unicode code points; reject blank or over 200; plain text only |

Amount syntax follows `^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$` plus the exact range check. Examples `10`, `10.5`, `10.50` are valid. Do not use a numeric input that accepts exponent notation or numeric JSON amounts. Do not rely on HTML maxlength alone for the Unicode description rule; allow correction and show a code-point counter.

Edit prepopulates all five values from the selected record. Type changes apply the same category rules as creation. Reuse the form and validation, but title and submit label change. The implemented Edit flow sends all five fields to PUT `/transactions/:id`; no new row is created.

Footer: Cancel secondary, “Add transaction” primary (edit: “Save changes”). On mobile, primary is full width and Cancel follows below; keep DOM/tab order consistent with visual order. A labelled close button is available in the header. Escape/Cancel/Close close without saving when idle; backdrop clicks do not dismiss. While submitting, lock editable controls and dismissal, disable repeated submission, and label the primary action “Saving…” with spinner. Do not disable submit merely because untouched fields are invalid; a submit attempt should expose their errors.

Validate on submit, then revalidate affected fields as corrected or blurred. Display red border plus text under each invalid field, linked accessibly to it. Add a form-level “Check the highlighted fields.” summary with links to invalid inputs, then focus the first invalid field. Preserve all entries on rejection. Map `error.details[].field` to known fields; `body`, unknown-property, or route errors belong in form-level feedback.

After confirmed 201/200 success, close dialog, return focus, announce “Transaction added.” / “Transaction updated.”, and refetch the active filtered list and unfiltered summary. If the returned saved record fails current filters, append “It is hidden by your current filters.” with Reset Filters. Confirmed success followed by read failure shows “Saved, but the dashboard could not refresh.” with Retry reads only.

Definite server rejection: keep dialog open and entries intact; display public error text and appropriate correction/retry action. Timeout, lost connection, or unexpected 500: show “We could not confirm whether this transaction was saved. Refresh and check your transactions before trying again.” Offer “Refresh dashboard” to perform reads while retaining the form draft; no automatic write retry. After checking, allow a deliberate retry with the warning that similar records do not prove which request created them. POST has no idempotency protection.

Missing-record edit: “This transaction is no longer available.” Keep the draft visible, disable saving that ID, offer Close and refresh the list; never convert it into a create operation automatically.

### 6. Delete confirmation dialog

Title “Delete transaction?”; text “This permanently removes the transaction. You cannot undo this.” Display description, type, category, signed amount/EGP and date so the record is identifiable. Desktop max width 440px; mobile fits viewport with 16px margins and an internally scrollable content area. Initial focus is Cancel. Footer: Cancel secondary and Delete transaction danger.

While pending: “Deleting…”, disable confirmation and dismissal, retain identifying context. On confirmed 204 close, announce “Transaction deleted.” and refresh list/summary. Do not parse JSON from 204. A 404 shows “This transaction is no longer available.” and refreshes list; it is not a successful deletion claim. Definite failures preserve confirmation context and provide retry. Uncertain outcomes require refresh/check before deliberate retry, as for saves. Refresh failure after success: “Deleted, but the dashboard could not refresh.” with Retry reads. No undo action.

### 7. Consistent UX states and accessibility

| Situation | Required behavior |
| --- | --- |
| Dashboard initial load | Summary skeletons and list skeletons independently; announce loading once per region; no invented values |
| Partial API failure | Keep the successfully loaded section usable; failed section has its own Retry. A full failure exposes both failures with one Retry all action |
| Background refresh | Keep previously successful summary visible with “Updating…”; if failed, label “Previously loaded totals; could not refresh.” with Retry. Do not present stale values as current |
| Validation failure | Preserve inputs; inline field messages and focus first invalid field; no success banner |
| Mutation pending | Disable duplicate write and dismissal; show Saving/Deleting text; retain context |
| Confirmed mutation success | Close dialog, visible persistent status banner, refresh both reads, retain filters |
| Successful write / failed refresh | Explain confirmed write separately from failed reads; retry only failed reads |
| Uncertain write | Retain draft/context; show check-before-retry instructions; never announce success or automatically repeat write |
| Empty / no matches | Distinct copy and Add / Reset action as defined above |

Use semantic H1/H2 headings, labelled table headers/selects/inputs, a radio fieldset, readable text badges, and accessible action names such as “Edit Grocery shopping” and “Delete Grocery shopping”. Provide a polite live region for success/loading and alert region for errors without duplicate announcements. Banners remain until dismissed or superseded; no short-lived toast as the sole feedback. Error Retry buttons act on the failed read scope.

Dialogs have accessible names, focus containment, background inertness, visible focus, and focus return to their trigger; if a deletion/filter removes that trigger, return focus to the Transactions heading. Add dialog initially focuses Type; Edit focuses the first editable field. Idle Escape closes; pending Escape does not. Touch controls are at least 44px high/wide. Aim for 4.5:1 normal text contrast and 3:1 large text/control/focus contrast; verify actual Figma combinations. Reduced motion replaces animation with static loading marks. Skeletons are decorative and do not generate many screen-reader announcements.

## Components

These are conceptual data needs, not React implementations. Share API transaction/summary shapes rather than inventing fields.

| Component | Purpose | Major props / data needs |
| --- | --- | --- |
| DashboardHeader | Title/subtitle and primary Add action | onAdd |
| SummarySection | Three overall financial values and read status | summary `{totalIncome,totalExpenses,balance,currency,transactionCount,scope}`, loading/error/stale, onRetry |
| SummaryCard | Consistent label/value/icon | label, decimal value, currency, balance/income/expense role, loading/unavailable |
| TransactionPanel | Heading, match count, filters and list/state | list result, overall count availability, filter state, read state, callbacks |
| FilterBar | Type/category selection and reset | type/category, fixed options, pending/errors, onChange/onReset |
| TransactionList | Switch table/cards at breakpoint | transactions, loading/error, empty classification, onEdit/onDelete/onRetry |
| TransactionRow / TransactionCard | Record details and visible actions | transaction, onEdit/onDelete, action-disabled state |
| TypeBadge / MoneyDisplay | Consistent text/type and exact monetary display | type; decimal string/currency, signed display mode |
| TransactionDialog | Accessible Add/Edit wrapper | open, mode, initial transaction, onClose, submission state |
| TransactionForm | Five fields, validation and save feedback | mode, initial editable values, field/general errors, pending/uncertain, onSubmit/onCancel/onRefresh |
| FormField | Shared label/helper/error layout | label, required, input identifier, helper, error, control |
| DeleteConfirmation | Identify and confirm one deletion | transaction, open, pending/error/uncertain, onConfirm/onCancel/onRefresh |
| DialogShell | Shared overlay/focus/scroll behavior | title, description, open/pending, children, initial/return focus |
| FeedbackBanner | Persistent success/error/stale feedback | status, message, action label/callback, dismissible |
| EmptyState / ErrorState / LoadingState | Consistent regional status | title/message, contextual action, skeleton table/cards/summary variant |
| Button | Shared actionable styles | primary/secondary/danger/text, label, disabled/pending, optional decorative icon |

## Design System

Use a restrained light theme. These are proposed semantic tokens, not changes to existing CSS. Figma variables and future CSS/Tailwind tokens should share names and values. No dark-theme requirement.

| Color token | Proposed value | Role |
| --- | --- | --- |
| canvas | #F8FAFC | Page background |
| surface | #FFFFFF | Cards/dialogs/inputs |
| surface-muted | #F1F5F9 | Table headings/skeleton base |
| text | #0F172A | Main text and balance |
| text-muted | #475569 | Captions/helpers |
| border | #CBD5E1 | Card/table separators |
| border-control | #64748B | Input/select outline |
| primary / primary-hover | #1D4ED8 / #1E40AF | Primary buttons; white label |
| focus | #2563EB | Visible 2px focus ring with 2px offset |
| income / success | #166534 | Income and confirmed success text |
| success-surface | #F0FDF4 | Success banner/badge background |
| expense / danger | #B91C1C | Expense/negative balance/error/delete text or danger button with white label |
| danger-hover / danger-surface | #991B1B / #FEF2F2 | Destructive hover and error background |
| info / info-surface | #1E40AF / #EFF6FF | Updating/general feedback |
| warning / warning-surface | #92400E / #FFFBEB | Stale/uncertain outcomes |

Typography: existing Arial, Helvetica, sans-serif; H1 30px/36px semibold desktop, 24px/32px mobile; H2/dialog title 20px/28px semibold; summary value 28px/36px semibold; body/input/button 16px/24px; label/helper/badge/table header 14px/20px. Monetary values use tabular digits. No text smaller than 14px. Avoid all-caps headings.

Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Use 4/8px for icon/text gaps, 8px label-to-control, 4px control-to-error, 16px field gaps, 24px card/dialog padding on larger screens, and responsive page gutters below. Radius: controls/buttons 8px, cards/dialogs 12px, badges pill. Border: 1px semantic border; error inputs use danger. Shadows: cards none, dialogs `0 16px 48px rgba(15,23,42,0.18)`; overlay black at 40%. Avoid decorative gradients.

Buttons: primary filled blue, secondary white/control border, danger red, text action with underlined hover and visible focus. Minimum height 44px, padding 12px 16px, medium label, consistent disabled treatment with actual disabled semantics. Disabled text/border use text-muted/border on surface-muted and a noninteractive cursor. Hover/focus/pending/disabled variants exist for every button; pending includes text plus spinner.

Inputs/selects: white surface, 1px control border, 8px radius, 44px minimum height, 12px horizontal padding, 16px text; textarea minimum 96px. Focus ring uses focus token; invalid border plus text/helper; disabled surface-muted. Cards: surface, 1px border, 12px radius, 16/24px padding. Status badges/banners pair semantic text/background with icon and clear status words. Color never carries meaning alone.

## Responsive Rules

Proposed breakpoints follow default Tailwind widths: mobile base `<768px`, tablet `md` 768–1023px, desktop `lg` ≥1024px. Tailwind `sm` 640px may help small controls but does not change the list to a table. Verify at the required 360px, 768px and 1440px widths and also 320px for wrapping robustness.

| Element | Mobile | Tablet | Desktop |
| --- | --- | --- | --- |
| Page | 16px gutters, 24px vertical padding | 24px gutters, 32px vertical padding | 32px gutters, 48px vertical padding, max 1200px centered |
| Header | Stacked title/subtitle/Add | Title left, Add right if content fits; otherwise wrap | Title left, Add right |
| Summary | One column, 12px gaps | Three equal columns, 16px gaps | Three equal columns, 24px gaps |
| Transactions | Cards, visible actions | Wrapped-content six-column table | Table with more description space |
| Filters | One column, 12px gaps | Two selects plus reset, allow wrapping | One row, note below |
| Form | Full-screen dialog; one column; 16px padding | Centered 560px dialog, 24px padding; Amount/Category share row | Same form, no oversized dialog |
| Delete | Bounded dialog, stacked actions if needed | Centered 440px dialog | Same |

Set content/table cells to allow shrinking and wrapping. Category “Entertainment”, 200-code-point descriptions, very large summary totals, error messages, and amounts must fit without hiding controls. No page-level horizontal scrolling, icon-only mobile actions, hover-only content, or separate hamburger navigation. At zoom or narrow available widths, permit layouts to stack naturally. Dialog content scrolls within available viewport; header/footer never cover inputs. Account for mobile safe-area insets and onscreen keyboard. Use auto layout in Figma, flexible widths and minimum heights rather than rigid text boxes.

## Figma Frame Checklist

Create one design file later with pages `Foundations`, `Components`, and `V1 Screens`. Required reference widths: Desktop 1440px, Tablet 768px, Mobile 360px. Heights are content-driven; initial dashboard viewport previews can use 900px desktop and 800px mobile. Use the same tokens/components across frames.

For **both Desktop and Mobile**, create these exact named frames:

1. Dashboard — populated (two sample records; correct totals).
2. Dashboard — negative balance.
3. Dashboard — initial loading.
4. Dashboard — empty database.
5. Dashboard — filters applied (Expense/Food).
6. Dashboard — no filter results.
7. Dashboard — filter request pending.
8. Dashboard — API error (both reads).
9. Dashboard — summary unavailable (list populated).
10. Dashboard — list unavailable (summary populated).
11. Dashboard — saved but refresh failed (stale values labelled).
12. Dashboard — success hidden by filters (Reset action).
13. Add transaction — defaults.
14. Add transaction — completed.
15. Add transaction — validation errors (all five fields).
16. Add transaction — submitting.
17. Add transaction — server rejection.
18. Add transaction — uncertain outcome (Refresh dashboard action).
19. Edit transaction — prefilled.
20. Edit transaction — changed type / incompatible category cleared.
21. Edit transaction — record no longer available.
22. Delete transaction — confirmation.
23. Delete transaction — pending.
24. Delete transaction — failed / uncertain outcome (two feedback variants).
25. Dashboard — successful add / update / delete (three banner variants).

For **Tablet**, create `Dashboard — populated`, `Dashboard — loading`, `Dashboard — no filter results`, `Add transaction — validation errors`, and `Delete transaction — confirmation`. Add a stress-content preview at 360px and 768px with maximum amount, long description, Entertainment category, long summary totals, and multiline error banner. These stress previews are design QA, not extra screens/features.

Required reusable Figma components/variants:

- Button: primary, secondary, danger, text × default, hover, focus, disabled, pending.
- Input, select, textarea: default, focused, filled, invalid, disabled; FormField with required label/helper/error.
- Type radio group: Expense/Income selection and disabled state.
- SummaryCard: balance/income/expense × value/loading/unavailable/stale.
- TypeBadge: Income and Expense.
- MoneyDisplay: income, expense, zero balance, positive/negative balance.
- TransactionRow, TransactionCard, table heading; include long-content variant.
- FilterBar: default, type-constrained categories, active, pending, query error.
- FeedbackBanner: success/error/info/warning with optional action and dismiss control.
- EmptyState: empty database/no matches/unknown overall count; ErrorState with Retry; skeleton row/card/value.
- DialogShell, Add/Edit TransactionForm, DeleteConfirmation, DashboardHeader.

Annotate keyboard focus order, dialog focus/return behavior, spacing tokens, overflow/wrapping, date and money formatting, API field mapping, filter transitions, and confirmed-versus-uncertain mutation outcomes. Use a simple prototype: Add → invalid → correct → submit → success; filter → no matches → reset; edit → save; delete → cancel/confirm. Loading/errors may be linked alternate frames. Approved design references: desktop populated `6:2`, mobile populated `6:2258`, tablet populated `6:4011`, desktop add defaults `6:935`, mobile add defaults `6:2964`, desktop delete `6:1967`. See [T07 verification](t07-verification.md) for the limits of the retrieved design context.

Use design-only fixtures from database documentation: Income/Freelance “Freelance payment” 1,000.00 EGP dated 29/09/2026 and Expense/Food “Grocery shopping” 250.50 EGP dated 30/09/2026. Summary is 749.50 balance / 1,000.00 income / 250.50 expenses. Display expense first. For negative-balance preview, use income 100.00 and expenses 250.50, balance −150.50. Validation preview can show amount `1.234`, blank description/category, absent type, and future date; it must never look like persisted data.

## T07 Implementation Notes

- T03 was completed after this specification was written; the user confirmed approval and supplied the actual Figma file. T07 is authorized. Completion of this specification alone was not a T03 completion claim.
- T07 builds layout and reusable states against reviewed Figma, using explicitly temporary fixtures. T08 connects create/read/summary; T09 connects editing; T10 connects deletion; T11 completes filtering/recovery. T06 already implements list filtering despite the older T11 backlog wording; do not add unsupported filters or duplicate backend work.
- Keep future implementation in existing Next.js App Router + TypeScript + Tailwind 4. Read applicable installed Next.js guides first as required by frontend/AGENTS.md. Global semantic CSS variables and Tailwind 4 theme mappings should represent this token system; components consume shared tokens, not repeated one-off colors. No dependency or styling edits are authorized by this specification.
- Browser calls only Express through `NEXT_PUBLIC_API_BASE_URL`; do not add direct Supabase access. Unwrap `{data}` and list `meta`; recognize structured `{error:{code,message,details}}` failures. POST/PUT bodies contain exactly type, amount, category, date, description, all strings. ID stays in the edit/delete path; never submit currency or timestamps.
- Preserve exact decimal strings when displaying/validating; do not sum financial totals in the browser. Use server summary and count. Preserve date-only calendar strings; calculate today's form default/maximum using Africa/Cairo, not browser or host timezone. Recheck today at submission and rely on server validation as authoritative.
- Initial list/summary requests have independent statuses. Filter changes fetch only the list, cancel/ignore obsolete requests, and never recompute/filter summary totals. After confirmed writes, refetch both reads with current filters. No automatic write retries or optimistic success claims.
- Implement accessible dialogs and controls with semantics and keyboard behavior described here; CSS visibility must leave only one table/card presentation accessible at a time. Render descriptions as plain text. Handle long content and money without truncation or floating-point conversion.
- Later verify at 360/768/1440px, with keyboard and zoom, real field errors, partial read failures, hidden-by-filter saves, rapid filter changes, missing records, uncertain writes, and saved-but-refresh-failed recovery. No application tests/builds are required for this documentation-only deliverable.
