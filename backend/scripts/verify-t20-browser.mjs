// Local synthetic browser acceptance. Requires the guarded T19 disposable fixture API.
/* global document, innerWidth, window, localStorage, BroadcastChannel */
import assert from 'node:assert/strict';
import process from 'node:process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
const fetch=globalThis.fetch;
const {chromium}=await import(process.env.T20_PLAYWRIGHT_MODULE||'../../.tmp-v2-t20/node_modules/playwright/index.mjs');
const axe=readFileSync(process.env.T20_AXE_PATH||new URL('../../.tmp-v2-t20/node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
const root=new URL('../../docs/v2/assets/t20/',import.meta.url);mkdirSync(root,{recursive:true});
const results=[];
const api='http://127.0.0.1:4000';
const session=async user=>await(await fetch(api+'/test/session/'+user)).json();
const a=await session('a'),b=await session('b');
async function request(path,method='GET',body,token=a.access_token) {
  const response=await fetch(api+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function mode(value){await fetch(api+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:value})});}
const create=async(name,type,openingBalance)=>(await request('/accounts','POST',{name,type,openingBalance,currency:'EGP'})).body.data;
const bank=await create('National Bank Savings and Emergency Reserve Account T20','bank','999999999.99');
const debt=await create('T20 Card debt','credit_card','123.45'),credit=await create('T20 Card credit','credit_card','-250.00');
const negative=await create('T20 Negative asset','cash','-999999999.99');
assert.equal((await fetch(api+'/test/stress',{method:'POST'})).status,200);
const expected=(await request('/accounts/'+bank.id)).body.data;
const list=(await request('/accounts')).body.data;assert.equal(list.find(row=>row.id===bank.id).currentBalance,expected.currentBalance);results.push('real list/detail balance equality');
const browser=await chromium.launch({executablePath:process.env.T20_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const consoleErrors=[];page.on('pageerror',error=>consoleErrors.push(error.message));
async function check(name,callback){await callback();results.push(name);process.stdout.write('PASS '+name+'\n');}
const detail=async id=>{await page.goto('http://localhost:3000/v2/accounts/'+id);await page.getByRole('heading',{name:'Financial summary',exact:true}).waitFor();};
const button=name=>page.getByRole('button',{name,exact:true});
const dialog=()=>page.getByRole('dialog');
const overflow=async()=>await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('[role=dialog]')].every(node=>node.scrollWidth<=node.clientWidth));
async function audit(name){await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],name);results.push(name+' axe zero violations');}
try {
  await page.goto('http://localhost:3000/v2/accounts/'+bank.id);
  await check('unauthenticated detail uses T08 sign-in boundary',async()=>{await page.waitForURL('**/v2/login?**');assert.equal(await page.getByRole('heading',{name:'Financial summary',exact:true}).count(),0);});
  await page.evaluate(value=>localStorage.setItem('sb-t19-auth-auth-token',JSON.stringify(value)),a);
  await detail(bank.id);
  await check('real account summary and metadata',async()=>{assert.equal(await page.getByRole('heading',{level:1}).innerText(),bank.name);assert.ok((await page.locator('.account-detail').innerText()).replaceAll(',','').includes(expected.currentBalance));assert.ok((await page.locator('.account-detail').innerText()).includes('0.01'));});
  for(const width of [360,768,1440]) {
    await page.setViewportSize({width,height:1000});await detail(bank.id);
    await check('detail no horizontal overflow '+width,async()=>assert.equal(await overflow(),true));await audit('detail '+width);
    await page.screenshot({path:fileURLToPath(new URL('detail-'+width+'.png',root)),fullPage:true});
    await button('Edit account').click();await dialog().waitFor();await audit('edit '+width);
    await check('locked opening and asset/card conversion '+width,async()=>{assert.equal(await dialog().getByLabel(/^Opening balance/).isDisabled(),true);assert.equal(await page.locator('select option[value=credit_card]').isDisabled(),true);assert.equal(await overflow(),true);});
    await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
    await check('edit dialog focus return '+width,async()=>assert.equal(await button('Edit account').evaluate(node=>node===document.activeElement),true));
    await button('Archive account').click();await dialog().waitFor();await audit('archive '+width);assert.equal(await overflow(),true);await button('Cancel').click();
    for(const row of [debt,credit,negative]){await detail(row.id);await check(row.name+' readable/no overflow '+width,async()=>{assert.equal(await overflow(),true);const text=await page.locator('.account-detail').innerText();assert.ok(text.replaceAll(',','').replaceAll('\u2212','-').includes(row.currentBalance));if(row.type==='credit_card')assert.ok(text.includes(row===debt?'Amount owed':'Credit / overpayment'));});}
  }
  await detail(bank.id);await button('Edit account').click();await dialog().getByLabel(/^Account name/).fill('T20 Renamed account');await button('Save account').click();await dialog().waitFor({state:'hidden'});
  await check('real PUT edit refresh',async()=>assert.equal(await page.getByRole('heading',{level:1}).innerText(),'T20 Renamed account'));
  for(const failure of ['mutation-503','locked']) {
    await mode(failure);await button('Edit account').click();await dialog().getByLabel(/^Account name/).fill('Retained '+failure);await button('Save account').click();await page.getByText(failure==='locked'?'This account could not be changed. Its name may already be used, or posted activity may have locked its opening balance and credit-card conversion.':'The service is temporarily unavailable. Please try again.',{exact:true}).waitFor({timeout:5000}).catch(async()=>{assert.equal(await dialog().count(),1);});
    await check(failure+' draft retained',async()=>assert.equal(await dialog().getByLabel(/^Account name/).inputValue(),'Retained '+failure));await button('Cancel').click();await mode('normal');
  }
  await button('Archive account').click();await dialog().waitFor();await dialog().getByRole('button',{name:'Archive account',exact:true}).click();await dialog().waitFor({state:'hidden'});await button('Restore account').waitFor();
  await check('archive remains readable and pauses linked schedules',async()=>{assert.ok((await page.locator('.account-detail').innerText()).replaceAll(',','').replaceAll('\u2212','-').includes(expected.currentBalance));const state=await(await fetch(api+'/test/state')).json();assert.equal(state.recurring[0].status,'paused');});
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});await audit('archived '+width);assert.equal(await overflow(),true);}
  await button('Restore account').click();await dialog().waitFor();await dialog().getByRole('button',{name:'Restore account',exact:true}).click();await dialog().waitFor({state:'hidden'});await button('Archive account').waitFor();await page.reload();await page.getByRole('heading',{name:'Financial summary',exact:true}).waitFor();
  await check('restore and reload persist; schedules stay paused',async()=>{assert.equal(await page.getByRole('heading',{level:1}).innerText(),'T20 Renamed account');const state=await(await fetch(api+'/test/state')).json();assert.equal(state.recurring[0].status,'paused');});
  await page.route('**/api/v2/accounts/**',route=>route.abort());await button('Refresh account').click();await page.getByText('Account could not refresh',{exact:true}).waitFor();
  await check('actual browser network failure retains stale data',async()=>assert.ok((await page.locator('.account-detail').innerText()).replaceAll(',','').includes(expected.currentBalance)));
  await page.unroute('**/api/v2/accounts/**');await button('Refresh account').click();await page.getByText('Account could not refresh',{exact:true}).waitFor({state:'hidden'});results.push('network recovery refresh succeeds');
  await mode('read-error');await button('Refresh account').click();await page.getByText('Account could not refresh',{exact:true}).waitFor();await check('service failure retains stale data',async()=>assert.ok((await page.locator('.account-detail').innerText()).replaceAll(',','').includes(expected.currentBalance)));
  await page.reload();await page.getByText('Account could not refresh',{exact:true}).waitFor();await check('initial failure has no invented zero',async()=>assert.equal(await page.getByRole('heading',{name:'Financial summary',exact:true}).count(),0));await mode('normal');await detail(bank.id);
  await mode('slow');await page.evaluate(value=>{localStorage.setItem('sb-t19-auth-auth-token',JSON.stringify(value));const channel=new BroadcastChannel('sb-t19-auth-auth-token');channel.postMessage({event:'SIGNED_IN',session:value});channel.close();},b);await page.waitForTimeout(300);
  await check('A to B switch removes A detail during pending read',async()=>assert.equal(await page.getByRole('heading',{name:'T20 Renamed account',exact:true}).count(),0));
  await page.getByRole('heading',{name:'Account not found',exact:true}).first().waitFor();await mode('normal');await page.reload();await page.getByRole('heading',{name:'Account not found',exact:true}).first().waitFor();
  await check('B direct A URL returns generic not found',async()=>{assert.equal((await request('/accounts/'+bank.id,'GET',undefined,b.access_token)).status,404);assert.equal((await request('/accounts/'+bank.id+'/summary','GET',undefined,b.access_token)).status,404);assert.ok(!(await page.locator('body').innerText()).includes('T20 Renamed account'));});
  await page.goto('http://localhost:3000/v2/accounts/00000000-0000-4000-8000-000000000000');await page.getByRole('heading',{name:'Account not found',exact:true}).first().waitFor();await audit('not found');
  assert.deepEqual(consoleErrors,[]);results.push('no browser runtime errors');
  writeFileSync(new URL('browser-results.json',root),JSON.stringify({status:'passed',checks:results.length,results,realApi:true,realPostgres:true,syntheticUsers:true,widths:[360,768,1440],remoteTouched:false},null,2));
  process.stdout.write('T20 browser checks passed: '+results.length+'\n');
} finally {await mode('normal');await browser.close();}
