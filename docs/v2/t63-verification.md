# T63 — Performance Review

**Status: Completed locally, 2026-10-17 (Africa/Cairo).** Starting clean, fetched/fast-forward synchronized main: `23681b1b89aab46472f58e94d8e33c7cefef7811`. Final commit and origin synchronization are reported with delivery. No feature work, deferred P1 work, product optimization, migration, index, dependency or configuration change is included.

## Environment and reproducibility

Windows 10.0.26200, AMD Ryzen 7 5800H with Radeon Graphics, 16 logical CPUs, 13.86 GiB RAM; Node v26.5.0; PostgreSQL 17.11; Next 16.3.8/React 19.2.8; Edge/Chromium 155.0.4283.45. Built backend services run against a newly initialized UTF-8, locale C, password-free PostgreSQL cluster at `.tmp-v2-t63/pgdata`, listening only at 127.0.0.1:55451/postgres. Admin is used only for fixture/setup/ANALYZE/observation. All application SQL uses expense_tracker_app. This local transport has no TLS; production CA/TLS behavior is unchanged and is not benchmarked.

Every ordinary backend operation has two warmups and nine measured iterations; runtime checks have two warmups and 15 iterations, JWT warm verification 100. Raw evidence includes median, p95 and max. Plans use five runtime-role EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) samples of captured production SQL and parameters after warm application calls. Counts include driver statements/BEGIN/COMMIT/reference checks, not SQL executed inside integrity triggers. Timings are machine-local observations, not production SLAs. Loopback HTTP frequently clusters near 15–16 ms; do not subtract a one-off HTTP number from a service median to claim precise middleware overhead.

Frontend optimized build is measured and served normally on local port 3001. Financial pages remain intentional production 404s; the connected financial UI runs in development on port 3000. These are different modes and are never presented as comparable production financial timings. Dev compilation warmups are recorded separately. Five repeated desktop navigations, three mobile reloads, three normal-route loads and repeated interactions are recorded. Main navigation waits for page/data work and two animation frames rather than treating network-idle alone as a usability metric. Supplemental interaction timings include an explicit settling wait and network-idle and are conservative approximations, not Core Web Vitals or React Profiler measurements.

Read/review scope includes README, product brief/PRD/architecture/database/API/implementation plan and T18/T22/T24/T27/T31/T36/T38/T42/T45/T48/T57/T58/T60/T61/T62 reports, query/repository/service/middleware/processor layers, indexes, API clients, session-bound stores and connected page/component imports.

### Datasets

| Owner fixture | Accounts | Transactions | Transfers | Recurring definitions | Budgets in October | Custom categories | Goals |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal | 6 | 1200 | 80 | 24 | 12 | 12 | 8 |
| stress | 32 | 32000 | 2200 | 1200 | 720 | 1000 | 2200 |

Dates span 730 days of transactions and 365 days of transfers. Amounts are exact numeric decimals, descriptions include ordinary groceries, rare terms, accented/Arabic text; monthly schedules, multiple account types and linked manual goals are present. There are nine shared system categories. The separate processor fixture adds 40 owners/2,000 definitions (1,200 due/800 future), then new identities for two repeated 1,200-post workloads. The separate backlog has 31 definitions × 101 dates = 3,131 occurrences. Browser normal-route baselines precede their local mutations; created goals/categories/schedules are subsequently archived, transaction/transfer/budget probes removed. Normal and stress are separate owners on the same database; shared planner/cache context is explicit.

Reproduce with fresh initdb (UTF8/locale C), then pg_ctl start with `-h 127.0.0.1 -p 55451`. Set `T63_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres` and run `node backend/scripts/verify-t63-performance.mjs` from repository root after backend build. It refuses an already populated database and verifies the resolved data directory. Run `node backend/scripts/verify-t63-runtime.mjs` against that seeded cluster. For restart observations, restart this exact local cluster from the outer shell and measure a fresh limited-role process connection/role query after each restart; three observations are retained. Persistent-pool outage recovery latency is not certified by this fresh-process probe. Windows nested process/job and shared-memory cleanup made the initial in-process restart approach unsuitable; no product behavior was altered to accommodate it.

