import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {Client,Pool} from 'pg';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createApp} from '../dist/app.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {validateProfileBody} from '../dist/validators/profile.js';

test('T13 strict displayName-only validation, empty bootstrap and Unicode boundaries',()=>{
  assert.deepEqual(validateProfileBody({displayName:'  القاهرة 😀  '}),{displayName:'القاهرة 😀'});
  assert.deepEqual(validateProfileBody({displayName:'😀'.repeat(100)}),{displayName:'😀'.repeat(100)});
  assert.deepEqual(validateProfileBody({displayName:null}),{displayName:null});
  assert.equal(validateProfileBody({},true),undefined);
  for(const input of [null,[],{},'bad',{displayName:''},{displayName:'  '},{displayName:1},{displayName:'😀'.repeat(101)},{displayName:'a\0b'},{displayName:'a\nb'},{displayName:'\ud800'},{displayName:'A',userId:'B'},{displayName:'A',locale:'en'},{displayName:'A',timezone:'Africa/Cairo'},{displayName:'A',preferredCurrency:'EGP'},{email:'x'}]) assert.throws(()=>validateProfileBody(input),e=>e.code==='VALIDATION_ERROR');
  for(const input of [undefined,null,[],{userId:'x'},{displayName:'A'}]) assert.throws(()=>validateProfileBody(input,true),e=>e.code==='VALIDATION_ERROR');
});

