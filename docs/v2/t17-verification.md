# T17 — Build Account Backend

**Status: ✅ Completed locally on 2026-10-07 (Africa/Cairo).** No production migration, remote database/Auth access, deployment, V1 retirement, frontend integration, transaction V2 CRUD or T18 work occurred. Existing T11/T15 migrations, constraints and runtime grants are unchanged.

## Routes and contract

- GET /api/v2/accounts: active by default, explicit active/archived filter, created_at ASC/id ASC, data plus meta.count.
- POST /api/v2/accounts: strict name/type/openingBalance/currency, 201 and Location.
- GET /api/v2/accounts/:id: owned resource including archived accounts.
- PUT /api/v2/accounts/:id: full required name/type/openingBalance; currency/status/server fields rejected.
- POST /api/v2/accounts/:id/archive: empty JSON object, account plus meta.pausedRecurringCount.
- POST /api/v2/accounts/:id/restore: empty JSON object, restored account.

Unsupported resource DELETE returns 405 with Allow: GET, PUT. All endpoints retain no-store and the existing structured error envelope. All six endpoints were tested with missing/invalid tokens and sanitized 503 database-unavailable/500 unexpected errors. Create returns Location; unsupported DELETE Allow is asserted.

## Validation, money and mapping

Names trim to 1–100 Unicode code points, reject controls/lone surrogates and whitespace/format-only content. The existing `(user_id, lower(name))` index supplies per-user case-insensitive uniqueness, including archived names; duplicates map to safe 409 ACCOUNT_CONFLICT without constraint details. Identical names across users work. All six lowercase types are accepted.

Opening balance must be a plain signed decimal string, at most two decimals and ±999999999.99. Exponents, plus signs, whitespace, leading zeroes, excess precision and negative zero are rejected. Strings normalize to two decimals without Number/parseFloat/toFixed or rounding. Currency is explicit EGP on create and read-only on PUT. UUIDs, full bodies, owner injections, action bodies and strict status filters have boundary tests.

Typed resource projection maps only explicit public fields to camelCase, decimal strings, UTC createdAt/updatedAt and openingBalanceEditable. It never selects/returns userId. T17 uses one correct correlated NUMERIC expression for required currentBalance, scoped by account and owner across transactions/transfers. T18 owns generalized aggregation/net worth/optimization. Derived balances are not persisted or bounded by opening-input limits.

Credit cards remain debt-positive: 5000.00 means owed debt, -250.00 means credit, zero is zero. Purchases increase debt, income reduces it, payments into a card reduce debt and outgoing card transfers increase it. A posted purchase/refund/payment/cash-advance fixture verifies 5000.00 → 4915.00 → 4925.00 without cash-like inversion. All asset families retain their ordinary signs.

## Ownership and permanent locks

Routes pass only T09 verified req.auth.userId. Services use parameterized owner predicates on list, read, locks and mutations; caller owner fields are rejected. Real local ES256/JWKS middleware and actual expense_tracker_app PostgreSQL connections exercise both A→B and B→A. Foreign GET/PUT/archive/restore match nonexistent 404 NOT_FOUND responses after successful owned-route probes. Foreign attempts preserve the other owner's account rows/timestamps. Lists independently reconcile exact owned IDs/order/count for active and archived filters. Injection attempts compare complete financial snapshots.

PUT obtains SELECT FOR UPDATE before checking the T15 permanent opening_balance_locked flag. First transaction/transfer triggers lock the same account and permanently set the flag. Once locked, an unequal opening balance or credit_card↔asset conversion returns 409 ACCOUNT_CONFLICT. Equal opening balance, name edits and asset-to-asset switches remain allowed. Deleting posted activity never unlocks the account. No-op PUT preserves timestamps. No schema change or stale existence-only activity check was introduced.

## Archive, restore and transactionality

One checked-out PostgreSQL transaction locks the owned account, then associated definitions in deterministic ID order. The unchanged T15 account trigger atomically pauses active schedules and clears next_occurrence. The service skips pending/failed unposted reservations with processed_at and cleared failure_code; posted/skipped history is retained. Counts represent definitions newly paused. Already archived calls return count zero and preserve the account timestamp. Actual archive/restore update updatedAt and preserve createdAt.

