import type { Pool, PoolClient } from "pg";
import { getFirstOccurrenceOnOrAfter, getNextOccurrenceAfter, type RecurrenceDefinition } from "../domain/recurrence.js";
import type { RecurringFilters, RecurringInput, RecurringResource } from "../types/recurring.js";
import { ApiError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";
import { cairoToday } from "../validators/transaction.js";
import { createRecurringOccurrenceService } from "./recurring-occurrences.js";
import { lockTransactionReferences } from "./transaction-write.js";

interface Row extends Omit<RecurringResource,"createdAt"|"updatedAt"|"exhausted"> { createdAt: Date; updatedAt: Date }
const projection = `r.id,r.account_id AS "accountId",a.name AS "accountName",r.category_id AS "categoryId",c.name AS "categoryName",
  r.type,r.amount::text AS amount,'EGP' AS currency,r.description,r.frequency,to_char(r.start_date,'YYYY-MM-DD') AS "startDate",
  to_char(r.next_occurrence,'YYYY-MM-DD') AS "nextOccurrence",to_char(r.end_date,'YYYY-MM-DD') AS "endDate",r.status,
  r.created_at AS "createdAt",r.updated_at AS "updatedAt"`;
const source = `FROM expense_tracker.recurring_transactions r JOIN expense_tracker.accounts a ON a.id=r.account_id AND a.user_id=r.user_id
  JOIN expense_tracker.categories c ON c.id=r.category_id AND (c.is_system OR c.user_id=r.user_id)`;
const missing = () => new ApiError(404,"NOT_FOUND","Recurring definition not found.");
const conflict = () => new ApiError(409,"CONFLICT","Recurring definition cannot make this transition. Reload and try again.");
const schedule = (row: RecurrenceDefinition): RecurrenceDefinition => ({startDate:row.startDate,frequency:row.frequency,endDate:row.endDate});
const map = (row:Row):RecurringResource => ({...row,amount:formatDecimal(row.amount),exhausted:row.status === "active" && row.nextOccurrence === null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});

// Composable T29 projection: caller owns the consistent snapshot. Limit bounds per-definition output.
export async function getUpcomingRecurring(client:Pick<Pool,"query">,userId:string,from:string,days:number,limit=Infinity) {
  // Calendar range arithmetic is delegated to PostgreSQL; recurrence selection stays in T30.
  const to = (await client.query<{date:string}>("SELECT to_char(LEAST($1::date+($2::int-1),DATE '9999-12-31'),'YYYY-MM-DD') AS date",[from,days])).rows[0].date;
  const definitions = await client.query<Row>(`SELECT ${projection} ${source} WHERE r.user_id=$1 AND r.status='active' AND a.status='active' AND c.status='active'`,[userId]);
  const terminal = await client.query<{id:string;date:string}>(`SELECT recurring_transaction_id AS id,to_char(occurrence_date,'YYYY-MM-DD') AS date FROM expense_tracker.recurring_occurrences
    WHERE user_id=$1 AND status IN ('posted','skipped') AND occurrence_date BETWEEN $2 AND $3`,[userId,from,to]);
  const markers = new Set(terminal.rows.map(row=>`${row.id}:${row.date}`));
  const data: {recurringTransactionId:string;description:string;type:string;amount:string;currency:"EGP";occurrenceDate:string;accountName:string}[] = [];
  for (const row of definitions.rows) {
    let date = getFirstOccurrenceOnOrAfter(schedule(row),from);
    let emitted = 0;
    while (date && date <= to && emitted < limit) {
      if (!markers.has(`${row.id}:${date}`)) { emitted++; data.push({recurringTransactionId:row.id,description:row.description,type:row.type,amount:formatDecimal(row.amount),currency:"EGP",occurrenceDate:date,accountName:row.accountName}); }
      date = getNextOccurrenceAfter(schedule(row),date);
    }
  }
  data.sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate)||a.recurringTransactionId.localeCompare(b.recurringTransactionId));
  return {data:data.slice(0,limit),meta:{from,to}};
}

