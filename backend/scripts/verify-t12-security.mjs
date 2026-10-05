// Report only check names/counts; never print matching credential text.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,encoding:'utf8'}).trim();
let checks=0;
function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
const files=git('ls-files','--cached','--others','--exclude-standard').split('\n');
const suspicious=[];
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,/\bsbp_[a-f0-9]{30,}\b/,/postgres(?:ql)?:\/\/[^\s:"']+:[^\s@]+@/g];
function suspect(text){return patterns.some(pattern=>{pattern.lastIndex=0;const matches=text.match(pattern)||[];return matches.some(value=>!/YOUR_|USER:PASSWORD|unavailable:unavailable|user:secret|user:password|postgres:\/\/USER/i.test(value));});}
for(const file of files){if(/\.(?:png|jpg|ico|crt)$/.test(file))continue;const text=readFileSync(resolve(root,file),'utf8');if(suspect(text))suspicious.push(file);}
check('no recognized credential patterns in versioned/current source',suspicious.length===0);
check('no committed environment files',!git('ls-files').split('\n').some(file=>/(^|\/)\.env(?:$|\.)/.test(file)&&!file.includes('example')));
for(const file of ['backend/.env','frontend/.env.local'])check(file+' ignored',git('check-ignore',file)===file);
const history=git('log','--all','-p','--format=','--','.');
check('no recognized credential patterns in Git history',!suspect(history));
const pool=readFileSync(resolve(root,'backend/src/db/pool.ts'),'utf8');
check('verified TLS and rejected SSL URL overrides',pool.includes('rejectUnauthorized: true')&&pool.includes('sslmode')&&pool.includes('throw new Error'));
const frontend=files.filter(file=>file.startsWith('frontend/src/')).map(file=>readFileSync(resolve(root,file),'utf8')).join('\n');
check('frontend has no DB credentials or Supabase client',!/DATABASE_URL|service_role|createClient\(|@supabase/.test(frontend));
check('only public API environment variable in frontend',Array.from(frontend.matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g),m=>m[1]).every(name=>name==='NEXT_PUBLIC_API_BASE_URL'));
const service=readFileSync(resolve(root,'backend/src/services/transactions.ts'),'utf8');
check('all user write values parameterized',service.includes('[id, input.type, input.amount, input.description, input.category, input.date]')&&service.includes('[randomUUID(), input.type, input.amount, input.description, input.category, input.date]')&&service.includes('WHERE id = $1'));
check('money never converted to floating point in production',!/parseFloat\(|Number\([^)]*(?:amount|income|expenses|balance)/.test(frontend+service));
const page=readFileSync(resolve(root,'frontend/src/app/page.tsx'),'utf8');
check('fixture dashboard gated to development',page.includes('process.env.NODE_ENV === "development"'));
const app=readFileSync(resolve(root,'backend/src/app.ts'),'utf8');
check('CORS uses configured origin',app.includes('origin: options.clientOrigin'));
const env=readFileSync(resolve(root,'backend/.env.example'),'utf8');
check('backend example has placeholders and CA',env.includes('YOUR_SESSION_POOLER_HOST:5432')&&env.includes('DATABASE_SSL_CA_FILE=certs/supabase-ca.crt'));
check('frontend example documents API URL',readFileSync(resolve(root,'frontend/.env.example'),'utf8').includes('NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1'));
const chunks=resolve(root,'frontend/.next/static/chunks');
const chunkText=readdirSync(chunks,{recursive:true}).filter(file=>file.endsWith('.js')).map(file=>readFileSync(resolve(chunks,file),'utf8')).join('\n');
check('built browser JavaScript contains no credential patterns',!suspect(chunkText)&&!/YOUR_SESSION_POOLER_HOST|DATABASE_SSL_CA_FILE/.test(chunkText));
console.log(JSON.stringify({checks,failures:0,credentialValuesPrinted:false}));
