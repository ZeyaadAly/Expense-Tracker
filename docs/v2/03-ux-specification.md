# Expense Tracker V2 — UX Specification

**Version:** 2.0 Planning  
**Status:** Draft for BMAD UX Design  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`

---

# 1. Purpose

This document defines the V2 user experience, information architecture, page structure, navigation, major interactions, responsive behavior, visual hierarchy, UI states, accessibility expectations, and Figma design requirements.

It describes **how users move through and interact with the product**.

It does not define final implementation code, database schema, or API contracts.

---

# 2. UX Goals

V2 should feel like a complete personal finance application rather than a single transaction page.

The UX should be:

- clear;
- fast;
- trustworthy;
- consistent;
- responsive;
- accessible;
- financially understandable;
- easy to scan;
- safe during destructive or uncertain actions.

The interface should help users quickly answer:

- How much money do I have?
- Where is it?
- What did I spend?
- What income is coming in?
- What expenses repeat?
- Am I overspending?
- Am I saving enough?
- What should I pay attention to next?

---

# 3. Information Architecture

## Public / Authentication

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

## Protected Application

- `/dashboard`
- `/transactions`
- `/accounts`
- `/recurring`
- `/analytics`
- `/budgets`
- `/goals`
- `/reports`
- `/settings`

---

# 4. Global App Layout

## Desktop

Use a persistent left sidebar and a main content area.

Suggested layout:

```text
┌──────────────────┬─────────────────────────────────────┐
│                  │ Header                              │
│  Expense Tracker │                                     │
│                  │ Page content                        │
│  Dashboard       │                                     │
│  Transactions    │                                     │
│  Accounts        │                                     │
│  Recurring       │                                     │
│  Budgets         │                                     │
│  Goals           │                                     │
│  Analytics       │                                     │
│  Reports         │                                     │
│                  │                                     │
│  Settings        │                                     │
└──────────────────┴─────────────────────────────────────┘
```

Sidebar behavior:

- app/logo at top;
- grouped navigation items;
- active route clearly indicated;
- settings/profile at bottom;
- collapsible only if necessary;
- avoid icon-only navigation as the default.

## Tablet

Use either:

- a compact collapsible sidebar; or
- top header with drawer navigation.

The final pattern should prioritize content width.

## Mobile

Use:

- top app header;
- menu button;
- slide-over navigation drawer.

Core mobile navigation must remain easy to reach.

Do not simply scale down the desktop sidebar.

---

# 5. Navigation Groups

Suggested grouping:

## Overview
- Dashboard

## Money
- Transactions
- Accounts
- Recurring

## Planning
- Budgets
- Goals

## Insights
- Analytics
- Reports

## Account
- Settings

This grouping should be consistent across desktop and mobile.

---

# 6. Global Header

The protected application header should support:

- current page title;
- optional page description;
- primary action button;
- user/profile menu;
- notification button;
- responsive navigation trigger on mobile.

Examples:

Dashboard:
- Title: Dashboard
- Action: Add transaction

Transactions:
- Title: Transactions
- Action: Add transaction

Accounts:
- Title: Accounts
- Action: Add account

Recurring:
- Title: Recurring
- Action: Add recurring item

Budgets:
- Title: Budgets
- Action: Create budget

Goals:
- Title: Goals
- Action: Add goal

---

# 7. Authentication UX

## 7.1 Login Page

Route:

`/login`

Layout:

- centered auth card on desktop;
- full-width content area on mobile;
- app branding;
- email;
- password;
- sign-in button;
- forgot password link;
- register link.

States:

- idle;
- submitting;
- invalid credentials;
- network/server error;
- session expired.

Accessibility:

- visible labels;
- password visibility toggle optional;
- errors associated with fields;
- focus moves to first invalid field.

---

## 7.2 Registration Page

Route:

`/register`

Fields:

- display name;
- email;
- password;
- confirm password.

Optional later:

- terms/privacy checkbox.

Success state:

- account created;
- verification message if email verification is required.

---

## 7.3 Forgot Password

Route:

`/forgot-password`

Fields:

- email.

Success should avoid exposing whether the email exists if provider/security policy requires that.

---

## 7.4 Reset Password

Route:

`/reset-password`

Fields:

- new password;
- confirm password.

Success:

- confirmation;
- link/button back to sign in.

---

# 8. Dashboard UX

Route:

`/dashboard`

The dashboard is the main financial overview.

## 8.1 Dashboard Structure

Suggested order:

1. page header;
2. date/period selector;
3. primary financial summary;
4. account overview;
5. income vs expenses chart;
6. recent transactions;
7. upcoming recurring activity;
8. budget progress;
9. goals preview;
10. financial insights.

---

## 8.2 Financial Summary Cards

Show:

- Total Balance
- Income
- Expenses
- Net Savings

Example:

```text
Total Balance
25,480.00 EGP

