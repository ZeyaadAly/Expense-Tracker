// Run against an isolated dev source copy with synthetic public Auth config.
// node frontend/scripts/verify-v2-auth.cjs ws://127.0.0.1:PORT/devtools/browser/ID
// All provider responses and credentials below are fictional; no live emails.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ws = new WebSocket(process.argv[2]);
let seq = 0, session;
const waiting = new Map();
ws.onmessage = ({data}) => { const m = JSON.parse(data); if(waiting.has(m.id)){const p=waiting.get(m.id);waiting.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);} };
function call(method,params={},attach=true){return new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(attach&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.exceptionDetails.exception?.description);return r.result.value;}
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(expression){for(let i=0;i<150;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Condition timed out: '+expression);}
const mock = `(() => {
  const mode=sessionStorage.getItem('t07-mode')||'ok';
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const token=btoa(JSON.stringify({alg:'ES256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+900,aud:'authenticated'}))+'.fixture';
  const session={access_token:token,refresh_token:'fictional-refresh',expires_in:900,expires_at:Math.floor(Date.now()/1000)+900,token_type:'bearer',user};
  window.__t07={calls:[],mode,token,fixtureSession:session};
  localStorage.removeItem('sb-t07-fixture-auth-token');
  if(mode==='signedin')localStorage.setItem('sb-t07-fixture-auth-token',JSON.stringify(session));
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url||input.toString());
    if(url.origin!==location.origin&&url.hostname!=='t07-fixture.supabase.co')throw new TypeError('External networking disabled in Auth verification');
    if(url.hostname!=='t07-fixture.supabase.co')return original(input,options);
    window.__t07.calls.push({path:url.pathname,redirect:url.searchParams.get('redirect_to'),method:options.method||'GET'});
    await new Promise(r=>setTimeout(r,(mode==='slow'||mode==='slow-init')?850:30));
    if(mode==='network')throw new TypeError('fixture network failure');
    let status=200,body={};
    if(url.pathname.endsWith('/token')){body=session;if(mode==='reject'||mode==='confirmation'){status=400;body={code:mode==='confirmation'?'email_not_confirmed':'invalid_credentials',msg:'private provider detail'};}}
    else if(url.pathname.endsWith('/signup')){body=user;if(mode==='registered'){status=422;body={code:'email_exists',msg:'private provider detail'};}}
    else if(url.pathname.endsWith('/user')){body=user;if(options.method==='PUT'&&mode==='expired'){status=401;body={code:'session_not_found',msg:'private provider detail'};}}
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','x-supabase-api-version':'2024-01-01'}});
  };
  window.__t07Errors=[];window.addEventListener('error',()=>window.__t07Errors.push('page-error'));
})();`;
async function open(route,mode='ok',recovery=false){
  await evaluate(`sessionStorage.setItem('t07-mode',${JSON.stringify(mode)})`);
  let url='http://localhost:3000/v2/'+route;
  if(recovery){const token=await evaluate('window.__t07.token');url+='#access_token='+encodeURIComponent(token)+'&refresh_token=fictional-refresh&expires_in=900&token_type=bearer&type=recovery';}
  // A fragment-only Page.navigate does not reload the Auth client.
  await call('Page.navigate',{url:'about:blank'});
  await call('Page.navigate',{url});
  await until(`location.pathname===${JSON.stringify('/v2/'+route)}&&!!document.querySelector('h1')&&!document.body?.textContent?.includes('Checking authentication')`);
  await pause(150);
}
async function fill(name,value){await evaluate(`(()=>{const e=document.querySelector('input[name=${name}]');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(50);}
async function clickSubmit(){await evaluate(`document.querySelector('button[type=submit]').click()`);await pause(80);}
async function fillForm(route){if(route==='register')await fill('name','Test Name');if(route!=='reset-password')await fill('email','fixture@example.invalid');if(route!=='forgot-password')await fill('password','fixture-password');if(['register','reset-password'].includes(route))await fill('confirm','fixture-password');}
async function audit(){await evaluate(fs.readFileSync('.npm-cache/t03-tools/node_modules/axe-core/axe.min.js','utf8'));return evaluate(`axe.run(document.querySelector('.v2-theme'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}}).then(r=>r.violations.map(v=>v.id))`);}
async function geometry(){return evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,labels:[...document.querySelectorAll('input')].every(e=>!!document.querySelector('label[for="'+e.id+'"]')),errors:window.__t07Errors})`);}
async function setup(){
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const targets=await call('Target.getTargets',{},false);const target=targets.targetInfos.find(t=>t.type==='page');session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
  await call('Page.enable');await call('Page.bringToFront');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:mock});
}
module.exports={setup,call,evaluate,open,fill,fillForm,clickSubmit,audit,geometry,until,pause,ws};
if(require.main===module)(async()=>{
  await setup();
  await call('Page.navigate',{url:'http://localhost:3000/v2/register'});await until(`!!window.__t07`);
  const results=[];
  for(const width of [360,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});
    for(const route of ['login','register','forgot-password','reset-password']){
      await open(route);const g=await geometry();assert.equal(g.overflow,false);assert.equal(g.labels,true);assert.deepEqual(g.errors,[]);const violations=await audit();assert.deepEqual(violations,[]);results.push({width,route,state:'default',axe:0});
      if(route==='reset-password'){assert.equal(await evaluate(`document.querySelector('button[type=submit]').disabled`),true);continue;}
      await clickSubmit();assert.equal(await evaluate(`document.activeElement.name`),route==='register'?'name':'email');assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-invalid=true]')).every(e=>!!document.getElementById(e.getAttribute('aria-describedby')))`),true);
      assert.equal(await evaluate(`window.__t07.calls.length`),0);assert.deepEqual(await audit(),[]);assert.equal((await geometry()).overflow,false);results.push({width,route,state:'validation',axe:0});
    }
    for(const route of ['register','forgot-password','reset-password']){
      await open(route,'ok',route==='reset-password');await fillForm(route);await clickSubmit();await until(`!!document.querySelector('.v2-feedback--success')`);
      assert.equal((await geometry()).overflow,false);assert.deepEqual(await audit(),[]);results.push({width,route,state:'success',axe:0});
    }
  }
  await open('login','reject');await fillForm('login');await clickSubmit();await until(`document.body?.textContent?.includes('Email or password is incorrect.')`);assert.equal(await evaluate(`document.querySelector('input[name=email]').value`),'fixture@example.invalid');
  await open('login','confirmation');await fillForm('login');await clickSubmit();await until(`document.body?.textContent?.includes('Confirm your email')`);
  await open('login','network');await fillForm('login');await clickSubmit();await until(`document.body?.textContent?.includes('Check your connection')`);
  await open('login','slow');await fillForm('login');await evaluate(`document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()`);await pause(80);assert.equal(await evaluate(`document.querySelector('form').getAttribute('aria-busy')`),'true');assert.equal(await evaluate(`window.__t07.calls.filter(c=>c.path.endsWith('/token')).length`),1);await until(`location.pathname==='/v2/dashboard'`);
  await open('login','signedin');await until(`location.pathname==='/v2/dashboard'`);
  await open('register');await fillForm('register');await fill('confirm','different');await clickSubmit();assert.equal(await evaluate('document.activeElement.name'),'confirm');assert.equal(await evaluate('window.__t07.calls.length'),0);
  await open('register','registered');await fillForm('register');await clickSubmit();await until(`document.body?.textContent?.includes('already registered')`);assert.equal(await evaluate('document.activeElement.name'),'email');
  await open('forgot-password');await fillForm('forgot-password');await clickSubmit();await until(`document.body?.textContent?.includes('If an account exists for this email')`);assert.equal(await evaluate(`window.__t07.calls.find(c=>c.path.endsWith('/recover')).redirect`),'http://localhost:3000/v2/reset-password');
  await open('forgot-password','network');await fillForm('forgot-password');await clickSubmit();await until(`document.body?.textContent?.includes('Check your connection')`);
  await open('reset-password','expired',true);await fillForm('reset-password');await clickSubmit();await until(`document.body?.textContent?.includes('Request a new reset link')`);assert.equal(await evaluate(`document.querySelector('button[type=submit]').disabled`),true);
  await open('reset-password','ok',true);assert.equal(await evaluate('location.hash'),'');await fillForm('reset-password');await fill('confirm','different');await clickSubmit();assert.equal(await evaluate('document.activeElement.name'),'confirm');await fill('confirm','fixture-password');await clickSubmit();await until(`document.body?.textContent?.includes('Your password has been updated')`);await until(`window.__t07.calls.some(c=>c.path.endsWith('/logout'))`);
  await open('forgot-password','signedin');await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Sign out test session').click()`);await until(`document.body?.textContent?.includes('Test session signed out.')`);assert.equal(await evaluate(`localStorage.getItem('sb-t07-fixture-auth-token')`),null);
  await open('login');await fillForm('login');await evaluate(`document.querySelector('input[name=password]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await until(`location.pathname==='/v2/dashboard'`);
  await call('Page.navigate',{url:'http://localhost:3000/?preview=populated'});await until(`document.body?.textContent?.includes('Grocery shopping')`);assert.equal(await evaluate(`!!document.querySelector('.v2-theme')`),false);
  fs.writeFileSync('.npm-cache/t07-browser-results.json',JSON.stringify({audits:results,flows:'passed',v1:'passed'},null,2));console.log(JSON.stringify({audits:results.length,axeViolations:0,flows:'passed',v1:'passed'}));ws.close();
})().catch(error=>{console.error(error.message);ws.close();process.exitCode=1;});
