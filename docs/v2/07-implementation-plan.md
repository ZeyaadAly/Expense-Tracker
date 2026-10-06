# Expense Tracker V2 — Implementation Plan

**Version:** 2.0 Planning  
**Status:** Draft for BMAD Implementation Planning  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:**  
- `01-product-brief.md`
- `02-prd.md`
- `03-ux-specification.md`
- `04-architecture.md`
- `05-database-design.md`
- `06-api-design.md`

---

# 1. Purpose

This document turns the V2 planning artifacts into an actionable implementation roadmap.

It defines:

- milestones;
- task order;
- dependencies;
- acceptance criteria;
- migration safety;
- Figma dependencies;
- security gates;
- testing gates;
- deployment gates;
- completion criteria.

The plan assumes V1 is already complete, deployed, and verified.

V2 should be implemented incrementally without destabilizing the existing V1 production system.

---

# 2. Delivery Strategy

V2 should be built in staged milestones.

Do not attempt to ship all V2 functionality at once.

Recommended sequence:

1. lock product/design/architecture decisions;
2. prepare safe additive database changes;
3. add authentication;
4. enforce per-user isolation;
5. add accounts;
6. migrate transactions to account-aware ownership;
7. add transfers;
8. add recurring finance;
9. build analytics;
10. add budgets;
11. add goals;
12. add categories/settings;
13. add reports/export;
14. complete hardening/testing;
15. deploy and verify production.

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

- PostgreSQL exact numeric types;
- API decimal strings;
- no JavaScript floating-point financial calculations;
- aggregates calculated in PostgreSQL/backend.

## Dates

- financial dates use calendar-date semantics;
- do not timezone-shift `YYYY-MM-DD`;
- timestamps use UTC ISO 8601.

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
| M12 | Categories, settings, notifications |
| M13 | Reports and exports |
| M14 | Full V2 verification |
| M15 | Deployment and production acceptance |

---

# 5. M1 — V2 Planning and Design Lock

## T01 — Review and Freeze Planning Artifacts

**Depends on:** none

Review:

- product brief;
- PRD;
- UX specification;
- architecture;
- database design;
- API design;
- implementation plan.

### Acceptance Criteria

- no major contradiction remains;
- open architectural decisions are explicitly listed;
- core V2 scope is approved;
- post-V2 features remain excluded.

---

## T02 — Resolve Open Architecture Decisions

Resolve before implementation:

- final numeric precision;
- account balance convention;
- credit-card balance convention;
- transfer model;
- recurring scheduler provider;
- recurring occurrence table yes/no;
- cursor structure;
- RLS timing;
- transaction hard-delete vs soft-delete;
- account deletion policy;
- goal progress model.

### Acceptance Criteria

- decisions recorded in architecture/database docs;
- no implementation-critical ambiguity remains.

---

## T03 — Create V2 Figma Design System

Create V2 Figma file with:

- Foundations;
- Components;
- Auth;
- Dashboard;
- Transactions;
- Accounts;
- Recurring;
- Analytics;
- Budgets;
- Goals;
- Reports;
- Settings;
- Responsive QA.

### Acceptance Criteria

- design tokens defined;
- reusable components defined;
- desktop/tablet/mobile responsive behavior represented;
- Figma URL recorded in docs.

---

## T04 — Complete Core Figma Flows

Prototype at minimum:

- register → login → dashboard → logout;
- create account;
- create/edit/delete transaction;
- transfer;
- create recurring;
- pause/resume recurring;
- create budget;
- create goal;
- analytics range change.

### Acceptance Criteria

- critical user journeys are reviewable;
- loading/error/empty states exist;
- accessibility considerations annotated.

---

# 6. M2 — Authentication Foundation

## T05 — Configure Supabase Auth for V2

Configure:

- email/password auth;
- verification policy;
- password reset flow;
- redirect URLs;
- production/local auth settings.

### Acceptance Criteria

- test user can register;
- sign in works;
- sign out works;
- reset flow works in test environment;
- no admin/service keys exposed to frontend.

---

## T06 — Add Frontend Auth Client

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

Implement:

- `/login`;
- `/register`;
- `/forgot-password`;
- `/reset-password`.

### Acceptance Criteria

- matches approved Figma;
- validation works;
- backend/Provider errors are safe;
- keyboard/accessibility checks pass;
- mobile/desktop behavior verified.

