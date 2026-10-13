import { Router, type Request, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { GoalService } from "../services/goals.js";
import { ApiError } from "../utils/api-error.js";
import { validateGoalBody, validateGoalQuery } from "../validators/goal.js";
import { validateAccountActionBody } from "../validators/account.js";
import { validateQuery, validateUuid } from "../validators/request.js";

export function createGoalRouter(service: GoalService, requireAuth: RequestHandler) {
  const router = Router();
  const owner = (request: Request) => { if (!request.auth) throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue."); return request.auth.userId; };
  router.all("/goals",requireAuth,allowMethods(["GET","POST"]));
  router.all("/goals/:id",requireAuth,allowMethods(["GET","PUT"]));
  for (const action of ["complete","archive"] as const) {
    router.all(`/goals/:id/${action}`,requireAuth,allowMethods(["POST"]));
    router.post(`/goals/:id/${action}`,async (request,response)=>{
      validateQuery(request.originalUrl); validateAccountActionBody(request.body);
      const id = validateUuid(request.params.id as string), userId = owner(request);
      response.json({data:await (action === "complete" ? service.completeGoal(userId,id) : service.archiveGoal(userId,id))});
    });
  }
  router.get("/goals",async (request,response)=>{ const data = await service.listGoals(owner(request),validateGoalQuery(request.originalUrl)); response.json({data,meta:{count:data.length}}); });
  router.post("/goals",async (request,response)=>{ validateQuery(request.originalUrl); const data = await service.createGoal(owner(request),validateGoalBody(request.body,true)); response.location(`/api/v2/goals/${data.id}`).status(201).json({data}); });
  router.get("/goals/:id",async (request,response)=>{ validateQuery(request.originalUrl); response.json({data:await service.getGoal(owner(request),validateUuid(request.params.id as string))}); });
  router.put("/goals/:id",async (request,response)=>{ validateQuery(request.originalUrl); response.json({data:await service.updateGoal(owner(request),validateUuid(request.params.id as string),validateGoalBody(request.body))}); });
  return router;
}
