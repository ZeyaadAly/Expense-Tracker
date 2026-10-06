# Expense Tracker V2 — Product Brief

**Version:** 2.0 Planning  
**Status:** Draft for BMAD Product Discovery  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Previous release:** V1 — completed and deployed

---

## 1. Executive Summary

Expense Tracker V2 evolves the existing single-user expense tracker into a secure, multi-user personal finance platform.

V1 proved the core full-stack flow: users can create, read, update, delete, filter, and summarize income and expense transactions through a Next.js frontend, Express API, PostgreSQL/Supabase database, and production Vercel deployment.

V2 expands that foundation into a broader personal finance product centered on:

- user accounts and authentication;
- multiple financial accounts;
- richer transaction management;
- recurring income and recurring expenses;
- analytics and financial insights;
- budgets;
- savings goals;
- notifications and reminders;
- dedicated pages instead of a single dashboard;
- stronger user-specific data isolation and security.

The product should remain understandable and practical rather than becoming a banking platform. V2 focuses on personal finance organization, analysis, and planning.

---

## 2. Product Vision

Build a personal finance application that helps a user answer four questions:

1. What do I own and where is my money?
2. Where does my money come from and where does it go?
3. What financial activity repeats automatically or predictably?
4. Am I improving my financial position over time?

The V2 experience should move beyond recording transactions and become a financial overview and planning system.

---

## 3. Problem Statement

V1 provides useful transaction tracking, but it has major limitations:

- no authentication;
- one shared transaction collection;
- no user ownership or isolation;
- no concept of bank/cash/savings accounts;
- no transfers between accounts;
- no recurring transaction model;
- no analytical dashboard;
- no budgets or goals;
- only one main application page;
- limited filtering and reporting;
- no personalized financial insights.

A user with salary income, recurring bills, several accounts, savings goals, and monthly spending patterns needs more than a flat transaction list.

V2 should solve this by organizing financial data around the authenticated user and providing dedicated workflows for tracking, analyzing, and planning finances.

---

## 4. Target Users

### Primary Persona — Individual Personal Finance User

A person who wants to track their financial life without using a complicated accounting system.

Typical behavior:

- receives one or more recurring income sources;
- spends from cash, bank accounts, cards, or wallets;
- pays repeated bills/subscriptions;
- wants to know monthly income, expenses, and savings;
- wants to understand where money is being spent;
- may have savings goals or spending limits.

### Secondary Persona — Student / Early-Career User

A user with a smaller financial footprint who may have:

- salary or allowance income;
- freelance income;
- daily transport and food costs;
- subscriptions;
- short-term savings goals;
- a need for a simple but visual financial overview.

---

## 5. Product Goals

V2 should:

1. Support secure account creation and sign-in.
2. Ensure every user's financial data is isolated.
3. Allow a user to manage multiple financial accounts.
4. Make transaction entry and management easier at scale.
5. Support recurring income and expense schedules.
6. Provide useful financial analytics over time.
7. Support monthly budgets and progress monitoring.
8. Support savings goals.
9. Provide clear upcoming financial activity.
10. Expand the product into multiple focused pages.
11. Preserve exact money handling and safe date behavior from V1.
12. Maintain responsive and accessible UX.
13. Keep the backend authoritative for financial calculations.
14. Remain deployable within the existing Next.js + Express + Supabase/PostgreSQL architecture.

---

## 6. Non-Goals for Core V2

The following features are intentionally outside the first V2 release and may be considered later:

- direct bank account synchronization;
- open-banking APIs;
- investment portfolio tracking;
- cryptocurrency tracking;
- automatic currency conversion;
- shared family wallets;
- business accounting;
- invoicing;
- tax calculation;
- receipt OCR;
- AI financial advisor;
- automatic bank-statement ingestion;
- credit score integration.

These features would significantly expand security, compliance, integration, and data requirements.

---

## 7. Core V2 Product Areas

### 7.1 Authentication and User Profiles

V2 introduces real users.

Required capabilities:

- sign up;
- sign in;
- sign out;
- forgot password;
- reset password;
- email verification where configured;
- protected application routes;
- user profile;
- user-specific data ownership.

Supabase Auth is the preferred authentication provider unless architecture analysis identifies a better fit.

