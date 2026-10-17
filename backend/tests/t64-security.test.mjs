import assert from 'node:assert/strict';
import process from 'node:process';
import {test} from 'node:test';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath,URL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {createApp} from '../dist/app.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixture=resolve(root,'.tmp-v2-t64/unit/backend/dist');

test('T64 pg URL TLS overrides are rejected before any connection, preserving CA verification',()=>{
  // Isolate the real built modules from private .env files. Only bare package
  // resolution is rewritten; env/pool logic is executed verbatim in a child.
  for(const directory of ['db','config'])mkdirSync(resolve(fixture,directory),{recursive:true});
  for(const [file,dependency]of [['db/pool.js','pg'],['config/env.js','dotenv']]){
    const source=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8').replace('from "'+dependency+'"','from '+JSON.stringify(import.meta.resolve(dependency)));
    writeFileSync(resolve(fixture,file),source);
  }
  const ca=resolve(root,'backend/certs/supabase-ca.crt'),moduleUrl=pathToFileURL(resolve(fixture,'db/pool.js')).href;
  const run=query=>spawnSync(process.execPath,['--input-type=module','-e',`const {pool}=await import(${JSON.stringify(moduleUrl)});const {Client}=await import(${JSON.stringify(import.meta.resolve('pg'))});const c=new Client(pool.options);if(c.connectionParameters.ssl.rejectUnauthorized!==true||!c.connectionParameters.ssl.ca.includes('BEGIN CERTIFICATE')||pool.options.max!==5)process.exit(2);await pool.end();`],{env:{...process.env,DATABASE_URL:'postgresql://expense_tracker_app@127.0.0.1:55451/postgres'+query,DATABASE_SSL_CA_FILE:ca,CLIENT_ORIGIN:'http://localhost:3000',PORT:'4000',PGSSLMODE:'no-verify'},encoding:'utf8',windowsHide:true,timeout:10000});
  for(const value of ['0','no-verify'])assert.notDeepEqual(new Client({connectionString:'postgresql://app@127.0.0.1:55451/postgres?ssl='+value,ssl:{rejectUnauthorized:true}}).connectionParameters.ssl,{rejectUnauthorized:true});
  for(const query of ['?ssl=0','?ssl=no-verify','?ssl=true','?ssl=1','?ssl=false','?sslmode=no-verify','?sslrootcert=not-a-file','?sslcert=not-a-file','?sslkey=not-a-file','?uselibpqcompat=true','?sslnegotiation=direct','?%73sl=0','?SSL=0','?ssl=1&ssl=0']){const r=run(query);assert.equal(r.status,1,query);assert.ok(r.stderr.includes('Configure database TLS using DATABASE_SSL_CA_FILE'));assert.ok(!r.stderr.includes('postgresql://'));}
  for(const query of ['','?application_name=t64'])assert.equal(run(query).status,0);
});

test('T64 HTTP headers protect health, errors, retired V1 and independent cron responses',async()=>{
  const app=createApp({clientOrigin:'https://frontend.example.invalid',financialMode:'v2',databaseHealth:async()=>true,recurringCron:{processor:{processDueRecurring:async()=>{throw Error('must not run');}},secret:()=>undefined}}),server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{for(const path of ['/api/v2/health','/api/v2/missing','/api/v1/transactions','/internal/recurring/process']){const r=await globalThis.fetch('http://127.0.0.1:'+server.address().port+path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-powered-by'),null);}}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
