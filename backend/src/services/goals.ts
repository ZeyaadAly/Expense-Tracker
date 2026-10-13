import type { Pool, PoolClient } from "pg";
import type { GoalInput, GoalResource, GoalStatus, GoalUpdate } from "../types/goal.js";
import { ApiError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";

interface Row extends Omit<GoalResource,"createdAt"|"updatedAt"> { createdAt: Date; updatedAt: Date }
// The frozen resource has no account-name or suggestion flag. One SQL projection
// supplies identical exact derived values for list, single and mutation responses.
export const goalProgressQuery = `SELECT id,name,target_amount::text AS "targetAmount",saved_amount::text AS "savedAmount",
  greatest(target_amount-saved_amount,0::numeric)::text AS "remainingAmount",
  round(saved_amount*100/target_amount,2)::text AS "percentComplete",target_date::text AS "targetDate",
  linked_account_id AS "linkedAccountId",status,created_at AS "createdAt",updated_at AS "updatedAt"
  FROM expense_tracker.goals WHERE user_id=$1 AND ($2::text IS NULL OR status=$2) AND ($3::uuid IS NULL OR id=$3)
  ORDER BY created_at DESC,id DESC`;
const missing = () => new ApiError(404,"NOT_FOUND","Goal not found.");
const invalidState = () => new ApiError(409,"GOAL_INVALID_STATE","Archived goals are read-only; completion requires savings at or above the target.");
const map = (row: Row): GoalResource => ({...row,targetAmount:formatDecimal(row.targetAmount),savedAmount:formatDecimal(row.savedAmount),remainingAmount:formatDecimal(row.remainingAmount),percentComplete:formatDecimal(row.percentComplete),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});

export function createGoalService(database: Pick<Pool,"query"|"connect">) {
  async function read(client: Pick<Pool,"query">, userId: string, id: string) {
    const row = (await client.query<Row>(goalProgressQuery,[userId,null,id])).rows[0];
    if (!row) throw missing();
    return map(row);
  }
  async function transaction<T>(work: (client: PoolClient)=>Promise<T>): Promise<T> {
    const client = await database.connect(); let discard = false;
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { discard = true; } throw error; }
    finally { client.release(discard); }
  }
  async function lockAccount(client: PoolClient, userId: string, id: string | null) {
    if (!id) return undefined;
    // Account before goal, matching the T15 trigger's exclusive lock. SHARE here
    // would deadlock when two assignments both upgrade in that trigger.
    const row = (await client.query<{status:string}>("SELECT status FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId])).rows[0];
    if (!row) throw new ApiError(404,"NOT_FOUND","Account not found.");
    return row;
  }
  function requireActive(account: {status:string} | undefined) {
    if (account && account.status !== "active") throw new ApiError(409,"ACCOUNT_ARCHIVED","Restore the account before assigning this link.");
  }
  async function lockGoal(client: PoolClient, userId: string, id: string) {
    const row = (await client.query<{status:GoalStatus;linkedAccountId:string|null;funded:boolean}>(`SELECT status,linked_account_id AS "linkedAccountId",saved_amount>=target_amount AS funded
      FROM expense_tracker.goals WHERE id=$1 AND user_id=$2 FOR UPDATE`,[id,userId])).rows[0];
    if (!row) throw missing();
    return row;
  }
  return {
    async listGoals(userId: string, status?: GoalStatus) { return (await database.query<Row>(goalProgressQuery,[userId,status??null,null])).rows.map(map); },
    getGoal: (userId: string,id: string)=>read(database,userId,id),
    createGoal: (userId: string,input: GoalInput)=>transaction(async client=>{
      requireActive(await lockAccount(client,userId,input.linkedAccountId));
      const row = (await client.query<{id:string}>(`INSERT INTO expense_tracker.goals(user_id,name,target_amount,saved_amount,target_date,linked_account_id)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[userId,input.name,input.targetAmount,input.savedAmount,input.targetDate,input.linkedAccountId])).rows[0];
      return read(client,userId,row.id);
    }),
    updateGoal: (userId: string,id: string,input: GoalUpdate)=>transaction(async client=>{
      // Hide foreign/missing goals before looking up the submitted reference.
      if (!(await client.query("SELECT id FROM expense_tracker.goals WHERE id=$1 AND user_id=$2",[id,userId])).rows[0]) throw missing();
      const account = await lockAccount(client,userId,input.linkedAccountId);
      const current = await lockGoal(client,userId,id);
      if (current.status === "archived") throw invalidState();
      if (input.linkedAccountId !== current.linkedAccountId) requireActive(account);
      if (input.status === "completed" && !(await client.query<{funded:boolean}>("SELECT $1::numeric >= $2::numeric AS funded",[input.savedAmount,input.targetAmount])).rows[0].funded) throw invalidState();
      await client.query(`UPDATE expense_tracker.goals SET name=$3,target_amount=$4,saved_amount=$5,target_date=$6,linked_account_id=$7,status=$8
        WHERE id=$1 AND user_id=$2 AND (name,target_amount,saved_amount,target_date,linked_account_id,status)
        IS DISTINCT FROM ($3::text,$4::numeric,$5::numeric,$6::date,$7::uuid,$8::text)`,[id,userId,input.name,input.targetAmount,input.savedAmount,input.targetDate,input.linkedAccountId,input.status]);
      return read(client,userId,id);
    }),
    completeGoal: (userId: string,id: string)=>transaction(async client=>{
      const current = await lockGoal(client,userId,id);
      if (current.status === "archived" || !current.funded) throw invalidState();
      await client.query("UPDATE expense_tracker.goals SET status='completed' WHERE id=$1 AND user_id=$2 AND status='active'",[id,userId]);
      return read(client,userId,id);
    }),
    archiveGoal: (userId: string,id: string)=>transaction(async client=>{
      await lockGoal(client,userId,id);
      await client.query("UPDATE expense_tracker.goals SET status='archived' WHERE id=$1 AND user_id=$2 AND status<>'archived'",[id,userId]);
      return read(client,userId,id);
    }),
  };
}
export type GoalService = ReturnType<typeof createGoalService>;
