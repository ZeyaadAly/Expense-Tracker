import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,createHmac} from 'node:crypto';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {createTransactionCursorCodec,transactionScopeHash} from '../dist/utils/transaction-cursor.js';
import {validateV2TransactionQuery} from '../dist/validators/v2-transaction.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

const owner='a2400000-0000-4000-8000-000000000001',secret=randomBytes(32).toString('hex'),sort={date:'2025-10-01',createdAt:'2026-10-08T10:01:02.123456Z',id:owner};
function signed(payload){const encoded=Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload)).toString('base64url');return encoded+'.'+createHmac('sha256',Buffer.from(secret,'hex')).update(encoded).digest('base64url');}
test('T24 strict limit and URL cursor validation with unchanged filter normalization',()=>{
  assert.deepEqual(validateV2TransactionQuery('/transactions'),{});
  for(const limit of [1,25,100])assert.equal(validateV2TransactionQuery('/transactions?limit='+limit).limit,limit);
  for(const value of ['','0','101','-1','1.0','1e2','01','+1',' 25','25 '])assert.throws(()=>validateV2TransactionQuery('/transactions?limit='+encodeURIComponent(value)),error=>error.code==='VALIDATION_ERROR');
  for(const query of ['limit=1&limit=1','cursor=','cursor=fake','cursor[]=x','cursor=x&cursor=x','limit[]=1','offset=1','page=1'])assert.throws(()=>validateV2TransactionQuery('/transactions?'+query),error=>error.code==='VALIDATION_ERROR');
});
test('T24 HMAC, strict payloads, generic failures, exact microseconds, expiry and rotation',()=>{
  let now=1800000000000;const codec=createTransactionCursorCodec(secret,()=>now),scope=transactionScopeHash({},25),cursor=codec.encode(owner,scope,sort),payload=JSON.parse(Buffer.from(cursor.split('.')[0],'base64url').toString());
  assert.deepEqual(codec.decode(cursor,owner,scope),sort);assert.match(cursor,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const failures=['','abc','a.b.c',cursor+'=',cursor.slice(0,-1)+'!',signed('{'),signed([]),signed({...payload,v:2}),signed({...payload,resource:'transfers'}),signed({...payload,extra:true}),signed({...payload,userId:'bad'}),signed({...payload,sort:{...sort,id:'bad'}}),signed({...payload,sort:{...sort,date:'2026-02-29'}}),signed({...payload,sort:{...sort,createdAt:'2026-02-30T10:01:02.123456Z'}}),signed({...payload,sort:{...sort,createdAt:'2026-10-08T25:01:02.123456Z'}}),signed({...payload,sort:{...sort,createdAt:'2026-10-08T10:01:02.123Z'}}),signed({...payload,sort:{...sort,extra:1}}),signed({...payload,scopeHash:'x'}),signed({...payload,issuedAt:payload.issuedAt+1,expiresAt:payload.expiresAt+1}),signed({...payload,expiresAt:payload.expiresAt+1})];
  const baseline=(()=>{try{codec.decode('bad',owner,scope);}catch(error){return {code:error.code,message:error.message,details:error.details};}})();
  for(const field of Object.keys(payload)){const missing={...payload};delete missing[field];failures.push(signed(missing));}
  for(const modified of [{...payload,userId:owner.replace('a','b')},{...payload,sort:{...sort,id:owner.replace('000001','000002')}},{...payload,scopeHash:'0'.repeat(64)}])failures.push(Buffer.from(JSON.stringify(modified)).toString('base64url')+'.'+cursor.split('.')[1]);
  for(const value of failures)assert.throws(()=>codec.decode(value,owner,scope),error=>{assert.deepEqual({code:error.code,message:error.message,details:error.details},baseline);return true;});
  assert.throws(()=>codec.decode(cursor,owner.replace('a','b'),scope));assert.throws(()=>codec.decode(cursor,owner,transactionScopeHash({},100)));
  for(const [key,value] of Object.entries({q:'changed',type:'income',accountId:owner,categoryId:owner,from:'1900-01-01',to:'9999-12-31',recurring:'generated'}))assert.throws(()=>codec.decode(cursor,owner,transactionScopeHash({[key]:value},25)));
  now+=86400000-1000;assert.deepEqual(codec.decode(cursor,owner,scope),sort);now+=1000;assert.throws(()=>codec.decode(cursor,owner,scope));
  assert.throws(()=>createTransactionCursorCodec(randomBytes(32).toString('hex'),()=>1800000000000).decode(cursor,owner,scope));
  assert.equal(transactionScopeHash(validateV2TransactionQuery('/transactions?q=%20&limit=25'),25),scope);
});
test('T24 SQL continuation binds date, full timestamp, UUID and limit+1 without offset/count',async()=>{
  const codec=createTransactionCursorCodec(secret),scope=transactionScopeHash({q:'20%'},1),cursor=codec.encode(owner,scope,sort),calls=[];
  const service=createV2TransactionService({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}},{cursorSigningSecret:secret});
  assert.deepEqual(await service.listTransactions(owner,{q:'20%',limit:1,cursor}),{data:[],meta:{limit:1,nextCursor:null,hasMore:false}});
  assert.deepEqual(calls[0].params,[owner,'%20!%%',sort.date,sort.createdAt,sort.id,'2']);
  assert.match(calls[0].sql,/AND \(t.transaction_date,t.created_at,t.id\)<\(\$3::date,\$4::timestamptz,\$5::uuid\) ORDER BY t.transaction_date DESC,t.created_at DESC,t.id DESC LIMIT \$6$/);assert.doesNotMatch(calls[0].sql,/OFFSET|COUNT\(/i);
  await assert.rejects(service.listTransactions(owner,{cursor:'bad'}),error=>error.code==='VALIDATION_ERROR');assert.equal(calls.length,1);
});
test('T24 missing/bad signing config safely isolates listing from V1, public health and CRUD',async()=>{
  let queries=0;const pool={query:async()=>{queries++;return {rows:[]};}};
  for(const value of [undefined,'','too-short','PLACEHOLDER']) {
    const auth=await createTestAuthHarness(pool,{cursorSigningSecret:value});
    try {const token=await auth.createTestAuthToken({userId:owner});const response=await auth.rawRequest(token,'/transactions');assert.equal(response.status,503);assert.equal(response.body.error.code,'CURSOR_UNAVAILABLE');assert.equal((await auth.rawRequest(null,'/health')).status,200);assert.equal((await auth.v1Request('/transactions')).status,200);assert.equal((await auth.rawRequest(token,'/transactions/'+owner)).status,404);}finally{await auth.close();}
  }
  assert.equal(queries,8);
});
test('T24 next cursor keeps microseconds even when public timestamps share one millisecond',async()=>{
  const row={id:owner,accountId:owner,accountName:'Account',categoryId:owner,categoryName:'Category',type:'expense',amount:'0.01',description:'Exact tuple',date:sort.date,recurringTransactionId:null,recurringOccurrenceDate:null,createdAt:new Date(sort.createdAt),updatedAt:new Date(sort.createdAt),cursorCreatedAt:sort.createdAt};
  const second={...row,id:owner.replace('000001','000002'),cursorCreatedAt:'2026-10-08T10:01:02.123450Z'};
  let call=0;const calls=[];
  const service=createV2TransactionService({query:async(sql,params)=>{calls.push({sql,params});return {rows:call++===0?[row,second]:[second]};}},{cursorSigningSecret:secret});
  const first=await service.listTransactions(owner,{limit:1}),next=await service.listTransactions(owner,{limit:1,cursor:first.meta.nextCursor});
  assert.deepEqual(createTransactionCursorCodec(secret).decode(first.meta.nextCursor,owner,transactionScopeHash({},1)),sort);
  assert.equal(first.data[0].createdAt,next.data[0].createdAt);assert.equal(calls[1].params[2],sort.createdAt);assert.equal(next.meta.nextCursor,null);assert.ok(!('cursorCreatedAt' in first.data[0]));
});
test('T24 fresh pagination and complete T16–T23 regression',{
  skip:!process.env.T24_DISPOSABLE_DATABASE_URL&&'Requires fresh guarded loopback PostgreSQL',
},async context=>context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T24_DISPOSABLE_DATABASE_URL))));
