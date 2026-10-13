import { normalizeAnalyticsRange, type AnalyticsRange } from "../domain/analytics-range.js";
import { isCalendarDate } from "./transaction.js";
import { validationError, type FieldError } from "../utils/api-error.js";

/** Public strings only; T38 owns calendar length and financial semantics. */
export function validateAnalyticsQuery(originalUrl: string, userId: string): AnalyticsRange {
  const query = new URL(originalUrl, "http://localhost").searchParams;
  const errors: FieldError[] = [];
  for (const key of new Set(query.keys())) {
    if (!["from", "to", "accountId"].includes(key)) errors.push({field:key,message:"This query parameter is not supported."});
    else if (query.getAll(key).length !== 1) errors.push({field:key,message:"Provide this parameter only once."});
  }
  const from = query.get("from"), to = query.get("to"), account = query.get("accountId");
  for (const [field,value] of [["from",from],["to",to]]) {
    if (!value || !isCalendarDate(value)) errors.push({field:field!,message:"Enter a real date from 1900-01-01 through 9999-12-31 as YYYY-MM-DD."});
  }
  if (account !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(account)) errors.push({field:"accountId",message:"Enter a valid account ID."});
  if (errors.length) throw validationError(errors);
  const range = {from:from!,to:to!,...(account===null?{}:{accountId:account.toLowerCase()})};
  try { normalizeAnalyticsRange(userId,range); }
  catch { throw validationError([{field:"to",message:"Choose an inclusive range from from through to containing at most 366 calendar days."}]); }
  return range;
}