The browser should authenticate the user, while the Express backend should validate authenticated requests before reading or modifying financial data.

### 7.2 Financial Accounts

Users can create and manage accounts representing where money is held.

Examples:

- Cash
- Bank account
- Savings account
- Credit card
- Mobile wallet

Initial account fields may include:

- ID
- User ID
- Name
- Account type
- Initial balance
- Currency
- Status
- Created timestamp
- Updated timestamp

The first V2 release should remain EGP-only unless later planning explicitly changes this.

### 7.3 Transactions

Transactions remain a core domain but become user- and account-aware.

Each income or expense transaction should belong to:

- one authenticated user;
- one financial account;
- one category.

Transaction management should support:

- create;
- read;
- edit;
- delete;
- search;
- pagination;
- date filtering;
- account filtering;
- type filtering;
- category filtering;
- deterministic sorting.

The main transaction entry and management experience should move to a dedicated `/transactions` page.

### 7.4 Transfers

Users should be able to move money between their own accounts.

Example:

- From: Bank Account
- To: Cash
- Amount: 2,000 EGP

A transfer must not increase income or expenses.

The architecture phase must decide whether transfers use:

- a dedicated `transfers` model; or
- linked transaction records.

The choice must preserve correct account balances and analytics.

### 7.5 Recurring Income and Expenses

V2 introduces recurring financial activity.

Examples:

**Income**
- monthly salary;
- weekly freelance payment;
- daily allowance;
- yearly bonus.

**Expenses**
- monthly rent;
- internet;
- phone bill;
- subscriptions;
- weekly transport allowance;
- yearly membership.

Initial recurrence frequencies:

- daily;
- weekly;
- monthly;
- yearly.

A recurring definition should support:

- type;
- amount;
- account;
- category;
- description;
- frequency;
- start date;
- next occurrence;
- optional end date;
- active/inactive status.

The implementation plan must distinguish between the recurring schedule definition and actual generated financial transactions.

### 7.6 Recurring Pattern Detection

A later V2 milestone may detect likely recurring activity from transaction history.

Examples:

> Salary of 15,000 EGP appears every month. Mark as recurring?

> Netflix appears monthly. Create a recurring expense?

This feature should begin with deterministic pattern detection rather than AI.

It should be optional and never create recurring transactions without user confirmation.

### 7.7 Dashboard

The V2 dashboard becomes an overview rather than the main data-entry screen.

Suggested dashboard sections:

- total balance;
- total income;
- total expenses;
- savings/net cash flow;
- account balances;
- recent transactions;
- upcoming recurring transactions;
- monthly budget status;
- basic income vs expense chart;
- financial insights.

The dashboard should link users to deeper pages rather than trying to contain every feature.

### 7.8 Analytics

A dedicated `/analytics` page should help users understand financial behavior.

Initial analytics may include:

- income vs expenses by month;
- expense breakdown by category;
- income sources;
- monthly net savings;
- account-level activity;
- average daily/weekly/monthly spending;
- largest expense;
- highest spending category;
- spending trend;
- recurring income total;
- recurring expense total.

Time ranges may include:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- custom range.

Financial totals should be calculated on the backend/database, not recomputed with unsafe JavaScript floating-point arithmetic.

### 7.9 Financial Insights

V2 can generate deterministic insights such as:

- Food spending increased compared with last month.
- Transport spending decreased.
- You saved a percentage of your income this month.
- Recurring expenses use part of recurring monthly income.
- Average daily spending for the selected period.

Insights should be based on verified financial calculations.

AI-generated advice is not required for core V2.

### 7.10 Budgets

Users can define spending budgets.

Example:

- Food — 3,000 EGP/month
- Transport — 1,500 EGP/month
- Entertainment — 1,000 EGP/month

The budget experience should show:

- allocated amount;
- spent amount;
- remaining amount;
- percentage used;
- exceeded state;
- near-limit state.

Initial scope should focus on monthly category budgets.

### 7.11 Savings Goals

Users can create financial goals.

Examples:

- Emergency Fund
- Laptop
- Travel
- Tuition

A goal may include:

- name;
- target amount;
- current saved amount;
- target date;
- status;
- optional linked account.

The application may later estimate when a user could reach a goal based on savings history.

### 7.12 Notifications and Alerts

Initial V2 notifications should be in-app.

