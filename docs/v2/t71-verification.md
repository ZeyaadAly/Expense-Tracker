# T71 — Production Financial Acceptance

**Status: in progress.** T70 passed under controlled-only writes. The original owner is excluded from financial tests; backup/restore remains explicitly waived.

Real hosted forms created and edited a zero-opening credit card, created/edited a 0.21→0.31 EGP expense and posted a 0.10 EGP card-payment transfer. Debt became 0.21 and net position 89.78, correctly excluding the payment from income/expense. Transfer deletion exposed a confirmation guard that depended on account-choice loading even though deletion requires no account selection. That dependency is removed for delete only; pending/uncertain-write protection remains. Fifteen transfer client/store tests, lint, typecheck and optimized production build pass. The existing controlled fixtures will be reused; failed automation does not retry creates.

Remaining: verify the fix on production, finish CRUD/lifecycle and aggregate acceptance, preserve the original baseline and clean controlled financial rows after recurrence acceptance. Cron remains disabled.
