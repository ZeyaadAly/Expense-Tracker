import type { Pool, PoolClient } from "pg";
import { getFirstOccurrenceOnOrAfter, type RecurrenceDefinition } from "../domain/recurrence.js";
import { ApiError } from "../utils/api-error.js";
import { validateUuid } from "../validators/request.js";
import { validateV2Transaction } from "../validators/v2-transaction.js";
import { insertTransaction, lockTransactionReferences } from "./transaction-write.js";

export interface Occurrence {
  id:string; userId:string; definitionId:string; occurrenceDate:string;
  status:"pending"|"posted"|"skipped"|"failed";
  generatedTransactionId:string|null; processedAt:Date|null; failureCode:string|null;
  createdAt:Date; updatedAt:Date;
}
interface Definition extends RecurrenceDefinition {
  accountId:string; categoryId:string; type:"income"|"expense"; amount:string; description:string; status:string;
}
export const occurrenceFailureCodes = ["DATABASE_UNAVAILABLE", "POSTING_FAILED", "INVALID_REFERENCE"] as const;
export type OccurrenceFailureCode = typeof occurrenceFailureCodes[number];
const projection = `id,user_id AS "userId",recurring_transaction_id AS "definitionId",to_char(occurrence_date,'YYYY-MM-DD') AS "occurrenceDate",status,
  generated_transaction_id AS "generatedTransactionId",processed_at AS "processedAt",failure_code AS "failureCode",created_at AS "createdAt",updated_at AS "updatedAt"`;
const definitionProjection = `account_id AS "accountId",category_id AS "categoryId",type,amount::text AS amount,description,status,frequency,
  to_char(start_date,'YYYY-MM-DD') AS "startDate",to_char(end_date,'YYYY-MM-DD') AS "endDate"`;
const missing = () => new ApiError(404,"NOT_FOUND","Recurring definition or occurrence not found.");
const conflict = () => new ApiError(409,"CONFLICT","Occurrence cannot make this transition.");
const terminal = (row:Occurrence) => row.status === "posted" || row.status === "skipped";

/** Internal persistence only: no scheduler scans, automatic retries or public routes. */
export function createRecurringOccurrenceService(database:Pick<Pool,"query"|"connect">) {
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client = await database.connect();
    let discard = false;
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { discard = true; } throw error; }
    finally { client.release(discard); }
  }
  function inputs(userId:string, definitionId:string, date:string) {
    validateUuid(userId); validateUuid(definitionId);
    // Reuse T30's date validation without adding a second calendar implementation.
    getFirstOccurrenceOnOrAfter({startDate:date,frequency:"daily"},date);
  }
  async function definition(client:Pick<Pool,"query">, userId:string, id:string, lock=false):Promise<Definition> {
    const result = await client.query<Definition>(`SELECT ${definitionProjection} FROM expense_tracker.recurring_transactions WHERE id=$1 AND user_id=$2${lock?" FOR UPDATE":""}`, [id,userId]);
    if (!result.rows[0]) throw missing();
    return result.rows[0];
  }
  async function read(client:Pick<Pool,"query">, userId:string, id:string, date:string, lock=false):Promise<Occurrence|null> {
    return (await client.query<Occurrence>(`SELECT ${projection} FROM expense_tracker.recurring_occurrences WHERE user_id=$1 AND recurring_transaction_id=$2 AND occurrence_date=$3${lock?" FOR UPDATE":""}`, [userId,id,date])).rows[0]??null;
  }
  function scheduled(row:Definition, date:string) {
    if (getFirstOccurrenceOnOrAfter({startDate:row.startDate,frequency:row.frequency,endDate:row.endDate},date) !== date) throw conflict();
  }
  /** Caller must own BEGIN/COMMIT on this client. T31 can advance nextOccurrence in the same transaction. */
  async function postOccurrenceInTransaction(client:PoolClient,userId:string,id:string,date:string):Promise<Occurrence> {
    inputs(userId,id,date);
    const discovered = await definition(client,userId,id);
    const prior = await read(client,userId,id,date);
    if (prior && terminal(prior)) return prior;
    // Parent locks precede definition/occurrence locks, matching T17 archive and category archive.
    const input = validateV2Transaction({accountId:discovered.accountId,categoryId:discovered.categoryId,type:discovered.type,amount:discovered.amount,description:discovered.description,date});
    await lockTransactionReferences(client,userId,input);
    const row = await definition(client,userId,id,true);
    // No automatic retry if an edit changed references while locks were being acquired.
    if (JSON.stringify(row) !== JSON.stringify(discovered)) throw conflict();
    const occurrence = await read(client,userId,id,date,true);
    if (!occurrence) throw missing();
    if (terminal(occurrence)) return occurrence;
    if (row.status !== "active" || occurrence.status !== "pending") throw conflict();
    scheduled(row,date);
    const generatedTransactionId = await insertTransaction(client,userId,input,{definitionId:id,occurrenceDate:date});
    await client.query(`UPDATE expense_tracker.recurring_occurrences SET status='posted',generated_transaction_id=$4,processed_at=statement_timestamp(),failure_code=NULL
      WHERE user_id=$1 AND recurring_transaction_id=$2 AND occurrence_date=$3`, [userId,id,date,generatedTransactionId]);
    return (await read(client,userId,id,date))!;
  }
  return {
    getOccurrence: async (userId:string,id:string,date:string) => {
      inputs(userId,id,date); await definition(database,userId,id); return read(database,userId,id,date);
    },
    reserveOccurrence: async (userId:string,id:string,date:string) => {
      inputs(userId,id,date);
      return transaction(async client => {
        const row = await definition(client,userId,id,true);
        const existing = await read(client,userId,id,date,true);
        if (existing) return existing; // Includes terminal markers after edits/archive/deletion.
        scheduled(row,date);
        if (row.status !== "active") throw conflict();
        await client.query(`INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date)
          VALUES($1,$2,$3) ON CONFLICT(recurring_transaction_id,occurrence_date) DO NOTHING`, [userId,id,date]);
        return (await read(client,userId,id,date,true))!;
      });
    },
    postOccurrenceInTransaction,
    postOccurrence: async (userId:string,id:string,date:string) => {
      inputs(userId,id,date);
      return transaction(client => postOccurrenceInTransaction(client,userId,id,date));
    },
    transitionOccurrence: async (userId:string,id:string,date:string,action:"skip"|"fail"|"retry",failureCode?:OccurrenceFailureCode) => {
      inputs(userId,id,date);
      if (!["skip","fail","retry"].includes(action) || (action === "fail" && !occurrenceFailureCodes.includes(failureCode!)) || (action !== "fail" && failureCode !== undefined)) throw conflict();
      return transaction(async client => {
        await definition(client,userId,id,true);
        const row = await read(client,userId,id,date,true);
        if (!row) throw missing();
        if (terminal(row)) { if (action === "skip") return row; throw conflict(); }
        if (action === "retry" && row.status === "pending") return row;
        if (action === "fail" && row.status === "failed") return row;
        const status = action === "skip" ? "skipped" : action === "fail" ? "failed" : "pending";
        await client.query(`UPDATE expense_tracker.recurring_occurrences SET status=$4::text,processed_at=CASE WHEN $4::text='pending' THEN NULL ELSE statement_timestamp() END,failure_code=$5
          WHERE user_id=$1 AND recurring_transaction_id=$2 AND occurrence_date=$3`, [userId,id,date,status,action === "fail" ? failureCode : null]);
        return (await read(client,userId,id,date))!;
      });
    },
  };
}