Run `node backend/scripts/t63-browser-api.mjs`, with the same local URL, and start the dev frontend with fictional Supabase URL `https://t37-fixture.supabase.co`, publishable placeholder `sb_publishable_t37_fixture_only` and API base `http://127.0.0.1:4000/api/v1`. The companion uses real signed ES256 requests, synthetic provider identity and the real built services/limited-role DB. Run `frontend/scripts/verify-t63.mjs` and `verify-t63-interactions.mjs` with `T63_PLAYWRIGHT_PATH`, `T63_AXE_PATH` and optional `T63_BROWSER_EXE`. This run used the existing ignored T62 Playwright 1.64.1/axe 4.14.0 tools. Run `verify-t63-bundles.mjs` after the optimized frontend build. Temporary tools, keys, sessions, clusters and logs are ignored; only sanitized evidence is committed. Fixed fixture months/reference dates must be adapted together for a different acceptance date.

## Backend API overview and payloads

| Operation | Normal HTTP median ms | Stress HTTP median / p95 ms | Stress statements | Stress JSON bytes |
| --- | --- | --- | --- | --- |
| profile | 14.76 | 14.59 / 15.84 | 1–1 | 221 |
| bootstrap | 15.60 | 15.50 / 16.07 | 2–2 | 221 |
| categories | 15.01 | 15.40 / 16.57 | 1–1 | 143170 |
| categories/expense | 13.99 | 15.45 / 22.31 | 1–1 | 142758 |
| accounts | 13.58 | 30.92 / 32.62 | 1–1 | 8975 |
| account-detail | 15.01 | 15.54 / 16.78 | 1–1 | 285 |
| account-summary | 15.65 | 30.86 / 34.63 | 1–1 | 54 |
| transactions/25 | 15.33 | 15.69 / 16.41 | 1–1 | 12097 |
| transactions/100 | 15.13 | 15.68 / 17.16 | 1–1 | 46810 |
| transfers | 15.33 | 14.65 / 16.34 | 1–1 | 10468 |
| transfers/account | 15.68 | 15.09 / 16.38 | 2–2 | 10440 |
| transfers/date | 15.17 | 15.41 / 16.36 | 1–1 | 10468 |
| recurring | 14.39 | 33.18 / 42.62 | 1–1 | 603265 |
| recurring/filtered | 15.92 | 15.00 / 15.84 | 1–1 | 18604 |
| recurring/upcoming | 15.17 | 30.98 / 37.61 | 6–6 | 256616 |
| budgets | 15.29 | 31.23 / 45.80 | 1–1 | 251859 |
| goals | 15.26 | 31.14 / 34.97 | 1–1 | 735925 |
| profile PUT | 15.71 | 14.92 / 16.17 | 1–1 | 236 |

[Raw measurements and SQL plans](assets/t63/backend.json), [runtime/Auth/mutations](assets/t63/runtime.json), [browser waterfalls/rendering](assets/t63/frontend.json), [normal interactions/session/axe/production](assets/t63/interactions.json), [optimized chunks/manifests](assets/t63/bundles.json), [fresh regression/quality](assets/t63/quality.json) and [credential scan](assets/t63/secret-scan.json) provide the reproducible evidence.

The 25/100-row transaction responses are about 12/47 kB at stress scale. Dashboard remains about 13 kB and one-year Analytics about 131 kB. Large unpaginated stress payloads are deliberate watch items: recurring about 603 kB, goals 736 kB, budgets 252 kB, categories 143 kB. Normal payloads remain small. Exact money strings and explicit safe public projections remain intact; no speculative serialization/memoization/compression change was made.

### Startup, health, Auth and mutations

Built-app import median 152.26 ms; fresh Node import subprocess wall median 218.26 ms, seven processes. This measures built app/module startup without the production entry's environment/TLS configuration, not a hosted serverless cold start. Fresh pool connection and warm DB-backed HTTP health are listed below. Outer-shell restart median 372.15 ms; subsequent fresh-process connection/role-query median 50.05 ms across three restarts.

