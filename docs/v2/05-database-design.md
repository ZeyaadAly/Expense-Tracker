# Expense Tracker V2 — Database Design

**Version:** 2.0 Planning  
**Status:** Draft for BMAD Database Design  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`, `04-architecture.md`

---

# 1. Purpose

This document defines the proposed PostgreSQL/Supabase database design for Expense Tracker V2.

It specifies:

- core tables;
- ownership rules;
- relationships;
- primary and foreign keys;
- exact-money data types;
- dates and timestamps;
- indexes;
- unique constraints;
- recurring-transaction safeguards;
- transfer consistency;
- budget/goal/category/notification data;
- migration from V1;
- privilege boundaries;
- preparation for optional Row Level Security.

This document describes the database model.  
Detailed HTTP contracts belong in `06-api-design.md`.

---

# 2. Database Principles

The V2 schema should preserve the strongest V1 guarantees while adding authenticated user ownership.

Mandatory principles:

1. Every financial record is owned by one authenticated user directly or through an owned parent.
2. Money uses exact PostgreSQL numeric types.
3. API-facing money remains decimal strings.
4. Calendar transaction dates use `date`.
5. Audit/system timestamps use `timestamptz`.
6. Transfers are not income or expense.
7. Recurring definitions are separate from actual posted transactions.
8. Recurring generation must be duplicate-safe.
9. Runtime application role cannot perform DDL.
10. Foreign keys and constraints remain a final safety layer.
11. Historical financial records must not be corrupted when accounts/categories are archived.
12. V1 data must migrate without changing historical amounts or dates.

---

# 3. Schema Overview

Recommended application tables:

```text
auth.users                      Supabase-managed

profiles
accounts
categories
transactions
transfers
recurring_transactions
budgets
goals
notifications
```

Optional/supporting tables that may be introduced if implementation requires them:

```text
recurring_occurrences
goal_progress_events
notification_preferences
```

Core relationship overview:

```text
auth.users
   │
   └── profiles
   │
   ├── accounts
   │      ├── transactions
   │      └── transfers
   │
   ├── categories
   │      ├── transactions
   │      ├── recurring_transactions
   │      └── budgets
   │
   ├── recurring_transactions
   │      └── generated transactions
   │
   ├── budgets
   ├── goals
   └── notifications
```

---

# 4. Schema Namespace

Keep application tables in the same application schema strategy already used by the project.

Recommended schema:

```text
expense_tracker
```

Benefits:

- separates application data from `public`;
- clearer privileges;
- easier migration management;
- easier future RLS/security reviews.

If the existing V1 schema already uses another application schema, V2 should extend that schema rather than creating needless fragmentation.

---

# 5. Supabase Auth Ownership

Supabase owns:

```text
auth.users
```

Application data should reference the Supabase user UUID.

Primary application ownership key:

```text
user_id uuid
```

Foreign key target:

```text
auth.users(id)
```

Do not create a second password/user-identity table.

---

# 6. `profiles`

Purpose:

Store application-specific user preferences separate from Supabase Auth.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | PK, FK → `auth.users(id)` |
| `display_name` | `varchar(100)` | nullable initially |
| `preferred_currency` | `char(3)` | default `EGP` |
| `locale` | `varchar(20)` | default `en` or product-selected value |
| `timezone` | `varchar(64)` | default `Africa/Cairo` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints:

```text
preferred_currency = 'EGP'
```

for core V2 if multi-currency remains deferred.

---

# 7. `accounts`

Purpose:

Represent places where users hold or owe money.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users(id)`, required |
| `name` | `varchar(100)` | required |
| `type` | `varchar(32)` | required |
| `opening_balance` | `numeric(14,2)` | required, default `0.00` |
| `currency` | `char(3)` | default `EGP` |
| `status` | `varchar(16)` | active/archived |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Allowed `type` values initially:

```text
cash
bank
savings
credit_card
mobile_wallet
other
```

Allowed `status`:

```text
active
archived
```

Recommended uniqueness:

```text
UNIQUE (user_id, lower(name))
```

If case-insensitive functional unique indexes are preferred.

Notes:

- archived accounts remain referenced by history;
- current balance should be derived, not stored as mutable source-of-truth;
- opening balance is counted exactly once.

---

# 8. Account Balance Definition

For an asset-like account:

