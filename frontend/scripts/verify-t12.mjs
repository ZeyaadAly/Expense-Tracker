// Run after T07-T11 regressions, with their disposable API on 4108.
// prepare leaves the CRUD snapshot for restart verification; verify never writes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const executable = process.argv[2];
assert.ok(executable, 'Provide agent-browser executable');
const phase = process.argv[3] || 'prepare';
const base = process.argv[4] || 'http://localhost:3000';
assert.equal(new URL(base).hostname, 'localhost');
const api = 'http://127.0.0.1:4108';
const artifacts = resolve('../.tmp-t12'); mkdirSync(artifacts, {recursive:true});
const results = [];
function browser(...args) {
  const input = args.at(-1)?.startsWith('INPUT:') ? args.pop().slice(6) : undefined;
  const response = spawnSync(executable, ['--session','expense-t08','--json',...args], {encoding:'utf8',input,timeout:30000});
  assert.equal(response.status,0,response.stderr || response.stdout);
  const output = JSON.parse(response.stdout); assert.ok(output.success,JSON.stringify(output.error)); return output.data;
}
const evaluate = code => browser('eval','--stdin',`INPUT:${code}`).result;
function verify(name, value) { assert.equal(value,true,name); results.push({name,passed:true}); console.log('PASS '+name); }
const check = (name, code) => verify(name,evaluate(code));
function wait(code) { const deadline=Date.now()+12000; while(!evaluate(code)) {assert.ok(Date.now()<deadline,code); browser('wait','100');} }
const settled = () => wait(`!document.querySelector('section [aria-busy=true]') && !document.querySelector('[aria-labelledby=summary-heading]').innerText.includes('Updating')`);
async function configure(body) { assert.equal((await fetch(api+'/__test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,200); }
const json = async path => (await (await fetch(api+'/api/v1'+path)).json());
const list = async () => (await json('/transactions')).data;
function open() {browser('open',base); browser('wait','--load','networkidle'); settled();}
function setDate(date) {evaluate(`(()=>{const e=document.querySelector('dialog [name=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(date)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
function fill(type,amount,description) {browser('click','header button'); browser('click',`dialog [name=type][value=${type}]`); browser('fill','dialog [name=amount]',amount); browser('select','dialog [name=category]','other'); browser('fill','dialog [name=description]',description); setDate('1900-01-01');}
function submit() {browser('click','dialog button[type=submit]'); wait(`!document.querySelector('dialog')`); settled();}
async function totals(stage,income,expenses,balance,count) {
  const actual=(await json('/summary')).data;
  const expected={totalIncome:income,totalExpenses:expenses,balance,currency:'EGP',transactionCount:count,scope:'all'};
  assert.deepEqual(actual,expected,stage);
  check(stage+' exact server totals visible',`(()=>{const text=document.querySelector('[aria-labelledby=summary-heading]').innerText.replaceAll(',','');return ${JSON.stringify([income,expenses,balance])}.every(value=>text.includes(value));})()`);
  return {stage,expected,actual};
}
async function snapshotCheck(label) {
  const before=JSON.parse(readFileSync(resolve(artifacts,'crud-snapshot.json'),'utf8'));
  open();
  assert.deepEqual(await list(),before.rows);
  assert.deepEqual((await json('/summary')).data,before.summary);
  verify(label+' complete persisted list and summary',true);
  verify(label+' created income and edited expense survive',before.rows.some(row=>row.description==='T12 income'&&row.amount==='1000.00')&&before.rows.some(row=>row.description==='T12 edited expense'&&row.amount==='300.00'&&row.date==='1900-01-01'));
  verify(label+' deleted Taxi remains missing',(await fetch(api+'/api/v1/transactions/'+before.deletedId)).status===404);
  check(label+' browser values and dates',`document.body.innerText.includes('T12 edited expense') && document.body.innerText.includes('01/01/1900') && document.body.innerText.includes('1,449.50') && !document.body.innerText.includes('Taxi fare')`);
}
browser('set','viewport','1440','900');
if (phase !== 'prepare') {
  if (phase === 'production-hygiene') browser('close');
  await snapshotCheck(phase);
  verify(phase+' no browser exceptions',browser('errors').errors.length===0);
  if (phase === 'production-hygiene') {
    browser('open',base+'/?preview=populated'); browser('wait','--load','networkidle'); settled();
    check('production ignores development fixture selector',`document.body.innerText.includes('T12 edited expense') && document.body.innerText.includes('1,449.50')`);
    const messages=browser('console').messages;
    verify('normal production flow has no console errors or hydration warnings',messages.every(message=>message.type!=='error'&&!/hydration|did not match|uncaught/i.test(message.text)));
  }
  writeFileSync(resolve(artifacts,phase+'.json'),JSON.stringify({results},null,2));
  console.log('Verified '+results.length+' '+phase+' checks.');
} else {
  await configure({mode:'normal',seed:true}); open();
  check('seeded descriptions and table headers',`['Freelance payment','Grocery shopping','Taxi fare'].every(text=>document.body.innerText.includes(text)) && document.querySelectorAll('thead th').length===6`);
  const stages=[await totals('seed','1000.00','296.25','703.75',3)];
  const deletedId=(await list()).find(row=>row.description==='Taxi fare').id;
  await configure({resetCalls:true});
  fill('income','1000.00','T12 income'); submit();
  stages.push(await totals('create income','2000.00','296.25','1703.75',4));
  check('income listed',`document.body.innerText.includes('T12 income')`);
  fill('expense','250.50','T12 expense'); submit();
  stages.push(await totals('create expense','2000.00','546.75','1453.25',5));
  browser('click',"table button[aria-label='Edit T12 expense']"); browser('fill','dialog [name=amount]','300.00'); browser('fill','dialog [name=description]','T12 edited expense'); submit();
  stages.push(await totals('edit expense','2000.00','596.25','1403.75',5));
  verify('edit persisted exact fields',(await list()).some(row=>row.description==='T12 edited expense'&&row.amount==='300.00'&&row.date==='1900-01-01'));
  browser('select','#filter-type','expense'); browser('select','#filter-category','other'); settled();
  check('combined filters select edited expense',`document.querySelectorAll('table tbody tr').length===1 && document.querySelector('table tbody').innerText.includes('T12 edited expense')`);
  stages.push(await totals('filtered global summary','2000.00','596.25','1403.75',5));
  browser('find','role','button','click','--name','Reset Filters'); settled();
  browser('click',"table button[aria-label='Delete Taxi fare']"); browser('click','dialog > div:last-child button:last-child'); wait(`!document.querySelector('dialog')`); settled();
  stages.push(await totals('delete Taxi','2000.00','550.50','1449.50',4));
  check('deleted record absent',`!document.querySelector('table tbody').innerText.includes('Taxi fare')`);
  browser('reload'); settled(); stages.push(await totals('browser refresh','2000.00','550.50','1449.50',4));
  const evidence=await (await fetch(api+'/__test')).json();
  const writes=evidence.calls.filter(call=>call.origin==='http://localhost:3000'&&['POST','PUT','DELETE'].includes(call.method));
  assert.deepEqual(writes.map(call=>call.method),['POST','POST','PUT','DELETE']);
  verify('exactly four deliberate writes and no duplicates',true);
  writeFileSync(resolve(artifacts,'crud-snapshot.json'),JSON.stringify({rows:await list(),summary:(await json('/summary')).data,deletedId,stages,writes},null,2));
  for(const width of [320,360,768,1024,1440]) {
    browser('set','viewport',String(width),'800'); open();
    check(width+' dashboard no horizontal overflow',`document.documentElement.scrollWidth===innerWidth`);
    check(width+' table/card switch and labels',`getComputedStyle(document.querySelector('.transaction-table').parentElement).display ${width<768?'===':'!=='} 'none' && document.querySelectorAll('h1').length===1`);
    verify(width+' dashboard accessibility',browser('a11y').counts.violations===0);
    browser('click','header button'); browser('click','dialog button[type=submit]');
    wait(`document.activeElement.name==='amount'`);
    check(width+' form fit, linked errors, focus',`document.documentElement.scrollWidth===innerWidth && document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth && [...document.querySelectorAll('dialog [aria-invalid=true]')].every(e=>e.getAttribute('aria-describedby').split(' ').every(id=>document.getElementById(id)))`);
    verify(width+' invalid form accessibility',browser('a11y').counts.violations===0);
    browser('focus','dialog form > div:last-child button:last-child');browser('press','Tab');
    check(width+' keyboard focus containment',`document.activeElement===document.querySelector('dialog button')`);
    browser('press','Escape'); check(width+' keyboard focus return',`document.activeElement===document.querySelector('header button')`);
    browser('click',`${width<768?'ul':'table'} button[aria-label='Delete T12 income']`);
    check(width+' delete dialog containment and cancel focus',`document.documentElement.scrollWidth===innerWidth && document.activeElement.textContent==='Cancel'`);
    verify(width+' delete accessibility',browser('a11y').counts.violations===0);
    browser('press','Escape');
    check(width+' minimum 44px targets',`[...document.querySelectorAll('main button,main select')].filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().height>=44)`);
    browser('screenshot',resolve(artifacts,'dashboard-'+width+'.png'),'--full');
  }
  const stressBody={type:'income',amount:'999999999.99',category:'other',description:'X'.repeat(200),date:'1900-01-01'};
  const stressResponse=await fetch(api+'/api/v1/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(stressBody)});
  assert.equal(stressResponse.status,201); const stress=(await stressResponse.json()).data;
  for(const width of [320,360,768,1024,1440]) {
    browser('set','viewport',String(width),'600'); open();
    await totals(width+' large total','1000001999.99','550.50','1000001449.49',5);
    check(width+' long description and large money wrap',`document.documentElement.scrollWidth===innerWidth && document.body.innerText.includes('X'.repeat(200))`);
    browser('click',`${width<768?'ul':'table'} button[aria-label=${JSON.stringify('Edit '+'X'.repeat(200))}]`);
    check(width+' edit long values fit',`document.querySelector('dialog [name=amount]').value==='999999999.99' && document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth`);
    browser('press','Escape');
    await configure({mode:'both-error'}); open();
    check(width+' read errors fit',`document.documentElement.scrollWidth===innerWidth && document.body.innerText.includes('Retry all')`);
    verify(width+' errors accessibility',browser('a11y').counts.violations===0);
    await configure({mode:'normal'});
  }
  assert.equal((await fetch(api+'/api/v1/transactions/'+stress.id,{method:'DELETE'})).status,204);
  browser('set','viewport','1440','900'); open(); await snapshotCheck('before restart');
  verify('no unhandled browser exceptions',browser('errors').errors.length===0);
  check('browser contacts no Supabase host',`performance.getEntriesByType('resource').every(r=>!r.name.includes('supabase'))`);
  writeFileSync(resolve(artifacts,'verification.json'),JSON.stringify({results,stages},null,2));
  console.log('Verified '+results.length+' T12 browser checks.');
}
