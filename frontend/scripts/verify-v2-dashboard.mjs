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
async function until(expression){for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);}
async function check(expression){assert.equal(await evaluate(expression),true,expression);checks++;}
async function post(path,body){const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body??{})});assert.equal(response.status,200);checks++;return response.json();}
const mode=value=>post('/test/mode',{mode:value});
async function click(text){await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`);await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length);b.focus();b.click();})()`);}
async function navigate(path='/v2/dashboard'){await call('Page.navigate',{url:origin+path});await until(`!!document.querySelector('#v2-main')`);}
async function ready(){await until(`document.body.innerText.includes('Dashboard is up to date.')`);}
async function period(value){await evaluate(`(()=>{const s=document.querySelector('select');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await ready();}
async function audit(label){const violations=await evaluate(`(async()=>{if(!window.axe){${readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')}}return (await window.axe.run(document.querySelector('#v2-main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})()`);assert.deepEqual(violations,[],label);audits++;await check('document.documentElement.scrollWidth<=innerWidth');}
async function widths(label){for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});await audit(label+' '+width);const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(new URL(`../../.tmp-v2-t37/${label}-${width}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}}
const money=value=>{const negative=value.startsWith('-'),[whole,fraction]=value.replace(/^-/,'').split('.');return (negative?'−':'')+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction;};
async function compare(key='this_month',user='a'){
  const response=await fetch(api+'/api/v2/dashboard?period='+key,{headers:{Authorization:'Bearer '+sessions[user].access_token}});assert.equal(response.status,200);const value=await response.json();
  const dom=await evaluate(`(()=>{const root=document.querySelector('#v2-main'),metric=label=>[...root.querySelectorAll('section')].find(s=>s.getAttribute('aria-label')===label)?.querySelector('.v2-money-value')?.innerText.replace(/^(Balance:|Income:|Expense:|Negative balance:|Amount owed:|Credit balance:)\s*/,'').trim();return {net:metric('Net position'),assets:metric('Total assets'),debt:metric('Signed card debt'),income:metric('Income'),expenses:metric('Expenses'),savings:metric('Net savings'),text:root.innerText,accounts:[...root.querySelectorAll('.t37-account')].map(a=>({href:a.getAttribute('href'),text:a.innerText})),recent:[...root.querySelectorAll('.t37-activity section:first-child ol > li')].map(li=>li.innerText),upcoming:[...root.querySelectorAll('.t37-activity section:last-child ol > li')].map(li=>({text:li.innerText,date:li.querySelector('time').dateTime}))};})()`);
  const s=value.data.summary;
  for(const [field,expected] of [['net',money(s.totalBalance)],['assets',money(s.assets)],['debt',money(s.cardDebt)],['income',(s.income==='0.00'?'':'+')+money(s.income)],['expenses',(s.expenses==='0.00'?'':'−')+money(s.expenses)],['savings',money(s.netSavings)]]){assert.equal(dom[field],expected,field);checks++;}
  assert.ok(dom.text.includes(value.data.period.from)&&dom.text.includes(value.data.period.to));checks++;
  assert.equal(dom.accounts.length,value.data.accounts.length);assert.equal(dom.recent.length,value.data.recentTransactions.length);assert.equal(dom.upcoming.length,value.data.upcomingRecurring.length);checks+=3;
  value.data.accounts.forEach((a,i)=>{assert.equal(dom.accounts[i].href,'/v2/accounts/'+a.id);assert.ok(dom.accounts[i].text.includes(a.name)&&dom.accounts[i].text.includes(money(a.currentBalance)));checks++;});
  value.data.recentTransactions.forEach((t,i)=>{assert.ok(dom.recent[i].includes(t.description)&&dom.recent[i].includes(t.accountName)&&dom.recent[i].includes(t.categoryName)&&dom.recent[i].includes(t.date));checks++;});
  value.data.upcomingRecurring.forEach((r,i)=>{assert.ok(dom.upcoming[i].text.includes(r.description)&&dom.upcoming[i].text.includes(r.accountName)&&dom.upcoming[i].date===r.occurrenceDate);checks++;});
  return value;
}
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
mkdirSync(new URL('../../.tmp-v2-t37/',import.meta.url),{recursive:true});
try {
  const target=await call('Target.createTarget',{url:'about:blank'},false);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
  await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:inject});
  await mode('slow');await call('Page.navigate',{url:origin+'/v2/dashboard'});await until(`document.body.innerText.includes('Loading your dashboard')`);await check(`!document.querySelector('.v2-money')&&!document.body.innerText.includes('Monthly Salary')`);await mode('normal');await ready();await compare();await widths('empty');
  await check(`JSON.stringify([...document.querySelectorAll('select option')].map(o=>o.value))===JSON.stringify(['this_month','last_month','3_months','6_months','1_year'])`);
  for(const stage of ['accounts','actuals','transfer','recurring']){await post('/test/seed/'+stage);await click('Refresh dashboard');await ready();await compare();}
  await widths('populated');
  const state=await(await fetch(api+'/test/state')).json(),dashboard=await compare();
  assert.equal(state.summary.netPosition,dashboard.data.summary.totalBalance);assert.deepEqual(new Map([...state.accounts,...state.archived].map(a=>[a.id,a.currentBalance])),new Map(dashboard.data.accounts.map(a=>[a.id,a.currentBalance])));assert.deepEqual(state.transactions.data,dashboard.data.recentTransactions);assert.deepEqual(state.upcoming.data.slice(0,5),dashboard.data.upcomingRecurring);checks+=4;
  for(const key of ['this_month','last_month','3_months','6_months','1_year']){await period(key);await compare(key);}
  await check(`!document.querySelector('#v2-main .v2-chart-canvas')&&![...document.querySelectorAll('#v2-main a')].some(a=>['/v2/budgets','/v2/goals','/v2/analytics'].includes(a.getAttribute('href')))`);
  await period('this_month');
  const processed=await post('/test/process');assert.equal(processed.posted,1);checks++;await click('Refresh dashboard');await ready();await check(`document.querySelector('.t37-activity').innerText.includes('Generated')`);await compare();
  const deleted=await post('/test/delete-generated');assert.deepEqual(deleted.markers,[{status:'posted',generated_transaction_id:null}]);checks++;await click('Refresh dashboard');await ready();await compare();await check(`!document.querySelector('.t37-activity').innerText.includes('Generated')`);
  await navigate();await ready();await compare();
  // Retained prior values remain labelled with their old period, then GET-only recovery.
  await mode('read-error');await evaluate(`(()=>{const s=document.querySelector('select');s.value='last_month';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.body.innerText.includes('Dashboard unavailable')`);await check(`document.querySelector('[data-testid="dashboard-range"]').innerText.includes('This month')&&document.body.innerText.includes('Last loaded this month values')`);await widths('stale');await mode('normal');await click('Retry this section');await ready();await compare('last_month');
  await mode('read-error');await navigate();await until(`document.body.innerText.includes('Dashboard unavailable')`);await check(`!document.querySelector('.v2-money')`);await widths('error');await mode('normal');await click('Retry this section');await ready();
  // Slow response for a superseded period may not overwrite the newest selection.
  await mode('slow');await evaluate(`(()=>{const s=document.querySelector('select');s.value='3_months';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.body.innerText.includes('Refreshing 3 months')`);await mode('normal');await period('6_months');await pause(1600);await compare('6_months');
  // Navigation uses the existing connected domains and detail route.
  for(const [href,expected] of [['/v2/accounts','Accounts'],['/v2/transactions','Transactions'],['/v2/recurring','Schedules']]){
    await evaluate(`document.querySelector('.t37-panel-heading a[href="${href}"]').click()`);await until(`location.pathname===${JSON.stringify(href)}&&document.body.innerText.includes(${JSON.stringify(expected)})`);checks++;await navigate();await ready();
  }
  await evaluate(`document.querySelector('.t37-account').click()`);await until(`location.pathname.startsWith('/v2/accounts/')&&document.body.innerText.includes('A bank')`);checks++;await navigate();await ready();
  await post('/test/stress');await click('Refresh dashboard');await ready();await compare();await widths('negative-overpaid-large');await check(`document.body.innerText.includes('Overpayment')&&document.body.innerText.includes('Expenses exceed income')`);
  // Keyboard period control and native selection, with focus retained after the read.
  await evaluate(`document.querySelector('select').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await ready();await check(`document.activeElement.tagName==='SELECT'`);await audit('keyboard-period');
  // A -> B while A has a slow read: no A content can reappear after B loads.
  await mode('slow');await click('Refresh dashboard');await until(`document.body.innerText.includes('Refreshing')`);
  await evaluate(`(()=>{const next=window.__t37.sessions.b;sessionStorage.setItem('t37-user','b');localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(next));const c=new BroadcastChannel('sb-t37-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>c.close(),50);})()`);await until(`!document.body.innerText.includes('A bank')`);await mode('normal');await ready();await pause(1600);await compare('this_month','b');await check(`!document.body.innerText.includes('A bank')&&!document.body.innerText.includes('Boundary')&&!document.body.innerText.includes('Long expense')`);await widths('user-b-empty');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await check(`matchMedia('(prefers-reduced-motion: reduce)').matches`);await audit('reduced-motion');
  await mode('auth-error');await click('Refresh dashboard');await until(`location.pathname==='/v2/login'`);await check(`!document.querySelector('.v2-money')`);await mode('normal');
  const final=await(await fetch(api+'/test/state')).json();assert.equal(final.role,'expense_tracker_app');checks++;
  const calls=await(await fetch(api+'/test/calls')).json();assert.ok(['this_month','last_month','3_months','6_months','1_year'].every(p=>calls.some(c=>c.period===p)));checks++;
  const result={task:'T37',checks,axeAudits:audits,axeViolations:0,widths:[360,768,1440],realJwt:true,runtimeRole:final.role,allFivePeriods:true,generatedDeletionMarkerPreserved:true,userSwitch:true,remoteTouched:false};
  writeFileSync(new URL('../../.tmp-v2-t37/browser-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}
