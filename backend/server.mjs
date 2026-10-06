// Vercel detects this root entry before the reusable src/app.ts factory.
import "express";
import { createApp } from "./dist/app.js";
import { env } from "./dist/config/env.js";
import { isDatabaseReachable } from "./dist/db/health.js";
import { pool } from "./dist/db/pool.js";
import { createTransactionService } from "./dist/services/transactions.js";
import { createCategoryService } from "./dist/services/categories.js";
import { createProfileService } from "./dist/services/profiles.js";

export default createApp({
  clientOrigin: env.clientOrigin,
  databaseHealth: isDatabaseReachable,
  transactions: createTransactionService(pool),
  categories: createCategoryService(pool),
  profiles: createProfileService(pool),
  supabaseUrl: process.env.SUPABASE_URL,
});
