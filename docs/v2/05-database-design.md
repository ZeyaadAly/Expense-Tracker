# Expense Tracker V2 — Database Design

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen with approved code-first design amendment; revised T03/T04 not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`, `04-architecture.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

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

P0 private tables: profiles, accounts, categories, transactions, transfers, recurring_transactions, **recurring_occurrences**, budgets, goals. Supabase owns auth.users. P1 only: notifications, goal_progress_events (history), notification_preferences. P1 tables are not required in the initial core migration. Every user-owned row has user_id; reference data categories may be system-owned. Occurrences belong to recurring definitions and survive generated transaction deletion.

---

# 4. Schema Namespace

Extend existing private **expense_tracker** schema. It stays outside Supabase Data API exposed schemas, with schema/table/function access revoked from PUBLIC/anon/authenticated. No second application schema or browser financial table access. Preserve existing migration history and limited expense_tracker_app role.

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

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | PK, FK → `auth.users(id)` |
| `display_name` | `varchar(100)` | nullable initially |
| `preferred_currency` | `char(3)` | default `EGP` |
| `locale` | `varchar(20)` | default/check `en`, read-only in P0 |
| `timezone` | `varchar(64)` | default/check `Africa/Cairo`, read-only in P0 |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints:

```text
preferred_currency = 'EGP'
```

for core V2. Only display_name is editable; ownership/default preferences are immutable in P0.

---

# 7. `accounts`

Purpose:

Represent places where users hold or owe money.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users(id)`, required |
| `name` | `varchar(100)` | required |
| `type` | `varchar(32)` | required |
| `opening_balance` | `numeric` | required, default `0.00`; scale<=2 and ±999999999.99 |
| `opening_balance_locked` | `boolean` | default false, permanently true on first posted activity |
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

Required unique expression index on `(user_id, lower(name))` and UNIQUE(id,user_id) for composite ownership references. Name is trimmed, 1–100 Unicode code points. CHECK(currency=EGP); no optional account note column in P0.

Notes:

- archived accounts remain referenced by history;
- current balance should be derived, not stored as mutable source-of-truth;
- opening balance is counted exactly once.

---

# 8. Account Balance and Lifecycle Definition

### Frozen balance and credit-card rules

Asset-like accounts (cash/bank/savings/mobile_wallet/other):

`currentBalance = openingBalance + income - expenses + incomingTransfers - outgoingTransfers`.

Credit cards use **debt-positive** balances:

`currentBalance = openingBalance + expenses - income + outgoingTransfers - incomingTransfers`.

Purchases are expense transactions and increase debt. Refunds/credits recorded as income reduce debt (and count as income under this simple tracker model). A payment is a transfer from an asset account to the card: asset money falls and card debt falls; payment never counts as expense again. Transfers from cards model cash advances and increase debt. Overpayment is allowed and produces negative debt (credit owed to the user).

**Total Balance = net worth = SUM(asset balances) - SUM(card debt balances)**, including archived accounts; archiving cannot remove money/debt from net worth. Period income/expenses/netSavings are actual income/expense transactions only. Account balances are current all-history values, independent of selected dashboard/analytics period. No credit limit, statement cycle, interest or billing automation is included.

### Frozen account/category lifecycle

Accounts support create/edit/archive/restore, never hard delete in P0. Opening balance and crossing between credit-card and asset semantics can be edited only while `opening_balance_locked = false`. Set that flag permanently on first transaction or transfer involving the account; deletion never unlocks it. Lock/check the account row atomically to prevent concurrent first activity and opening-balance edits. Name and asset-to-asset type edits remain allowed.

Archiving an account **automatically pauses all its active recurring definitions** in the same database transaction. Archiving a custom category does the same for its definitions. Lock affected accounts/categories and definitions consistently so archive cannot race a posting. Restore does not auto-resume schedules; user resumes explicitly after both references are active. System categories cannot be edited/archived.

Archived references remain in history and totals. Reject new transactions/transfers/recurring definitions or postings using archived references. Editing a transaction/transfer requires its resulting account/category references to be active; restore first for historical corrections. Hard deletion of owned historical transactions/transfers remains allowed even when parents are archived. Existing goal links to archived accounts remain metadata; assigning a link requires an owned active account. Category kind is immutable after any transaction, recurring definition or budget references it; category owner/system flag is always immutable.

**T15 enforcement clarification (explicit task instruction, 2026-10-06):** category ownership/kind integrity in PostgreSQL accepts archived categories. Future write services must lock/check category status and reject new activity or corrections using archived categories; this preserves the product rule above without rejecting historical references during migration. Account active-use checks remain in both PostgreSQL and future services. Archive still pauses active definitions transactionally; restore does not resume them. No financial write service is introduced in T15.

Use user-scoped SQL aggregates; join pre-aggregated transaction/transfer totals to avoid join multiplication. No current_balance persisted field or materialized view in P0.

T18 implements this in `backend/src/services/account-balances.ts`: one parameterized statement scopes accounts by owner and optional ID/status, groups posted transaction deltas, groups signed transfer entries, then joins one aggregate row per account. The same account-balance CTE supplies resources and archived-inclusive net position. Reads use a statement snapshot without row locks and can run on the mutation's existing checked-out client. No view, function, migration, new index or grant is needed. Recurring definitions/reservations never enter this query; only persisted generated transactions affect balances.

---

# 9. `categories`

Purpose:

Support both system categories and user-created categories.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

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
- archived categories reject new activity; archive auto-pauses active referenced schedules transactionally; restore never auto-resumes;
- category owner/is_system are immutable; kind cannot change once referenced;
- CHECK ((is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL));
- unique indexes: lower(name) for system rows, (user_id,lower(name)) for custom rows;
- custom user_id FK → auth.users(id) ON DELETE RESTRICT.

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

One stable system Other category with kind='both'; seed stable UUIDs for all defaults consistently across environments.

T12 freezes the nine defaults above. `supabase/seeds/v2-system-categories.sql` contains their fixed UUID literals and inserts active, unowned system rows with null icon/color. Run separately from the V1 development transaction seed after T11. ON CONFLICT (id) DO NOTHING preserves existing rows/timestamps and never updates custom categories. Name conflicts under different IDs fail rather than silently accepting identity drift. This is reference data, not a financial sample/reset or ownership migration; remote execution remains under the later production maintenance workflow.

---

# 11. `transactions`

Purpose:

Store actual posted income and expense records.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users(id)`, required |
| `account_id` | `uuid` | FK → `accounts(id)`, required |
| `category_id` | `uuid` | FK → `categories(id)`, required |
| `type` | `varchar(16)` | income/expense |
| `amount` | `numeric` | > 0 |
| `description` | `varchar(200)` | required |
| `transaction_date` | `date` | required on transactions; maps to API date |
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
transaction_date >= DATE '1900-01-01'
```

Manual and generated postings cannot be future dates: transaction_date <= Cairo today, enforced by validation/write trigger. Preserve V1 calendar rules, ID immutability and created_at preservation. Recurring forecasts remain separate. All monetary constraints follow §38. Description is trimmed, 1–200 Unicode code points.

---

# 12. Transaction Ownership Consistency

Store transaction.user_id NOT NULL directly; FK → auth.users(id) RESTRICT. Accounts have UNIQUE(id,user_id); composite FK (account_id,user_id) → accounts(id,user_id) RESTRICT. Services scope all queries and lock parent rows; SECURITY INVOKER triggers validate category ownership/type/archive rules. Composite (recurring_transaction_id,user_id) FK → recurring_transactions(id,user_id) RESTRICT; CHECK recurring_transaction_id and recurring_occurrence_date are both null or both nonnull. Ownership and generated occurrence identity are immutable. Generated pair also references occurrence (recurring_transaction_id,occurrence_date); no public API writes those linkage fields.

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
(user_id, transaction_date DESC, created_at DESC, id DESC)
(user_id, type, transaction_date DESC)
(user_id, account_id, transaction_date DESC)
(user_id, category_id, transaction_date DESC)
```

Search-related indexes may later include:

```text
lower(description)
```

or PostgreSQL trigram/full-text indexes if necessary.

Do not create expensive search indexes until query design justifies them.

---

# 15. `transfers`

Dedicated P0 table; columns: id UUID PK, user_id UUID NOT NULL FK auth.users RESTRICT, source_account_id/destination_account_id UUID NOT NULL, amount NUMERIC NOT NULL (scale<=2, 0.01–999999999.99), date DATE NOT NULL (1900-01-01 through Cairo today), description VARCHAR(200) nullable, created_at/updated_at TIMESTAMPTZ. ID and created_at immutable; updated_at trigger. CHECK distinct accounts; composite source/owner and destination/owner FKs → accounts(id,user_id) RESTRICT. Create/edit/hard-delete use one transaction, lock account rows in UUID order, validate ownership and active parents for create/edit. Delete may reference archived parents; no archive column. Blank/empty description normalizes to null.

---

# 16. Transfer Indexes

