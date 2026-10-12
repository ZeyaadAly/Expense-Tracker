import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { V2TransactionInput } from "../types/v2-transaction.js";
import { ApiError, validationError } from "../utils/api-error.js";

/** Caller owns BEGIN/COMMIT. Account then category is the common posting lock order. */
export async function lockTransactionReferences(client: PoolClient, userId: string, input: V2TransactionInput) {
  const account = await client.query<{status:string}>("SELECT status FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2 FOR UPDATE", [input.accountId, userId]);
  if (!account.rows[0]) throw new ApiError(404,"NOT_FOUND","Account not found.");
  if (account.rows[0].status !== "active") throw new ApiError(409,"ACCOUNT_ARCHIVED","Restore the account before posting or editing transactions.");
  const category = await client.query<{status:string;kind:string}>("SELECT status,kind FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2) FOR SHARE", [input.categoryId,userId]);
  if (!category.rows[0]) throw new ApiError(404,"NOT_FOUND","Category not found.");
  if (category.rows[0].status !== "active") throw new ApiError(409,"CATEGORY_ARCHIVED","Restore the category before posting or editing transactions.");
  if (![input.type,"both"].includes(category.rows[0].kind)) throw validationError([{field:"categoryId",message:"Choose a category compatible with the transaction type."}]);
}

export async function insertTransaction(client: PoolClient, userId: string, input: V2TransactionInput, generated?: {definitionId:string;occurrenceDate:string}): Promise<string> {
  const id = randomUUID();
  await client.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id,recurring_occurrence_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,userId,input.accountId,input.categoryId,input.type,input.amount,input.description,input.date,generated?.definitionId??null,generated?.occurrenceDate??null]);
  return id;
}