---

## T08 — Protect Frontend Routes

Protect all app routes:

- `/dashboard`;
- `/transactions`;
- `/accounts`;
- `/recurring`;
- `/analytics`;
- `/budgets`;
- `/goals`;
- `/reports`;
- `/settings`.

### Acceptance Criteria

- unauthenticated users redirect to login;
- valid session allows access;
- sign-out removes protected data from UI.

---

## T09 — Add Backend Auth Middleware

Implement token verification.

### Acceptance Criteria

- missing token → 401;
- invalid token → 401;
- valid token yields trusted `userId`;
- token claims validated;
- frontend-supplied user IDs ignored.

---

## T10 — Add Authenticated API Client

Extend frontend API client to:

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

## T11 — Create V2 Additive Schema Migration

Add initial V2 tables:

- profiles;
- accounts;
- categories;
- transfers;
- recurring_transactions;
- budgets;
- goals;
- notifications.

Add V2 ownership/account/category references required for transaction migration.

### Acceptance Criteria

- migration applies cleanly to disposable V1 copy;
- no V1 rows lost;
- rollback documented;
- runtime role has required but limited permissions.

---

## T12 — Add Default Category Seed

Seed stable system categories.

### Acceptance Criteria

- repeatable;
- no duplicates;
- stable IDs;
- income/expense/both rules verified.

---

## T13 — Provision Profiles

Create profile provisioning flow.

### Acceptance Criteria

- new auth user gets profile;
- duplicate provisioning prevented;
- failures observable;
- existing users can be backfilled.

---

## T14 — Rehearse V1 Data Migration

On disposable production-like copy:

- create migration owner user;
- create default `Main Account`;
- map V1 categories to category IDs;
- backfill `user_id`;
- backfill `account_id`;
- validate row counts/totals.

### Acceptance Criteria

- V1 totals unchanged;
- dates unchanged;
- descriptions unchanged;
- no duplicates;
- every row has valid ownership/account/category.

---

## T15 — Enforce Ownership Constraints

After successful rehearsal:

- NOT NULL constraints;
- ownership FKs;
- indexes;
- ownership consistency checks/triggers where needed.

### Acceptance Criteria

- cross-owner references rejected;
- valid rows still pass;
- migrations remain reversible where practical.

---

## T16 — Add Multi-User Isolation Tests

Create User A/User B tests across:

- accounts;
- transactions;
- transfers;
- recurring;
- budgets;
- goals;
- categories;
- exports.

### Acceptance Criteria

- cross-user reads/writes fail safely;
- no resource existence leakage beyond policy.

---

# 8. M4 — Accounts

## T17 — Build Account Backend

Implement:

- GET accounts;
- POST account;
- GET account by ID;
- PUT account;
- archive;
- restore if included.

### Acceptance Criteria

- ownership enforced;
- exact opening balance preserved;
- archived accounts handled correctly;
- API matches design.

---

## T18 — Build Account Balance Queries

Implement derived balance:

```text
opening balance
+ income
- expense
+ incoming transfers
- outgoing transfers
```

### Acceptance Criteria

- known fixture totals reconcile exactly;
- no float conversion;
- archived accounts still report historical balance.

---

## T19 — Build Accounts Page

Implement `/accounts`.

### Acceptance Criteria

- account cards;
- empty/loading/error states;
- add/edit/archive flows;
- responsive behavior;
- accessibility checks pass.

---

## T20 — Build Account Detail Experience

If included in core V2:

- account balance;
- recent transactions;
- account filters;
- transfer action;
- archive/edit.

### Acceptance Criteria

- no cross-user access;
- matches Figma.

---

# 9. M5 — Transactions V2

## T21 — Upgrade Transaction Backend to V2 Ownership

Implement `/api/v2/transactions`.

Required:

- account ownership;
- category ownership/type compatibility;
- exact money;
- date rules;
- recurring linkage;
- user scoping.

### Acceptance Criteria

- create/read/update/delete pass;
- cross-user IDs fail safely;
- V1 behavior preserved during migration window if required.

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
- recurring status if retained.

### Acceptance Criteria

- filters compose correctly;
- invalid combinations rejected safely.

---

## T24 — Add Cursor Pagination

Implement stable cursor pagination.

Ordering:

```text
date DESC
createdAt DESC
id DESC
```

### Acceptance Criteria

- no duplicate/missing rows during normal paging;
- opaque cursor;
- max limit enforced.

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

## T26 — Build Transfer Backend

Implement:

- POST transfer;
- GET transfers;
- GET transfer;
- PUT if allowed;
- DELETE if allowed.

### Acceptance Criteria

- source/destination owned;
- source != destination;
- exact money;
- transfers excluded from income/expense totals.

---

## T27 — Enforce Transfer Atomicity

Use PostgreSQL transaction.

### Acceptance Criteria

- partial transfer impossible;
- simulated failure rolls back;
- concurrent submission does not corrupt data.

---

## T28 — Build Transfer UI

Implement transfer flow from accounts.

### Acceptance Criteria

- source/destination clearly shown;
- confirmation;
- pending state;
- safe failure recovery;
- responsive/accessibility.

---

# 11. M7 — Recurring Finance

## T29 — Build Recurring Backend

Implement CRUD/lifecycle:

- list;
- create;
- read;
- edit;
- pause;
- resume;
- archive.

### Acceptance Criteria

- ownership enforced;
- frequency rules validated;
- future recurrence unaffected by historical rows.

---

## T30 — Implement Recurrence Calculator

Support:

- daily;
- weekly;
- monthly;
- yearly;
- month-end;
- leap year.

### Acceptance Criteria

- deterministic test suite;
- Jan 31 behavior documented and verified;
- no timezone drift.

---

## T31 — Implement Recurring Processor

Scheduled processor:

- finds due definitions;
- creates due transactions;
- advances next occurrence.

### Acceptance Criteria

- transaction-safe;
- duplicate-safe;
- observable run result;
- failures do not create partial state.

---

## T32 — Add Recurring Idempotency Constraint

Enforce unique recurring occurrence.

### Acceptance Criteria

- duplicate cron execution creates no duplicate transaction;
- concurrent processor test passes.

---

## T33 — Configure Scheduled Execution

Choose and configure:

- Vercel Cron; or
- Supabase scheduling.

### Acceptance Criteria

- protected internal endpoint/job;
- secret not exposed;
- production-like test succeeds.

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

## T35 — Add Recurring Suggestions

Deterministic detection.

### Acceptance Criteria

- suggestion only;
- no auto-enablement;
- user confirmation required;
- false positives do not mutate data.

---

# 12. M8 — Dashboard V2

## T36 — Build Dashboard Aggregate API

Implement:

```text
GET /api/v2/dashboard
```

Return:

- summary;
- accounts;
- recent transactions;
- upcoming recurring;
- budgets;
- goals;
- insights.

### Acceptance Criteria

- user-scoped;
- exact values;
- avoids excessive request waterfall.

---

## T37 — Build V2 Dashboard UI

Implement approved dashboard.

### Acceptance Criteria

- summary cards;
- account overview;
- recent transactions;
- recurring preview;
- budget preview;
- goal preview;
- insights;
- responsive behavior.

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

## T41 — Add Deterministic Financial Insights

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

- threshold logic tested;
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
- valid lifecycle.

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

## T47 — Add Goal Projection

If retained as P1:

- estimate completion based on historical savings.

### Acceptance Criteria

- labelled estimate;
- deterministic;
- no financial advice claims.

---

# 16. M12 — Categories, Settings, Notifications

## T48 — Build Category Backend

Implement:

- list system + custom;
- create custom;
- update custom;
- archive;
- restore.

### Acceptance Criteria

- system categories immutable;
- historical references preserved;
- ownership enforced.

---

## T49 — Build Settings Page

Implement `/settings`.

Sections:

- profile;
- accounts;
- categories;
- security;
- preferences;
- export.

### Acceptance Criteria

- responsive;
- safe destructive actions;
- accessible.

---

## T50 — Build Notification Backend

Implement:

- list;
- unread/read;
- read all;
- deduplication.

### Acceptance Criteria

- user-scoped;
- duplicate alert prevention.

---

## T51 — Build Notification UI

Implement:

- header notification button;
- unread count;
- notification panel;
- mark read/all read.

### Acceptance Criteria

- keyboard accessible;
- mobile usable.

---

## T52 — Generate Budget / Recurring Notifications

Create notification generation paths.

### Acceptance Criteria

