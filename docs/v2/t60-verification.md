# T60 — Financial Reconciliation Tests

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Starting clean `main`, fetched and synchronized with `origin/main`: `ecc649e1a12bbddc6963eb3fbf7c17cd9c8326e9`. No unexplained financial mismatch remains. T35/T41/T47/T50–T56 remain optional/deferred. T61 is not started. Hosted financial acceptance remains intentionally deferred.

## Scope, environment and independent oracle

The acceptance story is a deterministic financial ledger → real authenticated Express APIs and production repositories → PostgreSQL NUMERIC results, checked across accounts, transfers, recurring actuals/forecasts, Dashboard, Analytics, Budgets and Goal non-effect. A new PostgreSQL 17.11 UTF-8 cluster under ignored `.tmp-v2-t60/pgdata` listens only on `127.0.0.1:55451`. A starting-HEAD `git archive` snapshot installed both committed lockfiles from the local npm cache, with no private application `.env`. Node 24.19.0/npm 11.17.0 executed verification. Frontend dependencies support the backend's shared transport-test loader; frontend source/contracts were unchanged.

The eight migrations, reference category seed, ownership constraints, occurrence invariants and runtime/browser privileges are applied by the guarded disposable initializers. API traffic uses synthetic A/B users, real ES256 signatures/local JWKS and `expense_tracker_app`. Neither hosted Auth nor remote databases are contacted. The runner validates the resolved server data directory and no preceding clients before resetting its disposable database/roles.

Expected money uses a separate **BigInt integer-cents** oracle, built from declared fixture inputs and mutations. It imports no production money/balance/aggregate helper to derive expected results. Hand-summed constants are declared before application queries. Forecast expectations use explicit October 15/November 15/December 15 dates, independently of T30 enumeration. Rounded ratios use integer division with ties away from zero; date-day counts use integer UTC calendar differences. No expected monetary calculation uses JavaScript floating point.

Independent read-only correlated SQL cross-checks account arithmetic, posted ledger cardinality, income/expense SUMs, net position and each Budget's category/month spending. Those queries do not reuse production CTE text. Actual values are checked through production T18 repositories and real JWT HTTP routes; Dashboard/Analytics are each also compared directly against the independent oracle, so agreement between two production endpoints alone cannot conceal drift.

## Authoritative formulas

| Value | Frozen formula |
| --- | --- |
| Asset current balance | opening + posted income − posted expenses + incoming transfers − outgoing transfers |
| Credit-card current balance | opening debt + posted expenses − posted income + outgoing transfers − incoming transfers |
| Net position | sum(asset balances) − sum(signed card balances), including archives and negative values |
| Period savings | posted transaction income − posted transaction expenses |
| Budget spent | owned posted expenses for matching category/year/month; transfers and income excluded |
| Forecast | current active schedules/parents, anchored dates in requested range, excluding skipped dates; separate from actuals |
| Goal savings | manually supplied metadata; no ledger effect |

Positive card balance means debt; negative means overpayment/credit. A refund is recorded as income, reducing card debt and counting as income under the frozen simple-tracker model. No new refund type or semantics are introduced. Transfers change the component asset/debt values while preserving net position and actual income/expense/savings.

## Fixture ledger and hand-summed expectations

A starts with Cash 100.00, Savings 50.00, Bank −5.00, Card 20.00 debt and second Card −2.00 credit. Opening assets 145.00 minus signed card debt 18.00 gives net 127.00. B uses the same account families, with cash opening 999999999.99 and distinct maximum-value income/card expenses to make contamination obvious.

The immutable manual A fixture is declared as follows. Food is a custom both-kind category; Bills is a second expense category; Salary is shared system income. Dates remain DATE strings.

| Account | Type | Amount | Date | Category |
| --- | --- | ---: | --- | --- |
| Cash | income | 10.00 | 2026-10-01 | Salary |
| Cash | expense | 1.23 | 2026-10-15 | Food |
| Card | expense | 2.34 | 2026-09-30 | Food |
| Card | income/refund | 0.30 | 2026-10-01 | Food |
| Negative bank | expense | 0.20 | 2026-10-01 | Food |
| Cash | expense | 0.10 | 2026-10-01 | Food |
| Cash | income | 0.20 | 2026-10-01 | Salary |
| Cash | expense | 0.30 | 2026-10-01 | Food |
| Savings | income | 3.00 | 2025-12-31 | Salary |
| Savings | expense | 0.01 | 2026-01-01 | Food |
| Savings | income | 0.10 | 2024-02-29 | Salary |
| Savings | expense | 0.20 | 2024-02-29 | Food |
| Savings | income | 1.23 | 2026-09-01 | Salary |
| Savings | expense | 2.34 | 2026-09-30 | Food |
| Savings | income | 0.01 | 2026-10-01 | Salary |
| Savings | income | 0.10 | 2025-10-31 | Salary |

