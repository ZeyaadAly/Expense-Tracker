import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64')}`;
const transactionsUrl = moduleUrl(readFileSync(new URL('../src/lib/transactions.ts',import.meta.url),'utf8'));
const source = readFileSync(new URL('../src/lib/api/client.ts',import.meta.url),'utf8').replace('"../transactions"',JSON.stringify(transactionsUrl));
const {createApiClient,ApiError,apiFieldErrors} = await import(moduleUrl(source));
const record = {id:'8d090605-20b3-4f87-a513-f487b705b7a2',type:'expense',amount:'0.10',category:'food',date:'2026-09-30',description:'Test',currency:'EGP',createdAt:'2026-10-01T12:00:00.000Z',updatedAt:'2026-10-01T12:00:00.000Z'};
const totals = {totalIncome:'1000.00',totalExpenses:'0.30',balance:'999.70',currency:'EGP',scope:'all',transactionCount:2};
const all = {type:'all',category:'all'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('list envelopes, metadata, ordering and exact string amounts',async()=> {
  for (const amount of ['0.10','0.20','1000.00','999999999.99']) {
    const r = {...record,amount}; const c=createApiClient('http://localhost:4000/api/v1',async()=>json({data:[r,record],meta:{count:2,filters:{type:null,category:null}}}));
    const response=await c.list(all);assert.deepEqual(response.data,[r,record]);assert.equal(typeof response.data[0].amount,'string');assert.equal(response.data[0].date,'2026-09-30');
  }
});
test('filters omit All and summary never receives queries',async()=> {
  const requests=[];const c=createApiClient('http://localhost:4000/api/v1/',async(url)=>{requests.push(url);const u=new URL(url);return u.pathname.endsWith('/summary')?json({data:totals}):json({data:[],meta:{count:0,filters:{type:u.searchParams.get('type'),category:u.searchParams.get('category')}}});});
  for(const filters of [all,{type:'expense',category:'all'},{type:'all',category:'other'},{type:'expense',category:'food'}]) await c.list(filters);
  await c.summary(); assert.deepEqual(requests.map(u=>new URL(u).pathname+new URL(u).search),['/api/v1/transactions','/api/v1/transactions?type=expense','/api/v1/transactions?category=other','/api/v1/transactions?type=expense&category=food','/api/v1/summary']);
});
test('summary unwraps unrestricted decimal strings',async()=> {
  const s={...totals,totalIncome:'999999999999999999999.99',balance:'-0.10'};assert.deepEqual(await createApiClient('http://localhost/api/v1',async()=>json({data:s})).summary(),s);
});
test('creation serializes exactly five string fields and unwraps 201',async()=> {
  let body;const c=createApiClient('http://localhost/api/v1',async(url,init)=>{assert.equal(init.method,'POST');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');body=JSON.parse(init.body);return json({data:record},201);});
  assert.deepEqual(await c.create(record),record);assert.deepEqual(Object.keys(body).sort(),['amount','category','date','description','type']);assert.ok(Object.values(body).every(v=>typeof v==='string'));
});
test('structured errors use safe copy and field mapping without server internals',async()=> {
  const c=createApiClient('http://localhost/api/v1',async()=>json({error:{code:'VALIDATION_ERROR',message:'SQL password leaked',details:[{field:'amount',message:'host secret'},{field:'body',message:'stack secret'}]}},400));
  await assert.rejects(c.create(record),e=>e instanceof ApiError && e.status===400 && !e.uncertain && !/SQL|password/.test(e.message) && !!apiFieldErrors(e).amount && !JSON.stringify(apiFieldErrors(e)).includes('secret') && Object.keys(apiFieldErrors(e)).length===1);
});
test('503 is definite rejection; unexpected 500 is an uncertain write',async()=> {
  for(const [status,code,uncertain] of [[503,'DATABASE_UNAVAILABLE',false],[500,'INTERNAL_ERROR',true]]) {
    const c=createApiClient('http://localhost/api/v1',async()=>json({error:{code,message:'SQL secret',details:[]}},status));
    await assert.rejects(c.create(record),e=>e instanceof ApiError && e.uncertain===uncertain && !e.message.includes('secret'));
  }
});
test('network failure never retries POST',async()=> {
  let attempts=0;const c=createApiClient('http://localhost/api/v1',async()=>{attempts++;throw new Error('hostname secret');});await assert.rejects(c.create(record),e=>e.uncertain && !e.message.includes('secret'));assert.equal(attempts,1);await assert.rejects(c.summary(),e=>!e.uncertain);
});
test('invalid envelopes, numeric money, bad metadata and malformed JSON are rejected',async()=> {
  for(const body of [{data:[{...record,amount:0.1}],meta:{count:1,filters:{type:null,category:null}}},{data:[record],meta:{count:0,filters:{type:null,category:null}}},{data:[],meta:{count:0,filters:{type:'all',category:null}}},{data:{}}]) await assert.rejects(createApiClient('http://localhost/api/v1',async()=>json(body)).list(all),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(createApiClient('http://localhost/api/v1',async()=>new Response('bad JSON',{status:201})).create(record),e=>e.code==='INVALID_RESPONSE'&&e.uncertain);
  await assert.rejects(createApiClient('http://localhost/api/v1',async()=>json({data:{...totals,balance:0.3}})).summary(),e=>e.code==='INVALID_RESPONSE');
});
test('missing or unsafe configuration does not issue a request',async()=> {
  for(const base of ['',undefined,'ftp://localhost','http://user:secret@localhost','http://localhost?secret=1']) {let calls=0;await assert.rejects(createApiClient(base,async()=>{calls++;}).summary(),e=>e.code==='CONFIGURATION_ERROR');assert.equal(calls,0);}
});
test('timeout and obsolete read cancellation are distinct',async()=> {
  const hanging=async(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  await assert.rejects(createApiClient('http://localhost/api/v1',hanging,10).create(record),e=>e.code==='TIMEOUT'&&e.uncertain);
  const controller=new AbortController();const promise=createApiClient('http://localhost/api/v1',hanging).list(all,controller.signal);controller.abort();await assert.rejects(promise,e=>e.name==='AbortError');
});
