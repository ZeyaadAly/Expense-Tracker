# T07 — Dashboard layout verification

**Date:** 2026-10-03
**Status:** Partial: fixture UI implemented and locally verified; remaining Figma dialog/state visual comparison blocked by the connected account's Starter-plan MCP quota. T07 remains unchecked. T08 has not started.

## Scope and checkpoint

The frontend `/` route now renders the dashboard using temporary fixtures. Type/category filtering, form validation, add/edit, and confirmed deletion operate entirely in memory. Reload restores the two sample records. No API client, backend calls, Supabase browser access, authentication, backend changes, or schema changes were added. The footer explicitly identifies temporary preview data.

T03 is marked complete on the user's confirmation and actual design-file inspection. The [approved Figma file](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA) contains Foundations, Components and V1 Screens pages. The read-only file inspection found the required desktop/mobile screen inventory and tablet variants. The earlier specification-only status is updated in [T03 specification](06-t03-ui-specification.md).

## Figma alignment and limits

Retrieved high-fidelity design context and screenshots for:

| Reference | Node | Implementation |
| --- | --- | --- |
| Foundations / Reference | `2:34` | Semantic palette, Arial/Helvetica implementation font, radii, spacing and breakpoints |
| Desktop / Dashboard — populated | `6:2` | Header, three summary cards, filters, six-column transaction table, signed amounts and actions |
| Mobile / Dashboard — populated | `6:2258` | Stacked header, full-width Add, summary cards, filters and transaction cards |
| Tablet / Dashboard — populated | `6:4011` | Three cards, desktop-style header and table |

No image/SVG assets or Code Connect mappings were returned in these contexts, so no asset downloads or substitutions were needed. The source design uses Inter as a Figma fallback; implementation preserves Arial, Helvetica, sans-serif as explicitly requested.

Adaptations follow the approved T03 specification and explicit responsive/accessibility constraints: 16px body/controls, 28px summary values, shared 16/24px padding, word wrapping, native controls, 44px touch targets, readable filter-scope note, and a disabled reset at default filters. Static Figma clipping is replaced by normal document flow. At 768px the source table clips its trailing columns; the implementation fits all six columns, allowing actions to stack. Table headings use a continuous muted background rather than white text-cell rectangles. Form footer visual/tab order stays consistent across widths.

Design-context requests for Add defaults (`6:935`, `6:2964`) and Delete confirmation (`6:1967`) returned the Starter-plan quota error. A subsequent read-only dialog inspection was also blocked. The dialogs and alternate UI states were implemented from the approved T03 specification; their browser behavior/layout is verified, but exact comparison to those Figma frames is not claimed. No Figma file edits or paid-plan changes were made.

To finish T07, obtain access to those remaining design contexts or supplied exports/reference measurements, compare Add/Edit/Delete and state variants, resolve any differences, then update this report and the T07 checkbox. The quota limitation does not affect the running fixture dashboard.

## Components created

| File group | Reusable components |
| --- | --- |
| Dashboard | DashboardHeader, SummarySection, SummaryCard |
| Transactions | TransactionPanel, FilterBar, TransactionList, TransactionRow, TransactionCard, TransactionActions, TypeBadge, MoneyDisplay |
| Forms/dialogs | TransactionDialog, TransactionForm, FormField, DeleteConfirmation, DialogShell |
| Shared UI | Button, FeedbackBanner, EmptyState, ErrorState, LoadingState |

`Dashboard` owns local fixture state and dialog selection. API-compatible transaction, editable-value, summary, filter, and validation types are centralized. Category labels/lists and limits are shared. Money formatting operates on decimal strings. The fixture-only summary simulator uses BigInt minor units; T08 must replace it with GET `/summary`, not derive persisted totals from the list.

## Responsive verification

Browser verification used installed agent-browser 0.38.1 with local Chrome against the Next.js dev server at `http://127.0.0.1:3000`. The browser ran outside the process sandbox after the sandboxed Chrome session could not retain its CDP connection; no application services outside loopback were contacted.

