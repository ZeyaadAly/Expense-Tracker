import type { Pool, PoolClient } from "pg";
import { normalizeAnalyticsRange, type AnalyticsRange } from "../domain/analytics-range.js";
import { getFirstOccurrenceOnOrAfter, getNextOccurrenceAfter, type RecurrenceDefinition } from "../domain/recurrence.js";
import { formatDecimal } from "../utils/money.js";
import { ApiError, databaseUnavailable } from "../utils/api-error.js";
import { isDatabaseUnavailable } from "../middleware/error-handler.js";
import { transactionTotalsCte } from "./transaction-totals.js";

type Database = Pick<Pool,"query">;
interface Totals { income: string; expenses: string; netSavings: string }
interface Summary extends Totals { savingsRatePercent: string | null; averageDailyExpense: string }
interface Month extends Totals { period: string; from: string; to: string }
interface Category { type: "income" | "expense"; categoryId: string; categoryName: string; amount: string; percentage: string | null }
interface Activity extends Totals { accountId: string; accountName: string; type: string; incomingTransfers: string; outgoingTransfers: string }
interface Definition extends RecurrenceDefinition { id: string }
const totals = <T extends Totals>(row:T):T => ({...row,income:formatDecimal(row.income),expenses:formatDecimal(row.expenses),netSavings:formatDecimal(row.netSavings)});
const parameters = (userId:string,input:AnalyticsRange) => {
  const range=normalizeAnalyticsRange(userId,input);
  return {range,values:[userId,range.from,range.to,range.accountId??null]};
};

