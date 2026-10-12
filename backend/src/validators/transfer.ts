import type {TransferInput,TransferListQuery} from "../types/transfer.js";
import {validationError,type FieldError} from "../utils/api-error.js";
import {formatDecimal} from "../utils/money.js";
import {cairoToday,isCalendarDate,isPositiveTransactionAmount} from "./transaction.js";
import {validateUuid} from "./request.js";
import {validateV2TransactionQuery} from "./v2-transaction.js";

export function validateTransferQuery(originalUrl:string):TransferListQuery {
  const errors:FieldError[]=[];
  for(const key of new Set(new URL(originalUrl,"http://localhost").searchParams.keys())) {
    if(!["accountId","from","to","limit","cursor"].includes(key))errors.push({field:key,message:"This query parameter is not supported."});
  }
  if(errors.length)throw validationError(errors);
  // Reuse the frozen UUID/date/scalar/limit/cursor rules without allowing transaction filters.
  return validateV2TransactionQuery(originalUrl);
}

export function validateTransfer(input:unknown,now=new Date()):TransferInput {
  if(typeof input!=="object"||input===null||Array.isArray(input))throw validationError([{field:"body",message:"Provide a JSON object."}]);
  const body=input as Record<string,unknown>,errors:FieldError[]=[],ids:Record<string,string>={};
  const required=["sourceAccountId","destinationAccountId","amount","date"];
  for(const field of Object.keys(body))if(![...required,"description"].includes(field))errors.push({field,message:"This field is not allowed."});
  for(const field of required) {
    if(!Object.hasOwn(body,field))errors.push({field,message:"This field is required."});
    else if(typeof body[field]!=="string")errors.push({field,message:"Enter a string value."});
  }
  for(const field of ["sourceAccountId","destinationAccountId"])if(typeof body[field]==="string") {
    try {ids[field]=validateUuid(body[field]);}catch {errors.push({field,message:"Provide a canonical hyphenated UUID."});}
  }
  if(ids.sourceAccountId&&ids.sourceAccountId===ids.destinationAccountId)errors.push({field:"destinationAccountId",message:"Choose different source and destination accounts."});
  if(typeof body.amount==="string"&&!isPositiveTransactionAmount(body.amount))errors.push({field:"amount",message:"Enter a positive amount from 0.01 to 999999999.99 with at most two decimal places."});
  if(typeof body.date==="string"&&(!isCalendarDate(body.date)||body.date>cairoToday(now)))errors.push({field:"date",message:"Enter a real date from 1900-01-01 through today in Africa/Cairo."});
  let description:string|null=null;
  if(body.description!==undefined&&body.description!==null) {
    if(typeof body.description!=="string")errors.push({field:"description",message:"Enter a string or null."});
    else {
      description=body.description.trim()||null;
      if(Array.from(description??"").length>200||body.description.includes("\u0000")||/\p{Cs}/u.test(body.description))errors.push({field:"description",message:"Enter at most 200 valid Unicode characters after trimming."});
    }
  }
  if(errors.length)throw validationError(errors);
  return {sourceAccountId:ids.sourceAccountId,destinationAccountId:ids.destinationAccountId,amount:formatDecimal(body.amount as string),date:body.date as string,description};
}