| Measurement | Median / p95 ms | Iterations |
| --- | --- | --- |
| fresh runtime pool connect and role query | 33.07 / 34.62 | 15 |
| warm health HTTP with actual limited-role DB query | 15.45 / 16.70 | 15 |
| cold local JWKS + JWT verification | 15.35 / 16.80 | 15 |
| warm local JWKS JWT verification | 0.19 / 0.24 | 100 |
| 1000 cursor HMAC encode/decode pairs | 82.46 / 98.11 | 15 |
| transactions signed POST plus cleanup DELETE | 30.93 / 32.51 | 15 |
| transactions signed PUT | 15.89 / 16.90 | 15 |
| transactions signed DELETE | 15.45 / 17.91 | 15 |
| transfers signed POST plus cleanup DELETE | 30.68 / 32.71 | 15 |
| transfers signed PUT | 15.31 / 16.42 | 15 |
| transfers signed DELETE | 15.59 / 17.04 | 15 |
| transactions isolated signed POST | 17.92 / 19.06 | 15 |
| transfers isolated signed POST | 16.99 / 18.68 | 15 |

Cold JWKS is a new resolver against a local synthetic JWKS server, with genuine ES256/issuer/audience/claim verification; no hosted-provider RTT is inferred. Warm JWT cost is negligible at this scale. HMAC values above time 1,000 encode/decode pairs together; signatures and exact validation remain unchanged. Isolated POST rows time only POST, with cleanup outside the sample; the older POST-plus-cleanup samples remain in raw evidence and are not reported as POST-only latency. PUT alternates values; DELETE uses distinct pre-created rows. All mutation tests traverse validation, verified HTTP identity, locks, DB writes and public response mapping.

## Accounts and balances

One grouped production balance statement remains independent of account count. Stress list repository median 15.09 ms. Actual list plan, row/loop/buffer details and existing index definitions are retained in backend evidence. Both all-account financial position and account list calculate derived balances from history; Dashboard deliberately executes them in one REPEATABLE READ snapshot. This duplicates aggregate work (roughly two balance queries), but normal Dashboard service is under 12 ms and stress is about 50 ms. No material personal-scale issue justifies changing the API or introducing mutable balances. Detail scopes one account; separate summary/list calls duplicate work in Accounts UI and are classified watch, not silently collapsed. Goal linked accounts are reference-only: the frozen goal projection is one query, and account-name choices load separately; there is no automatic-savings join or N+1.

## Transactions, search, filters and cursors

| Search | Stress service median / p95 ms |
| --- | --- |
| groceries | 1.19 / 1.28 |
| RareNeedle | 29.80 / 31.53 |
| no-match-zzzz | 29.43 / 30.00 |
| العربية | 30.03 / 30.82 |
| Account 1 | 1.34 / 1.62 |
| Category 1 | 1.66 / 2.57 |

Common/account/category terms can hit the ordered Limit early. Rare/no-match/Unicode searches scan more owned candidate rows with literal ILIKE predicates and safe reference joins. T22's 18.299/28.188 ms single samples were on roughly 10k owned rows before pagination; T63 uses 32k owned rows and bounded results with repeated medians. The roughly 30 ms rare/no-match scans are acceptable locally; no trigram/full-text index is justified. Owner predicates and literal escaping are preserved. Plans show index/bitmap or sequential choices according to selectivity; scan type alone is not a security/performance failure.

Account, category, date, type, generated-recurring and combined search/account/type/date filters are measured. Base/search/type/date/recurring queries have one driver statement; account/category filters add one bounded visibility check each. No query count grows with returned row count. First, middle (page 160) and deep (page 319) stress cursors use genuine signed continuations discovered by traversing the API service, never OFFSET. Their service medians are 2.01 / 2.04 / 1.99 ms; signed HTTP medians 15.17 / 15.65 / 14.80 ms. Plans retain ordered seek/early LIMIT. No rewrite or weaker cursor binding/signature was made.

## Transfers and locking

