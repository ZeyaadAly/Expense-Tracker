// Browser -> T10 -> real local T45/JWT -> limited-role disposable PostgreSQL.
import assert from 'node:assert/strict';
import process from 'node:process';
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
async function navigate(path='/v2/goals'){await call('Page.navigate',{url:origin+path});await until(`!!document.querySelector('#v2-main')`);}
async function ready(){await until(`document.body.innerText.includes('Goals are up to date.')`);}
async function audit(label){await pause(200);const violations=await evaluate(`(async()=>{if(!window.axe){${readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')}}return (await window.axe.run(document.querySelector('#v2-main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})()`);assert.deepEqual(violations,[],label);audits++;await check('document.documentElement.scrollWidth<=innerWidth');}
async function widths(label){for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});await audit(label+' '+width);const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(new URL(`../../.tmp-v2-t46/${label}-${width}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}}
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
mkdirSync(new URL('../../.tmp-v2-t46/',import.meta.url),{recursive:true});
async function fill(label,value){await evaluate("(()=>{const l=[...document.querySelectorAll('dialog label')].find(l=>l.textContent.startsWith("+JSON.stringify(label)+"));const input=document.getElementById(l.htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+JSON.stringify(value)+");input.dispatchEvent(new Event('input',{bubbles:true}));})()");}
async function select(label,value){await evaluate("(()=>{const l=[...document.querySelectorAll('dialog label')].find(l=>l.textContent.startsWith("+JSON.stringify(label)+"));const input=document.getElementById(l.htmlFor);input.value="+JSON.stringify(value)+";input.dispatchEvent(new Event('change',{bubbles:true}));})()");}
async function fieldsReady(){await until("!!document.querySelector('dialog input')&&!!document.querySelector('dialog select')&&!document.querySelector('dialog select').disabled");}
async function closed(){await until("!document.querySelector('dialog[open]')");}
async function refresh(){await click('Refresh goals');await ready();}
async function rowAction(id,action){await evaluate("(()=>{const row=document.querySelector('[data-goal-id="+JSON.stringify(id)+"]');const b=[...row.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith("+JSON.stringify(action)+"));if(!b)throw Error('Action missing');b.focus();b.click();})()");await until("!!document.querySelector('dialog[open]')");}
async function compare(user='a'){
 const response=await fetch(api+'/api/v2/goals',{headers:{Authorization:'Bearer '+sessions[user].access_token}});assert.equal(response.status,200);const rows=(await response.json()).data;
 const dom=await evaluate("Object.fromEntries([...document.querySelectorAll('[data-goal-id]')].map(e=>[e.dataset.goalId,{text:e.innerText,progress:e.querySelector('[role=progressbar]').getAttribute('aria-valuetext'),now:e.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),actions:[...e.querySelectorAll('button')].map(b=>b.textContent.trim())}]))");
 assert.deepEqual(Object.keys(dom).sort(),rows.map(g=>g.id).sort());checks++;
 for(const g of rows){const e=dom[g.id];for(const text of [g.name,money(g.savedAmount),money(g.targetAmount),money(g.remainingAmount),g.percentComplete+'%',g.status[0].toUpperCase()+g.status.slice(1),'manually maintained']){assert.ok(e.text.includes(text),JSON.stringify({text,row:e.text}));checks++;}assert.equal(e.progress,g.percentComplete+'% saved; manual progress');assert.ok(Number(e.now)>=0&&Number(e.now)<=100);checks+=2;if(g.status==='archived'){assert.equal(e.actions.length,0);checks++;}}
 return rows;
}
async function add(name,target,saved='0.00',account=''){await click('Create goal');await fieldsReady();await fill('Goal name',name);await fill('Target amount',target);await fill('Saved amount',saved);await select('Linked account',account);await click('Save goal');await closed();await ready();return (await compare()).find(g=>g.name===name);}
async function edit(g,saved){await rowAction(g.id,'Edit');await fieldsReady();await fill('Saved amount',saved);await click('Save goal');await closed();await ready();return (await compare()).find(r=>r.id===g.id);}
async function lifecycle(g,action,confirm){await rowAction(g.id,action);await click(confirm);await closed();await ready();return (await compare()).find(r=>r.id===g.id);}
async function financial(){const response=await fetch(api+'/test/financial');assert.equal(response.status,200);return response.json();}
const rowExpr=g=>"document.querySelector('[data-goal-id="+JSON.stringify(g.id)+"]')";
if(process.env.T46_DIALOG_ONLY==='1'){
try{
 const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
 await mode('normal');await post('/test/accounts');await post('/test/stress');await navigate();await ready();const rows=await compare();await rowAction(rows.find(r=>r.name.startsWith('هدف')).id,'Edit');await fieldsReady();
 const bounds=[];
 for(const width of [360,768,1440]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});
  await call('Runtime.evaluate',{expression:"document.querySelector('dialog').scrollTop=0"});await pause(150);
  const b=await evaluate("(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:d.scrollWidth,client:d.clientWidth};})()");
  assert.ok(b.left>=0&&b.right<=b.width&&b.top>=0&&b.bottom<=b.height,JSON.stringify(b));assert.ok(b.scroll<=b.client,JSON.stringify(b));checks+=2;bounds.push({width,...b});await audit('dialog viewport '+width);
  const shot=await call('Page.captureScreenshot',{captureBeyondViewport:false});writeFileSync(new URL('../../.tmp-v2-t46/dialog-viewport-'+width+'.png',import.meta.url),Buffer.from(shot.data,'base64'));
 }
 await click('Cancel');await closed();await check("document.activeElement.textContent.trim().startsWith('Edit')");
 const result={checks,audits,violations:0,bounds};writeFileSync(new URL('../../.tmp-v2-t46/dialog-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}

}else{
try{
 for(const t of (await call('Target.getTargets',{},false)).targetInfos)if(t.type==='page'&&t.url.startsWith(origin))await call('Target.closeTarget',{targetId:t.targetId},false);
 const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
 await mode('slow');await call('Page.navigate',{url:origin+'/v2/goals'});await until("document.body.innerText.includes('Loading your goals')");await check("!document.querySelector('.v2-money')");await mode('normal');await ready();await compare();await widths('empty');
 const f=await post('/test/accounts');let baseline=await financial();
 await click('Create goal');await fieldsReady();await check("document.querySelector('dialog input[id$=savedAmount]').value==='0.00'");await check("![...document.querySelectorAll('dialog option')].some(o=>/Archived choice|B private/.test(o.textContent))");await click('Save goal');await until("document.body.innerText.includes('Enter 1 to 120')");await check("document.activeElement.id.endsWith('-name')");await audit('validation');await click('Cancel');await closed();
 const zero=await add('Zero savings goal','999999999.99');let g=await add('Laptop goal','0.30','0.00',f.bank.id);
 await check("!"+rowExpr(g)+".innerText.includes('Mark complete')");
 g=await edit(g,'0.10');assert.equal(g.percentComplete,'33.33');checks++;g=await edit(g,'0.30');assert.equal(g.status,'active');checks++;await widths('exact-target');
 g=await lifecycle(g,'Mark complete','Mark complete');assert.equal(g.status,'completed');checks++;
 g=await lifecycle(g,'Reopen','Reopen goal');assert.equal(g.status,'active');checks++;
 g=await edit(g,'0.40');assert.equal(g.percentComplete,'133.33');assert.equal(g.remainingAmount,'0.00');checks+=2;await widths('above-target');
 g=await lifecycle(g,'Mark complete','Mark complete');
 await rowAction(g.id,'Edit');await fieldsReady();await fill('Saved amount','0.10');await click('Save goal');await until("document.body.innerText.includes('Choose Active to reopen')");await check("document.activeElement.id.endsWith('-savedAmount')");await select('Goal status','active');await click('Save goal');await closed();await ready();g=(await compare()).find(r=>r.id===g.id);assert.equal(g.status,'active');checks++;
 assert.deepEqual(await financial(),baseline);checks++;
 const savedBefore=g;await post('/test/activity');await refresh();assert.deepEqual((await compare()).find(r=>r.id===g.id),savedBefore);checks++;baseline=await financial();
 await post('/test/archive-account');baseline=await financial();await refresh();await check(rowExpr(g)+".innerText.includes('A savings reference (Archived)')");
 await rowAction(g.id,'Edit');await fieldsReady();await check("document.querySelector('dialog select').value==="+JSON.stringify(f.bank.id));await fill('Goal name','Laptop historical reference');await click('Save goal');await closed();await ready();g=(await compare()).find(r=>r.id===g.id);assert.equal(g.linkedAccountId,f.bank.id);checks++;
 await click('Create goal');await fieldsReady();await check("![...document.querySelectorAll('dialog option')].some(o=>o.value==="+JSON.stringify(f.bank.id)+")");await click('Cancel');await closed();
 await rowAction(g.id,'Archive');await audit('archive-confirmation');await click('Archive goal');await closed();await ready();g=(await compare()).find(r=>r.id===g.id);assert.equal(g.status,'archived');checks++;assert.deepEqual(await financial(),baseline);checks++;
 await navigate();await ready();await compare();
 await post('/test/stress');await refresh();const stress=await compare(),rounded=stress.find(r=>r.name==='Rounded display below target');await check("!"+rowExpr(rounded)+".innerText.includes('Mark complete')");await widths('stress');await rowAction(stress.find(r=>r.name.startsWith('هدف')).id,'Edit');await fieldsReady();await widths('stress-dialog');await click('Cancel');await closed();
 await click('Create goal');await fieldsReady();await fill('Goal name','Server validation draft');await fill('Target amount','10.00');await mode('validation');await click('Save goal');await until("document.body.innerText.includes('Choose a different goal name')");await check("document.activeElement.id.endsWith('-name')&&document.activeElement.value==='Server validation draft'");await mode('normal');await click('Cancel');await closed();
 await click('Create goal');await fieldsReady();await fill('Goal name','Uncertain lifecycle');await fill('Target amount','0.30');await fill('Saved amount','0.30');await mode('lost-write');await click('Save goal');await until("document.body.innerText.includes('could not confirm this change')");await check("document.querySelector('dialog button[type=submit]').disabled");await mode('normal');await click('Inspect current goals');await until("document.body.innerText.includes('Latest confirmed server state')");await audit('uncertain-create');await click('Cancel');await closed();await refresh();let uncertain=(await compare()).find(r=>r.name==='Uncertain lifecycle');
 for(const [action,confirm]of [['Edit','Save goal'],['Mark complete','Mark complete'],['Reopen','Reopen goal'],['Archive','Archive goal']]){
  await rowAction(uncertain.id,action);if(action==='Edit'){await fieldsReady();await fill('Goal name','Uncertain lifecycle edited');}
  await mode('lost-write');await click(confirm);await until("document.body.innerText.includes('could not confirm this change')");await mode('normal');const before=(await(await fetch(api+'/test/calls')).json()).length;await click('Inspect current goals');await until("document.body.innerText.includes('Latest confirmed server state')");await pause(80);assert.equal((await(await fetch(api+'/test/calls')).json()).length,before);checks++;await click('Cancel');await closed();await refresh();uncertain=(await compare()).find(r=>r.id===uncertain.id);
 }
 await click('Create goal');await fieldsReady();await fill('Goal name','Confirmed stale goal');await fill('Target amount','10.00');await mode('saved-stale');await click('Save goal');await closed();await until("document.body.innerText.includes('Goal saved. The list could not refresh')");await audit('confirmed-stale');await mode('normal');await refresh();await compare();
 await mode('read-error');await click('Refresh goals');await until("document.body.innerText.includes('Goals unavailable')");await check("document.querySelectorAll('[data-goal-id]').length>0");await audit('retained-stale');await mode('normal');await click('Retry this section');await ready();await compare();
 await mode('not-found');await rowAction(zero.id,'Edit');await until("document.body.innerText.includes('Goal unavailable')");await audit('resource404');await evaluate("document.querySelector('dialog button[aria-label]').click()");await closed();await mode('normal');
 await click('Create goal');await fieldsReady();await fill('Goal name','Pending goal');await fill('Target amount','1.00');await mode('slow-write');await click('Save goal');await until("!!document.querySelector('dialog [aria-busy=true]')");await check("document.querySelector('dialog button[type=submit]').disabled&&[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Cancel').disabled");await closed();await mode('normal');await ready();await compare();
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await audit('reduced-motion');
 await mode('slow');await click('Refresh goals');await click('Create goal');await fieldsReady();await fill('Goal name','A private draft');
 await evaluate("(()=>{sessionStorage.setItem('t37-user','b');localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(window.__t37.sessions.b));const c=new BroadcastChannel('sb-t37-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:window.__t37.sessions.b});setTimeout(()=>c.close(),50);})()");
 await until("document.body.innerText.includes('No goals yet.')");await check("!document.querySelector('dialog')&&!document.body.innerText.includes('A private draft')&&!document.querySelector('[data-goal-id]')");await mode('normal');await ready();await compare('b');await widths('b-empty');
 await click('Create goal');await fieldsReady();await check("![...document.querySelectorAll('dialog option')].some(o=>/A savings|A second|Archived choice|حساب/.test(o.textContent))");await click('Cancel');await closed();
 const foreign=await fetch(api+'/api/v2/goals/'+g.id,{headers:{Authorization:'Bearer '+sessions.b.access_token}});assert.equal(foreign.status,404);checks++;
 await mode('read-error');await navigate();await until("document.body.innerText.includes('Goals unavailable')");await check("!document.querySelector('[data-goal-id]')");await audit('initial-error');await mode('normal');await click('Retry this section');await ready();
 await mode('auth-error');await click('Refresh goals');await until("location.pathname==='/v2/login'");await check("!document.querySelector('[data-goal-id]')");await mode('normal');
 const calls=await(await fetch(api+'/test/calls')).json();assert.ok(!calls.some(c=>c.path.endsWith('/reopen')||c.path.endsWith('/restore')||c.method==='DELETE'));checks++;
 await check("window.__t37.errors.length===0");
 assert.equal(calls.length,19);assert.equal(calls.filter(c=>c.method==='POST').length,11);assert.equal(calls.filter(c=>c.method==='PUT').length,8);checks+=3;const result={checks,audits,violations:0,widths:[360,768,1440],mutations:calls.length,methods:calls.reduce((s,c)=>(s[c.method]=(s[c.method]??0)+1,s),{}),manualProgress:true,metadataOnly:true,financialNonEffect:true,sessionIsolation:true,remoteTouched:false};
 writeFileSync(new URL('../../.tmp-v2-t46/browser-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{ws.close();}

}
