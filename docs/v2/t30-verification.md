# T30 — Authoritative recurrence calculator

Date: 2026-10-08. Status: **Completed locally.** T32 is next; T29 remains blocked on T32.

## Reusable domain API

Module: `backend/src/domain/recurrence.ts`.

- `getFirstOccurrenceOnOrAfter(definition, referenceDate): string | null` returns the first anchored date at or after the explicit reference, never before startDate.
- `getNextOccurrenceAfter(definition, referenceDate): string | null` returns the first anchored date strictly after the explicit reference. The reference need not itself be an occurrence.
- `RecurrenceDefinition` contains readonly startDate, frequency and optional nullable endDate only. Runtime validation rejects unknown scheduling fields, including independent weekday/month-day inputs.
- `RecurrenceInputError` extends RangeError with a field identifier. Invalid schedules/references throw; valid exhausted schedules return null. Future HTTP validation and error mapping remain caller responsibilities.

No range-array API is needed yet. Callers can advance one occurrence at a time with explicit limits, retaining the original definition. The calculator has no ownership, status, terminal-marker or database knowledge: T29/T32 must skip durable terminal dates and apply active-parent/lifecycle policy. Mathematical eligibility does not imply permission to post.

## Calendar semantics

Daily advances by calendar days; weekly by seven days from startDate, retaining its weekday. Monthly derives every candidate from the original start day, clamping to the target month's last valid day. Jan 31 → Feb 28/29 → Mar 31 never drifts. Anchors 1/28/29/30/31 are covered.

Yearly derives the original month/day anew each year. Feb 29 → Feb 28 in non-leap years → Feb 29 in leap years. Gregorian divisible-by-4, century and divisible-by-400 rules are covered, including 1900, 2000, 2100 and 2400.

References and starts are real YYYY-MM-DD dates from 1900-01-01 through 9999-12-31. EndDate must not precede startDate and is inclusive. Candidates beyond endDate or the supported upper bound return null; no year 10000 escapes.

Past-start creation and resume callers pass Cairo today to the on-or-after operation: monthly day 1 with reference 2026-10-08 returns 2026-11-01, without enumerating missed history. Exact occurrence references are included by on-or-after and excluded by strictly-after. Future starts return startDate when eligible.

## Purity, timezone and bounds

Production calculation uses integer Gregorian day numbers, bounded year binary search (at most 14 comparisons), and at most 12 month comparisons. Weekly/daily jumps and monthly/yearly candidate selection avoid iteration over elapsed history. Calendar integers are safely within JavaScript's exact integer range; there are no financial calculations.

No Date constructor, clock, environment, database, network or new dependency is used by the module. It does not convert calendar strings into instants. Callers provide an explicit Cairo reference using the existing cairoToday utility at the boundary. That utility is unchanged. Tests cover winter/summer Cairo midnight and date-only progression across clock-change periods.

## Verification

- Backend lint: passed.
- Backend typecheck: passed.
- Backend build: passed.
- Recurrence tests: **14 passed**, included in the full suite.
- Full backend suite: **95 tests; 77 passed, 18 skipped, 0 failed**. Skips are existing explicitly gated disposable-PostgreSQL tests, not recurrence tests. No database cluster was started.

Tests include every frequency, exact/between/future/past references, long paused gaps, inclusive exhaustion, invalid runtime inputs, century rules, 100-step monotonic catch-up sequences, independent UTC test-oracle comparisons across centuries, and repeated 1900-to-9999 queries. The 1,000-iteration long-horizon test (3,000 calculations) took approximately 6 ms locally; this is an observation, not a timing acceptance threshold.

The initial invalid-input test incorrectly treated nullable endDate as invalid. It was corrected to honor the frozen contract; the final full suite passes. Production semantics did not change in response to that test correction.

Commands: `npm.cmd --prefix backend run lint`, `npm.cmd --prefix backend run typecheck`, `npm.cmd --prefix backend run build`, `node --test backend/tests/recurrence.test.mjs`, `npm.cmd --prefix backend test`.

## Scope and next task

Added the domain module, recurrence unit tests and this report; updated the implementation-plan checkpoint. Existing architecture already specifies anchor/clamp mechanics and needs no contract change.

No public routes, persistence, migrations, grants, generated transactions, scheduler, frontend, production resources or existing date utilities changed. Existing uncommitted work was preserved. No remaining T30 blockers.

Next: **T32 — Durable Occurrence Persistence / Idempotency Layer**, then return to T29. T32 was not started automatically.
