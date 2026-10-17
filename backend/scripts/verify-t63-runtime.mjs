// Supplemental local-only runtime/mutation/auth measurements on the T63 fixture.
/* global process, console, fetch */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {Client,Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {createTokenVerifier} from '../dist/middleware/auth.js';
import {createTransactionCursorCodec,transactionScopeHash} from '../dist/utils/transaction-cursor.js';
import {disposableIsolationUrl,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T63_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});admin.on('error',()=>{});await admin.connect();
assert.equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),realpathSync(resolve('.tmp-v2-t63/pgdata')));
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href,max:5,connectionTimeoutMillis:5000,query_timeout:5000});
const owner='b6300000-0000-4000-8000-000000000001',secret='63'.repeat(32),out=resolve('.tmp-v2-t63/evidence/runtime.json'),result={measurements:[],startup:[],remoteTouched:false};
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:secret});
const token=await auth.createTestAuthToken({userId:owner},{expiration:'2h'});
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {medianMs:s[Math.floor(s.length/2)],p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)],maxMs:Math.max(...s)};};
async function measure(name,fn,n=15){await fn();await fn();const times=[];for(let i=0;i<n;i++){const start=performance.now();await fn();times.push(performance.now()-start);}result.measurements.push({name,iterations:n,warmups:2,...stats(times)});}
async function request(path,method='GET',body,status=200){const r=await auth.rawRequest(token,path,method,body);assert.equal(r.status,status,JSON.stringify(r.body));return r.body?.data;}
const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>{try{return (await pool.query('SELECT current_user AS role')).rows[0].role==='expense_tracker_app';}catch{return false;}}}).listen(0,'127.0.0.1');await once(server,'listening');
try{
 // Fresh Node subprocesses import the built app; startup excludes DB and provider network.
 for(let i=0;i<7;i++){const start=performance.now();const r=spawnSync(process.execPath,['--input-type=module','-e',"const t=performance.now(); await import('./backend/dist/app.js'); console.log(performance.now()-t)"],{cwd:resolve('.'),encoding:'utf8',windowsHide:true});assert.equal(r.status,0);result.startup.push({processWallMs:performance.now()-start,builtAppImportMs:Number(r.stdout.trim())});}
 await measure('fresh runtime pool connect and role query',async()=>{const p=new Pool({connectionString:url.href,max:5});try{assert.equal((await p.query('SELECT current_user AS role')).rows[0].role,'expense_tracker_app');}finally{await p.end();}});
 await measure('warm health HTTP with actual limited-role DB query',async()=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/health');assert.equal(r.status,200);await r.json();});
 await measure('cold local JWKS + JWT verification',()=>createTokenVerifier(auth.origin)(token));const verify=createTokenVerifier(auth.origin);await verify(token);await measure('warm local JWKS JWT verification',()=>verify(token),100);
 const codec=createTransactionCursorCodec(secret),scope=transactionScopeHash({},100),sort={date:'2026-10-17',createdAt:'2026-10-17T00:00:00.000000Z',id:owner};
 await measure('1000 cursor HMAC encode/decode pairs',()=>{for(let i=0;i<1000;i++)assert.deepEqual(codec.decode(codec.encode(owner,scope,sort),owner,scope),sort);});
 const a=(await request('/accounts')).map(a=>a.id),categories=await request('/categories');
 const tx={accountId:a[0],categoryId:categories.find(c=>c.kind==='both').id,type:'expense',amount:'0.10',description:'Runtime measure',date:'2026-10-17'};
 const tr={sourceAccountId:a[0],destinationAccountId:a[1],amount:'0.10',description:'Runtime transfer',date:'2026-10-17'};
 for(const [resource,input]of [['transactions',tx],['transfers',tr]]){
  let current;await measure(resource+' signed POST plus cleanup DELETE',async()=>{current=await request('/'+resource,'POST',input,201);await request('/'+resource+'/'+current.id,'DELETE',undefined,204);});
  current=await request('/'+resource,'POST',input,201);let amount=false;await measure(resource+' signed PUT',()=>{amount=!amount;return request('/'+resource+'/'+current.id,'PUT',{...input,amount:amount?'0.20':'0.10'});});await request('/'+resource+'/'+current.id,'DELETE',undefined,204);
  const pending=[];for(let i=0;i<17;i++)pending.push((await request('/'+resource,'POST',input,201)).id);await measure(resource+' signed DELETE',()=>request('/'+resource+'/'+pending.pop(),'DELETE',undefined,204));
 }
 // POST timings include only POST here; cleanup happens after each timed request.
 for(const [resource,input]of [['transactions',tx],['transfers',tr]]){const times=[];for(let i=0;i<17;i++){const start=performance.now(),c=await request('/'+resource,'POST',input,201);if(i>=2)times.push(performance.now()-start);await request('/'+resource+'/'+c.id,'DELETE',undefined,204);}result.measurements.push({name:resource+' isolated signed POST',iterations:15,warmups:2,...stats(times)});}
 const before=Number((await admin.query('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()')).rows[0].deadlocks),times=[];const start=performance.now();
 await Promise.all(Array.from({length:8},async(_,i)=>{for(let j=0;j<10;j++){const t=performance.now(),c=await request('/transfers','POST',{...tr,...(i%2?{sourceAccountId:a[1],destinationAccountId:a[0]}:{})},201);await request('/transfers/'+c.id,'PUT',{...tr,amount:'0.20'});await request('/transfers/'+c.id,'DELETE',undefined,204);times.push(performance.now()-t);}}));
 result.transferContention={workers:8,cycles:80,mutations:240,elapsedMs:performance.now()-start,cycleLatency:stats(times),deadlockDelta:Number((await admin.query('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()')).rows[0].deadlocks)-before,errors:0};assert.equal(result.transferContention.deadlockDelta,0);
 result.datasetCounts=(await admin.query("SELECT (SELECT count(*) FROM expense_tracker.transactions WHERE user_id=$1)::int transactions,(SELECT count(*) FROM expense_tracker.transfers WHERE user_id=$1)::int transfers",[owner])).rows[0];assert.deepEqual(result.datasetCounts,{transactions:32000,transfers:2200});
 writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 result.startupSummary={processWall:stats(result.startup.map(x=>x.processWallMs)),builtImport:stats(result.startup.map(x=>x.builtAppImportMs))};
 writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('T63 runtime smoke passed');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await auth.close();await pool.end();await admin.end();}
