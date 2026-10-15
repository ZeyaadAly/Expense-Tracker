// Local real recurring UI smoke; synthetic Supabase Auth, real Express/PostgreSQL.
/* global process, fetch, console */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.env.T58_TOOLS_ROOT,'.tmp-v2-t20/node_modules/playwright/index.mjs')));
const out=resolve(process.env.T58_OUTPUT_DIRECTORY);mkdirSync(out,{recursive:true});
const api='http://127.0.0.1:4000',session=await(await fetch(api+'/test/session/a')).json(),checks=[],errors=[];
async function request(path,method='GET',body){const r=await fetch(api+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+session.access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value.data;}
await request('/profile/bootstrap','POST',{});const account=await request('/accounts','POST',{name:'T61 browser cash',type:'cash',openingBalance:'0.00',currency:'EGP'}),category=(await request('/categories')).find(c=>c.isSystem&&c.name==='Salary');
const base={accountId:account.id,categoryId:category.id,type:'income',amount:'0.10',frequency:'monthly',startDate:'2026-10-15',endDate:null};
const fixtures={};for(const name of ['active','paused','archived','exhausted'])fixtures[name]=await request('/recurring','POST',{...base,description:'T61 browser '+name,...(name==='exhausted'?{startDate:'2024-01-01',endDate:'2024-01-01'}:{})});
for(const name of ['paused','archived'])await request('/recurring/'+fixtures[name].id+'/'+(name==='paused'?'pause':'archive'),'POST',{});
const browser=await chromium.launch({headless:true,executablePath:process.env.T58_BROWSER_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
await context.route('https://t37-fixture.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/logout')?{}:session.user}));
await context.addInitScript(s=>localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(s)),session);
async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
try{
 await page.goto('http://localhost:3000/v2/recurring');await page.locator('#v2-main').waitFor();await page.waitForLoadState('networkidle');
 for(const name of ['active','paused','archived','exhausted'])await check('real '+name+' schedule presentation',async()=>{const row=page.getByRole('article',{name:'T61 browser '+name,exact:true});await row.waitFor();const text=await row.innerText();assert.ok(text.includes(name==='exhausted'?'Schedule complete':name==='active'?'2026-10-15':name==='paused'?'Paused':'Archived'));if(name!=='active')assert.equal(await row.locator('time[datetime="2026-10-15"]').count(),0);});
 await check('no browser processor retry cron controls or server secrets',async()=>{const text=await page.locator('body').innerText();assert.ok(!/Run now|Retry processor|Cron controls|CRON_SECRET|CURSOR_SIGNING_SECRET|DATABASE_URL/i.test(text));assert.equal(await page.getByRole('button',{name:/process|run now|retry processor|cron/i}).count(),0);});
 await check('real processor progression refreshes next occurrence without duplicate posting',async()=>{const processResponse=await fetch(api+'/test/process',{method:'POST'});assert.equal(processResponse.status,200);assert.equal((await processResponse.json()).posted,1);await page.getByRole('button',{name:'Refresh recurring items',exact:true}).click();await page.waitForLoadState('networkidle');const row=page.getByRole('article',{name:'T61 browser active',exact:true});await row.locator('time[datetime="2026-11-15"]').waitFor();assert.equal((await request('/transactions?limit=100')).filter(t=>t.recurringTransactionId===fixtures.active.id).length,1);const repeated=await(await fetch(api+'/test/process',{method:'POST'})).json();assert.equal(repeated.posted,0);});
 await check('UI pause and explicit resume preserve coherent cursor',async()=>{const row=page.getByRole('article',{name:'T61 browser active',exact:true});await row.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Pause schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal((await request('/recurring/'+fixtures.active.id)).status,'paused');await row.getByRole('button',{name:'Resume',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Resume schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});const current=await request('/recurring/'+fixtures.active.id);assert.equal(current.status,'active');assert.equal(current.nextOccurrence,'2026-11-15');});
 assert.deepEqual(errors,[]);await page.screenshot({path:resolve(out,'recurring-smoke.png')});writeFileSync(resolve(out,'recurring-smoke.json'),JSON.stringify({checks,count:checks.length,pageErrors:errors,serverControls:false,remoteTouched:false},null,2)+'\n');
}finally{await browser.close();}
