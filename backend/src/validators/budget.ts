import type { BudgetFilters, BudgetInput, BudgetUpdate } from "../types/budget.js";
import { validationError, type FieldError } from "../utils/api-error.js";
import { formatDecimal } from "../utils/money.js";
import { validateUuid } from "./request.js";
import { cairoToday, isPositiveTransactionAmount } from "./transaction.js";

export function validateBudgetBody(input:unknown,create:true):BudgetInput;
export function validateBudgetBody(input:unknown,create?:false):BudgetUpdate;
export function validateBudgetBody(input:unknown,create=false):BudgetInput|BudgetUpdate {
  if(!input||typeof input!=="object"||Array.isArray(input))throw validationError([{field:"body",message:"Provide a JSON object."}]);
  const body=input as Record<string,unknown>,errors:FieldError[]=[];
  const fields=create?["categoryId","year","month","amount","alertThresholdPercent"]:["amount","alertThresholdPercent"];
  for(const field of Object.keys(body))if(!fields.includes(field))errors.push({field,message:"This field is not allowed."});
  if(typeof body.amount!=="string"||!isPositiveTransactionAmount(body.amount))errors.push({field:"amount",message:"Enter a decimal string from 0.01 to 999999999.99 with at most two decimals."});
  const threshold=create&&body.alertThresholdPercent===undefined?90:body.alertThresholdPercent;
  if(!Number.isInteger(threshold)||(threshold as number)<1||(threshold as number)>100)errors.push({field:"alertThresholdPercent",message:"Enter an integer from 1 to 100."});
  let categoryId="";
  if(create){
    try{if(typeof body.categoryId!=="string")throw Error();categoryId=validateUuid(body.categoryId);}catch{errors.push({field:"categoryId",message:"Provide a canonical hyphenated UUID."});}
    for(const [field,min,max]of [["year",1900,9999],["month",1,12]] as const)if(!Number.isInteger(body[field])||(body[field] as number)<min||(body[field] as number)>max)errors.push({field,message:`Enter an integer from ${min} to ${max}.`});
  }
  if(errors.length)throw validationError(errors);
  const update={amount:formatDecimal(body.amount as string),alertThresholdPercent:threshold as number};
  return create?{...update,categoryId,year:body.year as number,month:body.month as number}:update;
}
export function validateBudgetQuery(originalUrl:string,now=new Date()):BudgetFilters {
  const query=new URL(originalUrl,"http://localhost").searchParams,errors:FieldError[]=[];
  for(const key of new Set(query.keys())){
    if(!["year","month","categoryId"].includes(key))errors.push({field:key,message:"This query parameter is not supported."});
    else if(query.getAll(key).length!==1)errors.push({field:key,message:"Provide this parameter only once."});
  }
  const [currentYear,currentMonth]=cairoToday(now).split("-").map(Number);
  let year=currentYear,month=currentMonth,categoryId:string|undefined;
  if(query.has("year")||query.has("month")){
    const y=query.get("year")??"",m=query.get("month")??"";
    if(!/^\d{4}$/.test(y)||Number(y)<1900||Number(y)>9999)errors.push({field:"year",message:"Provide year and month together; year must be 1900 to 9999."});else year=Number(y);
    if(!/^(?:[1-9]|1[0-2])$/.test(m))errors.push({field:"month",message:"Provide year and month together; month must be 1 to 12."});else month=Number(m);
  }
  if(query.has("categoryId"))try{categoryId=validateUuid(query.get("categoryId")!);}catch{errors.push({field:"categoryId",message:"Provide a canonical hyphenated UUID."});}
  if(errors.length)throw validationError(errors);
  return {year,month,...(categoryId?{categoryId}:{})};
}
