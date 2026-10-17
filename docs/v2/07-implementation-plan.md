# Expense Tracker V2 — Implementation Plan

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** T01–T71 core tasks complete where applicable, including T66 under explicit backup/restore waiver preserving the retained record. P1 tasks remain deferred. T69 passed in its documented practical Auth scope. T70 reciprocal production isolation and T71 financial acceptance passed under controlled access. T72 scheduler verification is in progress; T73–T75 pending. See [final T66 checkpoint](t66-verification.md#final-t66-checkpoint--completed-under-explicit-backup-waiver).
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

**Foundation completed locally on 2026-10-07.** Reusable A/B financial fixtures plus a third bootstrap user, local ES256/JWKS tokens, real Express/runtime PostgreSQL integration, strict owner-injection and category-filter checks, concurrency, snapshot-backed rejection and future hidden-resource assertions are verified. The fresh T16 suite passed 599 grouped checks, including 58 rejected ownership writes. T15/T14 and existing backend regressions passed separately. Current profile/category endpoint isolation is proven; other domains have DB integrity and explicit future query/endpoint hooks, not claimed endpoint coverage. Shared runtime SQL is not tenant-scoped; production V1 retirement and later domain authorization remain required. See [T16 verification](t16-verification.md). T17 has not started; no remote/RLS/application/frontend change was made.

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

**Completed locally on 2026-10-07.** Six authenticated account routes, strict full create/PUT validation, owner-scoped hidden resources, exact NUMERIC resource balances, permanent opening/card-conversion locks, transactional archive/recurring pause/reservation skip and explicit restore are verified. The extended T16 verifier passed its original 599 checks plus 263 account checks, four forced PostgreSQL races and two rollback faults. Backend quality checks, separate T15/T14/T11 verification and V1 regressions passed. See [T17 verification](t17-verification.md). No remote migration/deployment, frontend integration, V2 transaction CRUD or T18 work occurred.

---

## T18 — Build Account Balance Queries

**Depends on:** T17, prepared transaction/transfer schema.

Assets = opening+income-expense+incoming-outgoing. Card debt = opening+expense-income+outgoing-incoming. Total Balance/net worth sums assets minus card debt including archived accounts, all-history. Query exact pre-aggregated SQL; no join multiplication/floats. Acceptance fixtures cover purchases/payments/cash advances/overpayment, archive inclusion and corrections/deletes. Final reconciliation expands after T21/T26.

**Completed locally on 2026-10-07.** One authoritative grouped NUMERIC query layer supplies account list/detail/mutation responses and archived-inclusive net position. The fresh suite passed 191 balance checks plus all 263 T17 and 599 T16 checks, including four transfer combinations, exact large/negative values, recurring exclusion, corrections/deletes, snapshot visibility and one-query lists. Actual runtime EXPLAIN ANALYZE covered 5,000 additional transactions/2,000 transfers. The unchanged T14 history reconciles through the production repository at 1000000582.01; the extended T15 verifier passed 210 checks plus 64 T14 checks. Lint/typecheck/build and full backend suite passed. See [T18 verification](t18-verification.md). No remote/schema/grant/frontend/V1/API scope changes; T19 has not started.

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

**Completed locally on 2026-10-07.** The approved Accounts UI now uses the authenticated T10 client, T17 lifecycle endpoints and T18 backend balances/summary. Create/edit/archive/restore, safe write recovery, cancellation and A/B session isolation passed the real browser/API/PostgreSQL suite (85 checks, including 12 axe WCAG A/AA audits). Frontend lint/typecheck/build and all 78 tests passed; fresh backend regressions passed 599 isolation, 263 lifecycle and 198 balance/summary checks. V1 production preview remains 200 and V2 remains 404. See [T19 verification](t19-verification.md). No schema, remote deployment, transfer API, transaction CRUD or T20 work.

---

## T20 — Build Account Detail Experience — P1 Optional

**Focused P1 promotion:** T17/T18/T19/T10/T08. Activity remains deferred to T21; transfers remain deferred to T26. Not a P0 gate.

**Completed locally on 2026-10-08.** `/v2/accounts/[id]` uses authenticated real account resources and a minimal read-only summary endpoint reusing the sole T18 balance CTE. Six authoritative monetary values, metadata, debt/credit semantics, active/archived states and shared T19 edit/archive/restore flows are implemented. No activity fixtures, transaction CRUD, transfer API, analytics, forecast, schema change or remote deployment. Dynamic routes extend T08 protection and safe sign-in return paths. Real disposable JWT/API/PostgreSQL checks passed 599 T16, 263 T17 and 285 balance/summary checks. Frontend tests and real browser acceptance cover session cancellation/isolation, safe errors and responsive/accessibility behavior at 360/768/1440. See [T20 verification](t20-verification.md). T21 is ready and unstarted.

---

# 9. M5 — Transactions V2

## T21 — Upgrade Transaction Backend to V2 Ownership

**Depends on:** T09/T12/T15/T17.

Split T21a validator/create/read; T21b edit/hard-delete/generated-link preservation; T21c ownership/date/money/archived-state/reconciliation tests. Use transaction_date storage/API date, direct verified owner, active owned account, compatible owned/system category and no client recurring metadata. Account first activity permanently locks opening balance. Preserve durable occurrence on generated hard-delete.

Acceptance: all CRUD/cross-user cases pass. T21 session scope explicitly preserves V1 reads and write compatibility; V1 retirement remains the production maintenance/cutover gate and is not performed here. Public legacy handlers must be retired before any hosted multi-user financial writes.

**Completed locally (2026-10-08):** authenticated five-endpoint transaction CRUD, exact validation, active-reference locking, deterministic basic list, generated marker preservation and read-only V1 category projection. Fresh disposable verification passed 244 transaction checks, four concurrency races and three rollback faults, alongside 599 T16, 263 T17 and 285 balance checks. See [T21 verification](t21-verification.md). T22 is completed locally; see [T22 verification](t22-verification.md). T23 is completed locally; see [T23 verification](t23-verification.md). T24 is completed locally; see [T24 verification](t24-verification.md). T25 is completed locally; see [T25 verification](t25-verification.md). T26 is completed locally; see [T26 verification](t26-verification.md). T27 is completed locally; see [T27 verification](t27-verification.md). T28 is completed locally; see [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 authoritative core and T37 connected Dashboard UI are complete locally; T38–T40 and T42–T44 are complete; T41 is deferred, T45/T46 complete and T48 next core, with full P0 preview dependencies still applicable.

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
**Completed locally (2026-10-08):** optional q-only authenticated list search, trimmed 0–200 Unicode code points, case-insensitive literal description/account/category matching, parameterized ILIKE and explicit wildcard escaping. Archived history and deterministic ordering are preserved. Fresh disposable verification passed 263 search checks plus all 599 T16, 263 account, 285 balance/summary and 244 T21 checks. Runtime EXPLAIN ANALYZE with 10,000 additional transactions per owner measured 15–28 ms locally; no schema/index/extension change was needed. Backend lint, typecheck, build and full selected suite passed. See [T22 verification](t22-verification.md). No remote changes or frontend integration; T23 filters are now completed below; T24 cursors remain unstarted.

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

**Completed locally (2026-10-08):** all seven frozen pre-pagination filters, strict scalar validation, inclusive one-sided/future date ranges, manual/generated posted rows and AND composition with T22 search. Owner-scoped reference checks return indistinguishable 404s for foreign/missing filter IDs as required by the frozen API. Archived history remains filterable; visible type/category mismatches return empty lists. Fresh integration passed 3,263 T23 grouped checks across all 128 filter subsets, plus 599 T16, 263 account, 285 balance/summary, 244 T21 and 263 T22 checks. Runtime EXPLAIN on the reused 20k scale fixture measured 2.4–13.6 ms using existing indexes; no schema changes. Backend lint/typecheck/build and full suite passed (53 passed, 0 failed, 14 environment-gated skips). See [T23 verification](t23-verification.md). Nothing applied remotely. T24 cursors and T25 frontend integration remain unstarted.
---

## T24 — Add Cursor Pagination

**Depends on:** T21–T23.

Implement signed HMAC-SHA256/versioned 24h cursor bound to user/resource/filter/search/limit with ordering date DESC,createdAt DESC,id DESC. Default 25 / max 100; backend nextCursor only, frontend Previous through history; generic invalid-cursor400. Reuse for T26 transfers and P1 notifications. Tests cover inserted/deleted/edited records, malformed/tampered/expired/wrong-scope/user cursor, filters and frontend resets. Paging is not a historical snapshot.

**Completed locally (2026-10-08):** bounded keyset pages (default 25/max 100), limit+1 continuation, strict signed version-1 24-hour user/resource/filter/limit-bound cursors and generic validation failures. Full PostgreSQL microseconds preserve tied timestamp boundaries. Dedicated server-only configuration fails safely for listing while V1/health/CRUD remain staged-compatible. Fresh integration passed 6,065 T24 grouped checks, exact traversal of 10,023 rows across 101 pages, and all T16–T23 checks. Existing indexes handled first/deep pages at about 0.39/0.46 ms locally, with search 11–14 ms and account/date pages 0.24–0.27 ms. Backend lint/typecheck/build and full suite passed (58 passed, 0 failed, 15 environment-gated skips). See [T24 verification](t24-verification.md). No remote/schema/frontend changes. T25 is completed locally; see [T25 verification](t25-verification.md). T26 is completed locally; see [T26 verification](t26-verification.md). T27 is completed locally; see [T27 verification](t27-verification.md). T28 is completed locally; see [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.
---

## T25 — Build Transactions Page

**Completed locally (2026-10-08):** real T10/T21–T24 authenticated list/search/AND filters/cursor history and CRUD, real account/category choices, exact amount/date drafts, bounded cursor recovery, stale-read/mutation recovery and owner-session isolation. Approved ledger/cards/dialogs preserved; Transactions bypasses fixture state. Frontend lint/typecheck/build and 101 tests pass; 65 primary plus 8 focused local browser checks pass with zero audited axe violations/overflow at 360/768/1440. Full disposable T16–T24 backend regression passes. No remote/schema/transfer/recurring backend changes. See [T25 verification](t25-verification.md). T26 and T27 are completed locally; T28 is completed locally; see [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

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

**Completed locally (2026-10-08):** five authenticated transfer routes, strict exact-money/manual-date/optional-note validation, ownership-safe mapping and signed resource/scope-bound cursor lists. Mutations serialize the owned transfer and lock all old/new accounts in UUID order on one client; archived history remains readable/deletable, edits require active resulting references. Fresh limited-role JWT/PostgreSQL integration passed **917 grouped transfer checks, 11 forced locking races and 11 rollback faults**, with all four asset/card combinations, exact net-position preservation and unchanged income/expense/V1 summaries. Full backend suite: **79 tests, 63 passed, zero failed, 16 environment-gated skips**, including the complete shared T16–T24 regression. Lint/typecheck/build pass. See [T26 verification](t26-verification.md). No frontend/schema/grant/remote changes. The initial atomicity checks required by T26 passed within this task; the separate T27 focused verification task is now completed; see [T27 verification](t27-verification.md). T28 integration is completed locally; see [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

**Depends on:** T09/T15/T17/T18/T21/T24.

Dedicated transfers create/list/read/edit/hard-delete, positive exact money/manual dates/optional description, distinct owned active accounts for create/edit. Atomicity is mandatory in initial implementation, using one checked-out pg client and consistently ordered old/new account locks. Permanently lock opening balance on first activity; deletes against archived parents allowed. Lists use cursor contract.

Acceptance includes T27 fault/concurrency checks before T26 is complete; no partial state, safe uncertain outcomes, card payment/overpayment reconcile, no income/expense transfer counting.

---

## T27 — Verify Transfer Atomicity and Concurrency

**Completed locally (2026-10-08):** existing T26 implementation passed focused gap verification with 4,833 grouped checks, 29 forced races, six rollback faults and 180 opposing-account stress mutations with zero observed deadlocks. Actual mutations use READ COMMITTED under the unchanged limited runtime role; uncertain COMMIT produces one committed row without automatic retry. Unchanged T26 and shared T16–T24 regressions pass. Full backend suite: 81 tests, 64 passed, zero failed, 17 environment-gated skips; lint/typecheck/build pass. No production/frontend/schema/grant/remote changes. See [T27 verification](t27-verification.md). T28 is completed locally; see [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

**Depends on:** implemented T26 paths; mandatory delivery gate for T26, not later optional hardening.

Simulate create/edit/delete failures, account archive/edit races, simultaneous first activity/opening edits and repeated submissions; verify rollback/reconciliation and no authorization bypass. Duplicate deliberate transfer requests remain separate records (no mandatory P0 idempotency header); no automatic write retry. T28 waits for T26+T27 acceptance.

---

## T28 — Build Transfer UI

**Completed locally (2026-10-08):** Accounts and account detail share real T10/T26 transfer create/review/edit/delete, active account choices with debt/credit semantics, signed cursor history, GET-only uncertain-write inspection and authoritative T18 balance/net refresh. Actual POST/PUT/DELETE lost-COMMIT acknowledgement, duplicate clicks, archive races, session isolation and persistence pass. Frontend lint/typecheck/build and 116 tests pass; browser 53 main + 10 focused checks include 32 axe audits with zero violations/overflow at 360/768/1440. Fresh unchanged backend regression passes T16–T27. No backend/schema/grant/remote changes; V2 stays development-only. See [T28 verification](t28-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

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

**Original dependency review (2026-10-08): Blocked.** T30's shared recurrence calculator and T32's durable terminal-marker/reservation invariants were required before T29. Both were subsequently completed locally; the blocker is resolved. See [T30 verification](t30-verification.md) and [T32 verification](t32-verification.md).

**Completed locally (2026-10-09):** Seven authenticated definition endpoints plus bounded read-only upcoming projection are implemented in both backend entry points. Strict public validation, owner-scoped resources, active compatible references and exact amount strings reuse existing foundations. T30 selects anchored dates on/after Cairo today; T32 transaction helpers skip unposted reservations and exclude durable historical dates. Pause/resume/archive, exhausted schedules, generated-deletion history, account/category archive interactions and financial non-effect pass 357 focused checks, ten forced races and eleven rollback faults. Full backend suite: 100 tests, 81 passed, 19 other database-gated skips, zero failures. Fresh T32 regression passes 103 checks; T16–T27 regression passes with 31 new recurring API isolation checks. Backend lint/typecheck/build pass. See [T29 verification](t29-verification.md). No schema/grants, production, frontend or processor changes. T31 is subsequently completed locally; see [T31 verification](t31-verification.md). T33 is subsequently completed locally; see [T33 verification](t33-verification.md). Next: T34, not started automatically.

Create/list/read/edit/pause/resume/archive and upcoming projection. Use fixed startDate anchor, future/today initial occurrence (no past import), active parent validation, immutable generated history and durable terminal markers; nextOccurrence null for paused/archived/exhausted. Archive/account/category operations auto-pause as specified.

Acceptance: lifecycle/month-end/leap-year/past-start/end-date/ownership tests pass; client cannot set generated metadata. Split CRUD validation and lifecycle/projection into reviewable subtasks.

---

## T30 — Implement Recurrence Calculator

**Depends on:** T02; precedes T29.

**Completed locally (2026-10-08):** Authoritative pure `backend/src/domain/recurrence.ts` provides on-or-after and strictly-after selection for daily/weekly/monthly/yearly schedules. Original anchors survive month-end/leap-day clamping; inclusive ends and the 9999 upper bound return null when exhausted. Integer calendar arithmetic uses explicit date references without clocks, timezone conversions or dependencies. All 14 recurrence tests pass; backend lint/typecheck/build pass and full backend suite reports 77 passed, 18 disposable-database tests skipped, zero failures. No API/schema/financial/production changes. See [T30 verification](t30-verification.md). The subsequent T32 and T29 completion checkpoints below supersede this original dependency checkpoint.

Daily/weekly/monthly/yearly anchored on startDate; ISO weekday1–7, month-end clamping preserves anchor, Feb29→Feb28 in nonleap years. First date on/after Cairo today, inclusive end/null exhausted, date upper-bound guard. Pure deterministic tests for creation, pause/resume/edit/forecast and catch-up; no timezone drift.

---

## T31 — Implement Recurring Processor

**Depends on:** T29/T30/**T32**; provider security contract frozen before coding.

T31a durable pending claim/reservation; T31b locked atomic posting+occurrence link/status+next date; T31c rollback/failed recording/explicit recovery/observability. Internal service only under the explicit task boundary: protected HTTP handler, CRON_SECRET and scheduling belong to T33. Max 100 per definition / 1000 attempts global, caller deadline predicate; continue later, process other definitions despite failures.

**Completed locally (2026-10-09):** Internal processDueRecurring service consumes only persisted active due cursors. T30 supplies anchored advancement; T32 supplies durable claims, atomic generated posting, terminal history and explicit failed recovery. Each reservation commits separately; posting/link/cursor advancement commit together, with existing parent-first locks and expected-cursor checks. Final focused verification passes 403 checks, twelve forced races and twelve rollback/lost-ack probes, including pending/reconnect, two-of-five crash continuation, failure-recording outage, lifecycle/account/category races, exact T18 accounting, no backfill and hard limits. Forty-user/2000-definition workload posts 1000 occurrences in 9.55 seconds locally, then the remaining 200 once; due query takes 1.28 ms. Full backend suite: 103 tests, 83 passed, 20 other database-gated skips, zero failures. Fresh T29, T30, T32 and T16–T27 regressions pass; lint/typecheck/build pass. See [T31 verification](t31-verification.md). No cron/HTTP/startup/frontend/schema/grant/production changes. T33 is subsequently completed locally; see [T33 verification](t33-verification.md). Next: T34, not started automatically.

Acceptance: duplicates/concurrent jobs/generated-delete replay impossible, archive race safe, no partial financial state, safe counts/hasRemaining and persistent backlog. T33 configures production-like scheduling only after reliability tests.

---

## T32 — Implement Durable Occurrence Persistence

**Depends on:** T11/T15; precedes T29/T31.

**Completed locally (2026-10-08):** Internal occurrence service supports durable idempotent reservation, locked atomic posting, explicit failed recovery and terminal skips. T32 additive migration enforces paired/immutable generated identity, occurrence FK/unique generated pair, terminal history and same-owner/definition/date linkage, with deferred orphan prevention. Forced double-reserve/double-post waits, lost commit acknowledgement, reconnect, six rollback faults, T21 generated edit/delete and T18 exact reconciliation pass. Full backend suite: 79 passed, 18 gated skips, zero failures; T32 focused integration: 103 checks. Fresh T16–T27 regressions also pass with T32 installed and compliant generated fixtures. No public routes, scheduler/frontend, grants or remote production changes. See [T32 verification](t32-verification.md). T29 is subsequently completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

Required recurring_occurrences unique definition/date, direct owner/composite FK, pending/posted/skipped/failed, immutable terminal markers, sanitized failure metadata, nullable generated link ON DELETE SET NULL and same-owner/definition/date validation. Supplemental generated-transaction unique partial index. Runtime cannot delete ledger markers.

Acceptance: posted marker survives generated transaction hard-delete/edit; no re-post; concurrent claim and failed retry pass. Persistence invariants implemented before processor delivery.

---

## T33 — Configure Daily Vercel Scheduled Execution

**Depends on:** T31 reliability gate; provider is already decided in T02.

Implement the protected orchestration handler GET /internal/recurring/process with CRON_SECRET validation/no-store, using the completed T31 internal processor. Configure backend cron 0 3 * * * UTC, function duration/safety buffer and bounded batch benchmarking. Hobby daily/hour-level precision sufficient, no exact-time guarantee/no assumed failure retry. Verify failed/backlog/explicit operator recovery and safe logs on production-like environment. Production cron disabled until T66–T71 validation/write-enable checkpoint, then T72.

**Completed locally (2026-10-12):** Reviewed and verified the existing protected handler, both entry points and prepared daily cron template. Added a fresh-process test of the actual Vercel server.mjs entry. One T31 invocation uses Cairo today, unchanged 100/1000 ceilings and a 45-second cooperative deadline below the configured 60-second duration. Five T33 tests pass, including 104 limited-role real HTTP/PostgreSQL checks, three forced races, lost HTTP acknowledgement, cold initialization, exact T18 reconciliation and durable 100/1000 backlog continuation. Fresh T31 (403), T32 (103), T29 (357), T30 (14 tests) and T18/shared isolation regressions pass. Backend lint/typecheck/build and security scan pass; full backend suite: 108 tests, 86 passed, 22 environment-gated skips, zero failures. Active vercel.json retains crons=[] until the release gate; vercel.cron-ready.json prepares 0 3 * * *. No remote env/deployment/schema or frontend changes. See [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36 is the next core task.

---

## T34 — Build Recurring Page

Implement `/recurring`.

**Completed locally (2026-10-12):** `/v2/recurring` uses the authenticated T29 list/get/create/update/pause/resume/archive/upcoming APIs through T10. Real T17 account/T12 category choices, five server-supported filters and an independent 30-day expected timeline preserve the approved schedule/dialog presentation. The browser never calculates recurrence dates or posts financial activity. Exact string drafts, server-prefilled edits, lifecycle confirmations, no-backfill messaging, retained stale reads, uncertain-write GET inspection, filter-preserving refresh and user-bound teardown are verified. Frontend lint/typecheck/build and all 130 tests pass; final browser suite passes 77 checks and 45 axe audits with zero violations/overflow at 360/768/1440. Fresh T29/T30/T31/T32 and T17/T18/isolation regressions pass. Production smoke keeps V2 404 and V1 root 200. No schema, production backend, hosted env/cron/deployment or dependency changes. See [T34 verification](t34-verification.md). T35 remains optional/deferred without explicit promotion; T36 is the next core task with its documented dependencies. Neither was started.

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

**Status: Completed locally for the authorized authoritative core stage (2026-10-12).** Verified JWT endpoint, all five Cairo periods, T18 assets/signed card debt/net position and account resources, exact period actuals, global five-row transaction preview and shared T29 30-day/five-occurrence projection. API section 17 declares omitted analytics/budget/goal sections in meta.deferred. Full P0 target below still waits for its future domain dependencies; no fake previews or frontend connection were added. See [T36 verification](t36-verification.md).

**Depends on:** T18/T21/T29/**T38/T42/T43/T45**; can stage basic aggregate earlier, final P0 acceptance waits for these.

GET /api/v2/dashboard?period=this_month returns resolved period, summary, accounts, incomeVsExpenses chart series, recentTransactions, upcomingRecurring, current-month budgets and active goals in one consistent read-only REPEATABLE READ snapshot. P1 insights absent.

Acceptance: user-scoped exact values/net-worth debt convention/period bounds, no waterfall, actual/forecast separated; full previews use completed domain calculations.

---

## T37 — Build V2 Dashboard UI

**Status: Completed locally for implemented T36 core domains (2026-10-12).** `/v2/dashboard` now renders authenticated authoritative values, all five period controls, account links, recent transactions and upcoming occurrences without runtime financial fixtures. Chart/budget/goal previews remain intentionally hidden pending their domain services. Responsive, axe, User A/B, generated deletion and cross-domain consistency verification pass; see [T37 verification](t37-verification.md). Full P0 target below retains its future dependencies. T38 queries, T39 API and T40 Analytics UI are complete; T41 remains optional/deferred; T42–T45 are complete and T46 is complete locally; T48 remains unstarted.

**Depends on:** T36, T19/T25/T34/T44/T46 and approved T04 P0 browser UI. Basic shell/cards may be staged earlier.

P0 summary/net-worth cards, account overview, backend chart, recent transactions, recurring/budget/goal previews, period controls and new-user onboarding. No core insight/notification requirement. Acceptance: complete P0 data/empty/partial error/responsive/accessibility states; debt-positive cards and archived net-worth clearly labelled.

---

# 13. M9 — Analytics

## T38 — Implement Analytics Queries

**Status: Completed locally (2026-10-13).** Internal read-only, owner-scoped analytics foundation verified against exact fixtures, T36 and disposable scale data. No public route, frontend connection or migration. See [T38 verification](t38-verification.md).

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

**Status: Completed locally (2026-10-13).** Authenticated consolidated overview with strict explicit range/account validation, direct T38 output, real HTTP isolation/reconciliation and sanitized failures. Production entry remains unregistered under the deferred preview boundary. See [T39 verification](t39-verification.md).

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

**Status: Completed locally (2026-10-13).** Real authenticated T39 Analytics UI, approved explicit-date presets/custom range, historical account filter, backend summary/charts/categories/account activity and separate projected commitments. Session, responsive, accessibility, fixture and production boundaries verified; see [T40 verification](t40-verification.md).

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

**Status: Completed locally (2026-10-13).** Authenticated monthly category CRUD and shared authoritative NUMERIC progress query, exact required resource status, immutable period/category, archive-safe history, duplicate/race/rollback/isolation and realistic performance checks. Production registration stays deferred. See [T42 verification](t42-verification.md). T43 status verification and T44 development Budget UI are complete; Dashboard/Analytics Budget previews remain separate.

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

**Status: Completed locally (2026-10-13).** T42 already implements the frozen exact SQL status expression; no production implementation changes were needed. Dedicated real HTTP boundary, rounding, reconciliation, determinism and concurrent-visibility evidence formalizes its acceptance. See [T43 verification](t43-verification.md). T44 and T45 are complete locally; T46 remains unstarted.

Statuses:

- normal;
- near limit;
- exceeded.

### Acceptance Criteria

- default threshold90%, exact comparison before display rounding tested;
- no manual spent field.

---

## T44 — Build Budgets Page

**Status: Completed locally (2026-10-13).** Authenticated T42/T43 Budget list/create/edit/delete, Cairo month selection, backend-authoritative progress/status, real category choices, safe uncertain-write inspection, session clearing and responsive/accessibility verification. Runtime fixtures removed from this route only. No Dashboard/Analytics preview or production-gate change. See [T44 verification](t44-verification.md).

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

**Status: Completed locally (2026-10-13).** Authenticated list/single/create/full PUT/complete/archive implement frozen manual savings and account metadata. Reopening uses explicit PUT status active; archived goals remain read-only. Exact SQL progress, isolation, locking, rollback and financial non-effect passed disposable verification. Production registration remains gated. See [T45 verification](t45-verification.md). T46 is complete locally; see [T46 verification](t46-verification.md).

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

**Status: Completed locally (2026-10-13).** The approved Goals cards now use authenticated T45 data with manual saved amounts, active account metadata choices and archived references, create/full PUT, explicit complete, PUT-based reopening and archive. Uncertain writes require GET inspection and deliberate acknowledgement; session changes clear all owned state. Responsive360/768/1440, accessibility, financial non-effect and backend regressions pass. Production Goals remain gated. See [T46 verification](t46-verification.md). T47 remains optional/deferred; T48 is the next unstarted core task.

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

**Status: Completed locally (2026-10-13).** Authenticated development-only POST/PUT/archive/restore uses the frozen T12 list and T15 category constraints. Same-user lower(name) uniqueness, system immutability, referenced-kind lock, archive auto-pause and unposted occurrence skipping, historical reads, restore without auto-resume, A/B isolation, reference races, rollback and 1,000-category list were verified on fresh disposable PostgreSQL. The Vercel entry point keeps category management disabled; no migration, production write, cron or frontend change occurred. See [T48 verification](t48-verification.md). T49 is the next unstarted core task.

---

## T49 — Build Core Settings Page

**Depends on:** T13/T17/T48/T10 and approved T04 core Settings UI.

T49a profile displayName/read-only preferences; T49b account/archive/restore and categories; T49c password-reset/sign-out security UI and protected-data clearing. P0 omits export/notifications/user deletion. P1 export integration follows T55/T56 plus approved P1 browser UI. Acceptance: safe confirmations, accessible responsive states, bootstrap recovery and no provider/admin keys.

**Status: Completed locally (2026-10-15).** Settings uses authenticated T13 profile reads/displayName-only updates, fixed preferences, shared shell presentation, the existing Accounts page, and T48 custom category create/edit/archive/restore. System categories are read-only. Scoped errors, retained stale data, confirmed-save refresh failures, GET-only uncertain inspection, session teardown, real dependent selectors and financial non-effect were verified on disposable PostgreSQL. Password reset reuses the existing Auth route; sign-out clears protected state. Production gates and disabled cron remain unchanged. See [T49 verification](t49-verification.md). T50 remains optional and unstarted; the next unstarted P0 task is T57 — Full Backend Regression.

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

**Status: Completed locally (2026-10-15).** A clean isolated source snapshot installed locked dependencies and passed backend lint/typecheck/build and the complete general suite (132 tests: 104 passed, 28 explicitly database-gated). Seventeen fresh-database runs passed 57 test groups without skips and cover every gated domain, consolidating the shared isolation wrappers through T27. An additional 829-check integrated A/B gate verified cross-domain lifecycle, exact reconciliation, live database reconnect, three Node processes, pending recovery, cursor continuity and deleted-generated marker durability; 33 configuration/security checks also passed. The only fix makes Analytics test evidence-directory creation independent of previous runs. No application, schema, production gate, cron or hosted acceptance change occurred. See [T57 verification](t57-verification.md). T58 — Full Frontend Regression is next and unstarted.

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

**Status: Completed locally (2026-10-15).** A fresh isolated locked install passed frontend lint/typecheck/build and 183 tests. Current-source browser suites passed 3,521 counted checks plus Auth/restart flows and 325 axe audits with zero violations. Integrated real local API/PostgreSQL verification covers cross-page totals, selectors, every protected route at 360/768/1440, A/B teardown, late reads/writes, expiry, reload/history and process restarts. Narrow fixes restore completed Planning navigation, active Accounts detail navigation, remove the shared transitive finance-fixture dependency, and update the T25 test seed for T32 invariants. Production gates, remote data and disabled cron remain unchanged. See [T58 verification](t58-verification.md). T59 security acceptance is complete; see [T59 verification](t59-verification.md). T60 financial reconciliation is complete; see [T60 verification](t60-verification.md). T61 reliability acceptance is complete; see [T61 verification](t61-verification.md). T62 — Responsive / Accessibility Validation is next and unstarted.

Run:

- lint;
- type-check;
- build;
- component/domain tests;
- browser integration.

---

## T59 — Multi-User Security Acceptance

**Status: Completed locally, 2026-10-15.** Fresh PostgreSQL/ES256-JWKS acceptance passed all implemented P0 domains, database ownership/privilege boundaries, route authentication, owner/mass-assignment injection, cursor/cron separation, aggregate isolation and concurrent processing. The 32-entry SQL audit found no missing expected owner scope. Populated A→B switches, six open dialogs, four held-response attacks and auth-loss clearing passed. No product security fix or remote change was required. See [T59 verification](t59-verification.md). T60 financial reconciliation is complete; see [T60 verification](t60-verification.md). T61 reliability acceptance is complete; see [T61 verification](t61-verification.md). T62 — Responsive / Accessibility Validation is next and unstarted.

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

**Status: Completed locally, 2026-10-15.** Independent BigInt and raw SQL oracles passed all implemented financial domains, mutations, lifecycle non-effects, A/B separation, concurrency, rollback/lost acknowledgements, scale and actual database/backend restarts. The focused runner passed 9,445 initial and 728 restart checks; 17 fresh regression suites and T59 security isolation passed. No application defect or remote change was required. See [T60 verification](t60-verification.md). T61 reliability acceptance is complete; see [T61 verification](t61-verification.md). T62 — Responsive / Accessibility Validation is next and unstarted.

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

**Status: Completed locally, 2026-10-15.** Fresh PostgreSQL acceptance passed calendar/backlog/idempotency, actual worker kills, DB restart/connection interruption, explicit failed recovery, lifecycle races, protected cron delivery, independent financial effects and targeted browser smoke. Focused checks: 1,689 initial plus 43 recovery; 17 fresh regression suites, T59 isolation and full T60 reconciliation also passed. No product defect or remote change was required. See [T61 verification](t61-verification.md). T62 — Responsive / Accessibility Validation is next and unstarted.

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

**Status: Completed locally (2026-10-17).** Whole-product runtime acceptance passes at 320/360/375/768/1024/1280/1440, including short heights, keyboard/focus, dialogs, chart/progress semantics, contrast, reduced motion, forced colors and text/zoom stress. 78 named checks, 409 axe audits and 584 layout checks pass; five production browser and 56 fresh T58 regression audits also report zero violations. Frontend lint/typecheck/build and 183 tests pass; T58 adds 33 integrated and 15 recovery checks. Narrow defects were fixed with browser regression coverage. Physical-device/screen-reader and native browser-zoom limitations are explicit. Production gates/disabled cron and deferred hosted financial acceptance remain unchanged. See [T62 verification](t62-verification.md). T63–T65 are complete locally; T66 is next.

Widths:

- 320;
- 360;
- 375;
- 768;
- 1024;
- 1280;
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

**Status: Completed locally (2026-10-17).** Repeated normal/stress measurements cover built backend, signed APIs, captured SQL plans/counts, five-connection concurrency, recurring throughput/backlog, optimized build and development financial UI. No material normal-use P0 regression was established; no product/index/dependency changes were justified. Extreme unpaginated-list/reference-read watch items and production/emulation/reconnect limits are explicit. Fresh T57/T59/T60/T61 regressions, four axe smokes, lint/typecheck/build and unit suites pass. Gates/disabled cron and deferred hosted financial acceptance remain unchanged. See [T63 verification](t63-verification.md). T64 — Security Review is complete locally; T65 — V1→V2 Migration Dress Rehearsal is complete locally; T66 — Execute Production Migration and V1 Retirement is next and unstarted.

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

**Status: Completed locally (2026-10-17).** Reviewed whole-product Auth/ownership/validation/injection/secrets/HTTP/database/cursor/cron/abuse/dependency/deployment boundaries. Fixed the pg URL `ssl` override bypass and missing structural security headers with dedicated regressions. Fresh T57/T58/T59/T60/T61, affected T62 accessibility and T63 performance checks pass, as do lint/typecheck/build and 106 backend/185 frontend ordinary tests (guarded DB suites run separately). No unresolved local P0 blocker remains. Runtime audits are clear; the unpatched dev lint advisory, nonblocking hardening and finite local-review limitations are explicit. Production gates/disabled cron and deferred hosted acceptance remain intact. See [T64 verification](t64-verification.md). T65 — V1→V2 Migration Dress Rehearsal is complete locally; T66 — Execute Production Migration and V1 Retirement is next and unstarted.

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

**Status: Completed locally (2026-10-17).** Two independent complete PG17 rehearsals pass 64 named groups over 510 deterministic retained V1 rows each. Real dump/checksum/isolated restores, actual all-financial maintenance, unchanged full migration/seed/T14 backfill chain, microsecond/value/ownership reconciliation, T15/T32 target validation, same-role stale-process denial after regrant, controlled V2 domains, Window A full recovery and Window B preservation/refusal pass. Fresh T57 (including T14/T15), T59, T60 and relevant T64 checks pass; migrated frontend and production-gate smokes pass; backend quality and 111 ordinary tests pass (28 guarded wrappers run separately). Operator runbook/read-only inspection are prepared; historical T37 already-applied state requires fresh classification before any future production action. No production access/change/deployment, financial gate removal or cron activation occurred. See [T65 verification](t65-verification.md) and [runbook](production-migration-runbook.md). T66 — Execute Production Migration and V1 Retirement is next, not started.

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

**Status: Completed under explicit backup/restore waiver (2026-10-17).** Fresh target/TLS/catalog/history/owner/Main/category checks passed; existing stages were verified and skipped. Hosted maintenance/retirement passed12 checks; runtime financial DML was suspended and all four direct SQL paths deny42501. Exact retained-row/value/microsecond preservation passed. V1 is410, V2/processor503, frontend financial gate/cron closed, older deployments protected. No backup/restore is claimed; conservative Window B/forward-only policy remains. See [final T66 checkpoint](t66-verification.md#final-t66-checkpoint--completed-under-explicit-backup-waiver). Continue at T67.

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

T03/T04 fixture UI tasks require no auth client or route guard integration. Later UI integration tasks require approved T04 P0 browser UI plus the real auth client/route guard. Budgets, goals and analytics can proceed in parallel after their dependencies; templates/UI components can proceed after design approval. P1 dependencies: focused T20 after accounts/auth (implemented; activity/transfer extensions deferred), T35 after recurring/history, T41 after analytics, T47/history after goals/analytics, T50–T52 after source domains, T53–T56 after query/filter domains. Unpromoted P1 is outside the core critical path.

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

Core V2 completes when every **P0** task/subtask and production gate is complete, including all P0 UX/API/security/migration/financial requirements. P1 T35/T41/T47/T50–T56 remain **deferred by T02 P0-only scope** and are not necessary to ship. T20 is explicitly promoted and completed as focused account detail; its activity/transfer extensions and other P1 enhancements remain deferred.

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
- T16 ✅ Completed — Expand Multi-User Isolation Tests (foundation; expands with domains)
- T17 ✅ Completed — Build Account Backend
- T18 ✅ Completed — Build Account Balance Queries
- T19 ✅ Completed — Build Accounts Page
- T20 ✅ Completed — Focused Account Detail Experience (promoted P1; activity/transfers deferred)
- T21 ✅ Completed — Upgrade Transaction Backend to V2 Ownership
- T22 ✅ Completed — Add Server-Side Search
- T23 ✅ Completed — Add Advanced Filters
- T24 ✅ Completed — Add Cursor Pagination
- T25 ✅ Completed — Build Transactions Page
- T26 ✅ Completed — Build Atomic Transfer Backend
- T27 ✅ Completed — Verify Transfer Atomicity and Concurrency
- T28 ✅ Completed — Build Transfer UI
- T29 ✅ Completed locally — Recurring Definition Backend
- T30 ✅ Completed — Implement Recurrence Calculator
- T32 ✅ Completed locally — Durable Occurrence Persistence
- T31 ✅ Completed locally — Internal Recurring Processor
- T33 ✅ Completed locally — Configure Daily Vercel Scheduled Execution (production activation deferred to T72)
- T34 ✅ Completed locally — Build Recurring Page
- T35 ⬜ Deferred — Add Recurring Suggestions (P1 Optional; requires explicit promotion)
- T36 ✅ Completed locally — Dashboard Aggregate API authoritative core; full previews await their domain tasks
- T37 ✅ Completed locally — Connected Dashboard UI for implemented core domains
- T38 ✅ Completed — Implement Analytics Queries
- T39 ✅ Completed — Implement Analytics API
- T40 ✅ Completed locally — Build Analytics Page
- T41 ⏸ Optional / deferred — Add Deterministic Financial Insights (P1; not promoted)
- T42 ✅ Completed locally — Build Budget Backend
- T43 ✅ Completed locally — Add Budget Status Logic
- T44 ✅ Completed locally — Build Budgets Page
- T45 ✅ Completed locally — Build Goal Backend
- T46 ✅ Completed locally — Build Goals Page
- T47 ⏸ Optional / deferred — Add Goal Projection (not promoted)
- T48 ✅ Completed locally — Build Custom Category Backend
- T49 ✅ Completed locally — Build Core Settings Page
- T50–T56 ⏸ Optional / deferred — not started
- T57 ✅ Completed locally — Full Backend Regression
- T58 ✅ Completed locally — Full Frontend Regression
- T59 ✅ Completed locally — Multi-User Security Acceptance
- T60 ✅ Completed locally — Financial Reconciliation Tests
- T61 ✅ Completed locally — Recurring Reliability Tests
- T62 ✅ Completed locally — Responsive / Accessibility Validation
- T63 ✅ Completed locally — Performance Review
- T64 ✅ Completed locally — Security Review
- T65 ✅ Completed locally — V1→V2 Migration Dress Rehearsal
- T66 ✅ Completed under explicit backup/restore waiver; retained record preserved; [checkpoint](t66-verification.md#final-t66-checkpoint--completed-under-explicit-backup-waiver)
- T67 ✅ Completed — Authenticated V2 Backend under controlled read-only access
- T68 ✅ Completed — Protected V2 Frontend under controlled backend read-only access
- T69 ✅ Completed in requested practical scope — Hosted Auth/recovery verification
- T70 ✅ Completed — Production Multi-User Isolation
- T71 ✅ Completed — Production Financial Acceptance
- T72 Completed - Production Recurring Job Verification; T73-T75 pending

The T04 visual approval gate is satisfied. T05 hosted configuration, T06 Auth helpers, T07 real Auth-page integration and T08 session protection are completed; see [T05 verification](t05-verification.md), [T06 verification](t06-verification.md), [T07 verification](t07-verification.md) and [T08 verification](t08-verification.md). T09 backend identity verification is completed; see [T09 verification](t09-verification.md). T10 is completed; see [T10 verification](t10-verification.md). T11 additive schema preparation and disposable verification are completed; see [T11 verification](t11-verification.md). T12 reference seed and authenticated category reads are completed; see [T12 verification](t12-verification.md). T13 profile provisioning/API and frontend bootstrap gating are completed; see [T13 verification](t13-verification.md). T14 disposable migration rehearsal is completed; see [T14 verification](t14-verification.md). T15 local ownership enforcement preparation is completed; see [T15 verification](t15-verification.md). T16 isolation-suite foundation is completed; see [T16 verification](t16-verification.md). T17 account backend is completed; see [T17 verification](t17-verification.md). T18 balance queries are completed; see [T18 verification](t18-verification.md). T19 Accounts page integration is completed; see [T19 verification](t19-verification.md). T20 is completed as focused promoted P1; see [T20 verification](t20-verification.md). T21 is completed locally; see [T21 verification](t21-verification.md). T22 is completed locally; see [T22 verification](t22-verification.md). T23 is completed locally; see [T23 verification](t23-verification.md). T24 is completed locally; see [T24 verification](t24-verification.md). T25 is completed locally; see [T25 verification](t25-verification.md). T26 is completed locally; see [T26 verification](t26-verification.md). T27 is completed locally; see [T27 verification](t27-verification.md). T28 is completed locally; see [T28 verification](t28-verification.md). T30 is completed locally; see [T30 verification](t30-verification.md). T32 is completed locally; see [T32 verification](t32-verification.md). T29 is completed locally; see [T29 verification](t29-verification.md). T31 is completed locally; see [T31 verification](t31-verification.md). T33 is completed locally; see [T33 verification](t33-verification.md). T34 is completed locally; see [T34 verification](t34-verification.md). T35 remains optional and deferred; T36–T40, T42–T46 and T48 are complete in documented scope; T41/T47/T50–T56 are optional/deferred; T49/T57/T58/T59/T60/T61 are complete locally and T62 is complete locally; T63 — Performance Review is complete locally; T64 — Security Review is complete locally; T65 — V1→V2 Migration Dress Rehearsal is complete locally; T66 — Execute Production Migration and V1 Retirement has resumed under the explicit backup/restore waiver; see [T66 resumption](t66-verification.md#authorized-resumption--backup-waiver). Fresh read-only verification passed; maintenance deployment and remaining gates are pending, and T67+ remain unstarted. The production-preview migration checkpoint is recorded separately; remaining hosted financial acceptance is intentionally deferred. The historical preview records manual Auth verification and financial gates/disabled cron; the unchanged source retains those UI/schedule gates, while current hosted state requires T66 verification. T38 introduced no remote database change or public Analytics route. Full Settings integration is documented in T49; final frontend regression is documented in T58.

---
