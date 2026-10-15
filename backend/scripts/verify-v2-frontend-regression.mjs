// Local T58 orchestration. Run only from an isolated git archive with locked installs.
/* global process, console, setTimeout, fetch, WebSocket */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, realpathSync, openSync, closeSync} from 'node:fs';
import {resolve, basename, dirname} from 'node:path';
import {fileURLToPath,pathToFileURL,URL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {Client} from 'pg';
import {disposableIsolationUrl} from '../tests/helpers/v2-isolation.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
assert.ok(root.replaceAll('\\','/').includes('/.tmp-v2-t58/source/'),'Use a clean isolated source snapshot');
const output=resolve(root,'../results');mkdirSync(output,{recursive:true});
const data=realpathSync(process.env.T58_DATA_DIRECTORY);
assert.equal(basename(data),'pgdata');assert.equal(basename(dirname(data)),'.tmp-v2-t58');
const url=disposableIsolationUrl(process.env.T58_DISPOSABLE_DATABASE_URL);
const tools=resolve(process.env.T58_TOOLS_ROOT);
const axe=resolve(tools,'.npm-cache/t03-tools/node_modules/axe-core/axe.min.js');
const playwright=pathToFileURL(resolve(tools,'.tmp-v2-t20/node_modules/playwright/index.mjs')).href;
const edge=process.env.T58_BROWSER_EXE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(env))if(key.endsWith('_DISPOSABLE_DATABASE_URL')||['DATABASE_URL','BACKUP_DATABASE_URL','SUPABASE_URL','CRON_SECRET','CURSOR_SIGNING_SECRET'].includes(key))delete env[key];
let next,api;
function launch(file,args,cwd,label,extra={}) {
  const fd=openSync(resolve(output,label+'.log'),'w');
  const child=spawn(file,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore',fd,fd]});closeSync(fd);return child;
}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000);});}
async function waitUrl(address,child){for(let i=0;i<150;i++){assert.equal(child.exitCode,null,readFileSync(resolve(output,child===next?'next.log':'api.log'),'utf8'));try{if((await fetch(address)).ok)return;}catch{/* Service is still starting. */}await pause(400);}throw Error('Local service did not become ready');}
async function frontend(host='t37-fixture',base='http://127.0.0.1:4000/api/v1'){
  const info=await(await fetch('http://127.0.0.1:9224/json/version')).json();const ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};const rpc=(method,params={})=>new Promise(r=>{const key=++id;pending.set(key,r);ws.send(JSON.stringify({id:key,method,params}));});const targets=await rpc('Target.getTargets');for(const target of targets.targetInfos.filter(t=>t.type==='page'))await rpc('Target.closeTarget',{targetId:target.targetId});await rpc('Target.createTarget',{url:'about:blank'});ws.close();
  await stop(next);const code=`require(${JSON.stringify(resolve(root,'frontend/node_modules/next/dist/server/lib/start-server.js'))}).startServer({dir:${JSON.stringify(resolve(root,'frontend'))},port:3000,hostname:'localhost',isDev:true,allowRetry:false})`;const starter=resolve(root,'../t58-next.cjs');writeFileSync(starter,code);next=launch(process.execPath,[starter],resolve(root,'frontend'),'next',{NODE_ENV:'development',TURBOPACK:'1',__NEXT_DEV_SERVER:'1',NEXT_PUBLIC_API_BASE_URL:base,NEXT_PUBLIC_SUPABASE_URL:`https://${host}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_t58_synthetic_only'});await waitUrl('http://localhost:3000/v2/login',next);
}
async function reset(){
  await stop(api);api=null;
  const address=new URL(url);address.pathname='/template1';const c=new Client({connectionString:address.href});await c.connect();
  try {assert.equal(realpathSync((await c.query('SHOW data_directory')).rows[0].data_directory),data);assert.equal((await c.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname='postgres'")).rows[0].n,0);await c.query('DROP DATABASE postgres');for(const role of ['expense_tracker_app','anon','authenticated'])await c.query('DROP ROLE IF EXISTS '+role);await c.query('CREATE DATABASE postgres TEMPLATE template0');}finally{await c.end();}
}
async function run(file,label,args=[],extra={}){
  const child=launch(process.execPath,[file,...args],root,label,extra);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  const log=readFileSync(resolve(output,label+'.log'),'utf8');console.log(label+': '+log.slice(-1600));assert.equal(code,0,label+' failed; inspect its local log');
}
function adapted(relative){
  const path=resolve(root,relative);let source=readFileSync(path,'utf8');
  source=source.replaceAll("'../../.tmp-v2-t20/node_modules/playwright/index.mjs'",JSON.stringify(playwright));
  source=source.replaceAll("new URL('../../.tmp-v2-t20/node_modules/axe-core/axe.min.js',import.meta.url)",JSON.stringify(axe));
  source=source.replaceAll("chromium.launch({headless:true})",`chromium.launch({headless:true,executablePath:${JSON.stringify(edge)}})`);
  source=source.replaceAll("'.npm-cache/t03-tools/node_modules/axe-core/axe.min.js'",JSON.stringify(axe));
  // Domain clocks are explicitly pinned fixtures; no application clock is changed.
  source=source.replaceAll("t.type==='page'&&t.url.startsWith('http://localhost:3000')","t.type==='page'");
  if(relative.endsWith('verify-v2-profiles.cjs'))source=source.replace("await navigate('loading');","await call('Page.navigate',{url:'http://localhost:3000/v2/login'});await until('!!window.__t13');await navigate('loading');");
  const target=path.replace(/\.(mjs|cjs)$/,'.t58.$1');writeFileSync(target,source);return target;
}
const wanted=process.env.T58_SUITES?.split(',');
const selected=name=>!wanted||wanted.includes(name);
const matrix=[['accounts-detail','19','backend/scripts/verify-t20-browser.mjs','t19-auth'],['transactions','25','backend/scripts/verify-t25-browser.mjs','t19-auth'],['transfers','28','backend/scripts/verify-t28-browser.mjs','t19-auth'],['recurring','34','frontend/scripts/verify-v2-recurring.mjs','t34-fixture'],['dashboard','37','frontend/scripts/verify-v2-dashboard.mjs'],['analytics','40','frontend/scripts/verify-v2-analytics.mjs'],['budgets','44','frontend/scripts/verify-v2-budgets.mjs'],['goals','46','frontend/scripts/verify-v2-goals.mjs'],['settings','49','frontend/scripts/verify-v2-settings.mjs']];
const passed=[];
try{
  if(selected('auth')){await frontend('t07-fixture');const ws=(await(await fetch('http://127.0.0.1:9224/json/version')).json()).webSocketDebuggerUrl;mkdirSync(resolve(root,'.npm-cache'),{recursive:true});await run(adapted('frontend/scripts/verify-v2-auth.cjs'),'auth',[ws]);passed.push('auth');}
  if(selected('profiles')){await frontend('t13-fixture','http://localhost:3000/api/v1');mkdirSync(resolve(root,'.tmp-v2-t13'),{recursive:true});const ws=(await(await fetch('http://127.0.0.1:9224/json/version')).json()).webSocketDebuggerUrl;await run(adapted('frontend/scripts/verify-v2-profiles.cjs'),'profiles',[ws]);passed.push('profiles');}
  for(const [name,task,file,host] of matrix){if(!selected(name))continue;await reset();api=launch(process.execPath,[resolve(root,`backend/scripts/t${task}-browser-api.mjs`)],resolve(root,'backend'),'api',{[`T${task}_DISPOSABLE_DATABASE_URL`]:url.href});await waitUrl('http://127.0.0.1:4000/test/session/a',api);await frontend(host??'t37-fixture');await run(adapted(file),name,[],{T20_CHROME_EXE:edge,T28_CHROME_EXE:edge});if(name==='settings')await run(adapted(file),'settings-stress',[],{T49_STRESS_ONLY:'1'});if(name==='goals'){await reset();api=launch(process.execPath,[resolve(root,'backend/scripts/t46-browser-api.mjs')],resolve(root,'backend'),'api',{T46_DISPOSABLE_DATABASE_URL:url.href});await waitUrl('http://127.0.0.1:4000/test/session/a',api);await frontend();await run(adapted(file),'goals-dialogs',[],{T46_DIALOG_ONLY:'1'});}passed.push(name);writeFileSync(resolve(output,'matrix.json'),JSON.stringify({passed,remoteTouched:false},null,2));}
  if(selected('system')){
    await reset();const startApi=()=>launch(process.execPath,[resolve(root,'backend/scripts/t58-browser-api.mjs')],resolve(root,'backend'),'api',{T58_DISPOSABLE_DATABASE_URL:url.href});api=startApi();await waitUrl('http://127.0.0.1:4000/test/session/a',api);await frontend();await run(resolve(root,'frontend/scripts/verify-v2-frontend-system.mjs'),'system',[],{T58_TOOLS_ROOT:tools,T58_OUTPUT_DIRECTORY:output});
    await stop(next);await stop(api);api=startApi();await waitUrl('http://127.0.0.1:4000/test/session/a',api);await frontend();await run(resolve(root,'frontend/scripts/verify-v2-frontend-system.mjs'),'system-restart',[],{T58_TOOLS_ROOT:tools,T58_OUTPUT_DIRECTORY:output,T58_RESTART_ONLY:'1'});passed.push('system','system-restart');writeFileSync(resolve(output,'system-matrix.json'),JSON.stringify({passed,remoteTouched:false},null,2));
  }
  if(selected('recovery')){await reset();api=launch(process.execPath,[resolve(root,'backend/scripts/t58-browser-api.mjs')],resolve(root,'backend'),'api',{T58_DISPOSABLE_DATABASE_URL:url.href});await waitUrl('http://127.0.0.1:4000/test/session/a',api);await frontend();await run(resolve(root,'frontend/scripts/verify-v2-frontend-system.mjs'),'recovery',[],{T58_TOOLS_ROOT:tools,T58_OUTPUT_DIRECTORY:output,T58_RECOVERY_ONLY:'1'});passed.push('recovery');}
}finally{await stop(next);await stop(api);}
