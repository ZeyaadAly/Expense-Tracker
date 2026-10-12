import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {createApp} from '../dist/app.js';
const {fetch}=globalThis;

for (const financialMode of ['maintenance','v2']) test(`production ${financialMode} blocks every legacy financial method before parsing or SQL`,async()=>{
  const transactions=new Proxy({}, {get:()=>async()=>{throw Error('Legacy SQL must not execute');}});
  const server=createApp({clientOrigin:'https://example.invalid',databaseHealth:async()=>true,transactions,financialMode}).listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const path of ['/transactions','/transactions/a3700000-0000-4000-8000-000000000001','/summary']) for(const method of ['GET','POST','PUT','PATCH','DELETE']){
      const response=await fetch(origin+'/api/v1'+path,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:'invalid JSON'})});
      assert.equal(response.status,financialMode==='maintenance'?503:410);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal((await response.json()).error.code,financialMode==='maintenance'?'MAINTENANCE':'API_RETIRED');
    }
    for(const prefix of ['/api/v1','/api/v2']) assert.equal((await fetch(origin+prefix+'/health')).status,200);
    if(financialMode==='maintenance') for(const path of ['/api/v2/profile/bootstrap','/api/v2/accounts','/internal/recurring/process']){
      assert.equal((await fetch(origin+path,{method:'POST'})).status,503);
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
