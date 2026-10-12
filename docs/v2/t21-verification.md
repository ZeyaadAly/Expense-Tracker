# T21 — Transaction backend verification

Completed locally on 2026-10-08. No remote database, deployment, migration, seed or financial backfill was performed. T22 is ready and unstarted. Existing uncommitted T20 work is preserved.

## Endpoints and ownership

Authenticated GET/POST `/api/v2/transactions` and GET/PUT/DELETE `/api/v2/transactions/:id` are wired through the existing verified JWT middleware. Ownership comes only from req.auth.userId; every transaction predicate is owner-scoped and public mapping omits userId. Foreign and missing transactions return indistinguishable 404 responses. Foreign account/category selection also matches missing references. POST returns 201 plus Location, PUT/GET return 200, DELETE returns empty 204. Basic lists return `{data,meta:{count}}`, ordered date DESC, createdAt DESC, id DESC, with all query parameters rejected.

## Validation and history

POST/PUT require exactly accountId, categoryId, type, amount, description and date. UUID references, income/expense, exact positive decimal-string amount 0.01–999999999.99, trimmed description 1–200 Unicode code points and valid calendar date 1900-01-01 through Cairo today are enforced before SQL. Metadata, ownership and unknown fields are rejected. Resulting account must be owned/active; category must be system or owned, active and compatible. This applies to unchanged references too; restore archived parents before editing. Historical archived rows remain readable and deletable; moving a row to active compatible references is allowed.

PUT preserves ID, createdAt, ownership, raw legacy category and recurring identity. Generated financial fields can change while recurringTransactionId/recurringOccurrenceDate remain immutable. Hard deletion preserves the posted occurrence and its owner/date/status/timestamps, clearing only generated_transaction_id through the existing SET NULL FK. The durable marker cannot be replayed by deleting its transaction; no recurrence processor is introduced.

## Exact balances and atomicity

Mutations use explicit database transactions. Account FOR UPDATE and category FOR SHARE locks serialize validation with archive/status changes; the existing T15 trigger permanently locks opening balances on first activity. No duplicate balance-writing logic or schema change was added. Existing T18 NUMERIC-derived balances reflect create, amount/type/account edits and deletion atomically. Tests cover asset income/expenses, debt-positive card purchases/refunds, negative debt from overpayment and movement between accounts. Failed writes leave rows, balances, lock flags and generated markers unchanged.

## Legacy compatibility and production boundary

New V2 writes leave nullable legacy category text NULL. A read-only projection maps stable system category IDs to V1 keys and custom categories to Other; original raw text remains untouched. V1 reads, filters and summary work across migrated and new rows. The adapter also supports the original pre-additive schema via to_jsonb row access. V1 mutation SQL and compatibility are unchanged as explicitly requested; an ownerless V1 POST still fails T15 constraints. This is not a claim that all V1 mutations are disabled or legacy routes are authenticated. Public V1 handlers must be retired during production maintenance before hosted multi-user financial writes, as required by the frozen cutover contract.

## Verification

- Backend lint, typecheck, production build and explicit ESLint of server.mjs and the expanded verifier passed.
- Full suite with T21_DISPOSABLE_DATABASE_URL: **58 tests, 46 passed, zero failed, 12 environment-gated skips**. All five T21 tests ran, including strict validation, Cairo midnight, explicit mapping, real JWT/error envelopes and fresh integration.
- Fresh real PostgreSQL integration passed **244 T21 checks**, **four transaction concurrency races**, and **three post-write rollback faults**, plus **599 T16 isolation**, **263 T17 account**, and **285 T18/T19/T20 balance/summary** checks. Query-plan regression retains 5,000 synthetic transactions and 2,000 transfers; all four transfer direction combinations pass.
- Races cover archive winning before posting, posting winning before archive, concurrent edit/delete and category archive blocking both create/update. Faults occur after real INSERT, UPDATE and DELETE, proving rollback rather than only pre-write rejection.
- Tied timestamp/date ordering uses one multi-row INSERT; the existing immutable-createdAt trigger remains intact. A/B ownership is exercised through actual JWT middleware and runtime-role SQL.
- No frontend source changed for T21; the earlier T20 frontend/browser evidence remains separate. No dependency or lockfile changed.

Only an ignored workspace copy of the synthetic T11 PostgreSQL cluster was used at loopback 127.0.0.1:55451. Windows Application Control prevents fresh initdb loading dict_snowball.dll, so the existing test-only cluster was copied, its exact data_directory verified, and only the copy reset to an empty template0 database. Original clusters were unchanged. Guarded setup applied the two V1, four T11 and one T15 migrations plus local reference fixtures and eight synthetic Auth identities. Reported financialTotals are the frozen pre-lifecycle reconciliation baseline, not final test totals. The copied cluster was stopped after verification.

Reproduce on a fresh isolated password-free loopback cluster: build backend, set T21_DISPOSABLE_DATABASE_URL explicitly, run `npm --prefix backend test`. The fixture refuses initialized/remote databases. Do not point it at normal development or production data. Standalone `backend/scripts/verify-v2-isolation.mjs` also invokes the expanded domain checks.

## T21 file inventory

Created:

- backend/src/types/v2-transaction.ts
- backend/src/validators/v2-transaction.ts
- backend/src/utils/v2-transaction-mapper.ts
- backend/src/services/v2-transactions.ts
- backend/src/routes/v2-transactions.ts
- backend/tests/v2-transactions.test.mjs
- backend/tests/helpers/v2-transactions.mjs
- docs/v2/t21-verification.md

Updated:

- backend/src/app.ts, src/index.ts, server.mjs — authenticated route wiring
- backend/src/validators/transaction.ts — shared exact-positive-money syntax, unchanged V1 validation
- backend/src/services/transactions.ts — read-only legacy category projection/filtering
- backend/tests/filtering.test.mjs — projection-aware parameterization assertion
- backend/tests/helpers/v2-isolation.mjs — production CRUD harness and empty-204 parsing
- backend/scripts/verify-v2-isolation.mjs — domain extension and actual synthetic-user count
- docs/v2/05-database-design.md, 06-api-design.md, 07-implementation-plan.md, t16-verification.md — staged contract, compatibility boundary and checkpoint
- .gitignore — disposable T21 data

No task blocker remains. Deferred: T22 search, T23 filters, T24 cursors, T25 frontend integration, T26 transfers, recurrence processing and production cutover. No approved visual design changed.