Unfiltered/account/date list timings are above, including account visibility precheck. PUT/DELETE use the existing child lock plus sorted old/new account union; create uses sorted parent locks. Eight contending workers perform 80 create/update/delete cycles, 240 mutations, in 692.14 ms; cycle median/p95 56.30 / 96.13 ms. Zero errors and zero deadlock-counter increase; exact original 32,000 transaction/2,200 transfer stress counts remain after cleanup. Moderate mixed-user load below separately records observed lock waiters. This is workload evidence, not proof of every possible lock interleaving. T27 ordering/correctness remains unchanged.

## Recurring list, projection, processor and backlog

Stress list/filter/upcoming request counts remain bounded. Upcoming uses three reads (date range, definitions, terminal markers), then bounded calendar projection/sort; no per-definition DB query. The forecast component uses three queries regardless of schedule count. Monthly recurring projection with 1,200 definitions is measured; this does not claim worst-case daily schedules over every horizon.

Three genuine 1,000-post invocation times: 6775.13, 7112.57, 7849.86 ms; median **7112.57 ms**. Throughput 147.60, 140.60, 127.39 posts/sec. Each invocation has 1,000 attempts/posts, no failure/conflict, and 22,002 instrumented statements. The following invocation posts the remaining 200 and clears hasRemaining. These are service/local-PG timings, not signed internal-cron HTTP timings. They are compatible with prior T61's roughly 8–10-second observations, allowing for different cache/host/workload contexts. They do not certify a hosted 45-second deadline.

The 3,131-occurrence backlog drains in 5 invocations: 1000 → 1000 → 1000 → 130 → 1 posts; 8935.31, 8684.62, 6371.64, 832.75, 6.38 ms. Per-definition 100/global 1,000 ceilings explain small tail batches; no limits were raised. All 3131 rows equal 3131 unique definition/date pairs and exact 313.10 income. Every measured batch is below the 45-second cooperative budget; deterministic budget semantics belong to the unchanged T33/T61 regression. Due-discovery EXPLAIN median 0.87 ms supports keeping recurring_due_idx.

## Dashboard and Analytics

| Period | Normal service / HTTP ms | Stress service / HTTP ms |
| --- | --- | --- |
| this_month | 8.61 / 16.56 | 49.45 / 82.58 |
| last_month | 12.63 / 15.04 | 68.11 / 62.66 |
| 3_months | 11.41 / 15.97 | 48.99 / 57.76 |
| 6_months | 8.59 / 14.89 | 50.38 / 61.19 |
| 1_year | 8.95 / 14.68 | 53.28 / 62.34 |

Ten statements include BEGIN/COMMIT, period calculation, financial position, totals, account balances, recent page and the three-read upcoming projection. Breakdowns/plans show the balance CTEs dominate the stress Dashboard; recent LIMIT and upcoming SQL remain small. T36's roughly 12.65 ms older local baseline is context, not a matched hardware/data comparison. Normal service medians remain 8.59–12.63 ms.

| Inclusive start (end 2026-10-17) | Normal service / HTTP ms | Stress service / HTTP ms |
| --- | --- | --- |
| 2026-10-01 | 5.99 / 14.25 | 18.26 / 28.82 |
| 2026-08-01 | 5.79 / 14.64 | 29.22 / 45.49 |
| 2026-05-01 | 7.20 / 15.76 | 43.54 / 61.08 |
| 2025-10-17 | 8.90 / 15.62 | 82.27 / 92.12 |

The final range is exactly 366 inclusive days and can cross 13 calendar buckets; UI one-year preset uses 12 monthly buckets. Account-filtered stress HTTP median 15.12 ms, with one extra visibility check. Overview has nine statements without/ten with account filtering, including snapshot boundaries.

| Analytics component | Normal / stress service median ms | Statements |
| --- | --- | --- |
| getSummary | 0.52 / 6.64 | 1–1 |
| getCashFlowSeries | 0.80 / 9.21 | 1–1 |
| getCategoryBreakdown | 1.23 / 13.83 | 1–1 |
| getAccountActivity | 1.19 / 9.59 | 1–1 |
| getRecurringCommitments | 2.50 / 40.03 | 3–3 |