Before transfers, hard-coded expected all-history income 14.94, expenses 6.72, savings 8.22 and net 135.22 pass. October-to-date income 10.51, expenses 1.83 and savings 8.68 pass. September income 1.23 minus expenses 4.68 gives negative savings −3.45. January's expense-only boundary produces negative savings and a null savings-rate denominator.

| A checkpoint | Cash | Savings | Negative bank | Card | Second card | Assets | Signed debt | Net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Openings | 100.00 | 50.00 | -5.00 | 20.00 | -2.00 | 145.00 | 18.00 | 127.00 |
| Manual ledger | 108.57 | 51.89 | -5.20 | 22.04 | -2.00 | 155.26 | 20.04 | 135.22 |
| Four transfers | 79.68 | 53.12 | -5.20 | -4.39 | -3.23 | 127.60 | -7.62 | 135.22 |
| Generated income/expense | 79.68 | 53.22 | -5.20 | -4.19 | -3.23 | 127.70 | -7.42 | 135.12 |
| Generated expense deleted | 79.68 | 53.22 | -5.20 | -4.39 | -3.23 | 127.70 | -7.62 | 135.32 |

The four transfers are Cash→Savings 1.23, Cash→Card 30.00, Card→Cash 2.34 and Card→second Card 1.23. Every settled step reconciles both ends, net neutrality, unchanged period actuals, unchanged Analytics summary and unchanged Budget spending. Analytics activity reports transfer in/out separately. Archived history retains those movement effects.

## Transactions, recurring and dependent aggregates

Manual creation reconciles account/card balances, Dashboard actuals, Analytics summary/monthly buckets/category amounts/account activity and Budget expenses. The 1.23 Cash expense is edited to 2.34, moved to Card, recategorized to Bills, moved from October 15 to September 30, then deleted. Each intermediate state reconciles all five Dashboard periods, corresponding Analytics ranges, old/new account effects, old/new category allocation and old/new monthly budgets. Deleted rows disappear from recent transactions and leave no residual financial effect.

Two real T31 definitions generate Savings income 0.10 and Card expense 0.20 on October 15. Before posting, definitions/forecasts have zero actual financial effect. Two concurrent processors produce exactly two generated transactions and posted terminal markers. Reprocessing has no second effect. Income never counts as Budget spending. Forecast is independently checked over October–December using the three declared monthly dates; posted actuals do not merge into the projection.

Deleting the generated expense through T21 reverses account, Dashboard, Analytics and Budget effects. Its occurrence stays posted with generated_transaction_id=null; another processor run never recreates it. The forecast remains a current-schedule projection until category/account lifecycle explicitly pauses the definition. T29/T31/T32 regressions separately cover calendar anchoring, catch-up, terminal states, failure recovery and archive/posting races.

## Dashboard and Analytics reconciliation

Every major settled mutation checks these independently declared periods for Cairo today 2026-10-15:

| Dashboard period | Inclusive Analytics range |
| --- | --- |
| this_month | 2026-10-01–2026-10-15 |
| last_month | 2026-09-01–2026-09-30 |
| 3_months | 2026-08-01–2026-10-15 |
| 6_months | 2026-05-01–2026-10-15 |
| 1_year | 2025-11-01–2026-10-15 |

Dashboard income/expenses/netSavings equal Analytics summary and the independent expected ledger. Dashboard all-history account snapshots/assets/signed debt/net position remain independent of period selection. Analytics monthly buckets reconcile individually and sum to the summary; income and expense category allocations each sum exactly to their corresponding total. Account-filtered Cash and Card ranges obey the same rules. Account activity independently reconciles transactions and both transfer directions. Exact rounded daily averages and savings rates are checked, including zero income/null rates and negative savings.

## Budgets, Goals and metadata lifecycle

Each owner has Food/Bills budgets for October 2026, September 2026, January 2026 and February 2024. Spent equals matching posted expenses, including generated expenses and archived history, while excluding refunds/income, transfers, deleted rows and the other owner's ledger. The October Bills expense moves through 8.99/9.00/10.00/10.01 against 10.00 at 90% threshold: normal/near_limit/near_limit/exceeded, with exact remaining and rounded percentages. Negative remaining is preserved. The fresh T43 suite adds exact rounding-boundary pairs and six concurrent committed/rolled-back visibility cases.

