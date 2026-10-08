import {Router,type RequestHandler} from "express";
import type {TransferService} from "../services/transfers.js";
import {allowMethods} from "../middleware/request.js";
import {validateQuery,validateUuid} from "../validators/request.js";
import {validateTransfer,validateTransferQuery} from "../validators/transfer.js";
import {ApiError} from "../utils/api-error.js";

export function createTransferRouter(service:TransferService,requireAuth:RequestHandler) {
  const router=Router();
  router.all("/transfers",requireAuth,allowMethods(["GET","POST"]));
  router.all("/transfers/:id",requireAuth,allowMethods(["GET","PUT","DELETE"]));
  const owner=(request:Parameters<RequestHandler>[0])=>{
    if(!request.auth)throw new ApiError(401,"AUTH_REQUIRED","Sign in to continue.");return request.auth.userId;
  };
  router.get("/transfers",async(request,response)=>{
    const query=validateTransferQuery(request.originalUrl);const data=await service.listTransfers(owner(request),query);
    response.json(data);
  });
  router.post("/transfers",async(request,response)=>{
    validateQuery(request.originalUrl);const data=await service.createTransfer(owner(request),validateTransfer(request.body));
    response.location(`/api/v2/transfers/${data.id}`).status(201).json({data});
  });
  router.get("/transfers/:id",async(request,response)=>{
    validateQuery(request.originalUrl);response.json({data:await service.getTransfer(owner(request),validateUuid(request.params.id as string))});
  });
  router.put("/transfers/:id",async(request,response)=>{
    validateQuery(request.originalUrl);response.json({data:await service.updateTransfer(owner(request),validateUuid(request.params.id as string),validateTransfer(request.body))});
  });
  router.delete("/transfers/:id",async(request,response)=>{
    validateQuery(request.originalUrl);await service.deleteTransfer(owner(request),validateUuid(request.params.id as string));response.status(204).end();
  });
  return router;
}

