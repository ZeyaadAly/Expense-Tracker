import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { CategoryService } from "../services/categories.js";
import { validateCategoryQuery } from "../validators/category.js";
import { ApiError } from "../utils/api-error.js";

export function createCategoryRouter(service: CategoryService, requireAuth: RequestHandler) {
  const router = Router();
  router.all("/categories", requireAuth, allowMethods(["GET"]));
  router.get("/categories", async (request, response) => {
    if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    const filters = validateCategoryQuery(request.originalUrl);
    const data = await service.list(request.auth.userId, filters);
    response.json({ data, meta: { count: data.length } });
  });
  return router;
}
