import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {Client, Pool} from 'pg';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';
import {createApp} from '../dist/app.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {validateCategoryQuery} from '../dist/validators/category.js';

const expected = [
  ['Salary','income'], ['Freelance','income'], ['Gift','income'], ['Food','expense'],
  ['Transport','expense'], ['Shopping','expense'], ['Bills','expense'], ['Entertainment','expense'], ['Other','both'],
].map(([name,kind],i)=>({id:`c1200000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,kind,icon:null,color:null,status:'active',isSystem:true}));
test('T12 strict category query validation and applicability inputs',()=>{
  assert.deepEqual(validateCategoryQuery('/api/v2/categories'),{status:'active'});
  assert.deepEqual(validateCategoryQuery('/api/v2/categories?kind=both&status=archived'),{kind:'both',status:'archived'});
  for(const query of ['kind=all','kind=','status=all','status=','kind=income&kind=expense','kind=income&kind=income','status=active&status=archived','userId=x','kind[]=income','unknown=true']) {
    assert.throws(()=>validateCategoryQuery('/api/v2/categories?'+query),e=>e.status===400&&e.code==='VALIDATION_ERROR');
  }
});

test('T12 real seed rerun, authenticated category reads, cross-user isolation and private privileges', {
  skip: !process.env.T12_DISPOSABLE_DATABASE_URL && 'Requires explicitly selected migrated disposable PostgreSQL',
}, async()=>{
  const url=new URL(process.env.T12_DISPOSABLE_DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55451');assert.equal(url.pathname,'/postgres');
  assert.equal(url.username,'postgres');assert.equal(url.password,'');
  const admin=new Client({connectionString:url.href});await admin.connect();
  url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
  const a='a1200000-0000-4000-8000-000000000001', b='b1200000-0000-4000-8000-000000000001';
  const pair=await generateKeyPair('ES256');const key={...await exportJWK(pair.publicKey),kid:'t12',alg:'ES256',use:'sig'};
  const jwks=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[key]}));}).listen(0,'127.0.0.1');await once(jwks,'listening');
  const origin=`http://127.0.0.1:${jwks.address().port}`;
  const service=createCategoryService(pool);
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,categories:service,supabaseUrl:origin,
    transactions:createTransactionService(pool)}).listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const token=async sub=>new SignJWT({sub,role:'authenticated'}).setProtectedHeader({alg:'ES256',kid:'t12'}).setIssuer(origin+'/auth/v1').setAudience('authenticated').setExpirationTime('15m').sign(pair.privateKey);
  const ta=await token(a),tb=await token(b);
  async function request(path='',auth=ta,method='GET') {
    const res=await globalThis.fetch(base+'/api/v2/categories'+path,{method,headers:auth?{Authorization:'Bearer '+auth}:{}});
    return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};
  }
  const seed=readFileSync(new URL('../../supabase/seeds/v2-system-categories.sql',import.meta.url),'utf8');
  const rows=async()=> (await admin.query('SELECT * FROM expense_tracker.categories ORDER BY id')).rows;
  const legacy=async()=> (await admin.query('SELECT * FROM expense_tracker.transactions ORDER BY id')).rows;
  try {
    assert.ok([0,9].includes((await admin.query('SELECT count(*)::int n FROM expense_tracker.categories')).rows[0].n));
    const baseline=await legacy();const summary=await createTransactionService(pool).summary();
    await admin.query(seed);
    assert.deepEqual((await service.list(a,{status:'active'})).toSorted((x,y)=>x.id.localeCompare(y.id)),expected);
    const seeded=await rows();await admin.query(seed);assert.deepEqual(await rows(),seeded);
    assert.equal(seeded.length,9);assert.ok(seeded.every(r=>r.user_id===null&&r.is_system&&r.status==='active'));
    assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.profiles')).rows[0].n,0);
    const list=await request();assert.equal(list.status,200);assert.equal(list.cache,'no-store');assert.equal(list.body.meta.count,9);
    assert.deepEqual(list.body.data.map(r=>r.name),['Bills','Entertainment','Food','Freelance','Gift','Other','Salary','Shopping','Transport']);
    assert.ok(list.body.data.every(r=>Object.keys(r).sort().join(',')==='color,icon,id,isSystem,kind,name,status'));
    assert.equal((await request('',null)).status,401);assert.equal((await request('','invalid')).status,401);
    assert.deepEqual((await request('?kind=income')).body.data.map(r=>r.name),['Freelance','Gift','Other','Salary']);
    assert.deepEqual((await request('?kind=expense')).body.data.map(r=>r.name),['Bills','Entertainment','Food','Other','Shopping','Transport']);
    assert.deepEqual((await request('?kind=both')).body.data.map(r=>r.name),['Other']);
    await admin.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[a,b]);
    await admin.query(`INSERT INTO expense_tracker.categories(id,user_id,name,kind,status) VALUES
      ('a1200000-0000-4000-8000-000000000002',$1,'A custom','expense','active'),
      ('a1200000-0000-4000-8000-000000000003',$1,'A archived','income','archived'),
      ('b1200000-0000-4000-8000-000000000002',$2,'B custom','both','active')`,[a,b]);
    const withCustom=await rows();await admin.query(seed);assert.deepEqual(await rows(),withCustom);
    const ar=(await request()).body.data,br=(await request('',tb)).body.data;
    assert.equal(ar.length,10);assert.equal(br.length,10);assert.equal(ar.at(-1).name,'A custom');assert.equal(br.at(-1).name,'B custom');
    assert.ok(!ar.some(r=>r.name==='B custom'||r.status==='archived'));assert.ok(!br.some(r=>r.name.startsWith('A ')));
    assert.deepEqual((await request('?status=archived')).body.data.map(r=>r.name),['A archived']);
    assert.deepEqual((await request('?status=archived',tb)).body.data,[]);
    for(const q of ['?kind=bad','?status=bad','?kind=income&kind=expense','?userId='+b,'?kind[]=income','?status=active&status=active']) {
      const invalid=await request(q);assert.equal(invalid.status,400);assert.equal(invalid.body.error.code,'VALIDATION_ERROR');
    }
    for(const method of ['POST','PUT','PATCH','DELETE','HEAD']) assert.equal((await globalThis.fetch(base+'/api/v2/categories',{method,headers:{Authorization:'Bearer '+ta,'Content-Type':'application/json'}})).status,405);
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.categories',$1) ok",[privilege])).rows[0].ok,true);
    for(const role of ['anon','authenticated']) {
      assert.equal((await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') ok",[role])).rows[0].ok,false);
      for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await admin.query("SELECT has_table_privilege($1,'expense_tracker.categories',$2) ok",[role,privilege])).rows[0].ok,false);
      await admin.query('BEGIN');await admin.query('SET LOCAL ROLE '+role);
      await assert.rejects(admin.query('SELECT * FROM expense_tracker.categories'),e=>e.code==='42501');await admin.query('ROLLBACK');
    }
    assert.deepEqual(await legacy(),baseline);assert.deepEqual(await createTransactionService(pool).summary(),summary);
    const v1=await globalThis.fetch(base+'/api/v1/transactions');assert.equal(v1.status,200);
    assert.ok((await v1.json()).data.every(r=>typeof r.category==='string'));
    assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE user_id IS NOT NULL OR account_id IS NOT NULL OR category_id IS NOT NULL')).rows[0].n,0);
  } finally {
    await admin.query('ROLLBACK');
    await admin.query('DELETE FROM expense_tracker.categories WHERE user_id IN ($1,$2)',[a,b]);
    await admin.query('DELETE FROM auth.users WHERE id IN ($1,$2)',[a,b]);
    server.closeAllConnections();jwks.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>jwks.close(r))]);
    await pool.end();await admin.end();
  }
});
