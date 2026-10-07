import type { Pool, PoolClient } from "pg";
import type { AccountInput, AccountResource, AccountStatus } from "../types/account.js";
import { ApiError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";
import { createAccountBalanceRepository } from "./account-balances.js";

const missing = () => new ApiError(404, "NOT_FOUND", "Account not found.");
const conflict = (message: string) => new ApiError(409, "ACCOUNT_CONFLICT", message);

export function createAccountService(database: Pick<Pool, "query" | "connect">) {
  async function read(client: Pick<Pool, "query">, userId: string, id: string): Promise<AccountResource> {
    return createAccountBalanceRepository(client).getAccountBalance(userId, id);
  }
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) {
      await client.query("ROLLBACK");
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "accounts_user_name_unique") throw conflict("An account with this name already exists.");
      throw error;
    } finally { client.release(); }
  }
  async function lock(client: PoolClient, userId: string, id: string) {
    const result = await client.query<{ opening_balance: string; opening_balance_locked: boolean; type: string; status: AccountStatus }>("SELECT opening_balance,opening_balance_locked,type,status FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
    if (!result.rows[0]) throw missing();
    return result.rows[0];
  }
  return {
    getSummary: (userId: string) => createAccountBalanceRepository(database).getNetPosition(userId),
    listAccounts: (userId: string, status: AccountStatus) => createAccountBalanceRepository(database).getAccountBalances(userId, status),
    getAccount: (userId: string, id: string) => read(database, userId, id),
    createAccount: (userId: string, input: AccountInput) => transaction(async client => {
      const result = await client.query<{ id: string }>("INSERT INTO expense_tracker.accounts(user_id,name,type,opening_balance,currency) VALUES($1,$2,$3,$4,'EGP') RETURNING id", [userId, input.name, input.type, input.openingBalance]);
      return read(client, userId, result.rows[0].id);
    }),
    updateAccount: (userId: string, id: string, input: AccountInput) => transaction(async client => {
      const row = await lock(client, userId, id);
      if (row.opening_balance_locked && (formatDecimal(row.opening_balance) !== input.openingBalance || (row.type === "credit_card") !== (input.type === "credit_card"))) throw conflict("Posted activity locks opening balance and credit-card conversion.");
      await client.query(`UPDATE expense_tracker.accounts SET name=$3,type=$4,opening_balance=$5 WHERE id=$1 AND user_id=$2
        AND (name IS DISTINCT FROM $3 OR type IS DISTINCT FROM $4 OR opening_balance IS DISTINCT FROM $5::numeric)`, [id, userId, input.name, input.type, input.openingBalance]);
      return read(client, userId, id);
    }),
    archiveAccount: (userId: string, id: string) => transaction(async client => {
      await lock(client, userId, id);
      // Lock definitions before the T15 archive trigger pauses them; concurrent active
      // assignments lock this account through validate_v2_account_use and cannot pass.
      const definitions = await client.query<{ id: string; status: string }>("SELECT id,status FROM expense_tracker.recurring_transactions WHERE account_id=$1 AND user_id=$2 ORDER BY id FOR UPDATE", [id, userId]);
      const pausedRecurringCount = definitions.rows.filter(row => row.status === "active").length;
      await client.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1 AND user_id=$2 AND status='active'", [id, userId]);
      await client.query(`UPDATE expense_tracker.recurring_occurrences o SET status='skipped',processed_at=statement_timestamp(),failure_code=NULL
        WHERE o.user_id=$2 AND o.status IN ('pending','failed') AND o.generated_transaction_id IS NULL
        AND EXISTS (SELECT 1 FROM expense_tracker.recurring_transactions r WHERE r.id=o.recurring_transaction_id AND r.account_id=$1 AND r.user_id=$2)`, [id, userId]);
      return { account: await read(client, userId, id), pausedRecurringCount };
    }),
    restoreAccount: (userId: string, id: string) => transaction(async client => {
      await lock(client, userId, id);
      await client.query("UPDATE expense_tracker.accounts SET status='active' WHERE id=$1 AND user_id=$2 AND status='archived'", [id, userId]);
      return read(client, userId, id);
    }),
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