Income
15,000.00 EGP

Expenses
8,240.00 EGP

Net Savings
6,760.00 EGP
```

Rules:

- exact decimal formatting;
- visible EGP;
- values may wrap;
- negative values must be explicit;
- never communicate meaning by color only.

---

## 8.3 Account Overview

Cards/list for:

- Cash
- Bank
- Savings
- Wallet
- Credit Card

Each card may show:

- account name;
- type;
- current balance;
- optional status;
- link to account details.

On desktop, use horizontal cards/grid.

On mobile, use stacked cards or horizontal scrolling only if content remains accessible.

---

## 8.4 Income vs Expenses Chart

Chart options:

- bar chart;
- line chart;
- grouped columns.

Default:

- current month vs previous periods.

Requirements:

- accessible labels;
- text/table equivalent;
- no reliance on color only;
- tooltip is supplemental, not the only data source.

---

## 8.5 Recent Transactions

Show 5–8 latest transactions.

Each item:

- description;
- category;
- account;
- date;
- signed amount;
- type.

Action:

- View all transactions.

---

## 8.6 Upcoming Recurring Activity

Show upcoming items such as:

- salary;
- rent;
- subscriptions;
- bills.

Each item:

- description;
- type;
- amount;
- next date;
- account.

If no recurring items:

- “No upcoming recurring activity.”

---

## 8.7 Budget Preview

Show top relevant budgets with progress bars.

Example:

```text
Food
1,800 / 3,000 EGP