- idempotent;
- no notification spam;
- known trigger fixtures pass.

---

# 17. M13 — Reports and Export

## T53 — Build Reports API

Implement:

```text
GET /api/v2/reports/summary
```

### Acceptance Criteria

- user-scoped;
- date/account filters;
- exact totals.

---

## T54 — Build Reports Page

Implement `/reports`.

### Acceptance Criteria

- period controls;
- account filter;
- report sections;
- empty/error/loading states.

---

## T55 — Add CSV Export

### Acceptance Criteria

- current user's data only;
- correct content type;
- correct escaping;
- filters respected where defined.

---

## T56 — Add JSON Export

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
- notifications;
- reports.

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
- export.

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
- concurrent runs.

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
- rollback rehearsal.

### Acceptance Criteria

- no financial drift;
- no lost rows;
- no broken ownership.

---

# 19. M15 — Deployment and Production Acceptance

## T66 — Prepare Production Migration

Before execution:

- backup;
- migration plan;
- rollback plan;
- maintenance/deployment order;
- environment variables verified.

---

## T67 — Deploy V2 Backend

### Acceptance Criteria

- `/api/v2/health` 200;
- DB reachable;
- auth validation works;
- CORS correct;
- secrets hidden.

---

## T68 — Deploy V2 Frontend

### Acceptance Criteria

- auth pages work;
- protected app works;
- correct API URL;
- production build source verified.

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
- report/export.

Clean temporary records afterward.

---

## T72 — Production Recurring Job Verification

Verify:

- scheduled job runs;
- no duplicates;
- protected internal endpoint;
- observed result logged safely.

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
- docs are complete.

---

# 20. Dependency Map

High-level dependencies:

```text
T01–T04
   ↓
T05–T10 Auth
   ↓
T11–T16 Ownership/Migration
   ↓
T17–T20 Accounts
   ↓
T21–T25 Transactions V2
   ↓
T26–T28 Transfers
   ↓
T29–T35 Recurring
   ↓
T36–T37 Dashboard
   ↓
T38–T41 Analytics
   ↓
T42–T44 Budgets
   ↓
T45–T47 Goals
   ↓
T48–T52 Settings/Notifications
   ↓
T53–T56 Reports
   ↓
T57–T65 Full Validation
   ↓
T66–T75 Production
```

Some UI work can proceed in parallel after Figma is approved, but schema/auth dependencies must be respected.

---

# 21. Suggested Sprint Grouping

## Sprint 1
T01–T04

## Sprint 2
T05–T10

## Sprint 3
T11–T16

## Sprint 4
T17–T20

## Sprint 5
T21–T25

## Sprint 6
T26–T28

## Sprint 7
T29–T35

## Sprint 8
T36–T41

## Sprint 9
T42–T47

## Sprint 10
T48–T56

## Sprint 11
T57–T65

## Sprint 12
T66–T75

Actual sprint size should be adjusted based on implementation complexity.

---

# 22. Figma Dependencies

Implementation should not begin for major new UI pages until relevant V2 Figma frames are approved.

Required before frontend implementation:

- auth screens → before T07;
- accounts → before T19;
- transactions → before T25;
- recurring → before T34;
- dashboard → before T37;
- analytics → before T40;
- budgets → before T44;
- goals → before T46;
- settings/notifications → before T49/T51;
- reports → before T54.

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
- rollback rehearsal.

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

# 28. V2 Completion Definition

Expense Tracker V2 is complete only when:

- T01–T75 are completed or intentionally descoped with documented approval;
- production is authenticated;
- multi-user isolation passes;
- accounts work;
- transactions are account-aware;
- transfers reconcile;
- recurring processing is reliable;
- dashboard V2 works;
- analytics reconcile;
- budgets work;
- goals work;
- categories/settings/notifications work;
- reports/export work;
- V1 data migration is verified;
- accessibility/responsive checks pass;
- security review passes;
- hosted acceptance passes;
- final documentation is complete.

---

# 29. Recommended Immediate Next Step

Do **not** start implementation yet.

The next practical step after reviewing this plan is:

1. resolve the open architecture decisions from T02;
2. create the V2 Figma design (T03–T04);
3. then begin T05 — Supabase Auth configuration.

This keeps V2 aligned with BMAD and avoids writing authentication/schema code before the product and technical decisions are locked.
