import type { CategoryFilters, CategoryKind, CategoryStatus } from "../types/category.js";
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
