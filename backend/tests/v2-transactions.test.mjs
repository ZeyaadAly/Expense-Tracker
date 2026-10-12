import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {validateV2Transaction} from '../dist/validators/v2-transaction.js';
import {mapV2Transaction} from '../dist/utils/v2-transaction-mapper.js';
import {createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

const id='a2100000-0000-4000-8000-000000000001';
const input={accountId:id,categoryId:id,type:'expense',amount:'250.50',description:'Groceries',date:'2026-10-08'};
test('T21 strict six-field validation, exact amount boundaries and Unicode description',()=>{
  const now=new Date('2026-10-08T12:00:00Z');
  for(const amount of ['0.01','999999999.99','1','0.1'])assert.equal(validateV2Transaction({...input,amount},now).amount,amount==='1'?'1.00':amount==='0.1'?'0.10':amount);
  for(const amount of ['0','0.00','-1','+1','01','1e2','1.001','1.230','1000000000',' 1','1 ',1,null])assert.throws(()=>validateV2Transaction({...input,amount},now),e=>e.code==='VALIDATION_ERROR');
  for(const field of ['userId','ownerId','accountUserId','createdBy','recurringTransactionId','recurringOccurrenceDate','category','currency','id','createdAt'])assert.throws(()=>validateV2Transaction({...input,[field]:id},now),e=>e.code==='VALIDATION_ERROR');
  for(const value of [null,[],{}, {...input,accountId:'bad'},{...input,categoryId:'bad'}, {...input,type:'transfer'},{...input,description:''},{...input,description:'x'.repeat(201)},{...input,description:5}])assert.throws(()=>validateV2Transaction(value,now),e=>e.code==='VALIDATION_ERROR');
  for(const field of Object.keys(input)){const omitted={...input};delete omitted[field];assert.throws(()=>validateV2Transaction(omitted,now),e=>e.code==='VALIDATION_ERROR');}
  assert.equal(validateV2Transaction({...input,description:'  '+ '😀'.repeat(200)+'  '},now).description,'😀'.repeat(200));
});
test('T21 date-only calendar and Cairo midnight manual-date boundary',()=>{
  const before=new Date('2026-10-07T20:59:59Z'),after=new Date('2026-10-07T21:00:00Z');
  assert.throws(()=>validateV2Transaction(input,before),e=>e.code==='VALIDATION_ERROR');assert.equal(validateV2Transaction(input,after).date,'2026-10-08');
  for(const date of ['1899-12-31','2026-02-29','2026-04-31','2026-10-09','2026-10-08T00:00:00Z'])assert.throws(()=>validateV2Transaction({...input,date},after),e=>e.code==='VALIDATION_ERROR');
  for(const date of ['1900-01-01','2024-02-29'])assert.equal(validateV2Transaction({...input,date},after).date,date);
});
test('T21 mapper returns explicit public fields, exact money and immutable generated dates',()=>{
  const row={...input,id,accountName:'Bank',categoryName:'Food',amount:'250.5',recurringTransactionId:id,recurringOccurrenceDate:'1900-01-01',createdAt:new Date('2026-10-08T12:00:00Z'),updatedAt:new Date('2026-10-08T12:00:00Z'),userId:id,category:'legacy'};
  const mapped=mapV2Transaction(row);assert.equal(mapped.amount,'250.50');assert.equal(mapped.date,input.date);assert.equal(mapped.recurringOccurrenceDate,'1900-01-01');assert.equal(mapped.createdAt,'2026-10-08T12:00:00.000Z');assert.equal(mapped.currency,'EGP');assert.ok(!('userId' in mapped)&&!('category' in mapped));assert.equal(Object.keys(mapped).length,14);
  assert.throws(()=>mapV2Transaction({...row,date:'2026-02-30'}));
});
test('T21 real JWT route validation blocks SQL and failures preserve safe shared envelopes',async()=>{
  let queries=0;const failure=Object.assign(new Error('private SQL schema password'),{code:'ECONNREFUSED'});
  const database={query:async()=>{queries++;throw failure;},connect:async()=>{queries++;throw failure;}};
  const auth=await createTestAuthHarness(database);
  try {
    const token=await auth.createTestAuthToken({userId:id});
    for(const [path,method,body] of [['/transactions','GET'],['/transactions','POST',input],['/transactions/'+id,'GET'],['/transactions/'+id,'PUT',input],['/transactions/'+id,'DELETE']])assert.equal((await auth.request(null,path,method,body)).status,401);
    for(const [path,method,body] of [['/transactions?q[]=test','GET'],['/transactions?accountId=bad','GET'],['/transactions?limit=0','GET'],['/transactions/'+id+'?userId='+id,'DELETE'],['/transactions/not-a-uuid','GET'],['/transactions','POST',{...input,userId:id}],['/transactions/'+id,'PUT',{...input,recurringTransactionId:id}]])assert.equal((await auth.request(token,path,method,body)).status,400);
    assert.equal(queries,0);assert.equal((await auth.request(token,'/transactions','DELETE')).status,405);assert.equal((await auth.request(token,'/transactions/'+id,'PATCH')).status,405);
    for(const code of ['ECONNREFUSED','23503','unexpected']) {
      failure.code=code;
      for(const [path,method,body] of [['/transactions','GET'],['/transactions','POST',input],['/transactions/'+id,'GET'],['/transactions/'+id,'PUT',input],['/transactions/'+id,'DELETE']]) {
        const result=await auth.request(token,path,method,body);assert.equal(result.status,code==='ECONNREFUSED'?503:500);assert.equal(result.cache,'no-store');assert.deepEqual(result.body.error.details,[]);assert.doesNotMatch(JSON.stringify(result.body),/private|schema|password|SQL|23503/);
      }
    }
  }finally{await auth.close();}
});
test('T21 fresh transaction API, balances, concurrency and expanded T16/T17/T18 regressions',{
  skip:!process.env.T21_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL database',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T21_DISPOSABLE_DATABASE_URL)));});