```text
balance =
opening_balance
+ income
- expenses
+ incoming_transfers
- outgoing_transfers
```

For credit card accounts, final sign semantics must be agreed before implementation.

Core V2 may initially treat all accounts using one consistent signed-balance model and document credit-card limitations.

A database view may later expose calculated balances.

Example conceptual view:

```text
account_balances
```

This may aggregate:

- opening balance;
- transaction totals;
- transfer totals.

Whether implemented as a view, query, or service-level aggregate should be decided during implementation based on query performance.

---

# 9. `categories`

Purpose:

Support both system categories and user-created categories.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | nullable for system categories; user UUID for custom |
| `name` | `varchar(80)` | required |
| `kind` | `varchar(16)` | income/expense/both |
| `icon` | `varchar(64)` | nullable |
| `color` | `varchar(16)` | nullable |
| `status` | `varchar(16)` | active/archived |
| `is_system` | `boolean` | default false |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Allowed `kind`:

```text
income
expense
both
```

Allowed `status`:

```text
active
archived
```

Rules:

- system categories have `is_system = true`;
- user custom categories are owned by one user;
- archived categories remain valid for historical records;
- new transactions should not use archived categories.

Recommended indexes:

```text
(user_id, status)
(kind, status)
```

---

# 10. Default Categories

V2 should preserve V1 defaults where useful.

Suggested income defaults:

- Salary
- Freelance
- Gift
- Other

Suggested expense defaults:

- Food
- Transport
- Shopping
- Bills
- Entertainment
- Other

`Other` may be implemented once with `kind = 'both'`.

System-category IDs should be stable across environments if seed design allows it.

---

# 11. `transactions`

Purpose:

