import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { ProfileService } from "../services/profiles.js";
import { validateQuery } from "../validators/request.js";
import { validateProfileBody } from "../validators/profile.js";
import { ApiError } from "../utils/api-error.js";

export function createProfileRouter(service: ProfileService, requireAuth: RequestHandler) {
  const router = Router();
  router.all("/profile", requireAuth, allowMethods(["GET", "PUT"]));
  router.all("/profile/bootstrap", requireAuth, allowMethods(["POST"]));
  const userId = (request: Parameters<RequestHandler>[0]) => {
    if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    return request.auth.userId;
  };
  router.post("/profile/bootstrap", async (request, response) => {
    validateQuery(request.originalUrl); validateProfileBody(request.body, true);
    response.json({ data: await service.ensureProfile(userId(request)) });
  });
  router.get("/profile", async (request, response) => {
    validateQuery(request.originalUrl);
    response.json({ data: await service.get(userId(request)) });
  });
  router.put("/profile", async (request, response) => {
    validateQuery(request.originalUrl);
    const input = validateProfileBody(request.body)!;
    response.json({ data: await service.update(userId(request), input) });
  });
  return router;
}