Transfers use date (not transaction_date): indexes (user_id,date DESC,created_at DESC,id DESC), (source_account_id,date DESC), (destination_account_id,date DESC). Cursor order matches API §11.

---

# 17. `recurring_transactions`

Purpose:

Store recurring income/expense schedule definitions.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `account_id` | `uuid` | required |
| `category_id` | `uuid` | required |
| `type` | `varchar(16)` | income/expense |
| `amount` | `numeric` | > 0 |
| `description` | `varchar(200)` | required |
| `frequency` | `varchar(16)` | daily/weekly/monthly/yearly |
| `start_date` | `date` | required |
| `next_occurrence` | `date` | nullable when paused/archived/exhausted |
| `end_date` | `date` | nullable |
| `status` | `varchar(16)` | active/paused/archived |
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
next_occurrence IS NULL OR next_occurrence >= start_date
next_occurrence IS NULL OR end_date IS NULL OR next_occurrence <= end_date
```

---

# 18. Recurring Frequency and Lifecycle Rules

### Frozen recurring execution

- Provider: **Vercel Cron**, one daily job on the Express backend project, `0 3 * * *` (03:00 UTC). Hobby's once-daily, hour-level precision is sufficient: P0 promises date-based daily posting, not midnight or minute precision. Infrastructure uses UTC; all financial due dates and manual-date validation use **Africa/Cairo**, fixed/read-only in P0. No auth/provider settings are changed by T02.
- Endpoint: **GET /internal/recurring/process**, outside `/api/v2`, with server-only `Authorization: Bearer <CRON_SECRET>`; constant-time secret validation, no-store, no redirects, no browser credentials or user token authorization. Never authenticate by user-agent/header schedule alone.
- Process active schedules oldest-due first, at most **100 occurrences per definition and 1000 attempts globally per invocation**; stop earlier with a safety buffer before the configured function deadline. Each occurrence commits independently. Return safe counts plus `hasRemaining`; unfinished/failed work continues next daily invocation or an operator's authenticated invocation of the same handler. Provider does not guarantee retries; log backlog/failures safely.
- Creating a schedule anchors it to `startDate` but initializes `nextOccurrence` to the first anchored date **on or after Cairo today** (or startDate if future). No historic import/backfill occurs. Today's occurrence is due even if today's cron already ran; it posts on the next run using its original date.
- Monthly recurrence uses the original start-date day, clamped to the last valid day each month (Jan 31 → Feb 28/29 → Mar 31). Weekly recurrence uses startDate's weekday (ISO Monday=1 … Sunday=7); yearly uses original month/day, with Feb 29 → Feb 28 in non-leap years and Feb 29 again in leap years. API accepts no independent weekday/month-day fields in P0.
- Catch-up applies only to active schedules missed by the scheduler; occurrences are posted with their original dates. End date is inclusive. After the final occurrence, `nextOccurrence = null`; expose an exhausted flag without adding a new stored lifecycle status.
- Pause clears nextOccurrence and marks any pending/failed unposted occurrence rows skipped. Resume finds the first anchored, nonterminal occurrence on or after today; paused history is not generated. Archive behaves like pause and is permanent in P0 (no recurring restore).
- Definition edits lock the definition, retain posted/skipped occurrences and historical transactions unchanged, mark pending/failed unposted rows skipped, then recalculate the first unprocessed anchored date on or after today. Paused/archived definitions keep nextOccurrence null. Already terminal dates are never replayed, even after schedule edits or generated-transaction deletion.
- Durable `recurring_occurrences` rows own idempotency. Claim/create pending occurrence under definition lock and commit; in a second transaction lock definition/occurrence, recheck active parents, create transaction, mark posted/link it, and advance schedule together. On failure roll back financial writes and record a sanitized failed occurrence separately under a fresh row lock, only if still nonterminal; never overwrite a concurrent posted/skipped status. Retain its due date for retry. Concurrent runners serialize on row locks; posted/skipped dates never generate again. Failures on one definition must not prevent attempting other definitions.

Definition FK user_id → auth.users RESTRICT; UNIQUE(id,user_id); composite account_id/user_id FK RESTRICT; targeted category triggers enforce same-user/system/kind and active parents. start/end dates between 1900-01-01 and 9999-12-31; null next_occurrence for exhaustion and at calendar upper bound. Anchor derives exclusively from start_date, no independent day fields.

---

# 19. Generated Transaction Link

Generated transactions store recurring_transaction_id and recurring_occurrence_date as immutable metadata, together null/non-null. Partial unique index `(recurring_transaction_id,recurring_occurrence_date) WHERE recurring_transaction_id IS NOT NULL` supplements required occurrence uniqueness; this is not the durable source of idempotency. Generated transaction/owner FK enforces same owner. Recurring edit/archive never rewrites generated records.

---

# 20. Required `recurring_occurrences` — P0

| Column | Type | Rules |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL, auth.users FK RESTRICT |
| recurring_transaction_id | uuid | NOT NULL, composite definition/owner FK RESTRICT |
| occurrence_date | date | NOT NULL |
| status | varchar(16) | pending/posted/skipped/failed; NOT NULL |
| generated_transaction_id | uuid | nullable unique FK → transactions(id) ON DELETE SET NULL |
| created_at | timestamptz | NOT NULL default now() |
| processed_at | timestamptz | nullable until posted/skipped/failed |
| failure_code | varchar(40) | nullable sanitized code, never SQL/error payload |

UNIQUE(recurring_transaction_id,occurrence_date); UNIQUE(id,user_id). Index (status,occurrence_date); due definitions index (next_occurrence,id) WHERE status='active' AND next_occurrence IS NOT NULL. Terminal posted/skipped markers cannot revert; posted with null generated_transaction_id means a historical generated transaction was deleted. CHECK failure_code only on failed; processed_at nonnull for terminal/failed, pending has null. skipped/pending/failed have no generated link. Targeted trigger verifies any linked transaction has the same owner, definition and occurrence date.

FK SET NULL clears only generated_transaction_id; user ownership remains NOT NULL. Definition/occurrence deletion is RESTRICT. Ledger DELETE is not granted to runtime role; archive/pause does not remove markers. Claim/processing/failure transactions follow architecture §20; reserve pending occurrence before transaction insertion so the generated pair FK can validate. Concurrency/retry/deleted-transaction tests are required before processor delivery.

---

# 21. `budgets`

Purpose:

Store monthly category budgets.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `category_id` | `uuid` | required |
| `amount` | `numeric` | > 0 |
| `year` | `smallint` | required |
| `month` | `smallint` | 1–12 |
| `alert_threshold_percent` | `smallint` | NOT NULL default 90; 1–100 |
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
year BETWEEN 1900 AND 9999
alert_threshold_percent BETWEEN 1 AND 100
```