Forecast JavaScript calendar work, not its few SQL statements, is the largest stress Analytics component at 1,200 monthly schedules. Compare T38 median 46.24 ms at roughly 30k transactions with substantially fewer recurring definitions; T63's largest range adds substantial projection work. Small normal datasets remain under 8 ms service. SQL retains exact NUMERIC arithmetic and separate forecast/actual semantics. No unreadable combined query or speculative cache was introduced.

## Budgets, goals, categories and profile

Budgets use one selected-budget + grouped spending statement; stress service median 16.53 ms, no query per budget. T42's 27.38 ms HTTP median covered 777 budgets spread across 24 months; T63 places 720 in one month and has 1,000 custom categories, so the old/current timings are not a matched regression test. Goal list is one query at 2,200 rows, service 18.66 ms, consistent with T45's one-query 2,000-row observation. Category list is one deterministic C-collated system/name/ID order with active/kind filters, including both-kind categories. Profile bootstrap retains two statements to handle concurrent INSERT visibility correctly; unchanged-value PUT can fall back to one additional SELECT. No query removal compromises those semantics.

## SQL plans and index review

| Captured operation | Median SQL execution ms (5) | Top plan node |
| --- | --- | --- |
| dashboard service 1_year | 0.01 | Result |
| dashboard service 1_year | 15.85 | Aggregate |
| dashboard service 1_year | 5.87 | Subquery Scan |
| dashboard service 1_year | 15.52 | Sort |
| dashboard service 1_year | 0.07 | Limit |
| dashboard service 1_year | 0.01 | Result |
| dashboard service 1_year | 1.76 | Hash Join |
| dashboard service 1_year | 0.01 | Seq Scan |
| search groceries | 0.19 | Limit |
| search RareNeedle | 30.68 | Limit |
| search no-match-zzzz | 31.50 | Limit |
| search العربية | 31.14 | Limit |
| search Account 1 | 0.25 | Limit |
| search Category 1 | 0.62 | Limit |
| filter account | 0.01 | Seq Scan |
| filter account | 0.14 | Limit |
| filter category | 0.01 | Index Scan |
| filter category | 0.14 | Limit |
| filter date | 0.13 | Limit |
| filter type | 0.13 | Limit |
| filter recurring | 0.03 | Limit |
| filter combined | 0.01 | Seq Scan |
| filter combined | 0.16 | Limit |
| cursor page 0 | 0.39 | Limit |
| cursor page 160 | 0.35 | Limit |
| cursor page 319 | 0.45 | Limit |
| accounts repository | 15.88 | Sort |
| budgets service | 18.65 | Sort |
| goals service | 2.36 | Sort |
| category service | 0.91 | Sort |
| recurring service | 4.01 | Sort |
| analytics breakdown getSummary | 6.26 | Subquery Scan |
| analytics breakdown getCashFlowSeries | 8.98 | Merge Join |
| analytics breakdown getCategoryBreakdown | 12.93 | Incremental Sort |
| analytics breakdown getAccountActivity | 9.32 | Sort |
| analytics breakdown getRecurringCommitments | 1.50 | Sort |
| analytics breakdown getRecurringCommitments | 0.01 | Seq Scan |
| analytics breakdown getRecurringCommitments | 0.81 | Subquery Scan |
| processor due discovery | 0.87 | Limit |

This table includes separately captured reference checks and each Dashboard/forecast component, so repeated labels are intentional. Full plans contain actual rows, loops, index names, shared/temp buffer data and owner-bound parameters. All 44 existing index definitions are inventoried. Major support: transactions_user_order_idx for owned cursor seeks; owner/account/date, owner/category/date and owner/type/date indexes for filters and budget spending; transfer owner/order and source/destination/date indexes for cursor/balance reads; recurring_due_idx for active global due selection and owner/status/next for owner lists; budget owner/category/period uniqueness and owner/period for progress; owner/status indexes and PK/unique/FK indexes for remaining domains. Integrity composite unique indexes support ownership references even when their ID prefix resembles a PK; they are not automatically redundant. transactions_order_idx supports legacy/global ordering and is not dropped on a local usage sample. No index was proven removable, added or dropped; no migration or remote schema operation occurred.

## Concurrency, pool and memory

