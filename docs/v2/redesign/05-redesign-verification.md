# Expense Tracker V2 Redesign Result

> Historical evidence: the user rejected this visual result. [The density and loading refinement](06-density-and-loading-refinement.md) is the current review report. This document does not establish acceptance of the refinement.

**Status: Ready for Review, 2026-10-18.** Starting main: `40c16f6868f5f44bf405c3721b5ef0e2a3373dd1`. Review branch: `v2-ui-redesign`. The final commit and origin synchronization are reported at delivery, avoiding a circular self-hash in this report.

Production remains on the previously released main revision. No hosted financial data, backend deployment, migration, cron or production environment variable changed. The retained production transaction is unaffected. This branch is prepared for review, merge and the existing frontend deployment workflow.

## Audit, research and visual decision

All nine protected routes (including account detail) and four Auth routes were audited before implementation. The old UI had undifferentiated Arial, disconnected warm neutrals/black navigation/blue actions, excessive preambles, weak money alignment and repeated generic surfaces. Native dialog accessibility, recovery flows, exact decimal formatting and owner-bound stores were strengths retained.

Both supplied `frontend-design` and `ui-ux-pro-max` skill bodies were read. Stale temporary paths belonged to another Windows profile; the latter's actual CLI was recovered from [upstream](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), revision `56ea9cf174ed86786187daa9de0e6247cb0747e4`. Installed Python 3.12 executed product-wide and targeted searches, including the real `--design-system --persist` workflow. No Python/system installation or UI dependency was added. Installed Next 16 font/CSS/layout docs governed implementation.

Broad glassmorphism/handwritten-font/video-marketing recommendations and a narrower crypto gold/purple palette were rejected. Targeted guidance supported grid discipline, IBM Plex typography, accessible chart alternatives and responsive tables. Poor-fit/zero-result queries and retries are recorded in [visual direction](01-visual-direction.md), with [raw search results](research/). MASTER was generated, then explicitly curated for this product; the selected hex values are deliberate decisions, not claims about automatic recommendations.

Three competing directions preceded coding: **Midnight Register** was too severe/trading-oriented; **Mineral Atlas** overemphasized spatial account cards and complicated navigation. **Clear Ledger** organizes position, movement and time through an ink position canvas, cool work surfaces, ruled ledger and expected-money datebook. The generic-CRM self-test revised the initial concept to explicit assets/debt, source/destination relationships and manual-savings semantics.

## Delivered system and pages

The [semantic system](02-design-system.md) and [persisted MASTER](../../../design-system/expense-tracker/MASTER.md) replace T03/T04 appearance decisions. Canvas `#F3F6FA`; surfaces `#FFFFFF`/`#EAF0F6`; ink `#172738`; supporting text `#526279`/`#5C6B80`; cobalt `#2855D9`; positive `#08796C`; expense/destructive `#BB3F42`; warning `#8B5A10`; borders `#D9E1EB`/`#7E8DA4`. States retain words/signs; transfers remain neutral.

Self-hosted Manrope handles titles and tabular money; IBM Plex Sans handles UI/body. Inputs/body use 16px, supporting UI 12–14px, section heads 18–22px, page heads 28–34px and primary money 32–44px. Both Latin WOFF2 files retain OFL licenses; other scripts use browser fallbacks. No amount is truncated.

Desktop uses a 216px light navigation rail from 1024px; tablet/phone use a masthead and native modal drawer. Actions/fields retain 44px targets, visible labels and offset focus. Cobalt commits, bordered secondary actions and restrained destructive confirmations share one geometry. Ordinary sections/ledger rules replace universal card chrome; only overlays have elevation. Dialogs retain pending guards, Escape behavior, traps, scroll lock and focus return.

| Domain | New composition |
| --- | --- |
| Dashboard | Explicit position/assets/debt, adjacent period movement, wrapping account rail, posted activity and expected datebook |
| Accounts/detail | Typed instrument rows, stable money/action edges, current-balance anchor and financial context/metadata |
| Transactions | Integrated search/filter workbench; desktop semantic ledger, tablet record grid and distinct phone rows/cursors |
| Transfers | Neutral movement ledger and source/destination review before deliberate save |
| Recurring | Status-marked definition rail beside date-anchored expected occurrences |
| Analytics | Actual-result band, lightweight DOM/SVG plots, exact table, category/account comparisons and separate expected section; actuals first on phone |
| Budgets | Category pressure records with spent/limit/remaining, exact percentage and backend status |
| Goals | Horizontal desktop target records, stacked phone financial details, manual/reference wording and explicit lifecycle |
| Settings | Quiet profile/preferences/account sections and category directory |
| Auth | Product-specific statement/ink feature panel beside a calm form; compact phone masthead |