Budget user_id references auth.users RESTRICT; category_id references categories RESTRICT, with trigger validation allowing expense/both system or same-user categories. Required exact-money constraints are in §38. Only expense transactions contribute. Hard-delete plan with confirmation; no cascade to financial records. Spent/remaining values are calculated from actual transactions.

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
transaction_date is within month
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

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | required |
| `name` | `varchar(120)` | required |
| `target_amount` | `numeric` | > 0 |
| `saved_amount` | `numeric` | >= 0 |
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

saved_amount may exceed target_amount. CHECK(status <> 'completed' OR saved_amount >= target_amount); completed/archive lifecycle follows §24.

---

# 24. Goal Progress and P1 History

P0 goal progress is manually maintained `savedAmount`; `linkedAccountId` is optional owned-account metadata only and never changes progress. No progress-event table or detail page is required in P0. Saved amount may exceed target; percentComplete is not clamped, remainingAmount is `max(targetAmount - savedAmount, 0)`. At 100%+, suggest completion; only an explicit user transition sets status completed. Complete requires savedAmount >= targetAmount; reducing a completed goal below target requires an explicit transition back to active in the same update. Active/completed goals can be archived; archived goals are read-only in P0. Projection/history/detail are P1; automatic account-derived progress is post-V2.

Goal user_id FK auth.users RESTRICT; optional composite (linked_account_id,user_id) → accounts(id,user_id) RESTRICT. A null linked_account_id is valid; linked-account deletion is prevented, archived references remain. goal_progress_events is P1 only, with goal_id/user_id composite FK RESTRICT and no core migration requirement.

---

# 25. `notifications` — P1

Purpose:

Persistent in-app notification state.

Final columns (NOT NULL unless explicitly nullable; defaults are server-owned):

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

# 26. Notification Deduplication — P1

If notifications are promoted, require dedupe_key VARCHAR(200) NOT NULL and UNIQUE(user_id,dedupe_key), user_id FK auth.users RESTRICT. Index (user_id,created_at DESC,id DESC). Keys represent one threshold/milestone/occurrence event; no repeated alert spam. P1 is not part of the core schema or job release gates.

---

# 27. Profile Provisioning — No Auth Trigger

