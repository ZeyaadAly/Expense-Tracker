import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Category, TransactionInput, TransactionRow, TransactionType } from "../types/transaction.js";
import { mapTransaction } from "../utils/transaction-mapper.js";
import { formatDecimal } from "../utils/money.js";

export type TransactionFilters = { type?: TransactionType; category?: Category };
const columns = `id, type, amount::text AS amount, description, category,
  to_char(transaction_date, 'YYYY-MM-DD') AS transaction_date, created_at, updated_at`;
// Read-only compatibility for new V2 rows. to_jsonb also works before T11 adds category_id.
// Retained legacy evidence is never rewritten; category IDs are authoritative after T15.
// Custom categories use V1's Other bucket; unmigrated rows retain their existing text.
const legacyCategory = `CASE WHEN to_jsonb(transactions)->>'category_id' IS NULL THEN category
  ELSE CASE to_jsonb(transactions)->>'category_id'
  WHEN 'c1200000-0000-4000-8000-000000000001' THEN 'salary'
  WHEN 'c1200000-0000-4000-8000-000000000002' THEN 'freelance'
  WHEN 'c1200000-0000-4000-8000-000000000003' THEN 'gift'
  WHEN 'c1200000-0000-4000-8000-000000000004' THEN 'food'
  WHEN 'c1200000-0000-4000-8000-000000000005' THEN 'transport'
  WHEN 'c1200000-0000-4000-8000-000000000006' THEN 'shopping'
  WHEN 'c1200000-0000-4000-8000-000000000007' THEN 'bills'
  WHEN 'c1200000-0000-4000-8000-000000000008' THEN 'entertainment'
  ELSE 'other' END END`;
const readColumns = columns.replace("description, category,", `description, ${legacyCategory} AS category,`);

export function createTransactionService(database: Pick<Pool, "query">) {
  return {
    async delete(id: string) {
      const result = await database.query("DELETE FROM expense_tracker.transactions WHERE id = $1 RETURNING id", [id]);
      return result.rows.length > 0;
    },
    async update(id: string, input: TransactionInput) {
      const result = await database.query<TransactionRow>(
        `UPDATE expense_tracker.transactions
         SET type = $2, amount = $3, description = $4, category = $5, transaction_date = $6
         WHERE id = $1 RETURNING ${columns}`,
        [id, input.type, input.amount, input.description, input.category, input.date],
      );
      return result.rows[0] ? mapTransaction(result.rows[0]) : null;
    },
    async create(input: TransactionInput) {
      const result = await database.query<TransactionRow>(
        `INSERT INTO expense_tracker.transactions
          (id, type, amount, description, category, transaction_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
        [randomUUID(), input.type, input.amount, input.description, input.category, input.date],
      );
      return mapTransaction(result.rows[0]);
    },
    async list(filters: TransactionFilters) {
      const clauses: string[] = [];
      const values: string[] = [];
      if (filters.type !== undefined) {
        values.push(filters.type);
        clauses.push(`type = $${values.length}`);
      }
      if (filters.category !== undefined) {
        values.push(filters.category);
        clauses.push(`(${legacyCategory}) = $${values.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await database.query<TransactionRow>(
        `SELECT ${readColumns} FROM expense_tracker.transactions ${where}
         ORDER BY transaction_date DESC, created_at DESC, id DESC`, values,
      );
      return result.rows.map(mapTransaction);
    },
    async get(id: string) {
      const result = await database.query<TransactionRow>(
        `SELECT ${readColumns} FROM expense_tracker.transactions WHERE id = $1`, [id],
      );
      return result.rows[0] ? mapTransaction(result.rows[0]) : null;
    },
    async summary() {
      const result = await database.query<{
        total_income: string; total_expenses: string; balance: string; transaction_count: string;
      }>(`WITH totals AS (
        SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0::numeric) AS income,
          COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0::numeric) AS expenses,
          COUNT(*) AS count FROM expense_tracker.transactions
      ) SELECT income::text AS total_income, expenses::text AS total_expenses,
        (income - expenses)::text AS balance, count::text AS transaction_count FROM totals`);
      const row = result.rows[0];
      const count = Number(row.transaction_count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid transaction count");
      return { totalIncome: formatDecimal(row.total_income), totalExpenses: formatDecimal(row.total_expenses),
        balance: formatDecimal(row.balance), currency: "EGP" as const, transactionCount: count, scope: "all" as const };
    },
  };
}
export type TransactionService = ReturnType<typeof createTransactionService>;
