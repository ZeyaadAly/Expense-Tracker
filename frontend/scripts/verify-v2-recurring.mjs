// Real local browser -> T10 -> ES256/JWKS -> T29 -> limited-role PostgreSQL.
// Auth sessions and operational probes are synthetic, loopback-only test fixtures.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
const api='http://127.0.0.1:4000',origin='http://localhost:3000';
const sessions={a:await(await fetch(api+'/test/session/a')).json(),b:await(await fetch(api+'/test/session/b')).json()};
const context=await(await fetch(api+'/test/context')).json();
const targets=await(await fetch('http://127.0.0.1:9224/json/version')).json();
const ws=new WebSocket(targets.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0,session,checks=0,audits=0;const pending=new Map();
ws.onmessage=({data})=>{const message=JSON.parse(data),wait=pending.get(message.id);if(wait){pending.delete(message.id);if(message.error)wait.reject(Error(JSON.stringify(message.error)));else wait.resolve(message.result);}};
function call(method,params={},attach=true){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(attach&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const value=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description??'Browser evaluation failed');return value.result.value;}
async function until(expression){for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);}
async function check(expression){assert.equal(await evaluate(expression),true,expression);checks++;}
async function mode(value){await fetch(api+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:value})});}
async function click(text,scope='document'){
  await until(`Array.from((${scope})?.querySelectorAll('button')??[]).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`);
  await evaluate(`(()=>{const root=${scope};const button=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length);button.focus();button.click();})()`);
}
async function fill(name,value){await evaluate(`(()=>{const element=document.querySelector('dialog[open] [name="${name}"]');const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
const article=description=>`document.querySelector('article[aria-label=${JSON.stringify(description)}]')`;
async function navigate(path='/v2/recurring'){await call('Page.navigate',{url:origin+path});await until(`!!document.querySelector('#v2-main')`);}
async function save(){await click('Save recurring item',`document.querySelector('dialog[open]')`);await until(`!document.querySelector('dialog[open]')`);}
async function add({description,type='income',frequency='daily',startDate=context.today,amount='0.10',categoryId='c1200000-0000-4000-8000-000000000001'}){
  await click('Add recurring item');await until(`!!document.querySelector('dialog[open] [name="description"]')&&![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='Save recurring item').disabled`);
  for(const [name,value] of Object.entries({type,accountId:context.account.id,categoryId,amount,description,frequency,startDate}))await fill(name,value);
}
async function lifecycle(description,action){await click(action,article(description));await until(`!!document.querySelector('dialog[open] strong')`);await click(action+' schedule',`document.querySelector('dialog[open]')`);await until(`!document.querySelector('dialog[open]')`);}
async function audit(label){
  const violations=await evaluate(`(async()=>{if(!window.axe){${readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')}}return (await window.axe.run(document.querySelector('dialog[open]')||document.querySelector('#v2-main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})()`);
  assert.deepEqual(violations,[],label);audits++;
  await check('document.documentElement.scrollWidth<=innerWidth');
}
async function widths(label){for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===360});await audit(label+' '+width);const shot=await call('Page.captureScreenshot');writeFileSync(new URL(`../../.tmp-v2-t34/${label}-${width}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}}
const inject=`(()=>{
  const sessions=${JSON.stringify(sessions)};window.__t34={sessions,calls:[],errors:[]};
  const who=sessionStorage.getItem('t34-user')||'a';localStorage.setItem('sb-t34-fixture-auth-token',JSON.stringify(sessions[who]));
  window.addEventListener('error',event=>window.__t34.errors.push(event.message));
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url||input.toString());
    if(url.hostname==='t34-fixture.supabase.co')return Response.json(url.pathname.endsWith('/logout')?{}:url.pathname.endsWith('/user')?sessions[sessionStorage.getItem('t34-user')||'a'].user:sessions[sessionStorage.getItem('t34-user')||'a']);
    if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('External network disabled');
    if(url.pathname.startsWith('/api/'))window.__t34.calls.push({path:url.pathname,method:options.method||'GET'});
    return original(input,options);
  };
})();`;
mkdirSync(new URL('../../.tmp-v2-t34/',import.meta.url),{recursive:true});
try{
  const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
  await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
  await mode('slow');await call('Page.navigate',{url:origin+'/v2/recurring'});await until(`document.body.innerText.includes('Loading recurring items')`);await check(`!document.body.innerText.includes('Monthly Salary')`);await mode('normal');await until(`document.body.innerText.includes('No recurring items yet.')`);await widths('empty');
  await add({description:'Daily income',startDate:'2024-01-01'});await widths('create');
  await evaluate(`(()=>{const buttons=[...document.querySelectorAll('dialog[open] button:not(:disabled)')];buttons.at(-1).focus();})()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await check(`document.activeElement.getAttribute('aria-label')==='Close Add recurring item'`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await check(`document.activeElement.textContent.trim()==='Save recurring item'`);
  await mode('pending');await evaluate(`(()=>{const button=[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='Save recurring item');button.click();button.click();})()`);await until(`document.querySelector('dialog[open]')?.getAttribute('aria-busy')==='true'`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await check(`!!document.querySelector('dialog[open]')`);await audit('pending');await until(`!document.querySelector('dialog[open]')`);await mode('normal');await check(`!!${article('Daily income')}&&${article('Daily income')}.innerText.includes(${JSON.stringify(context.today)})`);
  await check(`document.activeElement.textContent.trim()==='Add recurring item'`);
  assert.equal((await(await fetch(api+'/test/calls')).json()).filter(c=>c.operation==='createRecurring').length,1);checks++;
  assert.equal((await(await fetch(api+'/test/state')).json()).transactions,0);checks++;
  await add({description:'Month end expense',type:'expense',frequency:'monthly',startDate:'2025-01-31',amount:'999999999.99',categoryId:context.custom});await save();
  await add({description:'Leap day income',frequency:'yearly',startDate:'2024-02-29',amount:'0.20'});await save();
  await check(`${article('Month end expense')}.innerText.includes('2026-10-31')&&${article('Leap day income')}.innerText.includes('2027-02-28')`);
  await widths('populated');
  const before=await(await fetch(api+'/test/state')).json();const daily=before.definitions.find(r=>r.description==='Daily income');
  const processed=await(await fetch(api+'/test/process',{method:'POST'})).json();assert.equal(processed.posted,1);checks++;
  await click('Refresh recurring items');await until(`${article('Daily income')}&&!${article('Daily income')}.innerText.includes(${JSON.stringify(context.today)})`);
  await click('Edit',article('Daily income'));await until(`!!document.querySelector('dialog[open] [name="description"]')`);await check(`document.querySelector('dialog[open] [name="amount"]').value==='0.10'`);await fill('amount','0.20');await widths('edit');await save();
  await lifecycle('Daily income','Pause');await check(`${article('Daily income')}.innerText.includes('Paused')&&${article('Daily income')}.innerText.includes('No future occurrence')`);await widths('paused');
  await lifecycle('Daily income','Resume');await check(`${article('Daily income')}.innerText.includes('Active')`);
  await click('Archive',article('Leap day income'));await until(`!!document.querySelector('dialog[open] strong')`);await widths('archive-confirmation');await click('Archive schedule',`document.querySelector('dialog[open]')`);await until(`!document.querySelector('dialog[open]')`);await check(`${article('Leap day income')}.querySelector('button')===null`);
  await navigate();await until(`!!${article('Leap day income')}`);await check(`${article('Leap day income')}.innerText.includes('Archived')`);
  // Filters go through real T29. No search or pagination added.
  await evaluate(`(()=>{const select=[...document.querySelectorAll('section[aria-label="Recurring filters"] select')][0];select.value='archived';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.body.innerText.includes('1 recurring items.')`);await check(`!${article('Daily income')}`);await click('Clear filters');await until(`!!${article('Daily income')}`);
  // Independent retained-stale reads and GET-only recovery.
  await mode('upcoming-error');await click('Refresh recurring items');await until(`document.body.innerText.includes('Upcoming occurrences could not refresh')`);await check(`!!${article('Daily income')}&&document.querySelector('.t34-timeline li')!==null`);await widths('upcoming-stale');await mode('normal');await click('Refresh recurring items');await until(`!document.body.innerText.includes('Upcoming occurrences could not refresh')`);
  await mode('list-error');await click('Refresh recurring items');await until(`document.body.innerText.includes('Recurring items could not refresh')`);await check(`!!${article('Daily income')}`);await mode('normal');await click('Refresh recurring items');await until(`!document.body.innerText.includes('Recurring items could not refresh')`);
  // Account archive auto-pauses; restore never resumes. Archived references remain readable.
  for(const parent of ['account','category']){
    await fetch(api+'/test/parents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent,status:'archived'})});await click('Refresh recurring items');await until(`${article('Month end expense')}.innerText.includes('Paused')`);
    await click('Resume',article('Month end expense'));await until(`!!document.querySelector('dialog[open] strong')`);await click('Resume schedule',`document.querySelector('dialog[open]')`);await until(`document.querySelector('dialog[open]').innerText.includes('archived')`);await widths(parent+'-resume-error');await click('Cancel',`document.querySelector('dialog[open]')`);
    await fetch(api+'/test/parents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent,status:'active'})});await click('Refresh recurring items');await until(`!document.body.innerText.includes('Loading recurring items')`);await check(`${article('Month end expense')}.innerText.includes('Paused')`);await lifecycle('Month end expense','Resume');
  }
  // Strict validation focus and draft preservation.
  await add({description:'Validation draft'});await fill('amount','1.230');await click('Save recurring item',`document.querySelector('dialog[open]')`);await until(`document.activeElement.name==='amount'`);await check(`document.querySelector('dialog[open] [name="description"]').value==='Validation draft'`);await audit('validation');await fill('amount','0.10');await mode('validation');await click('Save recurring item',`document.querySelector('dialog[open]')`);await until(`document.querySelector('dialog[open]').innerText.includes('Choose a different amount')`);await mode('normal');await click('Cancel',`document.querySelector('dialog[open]')`);
  // A committed mutation followed by a failed refresh remains a confirmed save.
  await add({description:'Saved refresh failure',frequency:'yearly',startDate:'2024-02-29'});await mode('saved-refresh-error');await save();await check(`document.body.innerText.includes('Saved, but recurring items could not refresh.')`);await mode('normal');await click('Refresh recurring items');await until(`!!${article('Saved refresh failure')}`);
  // Real committed POST with lost HTTP response. Inspection never resends it.
  await add({description:'Lost response item',frequency:'yearly',startDate:'2024-02-29'});await mode('uncertain');await click('Save recurring item',`document.querySelector('dialog[open]')`);await until(`document.querySelector('dialog[open]').innerText.includes('could not confirm')`);await check(`[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='Save recurring item').disabled`);await click('Refresh and inspect recurring items',`document.querySelector('dialog[open]')`);await until(`!!document.querySelector('section[aria-label="Latest saved recurring items"]')`);await check(`document.querySelector('section[aria-label="Latest saved recurring items"]').innerText.includes('Lost response item')`);await widths('uncertain-inspection');await click('Cancel',`document.querySelector('dialog[open]')`);
  const afterLost=await(await fetch(api+'/test/state')).json();assert.equal(afterLost.definitions.filter(r=>r.description==='Lost response item').length,1);checks++;
  // Stress content plus safe null nextOccurrence.
  await add({description:'Completed schedule',frequency:'monthly',startDate:'2024-01-31'});await fill('endDate','2024-02-29');await save();await check(`${article('Completed schedule')}.innerText.includes('Schedule complete')`);await widths('exhausted');
  await add({description:'x'.repeat(200),type:'expense',frequency:'monthly',startDate:'2024-01-31',amount:'999999999.99',categoryId:context.custom});await save();await widths('stress');
  await click('Pause',article('Month end expense'));await until(`!!document.querySelector('dialog[open] strong')`);await widths('pause-confirmation');await click('Cancel',`document.querySelector('dialog[open]')`);
  // Processor-generated row appears through the existing Transactions integration.
  await navigate('/v2/transactions');await until(`document.body.innerText.includes('Daily income')`);await check(`document.body.innerText.includes('Generated')`);
  await navigate();await until(`!!${article('Daily income')}`);
  // Session replacement with an A draft open unmounts every A-owned view and dialog.
  await click('Edit',article('Daily income'));await until(`!!document.querySelector('dialog[open] [name="description"]')`);await fill('description','A private unsaved draft');
  await evaluate(`(()=>{const next=window.__t34.sessions.b;sessionStorage.setItem('t34-user','b');localStorage.setItem('sb-t34-fixture-auth-token',JSON.stringify(next));const channel=new BroadcastChannel('sb-t34-fixture-auth-token');channel.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>channel.close(),50);})()`);
  await until(`document.body.innerText.includes('No recurring items yet.')`);await check(`!document.querySelector('dialog[open]')&&!document.body.innerText.includes('Daily income')&&!document.body.innerText.includes('A private unsaved draft')&&!document.body.innerText.includes('A cash')`);await widths('user-b-empty');
  const foreign=await evaluate(`(async()=>{const r=await fetch('${api}/api/v2/recurring/${daily.id}',{headers:{Authorization:'Bearer '+window.__t34.sessions.b.access_token}});return {status:r.status,body:await r.json()};})()`);assert.equal(foreign.status,404);assert.equal(foreign.body.error.code,'NOT_FOUND');checks++;
  await check(`!window.__t34.calls.some(c=>/internal|cron|process/.test(c.path))&&window.__t34.errors.length===0`);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await check(`matchMedia('(prefers-reduced-motion: reduce)').matches`);await audit('reduced-motion');
  const finalState=await(await fetch(api+'/test/state')).json();assert.equal(finalState.role,'expense_tracker_app');checks++;
  const result={task:'T34',checks,axeAudits:audits,axeViolations:0,widths:[360,768,1440],generatedTransactions:finalState.transactions,definitions:finalState.definitions.length,remoteTouched:false};writeFileSync(new URL('../../.tmp-v2-t34/browser-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}
