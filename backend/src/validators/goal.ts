import type { GoalInput, GoalStatus, GoalUpdate } from "../types/goal.js";
import { validationError, type FieldError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";
import { validateUuid } from "./request.js";
import { isCalendarDate, isPositiveTransactionAmount } from "./transaction.js";

export function validateGoalBody(input: unknown, create: true): GoalInput;
export function validateGoalBody(input: unknown, create?: false): GoalUpdate;
export function validateGoalBody(input: unknown, create = false): GoalInput | GoalUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw validationError([{field:"body",message:"Provide a JSON object."}]);
  const body = input as Record<string, unknown>, errors: FieldError[] = [];
  const fields = ["name", "targetAmount", "savedAmount", "targetDate", "linkedAccountId", ...(create ? [] : ["status"])];
  for (const field of Object.keys(body)) if (!fields.includes(field)) errors.push({field,message:"This field is not allowed."});
  for (const field of create ? fields.slice(0,3) : fields) if (!Object.hasOwn(body,field)) errors.push({field,message:"This field is required."});
  const name = typeof body.name === "string" ? body.name.trim() : "";
  // PostgreSQL text cannot represent NUL or unpaired UTF-16 surrogates.
  if (!name || Array.from(name).length > 120 || name.includes("\u0000") || /\p{Cs}/u.test(name)) errors.push({field:"name",message:"Enter 1 to 120 valid Unicode characters after trimming."});
  if (typeof body.targetAmount !== "string" || !isPositiveTransactionAmount(body.targetAmount)) errors.push({field:"targetAmount",message:"Enter a decimal string from 0.01 to 999999999.99 with at most two decimals."});
  if (typeof body.savedAmount !== "string" || !/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/.test(body.savedAmount)) errors.push({field:"savedAmount",message:"Enter a decimal string from 0.00 to 999999999.99 with at most two decimals."});
  const targetDate = create && body.targetDate === undefined ? null : body.targetDate;
  if (targetDate !== null && (typeof targetDate !== "string" || !isCalendarDate(targetDate))) errors.push({field:"targetDate",message:"Enter a real date from 1900-01-01 to 9999-12-31, or null."});
  let linkedAccountId: string | null = null;
  if (body.linkedAccountId !== null && !(create && body.linkedAccountId === undefined)) {
    try { if (typeof body.linkedAccountId !== "string") throw Error(); linkedAccountId = validateUuid(body.linkedAccountId); }
    catch { errors.push({field:"linkedAccountId",message:"Provide a canonical hyphenated UUID or null."}); }
  }
  if (!create && !["active","completed"].includes(body.status as string)) errors.push({field:"status",message:"Choose active or completed. Use the archive action to archive."});
  if (errors.length) throw validationError(errors);
  const result = {name,targetAmount:formatDecimal(body.targetAmount as string),savedAmount:formatDecimal(body.savedAmount as string),targetDate:targetDate as string|null,linkedAccountId};
  return create ? result : {...result,status:body.status as GoalUpdate["status"]};
}

export function validateGoalQuery(originalUrl: string): GoalStatus | undefined {
  const query = new URL(originalUrl,"http://localhost").searchParams, errors: FieldError[] = [];
  for (const key of new Set(query.keys())) {
    if (key !== "status") errors.push({field:key,message:"This query parameter is not supported."});
    else if (query.getAll(key).length !== 1) errors.push({field:key,message:"Provide this parameter only once."});
  }
  const status = query.get("status");
  if (status !== null && !["active","completed","archived"].includes(status)) errors.push({field:"status",message:"Choose active, completed or archived."});
  if (errors.length) throw validationError(errors);
  return status === null ? undefined : status as GoalStatus;
}
