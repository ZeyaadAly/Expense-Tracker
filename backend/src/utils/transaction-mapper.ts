import type { Transaction, TransactionRow } from "../types/transaction.js";
import { isCalendarDate } from "../validators/transaction.js";
import { validateUuid } from "../validators/request.js";
import { formatDecimal } from "./money.js";

export function mapTransaction(row: TransactionRow): Transaction {
  if (typeof row.transaction_date !== "string" || !isCalendarDate(row.transaction_date)) {
    throw new Error("Database date must be a date-only string");
  }
  let id: string;
  try { id = validateUuid(row.id); }
  catch { throw new Error("Invalid database transaction identifier"); }
  return { id, type: row.type, amount: formatDecimal(row.amount),
    description: row.description, category: row.category, date: row.transaction_date,
    currency: "EGP", createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
