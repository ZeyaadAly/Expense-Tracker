// Browser -> T10 -> real local T36/JWT -> limited-role disposable PostgreSQL.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
const api='http://127.0.0.1:4000',origin='http://localhost:3000';
const sessions={a:await(await fetch(api+'/test/session/a')).json(),b:await(await fetch(api+'/test/session/b')).json()};
const targets=await(await fetch('http://127.0.0.1:9224/json/version')).json();
const ws=new WebSocket(targets.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0,session,checks=0,audits=0;const pending=new Map();
ws.onmessage=({data})=>{const message=JSON.parse(data),wait=pending.get(message.id);if(wait){pending.delete(message.id);if(message.error)wait.reject(Error(JSON.stringify(message.error)));else wait.resolve(message.result);}};
function call(method,params={},attach=true){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(attach&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const value=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description??'Browser evaluation failed');return value.result.value;}
async function until(expression){for(let i=0;i<160;i++){if(await evaluate(`document.body && (${expression})`))return;await pause(100);}throw Error('Timed out: '+expression);}
async function check(expression){assert.equal(await evaluate(expression),true,expression);checks++;}
async function post(path,body){const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body??{})});assert.equal(response.status,200);checks++;return response.json();}
const mode=value=>post('/test/mode',{mode:value});
async function click(text){await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`);await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length);b.focus();b.click();})()`);}
async function navigate(path='/v2/budgets'){await call('Page.navigate',{url:origin+path});await until(`!!document.querySelector('#v2-main')`);}
async function ready(){await until(`document.body.innerText.includes('Budgets are up to date for')`);}
async function audit(label){await pause(200);const violations=await evaluate(`(async()=>{if(!window.axe){${readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')}}return (await window.axe.run(document.querySelector('#v2-main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})()`);assert.deepEqual(violations,[],label);audits++;await check('document.documentElement.scrollWidth<=innerWidth');}
async function widths(label){for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});await audit(label+' '+width);const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(new URL(`../../.tmp-v2-t44/${label}-${width}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}}
const money=value=>{const negative=value.startsWith('-'),[whole,fraction]=value.replace(/^-/,'').split('.');return (negative?'−':'')+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction;};
const inject=`(()=>{
  const sessions=${JSON.stringify(sessions)};window.__t37={sessions,calls:[],errors:[]};
  const who=sessionStorage.getItem('t37-user')||'a';localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(sessions[who]));
  window.addEventListener('error',event=>window.__t37.errors.push(event.message));
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url||input.toString());
    if(url.hostname==='t37-fixture.supabase.co')return Response.json(url.pathname.endsWith('/logout')?{}:url.pathname.endsWith('/user')?sessions[sessionStorage.getItem('t37-user')||'a'].user:sessions[sessionStorage.getItem('t37-user')||'a']);
    if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('External network disabled');
    if(url.pathname.startsWith('/api/'))window.__t37.calls.push({path:url.pathname,query:url.search,method:options.method||'GET'});
    return original(input,options);
  };
})();`;
mkdirSync(new URL('../../.tmp-v2-t44/',import.meta.url),{recursive:true});
async function fill(label,value){await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}));const input=document.getElementById(l.htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function selectCategory(value){await evaluate(`(()=>{const s=document.querySelector('dialog select');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function month(value){await fill('Budget month',value);await ready();}
async function dialogReady(){await until(`!!document.querySelector('dialog[open]')`);}
async function closed(){await until(`!document.querySelector('dialog[open]')`);}
async function refresh(){await click('Refresh budgets');await ready();}
async function rowAction(id,action){await evaluate(`(()=>{const row=document.querySelector('[data-budget-id="${id}"]');const b=[...row.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(action)}));b.focus();b.click();})()`);await dialogReady();}
async function add(categoryId,amount,threshold='90'){
  await click('Add budget');await dialogReady();await until(`!!document.querySelector('dialog select')&&!document.querySelector('dialog select').disabled`);await selectCategory(categoryId);await fill('Budget amount',amount);await fill('Alert threshold',threshold);await click('Save budget');await closed();await ready();return compare();
}
async function compare(user='a'){
  const value=await evaluate(`document.querySelector('input[type=month]').value`);const [year,month]=value.split('-');
  const r=await fetch(api+'/api/v2/budgets?year='+year+'&month='+String(Number(month)),{headers:{Authorization:'Bearer '+sessions[user].access_token}});assert.equal(r.status,200);const rows=(await r.json()).data;
  const dom=await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-budget-id]')].map(e=>[e.dataset.budgetId,{text:e.innerText,progress:e.querySelector('[role=progressbar]').getAttribute('aria-valuetext'),now:e.querySelector('[role=progressbar]').getAttribute('aria-valuenow')}]))`);
  assert.deepEqual(Object.keys(dom).sort(),rows.map(b=>b.id).sort());checks++;
  for(const b of rows){const e=dom[b.id];for(const text of [b.categoryName,money(b.amount),money(b.spent),money(b.remaining),b.percentUsed+'%',String(b.alertThresholdPercent)+'%',b.status==='near_limit'?'Near limit':b.status==='exceeded'?'Over budget':'Within budget']){assert.ok(e.text.includes(text),JSON.stringify({text,row:e.text}));checks++;}assert.equal(e.progress,b.percentUsed+'% used');assert.ok(Number(e.now)>=0&&Number(e.now)<=100);checks+=2;}
  return rows;
}
async function expense(categoryId,amount,extra={}){return post('/test/expense',{categoryId,amount,...extra});}
try{
  for(const t of (await call('Target.getTargets',{},false)).targetInfos)if(t.type==='page'&&t.url.startsWith(origin))await call('Target.closeTarget',{targetId:t.targetId},false);
  const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
  await mode('slow');await call('Page.navigate',{url:origin+'/v2/budgets'});await until(`document.body.innerText.includes('Loading your budgets')`);await check(`!document.querySelector('.v2-money')`);await mode('normal');await ready();await compare();await widths('empty');
  await post('/test/seed/accounts');const setup=await post('/test/categories');const f=setup.fixture;const food='c1200000-0000-4000-8000-000000000004';
  await month('2026-10');await click('Add budget');await dialogReady();await until(`!!document.querySelector('dialog select')&&!document.querySelector('dialog select').disabled`);await check(`![...document.querySelectorAll('dialog option')].some(o=>/Private income only|Archived new choice|B private/.test(o.textContent))`);
  await click('Save budget');await until(`document.body.innerText.includes('Choose an active expense category')`);await check(`document.activeElement.tagName==='SELECT'`);await audit('create-validation');await click('Cancel');await closed();
  await add(food,'100.00');let rows=await add(f.shared,'100.00','75');const foodId=rows.find(b=>b.categoryId===food).id,sharedId=rows.find(b=>b.categoryId===f.shared).id;
  await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await selectCategory(food);await fill('Budget amount','100.00');await click('Save budget');await until(`document.body.innerText.includes('already exists')`);await check(`document.querySelector('dialog input[id$="amount"]').value==='100.00'`);await audit('duplicate');await click('Cancel');await closed();
  let t=await expense(food,'89.99');await refresh();await compare();t=await post('/test/edit-expense',{id:t.id,amount:'90.00'});await refresh();assert.equal((await compare()).find(b=>b.id===foodId).status,'near_limit');checks++;
  t=await post('/test/edit-expense',{id:t.id,amount:'100.00'});await refresh();await compare();await check(`document.querySelector('[data-budget-id="${foodId}"]').innerText.includes('Near limit')&&!document.querySelector('[data-budget-id="${foodId}"]').innerText.includes('Over budget')`);
  t=await post('/test/edit-expense',{id:t.id,amount:'120.00'});await refresh();await compare();await widths('exceeded');
  await expense(f.shared,'80.00');await refresh();assert.equal((await compare()).find(b=>b.id===sharedId).status,'near_limit');checks++;
  await rowAction(sharedId,'Edit');await until(`!!document.querySelector('dialog input[id$="amount"]')`);await check(`!document.querySelector('dialog select')&&!document.querySelector('dialog input[type=month]')`);await fill('Budget amount','200.00');await fill('Alert threshold','90');await click('Save budget');await closed();await ready();await compare();
  const before=(await compare()).find(b=>b.id===sharedId);await post('/test/seed/transfer');await expense(f.shared,'999999999.99',{type:'income'});await refresh();assert.deepEqual((await compare()).find(b=>b.id===sharedId),before);checks++;
  const first=await post('/test/generated-expense');assert.equal(first.posted,1);checks++;await refresh();const generated=(await compare()).find(b=>b.id===sharedId);assert.equal(generated.spent,'90.00');checks++;assert.equal((await post('/test/generated-expense')).posted,0);checks++;await refresh();assert.deepEqual((await compare()).find(b=>b.id===sharedId),generated);checks++;
  // Category/month moves and deletion update both original and destination views.
  t=await post('/test/edit-expense',{id:t.id,categoryId:f.shared});await refresh();await compare();t=await post('/test/edit-expense',{id:t.id,date:'2026-09-30'});await refresh();await compare();await month('2026-09');await add(f.shared,'100.00');await compare();await post('/test/remove-expense',{id:t.id});await refresh();await compare();await month('2026-10');
  await add(f.historical,'0.01');await expense(f.historical,'999999999.99');await post('/test/archive-category',{categoryId:f.historical});await refresh();rows=await compare();const historicalId=rows.find(b=>b.categoryId===f.historical).id;await check(`document.querySelector('[data-budget-id="${historicalId}"]').innerText.includes('Archived category')`);await widths('stress');
  await rowAction(historicalId,'Edit');await until(`!!document.querySelector('dialog input[id$="amount"]')`);await fill('Budget amount','999999999.99');await fill('Alert threshold','100');await click('Save budget');await closed();await ready();await compare();
  await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await check(`![...document.querySelectorAll('dialog option')].some(o=>o.value===${JSON.stringify(f.historical)})`);await click('Cancel');await closed();
  // Actual committed response loss for each mutation; inspection stays GET-only.
  await month('2026-11');await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await selectCategory(food);await fill('Budget amount','50.00');await mode('lost-write');await click('Save budget');await until(`document.body.innerText.includes('could not confirm this change')`);await check(`document.querySelector('dialog button[type=submit]').disabled`);await mode('normal');await click('Inspect current budgets');await until(`document.body.innerText.includes('Latest confirmed server state')`);await audit('uncertain-create');await click('Cancel');await closed();await refresh();rows=await compare();const uncertainId=rows.find(b=>b.categoryId===food).id;
  await rowAction(uncertainId,'Edit');await until(`!!document.querySelector('dialog input[id$="amount"]')`);await fill('Budget amount','60.00');await mode('lost-write');await click('Save budget');await until(`document.body.innerText.includes('could not confirm this change')`);await mode('normal');await click('Inspect current budgets');await until(`document.body.innerText.includes('Latest confirmed server state')`);await check(`document.querySelector('dialog input[id$="amount"]').value==='60.00'`);await click('Cancel');await closed();await refresh();await compare();
  await rowAction(uncertainId,'Delete');await mode('lost-write');await click('Delete budget');await until(`document.body.innerText.includes('could not confirm this change')`);await mode('normal');await click('Inspect current budgets');await until(`document.body.innerText.includes('No matching budget is currently available')`);await click('Cancel');await closed();await refresh();await compare();
  await mode('saved-stale');await addStale();
  async function addStale(){await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await selectCategory(food);await fill('Budget amount','40.00');await click('Save budget');await closed();await until(`document.body.innerText.includes('Retry only the GET refresh')`);await check(`document.body.innerText.includes('Budget saved.')`);await mode('normal');await click('Retry this section');await ready();await compare();}
  // Pending write cannot double-submit or close; confirmed delete restores usable focus.
  await mode('slow-write');rows=await compare();await rowAction(rows[0].id,'Edit');await until(`!!document.querySelector('dialog input[id$="amount"]')`);await fill('Budget amount','41.00');await click('Save budget');await until(`document.querySelector('dialog button[type=submit]').disabled`);await check(`[...document.querySelectorAll('dialog button')].filter(b=>b.textContent==='Cancel').every(b=>b.disabled)`);await closed();await mode('normal');await ready();await compare();
  await rowAction(rows[0].id,'Delete');await audit('delete-confirm');await click('Delete budget');await closed();await ready();await compare();await check(`document.activeElement.tagName==='BUTTON'`);
  await month('9999-12');await add(food,'1.00');await compare();await month('1900-01');await compare();await month('2026-10');await compare();
  await mode('read-error');await monthFailed('2026-09');await widths('stale');await mode('normal');await click('Retry this section');await ready();await compare();
  async function monthFailed(value){await fill('Budget month',value);await until(`document.body.innerText.includes('Budget refresh failed')`);}
  await mode('read-error');await navigate();await until(`document.body.innerText.includes('Budgets unavailable')`);await check(`!document.querySelector('.v2-money')`);await widths('error');await mode('normal');await click('Retry this section');await ready();await compare();
  await mode('not-found');await rowAction(foodId,'Edit');await until(`document.body.innerText.includes('Budget unavailable')`);await audit('resource-404');await mode('normal');await evaluate(`document.querySelector('dialog button[aria-label^="Close"]').click()`);await closed();
  await navigate();await ready();await compare();await mode('slow');await fill('Budget month','2026-09');await fill('Budget month','2026-11');await mode('normal');await fill('Budget month','2026-10');await ready();await pause(1600);await compare();
  await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await fill('Budget amount','123.45');
  await evaluate(`(()=>{const next=window.__t37.sessions.b;sessionStorage.setItem('t37-user','b');localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(next));const c=new BroadcastChannel('sb-t37-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>c.close(),50);})()`);
  await until(`!document.querySelector('dialog[open]')&&!document.querySelector('[data-budget-id]')`);await ready();await compare('b');await widths('user-b');await click('Add budget');await dialogReady();await until(`!document.querySelector('dialog select').disabled`);await check(`!document.querySelector('dialog input[id$="amount"]').value&&![...document.querySelectorAll('dialog option')].some(o=>o.value===${JSON.stringify(f.shared)})`);await click('Cancel');await closed();
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await audit('reduced-motion');await evaluate(`document.querySelector('input[type=month]').focus()`);await check(`document.activeElement.type==='month'`);
  await check(`window.__t37.errors.length===0`);await mode('auth-error');await refreshAuth();async function refreshAuth(){await click('Refresh budgets');await until(`location.pathname==='/v2/login'`);}await check(`!document.querySelector('.v2-money')`);await mode('normal');
  const writes=await(await fetch(api+'/test/calls')).json(),writeCounts={POST:0,PUT:0,DELETE:0};for(const c of writes)if(c.budgetWrite)writeCounts[c.budgetWrite]++;assert.deepEqual(writeCounts,{POST:8,PUT:4,DELETE:2});
  const result={writeCounts,task:'T44',checks,axeAudits:audits,axeViolations:0,widths:[360,768,1440],realJwt:true,realDatabase:true,uncertainCreateUpdateDelete:true,allMutationRefreshesGetOnly:true,userSwitch:true,remoteTouched:false};writeFileSync(new URL('../../.tmp-v2-t44/browser-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}
