export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceDefinition {
  readonly startDate: string;
  readonly frequency: RecurrenceFrequency;
  readonly endDate?: string | null;
}

/** Internal input error; HTTP validation/mapping belongs to the caller. */
export class RecurrenceInputError extends RangeError {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "RecurrenceInputError";
  }
}

interface CalendarDate { year: number; month: number; day: number }
const frequencies: readonly string[] = ["daily", "weekly", "monthly", "yearly"];
const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  return month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    ? 29 : monthLengths[month - 1];
}

function parseDate(value: unknown, field: string): CalendarDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RecurrenceInputError(field, "Expected a YYYY-MM-DD calendar date.");
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RecurrenceInputError(field, "Expected a real date from 1900-01-01 through 9999-12-31.");
  }
  return { year, month, day };
}

function daysBeforeYear(year: number): number {
  const previous = year - 1;
  return 365 * previous + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400);
}

/** Zero-based Gregorian day number. All integers are well below Number's exact limit. */
function ordinal(date: CalendarDate): number {
  let result = daysBeforeYear(date.year) + date.day - 1;
  for (let month = 1; month < date.month; month++) result += daysInMonth(date.year, month);
  return result;
}

function fromOrdinal(value: number): CalendarDate {
  // At most 14 year comparisons and 12 month comparisons, independent of the gap.
  let lower = 1900, upper = 9999;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (daysBeforeYear(middle) <= value) lower = middle;
    else upper = middle - 1;
  }
  let remaining = value - daysBeforeYear(lower), month = 1;
  while (remaining >= daysInMonth(lower, month)) {
    remaining -= daysInMonth(lower, month);
    month++;
  }
  return { year: lower, month, day: remaining + 1 };
}

function formatDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function anchoredDate(anchor: CalendarDate, year: number, month: number): CalendarDate {
  return { year, month, day: Math.min(anchor.day, daysInMonth(year, month)) };
}

function findOccurrence(definition: RecurrenceDefinition, referenceDate: string, strictlyAfter: boolean): string | null {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
    throw new RecurrenceInputError("definition", "Expected a recurrence definition.");
  }
  for (const field of Object.keys(definition)) {
    if (!["startDate", "frequency", "endDate"].includes(field)) {
      throw new RecurrenceInputError(field, "Unsupported schedule input.");
    }
  }
  const anchor = parseDate(definition.startDate, "startDate");
  if (!frequencies.includes(definition.frequency)) throw new RecurrenceInputError("frequency", "Unsupported recurrence frequency.");
  const end = definition.endDate == null ? null : parseDate(definition.endDate, "endDate");
  if (end && definition.endDate! < definition.startDate) throw new RecurrenceInputError("endDate", "End date must not precede start date.");
  const reference = parseDate(referenceDate, "referenceDate");
  const maximum = ordinal(end ?? { year: 9999, month: 12, day: 31 });
  const lower = Math.max(ordinal(anchor), ordinal(reference) + (strictlyAfter ? 1 : 0));
  if (lower > maximum) return null;

  let candidate: CalendarDate;
  if (definition.frequency === "daily" || definition.frequency === "weekly") {
    const interval = definition.frequency === "daily" ? 1 : 7;
    const first = ordinal(anchor);
    const next = first + Math.ceil((lower - first) / interval) * interval;
    if (next > maximum) return null;
    candidate = fromOrdinal(next);
  } else {
    const target = fromOrdinal(lower);
    candidate = anchoredDate(anchor, target.year, definition.frequency === "monthly" ? target.month : anchor.month);
    if (ordinal(candidate) < lower) {
      const month = definition.frequency === "monthly" ? target.month % 12 + 1 : anchor.month;
      const year = target.year + (definition.frequency === "yearly" || target.month === 12 ? 1 : 0);
      if (year > 9999) return null;
      candidate = anchoredDate(anchor, year, month);
    }
  }
  return ordinal(candidate) > maximum ? null : formatDate(candidate);
}

/** First anchored date >= referenceDate, respecting startDate and inclusive endDate. */
export function getFirstOccurrenceOnOrAfter(definition: RecurrenceDefinition, referenceDate: string): string | null {
  return findOccurrence(definition, referenceDate, false);
}

/** First anchored date > referenceDate; reference need not itself be an occurrence. */
export function getNextOccurrenceAfter(definition: RecurrenceDefinition, referenceDate: string): string | null {
  return findOccurrence(definition, referenceDate, true);
}