| Viewport | Results |
| --- | --- |
| 360px | 16px gutters, stacked cards/filters/header, mobile transaction cards; no page overflow; full-screen 360×900 form during checks and separately 360×800 form; internal form scrolling |
| 768px | 24px gutters, three summary columns, six-column table with every action visible; centered 560px form; no horizontal page overflow |
| 1440px | Centered 1200px content region, three summary columns, table with actions in line; centered form; no horizontal page overflow |

At every required width, stress fixtures verify a 200-character unbroken description, Entertainment category, maximum transaction amount, much larger summary string, negative balance, and HTML-like plain-text description. Nothing is truncated; large values and long content wrap. Local changes preserve date-only strings and display DD/MM/YYYY.

Screenshots were inspected for populated desktop/tablet/mobile, mobile form, and stress content. Generated screenshots and machine-readable browser results are local, ignored artifacts in `.tmp-t07/`, not application assets or committed evidence.

## UI states

Implemented loading skeletons for cards/list, empty database with Add, no matches with Reset Filters, separate summary/list error panels with Retry, success banner, warning/stale banner and labelled stale totals, negative balance, field validation, submitting, server rejection, uncertain save outcome, unavailable edit record, pending deletion and deletion failure. State previews do not cause network requests.

All normal actions use local fixtures. A brief local delay exposes Saving/Deleting and prevents duplicate actions. Dev-only `submitting` and `delete-pending` fixtures remain pending intentionally until navigation/reload, so their appearance and disabled controls can be reviewed.

The development-only `preview` query accepts the scene constants in `src/lib/fixtures.ts`. Examples: `/?preview=loading`, `empty`, `no-results`, `error`, `summary-error`, `list-error`, `success`, `stale`, `negative`, `stress`, `validation`, `submitting`, `save-error`, `uncertain`, `edit-missing`, `delete-pending`, `delete-error`. Unknown scenes fall back to populated. Production ignores the query and renders the populated fixture page.

## Accessibility verification

- Semantic H1/H2/H3 headings, labelled native form/filter controls, radio fieldset, table caption/headers, and descriptive Edit/Delete button names.
- Native modal dialog supplies background inertness, accessible title/description and focus containment. Keyboard Tab/Shift+Tab boundaries are handled explicitly, including error-summary links and selected radio behavior.
- Add/Edit focuses the selected type; Delete initially focuses Cancel. Idle Escape closes; pending Escape is explicitly blocked. Close returns focus to the trigger, or the Transactions heading after a removed/hidden row.
- Associated inline errors, error summary links, preserved values and first-invalid-field focus. Required controls and errors expose appropriate semantics.
- Visible 2px blue focus ring, 44px minimum action targets, text labels/signs alongside semantic colors, plain-text descriptions, live success/error/loading feedback, and reduced-motion support.
- Axe 4.12.1 audits report **zero violations** on populated dashboard and validation dialog at all three required widths (six audits). Automated audits supplement the keyboard checks; they are not a claim of full assistive-technology certification.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run lint` in frontend | Passed |
| `npm run typecheck` in frontend | Passed |
| `npm run build` in frontend | Passed; `/` statically rendered in production |
| `node scripts/verify-t07-domain.mjs` | Passed amount syntax/range, no rounding, unbounded exact formatting, real calendar/leap-year/date boundaries, Unicode code-point length, type/category pairing |
| `node scripts/verify-t07.mjs PATH_TO_AGENT_BROWSER` against local dev server | 69 checks passed, including six zero-violation accessibility audits |
| Source boundary inspection | No fetch/axios/Supabase client/API-base usage in frontend source; backend/schema untouched |

Browser checks cover all required widths, visible actions, overflow, dialog focus/sizing, input preservation, category reset/Other retention, unchanged overall summary during filters, local exact-money add/edit/delete, cancellation, date preservation, focus fallback, fixture reset on reload, supported state scenes, pending duplicate/dismissal prevention, focus ring, and absence of backend/Supabase resources. No browser errors were recorded in the final result.

Verification found and fixed native Escape closing a pending dialog, and table text-button sizing that unnecessarily stacked desktop actions. Automation corrections included quoting PowerShell element references, setting a native date input through its value setter, waiting for hydration before fixture assertions, and disabling transitions with reduced-motion for deterministic focus-color checks. These harness issues are resolved.

## Reproduce

1. From `frontend/`, start `npm run dev`. Backend/database are unnecessary.
2. Use an installed agent-browser executable to open `http://127.0.0.1:3000` in a session named `expense-t07`, with a locally available Chrome executable/profile. This verification tool is not added to application dependencies.
3. From `frontend/`, run `node scripts/verify-t07.mjs PATH_TO_AGENT_BROWSER_EXECUTABLE` and `node scripts/verify-t07-domain.mjs`.
4. Inspect ignored `.tmp-t07/verification.json` and screenshots. Browser checks are restricted to loopback URLs.
5. Run frontend lint/typecheck/build. Production preview does not expose the development scene query.

