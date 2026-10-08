import { Router, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { AccountService } from "../services/accounts.js";
import { validateQuery, validateUuid } from "../validators/request.js";
import { validateAccountBody, validateAccountQuery, validateAccountActionBody } from "../validators/account.js";
import { ApiError } from "../utils/api-error.js";

export function createAccountRouter(service: AccountService, requireAuth: RequestHandler) {
  const router = Router();
  router.all("/accounts/summary", requireAuth, allowMethods(["GET"]));
  router.get("/accounts/summary", async (request, response) => {
    validateQuery(request.originalUrl);
    if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    response.json({ data: await service.getSummary(request.auth.userId) });
  });
  router.all("/accounts", requireAuth, allowMethods(["GET", "POST"]));
  router.all("/accounts/:id", requireAuth, allowMethods(["GET", "PUT"]));
  router.all("/accounts/:id/summary", requireAuth, allowMethods(["GET"]));
  router.all("/accounts/:id/archive", requireAuth, allowMethods(["POST"]));
  router.all("/accounts/:id/restore", requireAuth, allowMethods(["POST"]));
  const owner = (request: Parameters<RequestHandler>[0]) => {
    if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    return request.auth.userId;
  };
  router.get("/accounts", async (request, response) => {
    const data = await service.listAccounts(owner(request), validateAccountQuery(request.originalUrl));
    response.json({ data, meta: { count: data.length } });
  });
  router.get("/accounts/:id/summary", async (request, response) => {
    validateQuery(request.originalUrl);
    response.json({ data: await service.getAccountSummary(owner(request), validateUuid(request.params.id as string)) });
  });
  router.post("/accounts", async (request, response) => {
    validateQuery(request.originalUrl);
    const data = await service.createAccount(owner(request), validateAccountBody(request.body, true));
    response.location(`/api/v2/accounts/${data.id}`).status(201).json({ data });
  });
  router.get("/accounts/:id", async (request, response) => {
    validateQuery(request.originalUrl);
    response.json({ data: await service.getAccount(owner(request), validateUuid(request.params.id as string)) });
  });
  router.put("/accounts/:id", async (request, response) => {
    validateQuery(request.originalUrl);
    response.json({ data: await service.updateAccount(owner(request), validateUuid(request.params.id as string), validateAccountBody(request.body)) });
  });
  for (const action of ["archive", "restore"] as const) router.post(`/accounts/:id/${action}`, async (request, response) => {
    validateQuery(request.originalUrl); validateAccountActionBody(request.body);
    const userId = owner(request), id = validateUuid(request.params.id as string);
    if (action === "archive") {
      const result = await service.archiveAccount(userId, id);
      response.json({ data: result.account, meta: { pausedRecurringCount: result.pausedRecurringCount } });
    } else response.json({ data: await service.restoreAccount(userId, id) });
  });
  return router;
}
