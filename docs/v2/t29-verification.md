# T29 — Recurring backend dependency review

Date: 2026-10-08. Status: **Blocked; implementation not started.**

## Dependency evidence

The revised implementation plan explicitly makes T29 depend on T30/T32. T30 says it precedes T29; T32 says it precedes T29/T31. Task numbers are identifiers, not execution order. The dependency map repeats these prerequisites.

The current backend has no shared recurring calculator, recurring-definition service/routes or calculator tests. T15 verification explicitly reserves full terminal transitions, generated pair/definition/date identity and reservation lifecycle for T32. Existing occurrence tables, ownership keys and deletion restrictions are necessary foundations, not completed T32 acceptance.

The supplied T29 request §41 requires reporting that T30 must execute first when the plan requires it; §20 requires stopping rather than inventing incomplete calculation. Create, edit and resume need anchored, nonterminal next-occurrence selection on/after Cairo today. Temporary logic would violate that instruction.

## Frozen contract reviewed; not implemented or newly verified

Planned authenticated routes: GET/POST `/api/v2/recurring`, GET/PUT `/api/v2/recurring/:id`, POST `/api/v2/recurring/:id/pause`, `/resume`, `/archive`. No restore or hard-delete endpoint.

Inputs derive ownership from verified authentication. Accounts must be owned and active; categories visible, active and type-compatible. Income/expense only; amount is an exact decimal string from 0.01 through 999999999.99. Description, real date bounds, frequency, unknown fields and queries require strict validation. Frozen list filters are type, status, accountId, categoryId and frequency.

Schedule frequencies are daily, weekly, monthly and yearly, anchored exclusively to startDate. No independent weekday/month-day inputs. nextOccurrence is server-owned; endDate is nullable and inclusive. Creation does not backfill history. Monthly clamping preserves the original anchor; yearly leap-day behavior is owned by T30.

Pause clears nextOccurrence and skips unposted pending/failed reservations. Resume selects the first eligible nonterminal anchored date on/after today without paused-history backfill. Archive is terminal. Edits preserve posted transactions and terminal occurrence markers. T32's persistence guarantees are required before these behaviors can be accepted.

Existing T17 account archive pauses definitions and skips unposted reservations; restore does not resume them. Future T29 resume must validate active account/category references. Definitions alone must have no financial effect.

## Changes and verification limits

Only documentation changed: this report and the implementation-plan checkpoint/dependency note. Database/API contracts remain unchanged; no schema clarification is needed for this dependency finding.

No backend/frontend code, grants, migrations, financial data or remote production resources were changed. No test server or disposable database was started. No transaction generation, processing, scheduler, frontend integration or T30/T32 implementation was started. Existing uncommitted work was preserved.

Read-only repository searches and the explicit plan/T15 evidence establish the dependency blocker. Lint, typecheck, build, recurring API isolation, lifecycle races, fault injection and financial/history regressions were **not run for T29**: there is no T29 implementation to verify. Previous reports are not represented as new T29 test results.

## Next task

**T30 — Implement Recurrence Calculator**, followed by **T32 — Implement Durable Occurrence Persistence**, then return to **T29 — Build Recurring Backend**. None is started automatically. T01–T28 completion remains unchanged; T29 must not be marked complete.