| Workers | Operations | Elapsed ms | Median / p95 ms | Peak runtime connections / queue | Observed lock waiters | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 50 | 598.64 | 31.64 / 120.27 | 5 / 0 | 1 | 0 |
| 12 | 120 | 716.02 | 53.95 / 136.60 | 5 / 7 | 3 | 0 |

Reads mix Dashboard/Analytics/transactions/budgets across A/B, followed by owned transaction/transfer create-delete cycles. Runtime max remains five, no deadlock-counter increase. Observer SQL uses its own max-one local admin pool; it does not change application pool capacity. Checkout median/p95/max 0.01 / 0.03 / 160.58 ms across measured activity. Queueing at 12 workers is expected and transient; errors remain zero. No blind pool-size increase. One process-local pool/resolver is appropriate per instance, but aggregate connections across many serverless instances still need deployment sizing; in-memory JWKS caches are opportunistic per-instance caches, not persistent financial state.

Backend RSS 243.4 → 183.3 MiB, heap 71.3 → 58.2 MiB across the mixed load, without forced GC. These snapshots cannot establish a backend heap leak or sustained-load plateau. Browser stress counters vary with GC; individual dialog closures restore identical mounted node counts. Supplemental three route cycles with explicit GC retain 646/646/646 nodes and 674/674/674 listeners, two documents throughout. No steadily growing retained DOM/listener signal in that smoke; no allocation profiler or long-duration leak certification.

## Frontend build and client boundaries

Production lint/typecheck/build pass. Next's route summary reports static routes and dynamic account detail, not per-route first-load KB. 24 emitted JS chunks total 1,228,574 raw / 366,428 gzip bytes; this sum is not one route's download. Largest three chunks: static/chunks/2jvuiz52c-e9_.js 249365 raw/64983 gzip; static/chunks/1rj7ns8rte9vc.js 229156 raw/71628 gzip; static/chunks/36hei7oa9r0rt.js 160166 raw/43906 gzip. Client-reference unions for Dashboard/Transactions/Analytics/Settings are retained in bundles evidence; these gated routes actually return 404 in production. Common Next/React/Auth code and route-specific financial chunks are split. Supabase JS 2.117.2 has one installed frontend SDK; no added chart dependency. Charts remain native lightweight React/SVG/HTML with textual equivalents.

The populated client manifest audit, frontend boundary tests and runtime import review find no fixture-data module, test helper or server utility crossing the financial client boundary. TransactionFixture is a presentation type/local mapper, not a fixture-data import. Manifest keys list entry boundaries, not every transitive module: source imports and the existing fixture-boundary tests supplement them. No dependency replacement or speculative dynamic import was warranted.

## Network waterfalls and refresh behavior

Raw per-route requests/timestamps are committed without tokens. Warm Dashboard uses its aggregate endpoint alone, not full account/transaction datasets. Transactions loads one page plus active/archived account/category choices. Recurring loads list/upcoming plus those reference choices. Analytics uses overview plus active/archived accounts concurrently. Settings starts profile and active/archived categories concurrently. Accounts includes list, summary, and transfer-panel account choices/history. Budgets/goals add only their reference choices. Direct protected reload has a bootstrap gate before page requests; warm same-session navigation avoids repeating it. These user/profile gates were not bypassed for speed.

Bounded duplicate account-choice reads in Accounts/transfer refresh and repeated Analytics choice reads on range refresh are watch items. They do not grow per row, poll, or cause measured normal-use delay sufficient to justify new cache/invalidation complexity. Stores remain owner/lifetime bound; abort/generation guards and session teardown remain unchanged. No persistent financial cache was added.

| Successful UI mutation | Post-success GET requests (representative) | Median save-to-settled ms (3) |
| --- | --- | --- |
| transaction | transactions?limit=25 | 415.00 |
| transfer | accounts?status=active<br>accounts/summary<br>accounts?status=active<br>accounts?status=archived<br>transfers?limit=25 | 382.00 |
| recurring | recurring<br>recurring/upcoming?days=30 | 436.00 |
| budget | budgets?year=2026&month=10 | 304.00 |
| goal | goals | 303.00 |
| category | categories?status=active<br>categories?status=archived | 310.00 |

