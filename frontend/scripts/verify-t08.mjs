// Real browser -> unchanged T06 Express -> disposable PostgreSQL verification.
// Start t08-test-api.mjs with T08_DISPOSABLE_DATABASE_URL first. Never uses a remote DB.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const executable=process.argv[2];if(!executable)throw new Error('Provide agent-browser executable');
const base=process.argv[3]??'http://localhost:3000';assert.equal(new URL(base).hostname,'localhost');
const control='http://127.0.0.1:4108/__test';const results=[];const artifacts=resolve('../.tmp-t08');mkdirSync(artifacts,{recursive:true});
function browser(...args) {const input=args.at(-1)?.startsWith('INPUT:')?args.pop().slice(6):undefined;const r=spawnSync(executable,['--session','expense-t08','--json',...args],{encoding:'utf8',input,timeout:30000});if(r.status!==0)throw new Error(r.stderr||r.stdout);const v=JSON.parse(r.stdout);if(!v.success)throw new Error(JSON.stringify(v));return v.data;}
const evaluate=code=>browser('eval','--stdin',`INPUT:${code}`).result;
function check(name,code) {assert.equal(evaluate(code),true,name);results.push({name,passed:true});console.log('PASS '+name);}
function verify(name,condition) {assert.ok(condition,name);results.push({name,passed:true});console.log('PASS '+name);}
function wait(code) {const deadline=Date.now()+10000;while(!evaluate(code)){if(Date.now()>deadline)throw new Error('Timed out: '+code);browser('wait','100');}}
async function configure(settings={}) {const r=await fetch(control,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});assert.equal(r.status,200);}
const evidence=async()=> {const result=await (await fetch(control)).json();result.calls=result.calls.filter(c=>c.origin==='http://localhost:3000');return result;};
function open(){browser('open',base);browser('wait','--load','networkidle');}
function ready(){wait(`!document.querySelector('section [aria-busy=true]') && document.querySelector('table tbody tr') !== null`);}
function fill(amount='0.10',description='T08 browser record',type='expense'){browser('click','header button');if(type==='income')browser('click','dialog [name=type][value=income]');browser('fill','dialog [name=amount]',amount);browser('select','dialog [name=category]','other');browser('fill','dialog [name=description]',description);evaluate(`(() => {const e=document.querySelector('dialog [name=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-09-30');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
function submit(){browser('click','dialog button[type=submit]');}
await configure({mode:'normal',seed:true});browser('set','media','light','reduced-motion');
await configure({mode:'loading'});browser('open',base);
check('Initial reads show loading without fabricated zeros',`document.querySelector('[aria-labelledby=summary-heading]').getAttribute('aria-busy')==='true' && document.body.innerText.includes('Loading transactions') && !document.querySelector('[aria-labelledby=summary-heading]').innerText.includes('0.00')`);
wait(`document.querySelector('table tbody tr') && document.querySelector('[aria-labelledby=summary-heading]').getAttribute('aria-busy')==='true'`);
check('List can load while summary is still pending',`document.querySelector('table tbody tr') !== null && document.querySelector('[aria-labelledby=summary-heading]').getAttribute('aria-busy')==='true'`);
wait(`document.body.innerText.includes('703.75')`);check('Loading resolves to real server values',`document.body.innerText.includes('Grocery shopping') && document.body.innerText.includes('703.75')`);
await configure({mode:'normal'});
for(const width of [360,768,1440]) {
  browser('set','viewport',String(width),'900');open();ready();
  check(`${width}px live responsive dashboard`,`document.documentElement.scrollWidth===innerWidth && document.body.innerText.includes('703.75') && Array.from(document.querySelectorAll('button')).filter(b=>/^(Edit|Delete) /.test(b.getAttribute('aria-label')||'')&&b.getClientRects().length).length===6`);
  const audit=browser('a11y');verify(`${width}px live dashboard accessibility`,audit.counts.violations===0);
  browser('click','header button');submit();check(`${width}px live validation and focus`,`document.activeElement.name==='amount' && document.querySelectorAll('dialog [aria-invalid=true]').length>=3`);
  const formAudit=browser('a11y');verify(`${width}px live form accessibility`,formAudit.counts.violations===0);
  browser('screenshot',resolve(artifacts,`validation-${width}.png`),'--full');browser('press','Escape');
}
browser('set','viewport','1440','900');
for(const [mode,expected] of [['list-error','Transactions could not load'],['summary-error','Summary unavailable'],['both-error','Retry all']]) {
  await configure({mode});open();wait(`document.body.innerText.includes(${JSON.stringify(expected)})`);
  if(mode==='summary-error')wait(`document.querySelector('table tbody tr') !== null`);
  if(mode==='list-error')wait(`document.body.innerText.includes('703.75')`);
  check(mode==='list-error'?'List error retains successful summary':mode==='summary-error'?'Summary error retains list':'Both failures offer Retry all',mode==='list-error'?`document.body.innerText.includes('703.75')`:mode==='summary-error'?`document.body.innerText.includes('Grocery shopping') && !document.querySelector('[aria-labelledby=summary-heading]').innerText.includes('0.00')`:`document.body.innerText.includes('Transactions could not load') && document.body.innerText.includes('Summary unavailable')`);
  await configure({mode:'normal',resetCalls:true});browser('click',mode==='both-error'?'main > [role=alert] button':mode==='list-error'?'[aria-labelledby=transactions-heading] [role=alert] button':'[aria-labelledby=summary-heading] [role=alert] button');
  wait(mode==='list-error'?`!document.body.innerText.includes('Transactions could not load')`:mode==='summary-error'?`!document.body.innerText.includes('Summary unavailable')`:`!document.body.innerText.includes('Retry all')`);
  const e=await evidence();verify(`${mode} scoped retry requests`,e.calls.filter(c=>c.method==='GET').length===(mode==='both-error'?2:1));
}
await configure({mode:'normal',empty:true});open();wait(`document.body.innerText.includes('No transactions yet')`);check('Empty database uses real summary zeros',`document.body.innerText.includes('0.00') && !document.querySelector('table tbody tr')`);
for(const [amount,description,type] of [['0.10','T08 exact 0.10','expense'],['0.20','T08 exact 0.20','expense'],['1000.00','T08 income','income']]) {
  await configure({resetCalls:true});fill(amount,description,type);submit();wait(`!document.querySelector('dialog') && document.body.innerText.includes(${JSON.stringify(description)})`);
  wait(`!document.querySelector('section [aria-busy=true]')`);
  check(`Create ${amount} confirmed and focus returned`,`document.activeElement===document.querySelector('header button') && document.body.innerText.includes('Transaction added.')`);
  const e=await evidence(),post=e.calls.filter(c=>c.method==='POST');verify(`Create ${amount} exactly five strings`,post.length===1&&Object.keys(post[0].body).sort().join(',')==='amount,category,date,description,type'&&Object.values(post[0].body).every(v=>typeof v==='string')&&post[0].body.amount===amount&&post[0].body.date==='2026-09-30');
  verify(`Create ${amount} refetches both authoritative reads`,e.calls.filter(c=>c.method==='GET'&&c.path==='/api/v1/summary').length===1&&e.calls.filter(c=>c.method==='GET'&&c.path==='/api/v1/transactions').length===1);
}
check('Exact server totals and date-only rendering',`document.body.innerText.includes('0.30') && document.body.innerText.includes('999.70') && document.body.innerText.includes('30/09/2026')`);
browser('reload');ready();check('Records persist after browser reload',`document.body.innerText.includes('T08 exact 0.10') && document.body.innerText.includes('T08 exact 0.20') && document.body.innerText.includes('999.70')`);
await configure({resetCalls:true});browser('select','#filter-type','expense');browser('select','#filter-category','bills');wait(`document.body.innerText.includes('No transactions match these filters')`);
check('API filters preserve unfiltered summary',`document.body.innerText.includes('999.70')`);const f=await evidence();verify('AND query and no summary request during filters',f.calls.some(c=>c.path==='/api/v1/transactions?type=expense&category=bills')&&!f.calls.some(c=>c.path.includes('/summary')));
browser('select','#filter-type','income');wait(`document.querySelector('#filter-category').value==='all' && document.body.innerText.includes('T08 income')`);check('Incompatible category resets',`document.querySelector('#filter-category').value==='all'`);
await configure({mode:'slow',resetCalls:true});browser('select','#filter-type','expense');check('Refiltering hides old rows',`!document.querySelector('table tbody tr') && document.body.innerText.includes('Updating transactions')`);browser('select','#filter-type','income');wait(`document.querySelector('table tbody tr') && document.body.innerText.includes('T08 income')`);browser('wait','850');check('Obsolete list cannot replace newer filter result',`document.querySelector('table tbody').innerText.includes('T08 income') && !document.querySelector('table tbody').innerText.includes('T08 exact')`);
await configure({mode:'normal',resetCalls:true});fill('0.10','T08 hidden expense');submit();wait(`!document.querySelector('dialog') && document.body.innerText.includes('It is hidden by your current filters.')`);wait(`!document.querySelector('section [aria-busy=true]')`);check('Hidden save retains filters and backend ordering',`document.querySelector('#filter-type').value==='income' && !document.querySelector('table tbody').innerText.includes('T08 hidden expense')`);
browser('click','main > [role=status] button');wait(`document.querySelector('#filter-type').value==='all' && document.querySelector('table tbody').innerText.includes('T08 hidden expense')`);
for(const mode of ['validation','post-503','post-500']) {
  await configure({mode,resetCalls:true});fill('0.10','T08 rejected draft');submit();wait(`document.querySelector('dialog [role=alert]') !== null`);
  check(`${mode} retains form safely`,`document.querySelector('dialog [name=description]').value==='T08 rejected draft' && !document.querySelector('dialog').innerText.includes('SQL') && !document.querySelector('dialog').innerText.includes('secret')`);
  if(mode==='validation'){wait(`document.activeElement.name==='amount'`);check('Backend field errors focus known field',`document.activeElement.name==='amount' && document.querySelector('dialog [name=amount]').getAttribute('aria-invalid')==='true'`);}
  if(mode==='post-500')check('Unexpected 500 requires read check before retry',`document.querySelector('dialog button[type=submit]').disabled && document.querySelector('dialog').textContent.includes('could not confirm')`);
  verify(`${mode} no automatic POST retry`,(await evidence()).calls.filter(c=>c.method==='POST').length===1);browser('press','Escape');
}
await configure({mode:'lost',resetCalls:true});fill('0.20','T08 committed uncertain');submit();wait(`document.querySelector('dialog')?.textContent.includes('could not confirm')`);
check('Lost response retains draft and blocks resubmission',`document.querySelector('dialog [name=description]').value==='T08 committed uncertain' && document.querySelector('dialog button[type=submit]').disabled`);
await configure({mode:'both-error'});browser('click','dialog [role=alert] button');wait(`document.querySelector('dialog').textContent.includes('dashboard could not refresh')`);check('Failed uncertainty check keeps retry gated',`document.querySelector('dialog button[type=submit]').disabled`);
await configure({mode:'normal'});browser('click','dialog [role=alert] button');wait(`document.querySelector('dialog').textContent.includes('Dashboard refreshed')`);check('Read-only uncertainty refresh retains draft',`document.querySelector('dialog [name=description]').value==='T08 committed uncertain' && !document.querySelector('dialog button[type=submit]').disabled`);
const uncertain=await evidence();verify('Uncertain POST committed once; recovery only reads',uncertain.calls.filter(c=>c.method==='POST').length===1&&uncertain.rows.filter(r=>r.description==='T08 committed uncertain').length===1&&uncertain.calls.filter(c=>c.method==='GET').length===4);browser('press','Escape');
await configure({mode:'refresh-error',resetCalls:true});fill('0.10','T08 saved refresh failure');submit();wait(`!document.querySelector('dialog') && document.body.innerText.includes('Saved, but the dashboard could not refresh.')`);
check('Confirmed save stays distinct from failed reads',`document.body.innerText.includes('Transaction added.') && document.body.innerText.includes('Previously loaded totals')`);
await configure({mode:'normal'});browser('click','main > [role=alert] button');wait(`document.querySelector('table tbody')?.innerText.includes('T08 saved refresh failure') && !document.body.innerText.includes('Saved, but the dashboard could not refresh.')`);verify('Saved refresh retry does not repeat create',(await evidence()).calls.filter(c=>c.method==='POST').length===1);
await configure({mode:'normal',resetCalls:true});browser('click',"table button[aria-label='Edit T08 income']");check('Edit is prefilled and saving enabled',`document.querySelector('dialog [name=description]').value==='T08 income' && !document.querySelector('dialog button[type=submit]').disabled`);browser('press','Escape');browser('click',"table button[aria-label='Delete T08 income']");check('Delete confirmation enabled',`!document.querySelector('dialog > div:last-child button:last-child').disabled && document.querySelector('dialog').textContent.includes('T08 income')`);browser('press','Escape');verify('Cancel sends no update/delete requests',(await evidence()).calls.length===0);
const cors=await fetch('http://127.0.0.1:4108/api/v1/summary',{headers:{Origin:'http://localhost:3000'}});verify('Existing exact-origin CORS works',cors.headers.get('access-control-allow-origin')==='http://localhost:3000');
await configure({mode:'pending',resetCalls:true});fill('0.10','T08 pending lock');submit();
wait(`document.querySelector('dialog')?.textContent.includes('Saving')`);
check('Pending create disables all form controls',`Array.from(document.querySelectorAll('dialog button,dialog input,dialog select,dialog textarea')).every(e=>e.matches(':disabled'))`);
browser('press','Escape');check('Pending create prevents dismissal',`!!document.querySelector('dialog[open]')`);browser('press','Enter');
wait(`!document.querySelector('dialog') && document.querySelector('table tbody')?.innerText.includes('T08 pending lock')`);
verify('Pending action sends one POST despite repeated keys',(await evidence()).calls.filter(c=>c.method==='POST').length===1);
await configure({mode:'normal'});
check('No Supabase browser resources',`!performance.getEntriesByType('resource').some(r=>r.name.includes('supabase'))`);
browser('screenshot',resolve(artifacts,'live-dashboard.png'),'--full');
writeFileSync(resolve(artifacts,'verification.json'),JSON.stringify({base,results,evidence:await evidence(),browserErrors:browser('errors')},null,2));
console.log(`Verified ${results.length} T08 browser checks.`);
