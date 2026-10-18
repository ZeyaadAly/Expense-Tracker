import{assert,browser,context,go,mode,audit,overflow,save,mkdirSync}from'./qa-base.mjs';
const checks=[],audits=[],requests=[],errors=[],out='docs/v2/redesign/assets/active-only';mkdirSync(out,{recursive:true});
let release=()=>{};
try{
 for(const width of [1440,360]){
  const c=await context('a',{viewport:{width,height:900}}),p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/v2/')||u.searchParams.has('_rsc'))requests.push({width,path:u.pathname+u.search});});
  await mode('normal');await go(p,'dashboard');const initial=requests.filter(r=>r.width===width);assert.equal(initial.filter(r=>r.path.includes('_rsc=')).length,0);
  const gate=new Promise(resolve=>release=resolve);let requested=false;
  await p.route('**/v2/transactions?*',async r=>{if(new URL(r.request().url()).searchParams.has('_rsc')){requested=true;await gate;}await r.continue();});
  await mode('slow');if(width===360)await p.getByRole('button',{name:'Open navigation',exact:true}).click();
  const navigation=p.locator((width===360?'dialog':'aside')+' nav a[href="/v2/transactions"]').click();
  await p.getByRole('status',{name:'Loading page',exact:true}).waitFor();assert.equal(requested,true);
  assert.equal(await p.getByRole('region',{name:'Net position',exact:true}).isVisible(),false);
  await overflow(p,'route skeleton '+width);audits.push({label:'route skeleton '+width,...await audit(p,'route skeleton '+width)});
  await p.screenshot({path:out+'/route-skeleton-'+width+'.png',fullPage:true});release();await navigation;
  await p.waitForURL('**/v2/transactions');await p.locator('.v2-skeleton--transaction').first().waitFor();
  await p.screenshot({path:out+'/data-skeleton-'+width+'.png',fullPage:true});
  await p.locator(width>=1024?'.v2-ledger tbody tr':'.v2-transaction-card').first().waitFor();await p.waitForLoadState('networkidle');
  assert.equal(await p.locator('[data-route-skeleton]').count(),0);checks.push('Cold navigation '+width+': no prefetch; route skeleton, data skeleton and real ledger');
  const idle=requests.length;for(const link of await p.locator('a[href^="/v2/"]').all())if(await link.isVisible())await link.hover();await p.waitForTimeout(700);assert.equal(requests.length,idle);checks.push('Idle/hover after navigation '+width+': zero extra route/API requests');await c.close();
 }
 await mode('normal');const c=await context(null),p=await c.newPage(),payloads=[];p.on('request',r=>{if(new URL(r.url()).searchParams.has('_rsc'))payloads.push(r.url());});
 for(const route of ['login','register','forgot-password','reset-password']){await p.goto('http://localhost:3000/v2/'+route);await p.waitForLoadState('networkidle');for(const link of await p.locator('a[href^="/v2/"]').all())if(await link.isVisible())await link.hover();await p.waitForTimeout(300);}assert.deepEqual(payloads,[]);checks.push('Four Auth routes: no route prefetch on entry or link hover');assert.deepEqual(errors,[]);save('active-only',{checks,audits,requests,errors});console.log(JSON.stringify({checks:checks.length,audits:audits.length,errors}));
}finally{release();await mode('normal');await browser.close();}
