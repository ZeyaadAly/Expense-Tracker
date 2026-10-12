import { getFirstOccurrenceOnOrAfter, RecurrenceInputError, type RecurrenceFrequency } from "../domain/recurrence.js";
import type { RecurringFilters, RecurringInput } from "../types/recurring.js";
import { validationError, type FieldError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";
import { validateUuid } from "./request.js";
import { isPositiveTransactionAmount } from "./transaction.js";

export function validateRecurringBody(input: unknown): RecurringInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw validationError([{field:"body",message:"Provide a JSON object."}]);
  const body = input as Record<string, unknown>, errors: FieldError[] = [];
  const required = ["accountId","categoryId","type","amount","description","frequency","startDate"];
  for (const field of Object.keys(body)) if (![...required,"endDate"].includes(field)) errors.push({field,message:"This field is not allowed."});
  for (const field of required) if (typeof body[field] !== "string") errors.push({field,message:"This string field is required."});
  for (const field of ["accountId","categoryId"]) if (typeof body[field] === "string") {
    try { validateUuid(body[field]); } catch { errors.push({field,message:"Provide a canonical hyphenated UUID."}); }
  }
  if (typeof body.type === "string" && !["income","expense"].includes(body.type)) errors.push({field:"type",message:"Choose income or expense."});
  if (typeof body.amount === "string" && !isPositiveTransactionAmount(body.amount)) errors.push({field:"amount",message:"Enter a decimal string from 0.01 to 999999999.99 with at most two decimals."});
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (Array.from(description).length < 1 || Array.from(description).length > 200 || /[\p{Cc}\p{Cs}]/u.test(description)) errors.push({field:"description",message:"Enter 1 to 200 characters after trimming, without control characters or invalid Unicode."});
  const endDate = body.endDate === undefined ? null : body.endDate;
  try {
    getFirstOccurrenceOnOrAfter({startDate:body.startDate as string,frequency:body.frequency as RecurrenceFrequency,endDate:endDate as string|null}, "1900-01-01");
  } catch (error) {
    if (!(error instanceof RecurrenceInputError)) throw error;
    errors.push({field:error.field,message:error.message});
  }
  if (errors.length) throw validationError(errors);
  return {accountId:validateUuid(body.accountId as string),categoryId:validateUuid(body.categoryId as string),type:body.type as RecurringInput["type"],amount:formatDecimal(body.amount as string),description,frequency:body.frequency as RecurrenceFrequency,startDate:body.startDate as string,endDate:endDate as string|null};
}

export function validateRecurringQuery(originalUrl: string): RecurringFilters {
  const query = new URL(originalUrl,"http://localhost").searchParams, errors: FieldError[] = [], filters: RecurringFilters = {};
  for (const key of new Set(query.keys())) {
    if (!["status","type","accountId","categoryId","frequency"].includes(key)) errors.push({field:key,message:"This query parameter is not supported."});
    else if (query.getAll(key).length !== 1) errors.push({field:key,message:"Provide this parameter only once."});
  }
  for (const field of ["status","type","frequency"] as const) {
    const value = query.get(field);
    const allowed = field === "status" ? ["active","paused","archived"] : field === "type" ? ["income","expense"] : ["daily","weekly","monthly","yearly"];
    if (value !== null) {
      if (!allowed.includes(value)) errors.push({field,message:"Choose a supported value or omit the filter."});
      else Object.assign(filters,{[field]:value});
    }
  }
  for (const field of ["accountId","categoryId"] as const) {
    const value = query.get(field);
    if (value !== null) try { filters[field] = validateUuid(value); } catch { errors.push({field,message:"Provide a canonical hyphenated UUID."}); }
  }
  if (errors.length) throw validationError(errors);
  return filters;
}

export function validateUpcomingQuery(originalUrl: string): number {
  const query = new URL(originalUrl,"http://localhost").searchParams;
  for (const key of new Set(query.keys())) if (key !== "days" || query.getAll(key).length !== 1) throw validationError([{field:key,message:"Only one days parameter is supported."}]);
  const days = query.get("days") ?? "30";
  if (!/^[1-9][0-9]{0,2}$/.test(days) || Number(days) > 366) throw validationError([{field:"days",message:"Enter an integer from 1 to 366."}]);
  return Number(days);
}
