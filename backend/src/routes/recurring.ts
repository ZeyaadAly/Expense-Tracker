import { Router, type Request, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { RecurringService } from "../services/recurring.js";
import { ApiError } from "../utils/api-error.js";
import { validateAccountActionBody } from "../validators/account.js";
import { validateQuery, validateUuid } from "../validators/request.js";
import { validateRecurringBody, validateRecurringQuery, validateUpcomingQuery } from "../validators/recurring.js";

export function createRecurringRouter(service:RecurringService,requireAuth:RequestHandler) {
  const router = Router();
  const owner = (request:Request) => {
    if (!request.auth) throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");
    return request.auth.userId;
  };
  router.all("/recurring/upcoming",requireAuth,allowMethods(["GET"]));
  router.get("/recurring/upcoming",async (request,response) => {
    response.json(await service.upcomingRecurring(owner(request),validateUpcomingQuery(request.originalUrl)));
  });
  router.all("/recurring",requireAuth,allowMethods(["GET","POST"]));
  router.all("/recurring/:id",requireAuth,allowMethods(["GET","PUT"]));
  for (const action of ["pause","resume","archive"] as const) router.all(`/recurring/:id/${action}`,requireAuth,allowMethods(["POST"]));
  router.get("/recurring",async (request,response) => {
    const data = await service.listRecurring(owner(request),validateRecurringQuery(request.originalUrl));
    response.json({data,meta:{count:data.length}});
  });
  router.post("/recurring",async (request,response) => {
    validateQuery(request.originalUrl);
    const data = await service.createRecurring(owner(request),validateRecurringBody(request.body));
    response.location(`/api/v2/recurring/${data.id}`).status(201).json({data});
  });
  router.get("/recurring/:id",async (request,response) => {
    validateQuery(request.originalUrl);
    response.json({data:await service.getRecurring(owner(request),validateUuid(request.params.id as string))});
  });
  router.put("/recurring/:id",async (request,response) => {
    validateQuery(request.originalUrl);
    response.json({data:await service.updateRecurring(owner(request),validateUuid(request.params.id as string),validateRecurringBody(request.body))});
  });
  for (const action of ["pause","resume","archive"] as const) router.post(`/recurring/:id/${action}`,async (request,response) => {
    validateQuery(request.originalUrl); validateAccountActionBody(request.body);
    const operation = action === "pause" ? service.pauseRecurring : action === "resume" ? service.resumeRecurring : service.archiveRecurring;
    response.json({data:await operation(owner(request),validateUuid(request.params.id as string))});
  });
  return router;
}
