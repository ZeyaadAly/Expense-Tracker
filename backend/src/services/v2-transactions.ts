import type {Pool,PoolClient} from "pg";
import type {V2TransactionInput,V2TransactionRow,V2TransactionListQuery,V2TransactionPage} from "../types/v2-transaction.js";
import {createTransactionCursorCodec,transactionScopeHash} from "../utils/transaction-cursor.js";
import {ApiError} from "../utils/api-error.js";
import {insertTransaction,lockTransactionReferences} from "./transaction-write.js";
import {mapV2Transaction} from "../utils/v2-transaction-mapper.js";

const selection=`SELECT t.id,t.account_id AS "accountId",a.name AS "accountName",
  t.category_id AS "categoryId",c.name AS "categoryName",t.type,t.amount::text AS amount,t.description,
  to_char(t.transaction_date,'YYYY-MM-DD') AS date,t.recurring_transaction_id AS "recurringTransactionId",
  to_char(t.recurring_occurrence_date,'YYYY-MM-DD') AS "recurringOccurrenceDate",
  t.created_at AS "createdAt",t.updated_at AS "updatedAt",
  to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"
  FROM expense_tracker.transactions t
  JOIN expense_tracker.accounts a ON a.id=t.account_id AND a.user_id=t.user_id
  JOIN expense_tracker.categories c ON c.id=t.category_id AND (c.is_system OR c.user_id=t.user_id)
  WHERE t.user_id=$1`;
const missing=()=>new ApiError(404,"NOT_FOUND","Transaction not found.");

export function createV2TransactionService(database:Pick<Pool,"query"|"connect">,options:{cursorSigningSecret?:string;now?:()=>number}={}) {
  const cursors=createTransactionCursorCodec(options.cursorSigningSecret,options.now);
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await database.connect();
    try {await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}
    catch(error){await client.query("ROLLBACK");throw error;}
    finally{client.release();}
  }
  async function read(client:Pick<Pool,"query">,userId:string,id:string) {
    const result=await client.query<V2TransactionRow>(selection+" AND t.id=$2",[userId,id]);
    if(!result.rows[0])throw missing();return mapV2Transaction(result.rows[0]);
  }
  const references=lockTransactionReferences;
  return {
    async listTransactions(userId:string,query:V2TransactionListQuery={}):Promise<V2TransactionPage> {
      cursors.configured();
      const limit=query.limit??25,scopeHash=transactionScopeHash(query,limit);
      const continuation=query.cursor?cursors.decode(query.cursor,userId,scopeHash):null;
      // Frozen list-filter policy: invisible references and missing IDs share the same 404.
      // Archived references remain visible; account/category ownership is immutable.
      if(query.accountId) {
        const account=await database.query("SELECT id FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2",[query.accountId,userId]);
        if(!account.rows[0])throw new ApiError(404,"NOT_FOUND","Account not found.");
      }
      if(query.categoryId) {
        const category=await database.query("SELECT id FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2)",[query.categoryId,userId]);
        if(!category.rows[0])throw new ApiError(404,"NOT_FOUND","Category not found.");
      }
      const parameters=[userId];
      const bind=(value:string)=>{parameters.push(value);return "$"+parameters.length;};
      let predicates="";
      if(query.q) {
        // Fixed escape character: %, _ and ! are literal; backslashes remain ordinary text.
        const pattern=bind("%"+query.q.replace(/[!%_]/g,"!$&")+"%");
        predicates=` AND (t.description ILIKE ${pattern} ESCAPE '!' OR a.name ILIKE ${pattern} ESCAPE '!' OR c.name ILIKE ${pattern} ESCAPE '!')`;
      }
      if(query.type)predicates+=" AND t.type="+bind(query.type);
      if(query.accountId)predicates+=" AND t.account_id="+bind(query.accountId);
      if(query.categoryId)predicates+=" AND t.category_id="+bind(query.categoryId);
      if(query.from)predicates+=" AND t.transaction_date>="+bind(query.from)+"::date";
      if(query.to)predicates+=" AND t.transaction_date<="+bind(query.to)+"::date";
      if(query.recurring)predicates+=query.recurring==="manual"?" AND t.recurring_transaction_id IS NULL":" AND t.recurring_transaction_id IS NOT NULL";
      if(continuation)predicates+=` AND (t.transaction_date,t.created_at,t.id)<(${bind(continuation.date)}::date,${bind(continuation.createdAt)}::timestamptz,${bind(continuation.id)}::uuid)`;
      const result=await database.query<V2TransactionRow>(selection+predicates+" ORDER BY t.transaction_date DESC,t.created_at DESC,t.id DESC LIMIT "+bind(String(limit+1)),parameters);
      const hasMore=result.rows.length>limit,rows=result.rows.slice(0,limit),last=rows.at(-1);
      const nextCursor=hasMore&&last?cursors.encode(userId,scopeHash,{date:last.date,createdAt:last.cursorCreatedAt!,id:last.id}):null;
      return {data:rows.map(mapV2Transaction),meta:{limit,nextCursor,hasMore}};
    },
    getTransaction:(userId:string,id:string)=>read(database,userId,id),
    createTransaction:(userId:string,input:V2TransactionInput)=>transaction(async client=>{
      await references(client,userId,input);const id=await insertTransaction(client,userId,input);
      return read(client,userId,id);
    }),
    updateTransaction:(userId:string,id:string,input:V2TransactionInput)=>transaction(async client=>{
      const current=await client.query("SELECT id FROM expense_tracker.transactions WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
      if(!current.rows[0])throw missing();
      await references(client,userId,input);
      // Generated metadata, owner, legacy category, ID and created_at stay untouched.
      await client.query(`UPDATE expense_tracker.transactions SET account_id=$3,category_id=$4,type=$5,amount=$6,description=$7,transaction_date=$8
        WHERE id=$1 AND user_id=$2`,[id,userId,input.accountId,input.categoryId,input.type,input.amount,input.description,input.date]);
      return read(client,userId,id);
    }),
    deleteTransaction:(userId:string,id:string)=>transaction(async client=>{
      const result=await client.query("DELETE FROM expense_tracker.transactions WHERE id=$1 AND user_id=$2 RETURNING id",[id,userId]);
      if(!result.rows[0])throw missing();
      // Existing SET NULL FK clears only the occurrence link, retaining the durable posted marker.
    }),
  };
}
export type V2TransactionService=ReturnType<typeof createV2TransactionService>;
