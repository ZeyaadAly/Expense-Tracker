/* global document,window,innerWidth,localStorage */
// Complements the main driver on its retained synthetic database.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {URL} from 'node:url';
import process from 'node:process';
const fetch=globalThis.fetch,{chromium}=await import('../../.tmp-v2-t20/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.T28_CHROME_EXE??'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage({viewport:{width:360,height:1000},reducedMotion:'reduce'}),results=[];
const session=await(await fetch('http://127.0.0.1:4000/test/session/a')).json();
const button=name=>page.getByRole('button',{name,exact:true}),dialog=()=>page.getByRole('dialog');
async function ready(){await page.waitForFunction(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent==='Refresh transfers');return n&&!n.disabled;});}
async function audit(name){await page.addScriptTag({content:readFileSync(new URL('../../.tmp-v2-t20/node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id);});assert.deepEqual(violations,[],name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('dialog[open]')].every(n=>n.scrollWidth<=n.clientWidth)),true);results.push(name);}
try {
  const choices=(await(await fetch('http://127.0.0.1:4000/api/v2/accounts',{headers:{Authorization:'Bearer '+session.access_token}})).json()).data;
  const created=await fetch('http://127.0.0.1:4000/api/v2/transfers',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({sourceAccountId:choices[0].id,destinationAccountId:choices[1].id,amount:'0.10',date:'1900-01-01',description:'Focus target'})});assert.equal(created.status,201);
  await page.goto('http://localhost:3000/v2/login');await page.evaluate(s=>localStorage.setItem('sb-t19-auth-auth-token',JSON.stringify(s)),session);await page.goto('http://localhost:3000/v2/accounts');await ready();
  for(const width of [360,768,1440]){
    await page.setViewportSize({width,height:1000});await button('New transfer').click();await dialog().getByLabel(/^From account/).waitFor();await page.waitForFunction(()=>!document.querySelector('dialog select').disabled);
    await button('Cancel').focus();await page.keyboard.press('Tab');assert.equal(await button('Close New transfer').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await button('Cancel').evaluate(n=>n===document.activeElement),true);await audit('keyboard trap reduced motion '+width);await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});assert.equal(await button('New transfer').evaluate(n=>n===document.activeElement),true);
    await page.getByRole('button',{name:'Edit transfer Focus target',exact:true}).click();await dialog().getByLabel(/^From account/).waitFor();await page.waitForFunction(()=>!document.querySelector('dialog select').disabled);assert.equal(await dialog().getByLabel(/^Amount/).inputValue(),'0.10');await audit('edit draft '+width);await button('Review transfer').click();await audit('edit review '+width);await button('Cancel').click();await dialog().waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Delete transfer Focus target',exact:true}).click();await button('Delete transfer').click();await dialog().waitFor({state:'hidden'});await ready();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(n=>n.textContent==='Refresh transfers'&&n===document.activeElement));results.push('deleted trigger returns focus to surviving Refresh transfers');
  writeFileSync(new URL('../../docs/v2/assets/t28/focused-results.json',import.meta.url),JSON.stringify({status:'passed',checks:results.length,results,reducedMotion:true,realApi:true,realPostgres:true,remoteTouched:false},null,2));process.stdout.write('T28 focused checks passed: '+results.length+'\n');
}finally{await browser.close();}
