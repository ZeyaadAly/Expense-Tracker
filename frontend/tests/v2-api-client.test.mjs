import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadV2Client } from './v2-client-loader.mjs';
const { createV2ApiClient, V2ApiError, v2BaseUrl, v2QueryString } = await loadV2Client();
const tokenSupplier = async () => ({ data: 'synthetic-token', error: null });
const client = fetcher => createV2ApiClient({baseUrl:'https://api.example/api/v1',tokenSupplier,fetcher});
const json = (body, status=200) => Response.json(body,{status});

test('T10 base normalization and canonical paths cannot override destination', async () => {
  for (const suffix of ['', '/', '/api/v1', '/api/v1/', '/api/v2/']) assert.equal(v2BaseUrl('https://api.example'+suffix),'https://api.example/api/v2');
  for (const base of [undefined,'bad','https://user:pass@api.example','https://api.example/path','https://api.example/?x=1','https://api.example/#x','https://api.example/\\api/v1']) assert.throws(()=>v2BaseUrl(base),V2ApiError);
  for (const path of ['//evil.example','https://evil.example','/../health','/%2e%2e/health','/health?x=1','/health#x','/a\\b']) await assert.rejects(client(()=>assert.fail()).get(path),e=>e.code==='INVALID_REQUEST');
});
test('T10 query serialization omits optional values and encodes scalar values', () => {
  assert.equal(v2QueryString({search:'a&b /?',limit:25,active:false,absent:undefined,empty:null}), '?search=a%26b+%2F%3F&limit=25&active=false');
  assert.equal(v2QueryString(), '');
  for (const value of [[],{},Infinity,NaN]) assert.throws(()=>v2QueryString({value}),V2ApiError);
});
test('T10 fresh tokens, GET headers and list metadata preserve exact money', async () => {
  let token='first'; const calls=[];
  const api=createV2ApiClient({baseUrl:'https://api.example/api/v1',tokenSupplier:async()=>({data:token,error:null}),fetcher:async(url,init)=>{calls.push([url,init]);return json({data:[{amount:'999999999999999.99'}],meta:{nextCursor:null}});}});
  assert.deepEqual(await api.get('/probe',{query:{search:'a&b'}}),{data:[{amount:'999999999999999.99'}],meta:{nextCursor:null}});
  token='refreshed'; await api.get('/probe');
  assert.equal(calls[0][0],'https://api.example/api/v2/probe?search=a%26b');
  assert.equal(calls[0][1].headers.Authorization,'Bearer first');assert.equal(calls[1][1].headers.Authorization,'Bearer refreshed');
  assert.equal(calls[0][1].headers['Content-Type'],undefined);assert.equal(calls[0][1].body,undefined);
  assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].redirect,'error');
});
test('T10 missing token and supplier failures send zero requests', async () => {
  for (const [supplier,code] of [[async()=>({data:null,error:null}),'AUTH_REQUIRED'],[async()=>({data:null,error:{code:'network'}}),'AUTH_UNAVAILABLE'],[async()=>{throw Error('private-provider-detail')},'AUTH_UNAVAILABLE']]) {
    const api=createV2ApiClient({baseUrl:'https://api.example',tokenSupplier:supplier,fetcher:()=>assert.fail('must not fetch')});
    await assert.rejects(api.get('/probe'),e=>e instanceof V2ApiError && e.status===0 && e.code===code && !e.message.includes('private'));
  }
});
test('T10 JSON writes and DELETE 204 never parse a body', async () => {
  const calls=[];const api=client(async(url,init)=>{calls.push(init);return init.method==='DELETE'?new Response(null,{status:204}):json({data:{amount:'0.01'}});});
  for (const method of ['post','put']) assert.deepEqual(await api[method]('/probe',{amount:'0.01'}),{data:{amount:'0.01'}});
  assert.equal(await api.delete('/probe'),undefined);
  for(const call of calls.slice(0,2)){assert.equal(call.body,'{"amount":"0.01"}');assert.equal(call.headers['Content-Type'],'application/json');}
  assert.equal(calls[2].body,undefined);
});
test('T10 structured auth/server/validation failures retain details and safe messages', async () => {
  for (const [status,code,kind] of [[401,'AUTH_REQUIRED','auth'],[401,'AUTH_INVALID','auth'],[503,'AUTH_UNAVAILABLE','server'],[400,'VALIDATION_ERROR','validation'],[500,'INTERNAL_ERROR','server']]) {
    const details=code==='VALIDATION_ERROR'?[{field:'amount',message:'Amount must be positive.'}]:[];
    await assert.rejects(client(async()=>json({error:{code,message:'private-provider-stack',details}},status)).get('/probe'),e=>e.status===status&&e.code===code&&e.kind===kind&&assert.deepEqual(e.details,details)===undefined&&!e.message.includes('private'));
  }
});
test('T10 malformed and non-JSON responses fail safely, including empty 200', async () => {
  for (const response of [new Response('',{status:200}),new Response('html',{status:502}),json({wrong:[]}),json({error:{code:'BAD',details:[]} },400)]) {
    await assert.rejects(client(async()=>response).get('/probe'),e=>e.code==='INVALID_RESPONSE');
  }
});
test('T10 network failures never retry and mutations expose uncertainty', async () => {
  let calls=0;const api=client(async()=>{calls++;throw new TypeError('private connection refused stack');});
  for (const method of ['get','post','put','delete']) await assert.rejects(api[method]('/probe',{amount:'1.00'}),e=>e.kind==='network'&&e.uncertain===(method!=='get')&&!e.message.includes('private'));
  assert.equal(calls,4);
});
test('T10 abort before token, during token and in-flight remains distinguishable', async () => {
  const before=new AbortController();before.abort();await assert.rejects(client(()=>assert.fail()).get('/probe',{signal:before.signal}),e=>e.kind==='aborted'&&!e.uncertain);
  const during=new AbortController();const api=createV2ApiClient({baseUrl:'https://api.example',tokenSupplier:async()=>{during.abort();return {data:'token',error:null}},fetcher:()=>assert.fail()});
  await assert.rejects(api.get('/probe',{signal:during.signal}),e=>e.kind==='aborted');
  for (const method of ['get','post']) {
    const controller=new AbortController();let started;const ready=new Promise(r=>{started=r});
    const pending=client(async(_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('private','AbortError')),{once:true});started();}));
    const result=method==='get'?pending.get('/probe',{signal:controller.signal}):pending.post('/probe',{}, {signal:controller.signal});
    const checked=assert.rejects(result,e=>e.kind==='aborted'&&e.uncertain===(method==='post'));await ready;controller.abort();await checked;
  }
});
test('T10 transport has no token storage/logging, redirects or financial Supabase calls', () => {
  const source=readFileSync(new URL('../src/lib/api/v2-client.ts',import.meta.url),'utf8');
  assert.match(source,/tokenSupplier = getAccessToken/);
  assert.doesNotMatch(source,/console\.|localStorage|sessionStorage|\.from\(|\.rpc\(|signOut\(|refreshSession\(|window\.location/);
});