Examples:

- recurring payment due tomorrow;
- recurring salary expected soon;
- 90% of budget used;
- budget exceeded;
- goal milestone reached.

Email/push notifications can be considered later.

### 7.13 Categories

V2 should support:

- system default categories;
- user-defined categories;
- income/expense applicability;
- optional icon;
- optional display color;
- active/inactive state.

Deleting or disabling a category must not corrupt historical transaction data.

### 7.14 Reports and Export

A later V2 milestone should support a dedicated `/reports` page.

Possible report content:

- selected date period;
- income;
- expenses;
- net savings;
- category breakdown;
- recurring costs;
- account balances.

Export formats can initially include:

- CSV;
- JSON.

PDF/Excel export may be added later if justified.

---

## 8. Proposed Application Pages

### Public / Authentication

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

### Protected Application

- `/dashboard`
- `/transactions`
- `/accounts`
- `/analytics`
- `/recurring`
- `/budgets`
- `/goals`
- `/reports`
- `/settings`

### Settings Areas

Potential settings sections:

- Profile
- Accounts
- Categories
- Preferences
- Security
- Data export

The final information architecture will be defined during UX specification.

---

## 9. High-Level User Journeys

### Journey A — New User

1. User creates an account.
2. User verifies/signs in.
3. User creates their first financial account.
4. User adds current balance or opening balance.
5. User adds income/expense transactions.
6. Dashboard begins showing personalized financial data.

### Journey B — Monthly Salary User

1. User records salary.
2. User marks salary as monthly recurring income.
3. User records monthly bills.
4. User marks bills as recurring expenses.
5. Dashboard shows upcoming salary/bills.
6. Analytics compares monthly income and recurring obligations.

### Journey C — Budgeting

1. User creates a monthly Food budget.
2. User records food expenses.
3. Budget progress updates.
4. User receives warning near the limit.
5. Analytics shows whether food spending increased/decreased.

### Journey D — Saving for a Goal

1. User creates a savings goal.
2. User assigns a target amount/date.
3. User updates goal progress or links it to an account.
4. Dashboard shows current percentage.
5. Analytics can later estimate progress trend.

---

## 10. Proposed V2 Navigation

Desktop navigation may use a sidebar.

Suggested sections:

### Overview
- Dashboard

### Money
- Transactions
- Accounts
- Recurring

### Planning
- Budgets
- Goals

### Insights
- Analytics
- Reports

### Account
- Settings

Mobile navigation should be designed separately during UX planning and must not simply shrink the desktop sidebar.

---

## 11. High-Level Data Model

The detailed database design is deferred, but the likely V2 domain includes:

- Supabase `auth.users`
- `profiles`
- `accounts`
- `categories`
- `transactions`
- `transfers` or equivalent linked-transfer structure
- `recurring_transactions`
- `budgets`
- `goals`
- `notifications`

Core ownership principle:

> Every user-owned financial record must be securely associated with one authenticated user.

---

## 12. High-Level Architecture Direction

The intended architecture remains:

```text
Browser
   ↓
Next.js frontend
   ↓
Supabase Auth session/token
   ↓
Express API
   ↓
Authentication / authorization middleware
   ↓
PostgreSQL / Supabase
```

Important principles:

- browser never receives database credentials;
- the frontend does not bypass the Express API for financial business logic;
- backend verifies authenticated identity;
- backend queries are user-scoped;
- database constraints remain a final safety layer;
- exact money values remain PostgreSQL numeric values and decimal strings in API contracts;
- financial aggregates are calculated in PostgreSQL/backend;
- date-only values preserve calendar-day meaning.

The authentication/security architecture will be finalized in the architecture document.

---

## 13. Security Goals

V2 introduces materially higher security requirements.

Required principles:

- authenticated access to protected data;
- strict per-user authorization;
- no cross-user data exposure;
- secure token verification;
- limited backend database role;
- TLS;
- parameterized SQL;
- safe API errors;
- rate limiting strategy where appropriate;
- secure password/reset flows delegated to the authentication provider;
- no secrets in frontend bundles;
- no trust in frontend-supplied user IDs;
- user identity derived from the verified authenticated session/token.

Security testing must explicitly attempt cross-user access.

---

## 14. Analytics and Money Rules

V1 exact-money guarantees must remain.

