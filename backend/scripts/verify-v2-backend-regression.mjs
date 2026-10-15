// T57 local-only regression orchestrator. No dotenv, hosted fallback or retained data.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {performance} from 'node:perf_hooks';
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,realpathSync,openSync,closeSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from 'pg';
import {disposableIsolationUrl,prepareIsolationDatabase} from '../tests/helpers/v2-isolation.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const backend=fileURLToPath(new URL('../',import.meta.url));
const url=disposableIsolationUrl(process.env.T57_DISPOSABLE_DATABASE_URL);
const dataDirectory=realpathSync(resolve(process.env.T57_DATA_DIRECTORY ?? ''));
assert.equal(basename(dataDirectory),'pgdata');
assert.equal(basename(dirname(dataDirectory)),'.tmp-v2-t57','Only a newly initialized T57 cluster is allowed');
const output=resolve(process.env.T57_OUTPUT_DIRECTORY ?? resolve(root,'.tmp-v2-t57'));
assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t57'));
mkdirSync(output,{recursive:true});
const childEnv={...process.env};
for(const key of Object.keys(childEnv))if(key.endsWith('_DISPOSABLE_DATABASE_URL')||['DATABASE_URL','BACKUP_DATABASE_URL','SUPABASE_URL','CURSOR_SIGNING_SECRET','CRON_SECRET'].includes(key))delete childEnv[key];

