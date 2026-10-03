import { Router } from "express";
import type { TransactionService } from "../services/transactions.js";
import { validateTransaction } from "../validators/transaction.js";
import { validateQuery, validateUuid } from "../validators/request.js";
import { ApiError } from "../utils/api-error.js";
import { allowMethods } from "../middleware/request.js";

// Run method checks before body parsing so unsupported methods consistently return 405.
export function createTransactionMethodRouter() {
  const router = Router();
  router.all("/transactions", allowMethods(["GET", "POST"]));
  router.all("/transactions/:id", allowMethods(["GET", "PUT"]));
  router.all("/summary", allowMethods(["GET"]));
  return router;
}

export function createTransactionRouter(service: TransactionService) {
  const router = Router();
  router.route("/transactions")
    .get(async (request, response) => {
      const filters = validateQuery(request.originalUrl, true);
      const data = await service.list(filters);
      response.json({ data, meta: { count: data.length,
        filters: { type: filters.type ?? null, category: filters.category ?? null } } });
    })
    .post(async (request, response) => {
      validateQuery(request.originalUrl);
      const input = validateTransaction(request.body);
      const data = await service.create(input);
      response.location(`/api/v1/transactions/${data.id}`).status(201).json({ data });
    });
  router.route("/transactions/:id")
    .put(async (request, response) => {
      validateQuery(request.originalUrl);
      const id = validateUuid(request.params.id);
      const input = validateTransaction(request.body);
      const data = await service.update(id, input);
      if (!data) throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.");
      response.json({ data });
    })
    .get(async (request, response) => {
      validateQuery(request.originalUrl);
      const id = validateUuid(request.params.id);
      const data = await service.get(id);
      if (!data) throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.");
      response.json({ data });
    });
  router.route("/summary")
    .get(async (request, response) => {
      validateQuery(request.originalUrl);
      response.json({ data: await service.summary() });
    });
  return router;
}
