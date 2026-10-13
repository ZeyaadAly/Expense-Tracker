// Read-only scan. Never print matching values or load deployment configuration.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {resolve} from 'node:path';
import console from 'node:console';
const root=fileURLToPath(new URL('../../',import.meta.url));
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/').replace(/\/$/,'')}`,...args],{cwd:root,encoding:'utf8'}).trim();
const files=git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(file=>file && existsSync(resolve(root,file)));
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,/\bsbp_[a-f0-9]{30,}\b/,/\bsb_secret_[A-Za-z0-9_-]{20,}\b/,/postgres(?:ql)?:\/\/[^\s:@/"']+:[^\s@/"']+@/g];
const suspect=text=>patterns.some(pattern=>{pattern.lastIndex=0;return (text.match(pattern)||[]).some(value=>!/YOUR_|USER:PASSWORD|unavailable:unavailable|user:secret|user:password|postgres:\/\/USER/i.test(value)&&value!=='postgresql://postgres:fictional@');});
const textFiles=files.filter(file=>!/\.(?:png|jpg|jpeg|gif|ico|crt|woff2?|pdf)$/i.test(file));
const source=textFiles.map(file=>readFileSync(resolve(root,file),'utf8'));
const build=readdirSync(resolve(root,'backend/dist'),{recursive:true}).filter(file=>/\.(?:js|map)$/.test(file)).map(file=>readFileSync(resolve(root,'backend/dist',file),'utf8'));
const sourceMatches=textFiles.filter((_,index)=>suspect(source[index]));
assert.ok(sourceMatches.length===0,'Credential pattern detected in files: '+sourceMatches.join(', '));
assert.ok(!build.some(suspect),'Credential pattern detected in backend build');
assert.ok(!git('ls-files').split('\n').some(file=>/(^|\/)\.env(?:$|\.)/.test(file)&&!file.includes('example')),'Tracked environment file');
assert.match(readFileSync(resolve(root,'backend/.env.example'),'utf8'),/^CRON_SECRET=$/m);
// Compare locally configured secret values privately with source/build, if present.
let privateValuesChecked=0;
for(const file of ['backend/.env','backend/.env.local','frontend/.env.local']){
  if(!existsSync(resolve(root,file)))continue;
  assert.equal(git('check-ignore',file),file);
  const text=readFileSync(resolve(root,file),'utf8');
  for(const line of text.split(/\r?\n/)){
    const match=line.match(/^(?:CRON_SECRET|CURSOR_SIGNING_SECRET|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|BACKUP_DATABASE_URL)\s*=\s*(.*)$/);
    if(!match)continue;const value=match[1].replace(/^['"]|['"]$/g,'');
    if(value.length<24||value.includes('YOUR_'))continue;
    assert.ok(![...source,...build].some(text=>text.includes(value)),'Private environment value present in source/build');privateValuesChecked++;
  }
}
console.log(JSON.stringify({task:'T33-security',sourceFiles:textFiles.length,buildFiles:build.length,privateValuesChecked,failures:0,credentialValuesPrinted:false}));