Linked Goal create/update/complete/reopen/archive leaves full financial snapshots unchanged. Manual saved amounts do not derive from linked account activity. A second Goal retains its Savings link through account archive. Category rename changes transaction/Analytics/Budget live labels but no money; category archive preserves actual totals/spending and pauses its recurring expense. Account archive preserves balance/net worth and historical transfers, retains Goal metadata, and pauses recurring income. Restore does not resume schedules. Opening-balance correction after posted activity returns 409 and preserves reconciliation.

## Exact money, dates and A/B separation

The focused fixture uses 0.01/0.10/0.20/0.30/1.23/2.34/999999999.99, negative assets, positive debt, overpayment, negative savings and negative Budget remaining. Two maximum incomes and two maximum expenses prove aggregate values above per-input limits remain exact NUMERIC strings. The final concentrated A scale ledger has October income 2000001510.63, expenses 2000000150.67 and savings 1359.96. Final assets 1478.87 minus signed card debt −7.63 gives net 1486.50. B independently reconciles net 1000000026.95 and cannot change A snapshots; reciprocal A writes cannot change B snapshots.

Transactions on first/last month days, previous month end, December 31, January 1 and February 29 reconcile with month/year budgets and Analytics. October period editing crosses the Dashboard boundary. Cairo midnight probes at 2026-09-30T20:59:59Z and 21:00:00Z resolve September 30 and October 1 respectively; Dashboard periods/actuals match explicit Analytics DATE ranges. T31 regression checks generated transaction/occurrence date equality around Cairo seasonal boundaries. No transaction DATE is shifted through a JavaScript timestamp.

## Concurrency, rollback, lost acknowledgements and restart

The focused runner commits 24 concurrent A/B cent transactions and 20 opposing Cash/Card transfers, then reconciles every account and all dependent aggregates. Two concurrent recurring processors have one financial effect per definition/date. Fresh T27 separately runs 29 forced races, 20 stress rounds/180 create/edit/delete mutations, full post-phase ledger reconciliation and zero observed deadlocks.

Fault wrappers execute real transaction/transfer/generated transaction INSERTs before throwing. All affected financial snapshots match their pre-operation state after rollback. Recurring reservation/failure markers may remain durably recorded, without a financial row. A failure after an actual successful transfer COMMIT leaves exactly one committed row; read inspection reconciles its effect. A failure after an actual recurring posting COMMIT leaves exactly one generated transaction; inspect/reprocess does not duplicate it. The reused T31/T32 suites cover their broader explicit retry and uncertain-claim/posting matrices.

After scale, full A/B financial snapshots are saved privately, including accounts/net position, Dashboard summary, Analytics and every Budget resource. The first Node backend/JWKS/API process stops; PostgreSQL performs a real fast restart; a new Node backend/JWKS/API process reconnects. Both complete snapshots compare exactly, and raw SQL/API/oracle reconciliation repeats against the stored expected ledger. **728 restart checks pass**, proving no in-memory aggregate dependency. Raw snapshots, tokens and signing material remain ignored.

## Scale and performance review

Final dedicated dataset: **10 accounts, 30,047 transactions, 2,025 transfers, 116 budgets and 4 recurring definitions**, including retained generated rows. The 30k bulk rows and 2k transfers use the same runtime privileges/constraints. All cross-domain, raw SQL and A/B checks still reconcile. Full expensive scenarios are concentrated at selected checkpoints rather than repeating every lifecycle at full scale.

| Read | Initial post-load median, 3 samples | Follow-up warmed + ANALYZE median, 5 samples |
| --- | ---: | ---: |
| Account balances | 36.49ms | 18.67ms |
| Net position | 36.47ms | 19.52ms |
| Dashboard | 161.98ms | 51.64ms |
| Analytics | 154.96ms | 63.92ms |
| Budget list | 9.46ms | 8.29ms |

The performance follow-up on the first completed version of the same financial fixture inspects 16 actual captured read statements with EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON), using the runtime role. Before explicit ANALYZE, its already-warmed Dashboard/Analytics medians were 52.28/71.72 ms; after ANALYZE 51.64/63.92 ms. The final verifier additionally predeclares all bulk UUID/type inputs, preserving the same financial workload. Initial post-load observations are not attributed solely to statistics. Measurements include local driver/runtime overhead and cache/scheduling effects; they are not hosted guarantees.

