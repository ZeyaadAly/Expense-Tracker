# T15 — Prepare and Test Ownership Constraints

**Status: ✅ Completed locally, 2026-10-06 (Africa/Cairo).** T16 is next and has not started. No production/hosted schema, Auth data, deployment, V1 handler, application source, frontend, RLS, Accounts CRUD or production maintenance change was made in T15. Existing T11–T14 workspace changes were preserved.

## Migration and environment

Prepared `supabase/migrations/20261006171715_v2_ownership_constraints.sql`, created through Supabase CLI 2.119.0 `migration new`. It is a normal one-time versioned migration, separate from the four unchanged T11 additive files. No db push, remote SQL, migration-history apply or linked-project change was used. Portable PostgreSQL 17.11 ran only on loopback port 55451 in ignored `.tmp-v2-t15/` clusters. All clusters started for verification were stopped afterward.

The fresh verifier accepts only the fixed password-free local admin/database/port, refuses URL options and remote hosts, loads no .env and has no DATABASE_URL fallback. It calls the existing guarded T14 runner before applying T15: unchanged V1 migrations → original seed plus representative historical fixtures → T11 → T12 seed twice → synthetic owner/T13 profile → T14 backfill/reconciliation → T15. The private minimal auth.users fixture models FK prerequisites, not hosted Auth. Test identities are synthetic only.

