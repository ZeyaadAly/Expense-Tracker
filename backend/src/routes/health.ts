import { Router } from "express";
import { isDatabaseReachable } from "../db/health.js";

export const healthRouter = Router();

healthRouter.get("/api/v1/health", async (_request, response) => {
  response.set("Cache-Control", "no-store");

  if (!(await isDatabaseReachable())) {
    response.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable. Please try again later.",
        details: [],
      },
    });
    return;
  }

  response.status(200).json({
    data: { api: "running", database: "reachable" },
  });
});
