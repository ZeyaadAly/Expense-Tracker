import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { CategoryService } from "../services/categories.js";
import { validateCategoryActionBody, validateCategoryBody, validateCategoryQuery } from "../validators/category.js";
import { validateQuery, validateUuid } from "../validators/request.js";
import { ApiError } from "../utils/api-error.js";

export function createCategoryRouter(service: CategoryService, requireAuth: RequestHandler, managementEnabled = false) {
  const router = Router();
  router.all("/categories", requireAuth, allowMethods(managementEnabled ? ["GET", "POST"] : ["GET"]));
  if (managementEnabled) {
    router.all("/categories/:id", requireAuth, allowMethods(["PUT"]));
    router.all("/categories/:id/archive", requireAuth, allowMethods(["POST"]));
    router.all("/categories/:id/restore", requireAuth, allowMethods(["POST"]));
  }
  const owner = (request: Parameters<RequestHandler>[0]) => {
    if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    return request.auth.userId;
  };
  router.get("/categories", async (request, response) => {
    const filters = validateCategoryQuery(request.originalUrl);
    const data = await service.list(owner(request), filters);
    response.json({ data, meta: { count: data.length } });
  });
  if (managementEnabled) {
    router.post("/categories", async (request, response) => {
      validateQuery(request.originalUrl);
      const data = await service.create(owner(request), validateCategoryBody(request.body));
      response.location(`/api/v2/categories/${data.id}`).status(201).json({ data });
    });
    router.put("/categories/:id", async (request, response) => {
      validateQuery(request.originalUrl);
      response.json({ data: await service.update(owner(request), validateUuid(request.params.id as string), validateCategoryBody(request.body)) });
    });
    for (const action of ["archive", "restore"] as const) router.post(`/categories/:id/${action}`, async (request, response) => {
      validateQuery(request.originalUrl);
      validateCategoryActionBody(request.body);
      const userId = owner(request), id = validateUuid(request.params.id as string);
      if (action === "archive") {
        const result = await service.archive(userId, id);
        response.json({ data: result.category, meta: { pausedRecurringCount: result.pausedRecurringCount } });
      } else response.json({ data: await service.restore(userId, id) });
    });
  }
  return router;
}
