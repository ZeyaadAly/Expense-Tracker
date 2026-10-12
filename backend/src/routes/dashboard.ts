import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { DashboardService } from "../services/dashboard.js";
import { ApiError } from "../utils/api-error.js";
import { validateDashboardQuery } from "../validators/dashboard.js";

export function createDashboardRouter(service:DashboardService,requireAuth:RequestHandler) {
  const router = Router();
  router.all("/dashboard",requireAuth,allowMethods(["GET"]));
  router.get("/dashboard",async (request,response) => {
    if (!request.auth) throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");
    response.json(await service.getDashboard(request.auth.userId,validateDashboardQuery(request.originalUrl)));
  });
  return router;
}