async function harness(service,run) {
  const pair=await generateKeyPair('ES256');const jwk={...await exportJWK(pair.publicKey),kid:'t13',alg:'ES256',use:'sig'};
  const jwks=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}));}).listen(0,'127.0.0.1');await once(jwks,'listening');
  const origin=`http://127.0.0.1:${jwks.address().port}`;
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,profiles:service,supabaseUrl:origin}).listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/v2`;
  async function token(sub) {return new SignJWT({sub,role:'authenticated',user_metadata:{display_name:'untrusted'}}).setProtectedHeader({alg:'ES256',kid:'t13'}).setIssuer(origin+'/auth/v1').setAudience('authenticated').setExpirationTime('15m').sign(pair.privateKey);}
  async function request(auth,path='/profile',method='GET',body) {
    const res=await globalThis.fetch(base+path,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};
  }
  try {await run({token,request});} finally {server.closeAllConnections();jwks.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>jwks.close(r))]);}
}
test('T13 auth/validation block service calls and database failures are sanitized',async()=>{
  let calls=0,failure;
  const service={};for(const name of ['get','ensureProfile','update'])service[name]=async()=>{calls++;throw failure;};
  await harness(service,async({token,request})=>{
    const auth=await token('a1300000-0000-4000-8000-000000000001');
    assert.equal((await request(null)).status,401);
    assert.equal((await request(null,'/profile/bootstrap','POST',{})).status,401);
    assert.equal((await request(null,'/profile','PUT',{displayName:'A'})).status,401);
    for(const path of ['/profile?userId=x','/profile?locale=en'])assert.equal((await request(auth,path)).status,400);
    assert.equal((await request(auth,'/profile','PUT',{displayName:'A',userId:'B'})).status,400);
    assert.equal((await request(auth,'/profile/bootstrap','POST',{displayName:'A'})).status,400);assert.equal(calls,0);
    for(const code of ['ECONNREFUSED','23503','unexpected']) {
      failure=Object.assign(new Error('private SQL details'),{code});
      for(const [path,method,body] of [['/profile','GET'],['/profile/bootstrap','POST',{}],['/profile','PUT',{displayName:'A'}]]) {
        const result=await request(auth,path,method,body);assert.equal(result.status,code==='ECONNREFUSED'?503:500);
        assert.ok(!JSON.stringify(result).includes('private SQL'));assert.equal(result.cache,'no-store');
      }
    }
  });
});

test('T13 disposable runtime bootstrap concurrency, timestamps, ownership, defaults and V1 preservation',{
  skip:!process.env.T13_DISPOSABLE_DATABASE_URL&&'Requires explicit disposable PostgreSQL with T11/T12',
},async()=>{
  const url=new URL(process.env.T13_DISPOSABLE_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55451');assert.equal(url.pathname,'/postgres');assert.equal(url.username,'postgres');assert.equal(url.password,'');
  const admin=new Client({connectionString:url.href});await admin.connect();url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
  const service=createProfileService(pool),a='a1300000-0000-4000-8000-000000000001',b='b1300000-0000-4000-8000-000000000001',missing='c1300000-0000-4000-8000-000000000001';
  try {
    await admin.query(readFileSync(new URL('../../supabase/seeds/v2-system-categories.sql',import.meta.url),'utf8'));
    const original=(await admin.query('SELECT * FROM expense_tracker.transactions ORDER BY id')).rows;
    const totals=await createTransactionService(pool).summary();
    await admin.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[a,b]);
    await harness(service,async({token,request})=>{
      const ta=await token(a),tb=await token(b);
      assert.equal((await request(ta)).body.error.code,'PROFILE_REQUIRED');
      assert.equal((await request(ta,'/profile','PUT',{displayName:'A'})).status,409);
      assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.profiles WHERE user_id=$1',[a])).rows[0].n,0);
      const results=await Promise.all(Array.from({length:12},()=>request(ta,'/profile/bootstrap','POST',{})));
      assert.ok(results.every(r=>r.status===200));const first=results[0].body.data;
      assert.ok(results.every(r=>JSON.stringify(r.body.data)===JSON.stringify(first)));
      assert.deepEqual({...first,createdAt:null,updatedAt:null},{userId:a,displayName:null,preferredCurrency:'EGP',locale:'en',timezone:'Africa/Cairo',createdAt:null,updatedAt:null});
      assert.match(first.createdAt,/Z$/);assert.equal(first.createdAt,first.updatedAt);
      assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.profiles WHERE user_id=$1',[a])).rows[0].n,1);
      assert.deepEqual((await request(ta)).body.data,first);assert.deepEqual((await request(ta,'/profile/bootstrap','POST',{})).body.data,first);
      const second=(await request(tb,'/profile/bootstrap','POST',{})).body.data;assert.equal(second.userId,b);
      const updated=await request(ta,'/profile','PUT',{displayName:'  القاهرة 😀  '});assert.equal(updated.status,200);assert.equal(updated.body.data.displayName,'القاهرة 😀');assert.equal(updated.body.data.createdAt,first.createdAt);assert.notEqual(updated.body.data.updatedAt,first.updatedAt);
      assert.deepEqual((await request(ta)).body,updated.body);
      assert.deepEqual((await request(ta,'/profile','PUT',{displayName:'القاهرة 😀'})).body,updated.body);
      assert.deepEqual((await request(ta,'/profile/bootstrap','POST',{})).body,updated.body);
      assert.deepEqual((await request(tb)).body.data,second);
      for(const body of [{displayName:'A',userId:b},{displayName:'A',locale:'ar'},{displayName:'A',timezone:'UTC'},{displayName:'A',email:'x'},{displayName:'A',updatedAt:'x'}])assert.equal((await request(ta,'/profile','PUT',body)).status,400);
      assert.equal((await request(ta,'/profiles/'+b)).status,404);
      assert.deepEqual((await request(tb)).body.data,second);
      assert.equal((await request(ta,'/profile','PUT',{displayName:null})).body.data.displayName,null);
      const invalid=await request(await token(missing),'/profile/bootstrap','POST',{});assert.equal(invalid.status,500);assert.equal(invalid.body.error.code,'INTERNAL_ERROR');assert.ok(!JSON.stringify(invalid.body).includes('foreign'));
      for(const role of ['anon','authenticated']) {
        assert.equal((await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') ok",[role])).rows[0].ok,false);
        for(const p of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await admin.query("SELECT has_table_privilege($1,'expense_tracker.profiles',$2) ok",[role,p])).rows[0].ok,false);
      }
      for(const p of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.profiles',$1) ok",[p])).rows[0].ok,true);
      await assert.rejects(pool.query('SELECT * FROM auth.users'),e=>e.code==='42501');
      assert.deepEqual((await admin.query('SELECT * FROM expense_tracker.transactions ORDER BY id')).rows,original);assert.deepEqual(await createTransactionService(pool).summary(),totals);
      assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.accounts')).rows[0].n,0);
    });
  } finally {
    await admin.query('DELETE FROM expense_tracker.profiles WHERE user_id IN ($1,$2)',[a,b]);await admin.query('DELETE FROM auth.users WHERE id IN ($1,$2)',[a,b]);await pool.end();await admin.end();
  }
});
