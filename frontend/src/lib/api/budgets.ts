"use client";
import {createSessionClient} from "./session-client";
import {V2ApiError,type V2RequestOptions} from "./v2-client";
export type BudgetPeriod={year:number;month:number};
export type BudgetQuery=BudgetPeriod&{categoryId?:string};
export type BudgetUpdate={amount:string;alertThresholdPercent:number};
export type BudgetInput=BudgetUpdate&BudgetPeriod&{categoryId:string};
export type Budget=BudgetInput&{id:string;categoryName:string;spent:string;remaining:string;percentUsed:string;status:"normal"|"near_limit"|"exceeded";createdAt:string;updatedAt:string};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const decimal=(v:unknown):v is string=>typeof v==="string"&&/^-?(0|[1-9]\d*)\.\d{2}$/.test(v)&&v!=="-0.00";
export const validBudgetPeriod=(p:BudgetPeriod)=>Number.isInteger(p.year)&&p.year>=1900&&p.year<=9999&&Number.isInteger(p.month)&&p.month>=1&&p.month<=12;
const invalid=(write=false)=>new V2ApiError(200,"INVALID_RESPONSE","unexpected",[],write);
export function parseBudget(v:unknown,write=false):Budget{
  const fields=["id","categoryId","categoryName","year","month","amount","alertThresholdPercent","spent","remaining","percentUsed","status","createdAt","updatedAt"];
  if(!object(v)||Object.keys(v).length!==fields.length||Object.keys(v).some(k=>!fields.includes(k))||!uuid(v.id)||!uuid(v.categoryId)||typeof v.categoryName!=="string"||!v.categoryName.trim()||Array.from(v.categoryName).length>80||!validBudgetPeriod(v as BudgetPeriod)||!Number.isInteger(v.alertThresholdPercent)||(v.alertThresholdPercent as number)<1||(v.alertThresholdPercent as number)>100||!["normal","near_limit","exceeded"].includes(v.status as string)||![v.amount,v.spent,v.remaining,v.percentUsed].every(decimal)||[v.amount,v.spent,v.percentUsed].some(n=>(n as string).startsWith("-"))||v.amount==="0.00"||![v.createdAt,v.updatedAt].every(t=>typeof t==="string"&&/^\d{4}-\d\d-\d\dT.*Z$/.test(t)&&!isNaN(Date.parse(t))))throw invalid(write);
  return v as Budget;
}
export function validateBudgetDraft(draft:{amount:string;threshold:string;categoryId:string},create:boolean):Record<string,string>{
  const errors:Record<string,string>={};
  if(!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(draft.amount)||/^0(?:\.0{1,2})?$/.test(draft.amount))errors.amount="Enter a decimal amount from 0.01 to 999999999.99 with at most two decimals.";
  if(!/^(?:[1-9]\d?|100)$/.test(draft.threshold))errors.alertThresholdPercent="Enter an integer from 1 to 100.";
  if(create&&!uuid(draft.categoryId))errors.categoryId="Choose an active expense category.";
  return errors;
}
export function createBudgetClient(userId:string,transport=createSessionClient(userId)){
  const path=(id:string)=>{if(!uuid(id))throw new V2ApiError(0,"INVALID_REQUEST","unexpected");return '/budgets/'+id;};
  const resource=(v:unknown,write=false,id?:string)=>{const b=parseBudget((v as {data?:unknown})?.data,write);if(id&&b.id!==id)throw invalid(write);return b;};
  return {
    async listBudgets(query:BudgetQuery,options?:V2RequestOptions){
      if(!validBudgetPeriod(query)||(query.categoryId!==undefined&&!uuid(query.categoryId)))throw new V2ApiError(0,"INVALID_REQUEST","unexpected");
      const v=await transport.get<unknown,{count:number}>('/budgets',{...options,query:{year:query.year,month:query.month,...(query.categoryId?{categoryId:query.categoryId}:{})}});
      if(!Array.isArray(v?.data)||v.meta?.count!==v.data.length)throw invalid();const rows=v.data.map(b=>parseBudget(b));
      if(rows.some(b=>b.year!==query.year||b.month!==query.month||(query.categoryId&&b.categoryId!==query.categoryId))||new Set(rows.map(b=>b.id)).size!==rows.length)throw invalid();return rows;
    },
    getBudget:async(id:string,options?:V2RequestOptions)=>resource(await transport.get(path(id),options),false,id),
    createBudget:async(input:BudgetInput,options?:V2RequestOptions)=>resource(await transport.post('/budgets',{categoryId:input.categoryId,year:input.year,month:input.month,amount:input.amount,alertThresholdPercent:input.alertThresholdPercent},options),true),
    updateBudget:async(id:string,input:BudgetUpdate,options?:V2RequestOptions)=>resource(await transport.put(path(id),{amount:input.amount,alertThresholdPercent:input.alertThresholdPercent},options),true,id),
    deleteBudget:async(id:string,options?:V2RequestOptions)=>{await transport.delete(path(id),options);},
  };
}
