import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import {randomBytes} from 'node:crypto';
import {validateTransfer,validateTransferQuery} from '../dist/validators/transfer.js';
import {mapTransfer} from '../dist/utils/transfer-mapper.js';
import {createTransactionCursorCodec} from '../dist/utils/transaction-cursor.js';
import {transferScopeHash,createTransferService} from '../dist/services/transfers.js';
import {createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

const a='a2600000-0000-4000-8000-000000000001',b='a2600000-0000-4000-8000-000000000002';
const input={sourceAccountId:a,destinationAccountId:b,amount:'0.10',date:'1900-01-01'};
test('T26 strict transfer payload, optional Unicode note, exact decimal and same-account validation',()=>{
  assert.deepEqual(validateTransfer(input),{...input,description:null});
  for(const description of [undefined,null,'','  '])assert.equal(validateTransfer({...input,description}).description,null);
  assert.equal(validateTransfer({...input,description:'  😀  '}).description,'😀');
  assert.equal(validateTransfer({...input,description:'😀'.repeat(200)}).description.length,400);
  for(const amount of ['0.01','0.10','0.20','999999999.99','1','1.2'])assert.match(validateTransfer({...input,amount}).amount,/^\d+\.\d{2}$/);
  for(const amount of [0.1,null,'0','-1','1.230','1e2','1000000000','01',' 1','+1'])assert.throws(()=>validateTransfer({...input,amount}),e=>e.code==='VALIDATION_ERROR');
  for(const description of [false,[],{},'😀'.repeat(201),'\u0000','\ud800'])assert.throws(()=>validateTransfer({...input,description}),e=>e.details.some(x=>x.field==='description'));
  for(const field of Object.keys(input)) {const body={...input};delete body[field];assert.throws(()=>validateTransfer(body));}
  for(const body of [null,[],1,{...input,destinationAccountId:a.toUpperCase()},{...input,sourceAccountId:'bad'}])assert.throws(()=>validateTransfer(body));
  for(const field of ['userId','ownerId','sourceUserId','destinationUserId','createdBy','id','currency','createdAt','updatedAt'])assert.throws(()=>validateTransfer({...input,[field]:a}));
  assert.equal(validateTransfer({...input,date:'2026-10-09'},new Date('2026-10-08T21:00:00Z')).date,'2026-10-09');
  for(const date of ['1899-12-31','2026-02-29','2026-10-10'])assert.throws(()=>validateTransfer({...input,date},new Date('2026-10-08T21:00:00Z')));
});
test('T26 frozen transfer filters and precise public mapper',()=>{
  assert.deepEqual(validateTransferQuery('/transfers?accountId='+a.toUpperCase()+'&from=1900-01-01&to=9999-12-31&limit=100'),{accountId:a,from:'1900-01-01',to:'9999-12-31',limit:100});
  for(const query of ['q=test','type=income','userId='+a,'accountId='+a+'&accountId='+a,'accountId[]=x','from=1900-02-30','from=2000-01-01&to=1900-01-01','limit=01','limit=101','cursor=bad'])assert.throws(()=>validateTransferQuery('/transfers?'+query));
  const row={...input,description:null,id:b,sourceAccountName:'Bank',destinationAccountName:'Card',amount:'0.1',createdAt:new Date('2026-10-08T00:00:00Z'),updatedAt:new Date('2026-10-08T00:00:01Z'),userId:a,cursorCreatedAt:'private'};
  const mapped=mapTransfer(row);assert.equal(mapped.amount,'0.10');assert.equal(mapped.currency,'EGP');assert.equal(mapped.createdAt,'2026-10-08T00:00:00.000Z');
  assert.deepEqual(Object.keys(mapped).sort(),['id','sourceAccountId','sourceAccountName','destinationAccountId','destinationAccountName','amount','currency','date','description','createdAt','updatedAt'].sort());
});
test('T26 cursor cannot cross resource, owner, limit, filters, key or expiry',()=>{
  const key=randomBytes(32).toString('hex'),now=()=>1000000000000,codec=createTransactionCursorCodec(key,now,'transfers');
  const scope=transferScopeHash({},25),tuple={date:'1900-01-01',createdAt:'2026-10-08T00:00:00.123456Z',id:b},cursor=codec.encode(a,scope,tuple);
  assert.deepEqual(codec.decode(cursor,a,scope),tuple);assert.equal(transferScopeHash({limit:25},25),scope);
  for(const other of [createTransactionCursorCodec(key,now),createTransactionCursorCodec(randomBytes(32).toString('hex'),now,'transfers'),createTransactionCursorCodec(key,()=>now()+86400000,'transfers')])assert.throws(()=>other.decode(cursor,a,scope),e=>e.code==='VALIDATION_ERROR');
  for(const query of [{accountId:a},{from:'1900-01-01'},{to:'1900-01-02'},{limit:100}])assert.throws(()=>codec.decode(cursor,a,transferScopeHash(query,query.limit??25)));
  assert.throws(()=>codec.decode(cursor,b,scope));assert.throws(()=>codec.decode(cursor+'x',a,scope));
});
test('T26 actual JWT routing validates before SQL and sanitizes all five endpoint failures',async()=>{
  let queries=0;const failure=Object.assign(new Error('private SQL schema password'),{code:'ECONNREFUSED'});
  const database={query:async()=>{queries++;throw failure;},connect:async()=>{queries++;throw failure;}};
  const auth=await createTestAuthHarness(database);
  const endpoints=[['/transfers','GET'],['/transfers','POST',input],['/transfers/'+a,'GET'],['/transfers/'+a,'PUT',input],['/transfers/'+a,'DELETE']];
  try {
    const token=await auth.createTestAuthToken({userId:a});
    for(const [path,method,body] of endpoints)for(const credential of [null,'invalid.token'])assert.equal((await auth.rawRequest(credential,path,method,body)).status,401);
    for(const [path,method,body] of [['/transfers?q=test','GET'],['/transfers?limit=0','GET'],['/transfers/not-a-uuid','GET'],['/transfers','POST',{...input,userId:a}],['/transfers/'+a+'?userId='+a,'DELETE']])assert.equal((await auth.rawRequest(token,path,method,body)).status,400);
    assert.equal(queries,0);assert.equal((await auth.rawRequest(token,'/transfers','DELETE')).status,405);assert.equal((await auth.rawRequest(token,'/transfers/'+a,'PATCH')).status,405);
    for(const code of ['ECONNREFUSED','23503','unexpected']) {
      failure.code=code;
      for(const [path,method,body] of endpoints) {
        const response=await auth.rawRequest(token,path,method,body);assert.equal(response.status,code==='ECONNREFUSED'?503:500);assert.equal(response.cache,'no-store');assert.deepEqual(response.body.error.details,[]);assert.doesNotMatch(JSON.stringify(response.body),/private|schema|password|SQL|23503/);
      }
    }
    const unconfigured=await createTestAuthHarness(database,{});
    try {const t=await unconfigured.createTestAuthToken({userId:a}),before=queries;assert.equal((await unconfigured.rawRequest(t,'/transfers')).body.error.code,'CURSOR_UNAVAILABLE');assert.equal(queries,before);}finally{await unconfigured.close();}
  }finally{await auth.close();}
});
test('T26 rollback failure discards the connection and preserves the original error without retry',async()=>{
  const failure=new Error('original write error');let released,calls=[];
  const service=createTransferService({query:async()=>{},connect:async()=>({query:async sql=>{calls.push(sql);if(sql==='BEGIN')throw failure;throw new Error('rollback failure');},release:error=>released=error})});
  await assert.rejects(service.createTransfer(a,input),e=>e===failure);assert.deepEqual(calls,['BEGIN','ROLLBACK']);assert.ok(released instanceof Error);
});
test('T26 fresh transfer API, reconciliation, races, faults and T16–T24 regressions',{
  skip:!process.env.T26_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL database',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T26_DISPOSABLE_DATABASE_URL)));});