Transport
900 / 1,500 EGP
```

Warnings:

- near limit;
- exceeded.

---

## 8.8 Goals Preview

Show:

- goal name;
- saved;
- target;
- progress;
- target date.

Action:

- View goals.

---

## 8.9 Financial Insights

Use compact insight cards.

Examples:

- “Food spending is 18% higher than last month.”
- “You saved 42% of your income this month.”
- “Recurring expenses use 31% of recurring income.”

Insights should be deterministic and factual.

---

# 9. Transactions Page UX

Route:

`/transactions`

This becomes the main financial entry and transaction-management page.

## 9.1 Layout

Suggested order:

1. header;
2. quick summary;
3. search;
4. filter row;
5. transaction table/list;
6. pagination.

---

## 9.2 Search

Search input placeholder:

`Search transactions`

Should search:

- description;
- category;
- account.

Use debounce or explicit submit according to final implementation choice.

---

## 9.3 Filters

Filters:

- type;
- account;
- category;
- date range;
- recurring status.

Optional UI:

- filter chips showing active filters;
- Clear all action.

Desktop:

- horizontal filter row with wrapping.

Mobile:

- primary search visible;
- filters open in a sheet/drawer.

---

## 9.4 Transaction Table

Desktop columns:

- Date
- Description
- Account
- Category
- Type
- Amount
- Actions

Actions:

- Edit
- Delete

Do not hide essential actions behind hover only.

---

## 9.5 Mobile Transaction Cards

Each card:

- type badge;
- signed amount;
- description;
- account;
- category;
- date;
- Edit/Delete actions.

No horizontal scrolling required.

---

## 9.6 Pagination

Show:

- current page or cursor state;
- next/previous;
- optional page size later.

Keep search/filter state when paging.

---

## 9.7 Add/Edit Transaction Dialog

Fields:

- Type
- Account
- Amount
- Category
- Date
- Description

Layout:

Desktop:
- centered modal;
- max width ~620px.

Mobile:
- full-screen sheet/dialog;
- vertically stacked fields.

Validation:
- field-level errors;
- summary error optional;
- preserve values after failure.

---

# 10. Accounts Page UX

Route:

`/accounts`

## 10.1 Accounts Overview

Show:

- total across accounts;
- account cards;
- account type;
- current balance;
- status.

Suggested cards:

```text
CIB Bank
Bank account
18,400.00 EGP
```

---

## 10.2 Add Account

Fields:

- account name;
- type;
- opening balance;
- currency;
- optional note.

Core V2 currency remains EGP.

---

## 10.3 Account Detail View

Can be a dedicated route later:

`/accounts/:id`

Potential content:

- account balance;
- recent transactions;
- account-specific analytics;
- transfer action;
- edit/archive action.

Whether this route is required in first V2 implementation should be finalized in the implementation plan.

---

# 11. Transfer UX

Transfer can be launched from:

- Accounts page;
- account detail;
- global action menu.

Fields:

- From account
- To account
- Amount
- Date
- Note

Confirmation:

- clearly state source and destination;
- show exact amount;
- warn if operation is pending.

Do not show transfer as income or expense.

---

# 12. Recurring Page UX

Route:

`/recurring`

## 12.1 Main Sections

Suggested tabs or segmented control:

- All
- Income
- Expenses
- Upcoming

---

## 12.2 Recurring Item Card/Table

Show:

- description;
- type;
- amount;
- frequency;
- account;
- category;
- next occurrence;
- status.

Actions:

- Edit
- Pause/Resume
- Delete/Archive according to final rules.

---

## 12.3 Add Recurring Item

Fields:

- type;
- account;
- amount;
- category;
- description;
- frequency;
- start date;
- end date optional.

Dynamic frequency fields may be needed later.

---

## 12.4 Upcoming Timeline

Optional layout:

```text
Today
- Salary +15,000 EGP

Tomorrow
- Rent -5,000 EGP

Oct 10
- Internet -600 EGP
```

---

## 12.5 Recurring Suggestion UX

When a likely recurring pattern is detected:

```text
Possible recurring transaction

Netflix
200.00 EGP
appears monthly

