// Test-only T16 entry point. No environment loading or hosted database fallback.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {pathToFileURL} from 'node:url';
import {Client,Pool} from 'pg';
import {categoryMap} from './v2-migration-rehearsal.mjs';
import {verifyAccountApi} from '../tests/helpers/account-api.mjs';
import {verifyAccountBalances} from '../tests/helpers/account-balances.mjs';
import {verifyV2Transactions} from '../tests/helpers/v2-transactions.mjs';
import {verifyV2Search} from '../tests/helpers/v2-search.mjs';
import {verifyV2Filters} from '../tests/helpers/v2-filters.mjs';
import {verifyV2Pagination} from '../tests/helpers/v2-pagination.mjs';
import {verifyV2Transfers} from '../tests/helpers/v2-transfers.mjs';
import {verifyTransferConcurrency} from '../tests/helpers/transfer-concurrency.mjs';
import {isolationUsers,disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createOwnedFixtures,financialSnapshot,expectOwnershipRejected,expectApiError,expectForeignResourceHidden,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';

export async function verifyIsolation(connectionString,options={}) {
  const url=disposableIsolationUrl(connectionString),admin=new Client({connectionString:url.href});await admin.connect();
  let runtime,pool,auth;const logs=[],originalError=console.error;
  const counts={api:0,dbRejections:0,positiveDb:0,boundary:0,concurrent:0};
  const check=(group,label,actual,expected)=>{assert.deepEqual(actual,expected,label);counts[group]++;};
  const apiError=(result,status,code)=>{expectApiError(result,status,code);counts.api++;};
  const {a,b,c,missing}=isolationUsers;
  try {
    const migrations=await prepareIsolationDatabase(admin);await admin.query("SET TIME ZONE 'UTC'");
    for(const user of [a,b,c])await createTestUser(admin,user);
    url.username='expense_tracker_app';runtime=new Client({connectionString:url.href});await runtime.connect();await runtime.query("SET TIME ZONE 'UTC'");pool=new Pool({connectionString:url.href});auth=await createTestAuthHarness(pool);
    const tokens={a:await auth.createTestAuthToken(a),b:await auth.createTestAuthToken(b,{metadataOwner:a.userId}),c:await auth.createTestAuthToken(c)};
    console.error=(...values)=>logs.push(values.map(String).join(' '));
    for(const [path,method,body] of [['/profile','GET'],['/profile','PUT',{displayName:'Test'}],['/profile/bootstrap','POST',{}],['/categories','GET']]) {
      apiError(await auth.request(null,path,method,body),401,'AUTH_REQUIRED');apiError(await auth.request('malformed.token',path,method,body),401,'AUTH_INVALID');
    }
    for(const options of [{issuer:'https://foreign.invalid/auth/v1'},{audience:'foreign'},{role:'anon'},{wrongKey:true},{expiration:0}])apiError(await auth.request(await auth.createTestAuthToken(a,options)),401,'AUTH_INVALID');
    for(const token of Object.values(tokens))apiError(await auth.request(token),409,'PROFILE_REQUIRED');
    const bootstrap=await Promise.all(Array.from({length:12},(_,i)=>auth.request(i%2?tokens.a:tokens.b,'/profile/bootstrap','POST',{})));
    for(let i=0;i<bootstrap.length;i++)check('concurrent','bootstrap identity',[bootstrap[i].status,bootstrap[i].body.data.userId],[200,i%2?a.userId:b.userId]);
    const pa=(await auth.request(tokens.a)).body.data,pb=(await auth.request(tokens.b)).body.data;
    check('api','metadata cannot switch A',pa.userId,a.userId);check('api','metadata cannot switch B',pb.userId,b.userId);check('api','profile defaults',[pa.displayName,pa.preferredCurrency,pa.locale,pa.timezone],[null,'EGP','en','Africa/Cairo']);
    for(const [user,token,profile] of [[a,tokens.a,pa],[b,tokens.b,pb]]) {
      check('api','one profile',(await admin.query('SELECT count(*)::int n FROM expense_tracker.profiles WHERE user_id=$1',[user.userId])).rows[0].n,1);
      check('api','bootstrap preserves timestamps',(await auth.request(token,'/profile/bootstrap','POST',{})).body.data,profile);
    }
    const named=await Promise.all([auth.request(tokens.a,'/profile','PUT',{displayName:'A only'}),auth.request(tokens.b,'/profile','PUT',{displayName:'B only'})]);
    for(let i=0;i<named.length;i++)check('concurrent','profile update identity',[named[i].status,named[i].body.data.userId,named[i].body.data.displayName],[200,i?b.userId:a.userId,i?'B only':'A only']);
    check('api','A creation time',named[0].body.data.createdAt,pa.createdAt);check('api','B creation time',named[1].body.data.createdAt,pb.createdAt);
    await runtime.query('BEGIN');await createOwnedFixtures(runtime,a);await createOwnedFixtures(runtime,b);await runtime.query('COMMIT');
    const baseline=await financialSnapshot(admin);
    check('positiveDb','independent known totals',baseline.totals,[{user_id:a.userId,count:2,income:'10.00',expenses:'3.00',balance:'7.00'},{user_id:b.userId,count:2,income:'20.00',expenses:'7.00',balance:'13.00'}]);
    check('positiveDb','independent known balances',baseline.balances,[{id:a.account,balance:'6.50'},{id:a.secondAccount,balance:'0.50'},{id:b.account,balance:'12.50'},{id:b.secondAccount,balance:'0.50'}]);
    const profilesBefore=(await admin.query('SELECT to_jsonb(p)::text row FROM expense_tracker.profiles p ORDER BY user_id')).rows;
    for(const [token,other] of [[tokens.a,b],[tokens.b,a]]) {
      for(const injection of [{userId:other.userId},{ownerId:other.userId},{createdBy:other.userId},{profileId:other.userId},{user_id:other.userId},{owner:{userId:other.userId}},{profile:{userId:other.userId}},{createdAt:'foreign-timestamp'}]) {
        apiError(await auth.request(token,'/profile','PUT',{displayName:'Injected',...injection}),400,'VALIDATION_ERROR');apiError(await auth.request(token,'/profile/bootstrap','POST',injection),400,'VALIDATION_ERROR');
      }
      for(const query of ['userId','owner','profileId','ownerId','createdBy','user_id'])for(const [path,method,body] of [['/profile','GET'],['/profile','PUT',{displayName:'Injected'}],['/profile/bootstrap','POST',{}],['/categories','GET']])apiError(await auth.request(token,path+'?'+query+'='+other.userId,method,body),400,'VALIDATION_ERROR');
      for(const path of ['/profile/'+other.userId,'/profiles/'+other.userId,'/categories/'+other.expenseCategory]) {
        await expectForeignResourceHidden(auth.request,{token,foreignPath:path,missingPath:path.replace(/[^/]+$/,'00000000-0000-4000-8000-000000000000'),code:'ROUTE_NOT_FOUND'});counts.api++;
      }
      apiError(await auth.request(token,'/profile/not-a-uuid'),404,'ROUTE_NOT_FOUND');
      for(const method of ['PUT','DELETE']) {
        await expectForeignResourceHidden(auth.request,{token,foreignPath:'/profile/'+other.userId,missingPath:'/profile/00000000-0000-4000-8000-000000000000',code:'ROUTE_NOT_FOUND',method,body:method==='PUT'?{displayName:'Injected'}:undefined});counts.api++;
      }
    }
    check('api','injection leaves all profiles unchanged',(await admin.query('SELECT to_jsonb(p)::text row FROM expense_tracker.profiles p ORDER BY user_id')).rows,profilesBefore);
    for(const [user,other,token] of [[a,b,tokens.a],[b,a,tokens.b]]) {
      for(const status of ['active','archived'])for(const kind of [undefined,'income','expense','both']) {
        const response=await auth.request(token,'/categories?status='+status+(kind?'&kind='+kind:''));
        check('api','category success',response.status,200);check('api','category count',response.body.meta.count,response.body.data.length);check('api','category no-store',response.cache,'no-store');
        const expected=(await admin.query("SELECT id FROM expense_tracker.categories WHERE (is_system OR user_id=$1) AND status=$2 AND ($3::text IS NULL OR kind=$3 OR ($3 IN ('income','expense') AND kind='both')) ORDER BY is_system DESC,name COLLATE \"C\",id",[user.userId,status,kind??null])).rows.map(row=>row.id);
        check('api','exact ownership/filter/order',response.body.data.map(row=>row.id),expected);
        assert.ok(response.body.data.every(row=>!Object.values(other).includes(row.id)&&!Object.hasOwn(row,'userId')&&!Object.hasOwn(row,'user_id')));counts.api++;
        check('api','independent category count',response.body.data.length,status==='archived'?(kind==='income'||kind==='both'?0:1):(kind==='income'?6:kind==='expense'?8:kind==='both'?2:12));
      }
      for(const query of ['limit=1','cursor='+other.expenseCategory,'page=1','order=user_id','sort=desc','categoryId='+other.expenseCategory,'id=not-a-uuid','kind=income&kind=expense','status=active&status=archived','kind[]=income','kind=income%27%20OR%201=1--','status=archived%27%20OR%201=1--','kind=','status='])apiError(await auth.request(token,'/categories?'+query),400,'VALIDATION_ERROR');
      for(const method of ['POST','PUT','PATCH','DELETE'])apiError(await auth.request(token,'/categories',method,['POST','PUT'].includes(method)?{userId:other.userId}:undefined),405,'METHOD_NOT_ALLOWED');
    }
    const concurrent=await Promise.all(Array.from({length:18},(_,i)=>{
      const token=i%2?tokens.a:tokens.b;return Promise.all([auth.request(token,'/profile/bootstrap','POST',{}),auth.request(token,'/profile','PUT',{displayName:i%2?'A concurrent':'B concurrent'}),auth.request(token,'/categories?kind=expense')]);
    }));
    for(let i=0;i<concurrent.length;i++) {
      const user=i%2?a:b,other=i%2?b:a;for(const result of concurrent[i])check('concurrent','parallel success',result.status,200);
      check('concurrent','parallel bootstrap owner',concurrent[i][0].body.data.userId,user.userId);check('concurrent','parallel update owner',concurrent[i][1].body.data.userId,user.userId);assert.ok(!concurrent[i][2].body.data.some(row=>row.id===other.expenseCategory||row.id===other.bothCategory));counts.concurrent++;
    }
    for(const [user,token,name] of [[a,tokens.a,'A concurrent'],[b,tokens.b,'B concurrent']]) {const result=await auth.request(token);check('concurrent','final profile identity',[result.body.data.userId,result.body.data.displayName],[user.userId,name]);}
    apiError(await auth.request(tokens.c),409,'PROFILE_REQUIRED');check('api','third user bootstrap',(await auth.request(tokens.c,'/profile/bootstrap','POST',{})).body.data.userId,c.userId);
    const missingToken=await auth.createTestAuthToken(missing);apiError(await auth.request(missingToken,'/profile/bootstrap','POST',{}),500,'INTERNAL_ERROR');
    await runtime.query('BEGIN');
    const reject=async(statement,params,codes)=>{await expectOwnershipRejected(runtime,statement,params,codes);counts.dbRejections++;};
    for(const [user,other] of [[a,b],[b,a]]) {
      const tx="INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,$3,'expense',1.00,'Denied cross-owner payload','1900-01-01')";
      await reject(tx,[user.userId,other.account,user.expenseCategory]);await reject(tx,[user.userId,user.account,other.expenseCategory]);
      for(const [column,value] of [['account_id',other.account],['category_id',other.expenseCategory],['user_id',other.userId],['recurring_transaction_id',other.recurring]])await reject(`UPDATE expense_tracker.transactions SET ${column}=$1 WHERE id=$2`,[value,user.expense]);
      for(const [source,destination] of [[other.account,user.account],[user.account,other.account],[other.account,other.secondAccount]])await reject("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,1.00,'1900-01-01')",[user.userId,source,destination]);
      for(const column of ['source_account_id','destination_account_id'])await reject(`UPDATE expense_tracker.transfers SET ${column}=$1 WHERE id=$2`,[other.account,user.transfer]);
      for(const [account,category] of [[other.account,user.expenseCategory],[user.account,other.expenseCategory]])await reject("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'Denied cross-owner payload','daily','1900-01-01')",[user.userId,account,category]);
      for(const [column,value] of [['account_id',other.account],['category_id',other.expenseCategory]])await reject(`UPDATE expense_tracker.recurring_transactions SET ${column}=$1 WHERE id=$2`,[value,user.recurring]);
      for(const [definition,generated] of [[other.recurring,null],[user.recurring,other.expense]])await reject("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,generated_transaction_id,processed_at) VALUES($1,$2,'1900-03-01','posted',$3,statement_timestamp())",[user.userId,definition,generated]);
      for(const [column,value] of [['recurring_transaction_id',other.recurring],['generated_transaction_id',other.expense]])await reject(`UPDATE expense_tracker.recurring_occurrences SET ${column}=$1 WHERE id=$2`,[value,user.occurrence]);
      await reject("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,'1900-01-01')",[user.userId,user.recurring],['23505']);
      for(const category of [other.expenseCategory,user.incomeCategory,categoryMap.salary.id])await reject('INSERT INTO expense_tracker.budgets(user_id,category_id,amount,year,month) VALUES($1,$2,1.00,2026,2)',[user.userId,category]);
      await reject('UPDATE expense_tracker.budgets SET category_id=$1 WHERE id=$2',[other.expenseCategory,user.budget]);
      await reject("INSERT INTO expense_tracker.goals(user_id,name,target_amount,linked_account_id) VALUES($1,'Denied cross-owner payload',1.00,$2)",[user.userId,other.account]);await reject('UPDATE expense_tracker.goals SET linked_account_id=$1 WHERE id=$2',[other.account,user.goal]);
      await reject('UPDATE expense_tracker.accounts SET user_id=$1 WHERE id=$2',[other.userId,user.account]);await reject('UPDATE expense_tracker.categories SET user_id=$1 WHERE id=$2',[other.userId,user.expenseCategory]);
      // Parameterized ownership predicates below are future SERVICE test patterns.
      for(const [table,id] of [['accounts',other.account],['transactions',other.expense],['transfers',other.transfer],['recurring_transactions',other.recurring],['recurring_occurrences',other.occurrence],['budgets',other.budget],['goals',other.goal]]) {
        check('positiveDb','foreign scoped SELECT '+table,(await runtime.query(`SELECT id FROM expense_tracker.${table} WHERE id=$1 AND user_id=$2`,[id,user.userId])).rows,[]);
        check('positiveDb','foreign scoped UPDATE '+table,(await runtime.query(`UPDATE expense_tracker.${table} SET user_id=user_id WHERE id=$1 AND user_id=$2`,[id,user.userId])).rowCount,0);
        if(table!=='accounts'&&table!=='recurring_occurrences')check('positiveDb','foreign scoped DELETE '+table,(await runtime.query(`DELETE FROM expense_tracker.${table} WHERE id=$1 AND user_id=$2`,[id,user.userId])).rowCount,0);
      }
      check('positiveDb','scoped export query pattern',(await runtime.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY id',[user.userId])).rows.map(row=>row.id),[user.income,user.expense].sort());
      await runtime.query('SAVEPOINT positive_fixtures');
      for(const [type,category] of [['income',categoryMap.salary.id],['expense',categoryMap.food.id],['income',categoryMap.other.id],['expense',categoryMap.other.id]])check('positiveDb','shared category usable',(await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,$3,$4,0.01,'Positive fixture','1900-01-01') RETURNING id",[user.userId,user.account,category,type])).rowCount,1);
      for(const category of [categoryMap.food.id,categoryMap.other.id,user.expenseCategory,user.bothCategory])check('positiveDb','valid budget category',(await runtime.query('INSERT INTO expense_tracker.budgets(user_id,category_id,amount,year,month) VALUES($1,$2,1.00,2026,2) RETURNING id',[user.userId,category])).rowCount,1);
      for(const category of [categoryMap.food.id,user.expenseCategory])check('positiveDb','valid recurring category',(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'Positive fixture','daily','1900-01-01') RETURNING id",[user.userId,user.account,category])).rowCount,1);
      for(const account of [null,user.account])check('positiveDb','nullable/owned goal link',(await runtime.query("INSERT INTO expense_tracker.goals(user_id,name,target_amount,linked_account_id) VALUES($1,'Positive fixture',1.00,$2) RETURNING id",[user.userId,account])).rowCount,1);
      await runtime.query('ROLLBACK TO SAVEPOINT positive_fixtures');await runtime.query('RELEASE SAVEPOINT positive_fixtures');
      await reject("WITH prior AS (UPDATE expense_tracker.transfers SET amount=0.75 WHERE id=$1 RETURNING id) INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) SELECT $2,$3,$4,'expense',1.00,'Atomic rejection','daily','1900-01-01' FROM prior",[user.transfer,user.userId,other.account,user.expenseCategory]);
    }
    check('positiveDb','shared runtime is not tenant scoped',(await runtime.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n,4);await runtime.query('ROLLBACK');
    for(const statement of ['ALTER TABLE expense_tracker.transactions DISABLE TRIGGER v2_category_integrity','ALTER TABLE expense_tracker.transactions DROP CONSTRAINT transactions_account_owner_fk','TRUNCATE expense_tracker.transactions','CREATE TABLE expense_tracker.denied(id int)','CREATE ROLE denied','SET ROLE postgres','SET SESSION AUTHORIZATION postgres','ALTER SCHEMA expense_tracker OWNER TO expense_tracker_app','SELECT * FROM auth.users']) {
      await runtime.query('BEGIN');await expectOwnershipRejected(runtime,statement,[],['42501']);await runtime.query('ROLLBACK');counts.boundary++;
    }
    for(const role of ['anon','authenticated']) {
      check('boundary','private schema '+role,(await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') allowed",[role])).rows[0].allowed,false);
      for(const table of ['profiles','accounts','categories','transactions','transfers','recurring_transactions','recurring_occurrences','budgets','goals'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])check('boundary','browser table privilege',(await admin.query('SELECT has_table_privilege($1,$2,$3) allowed',[role,'expense_tracker.'+table,privilege])).rows[0].allowed,false);
      await admin.query('BEGIN');await admin.query('SET LOCAL ROLE '+role);await assert.rejects(admin.query('SELECT * FROM expense_tracker.transactions'),e=>e.code==='42501');await admin.query('ROLLBACK');counts.boundary++;
      check('boundary','browser function EXECUTE',(await admin.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='expense_tracker'::regnamespace AND has_function_privilege($1,oid,'EXECUTE')",[role])).rows[0].n,0);
    }
    check('boundary','PUBLIC function EXECUTE',(await admin.query("SELECT count(*)::int n FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE p.pronamespace='expense_tracker'::regnamespace AND acl.grantee=0 AND acl.privilege_type='EXECUTE'")).rows[0].n,0);
    check('boundary','runtime attributes',(await admin.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0],{rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false,rolinherit:false});check('boundary','no core RLS',(await admin.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace AND relrowsecurity")).rows[0].n,0);
    const list=await auth.v1Request('/transactions');check('api','V1 list',[list.status,list.body.data.length],[200,4]);check('api','V1 single',(await auth.v1Request('/transactions/'+a.income)).body.data.amount,'10.00');const summary=await auth.v1Request('/summary');check('api','V1 summary',[summary.status,summary.body.data.totalIncome,summary.body.data.totalExpenses,summary.body.data.balance],[200,'30.00','10.00','20.00']);apiError(await auth.v1Request('/transactions','POST',{type:'expense',amount:'1.00',description:'Old V1 probe',category:'other',date:'1900-01-01'}),500,'INTERNAL_ERROR');
    check('positiveDb','complete financial state unchanged',await financialSnapshot(admin),baseline);check('boundary','generic logging only',logs,['Unexpected API error','Unexpected API error']);
    for(const secret of [...Object.values(tokens),missingToken,a.userId,b.userId,'Denied cross-owner payload','Old V1 probe'])assert.ok(!logs.join('\n').includes(secret));counts.boundary++;
    const accounts=await verifyAccountApi({admin,runtime,pool,auth,tokens});
    const balances=await verifyAccountBalances({admin,runtime,pool,auth});
    const transactions=await verifyV2Transactions({admin,runtime,pool,auth});
    const search=await verifyV2Search({admin,runtime,pool,auth});
    const filters=await verifyV2Filters({admin,runtime,pool,auth});
    const pagination=await verifyV2Pagination({admin,runtime,pool,auth});
    const transfers=await verifyV2Transfers({admin,runtime,pool,auth});
    const transferConcurrency=options.transferConcurrency?await verifyTransferConcurrency({admin,runtime,pool,auth}):undefined;
    return {counts,totalChecks:Object.values(counts).reduce((sum,n)=>sum+n,0),accounts,balances,transactions,search,filters,pagination,transfers,...(transferConcurrency?{transferConcurrency}:{}),failures:0,migrations,users:(await admin.query('SELECT count(*)::int n FROM auth.users')).rows[0].n,financialTotals:{count:4,income:'30.00',expenses:'10.00',balance:'20.00'},financialStateUnchangedBeforeAccountLifecycle:true,realJwtMiddleware:true,remoteTouched:false};
  } finally {
    console.error=originalError;if(runtime){await runtime.query('ROLLBACK').catch(()=>{});await runtime.end();}await admin.query('ROLLBACK').catch(()=>{});if(auth)await auth.close();if(pool)await pool.end();await admin.end();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await verifyIsolation(process.env.T16_DISPOSABLE_DATABASE_URL)));}
  catch(error) {console.error('T16 local isolation verification failed:',error.code||error.name,error.message);process.exitCode=1;}
}
