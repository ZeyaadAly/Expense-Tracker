# T42 — Monthly Budget backend verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `f4b9a8807097c7f27a472f9775bbcebf51c66478`. T35/T41 remain optional/deferred. T43 is next and remains unstarted. Hosted production-preview financial acceptance stays intentionally deferred.

## Frozen model and endpoints

Budgets use existing separate numeric **year/month** fields, not a YYYY-MM string. They are monthly category spending limits, not transaction authorization. The resource is exactly id, categoryId, categoryName, amount, spent, remaining, percentUsed, year, month, alertThresholdPercent, status, createdAt and updatedAt; no internal userId or invented currency field is exposed.

| Method | Route | Result |
| --- | --- | --- |
| GET | /api/v2/budgets | `{data:[],meta:{count}}`, with authoritative progress |
| POST | /api/v2/budgets | 201 `{data:Budget}` and Location |
| GET | /api/v2/budgets/:id | 200 `{data:Budget}` |
| PUT | /api/v2/budgets/:id | 200 `{data:Budget}` |
| DELETE | /api/v2/budgets/:id | Hard delete, empty 204; transactions retained |

POST accepts categoryId, amount, year, month and optional alertThresholdPercent (default90). Full PUT accepts **only amount and alertThresholdPercent**; category/year/month are immutable, following the frozen API rather than the prompt's illustrative alternative. Existing archived-category budgets can still be edited. No-op updates preserve timestamps; real updates preserve id/createdAt and refresh updatedAt.

## Authentication, validation and privacy

All five endpoints require existing T09 ES256/JWKS authentication and take identity only from req.auth.userId. Unknown/owner-injection fields, immutable PUT fields, malformed UUIDs, numeric money, nonpositive/out-of-bound/overprecision amounts, invalid integer year/month/threshold and repeated/unknown queries return structured400 before SQL. Amount is a decimal string from0.01 to999999999.99; threshold is integer1–100, year1900–9999 and month1–12. Query year is canonical four-digit text and month integer text1–12. Year/month must be supplied together; omitting both resolves the current Cairo month. Explicit past/future months, including9999-12, are supported. No query preset, search or pagination was invented.

Creation requires a visible active system/owned category of expense/both kind. Invisible IDs give identical404, archived409 CATEGORY_ARCHIVED, income-only400. Category status/kind validation holds a SHARE lock through commit. Reads retain archived historical categories. An optional invisible category filter gives safe404; visible categories without budgets give an empty list. Foreign/missing budget GET/PUT/DELETE give identical404 NOT_FOUND. Lists and progress SQL always scope ownership; misleading token metadata never selects the owner.

Existing V2 error/envelope/no-store/exact-origin CORS conventions are reused. Collection Allow is GET, POST; resource Allow is GET, PUT, DELETE, following existing transport-policy validation and OPTIONS preflight. DB unavailability returns sanitized503 and unexpected failures sanitized500; no SQL, constraint name, stack or secret is sent. Database uniqueness violations for the existing user/category/year/month constraint become sanitized409 CONFLICT.

## Authoritative progress and dates

List and single use the same parameterized SQL statement/mapper. Selected owned budgets join visible category names, then grouped spending sums only owned **expense** transactions in each category between calendar month start inclusive and next month start exclusive. This includes leap-day/month-end and all accounts, including archived history. Income (including the same both category), transfers, definitions/projections and deleted transactions do not contribute. Generated recurring expenses contribute only after actual posting. No mutable spent column/cache or frontend calculation is added.

PostgreSQL NUMERIC calculates spent, amount−spent remaining and round(spent×100/amount,2) percentUsed. Remaining may be negative and percentage unbounded. Required resource status uses exact comparisons before display rounding: zero spend normal; spent>amount exceeded; otherwise spent×100>=threshold×amount near_limit, including exactly100%; otherwise normal. This required frozen response field is implemented within T42; it does not mark the separate T43 task complete or start its workflow.

One grouped aggregate statement serves any number of listed budgets; there is no per-budget spending query. Optional category visibility adds one constant lookup. Each progress statement has a single PostgreSQL snapshot. Mutations use explicit transactions, owned budget FOR UPDATE locks, category SHARE validation and the existing unique constraint. Rollback failure discards the client; no mutation retry is introduced.

## Dedicated integration evidence

