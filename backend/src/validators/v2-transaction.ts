import type {V2TransactionInput,V2TransactionListQuery} from "../types/v2-transaction.js";
import {invalidTransactionCursor} from "../utils/transaction-cursor.js";
import {validationError,type FieldError} from "../utils/api-error.js";
import {formatDecimal} from "../utils/money.js";
import {cairoToday,isCalendarDate,isPositiveTransactionAmount} from "./transaction.js";
import {validateUuid} from "./request.js";

// Parse the URL directly so Express cannot hide repeated keys or object/array notation.
export function validateV2TransactionQuery(originalUrl: string): V2TransactionListQuery {
  const query = new URL(originalUrl, "http://localhost").searchParams;
  const errors: FieldError[] = [];
  for (const key of new Set(query.keys())) {
    if (!["q","type","accountId","categoryId","from","to","recurring","limit","cursor"].includes(key)) errors.push({field: key, message: "This query parameter is not supported."});
    else if (query.getAll(key).length !== 1) errors.push({field: key, message: "Provide this parameter only once."});
  }
  const q = (query.get("q") ?? "").trim();
  if (Array.from(q).length > 200) errors.push({field: "q", message: "Enter at most 200 characters after trimming."});
  // PostgreSQL text cannot contain a zero byte; reject it before SQL.
  if (q.includes("\u0000")) errors.push({field: "q", message: "Search text cannot contain a null character."});
  const filters: V2TransactionListQuery = q ? {q} : {};
  const limit=query.get("limit"),cursor=query.get("cursor");
  if(limit!==null) {
    if(!/^(?:[1-9]|[1-9][0-9]|100)$/.test(limit))errors.push({field:"limit",message:"Enter an integer from 1 to 100."});
    else filters.limit=Number(limit);
  }
  if(cursor!==null) {
    if(cursor.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))errors.push(...invalidTransactionCursor().details);
    else filters.cursor=cursor;
  }
  const type = query.get("type"), recurring = query.get("recurring");
  if (type !== null) {
    if (type !== "income" && type !== "expense") errors.push({field: "type", message: "Choose income or expense, or omit the filter."});
    else filters.type = type;
  }
  if (recurring !== null) {
    if (recurring !== "manual" && recurring !== "generated") errors.push({field: "recurring", message: "Choose manual or generated, or omit the filter."});
    else filters.recurring = recurring;
  }
  for (const field of ["accountId","categoryId"] as const) {
    const value = query.get(field);
    if (value !== null) {
      try {filters[field] = validateUuid(value);}
      catch {errors.push({field, message: "Provide a canonical hyphenated UUID."});}
    }
  }
  for (const field of ["from","to"] as const) {
    const value = query.get(field);
    if (value !== null) {
      if (!isCalendarDate(value)) errors.push({field, message: "Enter a real date from 1900-01-01 through 9999-12-31."});
      else filters[field] = value;
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) errors.push({field: "to", message: "Enter an end date on or after the start date."});
  if (errors.length) throw validationError(errors);
  return filters;
}

export function validateV2Transaction(input: unknown, now = new Date()): V2TransactionInput {
  if(typeof input!=="object"||input===null||Array.isArray(input))throw validationError([{field:"body",message:"Provide a JSON object with all six editable fields."}]);
  const body=input as Record<string,unknown>,errors:FieldError[]=[];
  const fields=["accountId","categoryId","type","amount","description","date"];
  for(const field of Object.keys(body))if(!fields.includes(field))errors.push({field,message:"This field is not allowed."});
  for(const field of fields) {
    if(!Object.hasOwn(body,field))errors.push({field,message:"This field is required."});
    else if(typeof body[field]!=="string")errors.push({field,message:"Enter a string value."});
  }
  for(const field of ["accountId","categoryId"])if(typeof body[field]==="string") {
    try {validateUuid(body[field]);}catch {errors.push({field,message:"Provide a canonical hyphenated UUID."});}
  }
  if(typeof body.type==="string"&&!['income','expense'].includes(body.type))errors.push({field:"type",message:"Choose income or expense."});
  if(typeof body.amount==="string"&&!isPositiveTransactionAmount(body.amount))errors.push({field:"amount",message:"Enter a positive amount from 0.01 to 999999999.99 with at most two decimal places."});
  const description=typeof body.description==="string"?body.description.trim():"";
  if(typeof body.description==="string"&&(Array.from(description).length<1||Array.from(description).length>200))errors.push({field:"description",message:"Enter a description of 1 to 200 characters after trimming."});
  if(typeof body.date==="string"&&(!isCalendarDate(body.date)||body.date>cairoToday(now)))errors.push({field:"date",message:"Enter a real date from 1900-01-01 through today in Africa/Cairo."});
  if(errors.length)throw validationError(errors);
  return {accountId:validateUuid(body.accountId as string),categoryId:validateUuid(body.categoryId as string),type:body.type as V2TransactionInput['type'],amount:formatDecimal(body.amount as string),description,date:body.date as string};
}
