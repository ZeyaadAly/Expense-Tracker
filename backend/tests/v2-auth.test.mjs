import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {Buffer} from 'node:buffer';
import {createServer, request as httpRequest} from 'node:http';
import express, {Router} from 'express';
import {errorHandler} from '../dist/middleware/error-handler.js';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';
import {createApp} from '../dist/app.js';
import {createRequireAuth, createTokenVerifier} from '../dist/middleware/auth.js';
import {readAuthConfig} from '../dist/config/auth.js';

const id='11111111-1111-4111-8111-111111111111';
const fetch = globalThis.fetch;
async function fixture(run){
  const a=await generateKeyPair('ES256'), b=await generateKeyPair('ES256');
  const ja={...await exportJWK(a.publicKey),kid:'a',alg:'ES256',use:'sig'};
  const jb={...await exportJWK(b.publicKey),kid:'b',alg:'ES256',use:'sig'};
  let keys=[ja],fetches=0,status=200,malformed=false;
  const jwks=createServer((req,res)=>{fetches++;assert.equal(req.url,'/auth/v1/.well-known/jwks.json');res.writeHead(status,{'content-type':'application/json'});res.end(malformed?'not JSON':JSON.stringify({keys}));}).listen(0,'127.0.0.1');await once(jwks,'listening');
  const origin=`http://127.0.0.1:${jwks.address().port}`, issuer=origin+'/auth/v1';
  async function token(claims={},key=a.privateKey,kid='a',alg='ES256'){
    return new SignJWT({iss:issuer,aud:'authenticated',sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+900,...claims}).setProtectedHeader({alg,...(kid===null?{}:{kid})}).sign(key);
  }
  try{await run({origin,token,a,b,setKeys:v=>{keys=v},ja,jb,fetches:()=>fetches,setStatus:v=>{status=v},setMalformed:()=>{malformed=true}})}finally{jwks.closeAllConnections();await new Promise(r=>jwks.close(r));}
}
async function rejectsAuth(promise,status=401,code='AUTH_INVALID'){await assert.rejects(promise,e=>e.status===status&&e.code===code&&e.details.length===0);}

