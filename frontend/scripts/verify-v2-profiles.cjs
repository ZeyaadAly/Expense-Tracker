// Isolated local CDP browser only; fictional Auth/API responses, no hosted requests.
/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ws=new WebSocket(process.argv[2]);let sequence=0,session;
const pending=new Map();
ws.onmessage=({data})=>{const m=JSON.parse(data);const p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
function call(method,params={},attach=true){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(attach&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<100;i++){if(await evaluate(code))return;await pause(100);}throw Error('Timed out: '+code);}
const a='a1300000-0000-4000-8000-000000000001',b='b1300000-0000-4000-8000-000000000001';
const mock=`(()=>{
  const a='${a}',b='${b}';
  const user={id:a,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-06T12:00:00Z'};
  const token=id=>btoa(JSON.stringify({alg:'ES256'}))+'.'+btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+900,aud:'authenticated'}))+'.fixture';
  const makeSession=id=>({access_token:token(id),refresh_token:'fictional-refresh',expires_in:900,expires_at:Math.floor(Date.now()/1000)+900,token_type:'bearer',user:{...user,id}});
  const mode=sessionStorage.getItem('t13-mode')||'loading';
  localStorage.setItem('sb-t13-fixture-auth-token',JSON.stringify(makeSession(a)));
  window.__t13={calls:[],errors:[],release:[],mode,makeSession};window.addEventListener('error',()=>window.__t13.errors.push('page-error'));
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url||input.toString());
    if(url.hostname==='t13-fixture.supabase.co')return Response.json(url.pathname.endsWith('/logout')?{}:user);
    if(url.origin!==location.origin)throw Error('External network disabled');
    if(!url.pathname.startsWith('/api/v2/profile'))return original(input,options);
    const auth=options.headers.Authorization;const id=JSON.parse(atob(auth.split('.')[1])).sub;
    window.__t13.calls.push({path:url.pathname,method:options.method,userId:id,body:options.body});
    if(window.__t13.mode==='loading')await new Promise(r=>window.__t13.release.push(r));
    if(window.__t13.mode==='error')return Response.json({error:{code:'DATABASE_UNAVAILABLE',message:'safe',details:[]}},{status:503});
    if(window.__t13.mode==='auth')return Response.json({error:{code:'AUTH_INVALID',message:'safe',details:[]}},{status:401});
    let name=sessionStorage.getItem('t13-name-'+id);
    if(options.method==='PUT'){name=JSON.parse(options.body).displayName;sessionStorage.setItem('t13-name-'+id,name);}
    return Response.json({data:{userId:id,displayName:name,preferredCurrency:'EGP',locale:'en',timezone:'Africa/Cairo',createdAt:'2026-10-06T12:00:00.000Z',updatedAt:'2026-10-06T12:00:00.000Z'}});
  };
})();`;
let checks=0;async function check(code){assert.equal(await evaluate(code),true,code);checks++;}
async function navigate(mode){await evaluate(`sessionStorage.setItem('t13-mode','${mode}')`);await call('Page.navigate',{url:'about:blank'});await call('Page.navigate',{url:'http://localhost:3000/v2/dashboard'});}
async function emit(id){await evaluate(`(()=>{const s=window.__t13.makeSession('${id}');localStorage.setItem('sb-t13-fixture-auth-token',JSON.stringify(s));const c=new BroadcastChannel('sb-t13-fixture-auth-token');c.postMessage({event:'SIGNED_IN',session:s});setTimeout(()=>c.close(),50);})()`);}
(async()=>{
  await new Promise(r=>ws.onopen=r);
  const targets=await call('Target.getTargets',{},false);const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://localhost:3000'));
  assert.ok(target);session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
  await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:mock});
  await navigate('loading');await until(`document.body?.innerText.includes('Preparing your profile')`);
  await check(`!document.querySelector('#v2-main')&&!document.querySelector('[data-nextjs-dialog]')`);
  for(const width of [360,768,1440]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===360});
    await check(`document.documentElement.scrollWidth===innerWidth`);
    const shot=await call('Page.captureScreenshot');fs.writeFileSync('.tmp-v2-t13/loading-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await evaluate(`window.__t13.mode='ok';window.__t13.release.forEach(r=>r())`);await until(`!!document.getElementById('v2-main')`);
  await check(`document.activeElement.id==='v2-main'&&window.__t13.errors.length===0`);
  await evaluate(`void(window.__oldMain=document.getElementById('v2-main'))`);
  await emit(a);await pause(200);await check(`window.__oldMain===document.getElementById('v2-main')`);
  await evaluate(`window.__t13.mode='loading'`);await emit(b);await until(`document.body.innerText.includes('Preparing your profile')`);await check(`!document.getElementById('v2-main')`);
  await evaluate(`window.__t13.mode='ok';window.__t13.release.forEach(r=>r())`);await until(`!!document.getElementById('v2-main')`);await check(`window.__oldMain!==document.getElementById('v2-main')&&window.__t13.calls.some(c=>c.userId==='${b}')`);
  await navigate('error');await until(`document.body.innerText.includes('could not prepare your profile')`);await check(`!document.getElementById('v2-main')&&!![...document.querySelectorAll('button')].find(b=>b.textContent==='Retry')`);
  await pause(500);const count=await evaluate(`window.__t13.calls.length`);await pause(500);assert.equal(await evaluate(`window.__t13.calls.length`),count);checks++;
  await evaluate(`window.__t13.mode='ok';[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await until(`!!document.getElementById('v2-main')`);await check(`document.activeElement.id==='v2-main'`);
  await evaluate(`sessionStorage.removeItem('t13-name-${a}');sessionStorage.setItem('expense-tracker.v2.profile-draft',JSON.stringify({userId:'${a}',displayName:'Registration draft'}))`);
  await navigate('ok');await until(`!!document.getElementById('v2-main')`);await check(`window.__t13.calls.some(c=>c.method==='PUT'&&JSON.parse(c.body).displayName==='Registration draft')&&sessionStorage.getItem('expense-tracker.v2.profile-draft')===null`);
  await navigate('auth');await until(`location.pathname==='/v2/login'`);await check(`!document.getElementById('v2-main')&&!document.querySelector('[data-nextjs-dialog]')`);
  fs.writeFileSync('.tmp-v2-t13/browser-verification.json',JSON.stringify({checks,failures:0,viewports:[360,768,1440],mockedAuthAndApi:true},null,2));console.log(JSON.stringify({checks,failures:0}));ws.close();
})().catch(error=>{console.error(error.message);ws.close();process.exitCode=1;});
