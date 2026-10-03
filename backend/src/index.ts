import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { isDatabaseReachable } from "./db/health.js";
import { pool } from "./db/pool.js";
import { createTransactionService } from "./services/transactions.js";

const app = createApp({ clientOrigin: env.clientOrigin, databaseHealth: isDatabaseReachable,
  transactions: createTransactionService(pool) });

app.listen(env.port, () => {
  console.log(`Expense Tracker API listening on http://localhost:${env.port}`);
});