The Supabase changelog markdown endpoint could not be rendered by the documentation tool, so its [breaking-change index](https://supabase.com/changelog?types=breaking-change) was checked instead. No new extensions or platform API dependencies were introduced. PostgreSQL's [constraint documentation](https://www.postgresql.org/docs/17/ddl-constraints.html) supports native composite references and column-selective SET NULL. No hosted advisors were run: verification used local catalog assertions and denied-privilege tests without contacting a project.

## Atomic preflight and validation

BEGIN, bounded lock/statement timeouts, and ACCESS EXCLUSIVE locks on all nine core tables cover preflight and DDL in one transaction. The migration contains the exact preflight queries. Each rule reports `T15_PREFLIGHT: <rule> has <count> invalid rows` and aborts before ALTER:

| Rule | Required clean state |
|---|---|
| transactions.null_user / null_account / null_category | Zero NULL references |
| transactions.account_owner | Existing same-owner account |
| transactions.category | Existing system or own compatible category |
| transactions.recurring_owner | Optional definition owned by same user |
| transfers.account_owner | Both endpoints owned by transfer user |
| recurring.account_owner / recurring.category | Own account, valid owner/kind category |
| occurrences.definition_owner / generated_owner | Own definition and own generated transaction when linked |
| budgets.category | System or own expense/both category |
| goals.account_owner | Nullable link; same-owner account when linked |
| categories.integrity | System iff unowned; custom iff owned; valid kind/status |
| accounts.activity_lock | Accounts with posted activity already permanently locked |

All 15 corruption cases were injected into separate disposable transactions. Existing guards were temporarily removed only within those fault transactions; rejection and rollback restored every original row, column/constraint and user trigger. A successful trial with archived historical account/category references also rolled back fully. An injected duplicate function caused failure after ALTER began; rollback restored schema and data. The final unmodified migration committed successfully with zero unvalidated constraints. Immediate validation was chosen for this small rehearsed copy and maintenance-only stage; NOT VALID/VALIDATE would add steps without reducing the required locked maintenance window.

## Constraints and lifecycle

Transactions now require user_id/account_id/category_id, with composite account ownership and optional recurring-definition ownership. Transactions gain UNIQUE(id,user_id). Occurrences replace the simple generated-transaction FK with `(generated_transaction_id,user_id)` → transactions `(id,user_id)`, clearing only generated_transaction_id on delete. Same-owner definition/date uniqueness and generated-link uniqueness remain. All eight native composite ownership FKs are validated, including existing T11 transfer endpoints, recurring account, occurrence definition and goal optional account keys.

Five new SECURITY INVOKER functions use fixed pg_catalog search paths and fully qualified domain tables. Explicit runtime EXECUTE is granted; PUBLIC/anon/authenticated EXECUTE is revoked. Owners are immutable on all nine core tables. System categories are immutable and cannot be deleted; custom owner/system flags cannot change, and referenced category kinds cannot change. Category use locks the parent FOR SHARE and validates system-or-own plus kind. Income accepts income/both, expense accepts expense/both, and budgets accept expense/both.

Per the explicit T15 task recommendation, category status is outside this DB ownership/kind check. Valid historical archived references pass migration and DB integrity checks. Future transaction/recurring/budget/category services must lock/check active status for new activity and historical corrections; no such endpoints are added here. The product rule remains active-only entry. Account active-use checks are also enforced in PostgreSQL. Archives preserve history and pause active recurring definitions in the same transaction; restores never auto-resume.

Account rows are locked before transaction/transfer posting, with both transfer accounts locked in UUID order. First posted activity permanently locks opening balance and card/asset semantics; deletion cannot unlock them. Account/custom-category hard deletion is rejected in favor of archive. Goal links remain nullable and historical archived links survive; assigning a new link requires an active owned account. T32 still owns full occurrence terminal state, generated pair/definition/date identity and reservation lifecycle; T15 does not implement a processor or schedule CRUD.

Legacy category text remains untouched on retained rows, becomes nullable and loses the fixed V1 category CHECK. New V2-shaped rows can omit it rather than fabricate a custom-category mapping. Exact unrestricted numeric bounds/scale, legacy transaction_date, timestamps, identifiers and ordering remain unchanged. Migration performs no financial UPDATE and does not restore suspended transaction DML.

## Direct DB and runtime matrix

Two synthetic users have profiles, accounts and custom categories. Tests run as expense_tracker_app using savepoint rejection and transaction rollback.

| Cases | Result |
|---|---|
| Cross-user transaction account/custom category, wrong income/expense kind | INSERT and UPDATE rejected |
| Transfer foreign source/destination | INSERT/UPDATE rejected; same-account, zero and excess-scale writes rejected |
| Recurring foreign account/category and incompatible kind | INSERT/UPDATE rejected |
| Occurrence foreign definition/generated transaction | INSERT/UPDATE rejected; duplicate definition/date rejected |
| Budget income-only/foreign category | INSERT/UPDATE rejected |
| Goal foreign linked account | INSERT/UPDATE rejected |
| Invalid system-owned/custom-unowned category, invalid kind/status | Rejected |
| Owner reassignment on every table; system edits/deletes; referenced kind changes | Rejected |
| System income/expense/both and own income/expense/both categories | Valid transactions inserted/read/updated/deleted |
| Own transfer/recurring/budget/linked goal/occurrence | Valid inserts; planned runtime updates/deletes succeed |
| Generated transaction hard delete | Posted marker/owner retained, only link cleared |
| Archived category integrity | Accepted by DB; service activity restriction explicitly documented |
| Account/category archive then restore | History retained; recurring paused; restore does not resume |
| First posting followed by deletion | Opening balance stays locked; unlock, balance change and card conversion rejected |
| Runtime DDL/TRUNCATE/trigger disable/schema ownership/role management/SET ROLE postgres | Permission denied |
| Occurrence hard delete by runtime | Permission denied; definition deletion blocked by occurrence FK |
| Browser roles/private schema and limited role attributes | No schema access or elevated runtime attributes; no RLS enabled |

Database integrity is not read authorization: the shared backend role can query all owners. Existing/future services must derive trusted user IDs and scope reads/mutations. T16 will expand endpoint-level isolation coverage; it was not implemented here.

## V1 compatibility and reconciliation

Only in the disposable probe, original runtime transaction grants were temporarily restored after enforcement. Unmodified V1 GET list, GET single and GET summary returned 200 and matching retained values. Old POST omitting the three ownership fields returned the existing sanitized 500; direct SQL proved native NOT NULL rejection (23502). No V1 backend change was made to satisfy it. Production must block all V1 financial access before backfill/constraints and permanently retire old handlers/deployments before restoring V2 DML. The probe grants were revoked again at the end.

| Synthetic retained metric | T14 | After T15 |
|---|---:|---:|
| Transaction count | 13 | 13 |
| Income | 1000001000.59 | 1000001000.59 |
| Expenses | 418.58 | 418.58 |
| Balance | 1000000582.01 | 1000000582.01 |
| Main Account balance | 1000000582.01 | 1000000582.01 |
| Minimum / maximum transaction | 0.01 / 999999999.99 | Same |

Ordered field snapshots and SHA-256 inventory digests matched within each run, including original descriptions, categories, amounts, calendar dates and microsecond created_at/updated_at. Every core table's complete row snapshot matched before/after application and after fixture rollback. UUIDs and live fixture timestamps vary between fresh runs, so digest equality is checked within a run rather than against a hardcoded value. These totals are test evidence, not production inventory.

## Verification results

- Dedicated `backend/tests/v2-ownership-constraints.test.mjs`: 2 passed, 0 failed, no skips; 207 T15 checks plus 64 existing T14 checks, 15 preflight fault cases.
- Separate fresh T11 verification: 339 checks, 0 failures.
- Backend lint, typecheck, production build and explicit verifier ESLint: passed. Build required sandbox escalation to overwrite existing generated dist files; no source change was needed.
- Separate pre-T15 backend regression cluster with real V1/category/profile integration enabled: 43 tests, 40 passed, 0 failed, 3 skipped fresh-cluster groups. T11 and T15 groups ran separately; T14 ran inside T15. V1-write regression cases intentionally run before enforcement.
- Security scan of T15 migration/report/changed documentation: no production owner UUID, database connection URI, credential/token/key or secret configuration added. Synthetic UUIDs exist only in verification code. No app source/frontend change occurred in T15.

Run the dedicated test on a **fresh** ignored portable cluster after backend build with only T15_DISPOSABLE_DATABASE_URL explicitly set to the approved local password-free cluster. It refuses an existing expense_tracker/auth schema or app/browser roles through the reused T14 guard. Then run `node --test tests/v2-ownership-constraints.test.mjs` from backend. Do not run it against a migrated production or ordinary development database.

## Rollback and production boundary

Before production application: do not apply stage E; prepared files change no hosted state. If application fails before commit, PostgreSQL rolls the entire stage back; both preflight and mid-DDL failures were demonstrated.

After committed stage E, before any V2 writes: a separately reviewed privileged maintenance rollback may reverse its triggers/keys/NOT NULL and restore V1 legacy checks after verifying inventory. No automated committed downgrade is shipped or promised. The T14 rollback helper must not be used directly after T15: its nullable backfill assumptions and exclusive legacy-trigger catalog guard no longer hold. Keep maintenance active and prefer forward-fix when uncertain.

After V2 writes: prefer forward-fix. New rows may have NULL legacy categories and V2 relationships, so restoring writable V1 or blindly restoring the old backup is unsafe. Retained legacy columns support reconciliation/offline recovery, not a public compatibility path.

Production application belongs to T66 after the remaining implementation/security/migration gates. No remote changes were made. No genuine T15 blockers remain. Next: T16 — Expand Multi-User Isolation Tests.

## T15 files

Created the ownership migration, `backend/scripts/verify-v2-ownership-constraints.mjs`, `backend/tests/v2-ownership-constraints.test.mjs`, and this report. Updated `.gitignore` for disposable artifacts, database design §8/§29/§63 for enforcement mechanics and the explicit category-status boundary, and implementation plan T15/checkpoint. Earlier workspace modifications remain intact.
