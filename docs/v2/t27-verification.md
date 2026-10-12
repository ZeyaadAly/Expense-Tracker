# T27 — Transfer atomicity and concurrency verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** T01–T27 are complete locally; T28 is ready and remains unstarted. This task verifies T26 and fills evidence gaps without changing its implementation. No deployment, remote database, schema, grant, recurring feature or frontend change.

## Relationship to T26

The existing implementation satisfied the reviewed T27 behavior. T26 had already demonstrated its core transaction, ownership, rollback and reconciliation guarantees. T27 adds evidence for previously uncovered interleavings, rather than reimplementing those guarantees. The unchanged T26 suite was rerun as regression coverage; its checks are counted separately below.

| Requirement | Classification | Evidence |
| --- | --- | --- |
| One checked-out client for BEGIN/checks/locks/write/readback/COMMIT or ROLLBACK | Already satisfied by T26; newly traced in T27 | Actual HTTP mutation traces under expense_tracker_app |
| Ownership and resulting active status checked within transaction | Already satisfied by T26 | Foreign/missing and archived reference regression; concurrent cross-owner probes added |
| Transfer first; distinct old/new account union in ascending UUID order | Already satisfied by T26; newly traced in T27 | Parameter uniqueness/order, returned row order and child-before-parent traces |
| Create/archive, either endpoint, both orders | Already satisfied by T26 | Four forced interleavings rerun |
| Amount PUT/archive, either unchanged endpoint, both orders | Newly verified in T27 | 16 forced cases over four initial asset/card pairings |
| Source/destination reassignment versus archive | Already satisfied by T26 for archive-first; expanded in T27 | Eight transfer-first cases over four initial pairings; resulting refs may change family |
| Two full PUTs on one transfer | Already satisfied by T26 | Waiting writer reads current old refs; final row is one full PUT, never a merge |
| PUT/DELETE in both orders | Already satisfied by T26 | PUT then DELETE leaves no row; DELETE then PUT returns missing 404 |
| DELETE/DELETE | Newly verified in T27 | First 204; waiting second matches nonexistent 404 |
| Independent/opposing creates | Already satisfied by T26; expanded in T27 | Opposing create regression plus repeated concurrent workloads |
| Identical deliberate requests create distinct rows | Newly verified in T27 | Gated same-pair creates both return 201 with different IDs and both balance effects |
| First transfer versus opening-balance edit | Already satisfied by T26 for transfer-first; expanded in T27 | Opening-edit-first commits 1.00, then transfer commits; source is 0.90 and permanently locked |
| After-lock/post-write rollback and complete timestamps | Already satisfied by T26 | 11 unchanged fault cases rerun |
| Before INSERT/UPDATE/DELETE and before COMMIT rollback | Newly verified in T27 | Six real HTTP injections; complete account/transfer JSON including microsecond timestamps unchanged |
| Uncertain COMMIT and no automatic mutation retry | Newly verified in T27 | Throw after actual successful COMMIT: safe 503, one client, one INSERT, exactly one recoverable committed row |
| Concurrent A→B and B→A foreign transfer/reference attempts | Newly verified in T27 | Owner holds valid PUT locks while attacker PUT/DELETE/foreign-source/foreign-destination reject with missing-equivalent 404 |
| T18 balances, card debt, net position and actual income/expense/savings | Already satisfied by T26; expanded in T27 | Independent BigInt expected ledger checked against authoritative T18 after race outcomes and each stress phase |
| Runtime role and unchanged privilege boundary | Already satisfied by T26; newly checked in T27 | Actual transaction current_user plus denied CREATE/TRUNCATE/SET ROLE and catalog attributes |
| Opposing-account stress and measured isolation | Newly verified in T27 | 20 rounds, 180 mutations; zero observed deadlocks; every observed BEGIN is read committed |
| Implementation gap fixed | None | Backend source, frontend source and migrations match pre-T27 SHA-256 hashes |

## Transaction boundaries and locks

POST locks both owned accounts before inserting one transfer row. PUT and DELETE first lock the owned transfer row, then lock the sorted distinct union of old and resulting accounts. All queries use the same checked-out client through transaction completion; no balances or paired transactions are written. PUT checks the resulting references are active, even when unchanged. DELETE remains allowed for archived history. Status and ownership checks precede writes inside the transaction.

The transfer lock serializes competing same-row operations. A waiting PUT sees the preceding writer's committed reference state before building its lock union. The last successful serialized full PUT supplies the complete final row. Request arrival order is not a promised scheduling order. A waiting mutation after deletion gets missing 404. Archive locks its account and recurring definitions without acquiring a transfer child lock, avoiding a reverse account-to-transfer edge. T15 posting triggers use ordered account locks; opening-balance locks remain permanent after deletion or reassignment.

## Race and rollback results

