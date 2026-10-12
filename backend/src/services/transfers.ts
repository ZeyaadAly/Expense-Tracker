import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import type {TransferInput,TransferListQuery,TransferPage,TransferRow} from "../types/transfer.js";
import {ApiError} from "../utils/api-error.js";
import {createTransactionCursorCodec} from "../utils/transaction-cursor.js";
import {mapTransfer} from "../utils/transfer-mapper.js";

const selection=`SELECT t.id,t.source_account_id AS "sourceAccountId",s.name AS "sourceAccountName",
  t.destination_account_id AS "destinationAccountId",d.name AS "destinationAccountName",t.amount::text AS amount,
  to_char(t.date,'YYYY-MM-DD') AS date,t.description,t.created_at AS "createdAt",t.updated_at AS "updatedAt",
  to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"
  FROM expense_tracker.transfers t
  JOIN expense_tracker.accounts s ON s.id=t.source_account_id AND s.user_id=t.user_id
  JOIN expense_tracker.accounts d ON d.id=t.destination_account_id AND d.user_id=t.user_id
  WHERE t.user_id=$1`;
const missing=()=>new ApiError(404,"NOT_FOUND","Transfer not found.");
const missingAccount=()=>new ApiError(404,"NOT_FOUND","Account not found.");
export function transferScopeHash(query:TransferListQuery,limit:number) {
  return createHash("sha256").update(JSON.stringify({accountId:query.accountId??null,from:query.from??null,to:query.to??null,limit})).digest("hex");
}

export function createTransferService(database:Pick<Pool,"query"|"connect">,options:{cursorSigningSecret?:string;now?:()=>number}={}) {
  const cursors=createTransactionCursorCodec(options.cursorSigningSecret,options.now,"transfers");
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await database.connect();let discard:Error|undefined;
    try {await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}
    catch(error) {
      // A failed COMMIT can be uncertain. Never retry a financial mutation.
      try {await client.query("ROLLBACK");}catch {discard=new Error("Transfer connection rollback failed");}
      throw error;
    }finally{client.release(discard);}
  }
  async function read(client:Pick<Pool,"query">,userId:string,id:string) {
    const result=await client.query<TransferRow>(selection+" AND t.id=$2",[userId,id]);
    if(!result.rows[0])throw missing();return mapTransfer(result.rows[0]);
  }
  async function lockTransfer(client:PoolClient,userId:string,id:string) {
    // Serialize this child's edits/deletion before discovering its current old accounts.
    // Account lifecycle services never lock transfer children, so there is no reverse edge.
    const result=await client.query<{sourceAccountId:string;destinationAccountId:string}>(
      'SELECT source_account_id AS "sourceAccountId",destination_account_id AS "destinationAccountId" FROM expense_tracker.transfers WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);
    if(!result.rows[0])throw missing();return result.rows[0];
  }
  async function lockAccounts(client:PoolClient,userId:string,ids:string[],activeIds:string[]=[]) {
    const unique=[...new Set(ids)].sort();
    // Same owner/active semantics as T17, but lock the full old/new union in UUID order.
    const result=await client.query<{id:string;status:string}>(
      "SELECT id,status FROM expense_tracker.accounts WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",[userId,unique]);
    // Check visibility of BOTH endpoints before status; a foreign endpoint is always hidden.
    if(result.rows.length!==unique.length)throw missingAccount();
    if(result.rows.some(row=>activeIds.includes(row.id)&&row.status!=="active"))throw new ApiError(409,"ACCOUNT_ARCHIVED","Restore the accounts before posting or editing transfers.");
  }
  return {
    async listTransfers(userId:string,query:TransferListQuery={}):Promise<TransferPage> {
      cursors.configured();
      const limit=query.limit??25,scope=transferScopeHash(query,limit);
      const continuation=query.cursor?cursors.decode(query.cursor,userId,scope):null;
      if(query.accountId) {
        const account=await database.query("SELECT id FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2",[query.accountId,userId]);
        if(!account.rows[0])throw missingAccount();
      }
      const params=[userId],bind=(value:string)=>{params.push(value);return "$"+params.length;};let predicates="";
      if(query.accountId){const id=bind(query.accountId);predicates+=` AND (t.source_account_id=${id} OR t.destination_account_id=${id})`;}
      if(query.from)predicates+=" AND t.date>="+bind(query.from)+"::date";
      if(query.to)predicates+=" AND t.date<="+bind(query.to)+"::date";
      if(continuation)predicates+=` AND (t.date,t.created_at,t.id)<(${bind(continuation.date)}::date,${bind(continuation.createdAt)}::timestamptz,${bind(continuation.id)}::uuid)`;
      const result=await database.query<TransferRow>(selection+predicates+" ORDER BY t.date DESC,t.created_at DESC,t.id DESC LIMIT "+bind(String(limit+1)),params);
      const hasMore=result.rows.length>limit,rows=result.rows.slice(0,limit),last=rows.at(-1);
      const nextCursor=hasMore&&last?cursors.encode(userId,scope,{date:last.date,createdAt:last.cursorCreatedAt!,id:last.id}):null;
      return {data:rows.map(mapTransfer),meta:{limit,nextCursor,hasMore}};
    },
    getTransfer:(userId:string,id:string)=>read(database,userId,id),
    createTransfer:(userId:string,input:TransferInput)=>transaction(async client=>{
      const ids=[input.sourceAccountId,input.destinationAccountId];await lockAccounts(client,userId,ids,ids);
      const id=randomUUID();
      await client.query(`INSERT INTO expense_tracker.transfers(id,user_id,source_account_id,destination_account_id,amount,date,description)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,userId,input.sourceAccountId,input.destinationAccountId,input.amount,input.date,input.description]);
      // T15 owns permanent opening/type locks; T18 alone derives balances. No paired transaction writes.
      return read(client,userId,id);
    }),
    updateTransfer:(userId:string,id:string,input:TransferInput)=>transaction(async client=>{
      const current=await lockTransfer(client,userId,id),active=[input.sourceAccountId,input.destinationAccountId];
      await lockAccounts(client,userId,[current.sourceAccountId,current.destinationAccountId,...active],active);
      await client.query(`UPDATE expense_tracker.transfers SET source_account_id=$3,destination_account_id=$4,amount=$5,date=$6,description=$7
        WHERE id=$1 AND user_id=$2`,[id,userId,input.sourceAccountId,input.destinationAccountId,input.amount,input.date,input.description]);
      return read(client,userId,id);
    }),
    deleteTransfer:(userId:string,id:string)=>transaction(async client=>{
      const current=await lockTransfer(client,userId,id);
      await lockAccounts(client,userId,[current.sourceAccountId,current.destinationAccountId]);
      await client.query("DELETE FROM expense_tracker.transfers WHERE id=$1 AND user_id=$2",[id,userId]);
    }),
  };
}
export type TransferService=ReturnType<typeof createTransferService>;
