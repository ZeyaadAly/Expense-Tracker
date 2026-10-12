/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup,call,evaluate,open,fillForm,clickSubmit,audit,geometry,until,pause,ws}=require('./verify-v2-auth.cjs');
async function navigate(path,mode='ok') {
  await evaluate(`sessionStorage.setItem('t07-mode',${JSON.stringify(mode)})`);
  await call('Page.navigate',{url:'about:blank'});
  await call('Page.navigate',{url:'http://localhost:3000'+path});
}
async function emit(event,change={}){
  await evaluate(`(()=>{const s=${event==='SIGNED_OUT'?'null':`{...window.__t07.fixtureSession,...${JSON.stringify(change)}}`};if(s)localStorage.setItem('sb-t07-fixture-auth-token',JSON.stringify(s));else localStorage.removeItem('sb-t07-fixture-auth-token');const channel=new BroadcastChannel('sb-t07-fixture-auth-token');channel.postMessage({event:${JSON.stringify(event)},session:s});setTimeout(()=>channel.close(),50);})()`);await pause(100);
}
(async()=>{
  await setup();await call('Page.navigate',{url:'http://localhost:3000/v2/login'});await until('!!window.__t07');
  for(const path of ['dashboard','transactions','accounts','recurring','analytics','budgets','goals','settings']) {
    await navigate('/v2/'+path);await until(`location.pathname==='/v2/login'&&!document.body?.textContent?.includes('Checking authentication')`);assert.equal(await evaluate(`!!document.querySelector('.p4-workspace')`),false);assert.equal(await evaluate(`new URLSearchParams(location.search).get('next')`),'/v2/'+path);
  }
  const results=[];
  for(const width of [360,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});
    for(const path of ['dashboard','transactions']){
      await navigate('/v2/'+path,'signedin');await until(`!!document.querySelector('#v2-main')`);await pause(200);assert.equal((await geometry()).overflow,false);assert.deepEqual(await audit(),[]);assert.equal(await evaluate(`document.activeElement.id`),'v2-main');results.push({width,path,state:'authenticated',axe:0});
      if(width<1440){await evaluate(`(()=>{const e=document.querySelector('[aria-label="Open navigation"]');e.focus();e.click();})()`);await until(`!!document.querySelector('dialog[open]')`);assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes('fixture@example.invalid')`));assert.deepEqual(await audit(),[]);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(`!document.querySelector('dialog[open]')`);assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Open navigation');}
      else assert.ok(await evaluate(`document.querySelector('.v2-user').textContent.includes('fixture@example.invalid')`));
    }
    // A slow mocked implicit-session validation keeps financial children unmounted.
    const token=await evaluate('window.__t07.token');await navigate('/v2/dashboard#access_token='+encodeURIComponent(token)+'&refresh_token=fictional-refresh&expires_in=900&token_type=bearer&type=email','slow-init');
    await until(`document.body?.textContent?.includes('Checking your session')`);assert.equal(await evaluate(`!!document.querySelector('.p4-workspace')`),false);assert.equal((await geometry()).overflow,false);assert.deepEqual(await audit(),[]);results.push({width,path:'dashboard',state:'loading',axe:0});await until(`!!document.querySelector('#v2-main')`);
  }
  await navigate('/v2/transactions','signedin');await until(`!!document.querySelector('#v2-main')`);await evaluate(`window.__beforeMain=document.getElementById('v2-main');document.getElementById('v2-main').focus()`);await emit('TOKEN_REFRESHED');assert.equal(await evaluate(`window.__beforeMain===document.getElementById('v2-main')`),true);assert.equal(await evaluate(`document.activeElement.id`),'v2-main');
  await emit('USER_UPDATED');assert.equal(await evaluate(`window.__beforeMain===document.getElementById('v2-main')`),true);
  await emit('SIGNED_IN',{user:{id:'22222222-2222-4222-8222-222222222222',email:'second@example.invalid'}});assert.equal(await evaluate(`window.__beforeMain===document.getElementById('v2-main')`),false);
  await emit('SIGNED_OUT');await until(`location.pathname==='/v2/login'`);assert.equal(await evaluate(`!!document.querySelector('.p4-workspace')`),false);
  for(const width of [360,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===360});await navigate('/v2/dashboard','signedin');await until(`!!document.querySelector('#v2-main')`);await emit('TOKEN_REFRESHED',{expires_at:Date.now()/1000+0.6});await until(`location.pathname==='/v2/login'`);assert.equal(await evaluate(`!!document.querySelector('.p4-workspace')`),false);await pause(200);assert.equal((await geometry()).overflow,false);assert.deepEqual(await audit(),[]);results.push({width,path:'login',state:'after-expiry',axe:0});}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate('/v2/dashboard','signedin');await until(`!!document.querySelector('#v2-main')`);await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Sign out'&&e.getClientRects().length).click()`);await until(`location.pathname==='/v2/login'`);assert.equal(await evaluate(`localStorage.getItem('sb-t07-fixture-auth-token')`),null);
  await evaluate(`sessionStorage.setItem('t07-mode','ok')`);await call('Page.navigate',{url:'http://localhost:3000/v2/accounts'});await until(`location.pathname==='/v2/login'`);assert.equal(await evaluate(`!!document.querySelector('.p4-workspace')`),false);
  await navigate('/v2/login?next=%2Fv2%2Fanalytics%3Fperiod%3Dmonth');await until(`!!document.querySelector('input[name=email]')&&!document.body?.textContent?.includes('Checking authentication')`);await fillForm('login');await clickSubmit();await until(`location.pathname==='/v2/analytics'`);assert.equal(await evaluate('location.search'),'?period=month');
  await navigate('/v2/login?next=https%3A%2F%2Fevil.invalid');await until(`!!document.querySelector('input[name=email]')&&!document.body?.textContent?.includes('Checking authentication')`);await fillForm('login');await clickSubmit();await until(`location.pathname==='/v2/dashboard'`);
  for(const route of ['login','register']){await navigate('/v2/'+route,'signedin');await until(`location.pathname==='/v2/dashboard'`);}
  await open('reset-password','ok',true);await fillForm('reset-password');await clickSubmit();await until(`document.body?.textContent?.includes('Your password has been updated')`);
  await call('Page.navigate',{url:'http://localhost:3000/?preview=populated'});await until(`document.body?.textContent?.includes('Grocery shopping')`);assert.equal(await evaluate(`!!document.querySelector('.v2-theme')`),false);
  fs.mkdirSync('docs/v2/assets/t08',{recursive:true});fs.writeFileSync('docs/v2/assets/t08/browser-verification.json',JSON.stringify({audits:results,allEightSignedOut:'passed',refreshAndUserChange:'passed',expiryAndSignout:'passed',redirectsAndRecovery:'passed',v1:'passed'},null,2));console.log(JSON.stringify({audits:results.length,axeViolations:0,allEightRoutes:'passed',sessionFlows:'passed',v1:'passed'}));ws.close();
})().catch(error=>{console.error(error.message);ws.close();process.exitCode=1;});
