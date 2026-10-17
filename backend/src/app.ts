import cors from "cors";
import express, { Router } from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { requestPolicy, routeNotFound } from "./middleware/request.js";
import { createHealthRouter } from "./routes/health.js";
import { createTransactionRouter, createTransactionMethodRouter } from "./routes/transactions.js";
import type { TransactionService } from "./services/transactions.js";
import type { CategoryService } from "./services/categories.js";
import { createCategoryRouter } from "./routes/categories.js";
import { createRequireAuth } from "./middleware/auth.js";
import { createProfileRouter } from "./routes/profiles.js";
import type { ProfileService } from "./services/profiles.js";
import type { AccountService } from "./services/accounts.js";
import { createAccountRouter } from "./routes/accounts.js";
import type {V2TransactionService} from "./services/v2-transactions.js";
import {createV2TransactionRouter} from "./routes/v2-transactions.js";
import type {TransferService} from "./services/transfers.js";
import {createTransferRouter} from "./routes/transfers.js";
import type { RecurringService } from "./services/recurring.js";
import { createRecurringRouter } from "./routes/recurring.js";
import { createRecurringCronRouter, type RecurringCronOptions } from "./routes/recurring-cron.js";
import type { DashboardService } from "./services/dashboard.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createAnalyticsRouter, type AnalyticsService } from "./routes/analytics.js";
import { createBudgetRouter } from "./routes/budgets.js";
import type { BudgetService } from "./services/budgets.js";
import type { GoalService } from "./services/goals.js";
import { createGoalRouter } from "./routes/goals.js";

export function createApp(options: {
  clientOrigin: string;
  databaseHealth: () => Promise<boolean>;
  additionalRoutes?: Router;
  transactions?: TransactionService;
  v2Transactions?: V2TransactionService;
  transfers?: TransferService;
  recurring?: RecurringService;
  dashboard?: DashboardService;
  analytics?: AnalyticsService;
  budgets?: BudgetService;
  goals?: GoalService;
  budgetOptions?: {now?:()=>Date};
  recurringCron?: RecurringCronOptions;
  categories?: CategoryService;
  categoryManagement?: boolean;
  profiles?: ProfileService;
  accounts?: AccountService;
  supabaseUrl?: string;
  financialMode?: "maintenance" | "v2";
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });
  const maintenanceResponse = (_request: express.Request, response: express.Response) => {
    response.set("Cache-Control", "no-store").status(503).json({ error: {
      code: "MAINTENANCE", message: "Financial services are temporarily unavailable.", details: [],
    } });
  };
  if (options.financialMode === "maintenance") app.all("/internal/recurring/process", maintenanceResponse);
  if (options.recurringCron) app.use(createRecurringCronRouter(options.recurringCron));
  const api = Router();
  api.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  api.use(cors({ origin: options.clientOrigin }));
  if (options.financialMode) api.use((request, response, next) => {
    if (request.path === "/health") return next();
    if (options.financialMode === "maintenance") return maintenanceResponse(request, response);
    response.status(410).json({ error: {
      code: "API_RETIRED", message: "This financial API has been retired. Use the authenticated V2 application.", details: [],
    } });
  });
  if (options.transactions) api.use(createTransactionMethodRouter());
  api.use(requestPolicy);
  api.use(express.json({ limit: "16kb", strict: false }));
  api.use(createHealthRouter(options.databaseHealth));
  if (options.transactions) api.use(createTransactionRouter(options.transactions));
  if (options.additionalRoutes) api.use(options.additionalRoutes);
  api.use(routeNotFound);
  api.use(errorHandler);
  app.use("/api/v1", api);
  const v2 = Router();
  v2.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  v2.use(cors({ origin: options.clientOrigin }));
  if (options.financialMode === "maintenance") v2.use((request, response, next) => {
    if (request.path === "/health") return next();
    return maintenanceResponse(request, response);
  });
  v2.use(requestPolicy);
  v2.use(express.json({ limit: "16kb", strict: false }));
  v2.use(createHealthRouter(options.databaseHealth));
  if (options.categories) v2.use(createCategoryRouter(options.categories, createRequireAuth(options.supabaseUrl), options.categoryManagement === true));
  if (options.profiles) v2.use(createProfileRouter(options.profiles, createRequireAuth(options.supabaseUrl)));
  if (options.accounts) v2.use(createAccountRouter(options.accounts, createRequireAuth(options.supabaseUrl)));
  if (options.v2Transactions) v2.use(createV2TransactionRouter(options.v2Transactions, createRequireAuth(options.supabaseUrl)));
  if (options.transfers) v2.use(createTransferRouter(options.transfers, createRequireAuth(options.supabaseUrl)));
  if (options.recurring) v2.use(createRecurringRouter(options.recurring, createRequireAuth(options.supabaseUrl)));
  if (options.dashboard) v2.use(createDashboardRouter(options.dashboard, createRequireAuth(options.supabaseUrl)));
  if (options.analytics) v2.use(createAnalyticsRouter(options.analytics, createRequireAuth(options.supabaseUrl)));
  if (options.budgets) v2.use(createBudgetRouter(options.budgets, createRequireAuth(options.supabaseUrl),options.budgetOptions));
  if (options.goals) v2.use(createGoalRouter(options.goals, createRequireAuth(options.supabaseUrl)));
  v2.use(routeNotFound);
  v2.use(errorHandler);
  app.use("/api/v2", v2);
  app.use(routeNotFound);
  app.use(errorHandler);
  return app;
}
