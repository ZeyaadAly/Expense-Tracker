import cors from "cors";
import express, { Router } from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { requestPolicy, routeNotFound } from "./middleware/request.js";
import { createHealthRouter } from "./routes/health.js";
import { createTransactionRouter, createTransactionMethodRouter } from "./routes/transactions.js";
import type { TransactionService } from "./services/transactions.js";

export function createApp(options: {
  clientOrigin: string;
  databaseHealth: () => Promise<boolean>;
  additionalRoutes?: Router;
  transactions?: TransactionService;
}) {
  const app = express();
  app.disable("x-powered-by");
  const api = Router();
  api.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  api.use(cors({ origin: options.clientOrigin }));
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
  v2.use(requestPolicy);
  v2.use(createHealthRouter(options.databaseHealth));
  v2.use(routeNotFound);
  v2.use(errorHandler);
  app.use("/api/v2", v2);
  app.use(routeNotFound);
  app.use(errorHandler);
  return app;
}