[ Not now ] [ Create recurring ]
```

Never enable recurring behavior without user confirmation.

---

# 13. Analytics Page UX

Route:

`/analytics`

This page should feel data-rich but readable.

## 13.1 Header Controls

Time range:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- Custom.

Optional filters:

- account;
- category.

---

## 13.2 Analytics Sections

### Overview Cards

- Income
- Expenses
- Net Savings
- Savings Rate
- Average Daily Spend

### Income vs Expenses

Time-series chart.

### Spending by Category

Donut or horizontal bar chart.

### Income Sources

Bar/donut chart.

### Savings Trend

Line chart.

### Account Activity

Breakdown by account.

### Recurring Commitments

Show:

- recurring income;
- recurring expenses;
- remaining recurring cash flow.

### Top Insights

Deterministic text cards.

---

## 13.3 Analytics Empty State

When insufficient data exists:

- explain that more transaction history is needed;
- do not display misleading charts.

---

# 14. Budgets Page UX

Route:

`/budgets`

## 14.1 Header

Controls:

- month selector;
- Create Budget button.

---

## 14.2 Budget Cards

Each card:

- category;
- allocated amount;
- spent;
- remaining;
- progress;
- status.

States:

- normal;
- near limit;
- exceeded.

---

## 14.3 Create/Edit Budget

Fields:

- category;
- amount;
- period;
- optional alert threshold.

---

## 14.4 Empty State

Message:

`No budgets for this month.`

Action:

`Create your first budget`

---

# 15. Goals Page UX

Route:

`/goals`

## 15.1 Goal Cards

Each:

- name;
- saved amount;
- target amount;
- progress percentage;
- target date;
- status.

---

## 15.2 Add Goal

Fields:

- name;
- target amount;
- current saved amount;
- target date;
- optional linked account.

---

## 15.3 Goal Detail

Potential detail page or expandable panel:

- progress history;
- estimated completion;
- linked account;
- update progress.

---

# 16. Reports Page UX

Route:

`/reports`

## 16.1 Report Controls

- date range;
- account;
- report type.

---

## 16.2 Report Sections

- income;
- expenses;
- net savings;
- category breakdown;
- account balances;
- recurring commitments.

---

## 16.3 Export Actions

- Export CSV
- Export JSON

Future:

- PDF
- Excel

Export should clearly state selected period/scope.

---

# 17. Settings Page UX

Route:

`/settings`

Suggested tabs/sections:

- Profile
- Accounts
- Categories
- Security
- Preferences
- Data & Export

---

## 17.1 Profile Settings

Fields:

- display name;
- email (read-only or provider-managed);
- locale;
- timezone.

---

## 17.2 Categories

List:

- default categories;
- custom categories;
- archived categories.

Actions:

- Add;
- Edit;
- Archive;
- Restore.

---

## 17.3 Security

Actions:

- Change password;
- Sign out all sessions if supported;
- account deletion flow.

---

# 18. Notifications UX

Global bell icon in header.

Panel/drawer should show:

- unread count;
- recent notifications;
- mark as read;
- mark all as read.

Types:

- recurring upcoming;
- budget warning;
- budget exceeded;
- goal milestone.

---

# 19. Global UI States

Every page/section must define:

- loading;
- empty;
- error;
- stale data;
- partial error;
- success;
- pending mutation;
- uncertain mutation outcome;
- unauthorized/session expired.

---

# 20. Loading UX

Use skeletons for:

- cards;
- tables;
- charts.

Avoid excessive spinners.

With reduced motion:

- skeletons should be static;
- no pulsing animation required.

---

# 21. Empty States

Empty states must explain what the user can do next.

Examples:

Accounts:
- “No accounts yet.”
- “Add your first account to start tracking money.”

Transactions:
- “No transactions yet.”
- “Add your first income or expense.”

Recurring:
- “No recurring activity configured.”

Budgets:
- “No budgets for this month.”

Goals:
- “No savings goals yet.”

---

# 22. Error States

Errors should:

- use plain language;
- avoid technical details;
- preserve useful data where possible;
- offer scoped Retry;
- not reset user inputs unnecessarily.

---

# 23. Session Expiry UX

When authentication expires:

- stop protected operations;
- display clear message;
- redirect to login;
- preserve safe return path if practical.

Do not show protected stale financial data after logout/session invalidation.

---

# 24. Destructive Action UX

Destructive actions requiring confirmation:

- delete transaction;
- archive/delete account;
- delete recurring definition;
- delete goal;
- archive category;
- account deletion.

Confirmation dialog should:

- name the affected item;
- state consequence;
- use danger styling;
- require explicit confirmation.

---

# 25. Form UX Rules

All forms should:

- use visible labels;
- mark required fields;
- show helper text where useful;
- show field-level errors;
- preserve values after server errors;
- disable duplicate submissions;
- maintain accessible focus.

Do not rely only on placeholder text.

---

# 26. Money Display Rules

Use exact decimal strings.

Display examples:

- `+15,000.00 EGP`
- `−850.00 EGP`
- `25,480.00 EGP`

Rules:

- income can show plus sign;
- expense can show minus sign;
- transfer should show neutral transfer labeling;
- do not abbreviate money as 15K unless later explicitly approved;
- large values may wrap.

---

# 27. Date Display Rules

API/storage may use date-only ISO values.

User-facing format:

`DD/MM/YYYY`

Time-based notifications may use localized date/time separately.

Avoid timezone conversion of date-only financial dates.

---

# 28. Chart UX Rules

All charts must:

- have title;
- explain time period;
- show units;
- support screen-reader-accessible equivalent;
- use more than color alone;
- handle empty data;
- handle negative values;
- support long labels.

Tooltips are supplemental only.

---

# 29. Responsive Rules

## Mobile `<768px`

- 16px page gutters;
- drawer navigation;
- cards stacked;
- tables become cards where needed;
- filters use vertical layout/sheet;
- dialogs may become full-screen;
- chart legends wrap;
- no page-level horizontal scroll.

## Tablet `768–1023px`

- 24px gutters;
- compact navigation;
- two-column card layouts where useful;
- tables remain possible if readable.

## Desktop `>=1024px`

- persistent sidebar;
- max content width around 1400px;
- multi-column dashboards;
- full tables;
- side-by-side analytical panels.

Reference widths:

- 360px
- 768px
- 1440px

---

# 30. Accessibility Requirements

Target practical WCAG 2.1 AA behavior.

Requirements:

- semantic headings;
- visible labels;
- keyboard navigation;
- visible focus;
- no hover-only controls;
- no color-only meaning;
- 44px touch targets where appropriate;
- focus trap in dialogs;
- focus return after dialog close;
- screen-reader-friendly status announcements;
- chart alternatives;
- reduced motion;
- sufficient contrast.

---

# 31. Design System Direction

Use a modern finance dashboard visual style.

Suggested design characteristics:

- light theme first;
- restrained neutral background;
- white surfaces/cards;
- strong typography;
- semantic green for income/success;
- semantic red for expense/danger;
- blue primary actions;
- amber warnings;
- subtle borders/shadows;
- rounded cards;
- consistent spacing tokens.

Avoid:

- heavy gradients;
- overly decorative glassmorphism;
- excessive shadows;
- overly colorful charts.

Dark mode may be considered later, but it is not required for initial V2.

---

# 32. Suggested Reusable Components

Global:

- AppShell
- Sidebar
- MobileNavDrawer
- PageHeader
- UserMenu
- NotificationButton

UI:

- Button
- IconButton
- Card
- Badge
- Tabs
- Select
- Input
- DatePicker
- Dialog
- Drawer
- DropdownMenu
- Pagination
- EmptyState
- ErrorState
- Skeleton
- FeedbackBanner

Finance:

- MoneyDisplay
- AccountCard
- SummaryCard
- TransactionRow
- TransactionCard
- TransactionForm
- TransferForm
- RecurringCard
- BudgetCard
- GoalCard
- InsightCard
- FinancialChart

---

# 33. Suggested Desktop Dashboard Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                           [ + Add Transaction ]   │
├─────────────────────────────────────────────────────────────┤
│ Total Balance │ Income │ Expenses │ Net Savings            │
├─────────────────────────────────────────────────────────────┤
│ Income vs Expenses Chart        │ Accounts                 │
│                                 │ Cash                     │
│                                 │ Bank                     │
│                                 │ Savings                  │
├─────────────────────────────────┼───────────────────────────┤
│ Recent Transactions             │ Upcoming                 │
├─────────────────────────────────┼───────────────────────────┤
│ Budgets                         │ Goals                    │
├─────────────────────────────────────────────────────────────┤
│ Financial Insights                                        │
└─────────────────────────────────────────────────────────────┘
```

