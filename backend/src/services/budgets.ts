import type { Pool, PoolClient } from "pg";
import type { BudgetFilters, BudgetInput, BudgetResource, BudgetUpdate } from "../types/budget.js";
import { ApiError, validationError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";

interface Row extends Omit<BudgetResource,"createdAt"|"updatedAt"> {createdAt:Date;updatedAt:Date}
// One statement/snapshot for list and single progress. No mutable spent cache or N+1 queries.
export const budgetProgressQuery=`WITH selected AS (
  SELECT b.*,c.name AS category_name FROM expense_tracker.budgets b
  JOIN expense_tracker.categories c ON c.id=b.category_id AND (c.is_system OR c.user_id=b.user_id)
  WHERE b.user_id=$1 AND ($2::int IS NULL OR b.year=$2) AND ($3::int IS NULL OR b.month=$3)
    AND ($4::uuid IS NULL OR b.id=$4) AND ($5::uuid IS NULL OR b.category_id=$5)
), spending AS (
  SELECT b.id,COALESCE(sum(t.amount),0::numeric) AS spent FROM selected b
  LEFT JOIN expense_tracker.transactions t ON t.user_id=b.user_id AND t.category_id=b.category_id AND t.type='expense'
    AND t.transaction_date>=make_date(b.year,b.month,1)
    AND t.transaction_date<(make_date(b.year,b.month,1)+interval '1 month')::date
  GROUP BY b.id
) SELECT b.id,b.category_id AS "categoryId",b.category_name AS "categoryName",b.amount::text,
  b.year,b.month,b.alert_threshold_percent AS "alertThresholdPercent",s.spent::text,
  (b.amount-s.spent)::text AS remaining,round(s.spent*100/b.amount,2)::text AS "percentUsed",
  CASE WHEN s.spent>b.amount THEN 'exceeded'
    WHEN s.spent>0 AND s.spent*100>=b.alert_threshold_percent*b.amount THEN 'near_limit' ELSE 'normal' END AS status,
  b.created_at AS "createdAt",b.updated_at AS "updatedAt"
  FROM selected b JOIN spending s USING(id) ORDER BY b.category_name,b.category_id,b.id`;
const missing=()=>new ApiError(404,"NOT_FOUND","Budget not found.");
const map=(row:Row):BudgetResource=>({...row,amount:formatDecimal(row.amount),spent:formatDecimal(row.spent),remaining:formatDecimal(row.remaining),percentUsed:formatDecimal(row.percentUsed),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});
export function createBudgetService(database:Pick<Pool,"query"|"connect">){
  async function read(client:Pick<Pool,"query">,userId:string,id:string){
    const row=(await client.query<Row>(budgetProgressQuery,[userId,null,null,id,null])).rows[0];if(!row)throw missing();return map(row);
  }
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
    const client=await database.connect();let discard=false;
    try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}
    catch(error){try{await client.query("ROLLBACK");}catch{discard=true;}
      const e=error as {code?:string;constraint?:string};
      if(e.code==="23505"&&e.constraint==="budgets_user_category_period_unique")throw new ApiError(409,"CONFLICT","A budget already exists for this category and month.");
      throw error;
    }finally{client.release(discard);}
  }
  async function lockBudget(client:PoolClient,userId:string,id:string){
    if(!(await client.query("SELECT id FROM expense_tracker.budgets WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId])).rows[0])throw missing();
  }
  return {
    async listBudgets(userId:string,filters:BudgetFilters){
      if(filters.categoryId&&!(await database.query("SELECT id FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2)",[filters.categoryId,userId])).rows[0])throw new ApiError(404,"NOT_FOUND","Category not found.");
      return (await database.query<Row>(budgetProgressQuery,[userId,filters.year,filters.month,null,filters.categoryId??null])).rows.map(map);
    },
    getBudget:(userId:string,id:string)=>read(database,userId,id),
    createBudget:(userId:string,input:BudgetInput)=>transaction(async client=>{
      const category=(await client.query<{status:string;kind:string}>("SELECT status,kind FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2) FOR SHARE",[input.categoryId,userId])).rows[0];
      if(!category)throw new ApiError(404,"NOT_FOUND","Category not found.");
      if(category.status!=="active")throw new ApiError(409,"CATEGORY_ARCHIVED","Restore the category before creating a budget.");
      if(!["expense","both"].includes(category.kind))throw validationError([{field:"categoryId",message:"Choose an expense or both category."}]);
      const row=(await client.query<{id:string}>("INSERT INTO expense_tracker.budgets(user_id,category_id,year,month,amount,alert_threshold_percent) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[userId,input.categoryId,input.year,input.month,input.amount,input.alertThresholdPercent])).rows[0];
      return read(client,userId,row.id);
    }),
    updateBudget:(userId:string,id:string,input:BudgetUpdate)=>transaction(async client=>{
      await lockBudget(client,userId,id);
      await client.query(`UPDATE expense_tracker.budgets SET amount=$3,alert_threshold_percent=$4 WHERE id=$1 AND user_id=$2
        AND (amount,alert_threshold_percent) IS DISTINCT FROM ($3::numeric,$4::smallint)`,[id,userId,input.amount,input.alertThresholdPercent]);
      return read(client,userId,id);
    }),
    deleteBudget:(userId:string,id:string)=>transaction(async client=>{await lockBudget(client,userId,id);await client.query("DELETE FROM expense_tracker.budgets WHERE id=$1 AND user_id=$2",[id,userId]);}),
  };
}
export type BudgetService=ReturnType<typeof createBudgetService>;
