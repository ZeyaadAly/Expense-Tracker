# Expense Tracker V2 — Product Requirements Document (PRD)

**Version:** 2.0 Planning  
**Status:** Draft for BMAD Product Requirements  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`

---

## 1. Purpose

This PRD translates the Expense Tracker V2 product brief into detailed product requirements, user stories, acceptance criteria, scope boundaries, and quality expectations.

V2 expands the deployed V1 into a secure multi-user personal finance platform with:

- authentication;
- user-specific financial data;
- multiple financial accounts;
- account-aware transactions;
- transfers;
- recurring income and expenses;
- financial analytics;
- budgets;
- savings goals;
- notifications;
- custom categories;
- reports and exports;
- multiple application pages.

This document defines **what the product must do**. Detailed UX belongs in the UX specification. Detailed technical design belongs in architecture, database, and API documents.

---

## 2. Product Goals

V2 must allow an authenticated user to:

1. securely create and access their own account;
2. manage multiple financial accounts;
3. record income and expense transactions per account;
4. transfer money between owned accounts;
5. define recurring income and expenses;
6. view upcoming recurring financial activity;
7. analyze financial behavior over time;
8. define and monitor budgets;
9. define and monitor financial goals;
10. receive useful in-app financial alerts;
11. manage categories and profile settings;
12. search, filter, and paginate transaction history;
13. access only their own financial information;
14. use the application reliably on mobile, tablet, and desktop.

---

## 3. V2 Scope

### 3.1 Core V2 Scope

The first complete V2 release includes:

- Supabase authentication;
- user profiles;
- protected application routes;
- backend authentication middleware;
- strict per-user authorization;
- financial accounts;
- account-aware transactions;
- transfers;
- recurring transaction definitions;
- upcoming recurring activity;
- recurring transaction generation strategy;
- dashboard V2;
- dedicated transactions page;
- dedicated analytics page;
- budgets;
- goals;
- custom categories;
- notifications;
- settings;
- reports;
- CSV and JSON export;
- search;
- pagination;
- advanced transaction filters.

### 3.2 Deferred / Post-V2 Scope

Excluded from core V2:

- bank account synchronization;
- open-banking APIs;
- AI financial advisor;
- OCR/receipt scanning;
- investment tracking;
- cryptocurrency tracking;
- tax features;
- family/shared wallets;
- business accounting;
- invoicing;
- multi-currency conversion;
- credit-score integration.

---

## 4. Personas

### Persona A — Salaried User

Needs recurring salary, recurring bills, account balances, monthly analytics, budgets, and savings goals.

### Persona B — Freelancer

Needs flexible income sources, multiple accounts, date-range analytics, and cash-flow visibility.

### Persona C — Student / Early-Career User

Needs easy transaction entry, mobile usability, simple budgets, recurring subscriptions, and short-term goals.

---

## 5. User Role

### Authenticated User

Can manage only their own:

- profile;
- accounts;
- categories;
- transactions;
- transfers;
- recurring transactions;
- budgets;
- goals;
- notifications;
- reports and exports.

No admin dashboard is required in core V2.

---

## 6. Authentication Requirements

### AUTH-01 — Registration

User can register with email and password.

**Acceptance criteria**
- valid registration succeeds;
- invalid email/password is rejected;
- duplicate email is handled safely;
- errors do not expose internals.

### AUTH-02 — Sign In

**Acceptance criteria**
- valid credentials authenticate;
- invalid credentials return safe feedback;
- protected pages require authentication.

### AUTH-03 — Sign Out

**Acceptance criteria**
- session clears;
- protected pages become inaccessible.

### AUTH-04 — Password Recovery

**Acceptance criteria**
- user can request and complete password reset securely.

### AUTH-05 — Session Persistence

**Acceptance criteria**
- valid session survives reload;
- expired session requires reauthentication.

### AUTH-06 — Backend Token Verification

**Acceptance criteria**
- Express verifies authenticated requests;
- backend derives user identity from verified auth context;
- frontend-supplied user IDs are never trusted.

---

## 7. User Profile Requirements

### PROFILE-01 — Profile

Potential fields:

- display name;
- locale;
- currency preference;
- timezone;
- createdAt;
- updatedAt.

User can view and update only their own profile.

---

## 8. Account Requirements

### ACCOUNT-01 — Create Account

Initial account types:

- cash;
- bank;
- savings;
- credit card;
- mobile wallet;
- other.

Required fields:

- name;
- account type;
- opening balance;
- currency.

### ACCOUNT-02 — View Accounts

Only owned accounts are visible.

### ACCOUNT-03 — Edit Account

Allowed account details can be edited without corrupting history.

### ACCOUNT-04 — Archive Account

Used accounts should be archived rather than hard-deleted where historical data exists.

### ACCOUNT-05 — Account Balance

The final calculation model must be defined in architecture/database design.

Rules must ensure:

- opening balance counted once;
- income increases balance;
- expense decreases balance;
- transfers update both sides correctly;
- all values remain exact decimals.

---

## 9. Transaction Requirements

### TX-01 — Create Transaction

Required fields:

- account;
- type;
- amount;
- category;
- date;
- description.

### TX-02 — Transaction List

Must support:

- user scoping;
- deterministic sorting;
- pagination;
- search;
- filters;
- loading/error/empty states.

### TX-03 — Search

Initial searchable fields:

- description;
- category name;
- account name.

Search must be server-side and parameterized.

### TX-04 — Advanced Filters

Support:

- type;
- category;
- account;
- date range;
- recurring/non-recurring where applicable.

### TX-05 — Pagination

Use cursor or offset pagination as decided in architecture.

### TX-06 — Edit Transaction

Ownership must be checked.

### TX-07 — Delete Transaction

Explicit confirmation required.

---

## 10. Transfer Requirements

### TRANSFER-01 — Create Transfer

Fields:

- source account;
- destination account;
- amount;
- date;
- optional note.

Rules:

- source and destination differ;
- both accounts belong to user;
- amount is positive;
- transfer does not count as income or expense.

### TRANSFER-02 — Atomicity

Both sides succeed or neither succeeds.

### TRANSFER-03 — Edit/Delete Transfer

Final handling must preserve accounting consistency.

---

## 11. Recurring Transaction Requirements

### REC-01 — Create Recurring Definition

Fields:

- account;
- type;
- amount;
- category;
- description;
- frequency;
- start date;
- next occurrence;
- optional end date;
- active status.

Frequencies:

- daily;
- weekly;
- monthly;
- yearly.

### REC-02 — Upcoming Activity

Show future expected recurring items separately from posted transactions.

### REC-03 — Recurring Generation

Requirements:

- prevent duplicate generation;
- generated transaction links to recurring definition;
- missed occurrences handled deterministically;
- serverless scheduling strategy documented.

### REC-04 — Pause / Resume

Paused definitions stop future generation.

### REC-05 — Edit Recurring Definition

Historical generated transactions remain unchanged.

### REC-06 — Recurring Pattern Suggestions

The system may suggest recurring patterns, but user confirmation is mandatory.

---

## 12. Dashboard Requirements

Dashboard should show:

- total balance;
- period income;
- period expenses;
- net savings/cash flow;
- account balances;
- recent transactions;
- upcoming recurring activity;
- budget snapshot;
- basic chart(s);
- deterministic insight cards.

---

## 13. Analytics Requirements

### ANALYTICS-01 — Time Ranges

Support:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- custom range.

### ANALYTICS-02 — Income vs Expenses

Aggregates must come from backend/database.

### ANALYTICS-03 — Expense Category Breakdown

Charts must include accessible text equivalents.

### ANALYTICS-04 — Income Sources

### ANALYTICS-05 — Savings Trend

### ANALYTICS-06 — Account Analytics

### ANALYTICS-07 — Recurring Commitments

Show recurring income and expense totals and relationship.

---

## 14. Financial Insights

Initial insights should be deterministic, for example:

- spending increased/decreased;
- savings rate;
- largest expense;
- top category;
- recurring obligations percentage;
- budget near/exceeded.

AI is not required for core V2.

---

## 15. Budget Requirements

### BUDGET-01 — Monthly Category Budget

Fields:

- category;
- amount;
- month/year;
- optional threshold.

### BUDGET-02 — Budget Progress

Show:

- allocated;
- spent;
- remaining;
- percentage used.

### BUDGET-03 — Alerts

States:

- normal;
- near limit;
- exceeded.

### BUDGET-04 — Budget History

Previous periods remain reviewable.

### BUDGET-05 — Rollover

Not required in initial V2 unless later approved.

---

## 16. Goal Requirements

### GOAL-01 — Create Goal

Fields:

- name;
- target amount;
- current/saved amount;
- target date;
- optional linked account;
- status.

### GOAL-02 — Progress

Show amount saved, remaining, percentage, target date.

### GOAL-03 — Edit / Complete / Archive

### GOAL-04 — Projection

May later estimate completion date; must be labelled as an estimate.

---

## 17. Category Requirements

### CAT-01 — System Categories

Default categories remain available.

### CAT-02 — Custom Categories

Users can create their own categories.

### CAT-03 — Archive Categories

Historical usage must remain valid after archive.

---

## 18. Notification Requirements

### NOTIF-01 — In-App Notifications

Examples:

- upcoming recurring activity;
- budget near limit;
- budget exceeded;
- goal milestone.

### NOTIF-02 — Read/Unread State

### NOTIF-03 — Email/Push

Deferred from core V2 unless later approved.

---

## 19. Reports and Export

### REPORT-01 — Reports Page

May include:

- income;
- expenses;
- net savings;
- category breakdown;
- recurring commitments;
- account balances.

### REPORT-02 — CSV Export

### REPORT-03 — JSON Export

### REPORT-04 — Ownership

Export includes only authenticated user's data.

---

## 20. Settings Requirements

Settings should cover:

- profile;
- account management;
- categories;
- security;
- data export;
- eventual account deletion workflow.

---

## 21. Navigation Requirements

Protected navigation:

- Dashboard
- Transactions
- Accounts
- Recurring
- Budgets
- Goals
- Analytics
- Reports
- Settings

Desktop and mobile navigation will be defined separately in UX design.

---

## 22. Functional Requirements Summary

The system must:

- authenticate users;
- authorize every protected request;
- scope all financial data per user;
- manage accounts;
- manage transactions;
- manage transfers;
- manage recurring activity;
- calculate summaries;
- calculate analytics;
- manage budgets;
- manage goals;
- manage categories;
- manage notifications;
- export data;
- support search/filter/pagination.

---

## 23. Non-Functional Requirements

### Security

- no cross-user data leakage;
- no frontend-trusted owner IDs;
- parameterized SQL;
- TLS;
- sanitized errors;
- secrets outside source control;
- limited DB role;
- verified auth tokens.

### Exact Money

- PostgreSQL exact numeric types;
- API decimal strings;
- no unsafe JavaScript financial math;
- backend authoritative totals.

### Reliability

- uncertain writes are not auto-retried;
- transfers are atomic;
- recurring generation is idempotent;
- destructive actions require confirmation.

### Performance

- transaction history must paginate;
- analytics need appropriate indexes/aggregations;
- dashboard should avoid excessive sequential requests.

### Accessibility

Target practical WCAG 2.1 AA compliance.

### Responsive Design

Primary reference widths:

- 360px;
- 768px;
- 1440px.

### Maintainability

- TypeScript;
- modular domains;
- typed API contracts;
- automated tests;
- documented migrations;
- clear docs.

---

## 24. Data Ownership Rules

Mandatory rules:

1. Every user-owned financial row is associated with the authenticated user directly or through an owned parent.
2. API clients cannot choose the effective owner.
3. Backend derives owner from verified authentication.
4. Read/update/delete operations enforce ownership.
5. Analytics and exports are user-scoped.
6. Both transfer accounts must belong to the authenticated user.
7. Recurring items, budgets, goals, categories, and notifications are user-scoped.

---

## 25. V1-to-V2 Migration Requirements

Before implementation:

- define owner for existing V1 transactions;
- decide how current production/demo data is handled;
- prevent creation of ownerless records;
- preserve exact historical data;
- define rollback strategy;
- define migration ordering;
- define deployment sequencing.

Migration must be tested against a production-like disposable copy first.

---

## 26. Error and Recovery Requirements

Preserve V1's strong recovery model:

- structured errors;
- independent loading/error states;
- stale request protection;
- scoped retries;
- no automatic retry of uncertain writes;
- retained form drafts;
- safe auth-expiry handling;
- safe offline/network handling;
- duplicate-safe recurring processing.

---

## 27. Observability Requirements

At minimum:

- backend error logging;
- sanitized request context;
- recurring-job logging;
- health endpoint;
- mutation-failure visibility;
- auth-failure monitoring without secret leakage.

---

## 28. Page-Level Acceptance Summary

- `/login` — sign in
- `/register` — create account
- `/forgot-password` — request reset
- `/reset-password` — complete reset
- `/dashboard` — overview
- `/transactions` — full transaction management
- `/accounts` — financial accounts
- `/recurring` — recurring activity
- `/analytics` — trends and breakdowns
- `/budgets` — budget tracking
- `/goals` — savings goals
- `/reports` — reports/export
- `/settings` — profile/categories/security/export

---

## 29. V2 Release Priorities

### P0 — Must Have

- authentication;
- user isolation;
- accounts;
- account-aware transactions;
- transfers;
- recurring definitions/generation;
- dashboard V2;
- search/filter/pagination;
- analytics;
- budgets;
- goals;
- categories;
- responsive/accessibility baseline;
- migration;
- security validation.

### P1 — Should Have

- notifications;
- reports;
- CSV/JSON export;
- recurring pattern detection;
- deterministic insights;
- goal projection.

### P2 — Later

- email/push alerts;
- PDF/Excel export;
- advanced recurring detection;
- richer account types.

---

## 30. V2 Completion Definition

V2 is complete only when:

- multiple users can register and sign in;
- users cannot access another user's financial records;
- account balances are accurate;
- account-aware CRUD works;
- transfers reconcile correctly;
- recurring processing is duplicate-safe;
- analytics reconcile with source transactions;
- budgets work;
- goals work;
- migration from V1 is verified;
- accessibility/responsive checks pass;
- automated tests pass;
- production deployment passes hosted acceptance checks.

---

## 31. Open Decisions

To resolve in later BMAD documents:

- transfer storage model;
- account-balance calculation model;
- recurring scheduler mechanism;
- pagination strategy;
- token-verification implementation;
- RLS defense-in-depth;
- budget rollover;
- goal/account linking;
- credit-card accounting model;
- notification delivery;
- deletion/retention policy.

---

## 32. BMAD Next Step

Next artifact:

**`03-ux-specification.md`**

It will define:

- information architecture;
- navigation;
- page layouts;
- flows;
- major components;
- forms;
- charts;
- empty/loading/error states;
- responsive behavior;
- accessibility behavior;
- Figma frame checklist.

No V2 application implementation should begin yet.
