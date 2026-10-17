import {createDashboardService} from "./dist/services/dashboard.js";
// Vercel detects this root entry before the reusable src/app.ts factory.
import "express";
import process from "node:process";
import { createApp } from "./dist/app.js";
import { env } from "./dist/config/env.js";
import { isDatabaseReachable } from "./dist/db/health.js";
import { pool } from "./dist/db/pool.js";
import { createTransactionService } from "./dist/services/transactions.js";
import { createCategoryService } from "./dist/services/categories.js";
import { createProfileService } from "./dist/services/profiles.js";
import { createAccountService } from "./dist/services/accounts.js";
import {createV2TransactionService} from "./dist/services/v2-transactions.js";
import {createTransferService} from "./dist/services/transfers.js";
import {createRecurringService} from "./dist/services/recurring.js";
import {createRecurringProcessor} from "./dist/services/recurring-processor.js";
import {createAnalyticsService} from "./dist/services/analytics.js";
import {createBudgetService} from "./dist/services/budgets.js";
import {createGoalService} from "./dist/services/goals.js";
import {readReleaseConfig} from "./dist/config/release.js";

// All deployed domains share the tested release guard. Missing configuration
// preserves T66 maintenance; public access and cron require later release gates.
const release = readReleaseConfig(process.env, true);

export default createApp({
  financialMode: release.stage === "maintenance" ? "maintenance" : "v2",
  legacyRetired: true,
  releaseAccess: release,
  recurringEnabled: release.cronEnabled,
  clientOrigin: env.clientOrigin,
  databaseHealth: isDatabaseReachable,
  transactions: createTransactionService(pool),
  v2Transactions: createV2TransactionService(pool,{cursorSigningSecret:process.env.CURSOR_SIGNING_SECRET}),
  transfers: createTransferService(pool,{cursorSigningSecret:process.env.CURSOR_SIGNING_SECRET}),
  dashboard: createDashboardService(pool),
  analytics: createAnalyticsService(pool),
  budgets: createBudgetService(pool),
  goals: createGoalService(pool),
  recurring: createRecurringService(pool),
  recurringCron: {processor: createRecurringProcessor(pool)},
  categories: createCategoryService(pool),
  categoryManagement: true,
  profiles: createProfileService(pool),
  accounts: createAccountService(pool),
  supabaseUrl: process.env.SUPABASE_URL,
});
