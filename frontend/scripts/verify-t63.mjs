// Browser performance smoke against t63-browser-api.mjs. Financial routes stay dev-only.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.env.T63_PLAYWRIGHT_PATH)));
const out=resolve('.tmp-v2-t63/evidence');mkdirSync(out,{recursive:true});
const sessions=Object.fromEntries(await Promise.all(['a','b'].map(async who=>[who,await(await fetch('http://127.0.0.1:4000/test/session/'+who)).json()])));
const browser=await chromium.launch({headless:true,executablePath:process.env.T63_BROWSER_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const results={mode:'Next development; intentional production financial 404 preserved',browser:browser.version(),navigation:[],waterfalls:[],dialogs:[],memory:[],errors:[],checks:[],remoteTouched:false};
page.on('pageerror',e=>results.errors.push(e.message));
await context.route('https://t37-fixture.supabase.co/**',route=>route.fulfill({json:route.request().url().endsWith('/logout')?{}:sessions.a.user}));
await context.addInitScript(s=>{if(!localStorage.getItem('sb-t37-fixture-auth-token'))localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(s.a));window.__t63sessions=s;window.__t63long=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__t63long.push(e.duration);}).observe({type:'longtask',buffered:true});},sessions);
let requests=[],pending=0,started=0;const active=new Set();
page.on('request',r=>{if(r.url().includes('/api/v2/')){active.add(r);pending++;requests.push({method:r.method(),path:new URL(r.url()).pathname+new URL(r.url()).search,startMs:Date.now()-started});}});
function ended(r){if(active.delete(r))pending--;}
page.on('requestfinished',ended);page.on('requestfailed',ended);
const finish=async()=>{await page.locator('#v2-main').waitFor();await page.waitForFunction(()=>!document.querySelector('#v2-main')?.textContent?.match(/Loading (?:transactions|dashboard|analytics|accounts|goals|budgets|recurring|profile|active categories)/i));for(let i=0;i<300&&(pending||!requests.length);i++)await page.waitForTimeout(20);assert.equal(pending,0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
async function navigation(route,{reload=false,label='desktop'}={}){requests=[];started=Date.now();if(reload)await page.goto('http://localhost:3000/v2/'+route);else{const link=page.locator('a[href="/v2/'+route+'"]').first();if(await link.count())await link.click();else await page.goto('http://localhost:3000/v2/'+route);}await finish();const ms=Date.now()-started;await page.waitForTimeout(100);results.navigation.push({route,label,reload,usableApproxMs:ms,domNodes:await page.locator('*').count(),longTasks:await page.evaluate(()=>window.__t63long.splice(0))});results.waterfalls.push({route,label,requests:[...requests]});console.log(route,label,ms+'ms',requests.length+' requests');}
async function memory(label){const cdp=await context.newCDPSession(page);const m=await cdp.send('Memory.getDOMCounters');const metrics=await cdp.send('Performance.getMetrics');results.memory.push({label,...m,metrics:metrics.metrics.filter(m=>['JSHeapUsedSize','Nodes','JSEventListeners'].includes(m.name))});await cdp.detach();}
async function switchUser(who){await page.evaluate(w=>{const s=window.__t63sessions[w];localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(s));const c=new BroadcastChannel('sb-t37-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:s});setTimeout(()=>c.close(),50);},who);await page.waitForTimeout(500);await finish();}
try{
 await navigation('dashboard',{reload:true,label:'first development compile and session restore'});
 for(const route of ['accounts','transactions','recurring','analytics','budgets','goals','settings'])await navigation(route,{label:'warmup compilation'});
 await memory('after warmup');
 for(let i=0;i<5;i++)for(const route of ['dashboard','transactions','analytics','settings'])await navigation(route,{label:'desktop warm '+i});
 for(const route of ['accounts','recurring','budgets','goals'])await navigation(route,{label:'desktop extra'});
 await navigation('transactions',{reload:true,label:'direct reload'});
 // Connected UI deliberately fixes its page at 25. Its strict client rejects a mismatched
 // limit=100 response. Measure 100 DOM rows without claiming a 100-row React/API flow.
 results.hundredRowDomStress=await page.evaluate(async()=>{const body=document.querySelector('.v2-ledger-desktop tbody');if(!body)return {unavailable:true};const rows=[...body.children],start=performance.now();for(let i=0;i<75;i++)body.append(rows[i%rows.length].cloneNode(true));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {rows:body.children.length,twoFrameLayoutMs:performance.now()-start,kind:'DOM cloning only; React runtime remains 25 rows'};});
 await navigation('transactions',{reload:true,label:'restore 25-row runtime after DOM stress'});
 const search=page.getByLabel('Search transactions',{exact:true});for(const term of ['Weekly','RareNeedle','groceries']){await search.fill(term);await page.getByRole('button',{name:'Search',exact:true}).click();}await finish();await page.waitForTimeout(500);results.rapidSearchRequests=[...requests];
 await navigation('settings',{reload:true,label:'1000 custom categories'});
 for(const [route,name]of [['transactions','Add transaction'],['accounts','New transfer'],['recurring','Add recurring item'],['budgets','Add budget'],['goals','Create goal'],['settings','Add custom category']]){
  await navigation(route,{label:'dialog preparation'});const before=await page.locator('*').count(),samples=[];for(let i=0;i<5;i++){const start=Date.now();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('dialog').waitFor();samples.push(Date.now()-start);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});}results.dialogs.push({name,openMs:samples,beforeNodes:before,afterNodes:await page.locator('*').count()});
 }
 await memory('after repeated routes and dialogs');
 requests=[];started=Date.now();await switchUser('b');results.sessionSwitch={ms:Date.now()-started,requests:[...requests],priorUserIdAbsent:!(await page.locator('body').innerText()).includes(sessions.a.user.id)};
 for(const route of ['dashboard','transactions','analytics','settings'])await navigation(route,{label:'normal personal dataset'});await switchUser('a');
 await page.setViewportSize({width:360,height:800});
 for(const route of ['dashboard','transactions','analytics','settings'])for(let i=0;i<3;i++)await navigation(route,{reload:true,label:'mobile viewport warm '+i});
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
 for(const route of ['dashboard','transactions','analytics','settings'])await navigation(route,{reload:true,label:'360px 4x CPU, 150ms RTT, 1.6Mbps down/750kbps up'});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.setViewportSize({width:1440,height:1000});
 await context.route('**/api/v2/dashboard**',async route=>{await new Promise(r=>setTimeout(r,1300));await route.continue();});
 const slowStart=Date.now();await page.goto('http://localhost:3000/v2/dashboard');await page.getByRole('status').first().waitFor();results.slowLoadingStatusMs=Date.now()-slowStart;await finish();
 const textBefore=await page.locator('#v2-main').innerText();const refresh=page.getByRole('button',{name:/Refresh dashboard/i});if(await refresh.count()){await refresh.click();await page.waitForTimeout(150);results.retainedRefreshContent=(await page.locator('#v2-main').innerText()).includes('Net position');await finish();}assert.ok(textBefore.includes('Net position'));await context.unroute('**/api/v2/dashboard**');
 await context.route('**/api/v2/dashboard**',route=>route.fulfill({status:503,json:{error:{code:'DATABASE_UNAVAILABLE',message:'Unavailable',details:[]}}}));requests=[];await page.goto('http://localhost:3000/v2/dashboard');await page.waitForTimeout(2500);results.failureRequests=[...requests];assert.ok(requests.filter(r=>r.path.startsWith('/api/v2/dashboard')).length<=2);await context.unroute('**/api/v2/dashboard**');
 assert.deepEqual(results.errors,[]);
}finally{writeFileSync(resolve(out,'frontend.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