T27 added **29 forced races**: 24 edit/archive cases, one opening-edit-first case, one DELETE/DELETE, one identical-create pair and two concurrent ownership cases. Gates pause actual SQL while retaining locks; pg_stat_activity/pg_blocking_pids verifies the competing request waits on the intended backend PID. Other connections see the prior committed transfer and T18 balances while writes remain uncommitted. Archive-first rejects amount edits with ACCOUNT_ARCHIVED; transfer-first commits valid activity before archive commits.

The unchanged **11 T26 races** cover both create/archive orders/endpoints, archive-first reassignment, both PUT/DELETE orders, two full PUTs, opposing creates and transfer-first opening edits.

T27 adds **six rollback faults**, before the transfer write and before COMMIT for each of POST/PUT/DELETE, including changed references on PUT. All produce sanitized errors, restore the complete transfer/account state and preserve T18 reconciliation. T26's **11 faults** cover post-lock/post-write failures, including real HTTP paths and opening flags. Failure before a successful COMMIT rolls back; an acknowledgement lost after successful COMMIT cannot undo that commit. The dedicated latter test verifies one committed row survives, a safe DATABASE_UNAVAILABLE response is returned and no automatic second mutation occurs. Backend and existing frontend transport have no automatic mutation retry.

## Financial reconciliation

Four initial source/destination pairings are covered: asset→asset, asset→card, card→asset and card→card. The focused fixtures contain independent income 1.10 and expense 0.20 on each account for each owner. Expected transfer effects are modeled independently in integer cents, then compared with the unchanged T18 NUMERIC repository: asset opening+income−expense+incoming−outgoing; card debt opening+expense−income+outgoing−incoming; net position assets minus card debt, including archived accounts. Account current balances, summary incoming/outgoing totals and exact database transfer rows are checked together.

Each settled race outcome and every create/update/delete stress phase reconciles. Income 4.40, expense 0.80 and savings 3.60 per owner remain unchanged by transfers. The opening-edit-first extra account's settled 1.00 contribution is included in later net checks. Concurrent foreign attempts leave both owners' models unchanged. V1 summary is unchanged.

## Deadlocks and isolation

Twenty stress rounds run three concurrent creates, three concurrent edits and three concurrent deletes per round, rotating all four initial pairings and opposing source/destination directions. All **180 mutations** succeed without retry; all 60 settled phases reconcile. The database deadlock counter has **zero increase**. This is observed workload evidence, not a proof against every possible future lock interaction.

Actual production mutation BEGINs report **READ COMMITTED** and expense_tracker_app. It is sufficient for these operations because owned transfer and ordered account locks serialize the relevant mutable row checks through completion. PostgreSQL documents that a waiting locking statement sees an updated row and rechecks its condition, while locks remain held until transaction end. See [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html) and [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html). T27's independent multi-query reconciliation uses a read-only REPEATABLE READ test snapshot solely to compare one committed view; production isolation was not changed.

## Changes and reproducible checks

Added backend/tests/helpers/transfer-concurrency.mjs and backend/tests/transfer-concurrency.test.mjs. The existing guarded verify-v2-isolation runner accepts an optional transferConcurrency switch, leaving previous callers unchanged. Added the local T27 temporary directory to .gitignore and updated the implementation checkpoint. No production implementation fix was necessary. Prior uncommitted work is preserved.

Build first, then run against a fresh empty guarded disposable loopback database:

```powershell
npm.cmd --prefix backend run build
$env:T27_DISPOSABLE_DATABASE_URL='postgresql://postgres@127.0.0.1:55451/postgres'
npm.cmd --prefix backend test
```

The fixture preparer rejects unguarded URLs and existing application schemas/roles. Admin access is restricted to disposable setup and test observation; real route writes use the limited role and real local signed JWT/JWKS middleware. No credentials or hosted database are needed.

| Verification | Result |
| --- | --- |
| Focused T27 | 4,833 grouped checks; 29 forced races; six rollback faults; uncertain COMMIT checked |
| Opposing stress | 20 rounds; 180 mutations; zero observed deadlocks |
| Unchanged T26 | 917 checks; 11 races; 11 rollback faults |
| Shared T16 / T17 / T18 / T21 | 599 / 263 / 285 / 244 checks |
| Shared T22 / T23 / T24 | 263 / 3,263 / 6,065 checks |
| Full backend suite | 81 tests; 64 passed; zero failures; 17 environment-gated skips |
| Backend lint / typecheck / build | Passed |
| Production/frontend/migration hash comparison | Zero changes during T27 |

The gated standalone integration entries skip because the single fresh T27 integration runs their shared regression helpers; these skips do not mean the listed regression coverage was omitted. Frontend suites were not rerun because frontend source did not change. The disposable PostgreSQL server was stopped after verification.

## Remaining issues and next task

No genuine T27 blocker remains. T28 — Build Transfer UI is ready, remains unimplemented, and must reuse the approved frontend design and verified T26 API. Recurring tasks remain unstarted.
