import{fileURLToPath as redesignFilePath}from'node:url';process.chdir(redesignFilePath(new URL('../../../',import.meta.url)));
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from './runtime.mjs';
export {assert,readFileSync,writeFileSync,mkdirSync};
export const origin=process.env.REDESIGN_ORIGIN||'http://localhost:3000',apiOrigin='http://127.0.0.1:4000';
export const evidenceDir=process.env.REDESIGN_EVIDENCE_DIR||'docs/v2/redesign/assets/final';
assert.ok(!evidenceDir.includes('..')&&evidenceDir.startsWith('docs/v2/redesign/assets/'),'Evidence must remain under redesign assets.');
mkdirSync(evidenceDir,{recursive:true});
assert.equal(origin,'http://localhost:3000','Redesign acceptance is restricted to the isolated loopback application.');
export const sessions=Object.fromEntries(await Promise.all(['a','b'].map(async k=>[k,await(await fetch(apiOrigin+'/test/session/'+k)).json()])));
export const seed=JSON.parse(readFileSync('.tmp-v2-redesign/seed.json','utf8'));
export const browser=await chromium.launch({headless:true,executablePath:process.env.REDESIGN_BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
export async function context(who='a',options={}) {const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,...options});await ctx.route('https://t37-fixture.supabase.co/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p.endsWith('/logout')?{}:p.endsWith('/token')?sessions[who||'b']:p.endsWith('/signup')?sessions.b.user:sessions[who||'b'].user});});if(who)await ctx.addInitScript(s=>{if(!sessionStorage.getItem('signed-out')&&!localStorage.getItem('sb-t37-fixture-auth-token'))localStorage.setItem('sb-t37-fixture-auth-token',JSON.stringify(s));},sessions[who]);return ctx;}
export async function api(path,method='GET',body,who='b'){const r=await fetch(apiOrigin+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+sessions[who].access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=r.status===204?null:await r.json();assert.ok(r.ok,method+' '+path+' '+JSON.stringify(data));return data?.data;}
export async function mode(value){await fetch(apiOrigin+'/test/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:value})});}
export async function calls(){return(await fetch(apiOrigin+'/test/calls')).json();}
export async function go(page,route){await page.goto(origin+'/v2/'+route);await page.locator('#v2-main').waitFor();await page.waitForLoadState('networkidle');}
export async function audit(page,label){await page.waitForTimeout(220);await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({content:readFileSync(process.env.REDESIGN_AXE_PATH||'frontend/node_modules/axe-core/axe.min.js','utf8')});const result=await page.evaluate(async()=>{const r=await axe.run(document.querySelector('dialog[open]')||document.querySelector('.v2-theme'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};});assert.deepEqual(result.violations,[],label);return result;}
export async function overflow(page,label){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+' page overflow');const dialog=page.locator('dialog[open]');if(await dialog.count())assert.equal(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth),true,label+' dialog overflow');}
export function save(name,result){writeFileSync('.tmp-v2-redesign/'+name+'.json',JSON.stringify(result,null,2));}

export async function reveal(page,title){const summary=page.locator("summary").filter({hasText:new RegExp("^"+title+"$")}).first();if(await summary.count()&&!await summary.evaluate(e=>e.parentElement.open)){await summary.click();await page.waitForLoadState("networkidle");}}
