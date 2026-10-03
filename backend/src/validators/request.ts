import { categories, type Category, type TransactionType } from "../types/transaction.js";
import { validationError, type FieldError } from "../utils/api-error.js";

export function validateUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw validationError([{ field: "id", message: "Provide a canonical hyphenated UUID." }]);
  }
  return value.toLowerCase();
}

// Parse the original URL so repeated keys and bracket notation cannot be hidden by a query parser.
export function validateQuery(originalUrl: string, allowFilters = false): {type?: TransactionType; category?: Category} {
  const query = new URL(originalUrl, "http://localhost").searchParams;
  const errors: FieldError[] = [];
  for (const key of new Set(query.keys())) {
    if (!allowFilters || !["type", "category"].includes(key)) errors.push({ field: key, message: "This query parameter is not supported." });
    else if (query.getAll(key).length !== 1) errors.push({ field: key, message: "Provide this parameter only once." });
  }
  const type = query.get("type");
  const category = query.get("category");
  if (allowFilters) {
    if (type !== null && type !== "income" && type !== "expense") errors.push({ field: "type", message: "Choose income or expense, or omit the filter." });
    const allowed: readonly string[] = type === "income" || type === "expense" ? categories[type] : [...categories.income, ...categories.expense];
    if (category !== null && !allowed.includes(category)) errors.push({ field: "category", message: "Choose a category valid for the selected type, or omit the filter." });
  }
  if (errors.length) throw validationError(errors);
  return { ...(type === null ? {} : {type: type as TransactionType}), ...(category === null ? {} : {category: category as Category}) };
}
