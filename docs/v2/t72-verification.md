# T72 — Production Recurring Job Verification

**Status: completed.** T66–T71 passed and the controlled write checkpoint is recorded. The approved daily schedule `0 3 * * *` UTC is now prepared in the active Vercel artifact. Backend release remains controlled for the two acceptance users. Enable the scheduler environment only after committing the artifact and refreshing its distinct credential. No real-owner recurring definitions exist; only a dedicated controlled due definition will be processed.

Acceptance requires missing/wrong credentials denied, a real production invocation posting one controlled occurrence, duplicate invocation posting zero, deletion of the generated transaction retaining its terminal occurrence marker, and another invocation never reposting it. Keep operational logs free of credentials and financial row content. Cleanup must preserve durable occurrence history.

## Final hosted result

Scheduler deployment `dpl_911KQRvYY4zih5D3p4tubkadcRV6` is READY at `7f2f241a7e2db45b6bf630db4327516a7970cfed`; active schedule is **03:00 UTC daily**, with provider scheduling precision rather than an exact-time guarantee. A fresh distinct server-only sensitive credential and `V2_CRON_ENABLED=true` were deployed after T66?T71 passed.

Actual production GET invocation posted **1** controlled 0.20 EGP occurrence, with zero failures/backlog. Duplicate invocation posted **0**. Deleting that generated transaction returned204; another invocation posted **0** and never recreated it. SQL verified one terminal posted marker with no linked transaction, retained under the durable ledger contract. The dedicated due definition was archived. Missing/wrong/user-JWT authorization returned401; authenticated POST returned405. Three provider log events contained only the reviewed timing/request/counter fields, with postings1/0/0, no row content or credentials.

Backend lint/typecheck/build passed; ordinary regression142 total,114 passed,28 guarded skips,0 failures. The scheduled provider tick itself has not yet occurred during this session; the exact production handler and credential were invoked directly and the daily schedule is active. T73 production smoke is next.