Restore updates only account status and never resumes definitions. Already active restore preserves timestamps. Archived account metadata remains editable within the permanent locks. T15 rejects new financial activity against archived accounts; historical reads/balances remain available. Future domain services must retain these reference checks and take parent locks consistently before child mutations. Native integrity remains a final safety layer; conflicting lock orders can abort a PostgreSQL transaction rather than commit invalid state.

Two disposable fault injections compare complete pre/post financial snapshots: a recurring pause trigger failure and a reservation-skip CHECK failure after account/definition updates. Both return sanitized 500 and roll back account, schedule, occurrence and timestamp changes. Test-only fault objects are removed in finally blocks.

## Concurrency and isolation

Four races use independent actual PostgreSQL sessions and observe pg_stat_activity lock waits before releasing blockers:

1. First posting holds account lock; real HTTP opening edit waits, then returns 409 and preserves original opening balance.
2. Opening edit holds account lock; posting waits, then permanently locks the edited balance.
3. Archive holds account lock; active recurring creation waits, then fails against archived account.
4. Recurring creation holds account lock; real HTTP archive waits, then pauses the committed definition.

Final state contains no active definition linked to an archived account. These are database activity simulations, not new transaction/recurring APIs. The T16 runner now invokes account checks after its existing unchanged-state reconciliation. Its original 599 checks pass; 263 additional grouped account checks pass. Counts are helper check groups, not raw HTTP-request/assertion totals. Account lifecycle probes intentionally change disposable account/schedule state after the original reconciliation.

## Disposable verification and quality

Fresh password-free PostgreSQL 17.11 clusters under ignored `.tmp-v2-t17/`, IPv4 loopback port 55451 only. Existing guards refuse remote/credential/options/used-schema inputs; no .env or DATABASE_URL fallback. Account sequence: two V1 migrations → four T11 migrations → T12 reference seed → T15 constraints on empty financial tables → synthetic Auth identities → actual profile bootstrap and A/B owned fixtures → T16/account suite. No production identifiers or credentials are used. All clusters started for T17 were stopped.

- Final full backend suite on the fresh account cluster: 50 tests, 40 passed, 0 failed, 10 environment-gated groups skipped. T17 integration runs the full T16 verifier plus account checks (599 + 263).
- Dedicated T17 suite: 3 passed, no failures/skips on its fresh disposable run before final header assertions; the final full run verifies those additional assertions too.
- Separate fresh T15/T14 run: 2 tests passed, 207 integrity checks and 64 rehearsal checks, no failures/skips.
- Separate fresh T11 run: 339 checks passed.
- Pre-T15 baseline full backend suite with V1/T12/T13 integrations enabled: 50 tests, 45 passed, 0 failed, 5 gated groups skipped. Fresh-cluster gates ran separately; T14 ran inside T15, T16 inside T17.
- Backend lint, typecheck, production build, explicit runner/entrypoint ESLint and diff whitespace review passed. Build needed sandbox escalation to overwrite existing generated dist files. No frontend/shared frontend source changed.

V1 source/routes remain unchanged. Pre-enforcement V1 CRUD regressions pass. After T15, V1 list/single/summary reads remain compatible and old ownerless POST fails with a sanitized 500, as intended. T17 does not make legacy V1 access tenant-safe or retire it; production cutover remains a later gate.

## Files and rerun

Created src/types/account.ts, src/validators/account.ts, src/services/accounts.ts, src/routes/accounts.ts, tests/helpers/account-api.mjs and tests/v2-accounts.test.mjs under backend, plus this report. Updated backend/src/app.ts, backend/src/index.ts, backend/server.mjs, the T16 auth helper/runner, .gitignore, API design, implementation plan and T16 matrix. Earlier T16 workspace changes are preserved.

Build backend, explicitly set only T17_DISPOSABLE_DATABASE_URL to the guarded password-free local fixture, then run `node --test tests/v2-accounts.test.mjs` or `npm.cmd test`. Alternatively T16_DISPOSABLE_DATABASE_URL runs the same account extension through its existing suite/runner. Do not set both fresh-cluster gates against one database; each consumes an empty cluster. Use distinct pre-T15 and enforcement clusters for legacy write tests. Stop each cluster after verification.

No genuine blocker remains. Ready for **T18 — Build Account Balance Queries**, which has not been implemented.
