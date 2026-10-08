import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import type {V2TransactionFilters} from "../types/v2-transaction.js";
import {ApiError,validationError} from "./api-error.js";
import {isCalendarDate} from "../validators/transaction.js";

export interface TransactionSort {date:string;createdAt:string;id:string}
export const invalidTransactionCursor=()=>validationError([{field:"cursor",message:"The pagination cursor is invalid or no longer matches this request."}]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const keys=(value:unknown,expected:string[]):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===expected.sort().join(",");
function validSort(value:unknown):value is TransactionSort {
  if(!keys(value,["date","createdAt","id"])||typeof value.date!=="string"||!isCalendarDate(value.date)||typeof value.id!=="string"||!uuid.test(value.id)||typeof value.createdAt!=="string")return false;
  // Preserve six fractional digits from PostgreSQL rather than JS Date's three.
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt)||!isCalendarDate(value.createdAt.slice(0,10)))return false;
  const milliseconds=value.createdAt.slice(0,23)+"Z",parsed=new Date(milliseconds);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString()===milliseconds;
}
export function transactionScopeHash(filters:V2TransactionFilters,limit:number):string {
  return createHash("sha256").update(JSON.stringify({q:filters.q??null,type:filters.type??null,accountId:filters.accountId??null,categoryId:filters.categoryId??null,from:filters.from??null,to:filters.to??null,recurring:filters.recurring??null,limit})).digest("hex");
}
export function createTransactionCursorCodec(secret:string|undefined,now:()=>number=Date.now,resource:"transactions"|"transfers"="transactions") {
  const key=secret&&/^[0-9a-f]{64}$/i.test(secret)?Buffer.from(secret,"hex"):null;
  function configured() {if(!key)throw new ApiError(503,"CURSOR_UNAVAILABLE",resource==="transactions"?"Transaction pagination is unavailable.":"Transfer pagination is unavailable.");return key;}
  const signature=(encoded:string)=>createHmac("sha256",configured()).update(encoded).digest();
  return {
    configured,
    encode(userId:string,scopeHash:string,sort:TransactionSort):string {
      configured();if(!validSort(sort))throw new Error("Invalid database pagination tuple");
      const issuedAt=Math.floor(now()/1000),payload={v:1,resource,userId,sort,scopeHash,issuedAt,expiresAt:issuedAt+86400};
      const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");return encoded+"."+signature(encoded).toString("base64url");
    },
    decode(cursor:string,userId:string,scopeHash:string):TransactionSort {
      configured();
      try {
        if(cursor.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))throw Error();
        const [encoded,signed]=cursor.split("."),bytes=Buffer.from(encoded,"base64url"),actual=Buffer.from(signed,"base64url");
        if(bytes.toString("base64url")!==encoded||actual.toString("base64url")!==signed||actual.length!==32||!timingSafeEqual(signature(encoded),actual))throw Error();
        const payload:unknown=JSON.parse(bytes.toString("utf8"));
        if(!keys(payload,["v","resource","userId","sort","scopeHash","issuedAt","expiresAt"]))throw Error();
        const seconds=Math.floor(now()/1000);
        if(payload.v!==1||payload.resource!==resource)throw Error();
        if(typeof payload.userId!=="string"||!uuid.test(payload.userId)||payload.userId!==userId)throw Error();
        if(typeof payload.scopeHash!=="string"||!/^[0-9a-f]{64}$/.test(payload.scopeHash)||payload.scopeHash!==scopeHash)throw Error();
        if(!validSort(payload.sort))throw Error();
        if(typeof payload.issuedAt!=="number"||typeof payload.expiresAt!=="number"||!Number.isSafeInteger(payload.issuedAt)||!Number.isSafeInteger(payload.expiresAt))throw Error();
        if(payload.issuedAt<0||payload.issuedAt>seconds||payload.expiresAt!==payload.issuedAt+86400||payload.expiresAt<=seconds)throw Error();
        return payload.sort;
      }catch{throw invalidTransactionCursor();}
    },
  };
}
