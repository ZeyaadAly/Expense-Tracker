import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/api/health", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json({
    status: "ok",
    api: "running",
    configuration: "valid",
  });
});
