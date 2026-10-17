# T72 — Production Recurring Job Verification

**Status: in progress.** T66–T71 passed and the controlled write checkpoint is recorded. The approved daily schedule `0 3 * * *` UTC is now prepared in the active Vercel artifact. Backend release remains controlled for the two acceptance users. Enable the scheduler environment only after committing the artifact and refreshing its distinct credential. No real-owner recurring definitions exist; only a dedicated controlled due definition will be processed.

Acceptance requires missing/wrong credentials denied, a real production invocation posting one controlled occurrence, duplicate invocation posting zero, deletion of the generated transaction retaining its terminal occurrence marker, and another invocation never reposting it. Keep operational logs free of credentials and financial row content. Cleanup must preserve durable occurrence history.
