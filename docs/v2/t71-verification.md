# T71 — Production Financial Acceptance

**Status: completed.** T70 passed under controlled-only writes. The original owner is excluded from financial tests; backup/restore remains explicitly waived.

Real hosted forms created and edited a zero-opening credit card, created/edited a 0.21→0.31 EGP expense and posted a 0.10 EGP card-payment transfer. Debt became 0.21 and net position 89.78, correctly excluding the payment from income/expense. Transfer deletion exposed a confirmation guard that depended on account-choice loading even though deletion requires no account selection. That dependency is removed for delete only; pending/uncertain-write protection remains. Fifteen transfer client/store tests, lint, typecheck and optimized production build pass. The existing controlled fixtures will be reused; failed automation does not retry creates.

Remaining: verify the fix on production, finish CRUD/lifecycle and aggregate acceptance, preserve the original baseline and clean controlled financial rows after recurrence acceptance. Cron remains disabled.

## Final hosted result

Frontend deployment `dpl_CmmHZ28Mwr9wAmTRpf7S7m2aNtoa` is READY at `d1a8613fb689bc41539a46e2bd1d2c44567877de`. Resuming the existing fixture verified the transfer-delete fix, with **19 browser checks / 145 private API responses**, all successful and no-store, zero page errors. Actual forms covered account create/edit/archive, transaction create/read/edit/delete, transfer create/delete and card payment, recurring edit/pause/resume, budget edit, goal manual funding/completion, profile save and category creation. Dashboard/Analytics returned the correct 90.09 EGP after card/transfer test cleanup.

Additional hosted A/B checks passed opening-balance locks, transfer edits and exact 0.20?0.10 movements, independent goal savings, budgets spent 10.01/20.02, future definitions producing no transactions, two posted rows per controlled user, Dashboard/Analytics/net-position consistency. The retained original row remains count 1 with unchanged fingerprint `f2cf23efb7eeb698c20e6cfd89c99064`. No real owner financial mutation occurred.

Controlled A/B fixtures are retained temporarily for T72/T73, then removed or archived according to durable-history contracts. No report/export P1 feature was promoted. T72 may now enable only the prepared daily schedule. Public user writes remain gated.
