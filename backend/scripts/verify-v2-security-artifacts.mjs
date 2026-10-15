// T59 source/bundle/log review; local artifacts only, values never printed.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.env.T59_OUTPUT_DIRECTORY);
assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t59/'));
mkdirSync(output,{recursive:true});
const files=[];
function walk(path){for(const name of readdirSync(path)){const file=resolve(path,name);if(statSync(file).isDirectory())walk(file);else files.push(file);}}
for(const path of ['frontend/src','frontend/.next/static','frontend/.next/server','backend/src','backend/dist'])walk(resolve(root,path));
const findings=[];
const secrets=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|(?:CRON_SECRET|CURSOR_SIGNING_SECRET)\s*[:=]\s*["'][0-9a-f]{64}["']/;
for(const file of files){
  const source=readFileSync(file,'utf8');
  if(secrets.test(source))findings.push({file:file.slice(root.length),rule:'credential'});
  if(file.includes('/.next/static/')||file.includes('\\.next\\static\\')){
    if(/CURSOR_SIGNING_SECRET|CRON_SECRET|DATABASE_URL|DATABASE_SSL_CA_FILE/.test(source))findings.push({file:file.slice(root.length),rule:'server-config-in-browser'});
  }
}
const logDirectory=resolve(process.env.T59_LOG_DIRECTORY);
assert.ok(logDirectory.replaceAll('\\','/').includes('/.tmp-v2-t59'));
const logs=[];
function logWalk(path){for(const name of readdirSync(path)){const file=resolve(path,name);if(statSync(file).isDirectory()){if(['source','pgdata','edge'].includes(name))continue;logWalk(file);}else if(name.endsWith('.log'))logs.push(file);}}
logWalk(logDirectory);
for(const file of logs){
  const source=readFileSync(file,'utf8');
  if(secrets.test(source)||/postgres(?:ql)?:\/\/[^\s]+|Authorization:\s*Bearer\s+\S+|A-T59 private draft|a@example\.invalid|b@example\.invalid/.test(source))findings.push({file:file.slice(logDirectory.length),rule:'sensitive-log'});
}
assert.deepEqual(findings,[],'Review filename-only findings locally; never print matched values');
const result={filesScanned:files.length,sourceMapsScanned:files.filter(file=>file.endsWith('.map')).length,logsScanned:logs.length,checks:files.length+logs.length,findings,remoteTouched:false};
writeFileSync(resolve(output,'artifacts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