Earlier T57 medians were Dashboard 15.35 ms, Analytics 59.22 ms direct, Budgets 13.55 ms and balance DB execution 6.67 ms on 5k transactions/2k transfers. The **fresh T60 regression of those existing workloads** measured Dashboard 12.31 ms and Analytics 42.98 ms. The dedicated workload deliberately puts approximately 30k transactions under one owner/account, whereas the Dashboard regression distributes30k across 20 owners. Different owner selectivity and service-versus-single-query timing prevent direct like-for-like comparison of those balance/Dashboard numbers. No application source changed, no material regression was established by the matched regression workload, and no speculative index or query rewrite was introduced. Supabase Postgres best-practice EXPLAIN/N+1 guidance informed this review; production financial reads remain set-based.

## Source-of-truth audit, findings and limitations

Catalog checks verify monetary amount/opening/target/saved fields use unrestricted NUMERIC, not float or numeric typmods that silently round input. Accounts have no mutable balance/current_balance/net_position columns; Budgets have no stored spent/remaining/percent_used columns. Services derive actuals exclusively from opening balances, posted transaction rows (including generated rows) and transfers. Goal saved_amount is explicitly manual and not a financial posting/cache. Recurring definitions/occurrences/next dates are schedule/idempotency state, not a second balance ledger.

No product financial defect was found. Verifier development corrected a transfer assertion that incorrectly required assets/debt components to stay fixed, and supplied required UUIDs in the bulk fixture. Neither required an application change. Production source, SQL migrations, grants, dependencies, lockfiles, entry-point gates and financial semantics are unchanged.

Limitations: local synthetic Auth/PostgreSQL/Windows execution, finite concurrency schedules, and local performance samples. The independent oracle implements the frozen mathematical rules; it is not a separate accounting product or hosted acceptance. Forecast's current-definition assumptions remain separate from actuals, including posted/deleted historical dates. T61 reliability expansion and optional P1 work remain unstarted. No unresolved mismatch is deferred.

## Results, reproduction and production boundary

Focused results: **16 initial groups / 9,445 checks**, plus **1 restart group / 728 checks**, zero failures. General backend suite: 132 named tests, 104 passed, 28 explicitly database-gated wrappers, zero failures. Those gates are covered by **17 fresh regression runs / 57 passing groups**, zero failures/skips, including T18/T21/T26/T27/T29/T31/T32/T36/T38/T39/T42/T43/T45. T59 rerun passed 612 foundation checks plus domain extensions and its attack matrix (156 route-auth, 561 owner-injection, 275 mass-assignment, 6 occurrence denial, 2 processor, 19 boundary/log and 192 timing checks). Backend lint/typecheck/build/full tests, explicit verifier lint, whitespace and secret scans passed; the source/configuration scan passed 33 checks across 357 files with zero recognized secrets, and all 9 changed files passed the final secret review; duplicate/shared assertions are not summed into a unique test count.

Build backend, then initialize a new cluster at `.tmp-v2-t60/pgdata` on 127.0.0.1:55451. Set T60_DISPOSABLE_DATABASE_URL to the password-free local postgres URL, T60_DATA_DIRECTORY to the absolute new data path, T60_OUTPUT_DIRECTORY to an ignored T60 subdirectory, and T60_PG_BIN to the PostgreSQL binary directory. Run `node backend/scripts/verify-t60-reconciliation.mjs`. The guarded parent resets only that validated disposable database, runs initial acceptance, restarts PostgreSQL with pg_ctl.exe, then starts a new backend verification process for equality/reconciliation. Windows PostgreSQL restart needs permission to create child processes outside the restricted-token sandbox. The runner's raw private-state file must never be committed.

The T57 matrix is reused by adapting only snapshot T57/t57 guards/variable names to T60/t60 and selecting MATRIX_ONLY=1. T59 is reused by adapting only its snapshot T59/t59 path guards/variable names to T60/t60, preserving the real security logic. Run these database-resetting suites serially, never during the focused fixture or performance review. The optional performance follow-up repeats the same production services before/after local ANALYZE and explains captured SELECT/CTE statements; it makes no financial mutations.

Evidence: [focused reconciliation](assets/t60/reconciliation.json), [performance review](assets/t60/performance.json), [regression/security/quality summary](assets/t60/result.json), [migration inventory](assets/t60/migration-inventory.json). No raw tokens, cursors, keys, snapshots or logs are committed.

No production access/write, remote Supabase/environment change, manual deployment, gate removal or cron activation occurred. Financial UI/Settings and category-write gates remain, production Analytics/Budgets/Goals registration remains absent, V1 financial access remains retired and `backend/vercel.json` retains `crons: []`.

Changes are the focused verifier, this report/sanitized evidence, `.gitignore`, README and implementation-plan checkpoints. **Next core task: T61 — Recurring Reliability Tests. Not implemented automatically.**
