# Density and loading refinement

Status: **Ready for Review**. Starting review branch `v2-ui-redesign` at `e1d78555a8ce61701113a282b0dde756180a0640`. The previous visual result was rejected; its acceptance report is historical, not approval of this refinement.

## Direction before implementation

Keep Clear Ledger's Manrope/Plex typography and finance-specific position/movement/time language. Spend visual emphasis on one financial concept per page. Replace the oversized control and repeated explanatory chrome with compact alignment and progressive disclosure. Retain backend authority and every action.

Base palette remains porcelain `#F3F6FA`, surface `#FFFFFF`, ink `#172738`, cobalt `#2855D9`, supporting slate `#526279`, financial positive `#08796C`/expense `#BB3F42`. Status words and exact amounts remain. Desktop control tokens: 32/36/40px; touch context minimum 44px. Spacing: 4/8/12/16/20/24/32/40. The user's compact desktop sizing explicitly supersedes the prior universal 44px rule.

```text
Title                              compact primary / secondary
compact, aligned common controls   optional advanced disclosure
one dominant financial view
secondary detail on demand
```

| Page | A: immediately essential | B: supporting | C: disclosed/detail | D: redundant default copy |
| --- | --- | --- | --- | --- |
| Dashboard | Position, period movement, recent/upcoming | Concise account preview | Assets/debt breakdown, full account route | Repeated scope, up-to-date and explanatory labels |
| Accounts | Name/type/balance/status | Quiet edit/lifecycle | Transfer workspace, detailed totals | Repeated current-balance and payment advice |
| Detail | Current balance | Posted totals | Metadata, transfer workspace | Repeated currency/explanations |
| Transactions | Description, account/category, date, amount | Type/account filters | Category/source/date filters | Extra filter framing and labels |
| Recurring | Description/amount/frequency/next/status | Upcoming datebook | References/end dates, filters | Repeated expected/type explanations |
| Analytics | Period totals and movement | Spending breakdown | Exact tables, savings, account movement, forecast | Repeated narratives/scope |
| Budgets | Category/spent/limit/status | Remaining/progress | Threshold and period detail | Mini-report explanations |
| Goals | Target/progress/remaining | Status/actions | Reference/dates/manual context | Repeated manual/reference paragraphs |
| Settings | Profile | Focused section navigation | Category manager/preferences/security | Repeated category status/type strings |

Self-critique: making everything smaller would preserve the original information overload. The plan therefore changes default information architecture as well as dimensions; details remain operable through native disclosures. No hidden financial feature mounts just because its navigation link exists. Route-code prefetch remains useful and is measured separately from financial API reads.

## Research

Both current supplied skill bodies and ui-ux-pro-max's current local SKILL.md were read again. Targeted searches and one narrower fallback per concern are retained in `research/refinement`. Verified applicable guidance includes responsive table handling, chip reflow, touch spacing/targets, loading feedback and inline errors. Several searches returned broad or off-topic matches; those do not establish a compact-size or lifecycle rule. `React request lifecycle` and its retry had zero results; request lifecycle decisions use repository stores, measured browser requests and installed Next 16 documentation. No unverified search result overrides this brief.

## Overflow and control roots

The ordinary showcase at the starting revision did not reproduce page-level overflow at the seven requested widths. This is recorded in [the baseline audit](assets/refinement/before/audit.json); it does not invalidate the reported problems with other content. Verification therefore also covers expanded panels, long unbroken names/descriptions, maximum amounts, extreme progress, short dialogs, enlarged text and real coarse-pointer context.

The old `.v2-theme button,input,… { font: inherit }` reset overrode component font sizing through specificity. Combined with padding, ordinary buttons measured 46px and inputs 48px; selects measured44px. The reset now sets only font-family. Button tokens are32/36/40px; default inputs/selects are36px with14px desktop text. Textareas retain multiline height. Touch contexts grow the actual control to44px and input text to16px. Auth fields and primary actions remain44px.