---

# 34. Mobile Dashboard Layout

Suggested order:

1. Header
2. Total Balance
3. Income / Expense / Savings cards
4. Accounts
5. Recent Transactions
6. Upcoming
7. Budget progress
8. Goals
9. Insights
10. compact chart(s)

Prioritize scanability over displaying everything above the fold.

---

# 35. Required UX Flows

Figma prototype should demonstrate at minimum:

## Authentication
Register → Sign in → Dashboard → Sign out

## Account
Create account → Account appears

## Transaction
Add transaction → success → edit → delete

## Transfer
Create transfer → account balances update

## Recurring
Create recurring item → upcoming list → pause/resume

## Budget
Create budget → progress → exceeded state

## Goal
Create goal → update progress

## Analytics
Change period → chart/data update

---

# 36. Figma File Structure

Create one V2 Figma file with pages:

1. `Foundations`
2. `Components`
3. `Auth`
4. `Dashboard`
5. `Transactions`
6. `Accounts`
7. `Recurring`
8. `Analytics`
9. `Budgets`
10. `Goals`
11. `Reports`
12. `Settings`
13. `Responsive QA`

---

# 37. Required Figma Frames

## Auth

Desktop + Mobile:

- Login — default
- Login — validation error
- Login — invalid credentials
- Register — default
- Register — validation errors
- Forgot password
- Reset password
- Session expired

