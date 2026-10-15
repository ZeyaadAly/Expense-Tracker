// T59 browser privacy supplement. Real local API/database; synthetic Auth only.
/* global process, console, fetch */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.env.T58_TOOLS_ROOT,'.tmp-v2-t20/node_modules/playwright/index.mjs')));
const output=resolve(process.env.T58_OUTPUT_DIRECTORY);mkdirSync(output,{recursive:true});
const api='http://127.0.0.1:4000',origin='http://localhost:3000';
const sessions=Object.fromEntries(await Promise.all(['a','b'].map(async who=>[who,await(await fetch(api+'/test/session/'+who)).json()])));
const browser=await chromium.launch({headless:true,executablePath:process.env.T58_BROWSER_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext();const page=await context.newPage(),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route('https://t37-fixture.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/logout')?{}:sessions.a.user}));
await context.addInitScript(s=>{const key='sb-t37-fixture-auth-token';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s.a));window.__t59sessions=s;},sessions);
async function request(who,path,method='GET',body){
  const response=await fetch(api+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+sessions[who].access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value.data;
}
async function switchUser(who){await page.evaluate(w=>{const s=window.__t59sessions[w],key='sb-t37-fixture-auth-token';localStorage.setItem(key,JSON.stringify(s));const c=new BroadcastChannel(key);c.postMessage({event:'SIGNED_IN',session:s});setTimeout(()=>c.close(),50);},who);}
async function goto(route){await page.goto(origin+'/v2/'+route);await page.locator('#v2-main').waitFor();await page.waitForLoadState('networkidle');}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function privateAbsent(){assert.ok(!(await page.locator('body').innerText()).includes('A-T59'));assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('option').filter({hasText:'A-T59'}).count(),0);}
try {
 const fixtures={};
 for(const who of ['a','b']){
   const prefix=who.toUpperCase()+'-T59';
   await request(who,'/profile/bootstrap','POST',{});await request(who,'/profile','PUT',{displayName:prefix});
   const cash=await request(who,'/accounts','POST',{name:prefix+' Cash',type:'cash',openingBalance:who==='a'?'111.00':'999999.00',currency:'EGP'});
   const bank=await request(who,'/accounts','POST',{name:prefix+' Bank',type:'bank',openingBalance:'0.00',currency:'EGP'});
   const category=await request(who,'/categories','POST',{name:prefix+' Category',kind:'expense',icon:null,color:null});
   await request(who,'/transactions','POST',{accountId:cash.id,categoryId:category.id,type:'expense',amount:who==='a'?'1.11':'999.99',description:prefix+' Transaction',date:'2026-10-15'});
   await request(who,'/transfers','POST',{sourceAccountId:cash.id,destinationAccountId:bank.id,amount:'0.01',date:'2026-10-15',description:prefix+' Transfer'});
   await request(who,'/recurring','POST',{accountId:cash.id,categoryId:category.id,type:'expense',amount:'0.01',description:prefix+' Recurring',frequency:'monthly',startDate:'2026-10-15',endDate:null});
   await request(who,'/budgets','POST',{categoryId:category.id,amount:'10.00',year:2026,month:10});
   await request(who,'/goals','POST',{name:prefix+' Goal',targetAmount:'10.00',savedAmount:'1.00',targetDate:null,linkedAccountId:cash.id});
   fixtures[who]={cash,bank,category};
 }
 const routes=['dashboard','accounts','accounts/'+fixtures.a.cash.id,'transactions','recurring','analytics','budgets','goals','settings'];
 for(const route of routes)await check('populated A to populated B clears '+route,async()=>{
   await goto(route);assert.ok((await page.locator('body').innerText()).includes('A-T59'));
   await switchUser('b');await page.waitForTimeout(100);await privateAbsent();await page.waitForLoadState('networkidle');await privateAbsent();
   await switchUser('a');await page.waitForTimeout(500);
 });
 const dialogs=[['transactions','Add transaction',/^Description/],['accounts','New transfer',/^Description/],['recurring','Add recurring item',/^Description/],['budgets','Edit A-T59 Category',null],['goals','Create goal',/^Goal name/],['settings','Add custom category',/^Category name/]];
 for(const [route,button,label] of dialogs)await check('open '+route+' '+button+' clears draft and choices on switch',async()=>{
   await goto(route);await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   if(label)await dialog.getByLabel(label).fill('A-T59 private draft');
   if(route==='transactions'||route==='recurring')await dialog.getByLabel(/^Account/).selectOption(fixtures.a.cash.id);
   if(route==='budgets')await dialog.getByLabel(/^Budget amount|^Amount/).fill('111.11');
   await switchUser('b');await page.waitForTimeout(100);await privateAbsent();await page.waitForTimeout(500);await privateAbsent();
   await switchUser('a');await page.waitForTimeout(500);
 });
 for(const route of ['dashboard','transactions','analytics','settings'])await check('held A response released after B switch '+route,async()=>{
   await goto(route);let release,seen;const held=new Promise(r=>release=r),received=new Promise(r=>seen=r);let intercepted=false;
   const handler=async interceptedRoute=>{
     if(!intercepted&&interceptedRoute.request().method()==='GET'&&interceptedRoute.request().headers().authorization==='Bearer '+sessions.a.access_token){
       intercepted=true;const response=await interceptedRoute.fetch();seen();await held;
       await interceptedRoute.fulfill({response}).catch(()=>{});
     }else await interceptedRoute.continue();
   };
   await context.route(api+'/api/v2/**',handler);
   await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Refresh ')&&!b.disabled);if(!button)throw Error('No refresh trigger');button.click();});
   await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('No A response intercepted')),10000))]);
   await switchUser('b');await page.waitForTimeout(100);await privateAbsent();release();await page.waitForTimeout(750);await privateAbsent();
   await context.unroute(api+'/api/v2/**',handler);await switchUser('a');await page.waitForTimeout(500);
 });
 await check('foreign account deep link never renders foreign name',async()=>{await switchUser('b');await page.waitForTimeout(500);await goto('accounts/'+fixtures.a.cash.id);await privateAbsent();assert.ok((await page.locator('body').innerText()).includes('unavailable')||(await page.locator('body').innerText()).includes('not found'));});
 await check('API 401 clears private content during redirect',async()=>{await switchUser('a');await page.waitForTimeout(500);await goto('dashboard');await fetch(api+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'auth-error'})});await page.getByRole('button',{name:/Refresh dashboard/}).click();await page.waitForURL('**/v2/login?**');assert.equal(await page.locator('#v2-main').count(),0);await privateAbsent();});
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(output,'session-security.json'),JSON.stringify({checks,count:checks.length,uncaught:errors,remoteTouched:false},null,2)+'\n');
}finally{await fetch(api+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'normal'})}).catch(()=>{});await browser.close();}
