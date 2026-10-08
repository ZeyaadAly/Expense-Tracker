import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { isDatabaseReachable } from "./db/health.js";
import { pool } from "./db/pool.js";
import { createTransactionService } from "./services/transactions.js";
import { createCategoryService } from "./services/categories.js";
import { createProfileService } from "./services/profiles.js";
import { createAccountService } from "./services/accounts.js";
import {createV2TransactionService} from "./services/v2-transactions.js";
import {createTransferService} from "./services/transfers.js";

const app = createApp({ clientOrigin: env.clientOrigin, databaseHealth: isDatabaseReachable, transfers:createTransferService(pool,{cursorSigningSecret:process.env.CURSOR_SIGNING_SECRET}),
  transactions: createTransactionService(pool), v2Transactions:createV2TransactionService(pool,{cursorSigningSecret:process.env.CURSOR_SIGNING_SECRET}), categories: createCategoryService(pool), profiles: createProfileService(pool), accounts: createAccountService(pool), supabaseUrl: process.env.SUPABASE_URL });

app.listen(env.port, () => {
  console.log(`Expense Tracker API listening on http://localhost:${env.port}`);
});