Root layout corrections use flexible `minmax(0,…)` tracks, `min-width:0`, wrapping action rows, bounded control widths, viewport-bounded dialogs and responsive record composition. The main area uses the available width after the200px rail; content caps at1280px. Native select triggers remain bounded to their tracks. Only named, focusable chart/table regions retain intentional internal scrolling. No page-level `overflow-x:hidden` workaround was introduced.

Fields share label spacing and a36px baseline; toolbar fields have no trailing form margin. The Budget month field moved into the action toolbar and caps at180px. Analytics filters cap at220px instead of stretching across the page. Transaction search caps at600px; Type/Account use compact180px tracks and advanced filters use the same baseline. Default desktop ledger rows measure45px for the showcase; variable-length content may grow rather than clip. Filter chips, segmented controls, pagination, error/empty states, dialogs and drawers inherit the same sizing policy.

## Default information and hierarchy

The Dashboard now leads with net position, three movement totals and short recent/upcoming lists. Assets/debt move into **Balance breakdown**. The account preview shows three accounts with an explicit preview count and the existing all-accounts action. Recent rows keep description/account/date/amount; upcoming rows keep date/description/amount. Scope and expected/posted distinctions remain where they affect interpretation. Repeated up-to-date labels become screen-reader status text; loading/errors remain visible.

Accounts retain name/type/balance/status/actions. The transfer workspace mounts only after **Transfers** opens; detail metadata moves into **Account information**. Transfers keep source/destination/date/amount with notes under Details. Transactions show Type/Account first, with category/source/date under **More filters**; the mobile drawer retains every filter. Recurring retains description/amount/frequency/next/status, with references/end dates under **Schedule details** and optional filters under **Filter schedules**.

Analytics opens with period income/expenses/savings, the monthly flow chart and spending breakdown. Derived metrics/scope, savings chart, exact monthly table, income breakdown, account movements and expected recurring commitments remain available through clearly named disclosures. Budgets keep category/spent/limit/remaining/status and disclose threshold/period details. Goals keep target/saved/progress/remaining/status/actions and disclose linked account/dates/manual context. Settings keeps profile/preferences/security organized, with Categories as a focused expandable workspace. No financial feature or action was deleted.

The shell is a quieter200px desktop rail with36px navigation rows, restrained group spacing and shorter headers. Tablet/phone use the existing accessible navigation dialog. The semantic palette and self-hosted fonts remain; type markers are neutral and financial color retains income/expense/pressure meaning.

## Request architecture and measured matrix

The authenticated layout, shell and navigation do not mount financial domain stores. Auth/Profile bootstrap is global; financial effects live in active route components and clean up their stores on unmount. The starting Dashboard already used its aggregate exclusively: no unrelated financial calls were reproduced. Next's default production Link prefetch fetches route code/RSC; it was retained and measured separately. Component imports alone do not mount effects.

Two actual eager-loading sources were corrected: the hidden transfer workspace on Accounts/detail, and Settings fetching both category statuses plus a duplicate profile read. Transfers now mount on disclosure. Settings reuses the verified profile from the current owner/session context, defers categories, and loads the selected status on demand. Category mutations still refresh both lists and uncertain-write inspection still requires both reads. No global financial cache or caching dependency was added.

Counts below are fresh optimized document entries, including one `POST /api/v2/profile/bootstrap`. All other listed calls are GETs under `/api/v2`; Auth-provider calls, assets and Next route-code/RSC prefetch are counted separately. Active/archived references are required for historical selectors as well as current create/edit choices.