async function reset() {
  const resetUrl=new URL(url);resetUrl.pathname='/template1';
  const client=new Client({connectionString:resetUrl.href});await client.connect();
  try {
    assert.equal(realpathSync((await client.query('SHOW data_directory')).rows[0].data_directory),dataDirectory);
    assert.equal((await client.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname='postgres'")).rows[0].n,0,'Close all preceding test clients before reset');
    await client.query('DROP DATABASE postgres');
    for(const role of ['expense_tracker_app','anon','authenticated'])await client.query('DROP ROLE IF EXISTS '+role);
    await client.query('CREATE DATABASE postgres TEMPLATE template0');
  } finally {await client.end();}
}
async function prepare(stage) {
  if(!stage)return;
  const admin=new Client({connectionString:url.href});await admin.connect();
  try {
    if(stage==='full'){await prepareIsolationDatabase(admin);return;}
    if(stage==='t12')await admin.query('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);REVOKE ALL ON SCHEMA auth FROM PUBLIC;REVOKE ALL ON auth.users FROM PUBLIC;');
    const files=readdirSync(resolve(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')&&(stage==='v1'?!file.includes('_v2_'):! /ownership_constraints|occurrence_invariants/.test(file))).sort();
    for(const file of files)await admin.query(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));
    if(stage==='t12')await admin.query(readFileSync(resolve(root,'supabase/seeds/v2-system-categories.sql'),'utf8'));
  } finally {await admin.end();}
}
const suites=[
  ['legacy','T06_DISPOSABLE_DATABASE_URL',['transactions','update','delete','t12'],'v1'],
  ['schema','T11_DISPOSABLE_DATABASE_URL',['v2-schema']],
  ['migration-ownership','T15_DISPOSABLE_DATABASE_URL',['v2-ownership-constraints']],
  ['category-read','T12_DISPOSABLE_DATABASE_URL',['v2-categories'],'t12'],
  ['profile','T13_DISPOSABLE_DATABASE_URL',['v2-profiles'],'full'],
  ['shared-isolation-concurrency','T27_DISPOSABLE_DATABASE_URL',['transfer-concurrency']],
  ['recurring','T29_DISPOSABLE_DATABASE_URL',['v2-recurring']],
  ['occurrences','T32_DISPOSABLE_DATABASE_URL',['recurring-occurrences']],
  ['processor','T31_DISPOSABLE_DATABASE_URL',['recurring-processor']],
  ['cron-orchestration','T33_DISPOSABLE_DATABASE_URL',['recurring-cron']],
  ['dashboard','T36_DISPOSABLE_DATABASE_URL',['dashboard']],
  ['analytics-direct','T38_DISPOSABLE_DATABASE_URL',['analytics']],
  ['analytics-http','T38_DISPOSABLE_DATABASE_URL',['analytics'],'', {T39_ANALYTICS_HTTP:'1'}],
  ['budgets','T42_DISPOSABLE_DATABASE_URL',['budgets']],
  ['budget-status','T43_DISPOSABLE_DATABASE_URL',['budget-status']],
  ['goals','T45_DISPOSABLE_DATABASE_URL',['goals']],
  ['custom-categories','T48_DISPOSABLE_DATABASE_URL',['v2-custom-categories']],
];
const firstSuite=process.env.T57_FROM_SUITE?suites.findIndex(([label])=>label===process.env.T57_FROM_SUITE):0;
assert.ok(firstSuite>=0,'Unknown resume suite');
const results=firstSuite?JSON.parse(readFileSync(resolve(output,'matrix-result.json'),'utf8')).filter(result=>suites.findIndex(([label])=>label===result.label)<firstSuite):[];
if(process.env.T57_SYSTEM_ONLY!=='1')for(const [label,variable,files,stage,extra] of suites.slice(firstSuite)) {
  await reset();await prepare(stage);
  const started=performance.now();
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...files.map(file=>'tests/'+file+'.test.mjs')],{cwd:backend,env:{...childEnv,[variable]:url.href,...extra},encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024,windowsHide:true});
  writeFileSync(resolve(output,label+'.log'),(run.stdout??'')+'\n'+(run.stderr??''));
  assert.equal(run.status,0,`${label} failed; inspect its local log`);
  const summary={label,tests:Number(run.stdout.match(/# tests (\d+)/)?.[1]),passed:Number(run.stdout.match(/# pass (\d+)/)?.[1]),failed:Number(run.stdout.match(/# fail (\d+)/)?.[1]),skipped:Number(run.stdout.match(/# skipped (\d+)/)?.[1]),durationMs:Math.round(performance.now()-started)};
  assert.equal(summary.skipped,0,label+' must not skip its integration gate');
  const diagnostics=run.stdout.split(/\r?\n/).filter(line=>line.startsWith('# {')).map(line=>JSON.parse(line.slice(2)));
  summary.diagnostics=diagnostics;
  results.push(summary);writeFileSync(resolve(output,'matrix-result.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({...summary,diagnostics:undefined}));
}
const inventory=readdirSync(resolve(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')).sort().map(file=>({file,sha256:createHash('sha256').update(readFileSync(resolve(root,'supabase/migrations',file))).digest('hex')}));
assert.equal(inventory.length,8);
writeFileSync(resolve(output,'migration-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
// T57_SYSTEM_ONLY resumes the additional restart/cross-domain gate without repeating the matrix.
if(process.env.T57_MATRIX_ONLY!=='1') {
  await reset();
  const env={...childEnv,T57_DISPOSABLE_DATABASE_URL:url.href,T57_DATA_DIRECTORY:dataDirectory,T57_OUTPUT_DIRECTORY:output,T57_PG_BIN:process.env.T57_PG_BIN};
  for(const phase of ['initial','recover','terminal']){
    const run=spawnSync(process.execPath,['scripts/verify-v2-backend-system.mjs',phase],{cwd:backend,env,encoding:'utf8',timeout:180000,windowsHide:true});
    writeFileSync(resolve(output,'system-'+phase+'.log'),(run.stdout??'')+'\n'+(run.stderr??''));
    assert.equal(run.status,0,`System ${phase} gate failed; inspect its local log`);
    console.log(run.stdout.trim());
    if(phase==='initial'){
      // Windows can end the phase's PostgreSQL child with its process job.
      // The parent owns a replacement for the separate Node recovery phases.
      const probe=new Client({connectionString:url.href});let online=false;
      try{await probe.connect();online=true;}catch{ /* Checked local reconnect below. */ }finally{await probe.end().catch(()=>{});}
      if(!online){
        const bin=realpathSync(resolve(process.env.T57_PG_BIN)),fd=openSync(resolve(output,'postgres-parent.log'),'a');
        const postgres=spawn(resolve(bin,'postgres.exe'),['-D',dataDirectory,'-h','127.0.0.1','-p','55451'],{stdio:['ignore',fd,fd],windowsHide:true});postgres.unref();closeSync(fd);
        for(let attempt=0;attempt<40;attempt++){const client=new Client({connectionString:url.href});try{await client.connect();online=true;break;}catch{await pause(250);}finally{await client.end().catch(()=>{});}}
        assert.equal(online,true,'Parent-owned local PostgreSQL did not restart');
      }
    }
  }
  const stopped=spawnSync(resolve(process.env.T57_PG_BIN,'pg_ctl.exe'),['-D',dataDirectory,'-m','fast','stop'],{encoding:'utf8',windowsHide:true});
  assert.equal(stopped.status,0,'Disposable PostgreSQL cleanup failed');
}