export function createRecurringService(database:Pick<Pool,"query"|"connect">,options:{now?:()=>Date}={}) {
  const ledger = createRecurringOccurrenceService(database);
  const today = () => cairoToday(options.now?.() ?? new Date());
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client = await database.connect(); let discard = false;
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { discard = true; } throw error; }
    finally { client.release(discard); }
  }
  async function read(client:Pick<Pool,"query">,userId:string,id:string,lock=false):Promise<Row> {
    const result = await client.query<Row>(`SELECT ${projection} ${source} WHERE r.id=$1 AND r.user_id=$2${lock?" FOR UPDATE OF r":""}`,[id,userId]);
    if (!result.rows[0]) throw missing();
    return result.rows[0];
  }
  async function next(client:PoolClient,userId:string,id:string,input:RecurrenceDefinition):Promise<string|null> {
    const reference = today(), reserved = await ledger.getReservedDatesInTransaction(client,userId,id,reference);
    let candidate = getFirstOccurrenceOnOrAfter(schedule(input),reference);
    // Work is bounded by durable history, never by elapsed or future calendar time.
    while (candidate && reserved.has(candidate)) candidate = getNextOccurrenceAfter(schedule(input),candidate);
    return candidate;
  }
  async function references(client:PoolClient,userId:string,input:RecurringInput) {
    await lockTransactionReferences(client,userId,{...input,date:input.startDate});
  }
  return {
    listRecurring: async (userId:string,filters:RecurringFilters):Promise<RecurringResource[]> => {
      const result = await database.query<Row>(`SELECT ${projection} ${source} WHERE r.user_id=$1
        AND ($2::text IS NULL OR r.status=$2) AND ($3::text IS NULL OR r.type=$3) AND ($4::uuid IS NULL OR r.account_id=$4)
        AND ($5::uuid IS NULL OR r.category_id=$5) AND ($6::text IS NULL OR r.frequency=$6)
        ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,r.next_occurrence ASC NULLS LAST,r.id ASC`,
      [userId,filters.status??null,filters.type??null,filters.accountId??null,filters.categoryId??null,filters.frequency??null]);
      return result.rows.map(map);
    },
    getRecurring: async (userId:string,id:string) => map(await read(database,userId,id)),
    createRecurring: (userId:string,input:RecurringInput) => transaction(async client => {
      await references(client,userId,input);
      const initial = getFirstOccurrenceOnOrAfter(schedule(input),today());
      const result = await client.query<{id:string}>(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[userId,input.accountId,input.categoryId,input.type,input.amount,input.description,input.frequency,input.startDate,input.endDate,initial]);
      return map(await read(client,userId,result.rows[0].id));
    }),
    updateRecurring: (userId:string,id:string,input:RecurringInput) => transaction(async client => {
      // Hide foreign definitions before inspecting any submitted parent resource.
      const discovered = await read(client,userId,id);
      if (discovered.status === "archived") throw conflict();
      await references(client,userId,input);
      const row = await read(client,userId,id,true);
      if (row.status === "archived") throw conflict();
      await ledger.skipUnpostedOccurrencesInTransaction(client,userId,id);
      const occurrence = row.status === "active" ? await next(client,userId,id,input) : null;
      await client.query(`UPDATE expense_tracker.recurring_transactions SET account_id=$3,category_id=$4,type=$5,amount=$6,description=$7,frequency=$8,start_date=$9,end_date=$10,next_occurrence=$11
        WHERE id=$1 AND user_id=$2 AND (account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence)
        IS DISTINCT FROM ($3::uuid,$4::uuid,$5::varchar,$6::numeric,$7::varchar,$8::varchar,$9::date,$10::date,$11::date)`,
      [id,userId,input.accountId,input.categoryId,input.type,input.amount,input.description,input.frequency,input.startDate,input.endDate,occurrence]);
      return map(await read(client,userId,id));
    }),
    pauseRecurring: (userId:string,id:string) => transaction(async client => {
      const row = await read(client,userId,id,true);
      if (row.status === "archived") throw conflict();
      if (row.status === "paused") return map(row);
      await ledger.skipUnpostedOccurrencesInTransaction(client,userId,id);
      await client.query("UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL WHERE id=$1 AND user_id=$2",[id,userId]);
      return map(await read(client,userId,id));
    }),
    resumeRecurring: (userId:string,id:string) => transaction(async client => {
      const discovered = await read(client,userId,id);
      if (discovered.status === "archived") throw conflict();
      await references(client,userId,discovered);
      const row = await read(client,userId,id,true);
      if (row.status === "archived" || row.accountId !== discovered.accountId || row.categoryId !== discovered.categoryId || row.type !== discovered.type) throw conflict();
      if (row.status === "active") return map(row);
      const occurrence = await next(client,userId,id,row);
      await client.query("UPDATE expense_tracker.recurring_transactions SET status='active',next_occurrence=$3 WHERE id=$1 AND user_id=$2",[id,userId,occurrence]);
      return map(await read(client,userId,id));
    }),
    archiveRecurring: (userId:string,id:string) => transaction(async client => {
      const row = await read(client,userId,id,true);
      if (row.status === "archived") return map(row);
      await ledger.skipUnpostedOccurrencesInTransaction(client,userId,id);
      await client.query("UPDATE expense_tracker.recurring_transactions SET status='archived',next_occurrence=NULL WHERE id=$1 AND user_id=$2",[id,userId]);
      return map(await read(client,userId,id));
    }),
    upcomingRecurring: (userId:string,days:number) => transaction(async client => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const from = today();
      return getUpcomingRecurring(client,userId,from,days);
    }),
  };
}
export type RecurringService = ReturnType<typeof createRecurringService>;