| Route | Before → after | Initial endpoint list after bootstrap |
| --- | --- | --- |
| Dashboard | 2 → 2 | `dashboard?period=this_month` |
| Accounts | 6 → 3 | `accounts?status=active`, `accounts/summary` |
| Account detail | 6 → 3 | `accounts/:id`, `accounts/:id/summary` |
| Transactions | 6 → 6 | `transactions?limit=25`, `accounts?status=active`, `accounts?status=archived`, `categories?status=active`, `categories?status=archived` |
| Recurring | 7 → 7 | `recurring`, `recurring/upcoming?days=30`, accounts active/archived, categories active/archived |
| Analytics | 4 → 4 | `analytics/overview?from=2026-09-19&to=2026-10-18`, accounts active/archived |
| Budgets | 4 → 4 | `budgets?year=2026&month=10`, categories active/archived |
| Goals | 4 → 4 | `goals`, accounts active/archived |
| Settings | 4 → 1 | None until Categories expands; verified profile came from bootstrap |

Dashboard initial load, idle time and hovering all navigation links cause **zero unrelated financial endpoint calls**. Dashboard → Transactions starts its list and required references only after deliberate navigation. Browser Back reactivates Dashboard with one fresh aggregate; the owner/session profile remains bound. Transfers expands with its history and account references; Settings expansion requests active categories only, then archived categories when selected. Leaving an in-flight Transactions route aborts its five reads and late responses cannot populate the destination. Existing generation/session isolation, session-expiry handling and uncertain-write safeguards remain.

## Screenshot critique pass1

All13 routes were captured at1440/768/360 and reviewed through full-size images and three contact sheets. Findings: the More filters summary sat below its neighboring selects; planning record details/actions consumed separate rows; account markers used unnecessary color; transfer notes competed with primary movement; the Budget period control occupied a separate full-width row. Changes: align advanced/common control bottoms, group planning footers, neutralize type markers, disclose transfer details and place the bounded month control in the header toolbar.

## Screenshot critique pass2

All13 routes were captured again at1440/768/360 and reviewed. Findings: the Budget field's form margin still shifted its buttons; upcoming mobile items used too many rows; Analytics derived metrics delayed the main chart; refresh labels lengthened phone action groups; expanded footer details needed the full record width. Changes: remove toolbar field margins, use a compact date/name/amount upcoming row, disclose secondary period metrics and align primary totals on tablet/desktop, shorten visible Refresh while retaining full accessible names, and give open footer details their own full-width row. The target-size audit then found a redundant inline all-balances link; it was removed while keeping the existing44px View all action. The final capture confirms these changes.

## Verification and review

The coarse-pointer audit found a second specificity conflict: the desktop ledger's32px button width overrode the generic44px touch rule. A matching ledger-specific touch rule now grows the actual target to44px; no overlapping invisible hit areas are used. This was checked in a real touch-enabled desktop browser context across all nine protected routes.

Financial requests use the real backend and isolated PostgreSQL with a limited application role; only external Auth-provider responses are synthetic. This refinement changes no hosted database, migration, cron, production environment, deployment or main branch. A fresh fetch found that the original redesign had already been merged remotely through PR2 (`7bdf5dd37e34a8be6f20bb782063da0c38e62c8f`); its tree matches this refinement's starting revision. This pass stays on `v2-ui-redesign` and requires a new review/merge. Local main remains `40c16f6`.

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | Pass; no ESLint findings |
| `npm.cmd run typecheck` | Pass |
| `npm.cmd run build` | Optimized build passes; static generation17/17 |
| `npm.cmd test` | 186 passed,0 failed,0 skipped |
| `functional.mjs` | 16 behavior groups;13 axe audits; no page errors |
| `auth-qa.mjs` | 6 Auth groups;8 axe audits; no page errors |
| `extended-qa.mjs` | 6 stress groups;80 axe audits across all seven widths and accessibility states |
| `generated.mjs` | 4 actual recurring/ledger/budget/analytics/Dashboard reconciliation checks |
| `states.mjs` | 17 dialog/drawer/review compositions and axe audits |
| `refinement-geometry.mjs` | 98 normal/expanded layouts;35 axe audits; Budget/Transaction baselines pass |
| `responsive.mjs` | 91 route/width layouts plus9 real desktop touch contexts;100 axe audits; zero overflow, page errors or undersized visible targets |
| `network.mjs` | 6 checks; exact nine-route matrix; zero unrelated Dashboard reads; five departing reads aborted |
| `contrast.mjs` | 14 semantic pairs pass; minimum normal-text ratio4.68:1 |

