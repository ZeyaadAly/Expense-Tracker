import {Router,type RequestHandler} from "express";
import type {V2TransactionService} from "../services/v2-transactions.js";
import {allowMethods} from "../middleware/request.js";
import {validateQuery,validateUuid} from "../validators/request.js";
import {validateV2Transaction,validateV2TransactionQuery} from "../validators/v2-transaction.js";
import {ApiError} from "../utils/api-error.js";

export function createV2TransactionRouter(service:V2TransactionService,requireAuth:RequestHandler) {
  const router=Router();
  router.all("/transactions",requireAuth,allowMethods(["GET","POST"]));
  router.all("/transactions/:id",requireAuth,allowMethods(["GET","PUT","DELETE"]));
  const owner=(request:Parameters<RequestHandler>[0])=>{
    if(!request.auth)throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");return request.auth.userId;
  };
  router.get("/transactions",async(request,response)=>{
    const query=validateV2TransactionQuery(request.originalUrl);const data=await service.listTransactions(owner(request),query);
    response.json(data);
  });
  router.post("/transactions",async(request,response)=>{
    validateQuery(request.originalUrl);const data=await service.createTransaction(owner(request),validateV2Transaction(request.body));
    response.location(`/api/v2/transactions/${data.id}`).status(201).json({data});
  });
  router.get("/transactions/:id",async(request,response)=>{
    validateQuery(request.originalUrl);response.json({data:await service.getTransaction(owner(request),validateUuid(request.params.id as string))});
  });
  router.put("/transactions/:id",async(request,response)=>{
    validateQuery(request.originalUrl);response.json({data:await service.updateTransaction(owner(request),validateUuid(request.params.id as string),validateV2Transaction(request.body))});
  });
  router.delete("/transactions/:id",async(request,response)=>{
    validateQuery(request.originalUrl);await service.deleteTransaction(owner(request),validateUuid(request.params.id as string));response.status(204).end();
  });
  return router;
}
