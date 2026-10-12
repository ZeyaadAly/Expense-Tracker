import type { Pool } from "pg";
import { formatDecimal } from "../utils/money.js";

// V2 period actuals. Kept reusable for later analytics; V1's unscoped compatibility summary is unchanged.
export async function getTransactionTotals(database:Pick<Pool,"query">,userId:string,from:string,to:string) {
  const result = await database.query<{income:string;expenses:string;netSavings:string}>(`WITH totals AS (
    SELECT COALESCE(sum(amount) FILTER (WHERE type='income'),0::numeric) AS income,
      COALESCE(sum(amount) FILTER (WHERE type='expense'),0::numeric) AS expenses
    FROM expense_tracker.transactions WHERE user_id=$1 AND transaction_date BETWEEN $2::date AND $3::date
  ) SELECT income::text,expenses::text,(income-expenses)::text AS "netSavings" FROM totals`,[userId,from,to]);
  const row = result.rows[0];
  return {income:formatDecimal(row.income),expenses:formatDecimal(row.expenses),netSavings:formatDecimal(row.netSavings)};
}
