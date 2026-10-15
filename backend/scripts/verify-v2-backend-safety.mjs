// T57 config/secret boundary checks. Run only from an isolated source snapshot.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath,URL} from 'node:url';

const backend=fileURLToPath(new URL('../',import.meta.url)),root=fileURLToPath(new URL('../../',import.meta.url));
assert.equal(existsSync(resolve(backend,'.env')),false,'Use the isolated snapshot; never load private application environment files');
const env={...process.env,DATABASE_URL:'postgresql://expense_tracker_app@127.0.0.1:55451/postgres',DATABASE_SSL_CA_FILE:'certs/supabase-ca.crt',CLIENT_ORIGIN:'http://localhost:3000',PORT:'4000',SUPABASE_URL:'',CURSOR_SIGNING_SECRET:'',CRON_SECRET:''};
let checks=0;
function run(patch,code,success=true){const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:backend,env:{...env,...patch},encoding:'utf8',timeout:15000,windowsHide:true});assert.equal(result.status===0,success);assert.ok(!(result.stdout+result.stderr).includes('synthetic-never-expose'));checks+=2;}
run({},`import assert from 'node:assert/strict';import {env} from './dist/config/env.js';import {pool} from './dist/db/pool.js';assert.equal(env.port,4000);assert.equal(env.clientOrigin,'http://localhost:3000');assert.equal(pool.options.ssl.rejectUnauthorized,true);assert.ok(pool.options.ssl.ca.includes('BEGIN CERTIFICATE'));assert.equal(pool.options.max,5);await pool.end();`);
for(const patch of [{DATABASE_URL:''},{DATABASE_URL:'https://invalid.example/db'},{DATABASE_URL:'postgresql://user:synthetic-never-expose@bad host/db'},{PORT:'0'},{PORT:'1e3'},{CLIENT_ORIGIN:'https://example.invalid/path'},{CLIENT_ORIGIN:'https://user:synthetic-never-expose@example.invalid'}])run(patch,"await import('./dist/config/env.js')",false);
for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat'])run({DATABASE_URL:env.DATABASE_URL+'?'+key+'=invalid'},"await import('./dist/db/pool.js')",false);
run({DATABASE_SSL_CA_FILE:'missing-t57-public-ca.crt'},"await import('./dist/db/pool.js')",false);
run({},`import assert from 'node:assert/strict';import {createTransactionCursorCodec} from './dist/utils/transaction-cursor.js';assert.throws(()=>createTransactionCursorCodec(undefined).decode('invalid','a5700000-0000-4000-8000-000000000001',''),error=>error.status===503&&error.code==='CURSOR_UNAVAILABLE');`);
const production=readFileSync(resolve(backend,'server.mjs'),'utf8');
assert.ok(!/categoryManagement\s*:\s*true/.test(production));checks++;
assert.deepEqual(JSON.parse(readFileSync(resolve(backend,'vercel.json'),'utf8')).crons,[]);checks++;
assert.match(readFileSync(resolve(root,'frontend/src/app/v2/layout.tsx'),'utf8'),/NODE_ENV !== "development"\) notFound\(\)/);checks++;

const files=[];
function visit(path){if(!existsSync(path))return;if(statSync(path).isDirectory()){for(const item of readdirSync(path))visit(resolve(path,item));}else if(['.ts','.tsx','.mjs','.js','.md','.json','.example','.css','.sql'].includes(extname(path))||path.endsWith('.env.example'))files.push(path);}
for(const path of ['backend/src','backend/dist','backend/scripts','backend/tests','backend/.env.example','frontend/.env.example','docs','supabase/migrations','README.md'])visit(resolve(root,path));
const findings=[];let documentedPlaceholders=0;
for(const file of files){
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/postgres(?:ql)?:\/\/[^\s'"`<>]+:[^\s'"`<>]+@[^\s'"`<>]+/g)){
    const value=match[0];
    if(/YOUR_|:PASSWORD@|@HOST\b|127\.0\.0\.1|localhost|\.invalid|synthetic|example/i.test(value))documentedPlaceholders++;
    else findings.push({file:file.slice(root.length),kind:'database-credential-pattern'});
  }
  if(/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:CURSOR_SIGNING_SECRET|CRON_SECRET)\s*=\s*[0-9a-fA-F]{64}(?:\s|$)/.test(source))findings.push({file:file.slice(root.length),kind:'key-token-secret-pattern'});
}
assert.deepEqual(findings,[],'Review local filename-only findings before publishing evidence');
const result={checks,filesScanned:files.length,recognizedSecretPatterns:0,documentedPlaceholders,configurationAndGates:true,remoteTouched:false};
writeFileSync(resolve(process.env.T57_OUTPUT_DIRECTORY,'safety-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
