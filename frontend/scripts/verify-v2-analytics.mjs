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
async function navigate(path='/v2/analytics'){await call('Page.navigate',{url:origin+path});await until(`!!document.querySelector('#v2-main')`);}
async function ready(){await until(`document.body.innerText.includes('Analytics is up to date.')`);}
async function audit(label){const violations=await evaluate(`(async()=>{if(!window.axe){${readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')}}return (await window.axe.run(document.querySelector('#v2-main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})()`);assert.deepEqual(violations,[],label);audits++;await check('document.documentElement.scrollWidth<=innerWidth');}
async function widths(label){for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});await audit(label+' '+width);const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(new URL(`../../.tmp-v2-t40/${label}-${width}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}}
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
mkdirSync(new URL('../../.tmp-v2-t40/',import.meta.url),{recursive:true});
async function select(label,value){await evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(l=>l.textContent===${JSON.stringify(label)});const s=document.getElementById(label.htmlFor);s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function custom(from,to){await select('Analytics range','custom');await evaluate(`(()=>{const inputs=document.querySelectorAll('input[type=date]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;[${JSON.stringify(from)},${JSON.stringify(to)}].forEach((v,i)=>{set.call(inputs[i],v);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));});})()`);await click('Apply range');}
async function compare(user='a'){
  const recorded=await(await fetch(api+'/test/calls')).json();const latest=recorded.filter(c=>c.range&&c.user===user).at(-1);assert.ok(latest);const params=new URLSearchParams(latest.range);
  const value=await(await fetch(api+'/api/v2/analytics/overview?'+params,{headers:{Authorization:'Bearer '+sessions[user].access_token}})).json();assert.ok(value.data);const d=value.data;
  const dom=await evaluate(`({text:document.querySelector('#v2-main').innerText,summary:[...document.querySelectorAll('.t40-narrative .v2-summary-card')].map(e=>e.innerText),rows:[...document.querySelectorAll('.t40-table tbody tr')].map(e=>e.innerText)})`);
  for(const key of ['income','expenses','netSavings','averageDailyExpense']){assert.ok(dom.text.includes(money(d.summary[key])),key+' '+JSON.stringify(dom));checks++;}
  assert.ok(dom.text.includes(d.summary.savingsRatePercent===null?'Not applicable':d.summary.savingsRatePercent+'%'));checks++;
  assert.equal(dom.rows.length,d.incomeVsExpenses.length);checks++;
  for(const [i,row]of d.incomeVsExpenses.entries()){for(const k of ['income','expenses','netSavings']){assert.ok(dom.rows[i].includes(money(row[k])));checks++;}assert.ok(dom.rows[i].includes(row.from)&&dom.rows[i].includes(row.to));checks++;}
  for(const rows of [d.expenseByCategory,d.incomeByCategory])for(const row of rows){assert.ok(dom.text.includes(row.categoryName)&&dom.text.includes(money(row.amount)));checks++;}
  for(const a of d.accountActivity){assert.ok(dom.text.includes(a.accountName));checks++;}
  for(const k of ['income','expenses','netCashFlow']){assert.ok(dom.text.includes(money(d.recurring[k])));checks++;}
  return d;
}
try{
  const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
  await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
  await mode('slow');await call('Page.navigate',{url:origin+'/v2/analytics'});await until(`document.body.innerText.includes('Loading your analytics')`);await check(`!document.querySelector('.v2-money')`);await mode('normal');await ready();await compare();await widths('empty');
  await check(`JSON.stringify([...document.querySelectorAll('select:first-of-type option')].slice(0,6).map(o=>o.value))===JSON.stringify(['7_days','30_days','3_months','6_months','1_year','custom'])`);
  for(const stage of ['accounts','actuals']){await post('/test/seed/'+stage);await click('Refresh analytics');await ready();await compare();}
  const before=await compare();await post('/test/seed/transfer');await click('Refresh analytics');await ready();const after=await compare();assert.deepEqual(after.summary,before.summary);checks++;assert.ok(after.accountActivity.some(a=>a.outgoingTransfers==='25.00'));checks++;
  await post('/test/seed/recurring');await post('/test/process');await click('Refresh analytics');await ready();const generated=await compare();assert.ok(generated.summary.income!=='0.30');checks++;await widths('populated');
  for(const preset of ['7_days','30_days','3_months','6_months','1_year']){await select('Analytics range',preset);await ready();await compare();}
  // Same displayed Analytics summary as all five real Dashboard API periods.
  for(const key of ['this_month','last_month','3_months','6_months','1_year']){
    const dashboard=(await(await fetch(api+'/api/v2/dashboard?period='+key,{headers:{Authorization:'Bearer '+sessions.a.access_token}})).json()).data;
    await custom(dashboard.period.from,dashboard.period.to);await ready();const d=await compare();for(const k of ['income','expenses','netSavings']){assert.equal(d.summary[k],dashboard.summary[k]);checks++;}
  }
  const state=await(await fetch(api+'/test/state')).json();await select('Account',state.fixture.bank.id);await ready();const scoped=await compare();assert.equal(scoped.accountActivity.length,1);checks++;await select('Account','');await ready();
  await custom('2024-01-01','2024-12-31');await ready();await compare();await custom('2024-01-01','2025-01-01');await until(`document.body.innerText.includes('at most 366')`);await check(`document.querySelector('input[type=date]').value==='2024-01-01'`);await audit('validation');
  await post('/test/forecast');await custom('2024-02-01','2024-02-29');await ready();const leap=await compare();assert.equal(leap.recurring.income,'2.00');assert.equal(leap.recurring.expenses,'1.00');checks+=2;
  await custom('2024-03-01','2024-03-31');await ready();assert.equal((await compare()).recurring.expenses,'1.00');checks++;
  await select('Analytics range','30_days');await ready();await post('/test/delete-generated');await click('Refresh analytics');await ready();const deleted=await compare();assert.equal(deleted.summary.income,before.summary.income);checks++;
  await post('/test/archive');await click('Refresh analytics');await ready();await compare();await check(`document.querySelector('select[id$="account"]').innerText.includes('A bank (Archived)')`);
  await mode('read-error');await select('Analytics range','7_days');await until(`document.body.innerText.includes('refresh failed')`);await widths('stale');await mode('normal');await click('Retry this section');await ready();await compare();
  await mode('not-found');await select('Account',state.fixture.bank.id);await until(`document.body.innerText.includes('This account is unavailable')`);await mode('normal');await select('Account','');await ready();
  await mode('read-error');await navigate();await until(`document.body.innerText.includes('Analytics unavailable')`);await check(`!document.querySelector('.v2-money')`);await widths('error');await mode('normal');await click('Retry this section');await ready();
  await post('/test/stress');await post('/test/long-history');await select('Analytics range','1_year');await ready();await compare();await widths('stress');await check(`document.body.innerText.includes('Expenses exceed income')`);
  await navigate();await ready();await compare();await check(`window.__t37.errors.length===0`);
  await mode('slow');await select('Analytics range','1_year');await select('Analytics range','7_days');await mode('normal');await select('Analytics range','30_days');await ready();await pause(1600);await compare();
  await mode('slow');await click('Refresh analytics');await until(`document.body.innerText.includes('Refreshing')`);
  await evaluate(`(()=>{const next=window.__t37.sessions.b;sessionStorage.setItem('t37-user','b');localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(next));const c=new BroadcastChannel('sb-t37-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>c.close(),50);})()`);
  await until(`!document.body.innerText.includes('A bank')&&!document.body.innerText.includes('Historical category')`);await mode('normal');await ready();await pause(1600);await compare('b');await check(`document.querySelector('select[id$="account"]').options.length===1`);await widths('user-b');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await audit('reduced-motion');
  await evaluate(`document.querySelector('select').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});await check(`document.activeElement.tagName==='SELECT'`);
  await mode('auth-error');await click('Refresh analytics');await until(`location.pathname==='/v2/login'`);await check(`!document.querySelector('.v2-money')`);await mode('normal');
  const result={task:'T40',checks,axeAudits:audits,axeViolations:0,widths:[360,768,1440],realJwt:true,realDatabase:true,allFivePresets:true,allFiveDashboardPeriods:true,userSwitch:true,remoteTouched:false};writeFileSync(new URL('../../.tmp-v2-t40/browser-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}