These are real browser saves through T10, verified ES256 and PostgreSQL, repeated three times per domain. Exactly one mutation request per save; post-success refreshes use authoritative GETs. Transfer's five GETs include two active-account choices from independently mounted consumers; this duplication is explicitly recorded. Cleanup API requests occur outside measured UI sequences. Rapid searches and failure states do not create an unbounded loop. Source/store tests also preserve cancellation, uncertain-write GET-only inspection and recovery semantics. There is no browser recurring polling; Auth expiry/refresh timers and dialog focus timers are not financial polling.

## Navigation, rendering, session and emulation

| Route | Stress warm desktop median ms (5) | Normal direct-load median ms (3; includes settling) | Stress 360px median ms (3) |
| --- | --- | --- | --- |
| dashboard | 368.00 | 790.00 | 525.00 |
| transactions | 309.00 | 874.00 | 565.00 |
| analytics | 685.00 | 826.00 | 938.00 |
| settings | 956.00 | 822.00 | 1187.00 |

These columns use different navigation/settling methods and are labeled accordingly; they are not a before/after optimization comparison. Warm desktop stress Accounts/Recurring/Budgets/Goals observations are in raw evidence; thousands of unpaginated goals/schedules incur seconds of development React/DOM work. Normal personal datasets are usable without that extreme DOM. Dialog stress medians: Add transaction 208.00 ms; New transfer 112.00 ms; Add recurring item 4221.00 ms; Add budget 1594.00 ms; Create goal 8076.00 ms; Add custom category 687.00 ms. No memo/virtualization was added merely for synthetic cardinality; future scale requirements could justify pagination/virtualization after a separate design decision.

The connected transaction page is fixed at 25 rows, despite API maximum 100. An initial attempted 100-row response adapter was correctly rejected by the strict client; no client validation was weakened. The 100-row stress is therefore explicitly DOM-only: cloned real table rows, 24.60 ms to two-frame layout, not a 100-row React/API certification. React is exercised at the actual 25-row UI limit; backend 100-row requests are measured separately. Supplemental charts wait for exactly 12/6 monthly table rows before timing completion, preserving SVG and textual equivalents. No React Profiler render-count claim is made; observed network/DOM/long-task counters provide practical smoke coverage.

Three A→B switches remove the actual stress-only Category 1000 marker before accepting the new owner UI, with no retained stress marker after settling; precise clear/settled timings are in interactions evidence. This supplements the weaker raw first-pass user-ID-absence check and existing session isolation tests. Initial protected reload/bootstrap and warm navigation request differences are recorded. Privacy wins over stale-data retention.

Mobile is a 360×800 desktop Chromium viewport, not a phone. Additional CDP emulation: CPU rate 4, 150 ms network latency, 200,000 B/s download (1.6 Mbps), 93,750 B/s upload (750 kbps). Stress reload times: dashboard 7228 ms; transactions 8364 ms; analytics 11177 ms; settings 11560 ms. Each throttled route is one smoke, not a median/p95 benchmark. Loading status appeared in 458 ms with artificial 1,300 ms API delay; existing Dashboard content stayed visible during refresh. Artificial 503 yielded one Dashboard GET during the observation window and no retry storm. These numbers include development mode and must not be used as physical-device/production performance claims.

Production public login was measured on 360×800: first sample 159 ms, warm median 109.00 ms across six reloads. Eight financial/Settings production routes return 404. Four fresh normal-data axe audits report zero violations; ARIA, labels, live regions and chart tables remain present. Full T62's previous 470-audit acceptance is historical evidence, not falsely counted as rerun here.

## Findings and optimization decision

- **Acceptable:** bounded driver query counts; efficient cursor seeks; normal payloads/latencies; local recurring throughput and exact backlog drain; no load errors/deadlocks; normal interaction, ownership teardown and bounded failure behavior.
- **Watch:** large unpaginated goals/recurring/budget/category payloads and DOM at extreme personal cardinalities; duplicated balance aggregation and reference-option reads; forecast CPU at 1,200 schedules; transient five-connection pool queueing; serverless aggregate pool sizing; fresh-process-only restart timing and rough memory snapshots.
- **Material P0 regression:** none established on the representative personal-finance dataset. Extreme stress timings are documented, not waived as normal performance or used to invent a production SLA.
- **Blocker:** none from the local measured scope. Hosted acceptance and full production financial-route profiling remain intentionally deferred by the existing release gate, not silently activated.

