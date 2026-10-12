import type { Pool } from "pg";
import type { DashboardPeriod } from "../validators/dashboard.js";
import { cairoToday } from "../validators/transaction.js";
import { createAccountBalanceRepository } from "./account-balances.js";
import { getTransactionTotals } from "./transaction-totals.js";
import { getRecentTransactions } from "./v2-transactions.js";
import { getUpcomingRecurring } from "./recurring.js";

export function createDashboardService(database:Pick<Pool,"connect">,options:{now?:()=>Date}={}) {
  return {
    async getDashboard(userId:string,key:DashboardPeriod) {
      // Capture the business date exactly once even if the request straddles Cairo midnight.
      const today = cairoToday(options.now?.() ?? new Date());
      const client = await database.connect();
      let discard = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const months = {this_month:0,last_month:1,"3_months":2,"6_months":5,"1_year":11}[key];
        const range = (await client.query<{from:string;to:string}>(`SELECT
          to_char(date_trunc('month',$1::date)-make_interval(months=>$2::int),'YYYY-MM-DD') AS "from",
          to_char(CASE WHEN $3::boolean THEN date_trunc('month',$1::date)::date-1 ELSE $1::date END,'YYYY-MM-DD') AS "to"`,
        [today,months,key === "last_month"])).rows[0];
        const balances = createAccountBalanceRepository(client);
        // A pg client executes one statement at a time. Keep reads on this client,
        // without HTTP/domain-service waterfalls or additional pool checkouts.
        const position = await balances.getFinancialPosition(userId);
        const totals = await getTransactionTotals(client,userId,range.from,range.to);
        const accounts = await balances.getAccountBalances(userId);
        const recent = await getRecentTransactions(client,userId);
        const upcoming = await getUpcomingRecurring(client,userId,today,30,5);
        await client.query("COMMIT");
        return {data:{period:{key,...range,timezone:"Africa/Cairo" as const},summary:{...position,...totals,currency:"EGP" as const},
          accounts,recentTransactions:recent,upcomingRecurring:upcoming.data},
        meta:{stage:"core",deferred:["incomeVsExpenses","budgets","goals"],upcoming:{...upcoming.meta,limit:5},recentTransactions:{limit:5,scope:"all_history"}}};
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { discard = true; }
        throw error;
      } finally { client.release(discard); }
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