Motion is limited to 120ms feedback, 160ms dialogs and 180ms drawers. Reduced motion removes transitions/animations; forced colors retains boundaries/progress distinction. No animation/chart library, image payload or blur was added.

Backend, schema, clients, financial stores, signed money formatting, cursors and authentication logic are unchanged. Dashboard remains the existing core read model: no chart/Budget/Goal preview was invented. Optional P1 scope stays deferred.

## Both visual critiques

Baseline and both implementation passes each captured all 39 route/width combinations at 1440/768/360. Contact sheets supported cross-page comparison; full images were inspected for hierarchy, money alignment and phone composition.

**Pass one:** found an empty account-grid slot, duplicate debt copy, excessive phone control space, a conventional goal-card grid, weak Budget geometry, a blank Settings cell and forecast preceding actual trends on phone. Revisions introduced the wrapping account rail, one debt explanation, paired phone controls/search, single-column targets with horizontal desktop details, pressure rows, a full-width account-settings strip and actual-first Analytics. Backend-oriented copy was simplified while recovery explanations remained.

**Pass two:** reviewed every route again and confirmed the new compositions. Refinements enlarged brand/short Auth targets, replaced unsupported native-time labels with full screen-reader date text, gave chart-axis text a known surface and strengthened long-reference wrapping. Adversarial stress exposed overflow from an unbroken upcoming-account reference; inherited wrapping fixed it. Quiet text was darkened to meet 4.5:1 on the subtle surface. Final optimized captures have zero page errors/overflow.

[Pass-one desktop](assets/critique/pass-one-1440.png), [phone](assets/critique/pass-one-360.png), [pass-two desktop](assets/critique/pass-two-1440.png), [phone](assets/critique/pass-two-360.png); both tablet contacts are also retained. Early contact thumbnails are cropped; final galleries contain full-image thumbnails.

## Environment and boundaries

Windows; Node 26.5; Next 16.3.8/React 19.2.8; PostgreSQL 17; Edge 155; Playwright 1.64.1; axe-core 4.14.0. A new UTF-8/locale-C cluster listens only at `127.0.0.1:55451/postgres`; guarded setup checks `.tmp-v2-redesign/.tmp-v2-t62/pgdata`. Application SQL uses `expense_tracker_app`. A synthetic local ES256 issuer/JWKS replaces external Auth only. Financial HTTP/SQL responses are never mocked.

Showcase A remains unchanged: five accounts, 58 transactions, three transfers, three budgets, three goals, three recurring definitions. Authoritative position is 62,690.00 EGP: assets 67,430.00 less signed debt 4,740.00. Period income 28,500.00, expenses 5,560.00, savings 22,940.00. B receives mutation/stress probes; C exercises a real empty workspace. Repeated harness-development attempts leave additional synthetic B records; screenshots never represent production or a clean financial benchmark.

Financial flows passed in development and a normally served optimized local production build with `V2_APP_ENABLED=true`. Fictional public Auth and loopback API configuration belong only to those local processes. Live-provider email delivery and hosted performance were not retested; previous production acceptance remains in T70–T75.

## Tests and accessibility

| Gate | Result |
| --- | --- |
| Lint, typecheck, optimized build | Pass; lint zero warnings/errors after QA cleanup |
| Complete frontend suite | **185 pass, 0 fail, 0 skipped** |
| Seven-width responsive/axe | **91 layouts:** 13 routes × 320/360/375/768/1024/1280/1440; zero overflow, page/console errors, violations or undersized measured targets |
| Financial browser regression | **16 grouped workflow checks**, 13 additional state/dialog axe audits; development and optimized mode |
| Auth regression | **6 grouped flows**, 8 additional state axe audits |
| Stress/accessibility | **6 grouped checks**, 62 additional axe audits |
| Dialog/drawer compositions | **17 additional axe audits** and viewport screenshots |
| Generated reconciliation | **4 checks:** process twice/exactly one posting; generated badge/search; backend Budget status; Analytics/Dashboard actuals |
| Contrast | 14 semantic pairs; sampled normal-text minimum **4.68:1**; field boundary 3.37:1; focus 6.19:1 |
| Credential patterns / whitespace | Zero recognized secret findings; git diff --check passes |

There are **191 WCAG A/AA axe audits** across these runs, not 191 distinct routes. Tags: `wcag2a`, `wcag2aa`, `wcag21aa`. This complements keyboard/manual review and is not an exhaustive accessibility certification.

