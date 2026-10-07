import { accountTypes, type AccountInput, type AccountStatus, type AccountType } from "../types/account.js";
import { validationError, type FieldError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";

export function validateAccountBody(input: unknown, create = false): AccountInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw validationError([{ field: "body", message: "Provide a JSON object." }]);
  const body = input as Record<string, unknown>, errors: FieldError[] = [];
  const fields = ["name", "type", "openingBalance", ...(create ? ["currency"] : [])];
  for (const field of Object.keys(body)) if (!fields.includes(field)) errors.push({ field, message: "This field is not allowed." });
  for (const field of fields) if (!Object.hasOwn(body, field)) errors.push({ field, message: "This field is required." });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || Array.from(name).length > 100 || /[\p{Cc}\p{Cs}]/u.test(name) || !/[^\p{Cf}\s]/u.test(name)) errors.push({ field: "name", message: "Enter 1 to 100 characters after trimming. Control characters are not allowed." });
  if (!accountTypes.includes(body.type as AccountType)) errors.push({ field: "type", message: "Choose a supported account type." });
  const money = body.openingBalance;
  if (typeof money !== "string" || !/^-?(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/.test(money) || /^-0(?:\.0{1,2})?$/.test(money)) errors.push({ field: "openingBalance", message: "Enter a decimal string between -999999999.99 and 999999999.99 with at most two decimals." });
  if (create && body.currency !== "EGP") errors.push({ field: "currency", message: "Currency must be EGP." });
  if (errors.length) throw validationError(errors);
  return { name, type: body.type as AccountType, openingBalance: formatDecimal(money as string) };
}

export function validateAccountQuery(originalUrl: string): AccountStatus {
  const query = new URL(originalUrl, "http://localhost").searchParams, errors: FieldError[] = [];
  for (const key of new Set(query.keys())) if (key !== "status" || query.getAll(key).length !== 1) errors.push({ field: key, message: "Only one status filter is supported." });
  const status = query.get("status") ?? "active";
  if (!["active", "archived"].includes(status)) errors.push({ field: "status", message: "Choose active or archived." });
  if (errors.length) throw validationError(errors);
  return status as AccountStatus;
}

export function validateAccountActionBody(input: unknown): void {
  if (input === undefined) return;
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.keys(input).length) throw validationError([{ field: "body", message: "Provide an empty object or omit the body." }]);
}
