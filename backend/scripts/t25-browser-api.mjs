// Test-only guarded loopback API; real routers/auth/services/Postgres, no .env.
import assert from 'node:assert/strict';
import process from 'node:process';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser} from '../tests/helpers/v2-isolation.mjs';
import {ApiError} from '../dist/utils/api-error.js';
const url=disposableIsolationUrl(process.env.T25_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a2500000-0000-4000-8000-000000000001'},b:{userId:'b2500000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href}),auth=await createTestAuthHarness(pool),tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
const secret=randomBytes(32).toString('hex'),service=createV2TransactionService(pool,{cursorSigningSecret:secret}),expired=createV2TransactionService(pool,{cursorSigningSecret:secret,now:()=>Date.now()+25*3600000});
const accounts=createAccountService(pool);const choices={};
for(const [key,user] of Object.entries(users)) {
  choices[key]={cash:await accounts.createAccount(user.userId,{name:`${key.toUpperCase()} Cash`,type:'cash',openingBalance:'0.00',currency:'EGP'}),bank:await accounts.createAccount(user.userId,{name:`${key.toUpperCase()} Bank`,type:'bank',openingBalance:'0.00',currency:'EGP'})};
  await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,$2,'expense')",[user.userId,key.toUpperCase()+' Custom food']);
}
let mode='normal';const calls=[];
const fail=()=>{throw new ApiError(503,'DATABASE_UNAVAILABLE','Unavailable.');};
function record(operation,user,query){calls.push({operation,user:user===users.a.userId?'a':'b',...(query?{query:{...query,cursor:query.cursor?true:undefined}}:{})});}
const wrapped={...service,
  async listTransactions(user,query){record('list',user,query);const current=mode;if(current==='read-error')fail();const page=await(current==='expired'&&query.cursor?expired:service).listTransactions(user,query);if(current==='slow')await pause(query.q==='slow'?1600:700);return page;},
  async createTransaction(user,input){record('create',user);if(mode==='validation')throw new ApiError(400,'VALIDATION_ERROR','Check fields.',[{field:'amount',message:'Choose a different amount for this synthetic validation probe.'}]);if(mode==='reject')fail();if(mode==='pending')await pause(1200);const row=await service.createTransaction(user,input);if(mode==='saved-refresh-error')mode='read-error';if(mode==='uncertain')throw new ApiError(500,'INTERNAL_ERROR','Sanitized test failure.');return row;},
  async updateTransaction(user,id,input){record('edit',user);if(mode==='missing')throw new ApiError(404,'NOT_FOUND','Unavailable.');const row=await service.updateTransaction(user,id,input);if(mode==='saved-refresh-error')mode='read-error';if(mode==='uncertain')throw new ApiError(500,'INTERNAL_ERROR','Sanitized test failure.');return row;},
  async deleteTransaction(user,id){record('delete',user);if(mode==='pending')await pause(1200);await service.deleteTransaction(user,id);if(mode==='saved-refresh-error')mode='read-error';if(mode==='uncertain')throw new ApiError(500,'INTERNAL_ERROR','Sanitized test failure.');},
};
const server=express();server.use(express.json());server.use((_request,response,next)=>{response.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(request,response)=>{const key=request.params.user;assert.ok(key==='a'||key==='b');const now=Math.floor(Date.now()/1000);response.json({access_token:tokens[key],refresh_token:'local-fixture-only',token_type:'bearer',expires_in:900,expires_at:now+900,user:{id:users[key].userId,email:`${key}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-08T00:00:00Z'}});});
server.post('/test/mode',(request,response)=>{assert.ok(['normal','slow','expired','read-error','validation','reject','pending','saved-refresh-error','uncertain','missing'].includes(request.body.mode));mode=request.body.mode;response.json({ok:true});});
server.get('/test/choices',(_request,response)=>response.json(choices));server.get('/test/calls',(_request,response)=>response.json(calls));
server.post('/test/archive-category',async(request,response)=>{
  const result=await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1 AND user_id=$2 AND is_system=false RETURNING id",[request.body.id,users.a.userId]);
  assert.equal(result.rowCount,1);response.json({ok:true});
});
server.post('/test/seed',async(_request,response)=>{
  for(let i=0;i<26;i++)await service.createTransaction(users.a.userId,{accountId:choices.a.cash.id,categoryId:'c1200000-0000-4000-8000-000000000004',type:'expense',amount:i===0?'999999999.99':'0.01',date:'2025-10-01',description:i===0?'Page posting '+ 'L'.repeat(187):'Page posting '+String(i).padStart(2,'0')});
  const definition=randomUUID(),generated=randomUUID();
  await pool.query("INSERT INTO expense_tracker.recurring_transactions(id,user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES($1,$2,$3,'c1200000-0000-4000-8000-000000000004','expense',1.00,'Synthetic recurring schedule','monthly','1900-01-01','1900-02-01')",[definition,users.a.userId,choices.a.cash.id]);
  await pool.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id,recurring_occurrence_date) VALUES($1,$2,$3,'c1200000-0000-4000-8000-000000000004','expense',1.00,'Generated posting','1900-01-01',$4,'1900-01-01')",[generated,users.a.userId,choices.a.cash.id,definition]);
  await pool.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,generated_transaction_id,processed_at) VALUES($1,$2,'1900-01-01','posted',$3,statement_timestamp())",[users.a.userId,definition,generated]);
  response.json({ok:true,generated});
});
server.get('/test/state',async(_request,response)=>response.json({counts:(await admin.query('SELECT user_id,count(*)::int FROM expense_tracker.transactions GROUP BY user_id')).rows,occurrences:(await admin.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences')).rows}));
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,accounts,categories:createCategoryService(pool),profiles:createProfileService(pool),transactions:createTransactionService(pool),v2Transactions:wrapped}));
const listener=server.listen(4000,'127.0.0.1',()=>process.stdout.write('T25 local fixture API ready\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(r=>listener.close(r));await auth.close();await pool.end();await admin.end();process.exit(0);});