**Product optimizations: none.** No production before/after claim exists because no application or index change was justified. Only repeatable local measurement helpers, ignored-directory coverage and documentation/evidence are added. Failed harness trials (fixture ID/scale guards, mismatched 100-row adapter, premature chart completion and Windows nested restart lifetime/readiness) are excluded from final successful timing summaries; their corrections did not alter product contracts.

## Regression and quality

Final quality/regression results are recorded in assets/t63/quality.json. Backend lint/typecheck/build and full ordinary test command: 104 passed, 28 guarded DB tests skipped without explicit environment, zero failures. Frontend lint/typecheck/optimized build and full test command: 183 passed, no skips/failures. Explicit local DB regression gates are reported separately, never counted as those skipped tests executing. Dedicated lint also covers new backend benchmark scripts. Git whitespace and credential scan complete before commit.

T57 correctness, T59 ownership isolation, T60 exact financial reconciliation, T61 recurring reliability and T62 accessibility/security boundaries are preserved; fresh regression gate results and limitations accompany this report. No production calculation, ownership predicate, transaction lock, occurrence idempotency rule, JWT/cursor verification or accessibility component changed. Exact NUMERIC arithmetic and derived balances remain authoritative.


| Fresh regression / quality gate | Result |
| --- | --- |
| T57 full database domain matrix | 17 suites, 57 tests passed, zero failures/skips |
| T57 initial/recovery/terminal system | 670 + 103 + 56 = 829 checks, zero failures |
| T59 isolation / attack acceptance | Foundation and expanded domains pass; 156 route-auth, 561 owner-injection, 275 mass-assignment, 6 occurrence, 2 concurrency, 19 boundary and 192 timing requests |
| T60 financial reconciliation | 9,445 initial + 728 restarted checks pass; PostgreSQL/backend restart and exact snapshots pass |
| T61 recurring reliability | 1,689 initial + 43 recovery checks pass; real crash-reserve/crash-post workers, PostgreSQL restart and recovery pass |
| T62 preservation smoke | Four new normal-data axe audits, zero violations; no product/accessibility source changed |
| Backend / frontend ordinary tests | 104 passed / 183 passed; 28 guarded DB cases skip only in the ordinary command, with explicit DB suites above |
| Lint / typecheck / builds | Both packages pass; dedicated new-script lint passes; frontend output removed and clean optimized build passes |
| Source / production bundle / log credential scan | 782 files, 96 source maps and 3 logs, zero findings; changed-source/evidence scan in secret-scan.json |
| Clean production HTTP | Eight financial/Settings 404s and four Auth 200s |

Historical T45 timing/result assets regenerated by its existing integration helper were restored to the clean starting HEAD; only T63 evidence is delivered. The PowerShell wrapper's redundant already-stopped T57 cleanup prints a PID-file notice after the runner itself stops that cluster; all named suites/results above pass and later clusters initialize/stop successfully.

## Production boundary, changes and next task

No hosted benchmark/load, remote write, Supabase/Vercel setting, gate removal, cron enablement or manual deployment occurred. backend/vercel.json still has crons: []. Hosted financial acceptance remains deferred. No runtime env or lockfile change is committed. Direct main commit/push is the explicitly requested source delivery workflow, not a manual deployment action.

Changed files: .gitignore; backend/scripts/verify-t63-performance.mjs, verify-t63-runtime.mjs, t63-browser-api.mjs; frontend/scripts/verify-t63.mjs, verify-t63-interactions.mjs, verify-t63-bundles.mjs; README; implementation-plan checkpoint; this report and sanitized assets/t63 evidence. Main branch must be clean and equal freshly fetched origin/main after push; final SHA is returned in the delivery response.

**Next core task: T64 — Security Review**, exactly as named in docs/v2/07-implementation-plan.md. It is not implemented by T63.
