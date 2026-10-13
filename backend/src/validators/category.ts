import type { CategoryFilters, CategoryInput, CategoryKind, CategoryStatus } from "../types/category.js";
import { validationError, type FieldError } from "../utils/api-error.js";

export function validateCategoryQuery(originalUrl: string): CategoryFilters {
  const query = new URL(originalUrl, "http://localhost").searchParams;
  const errors: FieldError[] = [];
  for (const key of new Set(query.keys())) {
    if (!["kind", "status"].includes(key)) errors.push({ field: key, message: "This query parameter is not supported." });
    else if (query.getAll(key).length !== 1) errors.push({ field: key, message: "Provide this parameter only once." });
  }
  const kind = query.get("kind");
  const status = query.get("status");
  if (kind !== null && !["income", "expense", "both"].includes(kind)) errors.push({ field: "kind", message: "Choose income, expense or both, or omit the filter." });
  if (status !== null && !["active", "archived"].includes(status)) errors.push({ field: "status", message: "Choose active or archived, or omit the filter." });
  if (errors.length) throw validationError(errors);
  return { ...(kind === null ? {} : { kind: kind as CategoryKind }), status: (status ?? "active") as CategoryStatus };
}

export function validateCategoryBody(input: unknown): CategoryInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw validationError([{ field: "body", message: "Provide a JSON object." }]);
  const body = input as Record<string, unknown>, errors: FieldError[] = [];
  for (const field of Object.keys(body)) if (!["name", "kind", "icon", "color"].includes(field)) errors.push({ field, message: "This field is not allowed." });
  for (const field of ["name", "kind"]) if (!Object.hasOwn(body, field)) errors.push({ field, message: "This field is required." });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || Array.from(name).length > 80 || /[\p{Cc}\p{Cs}]/u.test(name) || !/[^\p{Cf}\s]/u.test(name)) errors.push({ field: "name", message: "Enter 1 to 80 characters after trimming. Control characters are not allowed." });
  if (!["income", "expense", "both"].includes(body.kind as string)) errors.push({ field: "kind", message: "Choose income, expense or both." });
  const optionalText = (field: "icon" | "color", max: number): string | null => {
    const value = body[field];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") { errors.push({ field, message: `Enter at most ${max} characters or null.` }); return null; }
    const trimmed = value.trim();
    if (!trimmed || Array.from(trimmed).length > max || /[\p{Cc}\p{Cs}]/u.test(trimmed) || !/[^\p{Cf}\s]/u.test(trimmed)) errors.push({ field, message: `Enter 1 to ${max} characters or null. Control characters are not allowed.` });
    return trimmed;
  };
  const icon = optionalText("icon", 64), color = optionalText("color", 16);
  if (errors.length) throw validationError(errors);
  return { name, kind: body.kind as CategoryKind, icon, color };
}

export function validateCategoryActionBody(input: unknown): void {
  if (input === undefined) return;
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.keys(input).length) throw validationError([{ field: "body", message: "Provide an empty object or omit the body." }]);
}
