import type { Pool } from "pg";
import type { AccountResource, AccountStatus, NetPosition } from "../types/account.js";
import { ApiError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";

type AccountRow = Omit<AccountResource, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };

// One statement snapshot. Restrict every activity aggregate to owned scoped accounts,
// then join one row per account: transactions and transfers cannot multiply each other.
// All persisted transactions/transfers are posted in the current schema. Definitions
// and occurrence reservations are deliberately absent from this financial query.
const balances = `WITH scoped_accounts AS MATERIALIZED (
  SELECT * FROM expense_tracker.accounts
  WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2)
    AND ($3::text IS NULL OR status=$3)
), transaction_totals AS (
  SELECT t.account_id, sum(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END) AS delta
  FROM expense_tracker.transactions t JOIN scoped_accounts a ON a.id=t.account_id AND a.user_id=t.user_id
  WHERE t.user_id=$1 GROUP BY t.account_id
), transfer_entries AS (
  SELECT t.source_account_id AS account_id, -t.amount AS delta
  FROM expense_tracker.transfers t JOIN scoped_accounts a ON a.id=t.source_account_id AND a.user_id=t.user_id
  WHERE t.user_id=$1
  UNION ALL
  SELECT t.destination_account_id AS account_id, t.amount AS delta
  FROM expense_tracker.transfers t JOIN scoped_accounts a ON a.id=t.destination_account_id AND a.user_id=t.user_id
  WHERE t.user_id=$1
), transfer_totals AS (
  SELECT account_id,sum(delta) AS delta FROM transfer_entries GROUP BY account_id
), account_balances AS (
  SELECT a.*, a.opening_balance + CASE WHEN a.type='credit_card' THEN -1 ELSE 1 END
    * (COALESCE(t.delta,0::numeric)+COALESCE(f.delta,0::numeric)) AS balance
  FROM scoped_accounts a LEFT JOIN transaction_totals t ON t.account_id=a.id
    LEFT JOIN transfer_totals f ON f.account_id=a.id
)`;
const resources = `${balances}
  SELECT id,name,type,currency,status,opening_balance::text AS "openingBalance",
    NOT opening_balance_locked AS "openingBalanceEditable",created_at AS "createdAt",updated_at AS "updatedAt",
    balance::text AS "currentBalance" FROM account_balances ORDER BY created_at ASC,id ASC`;
const netPosition = `${balances}
  SELECT COALESCE(sum(CASE WHEN type='credit_card' THEN -balance ELSE balance END),0::numeric)::text AS "netPosition"
  FROM account_balances`;
const map = (row: AccountRow): AccountResource => ({
  id: row.id, name: row.name, type: row.type, currency: row.currency, status: row.status,
  openingBalance: formatDecimal(row.openingBalance), currentBalance: formatDecimal(row.currentBalance),
  openingBalanceEditable: row.openingBalanceEditable,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

// Accept a Pool or checked-out client so mutation responses share their transaction.
// These reads acquire no account row locks and never write financial state.
export function createAccountBalanceRepository(database: Pick<Pool, "query">) {
  return {
    async getAccountBalance(userId: string, accountId: string): Promise<AccountResource> {
      const result = await database.query<AccountRow>(resources, [userId, accountId, null]);
      if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Account not found.");
      return map(result.rows[0]);
    },
    async getAccountBalances(userId: string, status?: AccountStatus): Promise<AccountResource[]> {
      const result = await database.query<AccountRow>(resources, [userId, null, status ?? null]);
      return result.rows.map(map);
    },
    async getNetPosition(userId: string): Promise<NetPosition> {
      // No status filter: archives cannot remove assets or debt from net worth.
      const result = await database.query<{ netPosition: string }>(netPosition, [userId, null, null]);
      return { netPosition: formatDecimal(result.rows[0].netPosition), currency: "EGP" };
    },
  };
}
export type AccountBalanceRepository = ReturnType<typeof createAccountBalanceRepository>;