Use authenticated backend POST /profile/bootstrap: INSERT with verified sub/defaults ON CONFLICT(user_id) DO NOTHING. No database trigger on auth.users. FK references auth.users PK and is created by privileged migration; runtime requires no auth table SELECT. Missing GET/PUT profile returns 409 PROFILE_REQUIRED and client bootstraps. Operator provisions migrated profile; new users bootstrap before core reads. Test parallel bootstrap, database failure/retry and missing profile recovery.

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

# 29. Ownership and State Validation

Express token verification and ownership-scoped authorization are mandatory P0 controls. **RLS is deferred to a dedicated post-core hardening milestone**, requiring transaction-local user context/reset and pooled-connection isolation tests before activation. Runtime role remains NOBYPASSRLS; no admin credentials are used for API/cron.

Keep `expense_tracker` outside exposed Data API schemas. Revoke schema/table/function privileges from PUBLIC, anon and authenticated; browser publishable key is for Auth only. Grant the limited runtime role only required application DML/function privileges, including new objects explicitly; no DDL, role management, TRUNCATE, auth.users access or broad default grants. Any views stay private. Migrations run through the existing separate privileged workflow with project/history verification.

Store user_id directly on transactions and every user-owned root/occurrence. Use unique (id,user_id) parent keys and composite ownership FKs for transaction/account, transfer source/destination, recurring/account, goal/account, occurrence/definition and generated transaction/definition. Targeted SECURITY INVOKER triggers plus service checks enforce system-or-same-user category ownership/kind, immutable ownership, generated occurrence identity and immutable category kind once referenced. System category iff is_system=true and user_id IS NULL; custom iff is_system=false and user_id IS NOT NULL. Archived-account checks use row locks in services/triggers; archived-category activity checks belong to services as clarified in §8. Database integrity supplements, but does not replace, read authorization.