Store actual posted income and expense records.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users(id)`, required |
| `account_id` | `uuid` | FK → `accounts(id)`, required |
| `category_id` | `uuid` | FK → `categories(id)`, required |
| `type` | `varchar(16)` | income/expense |
| `amount` | `numeric(14,2)` | > 0 |
| `description` | `varchar(200)` | required |
| `date` | `date` | required |
| `recurring_transaction_id` | `uuid` | nullable FK |
| `recurring_occurrence_date` | `date` | nullable |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Allowed `type`:

```text
income
expense
```

Transfers do **not** live in this table.

Constraints:

```text
amount > 0
description after trim is not empty
date >= DATE '1900-01-01'
```

Future dates:

- normal manual transactions may keep V1 rule of not allowing future posting dates;
- recurring definitions may project future expected dates separately.

The exact future-date rule should remain consistent with API design.

---

# 12. Transaction Ownership Consistency

Even though `account_id` implies an owner, keeping `user_id` directly on `transactions` is recommended.

Reasons:

- simpler authorization queries;
- simpler indexing;
- simpler analytics;
- explicit ownership.

However, database consistency must prevent:

```text
transaction.user_id != account.user_id
```

and prevent user-owned category mismatches.

Possible enforcement approaches:

1. service-layer validation + tests;
2. composite foreign keys;
3. trigger-based ownership checks.

Recommended final database design:

Use service-layer checks plus database-level trigger constraints for ownership-sensitive cross-table validation where practical.

---

# 13. Transaction Category Consistency

A transaction must use:

- system category compatible with its type; or
- custom category owned by the same user and compatible with its type.

Examples:

```text
income → Salary
expense → Food
both → Other
```

An archived category may remain on existing history but should not be selectable for new transactions.

---

# 14. Transaction Indexes

Important indexes:

```text
(user_id, date DESC, created_at DESC, id DESC)
(user_id, type, date DESC)
(user_id, account_id, date DESC)
(user_id, category_id, date DESC)
```

Search-related indexes may later include:

```text
lower(description)
```

or PostgreSQL trigram/full-text indexes if necessary.

Do not create expensive search indexes until query design justifies them.

---

# 15. `transfers`

Purpose:

Represent money movement between owned accounts without affecting income/expense totals.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `source_account_id` | `uuid` | required |
| `destination_account_id` | `uuid` | required |
| `amount` | `numeric(14,2)` | > 0 |
| `date` | `date` | required |
| `description` | `varchar(200)` | nullable |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints:

```text
source_account_id <> destination_account_id
amount > 0
```

Both accounts must belong to `user_id`.

Transfers must be created/updated/deleted transactionally.

---

# 16. Transfer Indexes

Recommended:

```text
(user_id, date DESC, created_at DESC, id DESC)
(source_account_id, date DESC)
(destination_account_id, date DESC)
```

---

# 17. `recurring_transactions`

Purpose:

Store recurring income/expense schedule definitions.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `account_id` | `uuid` | required |
| `category_id` | `uuid` | required |
| `type` | `varchar(16)` | income/expense |
| `amount` | `numeric(14,2)` | > 0 |
| `description` | `varchar(200)` | required |
| `frequency` | `varchar(16)` | daily/weekly/monthly/yearly |
| `start_date` | `date` | required |
| `next_occurrence` | `date` | required |
| `end_date` | `date` | nullable |
| `status` | `varchar(16)` | active/paused/archived |
| `day_of_month` | `smallint` | nullable |
| `day_of_week` | `smallint` | nullable |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Allowed frequency:

```text
daily
weekly
monthly
yearly
```

Allowed status:

```text
active
paused
archived
```

Constraints:

```text
amount > 0
end_date IS NULL OR end_date >= start_date
next_occurrence >= start_date
```

---

# 18. Recurring Frequency Details

### Daily

No extra schedule field required.

### Weekly

Store:

```text
day_of_week
```

Suggested range:

```text
0–6
```

or PostgreSQL-aligned convention to be finalized.

### Monthly

Store desired:

```text
day_of_month
```

Range:

```text
1–31
```

For shorter months:

use the last valid day.

### Yearly

May derive month/day from `start_date` unless a separate schedule structure is preferred.

---

# 19. Recurring Generated Transaction Link

Generated transactions should contain:

```text
recurring_transaction_id
recurring_occurrence_date
```

Recommended uniqueness:

```text
UNIQUE (
  recurring_transaction_id,
  recurring_occurrence_date
)
WHERE recurring_transaction_id IS NOT NULL
```

This is the primary defense against duplicate cron processing.

---

# 20. Optional `recurring_occurrences`

A separate occurrence table is optional.

It may be useful if the product later needs:

- skipped occurrences;
- failed generation state;
- manually dismissed occurrences;
- scheduled vs posted audit trail.

Possible table:

```text
recurring_occurrences
```

Fields:

- id;
- recurring_transaction_id;
- user_id;
- occurrence_date;
- status;
- generated_transaction_id;
- processed_at;
- failure_code.

For first implementation, the generated-transaction uniqueness approach may be enough.

---

# 21. `budgets`

Purpose:

Store monthly category budgets.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `category_id` | `uuid` | required |
| `amount` | `numeric(14,2)` | > 0 |
| `year` | `smallint` | required |
| `month` | `smallint` | 1–12 |
| `alert_threshold_percent` | `smallint` | nullable |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Recommended uniqueness:

```text
UNIQUE (user_id, category_id, year, month)
```

Constraints:

```text
amount > 0
month BETWEEN 1 AND 12
alert_threshold_percent BETWEEN 1 AND 100
```

Spent/remaining values should be calculated from actual transactions.

Do not store `spent` as authoritative mutable state.

---

# 22. Budget Query Logic

For a monthly category budget:

```text
spent =
SUM(expense transactions)
WHERE:
user_id matches
category_id matches
date is within month
```

Then:

```text
remaining = budget amount - spent
```

This should be calculated in PostgreSQL/backend.

---

# 23. `goals`

Purpose:

Track personal financial goals.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `name` | `varchar(120)` | required |
| `target_amount` | `numeric(14,2)` | > 0 |
| `saved_amount` | `numeric(14,2)` | >= 0 |
| `target_date` | `date` | nullable |
| `linked_account_id` | `uuid` | nullable |
| `status` | `varchar(16)` | active/completed/archived |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Allowed status:

```text
active
completed
archived
```

Constraints:

```text
target_amount > 0
saved_amount >= 0
```

Whether `saved_amount` may exceed `target_amount` should remain allowed unless UX chooses to clamp display.

---

# 24. Goal Progress History

Core V2 may initially store only current `saved_amount`.

If progress history becomes necessary, add:

```text
goal_progress_events
```

with:

- goal_id;
- user_id;
- amount_delta or resulting amount;
- event date;
- note.

This is optional for first V2 implementation.

---

# 25. `notifications`

Purpose:

Persistent in-app notification state.

Suggested columns:

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `type` | `varchar(40)` | required |
| `title` | `varchar(160)` | required |
| `message` | `varchar(500)` | required |
| `status` | `varchar(16)` | unread/read |
| `related_entity_type` | `varchar(40)` | nullable |
| `related_entity_id` | `uuid` | nullable |
| `scheduled_for` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | default `now()` |
| `read_at` | `timestamptz` | nullable |

Allowed status:

```text
unread
read
```

Potential types:

```text
recurring_upcoming
budget_near_limit
budget_exceeded
goal_milestone
system
```

---

# 26. Notification Deduplication

Some notifications should be unique per event.

Example:

Budget 90% warning should not be generated repeatedly for the same budget period.

Possible unique event key:

```text
dedupe_key varchar(...)
```

Optional field:

```text
dedupe_key
```

with unique constraint per user:

```text
UNIQUE (user_id, dedupe_key)
```

This is recommended if scheduled notification generation is implemented.

---

# 27. `profiles` / User Creation Trigger

A profile row may be created:

- application-side after signup; or
- via database trigger on `auth.users`.

Recommendation:

Prefer a well-tested Supabase-compatible trigger or backend provisioning flow.

If using a trigger:

- keep it minimal;
- avoid complex business logic;
- ensure failures are observable.

---

# 28. Updated-At Trigger

Reuse a general trigger function for:

```text
updated_at = now()
```

Tables likely using it:

- profiles;
- accounts;
- categories;
- transactions;
- transfers;
- recurring_transactions;
- budgets;
- goals.

Do not manually duplicate trigger functions per table unless necessary.

---

# 29. Ownership Trigger / Validation

Cross-table ownership should be verified for operations such as:

- transaction.account_id;
- transaction.category_id;
- transfer source/destination;
- recurring.account_id;
- recurring.category_id;
- budget.category_id;
- goal.linked_account_id.

Recommended approach:

1. service-layer authorization checks;
2. database constraints/triggers for critical ownership invariants where composite FKs are impractical.

---

# 30. Composite Foreign Key Option

One way to enforce ownership at database level:

Accounts can expose unique pair:

```text
UNIQUE (id, user_id)
```

Transactions then reference:

```text
(account_id, user_id)
→ accounts(id, user_id)
```

This strongly enforces ownership without triggers.

The same pattern can be used for:

- transfers;
- recurring;
- linked goal account.

Recommendation:

Use composite ownership foreign keys where they stay understandable.

---

# 31. Category Ownership Complexity

System categories have no owning user.

Therefore category validation cannot be expressed as one simple composite user FK.

Possible rule:

A category is valid when:

```text
is_system = true
OR category.user_id = authenticated user
```

This likely requires service checks and possibly a trigger.

---

# 32. Soft Delete / Archive

Recommended archival tables:

- accounts;
- categories;
- recurring_transactions;
- goals.

Avoid physical deletion when historical records depend on them.

Transactions and transfers may preserve actual delete behavior if product requirements keep V1 semantics.

---

# 33. Search Support

Initial search fields:

- transaction description;
- account name;
- category name.

Start with:

```text
ILIKE
```

for modest datasets.

Potential future extension:

```text
pg_trgm
```

with GIN/GiST indexes.

Do not enable extensions until implementation proves need.

---

# 34. Cursor Pagination Support

Recommended transaction ordering:

```text
date DESC,
created_at DESC,
id DESC
```

Cursor contains:

```text
date
created_at
id
```

Required index:

```text
(user_id, date DESC, created_at DESC, id DESC)
```

This allows stable pagination.

---

# 35. Analytics Indexes

Likely analytics queries need:

```text
(user_id, date)
(user_id, type, date)
(user_id, category_id, date)
(user_id, account_id, date)
```

Avoid duplicate indexes if one composite index already serves a query.

Final index set should be validated using `EXPLAIN ANALYZE` on realistic datasets.

---

# 36. Dashboard Query Strategy

Dashboard likely needs:

- total balance;
- income/expense/net for selected period;
- account balances;
- recent transactions;
- upcoming recurring;
- budget progress;
- goal highlights.

These may be implemented with:

- several efficient SQL queries within one API request;
- CTEs;
- dedicated views where appropriate.

Avoid one giant query if it becomes difficult to maintain or optimize.

---

# 37. Views

Potential views:

```text
account_balances
monthly_transaction_summary
budget_progress
```

Views should be used when they make repeated logic clearer.

Materialized views are not recommended initially unless analytics performance requires them.

---

# 38. Exact Money Types

Recommended:

```text
numeric(14,2)
```

for individual transaction/account/budget/goal values.

This allows:

```text
999999999999.99
```

if needed depending on precision selection.

If compatibility with V1's maximum is desired, a smaller precision may be chosen.

The exact numeric precision should be standardized across V2 before migration.

---

# 39. Aggregate Precision

PostgreSQL `SUM(numeric)` remains exact.

API mapper should return aggregate values as decimal strings.

Do not cast totals to float/double precision.

---

# 40. Dates and Timestamps

Use:

```text
date
```

for:

- transaction date;
- transfer date;
- recurring start/end/next occurrence;
- goal target date.

Use:

```text
timestamptz
```

for:

- created_at;
- updated_at;
- read_at;
- scheduled notification timestamps;
- system processing timestamps.

---

# 41. Timezone

Application default:

```text
Africa/Cairo
```

Financial calendar dates remain independent of timezone.

Scheduled notifications/job timestamps should use UTC internally and convert for user display.

---

# 42. Constraint Naming

Use descriptive names, e.g.:

```text
accounts_type_check
transactions_amount_positive
transfers_accounts_different
budgets_month_check
recurring_frequency_check
```

Clear names improve migration/debugging.

---

# 43. UUID Generation

Use PostgreSQL UUID generation where available.

Preferred:

```text
gen_random_uuid()
```

if `pgcrypto`/supported built-in setup is already available.

Do not rely on predictable integer IDs for user-owned records.

---

# 44. Foreign Key Delete Behavior

Recommended patterns:

## `profiles.user_id`
`ON DELETE CASCADE`

## user-owned roots
For accounts/categories/etc.:
`ON DELETE CASCADE` may be appropriate only during full user account deletion.

## transaction → account/category
Prefer `RESTRICT` or archive parent entities so history remains valid.

## recurring generated transaction link
Potential:
`ON DELETE SET NULL`
or `RESTRICT` depending historical requirements.

The exact deletion matrix should be finalized carefully.

---

# 45. User Account Deletion

When deleting a user account:

Recommended application flow:

1. authenticate/reconfirm;
2. optionally export;
3. delete dependent application data;
4. delete auth identity last.

`ON DELETE CASCADE` can simplify full cleanup, but it must not allow normal account/category deletion to cascade unexpectedly.

---

# 46. Runtime Privileges

Application runtime role should receive only required privileges.

Likely:

```text
USAGE ON SCHEMA expense_tracker
SELECT, INSERT, UPDATE, DELETE on application tables
EXECUTE on required functions
USAGE/SELECT on sequences if any
```

Must not have:

- CREATE on schema;
- DROP;
- TRUNCATE;
- role management;
- database owner;
- superuser;
- bypass RLS unless intentionally required;
- migration privileges.

---

# 47. Auth Schema Privileges

The runtime role should not need broad direct access to `auth.users`.

If profile/user ID checks require references, FK creation happens through migrations.

Runtime identity should come from verified JWT, not querying sensitive auth tables unnecessarily.

---

# 48. RLS Preparation

Even if Express authorization is primary, schema should be RLS-friendly.

Recommended:

- `user_id` on user-owned root tables;
- ownership indexes;
- predictable user UUID type;
- avoid hidden ownership inference only through deep joins where possible.

Potential future RLS policies can use:

```text
user_id = auth.uid()
```

if architecture later routes access through Supabase-compatible authenticated DB context.

Do not enable RLS blindly for the current pooled backend role without a tested strategy.

---

# 49. Seed Data

V2 seeds should be separated into:

- system/reference data;
- development/demo data.

System seeds:

- default categories.

Development/demo seeds:

- test user data only in disposable/local environments.

Do not seed real production user financial data automatically.

---

# 50. Default Category Seed

System category seeds should be idempotent.

Prefer stable UUIDs so:

- tests remain deterministic;
- references are predictable;
- repeated seed does not duplicate.

---

# 51. V1 Migration Overview

Existing V1 data includes transactions without authenticated ownership/account.

Migration must:

1. introduce V2 tables additively;
2. create/identify migration owner user;
3. create default account;
4. map categories;
5. add/backfill `user_id`;
6. add/backfill `account_id`;
7. preserve amount/date/description/type;
8. enforce NOT NULL only after successful backfill.

---

# 52. V1 Transaction Backfill

Recommended migration target:

```text
existing V1 transaction
→ migrated owner user
→ default account "Main Account"
```

Default account:

```text
opening_balance = 0.00
```

This avoids double counting because V1 history already determines balance.

---

# 53. Category Migration

Existing V1 category strings should map to V2 system category IDs.

Example:

```text
salary → Salary category ID
food → Food category ID
other → Other category ID
```

Migration should fail loudly if an unknown category appears unexpectedly rather than silently remapping to incorrect data.

---

# 54. Migration Staging

Recommended migration sequence:

### Migration A
Create new V2 tables and category seeds.

### Migration B
Add nullable V2 ownership/account/category-ID columns to transactions.

### Migration C
Backfill existing rows.

### Migration D
Validate counts, totals, ownership.

### Migration E
Apply NOT NULL, foreign keys, indexes, and stricter constraints.

### Migration F
Retire old category/string columns only after V2 is stable.

Keeping old columns temporarily may simplify rollback.

---

# 55. Migration Verification

Before production:

Verify:

- row count unchanged;
- total income unchanged;
- total expenses unchanged;
- balance unchanged;
- dates unchanged;
- descriptions unchanged;
- no duplicate rows;
- all transactions have valid owner/account/category;
- all FKs validate.

---

# 56. Rollback Strategy

Before production migration:

- create backup/snapshot;
- record migration versions;
- rehearse rollback on disposable database;
- avoid destructive column drops during first rollout.

Prefer additive migrations until V2 is stable.

---

# 57. Candidate Schema DDL — Conceptual

This is illustrative, not final migration SQL.

```sql
CREATE TABLE expense_tracker.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  type varchar(32) NOT NULL,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0.00,
  currency char(3) NOT NULL DEFAULT 'EGP',
  status varchar(16) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Final SQL belongs in implementation migrations after review.

