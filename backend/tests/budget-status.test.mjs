import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {Client,Pool} from 'pg';
import {createAccountService} from '../dist/services/accounts.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness,expectApiError} from './helpers/v2-isolation.mjs';

test('T43 failed status reads return safe errors, never fabricated normal progress',async()=>{
  for(const [status,code,dbCode]of [[503,'DATABASE_UNAVAILABLE','ECONNREFUSED'],[500,'INTERNAL_ERROR',undefined]]){
    const fail=async()=>{throw Object.assign(Error('private SQL expense_tracker status failure'),{code:dbCode});};
    const auth=await createTestAuthHarness({query:fail,connect:fail});
    try{const token=await auth.createTestAuthToken({userId:randomUUID()});for(const path of ['/budgets?year=2026&month=10','/budgets/'+randomUUID()]){
      const result=await auth.rawRequest(token,path);expectApiError(result,status,code);assert.equal(result.body.data,undefined);assert.doesNotMatch(JSON.stringify(result.body),/private|SQL|expense_tracker|normal|stack/);
    }}finally{await auth.close();}
  }
});

test('T43 exact status boundaries, dynamic transitions and committed snapshots through real JWT HTTP',{
  skip:!process.env.T43_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL cluster',
},async context=>{
  const url=disposableIsolationUrl(process.env.T43_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();let pool,auth,checks=0,boundaries=0;
  const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:5});
    const a={userId:randomUUID()},b={userId:randomUUID()};for(const u of [a,b])await createTestUser(admin,u);
    auth=await createTestAuthHarness(pool);const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b);
    const accounts=createAccountService(pool),account=await accounts.createAccount(a.userId,{name:'A status',type:'cash',openingBalance:'0.00'}),other=await accounts.createAccount(a.userId,{name:'A movement',type:'bank',openingBalance:'0.00'}),bAccount=await accounts.createAccount(b.userId,{name:'B status',type:'cash',openingBalance:'0.00'});
    const request=(path,method='GET',body,token=ta)=>auth.rawRequest(token,path,method,body);
    const category=async(name,owner=a.userId)=>(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,$2,'both') RETURNING id",[owner,name])).rows[0].id;
    const budget=async(categoryId,amount,month=10,threshold,token=ta)=>{const r=await request('/budgets','POST',{categoryId,amount,year:2026,month,...(threshold===undefined?{}:{alertThresholdPercent:threshold})},token);equal(r.status,201);return r.body.data;};
    const expense=async(categoryId,amount,date='2026-10-01',type='expense',token=ta,accountId=account.id)=>{const r=await request('/transactions','POST',{accountId,categoryId,amount,date,type,description:'Status actual'},token);equal(r.status,201);return r.body.data;};
    const edit=async(tx,patch)=>{const r=await request('/transactions/'+tx.id,'PUT',{accountId:tx.accountId,categoryId:tx.categoryId,type:tx.type,amount:tx.amount,date:tx.date,description:tx.description,...patch});equal(r.status,200);return r.body.data;};
    const remove=async tx=>equal((await request('/transactions/'+tx.id,'DELETE')).status,204);
    const read=async(plan,expected,token=ta)=>{
      const single=await request('/budgets/'+plan.id,'GET',undefined,token);equal(single.status,200);
      const list=await request(`/budgets?year=${plan.year}&month=${plan.month}`,'GET',undefined,token);equal(list.status,200);equal(list.body.data.find(r=>r.id===plan.id),single.body.data);
      equal([single.body.data.spent,single.body.data.remaining,single.body.data.percentUsed,single.body.data.status],expected);
      equal(single.body.data.createdAt,plan.createdAt);equal(single.body.data.updatedAt,plan.updatedAt);
      return single.body.data;
    };
    // All expected financial strings are fixed fixtures; no financial JS arithmetic.
    const cases=[
      ['zero','1000.00',[],undefined,'0.00','1000.00','0.00','normal'],
      ['small','1000.00',['0.01'],undefined,'0.01','999.99','0.00','normal'],
      ['below rounded90','1000.00',['899.99'],undefined,'899.99','100.01','90.00','normal'],
      ['tie rounded90','200.00',['179.99'],undefined,'179.99','20.01','90.00','normal'],
      ['exact90','1000.00',['900.00'],undefined,'900.00','100.00','90.00','near_limit'],
      ['above rounded90','1000.00',['900.01'],undefined,'900.01','99.99','90.00','near_limit'],
      ['below rounded100','1000.00',['999.99'],undefined,'999.99','0.01','100.00','near_limit'],
      ['exact100','1000.00',['1000.00'],undefined,'1000.00','0.00','100.00','near_limit'],
      ['above rounded100','1000.00',['1000.01'],undefined,'1000.01','-0.01','100.00','exceeded'],
      ['over100','1000.00',['1200.00'],undefined,'1200.00','-200.00','120.00','exceeded'],
      ['minimum zero','0.01',[],undefined,'0.00','0.01','0.00','normal'],
      ['minimum at','0.01',['0.01'],undefined,'0.01','0.00','100.00','near_limit'],
      ['minimum exceeded','0.01',['0.01','0.01'],undefined,'0.02','-0.01','200.00','exceeded'],
      ['exact decimals','0.30',['0.10','0.20'],undefined,'0.30','0.00','100.00','near_limit'],
      ['round tie','32.00',['0.04'],undefined,'0.04','31.96','0.13','normal'],
      ['round small tie','200.00',['0.01'],undefined,'0.01','199.99','0.01','normal'],
      ['threshold1 zero','1.00',[],1,'0.00','1.00','0.00','normal'],
      ['threshold1 at','1.00',['0.01'],1,'0.01','0.99','1.00','near_limit'],
      ['threshold100 below','1000.00',['999.99'],100,'999.99','0.01','100.00','normal'],
      ['threshold100 at','1000.00',['1000.00'],100,'1000.00','0.00','100.00','near_limit'],
      ['large below','999999999.99',['999999999.98'],100,'999999999.98','0.01','100.00','normal'],
      ['large at','999999999.99',['999999999.99'],100,'999999999.99','0.00','100.00','near_limit'],
      ['large above','999999999.99',['999999999.99','0.01'],100,'1000000000.00','-0.01','100.00','exceeded'],
    ];
    for(const [name,amount,amounts,threshold,...expected]of cases){
      const c=await category(name),p=await budget(c,amount,10,threshold);equal(p.alertThresholdPercent,threshold??90);
      for(const amount of amounts)await expense(c,amount);
      const before=(await pool.query('SELECT to_jsonb(b) AS row FROM expense_tracker.budgets b WHERE id=$1',[p.id])).rows[0];
      const first=await read(p,expected);equal(await read(p,expected),first);
      equal((await pool.query('SELECT to_jsonb(b) AS row FROM expense_tracker.budgets b WHERE id=$1',[p.id])).rows[0],before);boundaries++;
    }
    const c=await category('Status progression'),p=await budget(c,'100.00'),september=await budget(c,'100.00',9),c2=await category('Destination'),p2=await budget(c2,'100.00');
    const normal=['0.00','100.00','0.00','normal'],near=['90.00','10.00','90.00','near_limit'],over=['110.00','-10.00','110.00','exceeded'];
    let t=await expense(c,'10.00');await read(p,['10.00','90.00','10.00','normal']);const t2=await expense(c,'80.00');await read(p,near);const t3=await expense(c,'20.00');await read(p,over);
    await remove(t3);await read(p,near);await remove(t2);await read(p,['10.00','90.00','10.00','normal']);
    t=await edit(t,{amount:'110.00'});await read(p,over);t=await edit(t,{categoryId:c2});await read(p,normal);await read(p2,over);
    t=await edit(t,{categoryId:c,date:'2026-09-30'});await read(p2,normal);await read(p,normal);await read(september,over);await remove(t);await read(september,normal);
    // Posted recurring amount crosses the threshold once; deletion restores normal.
    const recurring=await createRecurringService(pool,{now:()=>new Date('2026-10-13T09:00:00Z')}).createRecurring(a.userId,{accountId:account.id,categoryId:c,type:'expense',amount:'90.00',description:'Status generated',frequency:'daily',startDate:'2026-10-13',endDate:'2026-10-13'});
    const processor=createRecurringProcessor(pool);await read(p,normal);equal((await processor.processDueRecurring({referenceDate:'2026-10-13',definitionId:recurring.id,userId:a.userId})).posted,1);await read(p,near);equal((await processor.processDueRecurring({referenceDate:'2026-10-13',definitionId:recurring.id,userId:a.userId})).posted,0);await read(p,near);
    const generated=(await pool.query('SELECT id FROM expense_tracker.transactions WHERE recurring_transaction_id=$1',[recurring.id])).rows[0];await remove(generated);await read(p,normal);
    equal((await pool.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[recurring.id])).rows[0],{status:'posted',generated_transaction_id:null});
    await expense(c,'999999999.99','2026-10-01','income');const movement=await request('/transfers','POST',{sourceAccountId:account.id,destinationAccountId:other.id,amount:'999999999.99',date:'2026-10-01',description:'Status transfer'});equal(movement.status,201);await read(p,normal);
    const history=await expense(c,'110.00');await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[c]);await read(p,over);await remove(history);await read(p,normal);
    // Same system category/month and same custom name cannot share spending across tenants.
    const system='c1200000-0000-4000-8000-000000000004',pa=await budget(system,'100.00'),pb=await budget(system,'100.00',10,undefined,tb);
    await expense(system,'110.00');await read(pa,over);await read(pb,normal,tb);
    await expense(system,'80.00','2026-10-01','expense',tb,bAccount.id);await read(pb,['80.00','20.00','80.00','normal'],tb);await read(pa,over);
    const bc=await category('Destination',b.userId),bp=await budget(bc,'100.00',10,undefined,tb);await read(bp,normal,tb);expectApiError(await request('/budgets/'+pa.id,'GET',undefined,tb),404,'NOT_FOUND');checks++;
    await expense(c2,'110.00');await read(p2,over);await read(bp,normal,tb);
    // Keep a writer uncommitted while HTTP reads continue: insert/update/delete snapshots must be coherent.
    const cc=await category('Concurrent status'),cp=await budget(cc,'100.00'),writer=await pool.connect(),id=randomUUID();let concurrent=0;
    try{
      await writer.query('BEGIN');await writer.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',90.00,'Concurrent status','2026-10-01')",[id,a.userId,account.id,cc]);await read(cp,normal);await writer.query('COMMIT');await read(cp,near);concurrent++;
      await writer.query('BEGIN');await writer.query('UPDATE expense_tracker.transactions SET amount=110.00 WHERE id=$1',[id]);await read(cp,near);await writer.query('ROLLBACK');await read(cp,near);concurrent++;
      await writer.query('BEGIN');await writer.query('UPDATE expense_tracker.transactions SET amount=110.00 WHERE id=$1',[id]);await read(cp,near);await writer.query('COMMIT');await read(cp,over);concurrent++;
      await writer.query('BEGIN');await writer.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[id]);await read(cp,over);await writer.query('ROLLBACK');await read(cp,over);concurrent++;
      await writer.query('BEGIN');await writer.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[id]);await read(cp,over);await writer.query('COMMIT');await read(cp,normal);concurrent++;
      await writer.query('BEGIN');await writer.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',110.00,'Rolled back status','2026-10-01')",[randomUUID(),a.userId,account.id,cc]);await read(cp,normal);await writer.query('ROLLBACK');await read(cp,normal);concurrent++;
    }finally{await writer.query('ROLLBACK');writer.release();}
    // Updating only threshold/amount changes classification; immutable fields remain rejected.
    const thresholdCategory=await category('Configurable threshold'),tp=await budget(thresholdCategory,'100.00');await expense(thresholdCategory,'80.00');await read(tp,['80.00','20.00','80.00','normal']);
    const changed=await request('/budgets/'+tp.id,'PUT',{amount:'100.00',alertThresholdPercent:75});equal(changed.status,200);await read(changed.body.data,['80.00','20.00','80.00','near_limit']);
    const amountChanged=await request('/budgets/'+tp.id,'PUT',{amount:'50.00',alertThresholdPercent:75});equal(amountChanged.status,200);await read(amountChanged.body.data,['80.00','-30.00','160.00','exceeded']);
    expectApiError(await request('/budgets/'+tp.id,'PUT',{amount:'50.00',alertThresholdPercent:75,categoryId:cc,year:2025,month:1}),400,'VALIDATION_ERROR');checks++;
    const columns=(await admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='budgets'")).rows.map(r=>r.column_name);assert.ok(!columns.some(c=>/status|spent|remaining|percent_used/.test(c)));checks++;
    context.diagnostic(JSON.stringify({task:'T43',checks,boundaryCases:boundaries,concurrentVisibilityCases:concurrent,realJwt:true,readDeterminism:true,implementationChanged:false,remoteTouched:false}));
  }finally{await auth?.close();await pool?.end();await admin.end();}
});