## Changed / created source and documentation files

- `.gitignore` — ignore temporary browser evidence/profile directory.
- `README.md` — fixture preview, Figma link, state preview and verification instructions.
- `docs/05-implementation-plan.md` — T03 completion, T07 partial verification status, T08 untouched.
- `docs/06-t03-ui-specification.md` — approved design link and checkpoint/node references; originally created in the preceding task.
- `docs/t07-verification.md` — this report.
- `frontend/src/app/page.tsx` — dashboard route, development-only scene selection.
- `frontend/src/app/globals.css` — semantic CSS/Tailwind 4 tokens and shared control/dialog/table styles.
- `frontend/src/lib/transactions.ts` — contract types, category constants, exact formatting and validation helpers.
- `frontend/src/lib/fixtures.ts` — temporary records, scenes and exact fixture-only summary simulator.
- `frontend/src/components/dashboard/dashboard.tsx` — local state and fixture interaction owner.
- `frontend/src/components/dashboard/dashboard-header.tsx` — header and primary action.
- `frontend/src/components/dashboard/summary.tsx` — summary section/cards and read states.
- `frontend/src/components/transactions/filter-bar.tsx` — supported type/category filters.
- `frontend/src/components/transactions/transaction-panel.tsx` — list orchestration and empty/error states.
- `frontend/src/components/transactions/transaction-list.tsx` — table, rows, mobile cards, badges, money and actions.
- `frontend/src/components/transactions/transaction-form.tsx` — shared form fields, validation and feedback.
- `frontend/src/components/transactions/transaction-dialog.tsx` — add/edit wrapper.
- `frontend/src/components/transactions/delete-confirmation.tsx` — identifying details and confirmation.
- `frontend/src/components/ui/button.tsx` — typed variants and pending states.
- `frontend/src/components/ui/dialog-shell.tsx` — modal semantics, focus, dismissal and scrolling.
- `frontend/src/components/ui/feedback.tsx` — banners, empty/error/loading components.
- `frontend/scripts/verify-t07.mjs` — repeatable browser verification.
- `frontend/scripts/verify-t07-domain.mjs` — focused contract edge cases.

No dependency, lockfile, backend, database, or environment-file changes. Next.js/React review covered client boundaries, serializable props, typed component inputs, derived rather than duplicated state, effect cleanup, static Tailwind variant strings, safe text rendering, and native accessible controls.

## Remaining issue and next task

The only outstanding T07 item is exact visual comparison of remaining Figma dialog/alternate-state frames, blocked by the provider quota. The fixture implementation is ready for integration technically, but the formal T07 checkbox stays open until that design verification is resolved. Then proceed to **T08 — Connect the frontend to the API**. T08 remains not started; fixtures do not establish persistence or any browser → Express → database flow.
