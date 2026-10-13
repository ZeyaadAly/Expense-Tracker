import { isCalendarDate } from "../validators/transaction.js";

export interface AnalyticsRange { readonly from: string; readonly to: string; readonly accountId?: string }
export interface NormalizedAnalyticsRange extends AnalyticsRange { readonly calendarDays: number }
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// Gregorian calendar integers only; no instants, clock, time-zone conversion or money.
function ordinal(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const previous = year - 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const beforeMonth = [0,31,59,90,120,151,181,212,243,273,304,334];
  return previous*365 + Math.floor(previous/4) - Math.floor(previous/100) + Math.floor(previous/400)
    + beforeMonth[month-1] + (leap && month>2 ? 1 : 0) + day;
}

/** Internal defensive boundary. T39 owns parsing HTTP query strings and public validation errors. */
export function normalizeAnalyticsRange(userId: string, input: AnalyticsRange): NormalizedAnalyticsRange {
  if (typeof userId !== "string" || !uuid.test(userId)) throw new RangeError("A normalized trusted user ID is required.");
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key=>!["from","to","accountId"].includes(key))
    || typeof input.from !== "string" || !isCalendarDate(input.from)
    || typeof input.to !== "string" || !isCalendarDate(input.to) || input.from>input.to
    || (input.accountId!==undefined && (typeof input.accountId!=="string" || !uuid.test(input.accountId)))) {
    throw new RangeError("A normalized inclusive analytics range is required.");
  }
  const calendarDays = ordinal(input.to)-ordinal(input.from)+1;
  if (calendarDays>366) throw new RangeError("Analytics ranges must contain at most 366 calendar days.");
  return {...input,calendarDays};
}
