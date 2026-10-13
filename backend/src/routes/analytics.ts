import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { createAnalyticsService } from "../services/analytics.js";
import { ApiError } from "../utils/api-error.js";
import { validateAnalyticsQuery } from "../validators/analytics.js";

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
export function createAnalyticsRouter(service: AnalyticsService, requireAuth: RequestHandler) {
  const router = Router();
  router.all("/analytics/overview",requireAuth,allowMethods(["GET"]));
  router.get("/analytics/overview",async (request,response) => {
    if (!request.auth) throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");
    const range = validateAnalyticsQuery(request.originalUrl,request.auth.userId);
    response.json({data:await service.getOverview(request.auth.userId,range)});
  });
  return router;
}
