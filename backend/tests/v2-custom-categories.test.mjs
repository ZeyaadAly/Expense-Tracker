import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {Client, Pool} from 'pg';
import {createCategoryService} from '../dist/services/categories.js';
import {validateCategoryBody} from '../dist/validators/category.js';
import {isolationUsers, disposableIsolationUrl, prepareIsolationDatabase, createTestUser, createOwnedAccount, createTestAuthHarness, expectApiError} from './helpers/v2-isolation.mjs';

test('T48 exact custom-category body contract', () => {
  assert.deepEqual(validateCategoryBody({name:'  مَصْرُوفات  ',kind:'expense'}),{name:'مَصْرُوفات',kind:'expense',icon:null,color:null});
  assert.deepEqual(validateCategoryBody({name:'Café 🧾',kind:'both',icon:'book',color:'#2563EB'}),{name:'Café 🧾',kind:'both',icon:'book',color:'#2563EB'});
  assert.equal(validateCategoryBody({name:'🧾'.repeat(80),kind:'income'}).name.length,160);
  for(const name of ['', ' '.repeat(2), 'A'.repeat(81), '\u0000bad', '\ud800', '\u200b'])assert.throws(()=>validateCategoryBody({name,kind:'expense'}),e=>e.status===400);
  for(const body of [{name:'Gym',kind:'other'},{name:'Gym',kind:'expense',userId:'x'},{name:'Gym',kind:'expense',isSystem:false},{name:'Gym',kind:'expense',status:'active'},{name:'Gym',kind:'expense',icon:'x'.repeat(65)},{name:'Gym',kind:'expense',color:'x'.repeat(17)}])assert.throws(()=>validateCategoryBody(body),e=>e.status===400);
});