Rules:

- monetary API values remain decimal strings;
- no JavaScript floating-point financial calculations;
- totals come from PostgreSQL/backend;
- account balances must have deterministic definitions;
- transfer activity must not be counted as income/expense;
- recurring schedule projections must be distinguished from actual posted transactions;
- analytics must distinguish forecast data from historical actual data.

---

## 15. UX Principles

V2 should remain:

- responsive;
- keyboard accessible;
- screen-reader friendly;
- clear under loading/error/empty states;
- usable on mobile;
- consistent across pages;
- explicit about financial units and time periods.

The UI should favor understandable financial language over accounting jargon.

Data visualizations must always include a non-color-only interpretation and accessible text/table equivalents where appropriate.

---

## 16. Success Criteria

V2 will be successful when an authenticated user can:

1. create an account and securely sign in;
2. manage multiple financial accounts;
3. record account-specific transactions;
4. move money between accounts without corrupting income/expense totals;
5. configure recurring income and expenses;
6. view upcoming recurring activity;
7. analyze financial trends;
8. define and track budgets;
9. define and track savings goals;
10. manage categories/profile/settings;
11. access only their own financial information;
12. use the system across mobile, tablet, and desktop;
13. receive accurate financial calculations;
14. recover safely from API/network failures.

---

## 17. Proposed V2 Milestones

### M1 — Discovery and Design
- Product brief
- PRD
- UX specification
- Architecture
- Database design
- API design
- Figma V2
- Implementation plan

### M2 — Authentication and User Isolation
- Supabase Auth
- login/register/reset flows
- protected frontend
- authenticated Express API
- user-specific data access

### M3 — Accounts
- accounts backend
- accounts UI
- account-aware transactions
- transfer design/implementation

### M4 — Transaction Management V2
- dedicated transaction page
- search
- pagination
- advanced filters
- account/category/date filtering

### M5 — Recurring Finance
- recurring definitions
- upcoming activity
- schedule processing
- recurring pattern suggestions

### M6 — Analytics
- analytical queries
- analytics APIs
- charts
- deterministic insights

### M7 — Budgets
- monthly budgets
- progress
- warnings

### M8 — Goals
- savings goals
- progress tracking
- projections

### M9 — Settings / Categories / Reports
- profile
- custom categories
- export/reporting

### M10 — V2 Quality and Deployment
- full validation
- security audit
- multi-user isolation testing
- documentation
- production deployment

---

## 18. Open Product Decisions

These questions should be resolved in the PRD/architecture phases:

1. Should account balances be derived entirely from transactions or store opening/current balance state?
2. Should transfers use a dedicated table or paired transaction records?
3. Should recurring schedules automatically create transactions, or require user confirmation?
4. How will recurring generation work when the backend is serverless?
5. Should user-created categories be removable or only archivable?
6. Should savings goals be manually updated or linked to accounts/transactions?
7. Should credit cards be modeled differently from asset accounts?
8. Should search be server-side only?
9. What pagination model should transactions use: cursor or offset?
10. Which analytics periods must be supported in the first V2 release?
11. Should budgets roll over unused amounts?
12. Which notification types belong in core V2?
13. Should account deletion immediately delete financial data or use a delayed deletion workflow?
14. Should V2 remain EGP-only for the full release or prepare schema/API for future currencies?
15. How should historical V1 data be migrated into authenticated user ownership?

---

## 19. V1 Migration Considerations

V2 must not casually break the working V1 production data.

Before authentication/user ownership is introduced, the implementation plan must define:

- how existing transactions are assigned to a user;
- whether existing sample/demo data is preserved;
- whether V1 API routes remain temporarily available;
- migration ordering;
- rollback strategy;
- production deployment sequencing;
- how old clients are prevented from creating ownerless records.

Migration must be explicitly designed before any destructive schema changes.

---

## 20. BMAD Next Step

This product brief defines the initial V2 direction.

The next BMAD artifact is:

**`02-prd.md` — Product Requirements Document**

The PRD should turn this product direction into precise:

- personas;
- user stories;
- feature requirements;
- acceptance criteria;
- permission rules;
- functional requirements;
- non-functional requirements;
- scope boundaries;
- V2 release priorities.

No V2 application implementation should begin until the core planning artifacts have been reviewed.
