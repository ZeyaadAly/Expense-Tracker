# T39 — Authenticated Analytics API verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `75ea8b8c7b42602ff37895f6b9c1d4fa78bc0bd3`. T40 remains unstarted. Production-preview financial acceptance remains intentionally deferred.

## Route and response contract

The sole route is `GET /api/v2/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&accountId=UUID]`. No split endpoints or preset parameter were added. It returns `{data: overview}` using T38's service output directly:

- `period`: from, to, Africa/Cairo timezone and inclusive calendarDays;
- `summary`: income, expenses, netSavings, savingsRatePercent, averageDailyExpense;
- `incomeVsExpenses`: chronological monthly, clipped, zero-filled income/expense/savings rows;
- `expenseByCategory` / `incomeByCategory`: ID, name, amount and percentage, including archived history;
- `accountActivity`: ID, name, type, income, expenses, savings and separate incoming/outgoing transfers;
- `recurring`: income, expenses, netCashFlow, projected_occurrences basis and resolved dates.

All financial fields preserve exact two-decimal strings and nullable percentage semantics. T38 owns PostgreSQL NUMERIC arithmetic/rounding, date bucketing, shared T36 totals and T30 occurrence counting. Routes perform no financial calculations or recurrence enumeration. Actual generated transactions count historically; projections remain separate. Transfers never enter income/expense/category totals. Archived history remains visible, and deleted transactions no longer contribute.

## Authentication, validation and errors

T09 ES256/JWKS middleware establishes `req.auth.userId`; no query/body/metadata owner can select identity. The existing verification uses issuer, audience, expiry and authenticated role; no provider configuration or Auth implementation changed. Supabase's [JWT documentation](https://supabase.com/docs/guides/auth/jwts) was checked for the existing issuer/subject/JWKS boundary; the Markdown changelog fetch was unsupported, and no new Supabase feature was introduced.

Only required scalar from/to and optional accountId are accepted. Unknown/repeated keys, owner injection, bracketed keys, invalid/impossible dates, reversed ranges, dates outside 1900–9999, ranges over 366 inclusive days and malformed UUIDs return structured 400 VALIDATION_ERROR before connection checkout. Valid uppercase UUIDs normalize to lowercase. Explicit future ranges are allowed; no UTC-derived today/preset logic was added. T36's existing Cairo presets remain authoritative for dashboard comparisons.

Missing/invalid credentials return 401 AUTH_REQUIRED/AUTH_INVALID. Invisible accounts return identical safe 404 NOT_FOUND. DB unavailability returns sanitized 503 DATABASE_UNAVAILABLE; unexpected errors return sanitized 500 INTERNAL_ERROR. The centralized error envelope is unchanged. Unsupported methods return 405 with Allow: GET after existing transport-policy validation; OPTIONS keeps existing CORS preflight behavior. Existing GET-body and media-type policy remains in force. Every API response uses no-store; exact-origin CORS is unchanged.

## Verification evidence

Backend lint, typecheck and build passed. General backend suite: **120 tests, 96 passed, 24 explicitly gated skips, zero failures**. Three dedicated T39 unit/real HTTP groups passed: query contract, real local ES256/JWKS authentication and sanitized failures, and deferred production gate behavior.

The T38 fixture matrix was reused through an optional signed HTTP adapter rather than copying calculations or fixtures. Its final direct and HTTP modes each passed **77 grouped checks**, three tests each, on separate freshly reset synthetic databases. Coverage includes exact 0.10 + 0.20, large totals, negative savings, zero income/null rate, rounding ties, empty arrays/zero months, archived/custom/system categories, account filtering, foreign/missing account 404, transfers, generated posting/deletion, active/paused/archived/end-bounded forecasts and daily/weekly/month-end/yearly leap anchoring. A's nonzero recurring forecast and B's zero forecast are separately asserted. SQL independently sums returned series and both category breakdowns back to summary values without JavaScript money arithmetic.

All five dashboard periods reconcile Analytics and Dashboard totals through HTTP. Tests also compare both HTTP endpoints immediately before/after Cairo midnight with a controlled dashboard clock. Leap-day and year-rollover ranges pass through the Analytics API. The service's snapshot consistency/read-only checks remain exercised directly; those low-level transaction assertions are not claimed as HTTP transport tests.

Dedicated disposable regressions passed: T36 **214 checks**; T31 **403 checks**, 12 races and 12 fault probes; T32 **103 checks**; T29 **357 checks**, 10 races and 11 faults. T18/shared passed with T16 599, T17 263, balances 285, transactions 244, search 263, filters 3263, pagination 6065, transfers 917 and recurring isolation 31. The shared Analytics isolation helper now additionally compares full real A/B API responses to scoped service results, **14 checks**, zero failures. Auth tokens include misleading user metadata to verify it does not determine ownership.

## Performance

The reused disposable scale contains **30,023 transactions, 2,001 transfers and two generated transactions**, multiple owners/accounts/categories. Eight warm local signed HTTP overview calls: **54.47–90.90 ms**, median **72.96 ms**. Direct service comparison median: **50.38 ms**. The approximately 22.58 ms difference includes loopback transport, test token signing, JWT verification and JSON serialization; these sequential local samples are descriptive, not an isolated overhead benchmark or hosted SLA. No speculative optimization, index or migration was added. [Compact performance evidence](assets/t39/performance.json); full synthetic plans remain ignored locally.

## Production gate and cleanup

The reusable app only registers Analytics when supplied its service. Development `src/index.ts` supplies it outside NODE_ENV=production; the Vercel root `server.mjs` deliberately supplies none. Tests verify an unregistered production-shaped app returns no-store 404 with or without an Authorization header, and assert the Vercel entry stays unwired. Existing frontend financial 404 gate and empty cron configuration are unchanged. No frontend source changed.

No production credentials, database, retained restore, environment configuration, deployment command or hosted acceptance workflow was used. Main's existing Git integration may build the push; no new public Analytics capability is enabled. Manual hosted Auth remains user-reported passed; remaining hosted financial acceptance stays partial/deferred. The newly initialized synthetic-only T39 PostgreSQL server is stopped after verification; ignored artifacts are retained locally.

## Changes and next task

Added `src/routes/analytics.ts`, `src/validators/analytics.ts`, `tests/analytics-api.test.mjs`, this report and compact performance evidence. Updated app/local entry composition, the test Auth harness, reusable T38 fixture transport adapter, shared isolation helper/runner, ignored-artifact rule, README, API design, implementation plan and production-preview checkpoint. No schema, dependency, frontend or Vercel configuration changes.

No known T39 blocker remains. Next: **T40 — Build Analytics Page** (period selector, charts, accessible data alternatives, loading/empty/error states and responsive layouts). Do not implement it automatically or resume the deferred release.