test('T48 real JWT, category lifecycle, references, races and rollback on fresh disposable PostgreSQL', {
  skip: !process.env.T48_DISPOSABLE_DATABASE_URL && 'Requires a fresh loopback PostgreSQL cluster',
}, async context => {
  const url=disposableIsolationUrl(process.env.T48_DISPOSABLE_DATABASE_URL);
  const admin=new Client({connectionString:url.href});await admin.connect();
  let pool,auth;
  const {a,b}=isolationUsers;
  const counters={checks:0,races:0,rollback:0};
  const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);counters.checks++;};
  const fail=(result,status,code)=>{expectApiError(result,status,code);counters.checks++;};
  const input=(name,kind='expense',icon=null,color=null)=>({name,kind,icon,color});
  try {
    await prepareIsolationDatabase(admin);
    await createTestUser(admin,a);await createTestUser(admin,b);
    url.username='expense_tracker_app';pool=new Pool({connectionString:url.href});
    await createOwnedAccount(pool,a,a.account,'A cash');await createOwnedAccount(pool,b,b.account,'B cash');
    auth=await createTestAuthHarness(pool,{categoryManagement:true});
    const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b,{metadataOwner:a.userId});
    const req=(token,path,method='GET',body)=>auth.request(token,'/categories'+path,method,body);
    const fresh=await req(ta,'','POST',input('  Gym  '));
    eq(fresh.status,201);eq(fresh.body.data,{id:fresh.body.data.id,name:'Gym',kind:'expense',icon:null,color:null,status:'active',isSystem:false});
    eq(fresh.location,`/api/v2/categories/${fresh.body.data.id}`);eq(fresh.cache,'no-store');
    const gym=fresh.body.data.id;
    const other=await req(tb,'','POST',input('Gym'));eq(other.status,201);
    eq((await admin.query('SELECT user_id FROM expense_tracker.categories WHERE id=$1',[gym])).rows[0].user_id,a.userId);
    fail(await req(ta,'','POST',input('gYm')),409,'CONFLICT');
    const systemCollision=await req(ta,'','POST',input('Food'));eq(systemCollision.status,201);
    fail(await req(ta,'','POST',input('FOOD')),409,'CONFLICT');
    const active=await req(ta,'');eq(active.status,200);assert.ok(active.body.data.some(row=>row.id===gym));assert.ok(!active.body.data.some(row=>row.id===other.body.data.id));counters.checks++;
    eq((await req(ta,'?kind=both')).body.data.map(row=>row.name),['Other']);
    eq((await req(ta,'?status=archived')).body.data,[]);
    for(const body of [{...input('Bad'),userId:b.userId},{...input('Bad'),id:gym},{...input('Bad'),isArchived:true},{...input('Bad'),createdAt:'now'},{...input('Bad'),ownerId:b.userId},{...input('Bad'),createdBy:b.userId}])fail(await req(ta,'','POST',body),400,'VALIDATION_ERROR');
    for(const query of ['?status=all','?kind=expense&kind=expense','?includeArchived=true'])fail(await req(ta,query),400,'VALIDATION_ERROR');
    fail(await req(null,'','POST',input('No auth')),401,'AUTH_REQUIRED');
    const system='c1200000-0000-4000-8000-000000000004';
    for(const [path,method,body] of [[`/${system}`,'PUT',input('Changed')],[`/${system}/archive`,'POST',{}],[`/${system}/restore`,'POST',{}]])fail(await req(ta,path,method,body),409,'CATEGORY_IMMUTABLE');
    const missing='00000000-0000-4000-8000-000000000000';
    for(const [suffix,method,body] of [['','PUT',input('Stolen')],['/archive','POST',{}],['/restore','POST',{}]]){
      const foreign=await req(tb,`/${gym}${suffix}`,method,body),absent=await req(tb,`/${missing}${suffix}`,method,body);
      fail(foreign,404,'NOT_FOUND');eq(foreign.body,absent.body);
    }
    const initialTimestamps=(await admin.query('SELECT created_at::text,updated_at::text FROM expense_tracker.categories WHERE id=$1',[gym])).rows[0];
    const widened=await req(ta,`/${gym}`,'PUT',input('Gym & Fitness','both','fitness','#123456'));eq(widened.status,200);eq(widened.body.data.kind,'both');
    const changedTimestamps=(await admin.query('SELECT created_at::text,updated_at::text FROM expense_tracker.categories WHERE id=$1',[gym])).rows[0];
    eq(changedTimestamps.created_at,initialTimestamps.created_at);assert.notEqual(changedTimestamps.updated_at,initialTimestamps.updated_at);counters.checks++;
    const unreferenced=(await admin.query('SELECT created_at,updated_at FROM expense_tracker.categories WHERE id=$1',[gym])).rows[0];
    eq((await req(ta,`/${gym}`,'PUT',input('Gym & Fitness','both','fitness','#123456'))).status,200);
    eq((await admin.query('SELECT created_at,updated_at FROM expense_tracker.categories WHERE id=$1',[gym])).rows[0],unreferenced);

    const tx=await auth.request(ta,'/transactions','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'3.00',description:'Membership',date:'1900-01-01'});eq(tx.status,201);
    const income=await auth.request(ta,'/transactions','POST',{accountId:a.account,categoryId:gym,type:'income',amount:'1.00',description:'Refund',date:'1900-01-01'});eq(income.status,201);
    const budget=await auth.request(ta,'/budgets','POST',{categoryId:gym,year:2026,month:2,amount:'10.00',alertThresholdPercent:90});eq(budget.status,201);
    const recurring=await auth.request(ta,'/recurring','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'2.00',description:'Membership renewal',frequency:'monthly',startDate:'2026-01-01',endDate:null});eq(recurring.status,201);
    fail(await req(ta,`/${gym}`,'PUT',input('Gym & Fitness','income','fitness','#123456')),409,'CATEGORY_KIND_LOCKED');
    const totalsBefore=(await admin.query('SELECT user_id,type,sum(amount)::text AS amount FROM expense_tracker.transactions GROUP BY user_id,type ORDER BY user_id,type')).rows;
    const renamed=await req(ta,`/${gym}`,'PUT',input('Fitness','both','fitness','#123456'));eq(renamed.status,200);
    eq((await auth.request(ta,`/transactions/${tx.body.data.id}`)).body.data.categoryName,'Fitness');
    eq((await auth.request(ta,`/recurring/${recurring.body.data.id}`)).body.data.categoryName,'Fitness');
    eq((await auth.request(ta,`/budgets/${budget.body.data.id}`)).body.data.categoryName,'Fitness');
    eq((await admin.query('SELECT user_id,type,sum(amount)::text AS amount FROM expense_tracker.transactions GROUP BY user_id,type ORDER BY user_id,type')).rows,totalsBefore);

    await admin.query(`INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status)
      VALUES($1,$2,'2026-02-01','pending')`,[a.userId,recurring.body.data.id]);
    const archived=await req(ta,`/${gym}/archive`,'POST',{});eq(archived.status,200);eq(archived.body.meta.pausedRecurringCount,1);eq(archived.body.data.status,'archived');
    eq((await req(ta,'?status=archived')).body.data.map(row=>row.id),[gym]);
    eq((await admin.query('SELECT status,next_occurrence FROM expense_tracker.recurring_transactions WHERE id=$1',[recurring.body.data.id])).rows[0].status,'paused');
    eq((await admin.query('SELECT status FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1 AND occurrence_date=$2',[recurring.body.data.id,'2026-02-01'])).rows[0].status,'skipped');
    eq((await auth.request(ta,`/transactions/${tx.body.data.id}`)).body.data.categoryName,'Fitness');
    eq((await auth.request(ta,`/budgets/${budget.body.data.id}`)).body.data.categoryName,'Fitness');
    eq((await auth.request(ta,`/budgets/${budget.body.data.id}`,'PUT',{amount:'12.00',alertThresholdPercent:90})).status,200);
    fail(await auth.request(ta,'/transactions','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'1.00',description:'Blocked',date:'1900-01-01'}),409,'CATEGORY_ARCHIVED');
    fail(await auth.request(ta,'/budgets','POST',{categoryId:gym,year:2026,month:3,amount:'10.00',alertThresholdPercent:90}),409,'CATEGORY_ARCHIVED');
    fail(await auth.request(ta,'/recurring','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'1.00',description:'Blocked renewal',frequency:'monthly',startDate:'2026-01-01',endDate:null}),409,'CATEGORY_ARCHIVED');
    fail(await auth.request(ta,`/recurring/${recurring.body.data.id}/resume`,'POST',{}),409,'CATEGORY_ARCHIVED');
    const archivedAgain=await req(ta,`/${gym}/archive`,'POST',{});eq(archivedAgain.body.meta.pausedRecurringCount,0);eq(archivedAgain.body.data,archived.body.data);
    const restored=await req(ta,`/${gym}/restore`,'POST',{});eq(restored.status,200);eq(restored.body.data.status,'active');
    eq((await req(ta,`/${gym}/restore`,'POST',{})).body.data,restored.body.data);
    eq((await admin.query('SELECT status FROM expense_tracker.recurring_transactions WHERE id=$1',[recurring.body.data.id])).rows[0].status,'paused');
    eq((await auth.request(ta,`/recurring/${recurring.body.data.id}/resume`,'POST',{})).status,200);
    eq((await auth.request(ta,'/transactions','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'0.01',description:'After restore',date:'1900-01-01'})).status,201);
    eq((await auth.request(ta,'/budgets','POST',{categoryId:gym,year:2026,month:3,amount:'10.00',alertThresholdPercent:90})).status,201);
    eq((await auth.request(ta,'/recurring','POST',{accountId:a.account,categoryId:gym,type:'expense',amount:'1.00',description:'After restore renewal',frequency:'monthly',startDate:'2026-01-01',endDate:null})).status,201);

    const duplicate=await Promise.all([req(ta,'','POST',input('Race')),req(ta,'','POST',input('rAcE'))]);
    eq(duplicate.map(x=>x.status).sort(),[201,409]);
    eq((await admin.query("SELECT count(*)::int n FROM expense_tracker.categories WHERE user_id=$1 AND lower(name)='race'",[a.userId])).rows[0].n,1);counters.races++;
    const raceId=duplicate.find(x=>x.status===201).body.data.id;
    const updates=await Promise.all([req(ta,`/${raceId}`,'PUT',input('Race A')),req(ta,`/${raceId}`,'PUT',input('Race B'))]);eq(updates.map(x=>x.status),[200,200]);
    assert.ok(['Race A','Race B'].includes((await admin.query('SELECT name FROM expense_tracker.categories WHERE id=$1',[raceId])).rows[0].name));counters.races++;
    const updateArchive=await Promise.all([req(ta,`/${raceId}`,'PUT',input('Race C')),req(ta,`/${raceId}/archive`,'POST',{})]);eq(updateArchive.map(x=>x.status),[200,200]);eq((await admin.query('SELECT status FROM expense_tracker.categories WHERE id=$1',[raceId])).rows[0].status,'archived');counters.races++;
    const lifecycle=await Promise.all([req(ta,`/${raceId}/restore`,'POST',{}),req(ta,`/${raceId}/archive`,'POST',{})]);eq(lifecycle.map(x=>x.status),[200,200]);
    assert.ok(['active','archived'].includes((await admin.query('SELECT status FROM expense_tracker.categories WHERE id=$1',[raceId])).rows[0].status));counters.races++;

    await req(ta,`/${raceId}/archive`,'POST',{});
    for(const source of ['transaction','budget','recurring']){
      const pair=await req(ta,'','POST',input(`Reference race ${source}`,'both'));eq(pair.status,201);
      const categoryId=pair.body.data.id;
      const create=source==='transaction'
        ? auth.request(ta,'/transactions','POST',{accountId:a.account,categoryId,type:'expense',amount:'0.01',description:'Reference race',date:'1900-01-01'})
        : source==='budget'
          ? auth.request(ta,'/budgets','POST',{categoryId,year:2026,month:4,amount:'1.00',alertThresholdPercent:90})
          : auth.request(ta,'/recurring','POST',{accountId:a.account,categoryId,type:'expense',amount:'1.00',description:'Reference race',frequency:'monthly',startDate:'2026-01-01',endDate:null});
      const [kindChange,reference]=await Promise.all([req(ta,`/${categoryId}`,'PUT',input(`Reference race ${source}`,'income')),create]);
      assert.ok((kindChange.status===200&&reference.status===400)||(kindChange.status===409&&reference.status===201),`${source} reference/kind race must serialize`);
      const actual=(await admin.query('SELECT kind FROM expense_tracker.categories WHERE id=$1',[categoryId])).rows[0].kind;
      eq(actual,kindChange.status===200?'income':'both');counters.races++;
    }

    const baseline=async()=>({categories:(await admin.query('SELECT to_jsonb(c)::text row FROM expense_tracker.categories c ORDER BY id')).rows,recurring:(await admin.query('SELECT to_jsonb(r)::text row FROM expense_tracker.recurring_transactions r ORDER BY id')).rows,occurrences:(await admin.query('SELECT to_jsonb(o)::text row FROM expense_tracker.recurring_occurrences o ORDER BY id')).rows});
    const faultService=createCategoryService({query:(...args)=>pool.query(...args),connect:async()=>{
      const client=await pool.connect();let armed=true;
      return {query:async(...args)=>{const result=await client.query(...args);const sql=String(args[0]);if(armed&&/^(INSERT INTO expense_tracker.categories|UPDATE expense_tracker.categories)/.test(sql)){armed=false;throw Error('injected failure');}return result;},release:(discard)=>client.release(discard)};
    }});
    const state=await baseline();
    for(const operation of [()=>faultService.create(a.userId,input('Rollback create')),()=>faultService.update(a.userId,raceId,input('Rollback rename')),()=>faultService.archive(a.userId,gym),()=>faultService.restore(a.userId,raceId)]){
      await assert.rejects(operation(),/injected failure/);eq(await baseline(),state);counters.rollback++;
    }
    await admin.query(`INSERT INTO expense_tracker.categories(user_id,name,kind)
      SELECT $1,'Scale category '||n,'expense' FROM generate_series(1,1000) AS n`,[a.userId]);
    const count=(await admin.query("SELECT count(*)::int n FROM expense_tracker.categories WHERE (is_system OR user_id=$1) AND status='active'",[a.userId])).rows[0].n;
    const started=performance.now();const rows=(await req(ta,'')).body.data;const elapsedMs=performance.now()-started;
    eq(rows.length,count);assert.ok(elapsedMs<2000,`Local category list took ${elapsedMs.toFixed(1)} ms`);counters.checks++;
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])eq((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.categories',$1) ok",[privilege])).rows[0].ok,true);
    for(const role of ['anon','authenticated'])eq((await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') ok",[role])).rows[0].ok,false);
    context.diagnostic(JSON.stringify({...counters,listMs:Number(elapsedMs.toFixed(2)),migration:false,remoteTouched:false}));
  } finally {if(auth)await auth.close();if(pool)await pool.end();await admin.end();}
});
