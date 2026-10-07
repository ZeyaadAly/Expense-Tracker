"use client";
import { createV2ApiClient, V2ApiError, type V2Envelope, type V2RequestOptions } from "./v2-client";
import { getSession } from "../auth/auth-service";

export const accountTypes = ["cash", "bank", "savings", "credit_card", "mobile_wallet", "other"] as const;
export type AccountType = typeof accountTypes[number];
export type AccountStatus = "active" | "archived";
export type AccountInput = {name:string; type:AccountType; openingBalance:string};
export type Account = AccountInput & {id:string; currentBalance:string; openingBalanceEditable:boolean; currency:"EGP"; status:AccountStatus; createdAt:string; updatedAt:string};
export type AccountSummary = {netPosition:string; currency:"EGP"};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decimal = /^-?(0|[1-9]\d*)\.\d{2}$/;
const object = (value:unknown): value is Record<string,unknown> => typeof value==='object' && value!==null && !Array.isArray(value);
const invalid = (write=false) => new V2ApiError(200,"INVALID_RESPONSE","unexpected",[],write);
function parseAccount(value:unknown,write=false):Account {
  if(!object(value)||typeof value.id!=='string'||!uuid.test(value.id)||typeof value.name!=='string'||!value.name.trim()||Array.from(value.name).length>100||
    !accountTypes.includes(value.type as AccountType)||typeof value.openingBalance!=='string'||!decimal.test(value.openingBalance)||typeof value.currentBalance!=='string'||!decimal.test(value.currentBalance)||
    typeof value.openingBalanceEditable!=='boolean'||value.currency!=='EGP'||!['active','archived'].includes(value.status as string)||
    ![value.createdAt,value.updatedAt].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT.*Z$/.test(v)&&!isNaN(Date.parse(v)))||Object.keys(value).some(k=>!['id','name','type','openingBalance','currentBalance','openingBalanceEditable','currency','status','createdAt','updatedAt'].includes(k)))throw invalid(write);
  return value as Account;
}
function editable(input:AccountInput):AccountInput {return {name:input.name,type:input.type,openingBalance:input.openingBalance};}
export function validateAccountInput(input:AccountInput):Record<string,string> {
  const errors:Record<string,string>={},name=input.name.trim();
  if(!name||Array.from(name).length>100||/[\p{Cc}\p{Cs}]/u.test(name)||!/[^\p{Cf}\s]/u.test(name))errors.name='Enter 1 to 100 characters. Control characters are not allowed.';
  if(!accountTypes.includes(input.type))errors.type='Choose an account type.';
  if(!/^-?(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input.openingBalance)||/^-0(?:\.0{1,2})?$/.test(input.openingBalance))errors.openingBalance='Enter a decimal amount up to 999999999.99, with at most two decimals. Negative balances are allowed.';
  return errors;
}
export function createAccountClient(expectedUserId:string,transport=createV2ApiClient({tokenSupplier:async()=>{
  const result=await getSession();if(result.error)return {data:null,error:result.error};
  return {data:result.data?.user.id===expectedUserId?result.data.access_token:null,error:null};
}})) {
  function resource(envelope:V2Envelope<unknown>|undefined,write=false,id?:string) {const value=parseAccount(envelope?.data,write);if(id&&value.id!==id)throw invalid(write);return value;}
  function path(id:string) {if(!uuid.test(id))throw new V2ApiError(0,'INVALID_REQUEST','unexpected');return '/accounts/'+id;}
  return {
    async listAccounts(status:AccountStatus='active',options?:V2RequestOptions) {
      const result=await transport.get<unknown,{count:number}>('/accounts',{...options,query:{status}});
      if(!Array.isArray(result?.data)||result.meta?.count!==result.data.length)throw invalid();
      const rows=result.data.map(row=>parseAccount(row));if(rows.some(row=>row.status!==status)||new Set(rows.map(row=>row.id)).size!==rows.length)throw invalid();return rows;
    },
    async getSummary(options?:V2RequestOptions):Promise<AccountSummary> {
      const value=(await transport.get('/accounts/summary',options))?.data;
      if(!object(value)||value.currency!=='EGP'||typeof value.netPosition!=='string'||!decimal.test(value.netPosition)||Object.keys(value).some(k=>!['netPosition','currency'].includes(k)))throw invalid();return value as AccountSummary;
    },
    createAccount:async(input:AccountInput,options?:V2RequestOptions)=>resource(await transport.post('/accounts',{...editable(input),currency:'EGP'},options),true),
    updateAccount:async(id:string,input:AccountInput,options?:V2RequestOptions)=>resource(await transport.put(path(id),editable(input),options),true,id),
    async archiveAccount(id:string,options?:V2RequestOptions) {
      const result=await transport.post(path(id)+'/archive',{},options);const account=resource(result,true,id);
      const meta=result?.meta as {pausedRecurringCount?:unknown}|undefined;
      if(account.status!=='archived'||!meta||typeof meta.pausedRecurringCount!=='number'||!Number.isSafeInteger(meta.pausedRecurringCount)||meta.pausedRecurringCount<0)throw invalid(true);
      return {account,pausedRecurringCount:meta.pausedRecurringCount};
    },
    async restoreAccount(id:string,options?:V2RequestOptions) {const account=resource(await transport.post(path(id)+'/restore',{},options),true,id);if(account.status!=='active')throw invalid(true);return account;},
  };
}
