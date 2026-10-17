// Local security review. No dotenv, hosted Auth, database or production fallback.
import assert from 'node:assert/strict';
import console from 'node:console';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {once} from 'node:events';
import {gzipSync} from 'node:zlib';
import {createApp} from '../dist/app.js';
import {createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(root,'.tmp-v2-t64/evidence');mkdirSync(out,{recursive:true});
const git=args=>execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/').replace(/\/$/,''),...args],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});
const checks=[],findings=[],result={checks,findings,remoteTouched:false,formalPenetrationTest:false};
const record=(name,details={})=>checks.push({name,...details});
const keyPattern=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{25,}\.eyJ[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}|(?:CRON_SECRET|CURSOR_SIGNING_SECRET)\s*[:=]\s*["']?[0-9a-f]{64}(?:["']|\s|$)/;
function scan(text,where){if(keyPattern.test(text))findings.push({where,rule:'private-key/token/secret'});for(const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s'"`<>]+:[^\s'"`<>]+@[^\s'"`<>]+/g))if(!/YOUR_|:PASSWORD@|@HOST\b|127\.0\.0\.1|localhost|\.invalid|synthetic|example/i.test(m[0]))findings.push({where,rule:'non-placeholder database credential'});}

// Bounded history: forty snapshots, deduplicated text blobs. Never print values.
const commits=git(['rev-list','--max-count=40','HEAD']).trim().split(/\r?\n/),blobs=new Map();
for(const commit of commits)for(const entry of git(['ls-tree','-r','-z',commit]).split('\0').filter(Boolean)){
 const match=entry.match(/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/);if(!match)continue;const [,oid,path]=match;if(/\.(?:png|jpg|jpeg|webp|ico|woff2?|gz|zip|pdf)$/i.test(path))continue;if(!blobs.has(oid))blobs.set(oid,{commit,path});
}
let batch;try{batch=execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/').replace(/\/$/,''),'cat-file','--batch'],{cwd:root,input:[...blobs.keys()].join('\n')+'\n',maxBuffer:192*1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw Error('Bounded history blob read failed; no blob contents emitted');}
let offset=0;for(const [, {commit,path}]of blobs){const end=batch.indexOf(10,offset),header=batch.subarray(offset,end).toString('utf8'),size=Number(header.split(' ')[2]);assert.ok(Number.isSafeInteger(size));scan(batch.subarray(end+1,end+1+size).toString('utf8'),commit.slice(0,12)+':'+path);offset=end+size+2;}
assert.deepEqual(findings,[],'Historical credential match: stop and review filename/commit only; rotation required if real');
record('bounded recognizable-secret history scan',{commits:commits.length,uniqueTextBlobs:blobs.size});
const files=[];function walk(path){if(!statSync(path).isDirectory()){if(!/\.(?:png|jpg|jpeg|webp|woff2?|ico)$/i.test(path))files.push(path);return;}for(const name of readdirSync(path))walk(resolve(path,name));}
for(const path of ['README.md','.gitignore','backend/src','backend/dist','backend/tests','backend/scripts','backend/server.mjs','backend/vercel.json','backend/package.json','backend/package-lock.json','backend/.env.example','frontend/src','frontend/tests','frontend/scripts','frontend/next.config.ts','frontend/package.json','frontend/package-lock.json','frontend/.env.example','frontend/.next/static','frontend/.next/server','docs','supabase/migrations'])if(existsSync(resolve(root,path)))walk(resolve(root,path));
for(const file of files){const content=readFileSync(file,'utf8');scan(content,file.slice(root.length));if(file.replaceAll('\\','/').includes('/.next/static/'))assert.ok(!/CURSOR_SIGNING_SECRET|CRON_SECRET|DATABASE_URL|DATABASE_SSL_CA_FILE/.test(content),'server configuration in browser chunk');}
assert.deepEqual(findings,[]);record('source/build/maps/docs/evidence scan',{files:files.length,maps:files.filter(p=>extname(p)==='.map').length});
// Compare configured local secret values in memory. Only counts/filenames leave
// this process; public configuration and placeholders are deliberately excluded.
const localSecrets=new Set();let envFiles=0;
for(const path of ['backend/.env','backend/.env.local','frontend/.env','frontend/.env.local']){
 const file=resolve(root,path);if(!existsSync(file))continue;envFiles++;
 for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m||m[1].startsWith('NEXT_PUBLIC_'))continue;
  const value=m[2].replace(/^(['"])([\s\S]*)\1$/,'$2');
  if(!/SECRET|PASSWORD|DATABASE_URL|BACKUP.*URL|SERVICE_ROLE|PRIVATE.*KEY/.test(m[1])||value.length<12||/YOUR_|PLACEHOLDER|CHANGEME|PASSWORD@|example\.invalid/i.test(value))continue;
  localSecrets.add(value);
  if(/^postgres(?:ql)?:/.test(value)){const password=new URL(value).password;if(password.length>=12)localSecrets.add(decodeURIComponent(password));}
 }
}
for(const file of files){const content=readFileSync(file,'utf8');for(const secret of localSecrets)if(content.includes(secret))findings.push({where:file.slice(root.length),rule:'configured local secret value'});}
assert.deepEqual(findings,[]);record('configured local secret value comparison',{envFiles,valuesCompared:localSecrets.size});
const tracked=git(['ls-files']).trim().split(/\r?\n/);assert.deepEqual(tracked.filter(f=>/(^|\/)\.env(?:\.|$)/.test(f)&&!/^.*\.env(?:\.[^.]+)?\.example$/.test(f)&&!f.endsWith('.env.example')),[]);
assert.deepEqual(tracked.filter(f=>/\.(dump|backup|bak|pgpass|pfx|p12|key)$/i.test(f)),[]);record('tracked env/private backup boundary');
const runtimeFiles=files.filter(f=>/[/\\](?:src)[/\\]/.test(f)&&/\.(ts|tsx)$/.test(f));
const patterns={html:/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/,execution:/\beval\(|new Function\(|node:child_process|from ['"]child_process/,unsafeTls:/rejectUnauthorized\s*:\s*false/,financialSdk:/\.from\(|\.rpc\(/};
result.staticHits={};for(const [name,re]of Object.entries(patterns)){const hits=runtimeFiles.filter(f=>re.test(readFileSync(f,'utf8'))).map(f=>f.slice(root.length));result.staticHits[name]=hits;if(name!=='financialSdk')assert.deepEqual(hits,[]);}
// Array.from is not a financial SDK call; exact hits are manually reviewed in report.
record('production execution/HTML/TLS sinks review');

const originalError=console.error,logs=[];console.error=(...args)=>logs.push(args.join(' '));
let sql=0;const pool={query:async()=>{sql++;throw Object.assign(Error('T64_PRIVATE_SQL_CREDENTIAL'),{code:'ECONNREFUSED'});},connect:async()=>{throw Error('unexpected SQL checkout');}};
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:'64'.repeat(32)}),token=await auth.createTestAuthToken({userId:'a6400000-0000-4000-8000-000000000001'});
const request=async(path,options={})=>globalThis.fetch(auth.apiOrigin+'/api/v2'+path,options);
try{
 for(const origin of ['http://localhost:3000','https://evil.invalid','null'])for(const method of ['GET','OPTIONS']){const r=await request('/health',{method,headers:{Origin:origin,...(method==='OPTIONS'?{'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}:{})}});assert.equal(r.headers.get('access-control-allow-origin'),'http://localhost:3000');assert.equal(r.headers.get('access-control-allow-credentials'),null);if(method==='OPTIONS')assert.equal(r.status,204);}record('exact CORS, unrelated/null origins, preflight and no credentials');
 for(const authorization of ['', '  ','Basic token','Bearer a b','Bearer not.a.jwt','BEARER '+ 'x'.repeat(14000)]){const r=await request('/profile',{headers:{Authorization:authorization}});assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');}
 const cookie=await request('/profile',{headers:{Cookie:'access_token=synthetic-cookie-only'}});assert.equal(cookie.status,401);record('Bearer parsing and ambient-cookie rejection');
 const huge=await request('/profile',{headers:{Authorization:'Bearer '+'x'.repeat(18000)}});assert.equal(huge.status,431);record('Node oversized-header boundary',{status:huge.status});
 for(const compressed of [false,true]){const body=JSON.stringify({displayName:'x'.repeat(20000)}),r=await request('/profile',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(compressed?{'Content-Encoding':'gzip'}:{})},body:compressed?gzipSync(body):body});assert.equal(r.status,413);assert.equal((await r.json()).error.code,'PAYLOAD_TOO_LARGE');}record('plain and inflated gzip body limit',{bytes:16384});
 for(const body of ['{','{"displayName":"x","__proto__":{"polluted":true}}','{"displayName":"x","constructor":{"prototype":{"polluted":true}}}']){const r=await request('/profile',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body});assert.equal(r.status,400);}assert.equal({}.polluted,undefined);record('JSON ambiguity and prototype-property rejection');
 for(const q of ['?q='+encodeURIComponent('a'.repeat(201)),'?limit=101','?q=a&q=b','?accountId[foo]=x','?unknown=x']){const r=await request('/transactions'+q,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,400);}const range=await request('/analytics/overview?from=2020-01-01&to=2026-10-17',{headers:{Authorization:'Bearer '+token}});assert.equal(range.status,400);record('search/page/query/analytics bounds reject before SQL');assert.equal(sql,0);
 const failure=await request('/profile',{headers:{Authorization:'Bearer '+token}});assert.equal(failure.status,503);const body=await failure.text();assert.ok(!/T64_PRIVATE|stack|postgres|schema|SELECT|Bearer/.test(body));assert.equal(failure.headers.get('cache-control'),'no-store');record('driver failure sanitization');
 for(const route of ['/profile','/accounts','/transactions','/dashboard','/analytics/overview','/budgets','/goals']){const r=await request(route);assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');}record('representative private error cache controls');
 assert.ok(!logs.join('\n').includes(token)&&!logs.join('\n').includes('T64_PRIVATE'));record('no token/driver detail in captured error logs',{lines:logs.length});
}finally{await auth.close();console.error=originalError;}
const server=createApp({financialMode:'v2',clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,transactions:new Proxy({},{get:()=>()=>{throw Error('retired SQL reached');}})}).listen(0,'127.0.0.1');await once(server,'listening');
try{for(const path of ['/transactions','/summary','/transactions/a6400000-0000-4000-8000-000000000001'])for(const method of ['GET','POST','PUT','DELETE'])assert.equal((await globalThis.fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:'invalid'})})).status,410);record('retired legacy routes stop before parsing and SQL');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
writeFileSync(resolve(out,'security.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({groups:checks.length,historyCommits:commits.length,files:files.length,findings:0,remoteTouched:false}));
