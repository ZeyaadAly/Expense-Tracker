"use client";
import {createSessionClient} from "./session-client";
import {V2ApiError,type V2RequestOptions} from "./v2-client";
export type GoalStatus="active"|"completed"|"archived";
export type GoalInput={name:string;targetAmount:string;savedAmount:string;targetDate:string|null;linkedAccountId:string|null};
export type GoalUpdate=GoalInput&{status:"active"|"completed"};
export type Goal=GoalInput&{id:string;remainingAmount:string;percentComplete:string;status:GoalStatus;createdAt:string;updatedAt:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const decimal=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9]\d*)\.\d{2}$/.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&v>='1900-01-01'&&v<='9999-12-31'&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const invalid=(write=false)=>new V2ApiError(200,'INVALID_RESPONSE','unexpected',[],write);
// Comparison of canonical decimal strings only. Never compare rounded percentage
// for eligibility: 9999.99/10000.00 displays 100.00% while still under target.
export function goalIsFunded(goal:Pick<Goal,'savedAmount'|'targetAmount'>):boolean {
  const [s]=goal.savedAmount.split('.'),[t]=goal.targetAmount.split('.');
  return s.length!==t.length?s.length>t.length:goal.savedAmount>=goal.targetAmount;
}
export function parseGoal(value:unknown,write=false):Goal {
  const fields=['id','name','targetAmount','savedAmount','remainingAmount','percentComplete','targetDate','linkedAccountId','status','createdAt','updatedAt'];
  if(!object(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k))||!uuid(value.id)||typeof value.name!=='string'||!value.name.trim()||Array.from(value.name).length>120||!['targetAmount','savedAmount','remainingAmount','percentComplete'].every(k=>decimal(value[k]))||!/^([1-9]\d{0,8}\.\d{2}|0\.(?!00)\d{2})$/.test(value.targetAmount as string)||!/^\d{1,9}\.\d{2}$/.test(value.savedAmount as string)||(value.targetDate!==null&&!date(value.targetDate))||(value.linkedAccountId!==null&&!uuid(value.linkedAccountId))||!['active','completed','archived'].includes(value.status as string)||![value.createdAt,value.updatedAt].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT.*Z$/.test(v)&&!isNaN(Date.parse(v))))throw invalid(write);
  const goal=value as Goal;if(goal.status==='completed'&&!goalIsFunded(goal))throw invalid(write);return goal;
}
export function validateGoalDraft(input:GoalInput&{status?:GoalUpdate['status']}):Record<string,string> {
  const errors:Record<string,string>={},name=input.name.trim();
  if(!name||Array.from(name).length>120||name.includes('\u0000')||/\p{Cs}/u.test(name))errors.name='Enter 1 to 120 valid Unicode characters after trimming.';
  const money=/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/;
  if(!money.test(input.targetAmount)||/^0(?:\.0{1,2})?$/.test(input.targetAmount))errors.targetAmount='Enter a decimal amount from 0.01 to 999999999.99, with at most two decimals.';
  if(!money.test(input.savedAmount))errors.savedAmount='Enter a decimal amount from 0.00 to 999999999.99, with at most two decimals.';
  if(input.targetDate!==null&&!date(input.targetDate))errors.targetDate='Enter a real date from 1900-01-01 to 9999-12-31, or leave it blank.';
  if(input.linkedAccountId!==null&&!uuid(input.linkedAccountId))errors.linkedAccountId='Choose an active account or no linked account.';
  if(input.status==='completed'&&!errors.targetAmount&&!errors.savedAmount){const canonical=(v:string)=>{const [whole,fraction='']=v.split('.');return whole+'.'+fraction.padEnd(2,'0');};if(!goalIsFunded({targetAmount:canonical(input.targetAmount),savedAmount:canonical(input.savedAmount)}))errors.savedAmount='A completed goal must meet its target. Choose Active to reopen it before reducing savings.';}
  return errors;
}
export const goalUpdate=(g:Goal):GoalUpdate=>({name:g.name,targetAmount:g.targetAmount,savedAmount:g.savedAmount,targetDate:g.targetDate,linkedAccountId:g.linkedAccountId,status:g.status==='completed'?'completed':'active'});
export function createGoalClient(userId:string,transport=createSessionClient(userId)) {
  const path=(id:string)=>{if(!uuid(id))throw new V2ApiError(0,'INVALID_REQUEST','unexpected');return '/goals/'+id;};
  const resource=(v:unknown,write=false,id?:string)=>{const g=parseGoal((v as {data?:unknown})?.data,write);if(id&&g.id!==id)throw invalid(write);return g;};
  const editable=(g:GoalInput):GoalInput=>({name:g.name,targetAmount:g.targetAmount,savedAmount:g.savedAmount,targetDate:g.targetDate,linkedAccountId:g.linkedAccountId});
  return {
    async listGoals(status?:GoalStatus,options?:V2RequestOptions){
      if(status!==undefined&&!['active','completed','archived'].includes(status))throw new V2ApiError(0,'INVALID_REQUEST','unexpected');
      const v=await transport.get<unknown,{count:number}>('/goals',{...options,query:status?{status}:undefined});
      if(!Array.isArray(v?.data)||v.meta?.count!==v.data.length)throw invalid();const rows=v.data.map(g=>parseGoal(g));if(rows.some(g=>status&&g.status!==status)||new Set(rows.map(g=>g.id)).size!==rows.length)throw invalid();return rows;
    },
    getGoal:async(id:string,options?:V2RequestOptions)=>resource(await transport.get(path(id),options),false,id),
    createGoal:async(input:GoalInput,options?:V2RequestOptions)=>resource(await transport.post('/goals',editable(input),options),true),
    updateGoal:async(id:string,input:GoalUpdate,options?:V2RequestOptions)=>resource(await transport.put(path(id),{...editable(input),status:input.status},options),true,id),
    completeGoal:async(id:string,options?:V2RequestOptions)=>resource(await transport.post(path(id)+'/complete',{},options),true,id),
    archiveGoal:async(id:string,options?:V2RequestOptions)=>resource(await transport.post(path(id)+'/archive',{},options),true,id),
  };
}