See [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

---

# 30. Composite Ownership Foreign Keys

Mandatory UNIQUE(id,user_id) on accounts, recurring_transactions, goals and other referenced user-owned parents. Transactions and recurring reference (account_id,user_id); transfers reference both (account_id,user_id) pairs; goals reference optional (linked_account_id,user_id); occurrences and generated transactions reference (recurring_transaction_id,user_id). All use ON DELETE RESTRICT. See §§12, 20, 44 for generated links; category system/custom logic uses targeted triggers.

---

# 31. Category Ownership Complexity

System categories have no owning user.

Therefore category validation cannot be expressed as one simple composite user FK.

Required rule:

A category is valid when:

```text
is_system = true
OR category.user_id = authenticated user
```

Service checks and a targeted SECURITY INVOKER trigger are mandatory, including ownership/kind/active state and immutable referenced category kind.

---

# 32. Deletion and Archive Rules

P0 accounts/custom categories/recurring/goals archive only. Account/category archive auto-pauses definitions and terminalizes unposted reservations; restore never resumes implicitly. Recurring archive is permanent in P0; archived goals read-only. Transactions/transfers/budgets hard-delete with explicit confirmation. Recurring ledger rows persist; deleting generated transaction keeps posted marker with null link. User deletion is post-V2; no accidental cascades allowed.

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

Transactions and transfers use cursor pagination ordered by **date DESC, createdAt DESC, id DESC** (transaction storage column is `transaction_date`). P1 notifications use **createdAt DESC, id DESC**. Default limit **25**, maximum **100**; integer limits only. Backend returns `meta: {limit, nextCursor, hasMore}`; no total-page count or previousCursor.

Opaque cursor is a versioned base64url payload plus HMAC-SHA256 signature using server-only `CURSOR_SIGNING_SECRET`. Payload binds resource, verified user ID, ordering tuple, normalized filter/search scope and limit; it expires after **24 hours**. Validate encoding, signature, version, types, expiry and scope before querying. Malformed, tampered, expired, wrong-user or wrong-scope cursors return **400 VALIDATION_ERROR** with a generic cursor field message. Scope excludes the cursor itself; omitted/default filters canonicalize identically.

Frontend keeps cursor history for Next/Previous, resets it on filter/search/limit changes and after financial mutations, and starts over on invalid cursor. Every page request still applies user scoping. Paging is keyset-based, not a historical snapshot: inserts do not shift already traversed pages, but edits/deletes can change membership; refresh resets the list.

Required transaction index (user_id,transaction_date DESC,created_at DESC,id DESC); transfer index uses date. P1 notifications index uses created_at/id.

---

# 35. Analytics Indexes

Use the transaction indexes in §14; transaction_date is the persisted calendar column. Composite indexes may serve multiple query patterns; do not duplicate equivalent user/date indexes. Validate final performance with EXPLAIN ANALYZE on disposable realistic data; begin ILIKE without trigram/full-text extension.

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

# 38. Exact Money Types and Bounds

### Frozen money contract

All persisted monetary columns use PostgreSQL **NUMERIC without a precision/scale typmod**, with explicit `scale(value) <= 2` and range CHECK constraints. This preserves V1's excess-scale rejection: `NUMERIC(11,2)` would round before a CHECK could inspect the original value. Effective per-value bounds are nine integer digits and two fractional digits; no monetary column uses float/double.

| Value | Minimum | Maximum |
|---|---|---|
| Transaction, transfer, recurring amount | `0.01` | `999999999.99` |
| Account opening balance (all types) | `-999999999.99` | `999999999.99` |
| Budget amount, goal target | `0.01` | `999999999.99` |
| Goal saved amount | `0.00` | `999999999.99` |

Inputs are plain decimal strings with zero, one or two fractional digits; no exponent, whitespace, separators, plus sign or leading zeroes except zero itself. A minus sign is allowed only for opening balance; reject negative zero. Normalize accepted values to two fractional digits. Reject excess decimals (including trailing zeroes such as `1.230`) and out-of-range inputs with field validation; never round input.

Derived balances/SUM totals are unbounded exact NUMERIC and serialize as two-decimal strings. PostgreSQL rounds derived averages and percentages to two decimals, with ties away from zero (half-up for nonnegative values). Percentages are decimal strings, may exceed 100 or be negative where meaningful, and are null for zero denominators. Never calculate financial values with JS floating-point arithmetic.

Apply scale/range CHECKs to every persisted monetary field in §§7, 11, 15, 17, 21, 23. Keep existing V1 amount NUMERIC/checks rather than recasting it to a rounding typmod. Derived views/queries also use NUMERIC without a limiting typmod.

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

- transaction_date (storage; API date);
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

P0 profiles.timezone is fixed/read-only Africa/Cairo; profiles.locale=en and currency EGP. Infrastructure cron/timestamptz use UTC. Financial posting dates and today/due-date evaluation use Cairo calendar days, never timezone-shift persisted DATE.

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

# 44. Frozen Foreign-Key Deletion Matrix

| Child reference | ON DELETE | Reason |
|---|---|---|
| profiles.user_id and every user-owned user_id → auth.users | RESTRICT | User deletion post-V2; no silent financial cascade |
| custom categories.user_id → auth.users | RESTRICT | System rows have null owner only |
| transactions/account, category | RESTRICT | Parents archive; history stays valid |
| transfers/source and destination account | RESTRICT | Parents archive |
| recurring/account, category | RESTRICT | Parent archive pauses, does not delete |
| transactions/recurring definition | RESTRICT | Definition archive preserves history |
| transactions/(definition, occurrence_date) → occurrence unique pair | RESTRICT | Durable marker required for generated record |
| occurrences/(definition,user_id) → definition | RESTRICT | No marker deletion through lifecycle |
| occurrences.generated_transaction_id → transactions.id | SET NULL | Hard deletion preserves posted marker; clear only link |
| budgets/category | RESTRICT | Budget delete never cascades to transactions |
| goals/(linked_account_id,user_id) → accounts | RESTRICT | Optional metadata; parent archives |
| P1 progress events/goal and notification user | RESTRICT | Enhancement parent history preserved |

No CASCADE in P0 identity/financial parent relationships. Composite ownership FKs use RESTRICT. The simple occurrence→transaction SET NULL FK is supplemented by a same-owner/definition/date trigger, avoiding a SET NULL operation on NOT NULL user_id.

---

# 45. User Identity Deletion — Post-V2

No user deletion API or auth cascade in P0/P1. Auth FK RESTRICT prevents operator deletion of an identity with retained app rows. A future explicit privileged cleanup must reconcile data/revoke sessions and remove auth identity last; retention/privacy workflow is outside frozen core scope.

---

# 46. Runtime Privileges

Application runtime role should receive only required privileges.

Likely:

```text
USAGE ON SCHEMA expense_tracker
SELECT, INSERT, UPDATE, DELETE on ordinary P0 domain tables
SELECT, INSERT, UPDATE (no DELETE) on recurring_occurrences
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
- bypass RLS;
- migration privileges.

---

# 47. Auth Schema Privileges

The runtime role should not need broad direct access to `auth.users`.

If profile/user ID checks require references, FK creation happens through migrations.

Runtime identity should come from verified JWT, not querying sensitive auth tables unnecessarily.

---

# 48. RLS Timing

Deferred to dedicated post-core hardening. No RLS activation in core migrations. Express scoping/private schema/browser-role revocations remain mandatory and tested. Before future activation, design transaction-local user context and pooled isolation tests, keeping limited NOBYPASSRLS runtime role; do not assume auth.uid() exists in a normal shared pg connection.

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

### Frozen migration ownership and cutover

The migration operator supplies the **verified intended existing-data owner UUID** at execution time; no real UUID is hardcoded. Preserve **all retained V1 production records, including retained demo rows**, assign them to that owner and a cash `Main Account` with openingBalance `0.00`. Record actual IDs/counts/amounts/categories/dates/timestamps/totals from the production inventory at cutover; historical T14 counts are not a migration assumption. Unknown category mapping aborts; never seed or silently delete retained data.

Choose a **maintenance-window cutover**, not dual public operation:

1. Rehearse full migration/rollback on a disposable production-like copy, prepare source/environment rollback artifacts, and take a verified production backup.
2. Deploy and verify maintenance enforcement for **all V1 financial reads/writes and summary routes**, across current and still-reachable older deployments; suspend old runtime SELECT/INSERT/UPDATE/DELETE grants if needed to neutralize old deployments. Public V1 health may remain. Verify direct HTTP requests are blocked before schema/backfill. No V2 financial writes or cron yet.
3. Capture the frozen inventory; execute additive tables/nullable columns/reference seeds through the privileged versioned migration workflow.
4. Operator creates/verifies the Auth owner and provisions profile; create default Main Account.
5. Final backfill user_id/account_id/category_id, preserving IDs, amounts, descriptions, transaction_date, created_at and updated_at. Backfill bypasses only the timestamp-update trigger in the privileged maintenance transaction, restoring it afterward; normal runtime cannot bypass it.
6. Reconcile every preserved field and exact totals, validate ownership/category mapping; only then apply NOT NULL, ownership FKs, checks and indexes.
7. Deploy authenticated V2 backend while maintenance remains; verify auth/isolation and permanently remove V1 financial handlers. Restore only V2-required runtime grants once old deployments cannot bypass maintenance.
8. Deploy V2 frontend, verify production under controlled access; run reconciliation/isolation/financial checks before enabling user access and daily cron.
9. Close maintenance after gates pass. Verify `/api/v1` financial paths remain unavailable (maintenance 503, then 410 API_RETIRED with no data); protect/remove old backend deployments and public aliases. Retirement enforcement precedes the first V2 user write; never retain unauthenticated read-only compatibility against V2 data.

Temporary compatibility consists only of retained legacy columns/backups and a maintenance response to old clients. P0 keeps `transaction_date` in storage and maps it to API `date`; no date-column rename. Retain legacy category text for rollback evidence, make it nullable/drop its V1-only category check after reconciliation, and map V2 categories by category_id; do not fabricate legacy values for new custom categories. Later column removal is a separate migration after stability, not part of first cutover.

---

# 52. V1 Transaction Backfill

Operator supplies verified owner UUID; preserve every retained row (demo included) under cash Main Account, opening_balance=0.00, opening_balance_locked=true when rows exist. Production inventory is read at cutover, not inferred from historical reports. Backfill user_id/account_id/category_id while preserving all other fields/timestamps; privileged controlled suppression/restoration of update timestamp trigger is required. Default account uniqueness/operator re-runs must be idempotent; no new demo transaction seed.

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

Versioned stages, rehearsed before production:

- A: P0 tables, durable occurrences, explicit runtime grants/revocations and stable system seeds.
- B: nullable transaction owner/account/category-ID columns; keep transaction_date and legacy category column.
- C: operator-owner/default-account final backfill under verified maintenance.
- D: exact field/count/totals/ownership reconciliation.
- E: NOT NULL, composite FKs, scale/range checks, integrity triggers and indexes; legacy category becomes nullable and its fixed V1 category check is removed, while retained legacy values remain.
- F: optional legacy-column retirement after stable V2, outside initial core cutover.

Stages A–E execute only with all V1 financial access blocked. T11 prepares A/B, T14 rehearses C/D, T15 prepares/tests E, T66 executes under the final production runbook. Existing SQL baselines are not rewritten/replayed. Verify linked project/catalog/history first; privileged SQL and recorded migration history must agree.

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
- all FKs validate;
- original IDs/created_at/updated_at are unchanged;
- V1 reads/writes/summary and older deployment access are blocked before backfill.

---

# 56. Rollback Strategy

### Frozen rollback windows

**A — Before any V2 financial user/cron writes:** keep maintenance enforced; use the rehearsed compatibility rollback or verified backup to restore the V1 schema/data and deployment. Reconcile against frozen inventory before restoring V1 access/grants. Retain legacy columns; do not automatically delete newly created Auth identities. A return to public V1 is only valid if the restored dataset is still the original shared/demo-only baseline and no multi-user financial data is exposed.

**B — After any V2 financial user/cron writes:** keep authenticated V2 controls or maintenance in place; **forward-fix is preferred**. Never deploy an unguarded V1 backend or blindly restore the pre-cutover backup. Any point-in-time/data recovery requires a current snapshot, explicit reconciliation/replay of all post-cutover writes and operator approval of recovery/data-loss consequences. Schema rollback cannot erase new users/categories/transfers/occurrences. Record the write-enable checkpoint in the runbook.

---

# 57. Migration Implementation Boundary

This document is a frozen design, not executable migration SQL. No migration file/schema is created in T02. Future SQL must include all constraints, ownership/deletion rules, grants/revocations and timestamp-safe backfill above; use the existing privileged migration workflow and disposable rehearsal before production.

---

# 58. Data Integrity Test Matrix

Mandatory database-level tests should cover:

## Users / Profiles
- profile ownership;
- RESTRICT identity deletion and bootstrap recovery.

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
- access User A export if P1 is promoted; P0 verifies enhancement endpoints are absent.

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
- schema is compatible with future RLS hardening;
- durable occurrence retention and both rollback windows have explicit mandatory future test coverage.

---

# 61. Database Decisions Resolved in T02

All former blocking choices are final: unrestricted NUMERIC with scale/range checks; debt-positive credit cards; direct transaction.user_id; composite ownership FKs plus targeted category/link triggers; required durable recurring_occurrences; no P0 goal history; archive-only financial parents; transaction/transfer hard-delete; no core RLS; initial parameterized ILIKE search without extensions. Money (§38), lifecycle (§8), occurrence persistence (§20), FK deletion matrix (§44), migration/rollback (§§51–56) are normative. No implementation-blocking database decisions remain.

---

# 62. BMAD Next Step

Database planning remains frozen after T02. Next: code-first T03 design system/app shell and T04 P0 browser prototype using fixtures only. Database/API/Auth integration and migrations remain later tasks; none is performed by this documentation amendment.

---

# 63. T15 Ownership Enforcement Mechanics

Local stage E is prepared in `20261006171715_v2_ownership_constraints.sql`; production application remains T66. One transaction locks all nine core tables, runs explicit named/counting preflight queries, and then creates fully validated constraints/triggers. Straightforward immediate validation is appropriate for the rehearsed dataset and maintenance window; no NOT VALID constraints are left behind. Lock/statement timeouts fail closed. Preflight checks include all three transaction NULL fields, account/category/recurring ownership, transfer endpoints, occurrence definition/generated ownership, budget category kind/owner, goal account ownership, system/custom integrity, and unlocked accounts with posted activity. It never rejects history solely because a parent is archived.

Transaction ownership/account/category become NOT NULL. Composite account and optional recurring-definition FKs replace simple account/definition FKs. A transaction `(id,user_id)` unique key supports occurrence generated-link ownership. The occurrence composite FK uses `ON DELETE SET NULL (generated_transaction_id)` so deleting a generated transaction preserves the required owner, posted marker, and definition/date uniqueness. T32 still owns paired generated fields, definition/date identity, terminal transitions and reservation lifecycle.

Existing T11 transfer endpoint, recurring account, occurrence definition, and nullable goal linked-account composite keys are retained. Targeted invoker category triggers lock parents FOR SHARE and enforce system-or-same-owner plus income/expense/both compatibility, with expense/both only for budgets. Category owner/system flags and all row owners are immutable. System categories cannot be edited/deleted; referenced custom kinds cannot change. Accounts/categories archive rather than delete, and archive pauses active definitions in the same transaction. Account row locks serialize posting and opening-balance edits; first transaction/transfer permanently locks opening balance and card/asset semantics, including after deletion.

Legacy category text is retained untouched for existing rows but becomes nullable and loses the V1 fixed-category CHECK. New V2 transactions use category_id without fabricating legacy strings. Existing date, exact numeric, identifier/timestamp and ordering guarantees remain. The migration performs no financial UPDATE and does not restore suspended V1 DML. New functions have fixed pg_catalog search paths, explicit runtime EXECUTE, and no PUBLIC/anon/authenticated EXECUTE. Core RLS and browser schema access remain unchanged. Evidence and rollback boundaries are in [T15 verification](t15-verification.md).
