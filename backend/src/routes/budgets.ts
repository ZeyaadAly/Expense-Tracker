import { Router, type Request, type RequestHandler } from "express";
import { allowMethods } from "../middleware/request.js";
import type { BudgetService } from "../services/budgets.js";
import { ApiError } from "../utils/api-error.js";
import { validateQuery, validateUuid } from "../validators/request.js";
import { validateBudgetBody, validateBudgetQuery } from "../validators/budget.js";
export function createBudgetRouter(service:BudgetService,requireAuth:RequestHandler,options:{now?:()=>Date}={}){
  const router=Router();const owner=(request:Request)=>{if(!request.auth)throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");return request.auth.userId;};
  router.all("/budgets",requireAuth,allowMethods(["GET","POST"]));
  router.all("/budgets/:id",requireAuth,allowMethods(["GET","PUT","DELETE"]));
  router.get("/budgets",async(request,response)=>{const data=await service.listBudgets(owner(request),validateBudgetQuery(request.originalUrl,options.now?.()));response.json({data,meta:{count:data.length}});});
  router.post("/budgets",async(request,response)=>{validateQuery(request.originalUrl);const data=await service.createBudget(owner(request),validateBudgetBody(request.body,true));response.location(`/api/v2/budgets/${data.id}`).status(201).json({data});});
  router.get("/budgets/:id",async(request,response)=>{validateQuery(request.originalUrl);response.json({data:await service.getBudget(owner(request),validateUuid(request.params.id as string))});});
  router.put("/budgets/:id",async(request,response)=>{validateQuery(request.originalUrl);response.json({data:await service.updateBudget(owner(request),validateUuid(request.params.id as string),validateBudgetBody(request.body))});});
  router.delete("/budgets/:id",async(request,response)=>{validateQuery(request.originalUrl);await service.deleteBudget(owner(request),validateUuid(request.params.id as string));response.status(204).end();});
  return router;
}
