# Expense Tracker V2 — Implementation Plan

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen; T01–T11 ✅ Completed; T12 ⬜ Next — not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:**  
- `01-product-brief.md`
- `02-prd.md`
- `03-ux-specification.md`
- `04-architecture.md`
- `05-database-design.md`
- `06-api-design.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

# 1. Purpose

This document turns the V2 planning artifacts into an actionable implementation roadmap.

It defines:

- milestones;
- task order;
- dependencies;
- acceptance criteria;
- migration safety;
- browser UI approval dependencies;
- security gates;
- testing gates;
- deployment gates;
- completion criteria.

The plan assumes V1 is already complete, deployed, and verified.

V2 should be implemented incrementally without destabilizing the existing V1 production system.

---

# 2. Delivery Strategy

**V2 Core Completion = P0 only.** P1 features are planned V2 enhancements after the core release and require explicit promotion to become core gates.

- P0: Supabase Auth/profile, protected app, user isolation, accounts, account-aware transactions, transfers, recurring definitions/occurrences/generation/upcoming, dashboard, analytics, monthly category budgets, manual-progress goals, custom categories, core settings, search/filter/cursor pagination, migration, financial/security/accessibility validation and production acceptance.
- P1: notifications, reports/CSV/JSON export, recurring-pattern detection, deterministic insight cards, goal projections/history/detail, and account detail page.
- Post-V2 / P2: user-identity deletion, budget rollover, account-linked automatic goal progress, email/push, PDF/Excel, advanced detection, richer debt products, bank sync, AI advice, OCR, investments, shared wallets and currency conversion.

P0 shows budget warning states within budget/dashboard views; persistent notifications are P1. /reports, account-detail routes, notification controls and export sections are absent from P0 navigation. P1 tables/endpoints/browser states below describe enhancement contracts, not core requirements.

Task IDs T01–T75 are retained for traceability; IDs are not a strict execution order. §20 is the dependency map. Schema/task implementation takes place in disposable development environments first; production execution is T66, after rehearsal/security gates. P1 tasks are deferred by the approved P0-only rule, not silently marked implemented.

---

# 3. Global Rules

Every task must follow these rules.

## Security

- never trust client-supplied `userId`;
- use authenticated identity from verified token;
- never expose database credentials;
- preserve limited runtime DB role;
- use parameterized SQL;
- keep CORS narrow;
- keep production errors sanitized.

## Money

- unrestricted NUMERIC with scale<=2/range checks, values max 999999999.99, signed opening balances;
- API decimal strings;
- no JavaScript floating-point financial calculations;
- aggregates calculated in PostgreSQL/backend.

## Dates

- financial dates use calendar-date semantics;
- do not timezone-shift `YYYY-MM-DD`;
- timestamps/infrastructure use UTC ISO8601; financial today uses fixed Africa/Cairo.

## Mutations

- no automatic retry for uncertain writes;
- transfers must be atomic;
- recurring generation must be idempotent;
- destructive actions require confirmation.

## Migration

- use additive migrations first;
- rehearse on disposable database;
- preserve rollback path;
- never perform destructive production migration without verified backup/rehearsal.

---

# 4. Milestone Overview

| Milestone | Focus |
|---|---|
| M1 | V2 planning and design lock |
| M2 | Auth foundation |
| M3 | User ownership and migration |
| M4 | Accounts |
| M5 | Transactions V2 |
| M6 | Transfers |
| M7 | Recurring finance |
| M8 | Dashboard V2 |
| M9 | Analytics |
| M10 | Budgets |
| M11 | Goals |
| M12 | Categories/settings P0; notifications P1 |
| M13 | Reports and exports — P1 only |
| M14 | Full V2 verification |
| M15 | Deployment and production acceptance |

---

# 5. M1 — V2 Planning and Design Lock

## T01 — Review and Freeze Planning Artifacts

**Status:** Review completed; T01 found decisions/contradictions. T02 resolves them before freeze.

**Depends on:** none.

Acceptance: all seven documents read and V1 compatibility reviewed; decision checklist recorded; no code/provider changes. T02 consistency pass supplies the final P0 planning freeze.

---

## T02 — Resolve Open Architecture Decisions

**Status:** Completed — 2026-10-06.

**Depends on:** T01.

Decisions frozen across all seven documents: P0-only core; bounded exact money; debt-positive cards; derived net worth; archive/restore and automatic schedule pause; dedicated transfers; daily Vercel Cron protected GET; durable occurrences and bounded catch-up; deletion matrix; manual goals; signed cursors; ES256 JWKS/session/bootstrap; Express/private-schema authorization with deferred RLS; owner-input maintenance cutover/two rollback windows; inclusive period/forecast calculations.

Acceptance: final consistency pass, no blocking decisions, documentation-only changes. No migrations/Auth/Figma/code started.

---

## T03 — Build V2 Code-First Design System & App Shell

**Status:** Completed — 2026-10-06. Reusable code-first foundation verified at `/v2/design-system`; see [T03 verification](t03-verification.md). T04 is completed with explicit user visual approval recorded on 2026-10-06.

**Depends on:** completed T01/T02 and this approved documentation amendment. No T05+ integration dependency.

Build the real reusable visual foundation directly in the existing Next.js/React/TypeScript/Tailwind CSS 4 frontend, using static fixtures only. Browser implementation is authoritative for visual design; follow UX §§29–39.

Deliver:

- semantic CSS/Tailwind tokens, typography (Geist if practical), tabular numbers, spacing/radius/elevation and layout system;
- responsive app shell, 220–240px desktop sidebar, mobile/tablet top bar and navigation drawer, PageHeader;
- buttons, inputs (text/money/search/date/password), selects, textarea and compact choice controls;
- accessible dialogs/drawers, confirmation/pending/error/uncertain-outcome patterns;
- feedback banners, skeletons, empty/error/stale states;
- MoneyDisplay, SummaryCard, AccountCard and TypeBadge with explicit card debt and neutral transfer semantics;
- TransactionRow/TransactionCard, actions, filters and cursor-history pagination presentation;
- account/transfer forms, recurring cards/forms/status/frequency/upcoming items;
- budget and manual-goal components, category/profile/settings/auth presentation building blocks;
- chart shells with title/period/legend, loading/empty states and text/table alternatives.

### Acceptance Criteria

- components use semantic tokens and flexible CSS layout; no clipped text or uniform card-grid page prescription;
- browser specimens at 360/768/1440 demonstrate responsive behavior, exact large values, 200-character descriptions, long names and multiline errors;
- keyboard/focus, AA contrast, 44px targets where appropriate, dialog focus management, reduced motion and non-color financial meaning verified;
- no API requests, Supabase/Auth connection, credentials, database/migration changes or V1 financial-service integration; static fixtures/local UI state only;
- development-only review surface and component inventory/validation evidence recorded in UX/plan; fixture preview cannot expose production data;
- P1 notifications/reports/suggestions/projections/detail are not required. Full page flows remain T04.

**Verification:** lint, TypeScript, production build and 22 existing frontend tests pass. Browser checks at 360/768/1440 found no horizontal page overflow; axe audits reported zero violations. Keyboard modal focus/trap/Escape/return, pending/error/uncertain states, reduced motion and stress fixtures passed. V1 source/styles remain unchanged; the production showcase returns 404. No application dependency, API/Auth/backend/database change.

Historical [Figma file](https://www.figma.com/design/05Flgth8HPK8evKrxwRtmf) is abandoned/non-authoritative. No further Figma work or access is required.

---

## T04 — Build V2 P0 UI Prototype with Fixtures

**Status:** ✅ Completed — 2026-10-06. Browser verification is preserved in [T04 verification](t04-verification.md). The user explicitly reviewed and approved the code-first V2 prototype as the visual source of truth and instructed that the UI design remain unchanged. The visual approval gate is satisfied; T05/T06 are now completed.

**Depends on:** completed, verified T03 components/app shell. No real Auth/API integration.

Build the actual browser pages using mock/fixture data only: /login, /register, /forgot-password, /reset-password, /dashboard, /transactions, /accounts, /recurring, /analytics, /budgets, /goals, /settings.

Compose the editorial workspace, ledger, schedule/timeline, analytical summary, readable budgets and calm manual goals described in UX. Simulate register/verification/login/bootstrap/logout/reset/session expiry; first account and locked opening balance; transaction CRUD; transfers/card payment; recurring create/pause/resume/archive; budget CRUD; manual goal completion; settings/categories and analytics period changes. Use local fixture state; no financial floating-point math. Required browser states remain UX §§35–39.

### Acceptance Criteria

- all P0 routes/forms and critical fixture journeys are reviewable in the browser;
- populated/loading/empty/error/stale/partial/pending/uncertain/session states are represented without claiming real authentication or persisted writes;
- actual/forecast, archived history, debt/overpayment and manual goal semantics match frozen contracts;
- responsive 360/768/1440, keyboard/accessibility and stress-content checks pass;
- no Supabase Auth, V2/V1 API calls, database access or real financial data; keep fixture previews development-only until later authentication/integration gates;
- browser review evidence and explicit UI approval are recorded before T05+ integration. Do not mark production domain/Auth tasks complete based on fixtures.

Later T07/T19/T25/T28/T34/T37/T40/T44/T46/T49 integrate and finish these approved page implementations with real services instead of rebuilding them. Existing T05+ domain, security, migration and production acceptance requirements remain intact.

---

# 6. M2 — Authentication Foundation

## T05 — Configure Supabase Auth for V2

**Depends on:** T02; implementation begins after T03/T04 fixture browser UI approval.

Configure/test email/password, production email confirmation, password reset/verification allowlisted redirects, 15-minute access JWT lifetime and **ES256 asymmetric signing key**. Verify actual project capabilities/key/issuer/JWKS; do not assume current settings. Local/disposable test users only until production runbook.

Acceptance: register/verify/sign-in/sign-out/reset work; ES256 token/JWKS verified before T09; public publishable key only in browser; no service-role/shared JWT secret in runtime.

**Status: ✅ Completed (2026-10-06).** Initial provider/JWKS audit plus user-reported manual verification confirm hosted redirects, Site URL, email/password with confirmation, ES256/JWKS contract, 900-second lifetime and dedicated-account flows. See [T05 verification](t05-verification.md) for evidence attribution.

---

## T06 — Add Frontend Auth Client

**Status:** ✅ Completed — 2026-10-06. Isolated lazy browser client, typed helpers, normalized errors and subscription cleanup verified by automated tests, including SDK persisted-session restoration. Live account verification was not rerun because credentials were not supplied; safe manual steps are in [T06 verification](t06-verification.md). T06 added no page integration or guards; subsequent page integration is recorded under T07 below.

Implement:

- Supabase client initialization;
- session retrieval;
- auth-state listener;
- token retrieval;
- sign-in/sign-up/sign-out helpers.

### Acceptance Criteria

- session survives reload;
- auth state updates correctly;
- tokens are not logged;
- auth helpers are typed.

---

## T07 — Build Auth Pages

**Status:** ✅ Completed — 2026-10-06. Approved four Auth forms now use T06 helpers with safe validation/errors, duplicate blocking, confirmation and recovery handling. Lint/type/build and 44 tests pass; 30 browser responsive/accessibility audits pass at 360/768/1440. Browser provider responses are synthetic; no live credentials were supplied. See [T07 verification](t07-verification.md) for scope and optional manual live checks. Financial routes remain fixtures/development-only. The subsequent T08 checkpoint is recorded below.

Implement:

- `/login`;
- `/register`;
- `/forgot-password`;
- `/reset-password`.

### Acceptance Criteria

- integrates the approved T04 browser UI;
- validation works;
- backend/Provider errors are safe;
- keyboard/accessibility checks pass;
- mobile/desktop behavior verified.

---

## T08 — Protect Frontend Routes

**Status:** ✅ Completed — 2026-10-06 (session-gated fixture checkpoint). A V2-only provider/shared boundary protects all eight financial routes with loading, safe return paths, real shell signout, expiry and refresh handling. Lint/type/build and 51 tests pass; representative browser checks pass at 360/768/1440. Production V2 remains disabled. See [T08 verification](t08-verification.md). Profile/bootstrap gating remains a mandatory T13-dependent extension before real financial integration; it is not implemented or claimed here. The subsequent T09 checkpoint is recorded below.

**Depends on:** T06/T07; bootstrap portion requires T13.

P0 client protected layout guards dashboard/transactions/accounts/recurring/analytics/budgets/goals/settings; / resolves after session. No financial render/fetch before session and profile bootstrap. Clear data/abort reads/cursor history on user change/sign-out/401; allowlisted return paths only. P1 reports/details get same protection when promoted. Acceptance: no protected stale-data flash or late prior-user response, valid session survives reload, session refresh safe.

---

## T09 — Add Backend Auth Middleware

**Status:** ✅ Completed — 2026-10-06. Pinned jose ES256 remote-JWKS verification, strict Bearer parsing, trusted typed context and safe 401/503 failures are reusable and verified. Public V2 health matches V1; no deployed Auth probe or financial V2 endpoint was added. Backend lint/type/build pass; 28 tests pass with four existing disposable-DB groups skipped, including eight new cryptographic/Auth groups. Public hosted JWKS was rechecked; live account-token verification remains optional/private because no token was supplied. See [T09 verification](t09-verification.md). T10 has not started.

**Depends on:** T05.

Use jose ES256 remote project JWKS, pin issuer/audience authenticated/algorithm, validate exp/nbf/UUID sub/authenticated role. Derive identity from verified sub; ignore/reject client owner claims, never user_metadata authorization. Fail closed on key/provider errors; no HS256 fallback. Test expired/invalid/signature/issuer/audience/unknown-kid/rotation and missing token.

---

## T10 — Add Authenticated API Client

**Status:** ✅ Completed — 2026-10-06. Isolated V2 transport reuses the T06 current-token helper, parses typed errors/envelopes, supports cancellation and never retries writes. Test-only Express/JWKS integration verifies T09 trusted identity and auth failures. See [T10 verification](t10-verification.md).

Provide a dedicated V2 frontend API client to:

- attach Bearer token;
- handle 401 centrally;
- retain typed API errors;
- avoid write retries.

### Acceptance Criteria

- authenticated GET/POST works;
- expired session behavior is safe;
- no token leakage in logs.

---

# 7. M3 — User Ownership and Safe Migration

## T11 — Prepare V2 Additive Schema Migrations

**Status:** ✅ Completed — 2026-10-06. Four additive stage A/B migrations provide P0 tables, nullable V1 transaction references, indexes/timestamp triggers and private limited-role grants. Disposable PostgreSQL 17.11 apply/reversal/catalog/row/totals/security checks and the full backend suite against the migrated schema passed. No production application, backfill, category seed, Auth provisioning or P1 table was performed. See [T11 verification](t11-verification.md). T12 is next and has not started.

**Depends on:** T02, V1 inventory/schema review. Execute here only on disposable development database.

Split into reviewable subtasks:

- T11a: prepare stage A P0 tables/profiles/accounts/categories/transfers/recurring definitions/**occurrences**/budgets/goals and explicit private grants/revocations. No notifications/history tables required for P0.
- T11b: prepare stage B nullable transaction user/account/category IDs; preserve transaction_date, legacy columns/checks, original SQL history and TLS/limited role.
- T11c: disposable apply/reversal/catalog audit, exact money excess-scale rejection and limited-role tests.

T11 creates the occurrence ledger's basic structure, uniqueness, state checks, same-owner definition FK and generated-link SET NULL FK. Transaction pair/link constraints and terminal-transition/generated-identity triggers specified in database §§12,19,20 remain under T32 before processor. Transaction ownership/category enforcement remains under T15. Acceptance: V1 fields retained, no lost rows, runtime no DDL/admin, no exposed financial schema. Production stages execute only in T66 maintenance.

---

## T12 — Add Default Category Seed and Early Category Reads

**Depends on:** T11, T09 for authenticated API reads.

Seed stable repeatable system categories, including one both-kind Other; implement authenticated GET /api/v2/categories returning system+owned categories with kind/status filters. This read contract moves ahead of all transaction/recurring/budget forms.

Acceptance: stable IDs/idempotent seeds, compatibility kind checks, ownership isolation, no development financial seed in production. T48 later adds custom write/lifecycle support; shared schema validator may be built here.

T12 implementation uses a separate repeatable reference seed, authenticated GET only, active-only default status, compatibility kind filters and deterministic system/name/id ordering. Frontend fixtures remain unchanged; no profile/account provisioning or ownership migration. See [T12 verification](t12-verification.md) for disposable seed/isolation/privilege and regression evidence.

---

## T13 — Provision Profiles and Build Profile API

**Depends on:** T09/T11.

T13a: POST /profile/bootstrap idempotent insert-on-conflict verified-sub/defaults, no auth.users trigger/admin reads. T13b: GET/PUT /profile with displayName-only writes, PROFILE_REQUIRED recovery and migrated-owner provisioning. T13c: frontend session bootstrap before reads, registration-name draft PUT and parallel bootstrap/missing profile/failure tests.

Acceptance: profile APIs typed/scoped; EGP/en/Cairo fixed; no signup-blocking database trigger; failure recovery observable.

T13 completed with explicit POST bootstrap, read-only GET, displayName-only PUT, local user-bound registration drafts and profile preparation before protected fixture rendering. Settings/shell profile UI remains T49. Concurrent provisioning, cross-user isolation, real disposable PostgreSQL/JWT API requests, frontend retry/session invalidation and focused browser checks passed; see [T13 verification](t13-verification.md). No migrated-owner profile or legacy financial ownership was provisioned.

---

## T14 — Rehearse V1 Data Migration

**Depends on:** T11/T12/T13.

Disposable production-like copy only: operator-provided verified owner UUID, real inventory input, cash Main Account opening 0.00 / locked if activity, explicit category map, final ownership backfill with timestamps preserved, exact row/field/totals reconciliation. Rehearse V1 financial maintenance before backfill, trigger suppression/restoration under privileged transaction and both rollback windows. Do not assume historical T14 counts.

Acceptance: no lost/changed IDs, amounts/dates/descriptions/timestamps; no unknown categories, ownerless rows or duplicate backfill; no production writes performed here.

T14 completed locally: explicit synthetic owner/frozen inventory, cash Main Account opening 0.00, literal T12 mappings, single-trigger transactional suppression, exact microsecond/row/money reconciliation, fail-closed preflight, no-op rerun, window A reversal and window B rollback refusal. All V1 financial maintenance paths and stale-runtime privilege denial were rehearsed; an old V1 write demonstrated NULL ownership. Final dataset is T15-ready, with ownership columns still nullable. See [T14 verification](t14-verification.md). No remote migration or T15 enforcement was performed.

---

## T15 — Prepare and Test Ownership Constraints

**Depends on:** T14.

Prepare/test stage E on disposable migrated copy: NOT NULL, composite owner FKs, category/type/link triggers, exact scale/bounds, deletion matrix, indexes, legacy category nullable/check transition and private grants. Confirm trigger/backfill timestamp preservation and runtime restrictions. Production enforcement belongs to T66 only after final reconciliation/maintenance.

Acceptance: cross-owner/category-kind mutations rejected, archived lifecycle safe, retained V1 dates/totals exact, no public V1 compatibility expected.

**Completed locally on 2026-10-06.** The atomic stage E migration passed 207 dedicated checks after the 64-check T14 fresh backfill; 15 preflight faults and a failure after ALTER rolled back safely. Required transaction references, eight native composite owner FKs, category ownership/kind checks, immutable owners/system categories, account opening locks and archive/pause rules are verified. Historical archived categories remain valid; future services block archived-category activity per the explicit T15 instruction. Legacy V1 reads remain compatible in the disposable probe; V1 POST fails required ownership. Financial rows/timestamps/totals are unchanged. See [T15 verification](t15-verification.md). Production enforcement remains T66; T16 and Accounts CRUD have not started.

---

## T16 — Establish Expanding Multi-User Isolation Suite

**Depends on:** T09/T11; each domain adds its cases before delivery.

Build User A/B fixtures and helpers now; expand with profiles/categories/accounts/transactions/transfers/recurring/occurrences/budgets/goals/analytics/dashboard as those domains land. P1 adds notification/report/export cases only when promoted. Test foreign referenced IDs, cursor scope, unsafe identity input, GET/PUT/DELETE and aggregate leakage. This task is a continuing gate, not a demand for unbuilt endpoints before T17. T59 is the final complete P0 acceptance.

---

# 8. M4 — Accounts

## T17 — Build Account Backend

Implement:

- GET accounts;
- POST account;
- GET account by ID;
- PUT account;
- archive;
- restore (required P0);

### Acceptance Criteria

- ownership enforced;
- exact opening balance preserved;
- archived accounts handled correctly;
- API matches design.

---

## T18 — Build Account Balance Queries

**Depends on:** T17, prepared transaction/transfer schema.

Assets = opening+income-expense+incoming-outgoing. Card debt = opening+expense-income+outgoing-incoming. Total Balance/net worth sums assets minus card debt including archived accounts, all-history. Query exact pre-aggregated SQL; no join multiplication/floats. Acceptance fixtures cover purchases/payments/cash advances/overpayment, archive inclusion and corrections/deletes. Final reconciliation expands after T21/T26.

---

## T19 — Build Accounts Page

**Depends on:** T17/T18/T10/T08 and approved T04 P0 browser UI. Transfer panel completion is staged after T26/T27/T28; account detail is P1.

Implement `/accounts`.

### Acceptance Criteria

- account cards;
- empty/loading/error states;
- add/edit/archive/restore and automatic recurring pause feedback;
- responsive behavior;
- accessibility checks pass.

---

## T20 — Build Account Detail Experience — P1 Optional

**Depends on:** T17/T18/T21/T26 and approved P1 browser UI states. Not a P0 gate.

Optional /accounts/[id] with balance, scoped recent transactions, analytics/transfer/archive actions. P0 account cards link to filtered /transactions and accounts transfer panel. Acceptance when promoted: ownership, complete dependency contracts and approved P1 browser UI.

---

# 9. M5 — Transactions V2

## T21 — Upgrade Transaction Backend to V2 Ownership

**Depends on:** T09/T12/T15/T17.

Split T21a validator/create/read; T21b edit/hard-delete/generated-link preservation; T21c ownership/date/money/archived-state/reconciliation tests. Use transaction_date storage/API date, direct verified owner, active owned account, compatible owned/system category and no client recurring metadata. Account first activity permanently locks opening balance. Preserve durable occurrence on generated hard-delete.

Acceptance: all CRUD/cross-user cases pass; V1 financial routes are blocked/retired, never left publicly operating against V2 data.

---

## T22 — Add Server-Side Search

Search:

- description;
- account;
- category.

### Acceptance Criteria

- parameterized query;
- user-scoped;
- empty query safe;
- realistic dataset performance acceptable.

---

## T23 — Add Advanced Filters

Support:

- type;
- account;
- category;
- from;
- to;
- recurring generated/manual; omitted for all.

### Acceptance Criteria

- filters compose correctly;
- invalid combinations rejected safely.

---

## T24 — Add Cursor Pagination

**Depends on:** T21–T23.

Implement signed HMAC-SHA256/versioned 24h cursor bound to user/resource/filter/search/limit with ordering date DESC,createdAt DESC,id DESC. Default 25 / max 100; backend nextCursor only, frontend Previous through history; generic invalid-cursor400. Reuse for T26 transfers and P1 notifications. Tests cover inserted/deleted/edited records, malformed/tampered/expired/wrong-scope/user cursor, filters and frontend resets. Paging is not a historical snapshot.

---

## T25 — Build Transactions Page

Implement `/transactions`.

### Acceptance Criteria

- search;
- filters;
- pagination;
- table/cards;
- add/edit/delete;
- responsive mobile filters;
- error/loading/empty states;
- accessibility.

---

# 10. M6 — Transfers

## T26 — Build Atomic Transfer Backend

**Depends on:** T09/T15/T17/T18/T21/T24.

Dedicated transfers create/list/read/edit/hard-delete, positive exact money/manual dates/optional description, distinct owned active accounts for create/edit. Atomicity is mandatory in initial implementation, using one checked-out pg client and consistently ordered old/new account locks. Permanently lock opening balance on first activity; deletes against archived parents allowed. Lists use cursor contract.

Acceptance includes T27 fault/concurrency checks before T26 is complete; no partial state, safe uncertain outcomes, card payment/overpayment reconcile, no income/expense transfer counting.

---

## T27 — Verify Transfer Atomicity and Concurrency

**Depends on:** implemented T26 paths; mandatory delivery gate for T26, not later optional hardening.

Simulate create/edit/delete failures, account archive/edit races, simultaneous first activity/opening edits and repeated submissions; verify rollback/reconciliation and no authorization bypass. Duplicate deliberate transfer requests remain separate records (no mandatory P0 idempotency header); no automatic write retry. T28 waits for T26+T27 acceptance.

---

## T28 — Build Transfer UI

**Depends on:** T26/T27/T19 and approved T04 P0 browser UI.

Implement accounts transfer form, cursor list, edit and hard-delete confirmation.

### Acceptance Criteria

- source/destination clearly shown;
- confirmation;
- pending state;
- safe failure recovery;
- responsive/accessibility.

---

# 11. M7 — Recurring Finance

## T29 — Build Recurring Backend

**Depends on:** T09/T12/T15/T17/**T30/T32**.

Create/list/read/edit/pause/resume/archive and upcoming projection. Use fixed startDate anchor, future/today initial occurrence (no past import), active parent validation, immutable generated history and durable terminal markers; nextOccurrence null for paused/archived/exhausted. Archive/account/category operations auto-pause as specified.

Acceptance: lifecycle/month-end/leap-year/past-start/end-date/ownership tests pass; client cannot set generated metadata. Split CRUD validation and lifecycle/projection into reviewable subtasks.

---

## T30 — Implement Recurrence Calculator

**Depends on:** T02; precedes T29.

Daily/weekly/monthly/yearly anchored on startDate; ISO weekday1–7, month-end clamping preserves anchor, Feb29→Feb28 in nonleap years. First date on/after Cairo today, inclusive end/null exhausted, date upper-bound guard. Pure deterministic tests for creation, pause/resume/edit/forecast and catch-up; no timezone drift.

---

## T31 — Implement Recurring Processor

**Depends on:** T29/T30/**T32**; provider security contract frozen before coding.

T31a durable pending claim/reservation; T31b locked atomic posting+occurrence link/status+next date; T31c rollback/failed recording/retry/observability. GET protected job handler, max 100 per definition / 1000 attempts global, deadline buffer; continue later, process other definitions despite failures.

Acceptance: duplicates/concurrent jobs/generated-delete replay impossible, archive race safe, no partial financial state, safe counts/hasRemaining and persistent backlog. T33 configures production-like scheduling only after reliability tests.

---

## T32 — Implement Durable Occurrence Persistence

**Depends on:** T11/T15; precedes T29/T31.

Required recurring_occurrences unique definition/date, direct owner/composite FK, pending/posted/skipped/failed, immutable terminal markers, sanitized failure metadata, nullable generated link ON DELETE SET NULL and same-owner/definition/date validation. Supplemental generated-transaction unique partial index. Runtime cannot delete ledger markers.

Acceptance: posted marker survives generated transaction hard-delete/edit; no re-post; concurrent claim and failed retry pass. Persistence invariants implemented before processor delivery.

---

## T33 — Configure Daily Vercel Scheduled Execution

**Depends on:** T31 reliability gate; provider is already decided in T02.

Configure backend cron 0 3 * * * UTC, GET /internal/recurring/process, CRON_SECRET validation/no-store, function duration/safety buffer and bounded batch benchmarking. Hobby daily/hour-level precision sufficient, no exact-time guarantee/no assumed failure retry. Verify failed/backlog/operator retry and safe logs on production-like environment. Production cron disabled until T66–T71 validation/write-enable checkpoint, then T72.

---

## T34 — Build Recurring Page

Implement `/recurring`.

### Acceptance Criteria

- list;
- tabs/filters;
- upcoming;
- add/edit;
- pause/resume;
- empty/error/loading states.

---

## T35 — Add Recurring Suggestions — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Deterministic detection.

### Acceptance Criteria

- suggestion only;
- no auto-enablement;
- user confirmation required;
- false positives do not mutate data.

---

# 12. M8 — Dashboard V2

## T36 — Build Dashboard Aggregate API

**Depends on:** T18/T21/T29/**T38/T42/T43/T45**; can stage basic aggregate earlier, final P0 acceptance waits for these.

GET /api/v2/dashboard?period=this_month returns resolved period, summary, accounts, incomeVsExpenses chart series, recentTransactions, upcomingRecurring, current-month budgets and active goals in one consistent read-only REPEATABLE READ snapshot. P1 insights absent.

Acceptance: user-scoped exact values/net-worth debt convention/period bounds, no waterfall, actual/forecast separated; full previews use completed domain calculations.

---

## T37 — Build V2 Dashboard UI

**Depends on:** T36, T19/T25/T34/T44/T46 and approved T04 P0 browser UI. Basic shell/cards may be staged earlier.

P0 summary/net-worth cards, account overview, backend chart, recent transactions, recurring/budget/goal previews, period controls and new-user onboarding. No core insight/notification requirement. Acceptance: complete P0 data/empty/partial error/responsive/accessibility states; debt-positive cards and archived net-worth clearly labelled.

---

# 13. M9 — Analytics

## T38 — Implement Analytics Queries

Build PostgreSQL aggregates for:

- income vs expenses;
- category breakdown;
- income sources;
- savings trend;
- account activity;
- recurring commitments;
- average spend.

### Acceptance Criteria

- transfers excluded;
- exact totals;
- known fixtures reconcile.

---

## T39 — Implement Analytics API

Implement:

```text
GET /api/v2/analytics/overview
```

and split endpoints only if needed.

### Acceptance Criteria

- ranges validated;
- user-scoped;
- safe empty state;
- performance acceptable.

---

## T40 — Build Analytics Page

Implement `/analytics`.

### Acceptance Criteria

- period selector;
- charts;
- accessible data alternatives;
- loading/empty/error states;
- responsive layouts.

---

## T41 — Add Deterministic Financial Insights — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Examples:

- spend increase/decrease;
- savings rate;
- largest expense;
- top category;
- recurring expense ratio.

### Acceptance Criteria

- values match analytics;
- no unsupported advice;
- periods labelled.

---

# 14. M10 — Budgets

## T42 — Build Budget Backend

Implement:

- list;
- create;
- update;
- delete;
- progress calculation.

### Acceptance Criteria

- one budget/category/month;
- exact values;
- user ownership;
- spent derived from transactions.

---

## T43 — Add Budget Status Logic

Statuses:

- normal;
- near limit;
- exceeded.

### Acceptance Criteria

- default threshold90%, exact comparison before display rounding tested;
- no manual spent field.

---

## T44 — Build Budgets Page

Implement `/budgets`.

### Acceptance Criteria

- month selector;
- create/edit/delete;
- progress cards;
- warning states;
- responsive/accessibility.

---

# 15. M11 — Goals

## T45 — Build Goal Backend

Implement:

- list;
- create;
- update;
- complete;
- archive.

### Acceptance Criteria

- exact money;
- user-scoped;
- valid manual-progress/completion/archive lifecycle, linked-account metadata only, no core history;

---

## T46 — Build Goals Page

Implement `/goals`.

### Acceptance Criteria

- goal cards;
- create/edit;
- progress;
- completed/archived states;
- responsive/accessibility.

---

## T47 — Add Goal Projection — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

When P1 is promoted:

- estimate completion based on historical savings.

### Acceptance Criteria

- labelled estimate;
- deterministic;
- no financial advice claims.

---

# 16. M12 — Categories, Settings, Notifications

## T48 — Build Custom Category Backend

**Depends on:** T12/T15/T09. Moves before core entry forms needing custom-category create/manage; does not wait for goals/notifications.

T12 already supplies GET/system seeds. Add owned custom create/update/archive/restore; immutable system/owner flags, immutable referenced kind, exact same-user constraints, automatic pause of active definitions on archive and explicit resume after restore. Acceptance: history preserved, conflicts safe, two-user isolation tests.

---

## T49 — Build Core Settings Page

**Depends on:** T13/T17/T48/T10 and approved T04 core Settings UI.

T49a profile displayName/read-only preferences; T49b account/archive/restore and categories; T49c password-reset/sign-out security UI and protected-data clearing. P0 omits export/notifications/user deletion. P1 export integration follows T55/T56 plus approved P1 browser UI. Acceptance: safe confirmations, accessible responsive states, bootstrap recovery and no provider/admin keys.

---

## T50 — Build Notification Backend — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Implement:

- list;
- unread/read;
- read all;
- deduplication.

### Acceptance Criteria

- user-scoped;
- duplicate alert prevention.

---

## T51 — Build Notification UI — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Implement:

- header notification button;
- unread count;
- notification panel;
- mark read/all read.

### Acceptance Criteria

- keyboard accessible;
- mobile usable.

---

## T52 — Generate Budget / Recurring / Goal Notifications — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

When P1 notifications are promoted, create budget/recurring/**goal-milestone** generation paths with persistent event-key deduplication. This work does not run in core.

### Acceptance Criteria

- idempotent;
- no notification spam;
- known trigger fixtures pass.

---

# 17. M13 — Reports and Export

## T53 — Build Reports API — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Implement:

```text
GET /api/v2/reports/summary
```

### Acceptance Criteria

- user-scoped;
- date/account filters;
- exact totals.

---

## T54 — Build Reports Page — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

Implement `/reports`.

### Acceptance Criteria

- period controls;
- account filter;
- report sections;
- empty/error/loading states.

---

## T55 — Add CSV Export — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

### Acceptance Criteria

- current user's data only;
- correct content type;
- correct escaping;
- filters respected where defined.

---

## T56 — Add JSON Export — P1 Optional

**Scope:** Deferred enhancement; does not gate P0 release. Requires explicit promotion and its domain/browser UI approval dependencies.

### Acceptance Criteria

- current user's data only;
- correct serialization;
- exact monetary strings.

---

# 18. M14 — Full V2 Quality and Security

## T57 — Full Backend Regression

Run:

- lint;
- type-check;
- production build;
- all tests.

Verify:

- auth;
- ownership;
- accounts;
- transactions;
- transfers;
- recurring;
- analytics;
- budgets;
- goals;
- categories;
- notifications/reports only if P1 promoted.

---

## T58 — Full Frontend Regression

Run:

- lint;
- type-check;
- build;
- component/domain tests;
- browser integration.

---

## T59 — Multi-User Security Acceptance

Use at least two users.

Attempt cross-user:

- GET;
- PUT;
- DELETE;
- transfer;
- analytics;
- export only if P1 promoted.

### Acceptance Criteria

- no data leakage;
- safe denial;
- no ownership bypass.

---

## T60 — Financial Reconciliation Tests

Known dataset must reconcile:

- account balances;
- total balance;
- income;
- expenses;
- net savings;
- transfers;
- budgets;
- analytics.

No mismatch allowed.

---

## T61 — Recurring Reliability Tests

Verify:

- duplicate scheduler invocation;
- leap years;
- month end;
- pause/resume;
- missed occurrence;
- end date;
- concurrent runs;
- generated transaction hard-delete/edit never erases occurrence idempotency;
- archive/posting race and bounded backlog/deadline continuation.

---

## T62 — Responsive / Accessibility Validation

Widths:

- 320;
- 360;
- 768;
- 1024;
- 1440.

Verify:

- no overflow;
- keyboard;
- dialogs;
- navigation;
- charts;
- screen-reader semantics;
- reduced motion.

---

## T63 — Performance Review

Use realistic data volume.

Check:

- dashboard;
- transaction search;
- transaction pagination;
- analytics;
- category breakdown.

Use `EXPLAIN ANALYZE` where needed.

---

## T64 — Security Review

Verify:

- secret scan;
- runtime DB role;
- TLS;
- auth token verification;
- CORS;
- production error sanitization;
- no admin keys in browser;
- internal cron endpoint protection.

---

## T65 — V1→V2 Migration Dress Rehearsal

On disposable production-like copy:

- backup;
- migrate;
- validate;
- run V2;
- rollback rehearsal for both windows;
- verified all-V1 financial maintenance before final backfill;
- no reachable old backend deployment can expose V2 data.

### Acceptance Criteria

- no financial drift;
- no lost rows;
- no broken ownership.

---

# 19. M15 — Deployment and Production Acceptance

## T66 — Execute Production Migration and V1 Retirement

**Depends on:** all P0 implementation/validation T57–T65, operator verified project/inventory and controlled production window.

T66a: final backup/runbook/env/artifact/history verification. T66b: deploy and verify maintenance blocking every V1 financial read/write/summary, including direct clients/old deployments; suspend old role SELECT/INSERT/UPDATE/DELETE when required. T66c: execute additive schema, operator owner/profile/Main Account provisioning, final timestamp-safe backfill, exact reconciliation, then constraints/private grants; fail closed before progressing. T66d: permanently retire V1 financial handlers/old deployment access; retain legacy columns only for offline rollback.

Acceptance: inventory fields/counts/totals preserved, verified owner/composite references, no old deployment can bypass retirement. Backend deployment T67 and frontend T68 remain under maintenance until controlled T69–T71 gates pass. Document pre-write vs post-write checkpoint; daily cron only enabled afterward. Full sequence is architecture §45; do not restore old backup after V2 writes blindly.

---

## T67 — Deploy Authenticated V2 Backend

**Depends on:** T66 production schema/reconciliation/constraints. Keep maintenance/write/cron gates during controlled verification.

Verify v2 health 200, limited role/TLS/private grants, ES256 JWT/issuer/audience validation, CORS/no secrets, all V1 financial handlers removed/410 and older deployments inaccessible or unable to read/write financial data. Restore V2-required runtime DML only once old backend bypasses are neutralized.

---

## T68 — Deploy V2 Frontend

**Depends on:** T67.

Deploy source-verified Next.js core frontend with production API/Auth public config. Confirm verified login/bootstrap/protected app, core navigation without unpromoted P1, no stale shared data. Keep maintenance/controlled access while T69–T71 execute; release public write gate only after those pass.

---

## T69 — Production Auth Verification

Verify:

- register;
- sign in;
- reload;
- sign out;
- reset flow if practical.

---

## T70 — Production Multi-User Isolation Verification

Use controlled test users.

Verify no cross-user data access.

---

## T71 — Production Financial Acceptance

Verify:

- account creation;
- transaction CRUD;
- transfer;
- recurring definition;
- budget;
- goal;
- analytics;
- report/export only if P1 promoted.

Clean temporary records afterward.

---

## T72 — Production Recurring Job Verification

**Depends on:** T66–T71 gates passed, documented V2 write-enable checkpoint.

Enable daily GET cron, verify actual invocation and protected credentials, posting/backlog counts/idempotency/deleted-generated marker retention and safe logs. Operator duplicate invocation uses same internal credential. Clean controlled financial test rows while retaining occurrence markers; no real user data disturbed.

---

## T73 — Production Responsive / Accessibility Smoke Test

Widths:

- 360;
- 768;
- 1440.

Verify:

- auth;
- dashboard;
- transactions;
- dialogs;
- analytics.

---

## T74 — Documentation and Handoff

Update:

- README;
- V2 architecture docs;
- migration runbook;
- deployment runbook;
- environment variable documentation;
- API docs;
- final verification report.

---

## T75 — Mark V2 Complete

Only when:

- production acceptance passes;
- migration is stable;
- no critical security issue remains;
- financial reconciliation passes;
- all P0 tasks/gates pass; unpromoted P1 recorded deferred;
- docs are complete.

---

# 20. Dependency Map

Task numbers remain stable references, not strict chronology. Required edges:

| Work | Dependencies / order |
|---|---|
| Design | T01 review → T02 frozen → T03 → T04 P0 |
| Auth | T05 → T06/T09; T06 → T07; T06/T09 → T10; T13 → final T08 bootstrap guard |
| Schema/profile | T11 → T12 seeds; T09+T11 → T12 reads/T13; T11–T13 → T14 → T15 |
| Security suite | T16 starts after T09/T11, expands with every implemented domain; T59 final P0 gate |
| Categories | T12 read contract early; T09/T12/T15 → T48 custom backend before custom entry forms |
| Accounts | T09/T15 → T17 → T18/T19; T48 before account-adjacent transaction forms |
| Transactions | T09/T12/T15/T17 → T21 → T22/T23 → T24 → T25; forms also T48 |
| Transfers | T17/T18/T21/T24 → T26 implementation → mandatory T27 gate → T28 |
| Recurring | T02 → T30; T11/T15 → T32; T30/T32/T17/T12/T48 → T29 → T31 → T33; T29+T30 → T34 |
| Analytics | T21/T26/T29/T30 → T38 → T39 → T40 |
| Budgets | T21/T12/T48 → T42 → T43 → T44 |
| Goals | T17 → T45 → T46 |
| Dashboard | T18/T21/T29/T38/T42/T43/T45 → T36 → final T37; UI/domain previews as specified |
| Settings | T13/T17/T48/T10 → T49 |
| Final validation | all P0 domains + expanding T16 → T57–T64; complete cutover artifacts → T65 |
| Production | T57–T65 → T66 maintenance/migration → T67 → T68 → T69–T71 controlled gates → write-enable/T72/T73 → T74 → T75 |

T03/T04 fixture UI tasks require no auth client or route guard integration. Later UI integration tasks require approved T04 P0 browser UI plus the real auth client/route guard. Budgets, goals and analytics can proceed in parallel after their dependencies; templates/UI components can proceed after design approval. P1 dependencies: T20 after accounts/transactions/transfers, T35 after recurring/history, T41 after analytics, T47/history after goals/analytics, T50–T52 after source domains, T53–T56 after query/filter domains. Unpromoted P1 is outside the core critical path.

---

# 21. Suggested Delivery Grouping

Use §20 dependencies, not numeric blocks as a strict twelve-sprint schedule. Suggested groups: planning/core design; auth/schema/profile/category foundations; ownership/migration rehearsal/accounts; transactions/transfers; recurring calculator+ledger→CRUD→processor; parallel analytics/budgets/goals/settings; integrated dashboard; full P0 validation/cutover rehearsal; production migration/deploy/acceptance. P1 enhancements follow core release separately. Estimate capacity and split T11/T13/T21/T31/T49/T66 subtasks before assigning sprint size; no twelve-sprint promise.

---

# 22. Browser UI Approval Dependencies

T03 establishes reusable code-first components/shell; T04 establishes fixture-only P0 pages and browser states (UX §§35–39). Both precede UI approval and T05+ real integration. Auth UI feeds T07; accounts T19/T28; transactions T25; recurring T34; dashboard T37; analytics T40; budgets T44; goals T46; categories/settings T49. Integration tasks reuse approved frontend work and still require their existing backend/auth dependencies and production tests.

T03/T04 have no APIs or real authentication. Later T08/T09/T10 enforce actual route/token/transport boundaries; fixture session states must never be treated as authorization. P1 detail/history/projection/notifications/reports/export browser states require approval only when promoted. User deletion remains post-V2. No Figma dependency, file approval or quota remains on the critical path.

---

# 23. Migration Safety Gates

No production migration until all pass:

- disposable migration;
- row-count reconciliation;
- income reconciliation;
- expense reconciliation;
- balance reconciliation;
- category mapping verification;
- ownership backfill verification;
- rollback rehearsal for both windows;
- verified all-V1 financial maintenance before final backfill;
- no reachable old backend deployment can expose V2 data.

---

# 24. Security Gates

No V2 production release until:

- token verification tests pass;
- cross-user access tests pass;
- runtime role remains limited;
- no service/admin keys in browser;
- internal cron protected;
- CORS restricted;
- secret scan passes.

---

# 25. Financial Correctness Gates

No V2 release until:

- account balances reconcile;
- transfers excluded from income/expense;
- recurring duplicates impossible under tested flows;
- analytics totals match transaction data;
- budget spent totals match transactions;
- exact decimal strings preserved end-to-end.

---

# 26. Definition of Done for Each Task

A task is complete only when:

- implementation matches approved docs;
- tests added;
- lint/type-check/build pass;
- security implications reviewed;
- docs updated if contract changed;
- no unrelated feature work included.

---

# 27. Change Control

If implementation reveals a major design problem:

1. stop the affected task;
2. update the relevant BMAD document;
3. record the decision;
4. adjust dependent tasks;
5. continue only after the contract is clear.

Do not silently let code become the new specification.

---

# 28. V2 Core Completion Definition

Core V2 completes when every **P0** task/subtask and production gate is complete, including all P0 UX/API/security/migration/financial requirements. P1 T20/T35/T41/T47/T50–T56 are recorded **deferred by T02 P0-only scope**, not completed or necessary to ship. Account/goal detail/history follow the same rule.

Required: authenticated multi-user production; exact asset/card/net-worth reconciliation; account-aware transactions; atomic transfers; durable duplicate-safe recurrence; dashboard/chart/previews; analytics/period definitions; budgets/manual goals; core categories/settings; migration field/totals preservation; V1 retired before writes; responsive/accessibility/security/hosted checks; runbooks and handoff. T75 marks **core** complete, not all enhancements implemented. Unpromoted P1 routes/UI/tables/jobs cannot accidentally become required or publicly expose data.

---

# 29. Recommended Immediate Next Step

T01/T02/T03/T04 are complete; financial/product/security contracts remain frozen. **T04 — Build V2 P0 UI Prototype with Fixtures** received explicit user visual approval on 2026-10-06. The reviewed browser UI is the approved visual source of truth and its design must remain unchanged. All P0 routes, local interactions and verification evidence are documented in [T04 verification](t04-verification.md).

Current checkpoint:

- T01 ✅ Completed
- T02 ✅ Completed
- T03 ✅ Completed
- T04 ✅ Completed
- T05 ✅ Completed — Configure Supabase Auth for V2
- T06 ✅ Completed — Add Frontend Auth Client
- T07 ✅ Completed — Build Auth Pages with Real Supabase Auth
- T08 ✅ Completed — Protect Frontend Routes
- T09 ✅ Completed — Add Backend Auth Middleware
- T10 ✅ Completed — Add Authenticated Frontend API Client
- T11 ✅ Completed — Prepare V2 Additive Schema Migrations
- T12 ✅ Completed — Add Default Category Seed and Early Category Reads
- T13 ✅ Completed — Provision Profiles and Build Profile API
- T14 ✅ Completed — Rehearse V1 Data Migration
- T15 ✅ Completed — Prepare and Test Ownership Constraints
- T16 ⬜ Next — Expand Multi-User Isolation Tests

The T04 visual approval gate is satisfied. T05 hosted configuration, T06 Auth helpers, T07 real Auth-page integration and T08 session protection are completed; see [T05 verification](t05-verification.md), [T06 verification](t06-verification.md), [T07 verification](t07-verification.md) and [T08 verification](t08-verification.md). T09 backend identity verification is completed; see [T09 verification](t09-verification.md). T10 is completed; see [T10 verification](t10-verification.md). T11 additive schema preparation and disposable verification are completed; see [T11 verification](t11-verification.md). T12 reference seed and authenticated category reads are completed; see [T12 verification](t12-verification.md). T13 profile provisioning/API and frontend bootstrap gating are completed; see [T13 verification](t13-verification.md). T14 disposable migration rehearsal is completed; see [T14 verification](t14-verification.md). T15 local ownership enforcement preparation is completed; see [T15 verification](t15-verification.md). T16 is next and has not started. No remote schema/seed/backfill or final production ownership enforcement was performed. The approved visual design is preserved; financial pages remain fictional and development-only. Profile/bootstrap gating precedes protected fixture rendering; full Settings integration remains T49.

---
