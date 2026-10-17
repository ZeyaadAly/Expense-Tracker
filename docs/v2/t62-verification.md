# T62 — Responsive / Accessibility Validation

**Status: Completed locally on 2026-10-17 (Africa/Cairo).** Starting clean, fetched and fast-forward synchronized `main`: `5d29d3f59e03530963e7b7f68bd45dac0650dd6d`. No unresolved mandatory responsive/accessibility finding remains. T63 is unstarted.

The acceptance path uses actual Next.js components, session-bound clients, real Express services, verified synthetic ES256 identity and limited-role disposable PostgreSQL. Only external Auth responses are synthetic. No hosted financial acceptance, remote database action, production write, environment change, manual deployment or cron activation belongs to this task.

## Route and viewport inventory

| Route | States and surfaces |
| --- | --- |
| `/v2/login` | Signed out, validation, keyboard login, expired-session arrival |
| `/v2/register` | Signed out, associated validation errors |
| `/v2/forgot-password` | Signed out, associated validation errors |
| `/v2/reset-password` | Invalid/absent recovery context, disabled mutation controls |
| `/v2/dashboard` | Actual summary, account snapshots, activity, recurring/planning previews |
| `/v2/accounts` | Balances/debt, create/edit/archive, transfer form/review |
| `/v2/accounts/[id]` | Direct deep link, summary, foreign/unavailable and archived account |
| `/v2/transactions` | Desktop ledger/mobile cards, search, filter drawer, pagination, forms/confirmation |
| `/v2/recurring` | Long descriptions, nullable next occurrence, lifecycle, editor |
| `/v2/analytics` | Summary, filters, plot/text/data table, category/account activity |
| `/v2/budgets` | Custom threshold, negative remaining, exceeded progress, forms/confirmation |
| `/v2/goals` | Above-target manual progress, completion/reopening, editor/archive |
| `/v2/settings` | Profile/preferences/security, system/custom categories, many-category stress |
| `/v2/design-system` | Development-only component reference; supplementary, not runtime financial evidence |
| `/v2/release-check` | Protected release holding page, no financial workspace |

Required layout widths are **320, 360, 375, 768, 1024, 1280 and 1440 CSS pixels**. Axe runs include 320/360/768/1440, with additional all-seven-width regression on Dashboard, Transactions, Analytics and Settings. Dialog height stress uses 320×360, 768×360 and 1440×600. Emulation represents short landscape/laptop layouts, not a physical-device test.

All fifteen inventoried routes pass their required-width matrix with no page-level horizontal overflow. Negative credit-card balances additionally pass the full width matrix with explicit credit meaning. A real 80%-used Budget with a custom 73% threshold passes four-width audits and exposes “Near limit” plus actual progress; normal and exceeded states are separately covered.

## Findings and narrow fixes

1. Analytics at 360px with text enlarged to 150% produced document width 393px. Absolutely positioned screen-reader money labels inside the horizontal table escaped its scroll container. Positioning the chart/table scroll regions establishes their containing block. The same enlarged-text assertion passes after the fix; internal scrolling preserves full values and semantic headers.
2. Archiving an account removed its dialog trigger. Closing the dialog left focus on the body. Shared dialog cleanup now focuses the current main landmark when the original trigger is disconnected. The real keyboard create/archive regression proves a connected focus target remains; normal Escape/trigger-return checks cover retained triggers.
3. Recurring lifecycle confirmation overflowed internally with a long unbroken account name (440px content in a 322px dialog). Dialog body text now inherits `overflow-wrap: anywhere`, preserving the full target description without horizontal clipping.

4. Manual review of axe incomplete results found named generic containers: Dashboard/Analytics/Budgets/Goals loading wrappers and transfer pagination. Explicit group roles now make their existing labels valid. A focused final loading/pagination retest checks both names and absence of the prohibited-attribute review result.

The baseline already contained a T62 runner and required-label/mobile-target hardening. This task validates that code and corrects stale runner labels, chart/card selectors, scoped recurring controls and asynchronous resource/pagination waits. Keyboard fixtures now use unique names so retries do not collide. Optional explicit Playwright/axe paths support isolated tool installations. Axe waits 200ms for the existing 120ms button color transition; an initial transient contrast result did not reproduce on a settled foreground page. Genuine failures above were fixed, not waived.

## Semantics, keyboard and focus