## Dashboard

Desktop + Mobile:

- Dashboard — populated
- Dashboard — loading
- Dashboard — empty/new user
- Dashboard — partial error
- Dashboard — full error
- Dashboard — negative savings month
- Dashboard — budget warning
- Dashboard — upcoming recurring activity

Tablet:

- Dashboard — populated
- Dashboard — loading

## Transactions

Desktop + Mobile:

- Transactions — populated
- Transactions — search active
- Transactions — filters active
- Transactions — no results
- Transactions — loading
- Transactions — error
- Add transaction
- Add transaction — validation
- Edit transaction
- Delete confirmation

## Accounts

Desktop + Mobile:

- Accounts — populated
- Accounts — empty
- Add account
- Edit account
- Archive account confirmation
- Account detail
- Transfer form
- Transfer confirmation/error

## Recurring

Desktop + Mobile:

- Recurring — populated
- Recurring — empty
- Add recurring
- Edit recurring
- Pause confirmation
- Upcoming timeline
- Recurring suggestion

## Analytics

Desktop + Mobile:

- Analytics — populated
- Analytics — alternate time range
- Analytics — loading
- Analytics — insufficient data
- Analytics — error

## Budgets

Desktop + Mobile:

- Budgets — populated
- Budgets — empty
- Create budget
- Near-limit budget
- Exceeded budget

## Goals

Desktop + Mobile:

- Goals — populated
- Goals — empty
- Create goal
- Goal detail
- Completed goal

## Reports

Desktop + Mobile:

- Reports — default
- Report — filtered period
- Export state
- Report — no data

## Settings

Desktop + Mobile:

- Profile
- Accounts settings
- Categories
- Add category
- Archived category
- Security
- Export
- Account deletion confirmation

---

# 38. Responsive QA Frames

At minimum:

- 360px dashboard stress case
- 360px transaction form with keyboard-safe layout
- 768px dashboard
- 768px transaction table
- 1440px analytics dashboard
- long descriptions
- very large money values
- long category/account names
- multiline errors
- empty charts
- dense notifications

---

# 39. UX Acceptance Criteria

The UX design is ready for implementation only when:

- all core routes have defined layouts;
- all major forms are designed;
- auth states are covered;
- user ownership implications are reflected in flows;
- desktop/mobile navigation is clear;
- loading/error/empty states are defined;
- destructive actions have confirmations;
- recurring/budget/goal workflows are complete;
- analytics charts have accessible alternatives;
- responsive behavior is documented;
- Figma components are reusable;
- critical prototype flows are linked.

---

# 40. BMAD Next Step

Next artifact:

**`04-architecture.md`**

It should decide:

- authentication architecture;
- frontend/backend auth flow;
- authorization strategy;
- database access model;
- whether RLS is used as defense-in-depth;
- transfer model;
- recurring scheduler;
- account balance model;
- pagination strategy;
- caching;
- analytics query strategy;
- notification processing;
- deployment implications;
- migration strategy from V1.

No V2 application implementation should begin yet.
