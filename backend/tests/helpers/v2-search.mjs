import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRegressionTransactionService as createV2TransactionService} from './transaction-pages.mjs';
import {createTestUser,financialSnapshot} from './v2-isolation.mjs';

export async function verifyV2Search({admin,runtime,pool,auth}) {
  const a={userId:'a2200000-0000-4000-8000-000000000001'},b={userId:'b2200000-0000-4000-8000-000000000001'};
  for(const user of [a,b])await createTestUser(admin,user);
  const tokens={a:await auth.createTestAuthToken(a,{metadataOwner:b.userId}),b:await auth.createTestAuthToken(b,{metadataOwner:a.userId})};
  let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const refs={};
  for(const [key,user] of [['a',a],['b',b]]) {
    refs[key]={accounts:[],categories:[]};
    for(const name of [key==='a'?'AOnly Salary بنك Café':'BOnly Wallet',key+' ordinary',key+' archive']) {
      const id=randomUUID();await runtime.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,$3,'bank')",[id,user.userId,name]);refs[key].accounts.push(id);
    }
    for(const name of [key==='a'?'AOnly Transport مواصلات Résumé':'BOnly Category',key+' ordinary',key+' archive']) {
      const id=randomUUID();await runtime.query("INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,'expense')",[id,user.userId,name]);refs[key].categories.push(id);
    }
  }
  const sys='c1200000-0000-4000-8000-000000000004',rows=[];
  async function insert(description,{key='a',account=1,category=1,date='1900-01-01',categoryId}={}) {
    const id=randomUUID();await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',123.45,$5,$6)",[id,key==='a'?a.userId:b.userId,refs[key].accounts[account],categoryId??refs[key].categories[category],description,date]);rows.push(id);return id;
  }
  const description=await insert('AOnly Groceries at CaRrEfOuR'),account=await insert('Unrelated account purchase',{account:0}),category=await insert('Unrelated category purchase',{category:0});
  const system=await insert('Unrelated system purchase',{categoryId:sys});
  const arabic=await insert('زيارة القاهرة'),accent=await insert('Déjeuner café résumé'),mixed=await insert('MiXeD English');
  const percent=await insert('Save 20% monthly'),underscore=await insert('Plan_A'),slash=await insert(String.raw`Path C:\folder\\backup`),bang=await insert('Wow! 20%_'),quote=await insert('He said "O\'Brien"');
  await insert('Save 200 monthly');await insert('PlanZA');await insert('Neutral unrelated');
  const injection=await insert("' OR 1=1 --"),drop=await insert("%'; DROP TABLE expense_tracker.transactions; --"),long=await insert('😀'.repeat(200));
  const archived=await insert('Archived unique history',{account:2,category:2});
  await auth.request(tokens.a,'/accounts/'+refs.a.accounts[2]+'/archive','POST',{});
  await runtime.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[refs.a.categories[2]]);
  const bRow=await insert('BOnly unique description',{key:'b',account:0,category:0});
  const tied=[randomUUID(),randomUUID()];
  await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$3,$4,$5,'expense',0.01,'OrderNeedle one','1900-02-01'),($2,$3,$4,$5,'expense',0.01,'OrderNeedle two','1900-02-01')",[...tied,a.userId,refs.a.accounts[1],refs.a.categories[1]]);
  const newer=await insert('OrderNeedle newer',{date:'1900-02-01'}),laterDate=await insert('OrderNeedle later date',{date:'1900-02-02'});
  async function search(q,key='a') {
    const response=await auth.request(tokens[key],'/transactions?q='+encodeURIComponent(q));equal(response.status,200);equal(response.cache,'no-store');equal(response.body.meta,{count:response.body.data.length});equal(new Set(response.body.data.map(row=>row.id)).size,response.body.data.length);return response.body.data;
  }
  async function match(q,ids,key='a') {equal((await search(q,key)).map(row=>row.id).sort(),[...ids].sort());}
  const snapshot=await financialSnapshot(admin);
  for(const [q,ids] of [
    ['carrefour',[description]],['  rReFo  ',[description]],['SALARY',[account]],['transport',[category]],['Food',[system]],
    ['القاهرة',[arabic]],['بنك',[account]],['مواصلات',[category]],['café',[accent,account]],['résumé',[accent,category]],['mixed english',[mixed]],
    ['20%',[percent,bang]],['%',[percent,bang,drop]],['_',[underscore,bang,drop]],['Plan_',[underscore]],
    [String.raw`\folder`,[slash]],[String.raw`\\`,[slash]],['!',[bang]],['! 20%_',[bang]],['"',[quote]],["O'Brien",[quote]],
    ["' OR 1=1 --",[injection]],["%'; DROP TABLE expense_tracker.transactions; --",[drop]],['😀'.repeat(200),[long]],
    ['a archive',[archived]],['Archived unique',[archived]],['NoMatchingNeedle',[]],['123.45',[]],[a.userId,[]],[refs.a.accounts[0],[]],
  ])await match(q,ids);
  for(const term of ['AOnly Groceries','AOnly Salary','AOnly Transport','a archive'])await match(term,[],'b');
  for(const term of ['BOnly unique description','BOnly Wallet','BOnly Category'])await match(term,[],'a');
  await match('BOnly',[bRow],'b');
  const ordered=await search('OrderNeedle');equal(ordered.map(row=>row.id),[laterDate,newer,...tied.sort().reverse()]);equal(ordered[2].createdAt,ordered[3].createdAt);
  const list=await auth.request(tokens.a,'/transactions');equal(list.status,200);
  for(const q of ['', ' \t\n '])equal(await search(q),list.body.data);
  equal((await search('carrefour'))[0],list.body.data.find(row=>row.id===description));
  for(const query of ['q=a&q=b','q=&q=','q[]=a','q[term]=a','q='+encodeURIComponent('😀'.repeat(201)),'q=%00','q=a&userId='+a.userId,'q=a&accountId=bad','q=a&type=Income','limit=0','cursor=x']) {
    const response=await auth.request(tokens.a,'/transactions?'+query);equal(response.status,400);equal(response.body.error.code,'VALIDATION_ERROR');
  }
  equal((await auth.request(null,'/transactions?q=AOnly')).status,401);equal((await auth.request('invalid.token','/transactions?q=AOnly')).status,401);
  equal(await financialSnapshot(admin),snapshot);

  // 10,000 rows per owner, multiple accounts/categories and controlled matching terms.
  for(const [key,user] of [['a',a],['b',b]])await runtime.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date)
    SELECT gen_random_uuid(),$1,($2::uuid[])[1+(g%2)],($3::uuid[])[1+(g%2)],'expense',1.00,
      CASE WHEN g%100=0 THEN $4 ELSE 'ordinary scale purchase '||g END,'1901-01-01'::date+(g%365)
    FROM generate_series(1,10000) g`,[user.userId,refs[key].accounts.slice(0,2),refs[key].categories.slice(0,2),key==='a'?'AScaleNeedle':'BScaleNeedle']);
  for(const table of ['transactions','accounts','categories'])await admin.query('ANALYZE expense_tracker.'+table);
  const performance=[];
  const measured=createV2TransactionService({query:async(sql,params)=>{
    if(!sql.includes('(t.transaction_date,t.created_at,t.id)<')) { const plan=(await runtime.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,params)).rows[0]['QUERY PLAN'][0];
    performance.push({term:params[1],planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],rows:plan.Plan['Actual Rows']}); }
    return pool.query(sql,params);
  }});
  equal((await measured.listTransactions(a.userId,{q:'AScaleNeedle'})).length,100);
  equal((await measured.listTransactions(b.userId,{q:'AScaleNeedle'})).length,0);
  equal((await measured.listTransactions(b.userId,{q:'BScaleNeedle'})).length,100);
  equal((await measured.listTransactions(a.userId,{q:'Salary'})).length,5001);
  equal((await measured.listTransactions(a.userId,{q:'Transport'})).length,5001);
  const scaled=await search('AScaleNeedle');equal(scaled.length,100);await match('AScaleNeedle',[],'b');await match('BScaleNeedle',[],'a');equal((await search('BScaleNeedle','b')).length,100);
  equal((await runtime.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE user_id=ANY($1::uuid[])',[ [a.userId,b.userId] ])).rows[0].n,20000+rows.length+tied.length);
  return {checks,rowsPerOwner:10000,performance,realJwtMiddleware:true,archivedHistory:true,literalWildcards:true,unicode:true,remoteTouched:false};
}
