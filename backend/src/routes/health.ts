import { Router } from "express";
import { databaseUnavailable } from "../utils/api-error.js";
import { methodNotAllowed } from "../middleware/request.js";
import { validateQuery } from "../validators/request.js";

export function createHealthRouter(databaseHealth: () => Promise<boolean>) {
  const router = Router();

  const rejectMethod = methodNotAllowed(["GET"]);
  router.all("/health", (request, response, next) => {
    if (request.method !== "GET") { rejectMethod(request, response, next); return; }
    validateQuery(request.originalUrl);
    next();
  });
  router.get("/health", async (_request, response) => {
    if (!(await databaseHealth())) throw databaseUnavailable();
    response.status(200).json({
      data: { api: "running", database: "reachable" },
    });
  });
  return router;
}
