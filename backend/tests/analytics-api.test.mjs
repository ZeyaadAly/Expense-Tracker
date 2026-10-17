import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {URL} from 'node:url';
import {createApp} from '../dist/app.js';
import {validateAnalyticsQuery} from '../dist/validators/analytics.js';
import {createTestAuthHarness,expectApiError} from './helpers/v2-isolation.mjs';

const valid='from=2024-01-01&to=2024-12-31';
const invalid=['','from=2024-01-01','to=2024-01-01','from=2025-02-29&to=2025-03-01','from=2024-02-30&to=2024-03-01','from=1899-12-31&to=1900-01-01','from=10000-01-01&to=10000-01-02','from=2026-01-02&to=2026-01-01','from=2024-01-01&to=2025-01-01',...['from=2024-01-01','to=2024-12-31','accountId=bad','accountId=','accountId[]=x','from[]=2024-01-01','period=this_month','range=7_days','userId=x','ownerId=x','profileId=x','accountUserId=x','categoryId=x','limit=5'].map(q=>valid+'&'+q)];

test('T39 strict explicit inclusive query contract and UUID normalization',()=>{
  const user=randomUUID(),account=randomUUID();
  assert.deepEqual(validateAnalyticsQuery('/analytics/overview?'+valid,user),{from:'2024-01-01',to:'2024-12-31'});
  assert.equal(validateAnalyticsQuery('/?'+valid+'&accountId='+account.toUpperCase(),user).accountId,account);
  for(const q of invalid)assert.throws(()=>validateAnalyticsQuery('/?'+q,user),e=>e.status===400&&e.code==='VALIDATION_ERROR'&&e.details.length>0);
  assert.throws(()=>validateAnalyticsQuery('/?'+valid+'&accountId='+account+'&accountId='+account,user));
  for(const q of ['from=1900-01-01&to=1900-01-01','from=9999-12-31&to=9999-12-31','from=2025-12-31&to=2026-01-01'])assert.ok(validateAnalyticsQuery('/?'+q,user));
});

test('T39 actual ES256 auth, validation before database, method guards and sanitized errors',async()=>{
  let calls=0;
  const db={connect:async()=>{calls++;throw Object.assign(Error('secret SQL expense_tracker.private_constraint'),{code:'ECONNREFUSED'});}};
  const auth=await createTestAuthHarness(db);
  try {
    const user={userId:randomUUID()},token=await auth.createTestAuthToken(user),path='/analytics/overview?'+valid;
    for(const credential of [null,'bad.token',await auth.createTestAuthToken(user,{wrongKey:true}),await auth.createTestAuthToken(user,{expiration:'-1s'}),await auth.createTestAuthToken(user,{audience:'wrong'})])expectApiError(await auth.rawRequest(credential,path),401,credential===null?'AUTH_REQUIRED':'AUTH_INVALID');
    for(const query of invalid)expectApiError(await auth.rawRequest(token,'/analytics/overview?'+query),400,'VALIDATION_ERROR');
    for(const method of ['POST','PUT','PATCH','DELETE','HEAD']){
      const r=await globalThis.fetch(auth.apiOrigin+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
      assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'GET');assert.equal(r.headers.get('Cache-Control'),'no-store');
    }
    const body=await auth.rawRequest(token,path,'GET');assert.equal(calls,1);expectApiError(body,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(body),/secret|SQL|constraint|expense_tracker|stack/);
    // Invalid input and rejected methods above did not acquire any DB connection.
    const r=await globalThis.fetch(auth.apiOrigin+'/api/v2'+path,{headers:{Authorization:'Bearer '+token,Origin:'https://foreign.invalid'}});assert.equal(r.headers.get('Access-Control-Allow-Origin'),'http://localhost:3000');
  }finally{await auth.close();}
  const failing=await createTestAuthHarness({connect:async()=>{throw Error('secret SQL stack');}});
  try {const r=await failing.rawRequest(await failing.createTestAuthToken({userId:randomUUID()}),'/analytics/overview?'+valid);expectApiError(r,500,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(r),/secret|SQL|stack/);}finally{await failing.close();}
});

test('T67 production Analytics registration uses the release guard; omitted factory endpoint stays 404',async()=>{
  const entry=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');assert.match(entry,/analytics:\s*createAnalyticsService/);assert.match(entry,/releaseAccess:\s*release/);assert.match(entry,/readReleaseConfig\(process.env, true\)/);
  const local=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');assert.match(local,/analytics:createAnalyticsService/);assert.match(local,/releaseAccess: release/);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')).crons,[]);
  const gate=readFileSync(new URL('../../frontend/src/app/v2/layout.tsx',import.meta.url),'utf8');assert.match(gate,/NODE_ENV !== "development"\) notFound\(\)/);
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,financialMode:'v2'}).listen(0,'127.0.0.1');await once(server,'listening');
  try {for(const token of [null,'arbitrary']){const r=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v2/analytics/overview?${valid}`,{headers:token?{Authorization:'Bearer '+token}:{}});assert.equal(r.status,404);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).error.code,'ROUTE_NOT_FOUND');}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