Fresh PostgreSQL17.11 synthetic-only cluster at 127.0.0.1:55451/postgres in ignored `.tmp-v2-t42/pgdata`, migrations through T32, real local ES256/JWKS HTTP, limited expense_tracker_app runtime. Reset guards assert this exact new directory. No production URL, credentials, retained restore, remote migration or seed was used.

The four T42 test groups passed, including **194 grouped integration checks**:

- CRUD/list-single equality, exact resource keys, timestamps/no-op behavior, default threshold/current Cairo month, historical/future periods and delete preserving transactions;
- 0.10+0.20, zero spend, large totals1999999999.98, negative remaining and percent200.00; a positive rounding tie0.125% becomes0.13;
- exact90% below/at/above, exactly100%, and just-exceeded values that display100.00 but still classify exceeded; zero normal and configured thresholds;
- transaction create, amount edit, category move, month move and deletion immediately reconcile old/new budget progress;
- real T31 generated expense posting/repeated processing/deletion and durable posted marker preservation;
- transfer/income exclusion, both-category behavior, first/last-day/leap boundaries and out-of-month exclusions;
- archived category remains readable/editable while new creation is denied; stale/invisible category privacy and immutable PUT rejection;
- real A/B list/resource/creation privacy, same system category independently budgeted by B and exact owner-scoped spending;
- **10 concurrency groups:** duplicate create (one201/one409, one row), four competing update pairs, four update/delete pairs, and a forced category archive/create lock race detected through pg_stat_activity;
- uncommitted and rolled-back expense visibility; **three injected post-write failures** roll back create/update/delete and preserve original resources/counts/timestamps; sanitized errors and a separate broken-rollback discard unit probe;
- limited-role CRUD/progress succeeds while TRUNCATE/DDL fails.

The shared T16 runner now adds **15 real Budget API isolation checks** for A CRUD and B list/get/update/delete/category denial, with foreign/missing response equality. No frontend test is claimed or needed: frontend source is unchanged.

## Quality and regressions

Backend lint/typecheck/build pass. General suite: **124 tests, 99 passed, 25 explicitly database-gated skips, zero failures**. Dedicated disposable matrix separately passed T42 (four tests), T38 direct/T39 HTTP (three tests each,77 grouped checks each), T36 (four tests,214 checks), T31 (three tests,403 checks/12 races/12 fault probes), T32 (two tests,103 checks), T29 (three tests,357 checks/10 races/11 faults), and T18/shared (three tests).

Shared regression counts: T16 599, accounts263, balances285, transactions244, search263, filters3263, pagination6065, transfers917, recurring isolation31, Analytics isolation14 and Budget isolation15; zero failures. The general suite also runs the three T39 authentication/validation/production-boundary groups. Secret/artifact scan and git diff --check pass.

## Performance and schema decision

Synthetic scale: **30,012 transactions,777 budgets**,32 scale categories across two owners and24 months, plus focused history/generated fixtures. Eight warm authenticated loopback list requests: **7.95–41.12 ms, median27.38 ms**. Central EXPLAIN ANALYZE execution **7.963 ms**, planning **2.887 ms**. Local measurements are descriptive, not hosted SLA. Existing transactions_user_category_date_idx participates in the plan; the budget uniqueness/period indexes and T15 integrity/timestamp machinery suffice. **Zero migrations, indexes or privilege changes.** [Compact performance evidence](assets/t42/performance.json); full synthetic plan stays ignored locally.

## Production and task boundaries

The reusable app only registers Budgets when supplied a service. Local entry supplies it outside NODE_ENV=production; Vercel root server.mjs deliberately does not. Production-shaped unregistered app returns no-store404, and source gate tests pass. Existing frontend financial gate, unregistered hosted Analytics and disabled cron are unchanged. No manual deployment or production-preview acceptance resumed; main's existing Git integration may build the push without enabling this API. V1, transaction/recurring/Analytics service calculations and frontend fixtures/UI are unchanged.

The new disposable PostgreSQL cluster is stopped after verification. Synthetic artifacts remain ignored. No production cleanup is necessary.

## File inventory and next task

Added budget type, validator, service/query and route modules; dedicated Budget tests; shared Budget isolation helper; compact evidence and this report. Updated app/local entry composition, synthetic Auth harness/isolation runner, ignore rule, README, database/API design and implementation-plan checkpoints. No dependency, schema, frontend or Vercel configuration changes.

No known T42 blocker remains. Exact next task: **T43 — Add Budget Status Logic**, unstarted. T41 stays optional/deferred; T44 owns Budget frontend integration. Do not start either automatically or reopen the deferred production-preview release.