Route matrices inspect one main landmark and one primary heading, document titles and programmatic accessibility snapshots. Protected pages currently inherit the global `V2 Design System · Expense Tracker` title; Auth pages have route-specific titles. This is recorded as the existing minimal title policy, not claimed as per-route title implementation.

Native dialogs provide modal semantics, labelled title/description, inert background, body scroll locking, Tab/Shift+Tab containment, Escape and trigger return. Pending mutation Escape remains blocked. The keyboard walkthrough covers login, drawer navigation, account create/archive, transaction create/search/filter/pagination, transfer review/save, recurring create/pause/resume/archive, Analytics range/account, Budget creation, Goal creation/complete/reopen, category create/archive and signout. Session A→B and expiry tests start with focus in private account dialogs and assert removal of the modal/private labels.

Visible labels expose required meaning; field errors use invalid/described-by associations and first-invalid focus. Success/loading/stale/error notices use status/alert regions. Skeleton primitives hide decorative bars. Debt/credit, archived, recurring and planning states retain text labels independent of color. Transactions preserve semantic table headers at desktop and grouped cards at narrow widths. Charts have named sections, visible text summaries, exact tabular equivalents and decorative plot geometry; scrolling plot/data regions are keyboard focusable. Progress ARIA values remain bounded while value text exposes the actual percentage above 100%.

## Contrast, motion and adaptation

Nine explicit text-token pairs supplement axe contrast checks. Muted/canvas is 4.61:1, secondary/warm surface 4.75:1, sidebar muted 7.93:1, primary button 5.86:1, danger button 6.00:1, warning 5.86:1, income 5.87:1, expense 5.42:1 and transfer 4.58:1. Disabled controls are visibly distinct and native-disabled; disabled text is not asserted as an enabled-text contrast requirement. Focus uses a visible offset outline; no essential action is hover-only.

Dashboard, Transactions, Analytics and Settings are exercised with 200% CSS zoom, equivalent 1280→640 CSS-pixel viewport reflow, 150% computed-text enlargement, reduced motion and forced colors. Auth forms receive 200% CSS zoom. CSS zoom and viewport reflow are approximations, not a claim of changing the browser's native zoom menu. Reduced-motion assertions require no active CSS animations/transitions. Touch audits inspect visible mobile controls against 44×44px, excluding skip links and native radio/checkbox inputs.

Stress uses 999999999.99 amounts, negative totals, above-100% planning progress, long Arabic/accented account/category/profile/Goal/transaction strings and forty extra categories. Full text remains in the accessible DOM. Dedicated RTL/dark mode are outside frozen scope and were not added.

The supplemental expansion pass doubles actual control-label text on four runtime routes, supplies a long synthetic email, and expands an associated validation error with Arabic/accented text at short heights. The dialog Cancel action remains reachable. These are DOM content-stress adaptations of the runtime UI, not substitutes for API-backed financial states.

## Browser, production and practical limits

Only installed Edge/Chromium is exercised. Firefox/WebKit executable availability is recorded by the runner; neither is claimed tested. No physical device, notch/virtual-keyboard, manual screen-reader speech or native browser zoom-menu session is claimed. Programmatic semantics, keyboard and axe checks are not formal WCAG certification. Axe incomplete results require human judgment and are retained in evidence; zero violations does not mean exhaustive conformance.

Local optimized production build and HTTP checks retain financial/detail/Settings/design-system 404 gates, public Auth 200 responses and the protected release-check entry. Browser production smoke inspects public/Auth layouts at 360px. Full financial UI cannot run in production mode while its intentional production gate remains; this limitation is preserved rather than bypassed. Cron remains `[]`; hosted financial acceptance remains deferred.

## Reproduction

Build backend, initialize a fresh password-free UTF-8 disposable PostgreSQL cluster at `.tmp-v2-t62/pgdata`, listening only at `127.0.0.1:55451/postgres`. Set `T62_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres` and run `node backend/scripts/t58-browser-api.mjs`. Its T62 option validates the same loopback/database and resolved directory guards as T58. Do not use retained data.

