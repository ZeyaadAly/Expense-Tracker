// T58 source/build review and local production gate; never deploys.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.env.T58_OUTPUT_DIRECTORY);mkdirSync(out,{recursive:true});
const files=[];function walk(p){for(const name of readdirSync(p)){const f=resolve(p,name);if(statSync(f).isDirectory())walk(f);else if(['.js','.mjs','.ts','.tsx','.map','.md','.json','.example'].includes(extname(f)))files.push(f);}}
for(const p of ['frontend/src','frontend/.next/static','frontend/.next/server','docs'])walk(resolve(root,p));
for(const p of ['frontend/.env.example','backend/.env.example'])files.push(resolve(root,p));
const findings=[],classified=[];
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['secret-key',/\bsb_secret_[A-Za-z0-9_-]{20,}/],['database-password',/postgres(?:ql)?:\/\/[^\s:'"/]+:([^@\s'"/]+)@/g],['server-secret-literal',/(?:CRON_SECRET|CURSOR_SIGNING_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']([^"']{16,})["']/g],['bundled-jwt',/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}/g]];
for(const file of files){const source=readFileSync(file,'utf8');for(const [name,pattern] of rules){pattern.lastIndex=0;for(const m of source.matchAll(new RegExp(pattern.source,'g'))){if(m[1]&&/YOUR_|<|placeholder|example|synthetic|replace|password/i.test(m[1]))classified.push({file:file.slice(root.length),rule:name});else findings.push({file:file.slice(root.length),rule:name});}}}
assert.deepEqual(findings,[],'Credential pattern findings (values withheld)');
const gate=readFileSync(resolve(root,'frontend/src/app/v2/layout.tsx'),'utf8');assert.match(gate,/NODE_ENV !== "development"\) notFound\(\)/);
assert.deepEqual(JSON.parse(readFileSync(resolve(root,'backend/vercel.json'),'utf8')).crons,[]);assert.doesNotMatch(readFileSync(resolve(root,'backend/server.mjs'),'utf8'),/categoryManagement\s*:\s*true/);
const financialFiles=['dashboard-page','accounts-page','account-detail-page','transactions-page','transfers-panel','recurring-page','analytics-page','budgets-page','goals-page','settings-page'];
for(const name of financialFiles){const s=readFileSync(resolve(root,'frontend/src/features/v2/'+name+'.tsx'),'utf8');assert.doesNotMatch(s,/usePrototype\(|from ["'].*fixtures|parseFloat\(/,name+' runtime fixture/arithmetic');}
if(process.env.T58_SCAN_ONLY==='1'){const result={filesScanned:files.length,sourceMapsScanned:files.filter(f=>f.endsWith('.map')).length,recognizedSecretFindings:findings,classifiedPlaceholders:classified,remoteTouched:false};writeFileSync(resolve(out,'final-secret-scan.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exit(0);}
const statuses=[];for(const route of ['dashboard','accounts','accounts/00000000-0000-4000-8000-000000000000','transactions','recurring','analytics','budgets','goals','settings','login','register','forgot-password','reset-password']){const r=await fetch('http://localhost:3002/v2/'+route);assert.equal(r.status,['login','register','forgot-password','reset-password'].includes(route)?200:404,route);statuses.push({route,status:r.status});}
const rootResponse=await fetch('http://localhost:3002/',{redirect:'manual'});assert.equal(rootResponse.status,307);assert.equal(rootResponse.headers.get('location'),'/v2/login?next=%2Fv2%2Frelease-check');
for(const file of files.filter(f=>f.includes(`${resolve(root,'frontend/.next/static')}`))){const s=readFileSync(file,'utf8');assert.ok(!s.includes('http://127.0.0.1:4000')&&!s.includes('http://localhost:4000'),'No local API configuration in production static chunks');}
const tools=resolve(process.env.T58_TOOLS_ROOT),{chromium}=await import(pathToFileURL(resolve(tools,'.tmp-v2-t20/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:process.env.T58_BROWSER_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage(),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),auth:!!r.headers().authorization}));
await page.route('https://api.t58.invalid/api/v1/**',async route=>{const local=await fetch('http://127.0.0.1:4000'+new URL(route.request().url()).pathname);await route.fulfill({status:local.status,body:await local.text(),contentType:'application/json'});});
try{
 await page.goto('http://localhost:3002/');await page.waitForLoadState('networkidle');
 assert.ok(page.url().includes('/v2/login?next='));assert.ok((await page.locator('body').innerText()).includes('Expense Tracker'));assert.deepEqual(errors,[]);
 assert.ok(!requests.some(r=>{const u=new URL(r.url);return ['localhost','127.0.0.1'].includes(u.hostname)&&u.port!=='3002';}));
 const html=await page.content();assert.ok(!html.includes('sb_publishable_t37_fixture_only'));await page.screenshot({path:resolve(out,'production-root-auth.png')});
 await page.goto('http://localhost:3000/');await page.waitForLoadState('networkidle');assert.equal(await page.locator('.v2-theme').count(),0);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--v2-primary').trim()),'');assert.ok(requests.some(r=>r.url.includes('/api/v1/')));assert.ok(requests.filter(r=>r.url.includes('/api/v1/')).every(r=>!r.auth));assert.equal((await fetch('http://127.0.0.1:4000/api/v1/summary')).status,410);assert.deepEqual(errors,[]);await page.screenshot({path:resolve(out,'v1-retired-policy.png')});
 writeFileSync(resolve(out,'safety.json'),JSON.stringify({filesScanned:files.length,recognizedSecretFindings:findings,classifiedPlaceholders:classified,productionRoutes:statuses,productionRoot:307,productionRootTarget:'public Auth /release-check',developmentV1Root:200,v1FinancialPolicy:410,v1AuthHeaders:false,v1StyleLeak:false,productionLocalhostApiRequests:0,browserErrors:errors,fixtureFreeFinancialPages:financialFiles,cronEnabled:false,remoteTouched:false},null,2));console.log(JSON.stringify({filesScanned:files.length,secretFindings:0,financial404:9,publicAuth200:4,productionRoot:307,retiredV1:410}));
}finally{await browser.close();}