---

# 58. Data Integrity Test Matrix

Mandatory database-level tests should cover:

## Users / Profiles
- profile ownership;
- cascade behavior.

## Accounts
- valid type;
- archive state;
- exact opening balance.

## Transactions
- positive amount;
- valid type;
- valid account ownership;
- valid category compatibility;
- stable date;
- exact money.

## Transfers
- source != destination;
- same-user accounts;
- exact amount.

## Recurring
- valid frequency;
- valid dates;
- duplicate occurrence prevention.

## Budgets
- month bounds;
- unique category/month budget;
- exact amount.

## Goals
- positive target;
- nonnegative saved amount.

---

# 59. Multi-User Isolation Test Matrix

At least two users:

```text
User A
User B
```

Test that User B cannot:

- query User A account;
- insert transaction into User A account;
- update User A transaction;
- delete User A transaction;
- transfer from/to User A account;
- use User A custom category;
- view User A budget;
- view User A goal;
- access User A export.

---

# 60. Database Acceptance Criteria

Database design is ready when:

- ownership is explicit;
- all domain tables are defined;
- money/date types are agreed;
- transfer consistency is enforceable;
- recurring duplicate prevention is defined;
- indexes support planned queries;
- migration path preserves V1 data;
- runtime privileges remain limited;
- user-deletion behavior is understood;
- schema is compatible with future RLS hardening.

---

# 61. Open Database Decisions

Before final migration implementation, confirm:

1. final numeric precision;
2. exact credit-card balance convention;
3. whether `transactions.user_id` is duplicated alongside `account_id`;
4. whether composite ownership FKs are used widely;
5. whether recurring occurrences need a dedicated table in first V2 release;
6. whether goal progress history is required immediately;
7. exact account-delete/archive behavior;
8. exact transaction hard-delete vs soft-delete policy;
9. whether category search needs trigram/full-text indexes;
10. whether RLS is introduced during V2 or deferred to hardening.

---

# 62. BMAD Next Step

Next artifact:

**`06-api-design.md`**

It should define authenticated V2 API contracts for:

- auth-adjacent profile operations;
- dashboard;
- accounts;
- transactions;
- transfers;
- recurring;
- analytics;
- budgets;
- goals;
- categories;
- notifications;
- reports/export;
- pagination;
- errors;
- authorization behavior;
- exact money/date serialization.

No V2 application implementation should begin yet.