/** Composable reads: a caller owns the transaction/snapshot and account visibility check. */
export function createAnalyticsRepository(database: Database) {
  return {
    async getSummary(userId:string,input:AnalyticsRange):Promise<Summary> {
      const {range,values}=parameters(userId,input);
      const row=(await database.query<Summary>(`${transactionTotalsCte} SELECT income::text,expenses::text,
        (income-expenses)::text AS "netSavings",
        round((income-expenses)*100/NULLIF(income,0),2)::text AS "savingsRatePercent",
        round(expenses/$5::numeric,2)::text AS "averageDailyExpense" FROM totals`,[...values,range.calendarDays])).rows[0];
      return {...totals(row),savingsRatePercent:row.savingsRatePercent===null?null:formatDecimal(row.savingsRatePercent),averageDailyExpense:formatDecimal(row.averageDailyExpense)};
    },
    async getCashFlowSeries(userId:string,input:AnalyticsRange):Promise<Month[]> {
      const {values}=parameters(userId,input);
      const rows=(await database.query<Month>(`WITH months AS (
        SELECT month::date AS month FROM generate_series(date_trunc('month',$2::date::timestamp),
          date_trunc('month',$3::date::timestamp),interval '1 month') month
      ), actuals AS (
        SELECT date_trunc('month',transaction_date::timestamp)::date AS month,
          sum(amount) FILTER(WHERE type='income') AS income,sum(amount) FILTER(WHERE type='expense') AS expenses
        FROM expense_tracker.transactions WHERE user_id=$1 AND transaction_date BETWEEN $2::date AND $3::date
          AND ($4::uuid IS NULL OR account_id=$4) GROUP BY 1
      ) SELECT to_char(m.month,'YYYY-MM') AS period,to_char(GREATEST(m.month,$2::date),'YYYY-MM-DD') AS "from",
        to_char(LEAST((m.month+interval '1 month')::date-1,$3::date),'YYYY-MM-DD') AS "to",
        COALESCE(a.income,0)::text AS income,COALESCE(a.expenses,0)::text AS expenses,
        (COALESCE(a.income,0)-COALESCE(a.expenses,0))::text AS "netSavings"
        FROM months m LEFT JOIN actuals a USING(month) ORDER BY m.month`,values)).rows;
      return rows.map(totals);
    },
    async getCategoryBreakdown(userId:string,input:AnalyticsRange) {
      const {values}=parameters(userId,input);
      const rows=(await database.query<Category>(`WITH categories AS (
        SELECT t.type,c.id AS "categoryId",c.name AS "categoryName",sum(t.amount) AS amount
        FROM expense_tracker.transactions t JOIN expense_tracker.categories c ON c.id=t.category_id AND (c.is_system OR c.user_id=t.user_id)
        WHERE t.user_id=$1 AND t.transaction_date BETWEEN $2::date AND $3::date AND ($4::uuid IS NULL OR t.account_id=$4)
        GROUP BY t.type,c.id,c.name
      ) SELECT type,"categoryId","categoryName",amount::text,
        round(amount*100/NULLIF(sum(amount) OVER(PARTITION BY type),0),2)::text AS percentage
        FROM categories ORDER BY type,categories.amount DESC,"categoryId"`,values)).rows;
      const map = (row:Category) => ({categoryId:row.categoryId,categoryName:row.categoryName,amount:formatDecimal(row.amount),percentage:row.percentage===null?null:formatDecimal(row.percentage)});
      return {expenseByCategory:rows.filter(r=>r.type==="expense").map(map),incomeByCategory:rows.filter(r=>r.type==="income").map(map)};
    },
    async getAccountActivity(userId:string,input:AnalyticsRange):Promise<Activity[]> {
      const {values}=parameters(userId,input);
      const rows=(await database.query<Activity>(`WITH actuals AS (
        SELECT account_id,sum(amount) FILTER(WHERE type='income') AS income,sum(amount) FILTER(WHERE type='expense') AS expenses
        FROM expense_tracker.transactions WHERE user_id=$1 AND transaction_date BETWEEN $2::date AND $3::date
          AND ($4::uuid IS NULL OR account_id=$4) GROUP BY account_id
      ), movements AS (
        SELECT destination_account_id AS account_id,amount AS incoming,0::numeric AS outgoing FROM expense_tracker.transfers
          WHERE user_id=$1 AND date BETWEEN $2::date AND $3::date
        UNION ALL SELECT source_account_id,0::numeric,amount FROM expense_tracker.transfers
          WHERE user_id=$1 AND date BETWEEN $2::date AND $3::date
      ), movement_totals AS (SELECT account_id,sum(incoming) AS incoming,sum(outgoing) AS outgoing FROM movements GROUP BY account_id)
      SELECT a.id AS "accountId",a.name AS "accountName",a.type,COALESCE(t.income,0)::text AS income,
        COALESCE(t.expenses,0)::text AS expenses,(COALESCE(t.income,0)-COALESCE(t.expenses,0))::text AS "netSavings",
        COALESCE(m.incoming,0)::text AS "incomingTransfers",COALESCE(m.outgoing,0)::text AS "outgoingTransfers"
      FROM expense_tracker.accounts a LEFT JOIN actuals t ON t.account_id=a.id LEFT JOIN movement_totals m ON m.account_id=a.id
      WHERE a.user_id=$1 AND ($4::uuid IS NULL OR a.id=$4) ORDER BY a.name,a.id`,values)).rows;
      return rows.map(row=>({...totals(row),incomingTransfers:formatDecimal(row.incomingTransfers),outgoingTransfers:formatDecimal(row.outgoingTransfers)}));
    },
    async getRecurringCommitments(userId:string,input:AnalyticsRange) {
      const {range,values}=parameters(userId,input);
      const definitions=(await database.query<Definition>(`SELECT r.id,to_char(r.start_date,'YYYY-MM-DD') AS "startDate",
        to_char(r.end_date,'YYYY-MM-DD') AS "endDate",r.frequency FROM expense_tracker.recurring_transactions r
        JOIN expense_tracker.accounts a ON a.id=r.account_id AND a.user_id=r.user_id
        JOIN expense_tracker.categories c ON c.id=r.category_id AND (c.is_system OR c.user_id=r.user_id)
        WHERE r.user_id=$1 AND r.status='active' AND a.status='active' AND c.status='active'
          AND r.start_date<=$3::date AND (r.end_date IS NULL OR r.end_date>=$2::date)
          AND ($4::uuid IS NULL OR r.account_id=$4) ORDER BY r.id`,values)).rows;
      const skipped=(await database.query<{id:string;date:string}>(`SELECT recurring_transaction_id AS id,
        to_char(occurrence_date,'YYYY-MM-DD') AS date FROM expense_tracker.recurring_occurrences
        WHERE user_id=$1 AND status='skipped' AND occurrence_date BETWEEN $2::date AND $3::date`,values.slice(0,3))).rows;
      const excluded=new Set(skipped.map(row=>`${row.id}:${row.date}`));
      const counts=definitions.map(definition=>{
        const schedule={startDate:definition.startDate,endDate:definition.endDate,frequency:definition.frequency};
        let date=getFirstOccurrenceOnOrAfter(schedule,range.from),count=0;
        while(date && date<=range.to){if(!excluded.has(`${definition.id}:${date}`))count++;date=getNextOccurrenceAfter(schedule,date);}
        return count;
      });
      // Only calendar multiplicities cross from JS. PostgreSQL owns every amount/product/SUM.
      const row=(await database.query<{income:string;expenses:string;netCashFlow:string}>(`WITH projected AS (
        SELECT r.type,r.amount*p.occurrences::numeric AS amount FROM unnest($2::uuid[],$3::int[]) AS p(id,occurrences)
        JOIN expense_tracker.recurring_transactions r ON r.id=p.id AND r.user_id=$1
      ), totals AS (SELECT COALESCE(sum(amount) FILTER(WHERE type='income'),0) AS income,
        COALESCE(sum(amount) FILTER(WHERE type='expense'),0) AS expenses FROM projected)
      SELECT income::text,expenses::text,(income-expenses)::text AS "netCashFlow" FROM totals`,[userId,definitions.map(d=>d.id),counts])).rows[0];
      return {income:formatDecimal(row.income),expenses:formatDecimal(row.expenses),netCashFlow:formatDecimal(row.netCashFlow),basis:"projected_occurrences" as const,from:range.from,to:range.to};
    },
  };
}

/** No HTTP registration: T39 will call this consistent, read-only domain service. */
export function createAnalyticsService(database:Pick<Pool,"connect">) {
  return {
    async getOverview(userId:string,input:AnalyticsRange) {
      const range=normalizeAnalyticsRange(userId,input);
      let client:PoolClient|undefined,discard=false;
      try {
        client=await database.connect();
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        if(range.accountId && !(await client.query("SELECT id FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2",[range.accountId,userId])).rows[0]) {
          throw new ApiError(404,"NOT_FOUND","Account not found.");
        }
        const repository=createAnalyticsRepository(client);
        const summary=await repository.getSummary(userId,input);
        const incomeVsExpenses=await repository.getCashFlowSeries(userId,input);
        const categories=await repository.getCategoryBreakdown(userId,input);
        const accountActivity=await repository.getAccountActivity(userId,input);
        const recurring=await repository.getRecurringCommitments(userId,input);
        await client.query("COMMIT");
        return {period:{from:range.from,to:range.to,calendarDays:range.calendarDays,timezone:"Africa/Cairo" as const},summary,incomeVsExpenses,...categories,accountActivity,recurring};
      } catch(error) {
        if(client)try{await client.query("ROLLBACK");}catch{discard=true;}
        if(error instanceof ApiError)throw error;
        if(isDatabaseUnavailable(error))throw databaseUnavailable();
        throw new ApiError(500,"INTERNAL_ERROR","Analytics could not be loaded.");
      } finally {client?.release(discard);}
    },
  };
}
