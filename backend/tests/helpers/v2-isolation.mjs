// Test-only helpers. Never load application .env or use hosted Auth credentials.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {URL} from 'node:url';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {randomBytes} from 'node:crypto';
import {createApp} from '../../dist/app.js';
import {createProfileService} from '../../dist/services/profiles.js';
import {createCategoryService} from '../../dist/services/categories.js';
import {createTransactionService} from '../../dist/services/transactions.js';
import {createAccountService} from '../../dist/services/accounts.js';
import {createV2TransactionService} from '../../dist/services/v2-transactions.js';
import {createTransferService} from '../../dist/services/transfers.js';
import {categoryMap} from '../../scripts/v2-migration-rehearsal.mjs';
import {createGeneratedFixture} from './generated-fixture.mjs';

function fixture(prefix,name) {
  const id=n=>`${prefix}1600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  return Object.freeze({name,userId:id(1),account:id(2),secondAccount:id(3),incomeCategory:id(4),expenseCategory:id(5),bothCategory:id(6),archivedCategory:id(7),income:id(8),expense:id(9),recurring:id(10),occurrence:id(11),budget:id(12),goal:id(13),transfer:id(14)});
}
export const isolationUsers=Object.freeze({a:fixture('a','A'),b:fixture('b','B'),c:fixture('c','C'),missing:fixture('d','Missing')});
export function disposableIsolationUrl(value) {
  const url=new URL(value||'');
  assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55451');
  assert.equal(url.pathname,'/postgres');assert.equal(url.username,'postgres');
  assert.ok(!url.password&&!url.search&&!url.hash,'Only password-free disposable connections without options are allowed');
  return url;
}
export async function prepareIsolationDatabase(admin,{occurrencePersistence=true}={}) {
  const parameters=admin.connectionParameters;
  disposableIsolationUrl(`postgresql://${parameters.user}@${parameters.host}:${parameters.port}/${parameters.database}`);
  assert.ok(!parameters.password);
  assert.deepEqual((await admin.query("SELECT to_regnamespace('expense_tracker')::text app,to_regnamespace('auth')::text auth")).rows[0],{app:null,auth:null});
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('expense_tracker_app','anon','authenticated')")).rows[0].n,0);
  await admin.query("CREATE TABLE public.t16_disposable_marker(marker text PRIMARY KEY); INSERT INTO public.t16_disposable_marker VALUES('isolated-t16-tests'); CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); REVOKE ALL ON SCHEMA auth FROM PUBLIC; REVOKE ALL ON auth.users FROM PUBLIC;");
  const root=new URL('../../../supabase/',import.meta.url);
  const read=file=>readFileSync(new URL(file,root),'utf8');
  for(const file of ['20261001144302_initial_expense_tracker_schema.sql','20261003163341_backend_application_role.sql'])await admin.query(read('migrations/'+file));
  const t11=readdirSync(new URL('migrations/',root)).filter(f=>/_v2_(core_tables|transaction_references|indexes_and_triggers|runtime_privileges)\.sql$/.test(f)).sort();assert.equal(t11.length,4);
  for(const file of t11)await admin.query(read('migrations/'+file));
  await admin.query(read('seeds/v2-system-categories.sql'));
  const t15=readdirSync(new URL('migrations/',root)).filter(f=>/_v2_ownership_constraints\.sql$/.test(f));assert.equal(t15.length,1);await admin.query(read('migrations/'+t15[0]));
  if(occurrencePersistence)await admin.query(read('migrations/20261008135130_v2_occurrence_invariants.sql'));
  assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n,0);
  return {v1:2,t11:4,t15:1,t32:occurrencePersistence?1:0};
}
export async function createTestUser(admin,user) {await admin.query('INSERT INTO auth.users(id) VALUES($1)',[user.userId]);}
export async function createOwnedAccount(client,user,id,name) {await client.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,$3,'cash')",[id,user.userId,name]);}
export async function createOwnedCustomCategory(client,user,id,kind,status='active') {await client.query('INSERT INTO expense_tracker.categories(id,user_id,name,kind,status) VALUES($1,$2,$3,$4,$5)',[id,user.userId,user.name+' '+kind+' '+status,kind,status]);}
export async function createOwnedFixtures(client,user) {
  await createOwnedAccount(client,user,user.account,user.name+' cash');await createOwnedAccount(client,user,user.secondAccount,user.name+' bank');
  for(const [id,kind,status] of [[user.incomeCategory,'income','active'],[user.expenseCategory,'expense','active'],[user.bothCategory,'both','active'],[user.archivedCategory,'expense','archived']])await createOwnedCustomCategory(client,user,id,kind,status);
  const income=user.name==='A'?'10.00':'20.00',expense=user.name==='A'?'3.00':'7.00';
  await client.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,category,transaction_date) VALUES($1,$2,$3,$4,'income',$5,$6,'other','1900-01-01')",[user.income,user.userId,user.account,categoryMap.salary.id,income,user.name+' retained fixture']);
  await client.query("INSERT INTO expense_tracker.transfers(id,user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,$4,0.50,'1900-01-01')",[user.transfer,user.userId,user.account,user.secondAccount]);
  await client.query("INSERT INTO expense_tracker.recurring_transactions(id,user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES($1,$2,$3,$4,'expense',1.00,'Owned fixture','monthly','1900-01-01','1900-02-01')",[user.recurring,user.userId,user.account,user.expenseCategory]);
  await createGeneratedFixture(client,{id:user.expense,occurrenceId:user.occurrence,userId:user.userId,definitionId:user.recurring,occurrenceDate:'1900-01-01',accountId:user.account,categoryId:user.expenseCategory,type:'expense',amount:expense,description:user.name+' retained fixture',date:'1900-01-01',legacyCategory:'other'},{inTransaction:true});
  await client.query('INSERT INTO expense_tracker.budgets(id,user_id,category_id,amount,year,month) VALUES($1,$2,$3,100.00,2026,1)',[user.budget,user.userId,user.expenseCategory]);
  await client.query("INSERT INTO expense_tracker.goals(id,user_id,name,target_amount,linked_account_id) VALUES($1,$2,$3,100.00,$4)",[user.goal,user.userId,user.name+' goal',user.account]);
}
export async function financialSnapshot(client) {
  const state={};for(const table of ['accounts','categories','transactions','transfers','recurring_transactions','recurring_occurrences','budgets','goals'])state[table]=(await client.query(`SELECT to_jsonb(t)::text row FROM expense_tracker.${table} t ORDER BY to_jsonb(t)::text`)).rows;
  state.totals=(await client.query("SELECT user_id,count(*)::int count,COALESCE(sum(amount) FILTER (WHERE type='income'),0)::text income,COALESCE(sum(amount) FILTER (WHERE type='expense'),0)::text expenses,sum(CASE WHEN type='income' THEN amount ELSE -amount END)::text balance FROM expense_tracker.transactions GROUP BY user_id ORDER BY user_id")).rows;
  state.balances=(await client.query(`SELECT a.id,(a.opening_balance+COALESCE((SELECT sum(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END) FROM expense_tracker.transactions t WHERE t.account_id=a.id),0)+COALESCE((SELECT sum(amount) FROM expense_tracker.transfers WHERE destination_account_id=a.id),0)-COALESCE((SELECT sum(amount) FROM expense_tracker.transfers WHERE source_account_id=a.id),0))::text balance FROM expense_tracker.accounts a ORDER BY a.id`)).rows;
  return state;
}
export async function expectOwnershipRejected(client,statement,params=[],codes=['23514','23503','23502','23505'],snapshot=financialSnapshot) {
  const before=await snapshot(client);
  await client.query('SAVEPOINT ownership_rejection');
  try {await assert.rejects(client.query(statement,params),error=>codes.includes(error.code));}
  finally {await client.query('ROLLBACK TO SAVEPOINT ownership_rejection');await client.query('RELEASE SAVEPOINT ownership_rejection');}
  assert.deepEqual(await snapshot(client),before,'Failed writes must leave every row, timestamp and balance unchanged');
}
export function expectApiError(result,status,code) {
  assert.equal(result.status,status);assert.equal(result.cache,'no-store');
  assert.deepEqual(Object.keys(result.body),['error']);assert.deepEqual(Object.keys(result.body.error).sort(),['code','details','message']);
  assert.equal(result.body.error.code,code);assert.ok(Array.isArray(result.body.error.details));assert.equal(typeof result.body.error.message,'string');
}
export async function expectForeignResourceHidden(request,{token,foreignPath,missingPath,ownPath,code='NOT_FOUND',method='GET',body}) {
  if(code==='NOT_FOUND')assert.ok(ownPath,'Resource authorization checks require an existing owned route');
  if(ownPath)assert.equal((await request(token,ownPath,method,body)).status,200,'Future domain hook must verify the owned route exists');
  const foreign=await request(token,foreignPath,method,body),missing=await request(token,missingPath,method,body);
  expectApiError(foreign,404,code);expectApiError(missing,404,code);assert.deepEqual(foreign.body,missing.body,'Foreign and nonexistent resources must be indistinguishable');
}
export async function createTestAuthHarness(pool,options={cursorSigningSecret:randomBytes(32).toString('hex')}) {
  const pair=await generateKeyPair('ES256'),foreignPair=await generateKeyPair('ES256');
  const key={...await exportJWK(pair.publicKey),kid:'t16-local',alg:'ES256',use:'sig'};
  const jwks=createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({keys:[key]}));}).listen(0,'127.0.0.1');await once(jwks,'listening');
  const origin=`http://127.0.0.1:${jwks.address().port}`;
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:origin,profiles:createProfileService(pool),categories:createCategoryService(pool),accounts:createAccountService(pool),transactions:createTransactionService(pool),v2Transactions:createV2TransactionService(pool,options),transfers:createTransferService(pool,options)}).listen(0,'127.0.0.1');await once(server,'listening');
  async function createTestAuthToken(user,{issuer=origin+'/auth/v1',audience='authenticated',role='authenticated',wrongKey=false,expiration='15m',metadataOwner=isolationUsers.b.userId}={}) {
    return new SignJWT({sub:user.userId,role,user_metadata:{userId:metadataOwner,ownerId:metadataOwner}}).setProtectedHeader({alg:'ES256',kid:key.kid}).setIssuer(issuer).setAudience(audience).setExpirationTime(expiration).sign(wrongKey?foreignPair.privateKey:pair.privateKey);
  }
  async function rawRequest(token,path='/profile',method='GET',body) {
    const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v2${path}`,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:response.status===204?null:await response.json(),cache:response.headers.get('Cache-Control'),location:response.headers.get('Location'),allow:response.headers.get('Allow')};
  }
  async function request(token,path='/profile',method='GET',body) {
    const url=new URL(path,'http://localhost');
    if(method!=='GET'||url.pathname!=='/transactions'||url.searchParams.has('limit')||url.searchParams.has('cursor'))return rawRequest(token,path,method,body);
    // Existing domain regressions deliberately compare full result sets. Traverse the public API, never an unbounded SQL path.
    url.searchParams.set('limit','100');const first=await rawRequest(token,url.pathname+url.search,method,body);
    if(first.status!==200)return first;
    const rows=[...first.body.data];let cursor=first.body.meta.nextCursor;
    while(cursor){url.searchParams.set('cursor',cursor);const page=await rawRequest(token,url.pathname+url.search);assert.equal(page.status,200);rows.push(...page.body.data);cursor=page.body.meta.nextCursor;}
    return {...first,body:{data:rows,meta:{count:rows.length}}};
  }
  async function v1Request(path,method='GET',body) {
    const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cache:response.headers.get('Cache-Control')};
  }
  return {origin,apiOrigin:`http://127.0.0.1:${server.address().port}`,createTestAuthToken,request,rawRequest,v1Request,async close(){server.closeAllConnections();jwks.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>jwks.close(resolve))]);}};
}