test('T09 config derives exact issuer/JWKS and rejects unsafe origins without revealing values',()=>{
  const c=readAuthConfig('https://project.supabase.co/');assert.equal(c.issuer,'https://project.supabase.co/auth/v1');assert.equal(c.jwksUrl.href,c.issuer+'/.well-known/jwks.json');assert.equal(c.audience,'authenticated');assert.equal(c.algorithm,'ES256');
  assert.ok(readAuthConfig('http://127.0.0.1:54321',false));
  for(const url of [undefined,'bad','http://remote.invalid','https://user:private@host.invalid','https://host.invalid/path','https://host.invalid/?secret=x','https://host.invalid/#x','https://YOUR_PROJECT_REF.supabase.co','https://host.invalid\\path'])assert.throws(()=>readAuthConfig(url),e=>!e.message.includes('private')&&!e.message.includes('secret=x'));
  assert.throws(()=>readAuthConfig('http://localhost:54321',true));
});
test('T09 real ES256 signature and required claims; optional email is not identity',async()=>fixture(async f=>{
  const verify=createTokenVerifier(f.origin);
  assert.deepEqual(await verify(await f.token({email:'fictional@example.invalid',user_metadata:{userId:'untrusted'}})),{userId:id,email:'fictional@example.invalid'});
  assert.deepEqual(await verify(await f.token()),{userId:id});
  for(const claims of [{iss:'https://other.supabase.co/auth/v1'},{aud:'other'},{exp:Math.floor(Date.now()/1000)-1},{exp:undefined},{sub:undefined},{sub:'bad'},{role:undefined},{role:'service_role'},{nbf:Math.floor(Date.now()/1000)+60},{exp:'future'}])await rejectsAuth(verify(await f.token(claims)));
  await rejectsAuth(verify(await f.token({},f.b.privateKey)));
  await rejectsAuth(verify(await f.token({},f.a.privateKey,null)));
  const valid=await f.token();const parts=valid.split('.');parts[1]=Buffer.from(JSON.stringify({sub:id,role:'authenticated'})).toString('base64url');await rejectsAuth(verify(parts.join('.')));
  await rejectsAuth(verify('not-a-jwt'));
  const hs=await new SignJWT({sub:id}).setProtectedHeader({alg:'HS256'}).sign(new Uint8Array(32));await rejectsAuth(verify(hs));
  await rejectsAuth(verify(Buffer.from('{"alg":"none"}').toString('base64url')+'.e30.'));
  const rs=await generateKeyPair('RS256');await rejectsAuth(verify(await f.token({},rs.privateKey,'rsa','RS256')));
}));
test('T09 JWKS caches keys, selects kid, discovers rotation and rejects unknown kid',async()=>fixture(async f=>{
  const verify=createTokenVerifier(f.origin,{cooldownDuration:0});
  await verify(await f.token());await verify(await f.token());assert.equal(f.fetches(),1);
  f.setKeys([f.ja,f.jb]);await verify(await f.token({},f.b.privateKey,'b'));assert.equal(f.fetches(),2);
  await rejectsAuth(verify(await f.token({},f.b.privateKey,'unknown')));
}));
test('T09 unavailable and malformed JWKS fail closed with safe 503',async()=>fixture(async f=>{
  const signed=await f.token();f.setStatus(503);await rejectsAuth(createTokenVerifier(f.origin)(signed),503,'AUTH_UNAVAILABLE');
  f.setStatus(200);f.setMalformed();await rejectsAuth(createTokenVerifier(f.origin)(signed),503,'AUTH_UNAVAILABLE');
}));
test('T09 network and timeout failures fail closed',async()=>{
  const server=createServer(()=>{}).listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  const pair=await generateKeyPair('ES256');const token=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:'a'}).sign(pair.privateKey);
  try{await rejectsAuth(createTokenVerifier(origin,{timeoutDuration:25})(token),503,'AUTH_UNAVAILABLE')}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
  await rejectsAuth(createTokenVerifier(origin)(token),503,'AUTH_UNAVAILABLE');
});
test('T09 HTTP middleware exact errors, trusted context, duplicate headers and no-store',async()=>fixture(async f=>{
  const routes=Router();const guard=createRequireAuth(f.origin);routes.all('/auth-probe',guard,(req,res)=>res.json({data:req.auth}));
  const harness=express();harness.use(express.json());harness.use('/api/v2',routes,errorHandler);const server=harness.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  async function error(header,code='AUTH_REQUIRED',status=401){const r=await fetch(base+'/api/v2/auth-probe',{headers:header===undefined?{}:{Authorization:header}});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/application\/json/);assert.deepEqual(await r.json(),{error:{code,message:code==='AUTH_REQUIRED'?'Sign in to continue.':code==='AUTH_INVALID'?'Your session is no longer valid. Sign in again.':'Authentication is temporarily unavailable. Please try again later.',details:[]}})}
  try{
    for(const header of [undefined,'Basic value','plain-token','Bearer','Bearer ','Bearer a b','Bearer a, Bearer b'])await error(header);
    await error('Bearer not-a-jwt','AUTH_INVALID');await error('Bearer '+await f.token({exp:1}),'AUTH_INVALID');
    const token=await f.token();const r=await fetch(base+'/api/v2/auth-probe?userId=untrusted',{method:'POST',headers:{Authorization:'bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({userId:'untrusted'})});assert.equal(r.status,200);assert.deepEqual(await r.json(),{data:{userId:id}});
    const duplicate=await new Promise((resolve,reject)=>{const q=httpRequest(base+'/api/v2/auth-probe',{headers:{Authorization:['Bearer '+token,'Bearer '+token]}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});q.on('error',reject);q.end()});assert.equal(duplicate,401);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}));
test('T09 V1 and V2 health stay public; CORS preflight permits Authorization only to configured origin',async()=>{
  for(const healthy of [true,false]){const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>healthy}).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;try{
    for(const v of ['v1','v2']){const r=await fetch(base+'/api/'+v+'/health');assert.equal(r.status,healthy?200:503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),healthy?{data:{api:'running',database:'reachable'}}:{error:{code:'DATABASE_UNAVAILABLE',message:'Database is unavailable. Please try again later.',details:[]}})}
    const pre=await fetch(base+'/api/v2/health',{method:'OPTIONS',headers:{Origin:'http://localhost:3000','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'http://localhost:3000');assert.match(pre.headers.get('access-control-allow-headers'),/Authorization/i);
    const other=await fetch(base+'/api/v2/health',{headers:{Origin:'https://evil.invalid'}});assert.notEqual(other.headers.get('access-control-allow-origin'),'https://evil.invalid');
    assert.equal((await fetch(base+'/api/v2/auth/session')).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}}
});
test('T09 missing config fails only protected middleware and never exposes config',async()=>{
  const routes=Router();routes.get('/probe',createRequireAuth(undefined),(_req,res)=>res.json({data:'unexpected'}));const harness=express();harness.use('/api/v2',routes,errorHandler);const server=harness.listen(0,'127.0.0.1');await once(server,'listening');try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v2/probe`,{headers:{Authorization:'Bearer a.b.c'}});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'AUTH_UNAVAILABLE')}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