Start the frontend in development with fictional `NEXT_PUBLIC_SUPABASE_URL=https://t37-fixture.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t37_fixture_only`, and `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1`. Install temporary Playwright/axe outside the application dependencies. Set `T62_TOOLS_ROOT`, `T62_PLAYWRIGHT_PATH`, `T62_AXE_PATH`, `T62_OUTPUT_DIRECTORY`, and optional `T62_BROWSER_EXE`. Run `node frontend/scripts/verify-t62.mjs` with `T62_PHASE` set to all (the full matrix), or individual matrix, interaction, states, adaptation, auth, stress, visual, warning, loading and keyboard phases. Use a fresh fixture DB for an entire rerun. Fixed October 2026 data/month/reference dates must be adapted together for future-date reproduction. Generated raw evidence, synthetic signing material, logs and tools stay ignored. Application manifests and lockfiles are unchanged.

Production is built/run locally with ordinary production gates; never set development mode on that server. Stale preexisting `.next/dev/types` initially referenced Auth routes before their route-group move. Regenerating only disposable generated types allowed the normal build/typecheck to pass; no application change was needed for this tooling issue.

## Quality and evidence

| Gate | Final result |
| --- | --- |
| Dedicated T62 acceptance | **78 named checks, 409 axe audits, 584 layout checks**, zero violations/overflow |
| Local production browser | **5 additional axe audits**, zero violations/overflow at 360px |
| Fresh T58 integrated regression | **33 named checks, 56 axe audits**, zero violations; real cross-page financial/state/session regression |
| T58 recovery extension | **15 checks**, including POST/PUT/DELETE lost acknowledgements, GET-only inspection, navigation and signed-out redirects |
| Frontend lint/typecheck/production build | Passed |
| Full frontend tests | **183 passed**, zero failures/skips |
| Changed backend harness ESLint / backend build | Passed; no backend application code changed |
| React review | Passed: keyed identity boundaries, stable stores, existing parallel reads, accessible group semantics and narrow dialog cleanup; no dependency or state-management expansion |
| Git whitespace / source and evidence credential scan | Passed; [final scan evidence](assets/t62/secret-scan.json) includes source/build/docs and changed-source/evidence review |

Tooling: Node 26.5.0, Next.js 16.3.8, React 19.2.8, Edge/Chromium 155.0.4283.45, Playwright 1.64.1, axe-core 4.14.0 and fresh UTF-8 PostgreSQL 17.11. Automated rules are WCAG 2 A/AA and 2.1 AA tags. **470 axe audits** were executed in the final reported acceptance/regression/production scopes; rerun attempts are excluded from that total. Named checks, layouts and audits are different measurements.

The broad T62 run contributes 381 audits; final semantic/negative-credit and near-limit retests contribute 24 and four. Earlier incomplete prohibited-attribute review IDs remain in the broad evidence for traceability; the final 24-audit semantic retest has **no incomplete results** after the group-role corrections. Other incomplete contrast results are retained, rather than represented as automatic passes; explicit token ratios and visual/semantic review supplement them. No genuine axe violation was waived. No unexpected page errors, React/hydration exceptions or console errors remain in the passing runs.

The fresh T58 attempt exposed a fixture-clock mismatch: recurring creation used real October 17 while its processor/Dashboard reference was October 15. The T58-only service clock now agrees with those existing fixtures; T62 retains the original real-date recurring creation behavior. A separate fixture reset preceded the passing regression. The existing T58 audit helper now foregrounds the page and waits for network idle plus settled button transitions; this avoids sampling a new session midway through disabled-to-enabled painting. Optional explicit tool paths make that runner reproducible without copying/modifying it.

Evidence: [named checks, route titles, audits, touch and layouts](assets/t62/results.json), [contrast ratios](assets/t62/t62-contrast.json), [T58 integrated](assets/t62/t58-regression.json), [T58 recovery](assets/t62/t58-recovery.json), [production HTTP](assets/t62/production.json), [production browser](assets/t62/production-browser.json), [Dashboard desktop](assets/t62/t62-dashboard-1440.png), [Analytics 320px](assets/t62/t62-analytics-320.png), [Settings 320px](assets/t62/t62-settings-320.png). Screenshots were visually inspected; all identities/content are synthetic. Raw sessions, signing files and disposable logs are not committed.

Changes: shared dialog focus cleanup/wrapping, Analytics scroll containment, five semantic group roles, T62 runner, T58 verification tooling/clock support, this report/evidence, README and implementation-plan checkpoints. Backend services, schema, financial calculations, dependencies, production gates and cron configuration are unchanged.

**Next core task: T63 — Performance Review. It is not implemented here.**
