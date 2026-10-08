/* global document,window,localStorage */
// Run after verify-t25-browser against the same synthetic local fixture.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {URL} from 'node:url';
import process from 'node:process';
const {chromium}=await import('../../.tmp-v2-t20/node_modules/playwright/index.mjs');
const api='http://127.0.0.1:4000',fetch=globalThis.fetch,results=[];
const session=await(await fetch(api+'/test/session/a')).json(),browser=await chromium.launch(),page=await browser.newPage({viewport:{width:360,height:1000}}),errors=[],v1Headers=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(request.url().startsWith(api+'/api/v1/'))v1Headers.push(request.headers());});
const button=name=>page.getByRole('button',{name,exact:true});
async function ready(){await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent==='Refresh transactions');return b&&!b.disabled;});}
const mode=async mode=>{await fetch(api+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});};
async function search(q){await page.getByRole('searchbox',{name:'Search transactions'}).fill(q);await button('Search').click();await ready();}
const rows=()=>page.locator('.v2-ledger-mobile article h3').allTextContents();
async function audit(name){await page.waitForTimeout(200);await page.addScriptTag({content:readFileSync(new URL('../../.tmp-v2-t20/node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id);});assert.deepEqual(violations,[],name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);results.push(name);}
try {
  await page.goto('http://localhost:3000/v2/login');await page.evaluate(s=>localStorage.setItem('sb-t19-auth-auth-token',JSON.stringify(s)),session);await page.goto('http://localhost:3000/v2/transactions');await ready();
  const first=await rows();await button('Next').click();await ready();const second=await rows();assert.ok(second.length);assert.ok(second.every(d=>!first.includes(d)));assert.equal(await button('Previous').evaluate(n=>n===document.activeElement),true);await audit('mobile Next and focus after terminal page');
  await button('Previous').click();await ready();assert.deepEqual(await rows(),first);assert.equal(await button('Next').evaluate(n=>n===document.activeElement),true);await audit('mobile Previous and focus on first page');
  await button('Next').click();await ready();await button('Filters').click();const drawer=page.getByRole('dialog');await drawer.getByLabel('Type',{exact:true}).selectOption('income');await ready();await button('Done').click();assert.equal(await button('Previous').isDisabled(),true);assert.equal((await rows()).length,0);assert.equal(await page.getByRole('heading',{name:'No transactions match these filters.',exact:true}).count(),1);await audit('mobile real filter resets cursor scope');await button('Clear filters').first().click();await ready();
  const choices=await(await fetch(api+'/test/choices')).json();await button('Filters').click();await drawer.getByLabel('Account',{exact:true}).selectOption(choices.a.bank.id);await drawer.getByLabel('Category',{exact:true}).selectOption('c1200000-0000-4000-8000-000000000004');await ready();await button('Done').click();assert.deepEqual(await rows(),['Corrected archived history']);await audit('mobile account and category composition');await button('Clear filters').click();await ready();
  await button('Next').click();await ready();await search('Uncertain');assert.equal(await button('Previous').isDisabled(),true);assert.deepEqual(await rows(),['Uncertain updated posting']);results.push('submitted search resets page history');await search('');
  await mode('slow');await page.getByRole('searchbox',{name:'Search transactions'}).fill('slow');await button('Search').click();await page.waitForTimeout(100);await page.getByRole('searchbox',{name:'Search transactions'}).fill('Uncertain');await button('Search').click();await ready();await page.waitForTimeout(1700);assert.deepEqual(await rows(),['Uncertain updated posting']);await mode('normal');results.push('overlapping stale browser read suppressed');
  await page.goto('http://localhost:3000/');await page.waitForTimeout(600);const v1=await page.request.get(api+'/api/v1/transactions');assert.equal(v1.status(),200);assert.ok(v1Headers.length>0);assert.ok(v1Headers.every(headers=>!headers.authorization));results.push('V1 public page and compatibility reads stay available without V2 Authorization');
  assert.deepEqual(errors,[]);results.push('no focused browser runtime errors');
  writeFileSync(new URL('../../docs/v2/assets/t25/focused-results.json',import.meta.url),JSON.stringify({status:'passed',checks:results.length,results,realApi:true,realPostgres:true,remoteTouched:false},null,2));process.stdout.write('T25 focused checks passed: '+results.length+'\n');
}finally{await mode('normal');await browser.close();}
