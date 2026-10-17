# T70 — Production Multi-User Isolation

**Status: completed.** T66–T69 prerequisites passed in their documented scope. The user authorized controlled financial acceptance data and explicitly waived backup/restore while requiring original-record preservation.

## Controlled write-enable checkpoint

Recorded **2026-10-17T19:19:26.482Z**, before changing production release configuration or creating any financial fixture. The existing verified A/B subjects alone will enter controlled mode; normal users remain in maintenance and cron stays disabled. The exact retained1-row/value/microsecond baseline passed immediately before this checkpoint. No original owner record will be used or modified for testing. This closes Window A conservatively even if every acceptance transaction is later removed; recovery remains forward-only without an independently tested artifact under the explicit waiver.

Next: deploy committed main under controlled-only configuration, record the first committed test account/write timestamp, create only A/B-owned fixtures, verify reciprocal isolation across every P0 domain, preserve/reconcile the original record and keep fixtures for T71 acceptance. No public write release or T72 activation occurs at this gate.

## Hosted acceptance result

Controlled backend deployment `dpl_DW1DcnmZyqjKT2BDqKV1rFbB3zKB` is READY at source `648f88094ebcfa4818e44d7cb1037f0b08c58e7b`. 201 recorded hosted API checks passed across both real ES256 subjects. Reciprocal resource reads, updates, deletes, lifecycle actions and foreign account/category/link references were denied; explicit owner fields and cross-user cursors were rejected. Private lists, Dashboard and Analytics contained no foreign identifiers. Direct browser-role financial Data API access was denied for both users.

A actual income/expense/net: **100.10 / 10.01 / 90.09 EGP**. B: **200.20 / 20.02 / 180.18 EGP**. Transfers, future recurring definitions, budget limits and manual goal savings did not inflate posted income/expenses. The retained historical row still has fingerprint `f2cf23efb7eeb698c20e6cfd89c99064` and count 1 after fixture creation.

First committed controlled account write observed at **2026-10-17T19:23:41.335Z**, provider timestamp **2026-10-17T19:23:40.984Z** (API milliseconds; exact database baseline remains private). Fixture IDs, credentials and sessions remain in ignored private operator files. Only controlled subjects can write; public access and cron remain disabled. T71 is next.