Browser workflows cover profile/category lifecycle; account create/edit/archive/restore and posted-activity opening lock; transaction CRUD/search/all six filters/cursor navigation; transfer review/CRUD with neutral totals; recurring create/edit/pause/resume/archive and reference-archive pause; Budget CRUD/backend pressure with unchanged actuals; Goal create/edit/complete/reopen/archive, above-100% manual progress and no balance effect; Dashboard periods/totals; Analytics presets/custom/account filters. Existing unit/store tests retain deeper abort/cursor/field-error/isolation coverage.

Recovery checks exercise exactly-one-write duplicate guards, pending Escape/disabled controls, saved-but-stale refresh, lost acknowledgement preserving the draft and GET-only inspection, read/loading retry, owner-change private-draft teardown, expiry and all signed-out protected redirects. Auth covers associated validation/first-invalid focus, registration confirmation, reset redirects, invalid/valid recovery, stripped fragments, mismatch, visibility, rejected login, Enter, reload and sign-out.

Stress uses 999,999,999.99 amounts, card overpayments, 100-character account names, 120-character goals, 200-character unbroken descriptions, extreme percentage text and archived/completed states at five widths. Eight empty domains, dialog/drawer traps, Escape/focus return, skip link, short-height actions, reduced motion and forced colors passed. Zoom uses CSS zoom plus equivalent 200% viewport reflow and aggressive text enlargement; OS browser-menu zoom and hardware screen-reader output are not independently certified.

Some native-dialog nodes have axe **incomplete contrast** results because its detector sees overlapping inert background content. Those items were retained and manually inspected: opaque white dialog surfaces and primary/secondary text match the measured semantic pairs. They are not hidden violations or assumed automated passes. [Manual review](assets/verification/manual-review.json) and [contrast](assets/verification/contrast.json) retain details. Route-level axe has zero incomplete items. Native radio targets are measured via their clickable labels.

## Performance and source review

No dependency was added. Optimized output has 23 JS chunks totaling **1,229,705 bytes / 366,706 gzip bytes**, versus T63's 1,228,574 / 366,428: **+278 gzip bytes (0.08%)** across all emitted JS. Two variable fonts add **70,548 bytes**. [Bundle evidence](assets/verification/bundle.json) includes CSS, manifests and font sizes; financial fixture/heavy chart modules are absent.

All emitted chunks are not a route's first-load payload. T63 gated production financial routes; this run enables the real UI locally, so inventory is compared without claiming equivalent production financial timings. Nine warm navigations (one warmup, three samples per Dashboard/Transactions/Analytics) reached data/network-idle plus two frames in **769–830ms**, including settling delay. Real fonts loaded from the app origin; no browser errors. These are not Core Web Vitals, React Profiler results or a production SLA.

React review found no new fetch effects, owner-state changes, financial arithmetic or client/server boundary expansion. Fonts are module-level; icons remain local SVG. Backend, lockfiles, migrations and hosted configuration are outside the diff. Credential pattern scanning complements source/diff review; it is not an exhaustive secret-detection guarantee.

## Screenshots, docs and reproduction

- [Before desktop](assets/before/contact-1440.png), [tablet](assets/before/contact-768.png), [phone](assets/before/contact-360.png), [39-image inventory](assets/before/inventory.json).
- [Final desktop](assets/final/contact-1440.png), [tablet](assets/final/contact-768.png), [phone](assets/final/contact-360.png), [39-image inventory](assets/final/inventory.json). Relative-image HTML galleries open locally.
- Full examples: [Dashboard](assets/final/dashboard-1440.png), [Accounts](assets/final/accounts-1440.png), [ledger](assets/final/transactions-1440.png), [mobile Analytics](assets/final/analytics-360.png), [Goals](assets/final/goals-1440.png), [Auth](assets/final/login-1440.png).
- Additional frames cover 17 dialogs/drawers/review, five maximum-value phone views, empty Dashboard, forced colors and error recovery. Native modal captures use the viewport to avoid full-document backdrop artifacts.
- [QA drivers and setup](../../../frontend/scripts/redesign/README.md), [sanitized structured evidence](assets/verification/).

All four full 39-image sets were generated. Baseline/final and six critique contacts are retained; intermediate full sets, tool checkout, logs, local keys/sessions/database stay ignored. Design records: [direction](01-visual-direction.md), [system](02-design-system.md), [components](03-component-language.md), [page compositions](04-page-compositions.md), this report and persisted MASTER. README and historical UX spec point to the new visual authority.

**No known functional, overflow or automated accessibility blocker remains.** Human aesthetic acceptance and the normal hosted smoke are review/release steps. The branch is ready to merge and deploy through the existing frontend workflow after review. Main was not automatically merged; production was not redeployed by this review task.