Keyboard dialog traps, Escape, trigger/fallback focus, first-invalid focus, skip link, navigation/filter drawers and Enter submission pass. Reduced motion removes transitions/animations, forced colors retain operable geometry, and150% text plus200% CSS zoom/equivalent viewport reflow retain content/actions. This is not OS browser-toolbar zoom automation. Exact chart text/table equivalents remain available in disclosures. Axe incompletes caused by native-modal overlap are retained in the JSON; they are not converted into automated passes. Dialog screenshots and foreground/background token pairs were reviewed, with no contrast defect found.

All required layout widths are covered:320/360/375/768/1024/1280/1440. Dialogs cover320/1440 plus420px short-height checks at320/768/1440. Native selects use browser menus and bounded triggers. Disabled historical references remain available and accurately labeled. The design-system showcase is development-only (404 in this optimized build); release-check redirects to Dashboard, so neither adds another production financial page.

## Review artifacts

- [Baseline protected-route audit and network log](assets/refinement/before/audit.json).
- Pass1: [1440 gallery](assets/refinement/pass-one/contact-1440.html), [768 gallery](assets/refinement/pass-one/contact-768.html), [360 gallery](assets/refinement/pass-one/contact-360.html).
- Pass2: [1440 gallery](assets/refinement/pass-two/contact-1440.html), [768 gallery](assets/refinement/pass-two/contact-768.html), [360 gallery](assets/refinement/pass-two/contact-360.html).
- Final: [1440 gallery](assets/refinement/final/contact-1440.html), [768 gallery](assets/refinement/final/contact-768.html), [360 gallery](assets/refinement/final/contact-360.html).
- Full-size final examples: [Dashboard desktop](assets/refinement/final/dashboard-1440.png), [Dashboard phone](assets/refinement/final/dashboard-360.png), [ledger](assets/refinement/final/transactions-1440.png), [Analytics tablet](assets/refinement/final/analytics-768.png), [Budget toolbar](assets/refinement/final/budgets-1440.png).
- [Structured verification](assets/refinement/verification/quality.json), [exact network requests](assets/refinement/verification/network.json), [layout measurements](assets/refinement/verification/refinement-geometry.json).

Each critique and the final capture retains39 main-route screenshots (13 routes ×3 widths), plus final dialog/stress states. The galleries are portable relative-image HTML files. Research and evidence are review artifacts; they are not loaded by the application bundle.

## Performance and delivery

Across the nine independent fresh-route entries, financial API requests fell from43 to34. Accounts/detail each fell50%; Settings fell75%; Dashboard remains at two, with zero unrelated reads. These counts deliberately include the required profile bootstrap. They do not imply a75% latency improvement or a reduction in every request class.

The final bundle adds715 emitted JavaScript bytes (117 gzip) and1843 gzip CSS bytes against the starting redesign. No dependency, financial fixture module or heavy chart framework was added. Two self-hosted font files remain the only font origins. Nine warm local readiness samples measured731–832ms, median798ms; the metric includes network-idle settling and two animation frames, and is not production Core Web Vitals.

Final totals:38 browser behavior checks and253 axe audits with zero violations. Sixteen native-dialog audit entries retain18 color-contrast incomplete nodes; those overlap ambiguities were manually reviewed against screenshots and the measured semantic palette. They are explicitly preserved in the structured evidence. No known functional, overflow or target-size blocker remains in the tested matrix. Hosted Auth email delivery, production telemetry and OS-level zoom are outside this isolated visual acceptance run.

`git diff --check` passes, and the source/build/docs pattern secret scan reports no recognized credential findings. Backend financial calculations, schema, deployment workflow and package dependencies have no changes. The branch is technically ready for a new review and merge after the user's visual approval. This pass does not merge or deploy it. The delivered commit/origin synchronization is reported separately to avoid a circular self-hash in this document.
