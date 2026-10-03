import { categories, type Category, type TransactionInput, type TransactionType } from "../types/transaction.js";
import { validationError, type FieldError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";

export function cairoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function validateTransaction(input: unknown, now = new Date()): TransactionInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validationError([{ field: "body", message: "Provide a JSON object with all five editable fields." }]);
  }
  const body = input as Record<string, unknown>;
  const fields = ["type", "amount", "description", "category", "date"];
  const errors: FieldError[] = [];
  for (const field of Object.keys(body)) {
    if (!fields.includes(field)) errors.push({ field, message: "This field is not allowed." });
  }
  for (const field of fields) {
    if (!Object.hasOwn(body, field)) errors.push({ field, message: "This field is required." });
    else if (typeof body[field] !== "string") errors.push({ field, message: "Enter a string value." });
  }
  const typeValid = body.type === "income" || body.type === "expense";
  if (typeof body.type === "string" && !typeValid) errors.push({ field: "type", message: "Choose income or expense." });
  if (typeof body.amount === "string" &&
    (!/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/.test(body.amount) || /^0(?:\.0{1,2})?$/.test(body.amount))) {
    errors.push({ field: "amount", message: "Enter a positive amount from 0.01 to 999999999.99 with at most two decimal places." });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (typeof body.description === "string" && (Array.from(description).length < 1 || Array.from(description).length > 200)) {
    errors.push({ field: "description", message: "Enter a description of 1 to 200 characters after trimming." });
  }
  if (typeof body.category === "string") {
    const allowed: readonly string[] = typeValid ? categories[body.type as TransactionType] : [...categories.income, ...categories.expense];
    if (!allowed.includes(body.category)) errors.push({ field: "category", message: "Choose a category valid for the selected type." });
  }
  if (typeof body.date === "string" && (!isCalendarDate(body.date) || body.date > cairoToday(now))) {
    errors.push({ field: "date", message: "Enter a real date from 1900-01-01 through today in Africa/Cairo." });
  }
  if (errors.length) throw validationError(errors);
  return { type: body.type as TransactionType, amount: formatDecimal(body.amount as string),
    description, category: body.category as Category, date: body.date as string };
}
