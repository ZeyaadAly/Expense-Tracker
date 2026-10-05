import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Category, TransactionInput, TransactionRow, TransactionType } from "../types/transaction.js";
import { mapTransaction } from "../utils/transaction-mapper.js";
import { formatDecimal } from "../utils/money.js";

export type TransactionFilters = { type?: TransactionType; category?: Category };
const columns = `id, type, amount::text AS amount, description, category,
  to_char(transaction_date, 'YYYY-MM-DD') AS transaction_date, created_at, updated_at`;

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
        clauses.push(`category = $${values.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await database.query<TransactionRow>(
        `SELECT ${columns} FROM expense_tracker.transactions ${where}
         ORDER BY transaction_date DESC, created_at DESC, id DESC`, values,
      );
      return result.rows.map(mapTransaction);
    },
    async get(id: string) {
      const result = await database.query<TransactionRow>(
        `SELECT ${columns} FROM expense_tracker.transactions WHERE id = $1`, [id],
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
