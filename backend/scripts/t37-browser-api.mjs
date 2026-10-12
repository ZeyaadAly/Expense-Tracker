// Synthetic, loopback-only browser harness. No production configuration is loaded.
import assert from 'node:assert/strict';
import process from 'node:process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {ApiError} from '../dist/utils/api-error.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T37_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a3700000-0000-4000-8000-000000000001'},b:{userId:'b3700000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
const now=()=>new Date('2026-10-12T09:00:00Z');url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
const auth=await createTestAuthHarness(pool),tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
const options={cursorSigningSecret:randomBytes(32).toString('hex')},accounts=createAccountService(pool),actuals=createV2TransactionService(pool,options),transfers=createTransferService(pool,options),recurring=createRecurringService(pool,{now}),dashboard=createDashboardService(pool,{now});
let mode='normal';const calls=[],fixture={};const owner=users.a.userId;
const incomeCat='c1200000-0000-4000-8000-000000000001',expenseCat='c1200000-0000-4000-8000-000000000004';
const server=express();server.use(express.json());server.use((_req,res,next)=>{res.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(req,res)=>{const key=req.params.user;assert.ok(key==='a'||key==='b');const time=Math.floor(Date.now()/1000);res.json({access_token:tokens[key],refresh_token:'synthetic-local-only',token_type:'bearer',expires_in:900,expires_at:time+900,user:{id:users[key].userId,email:`${key}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-12T00:00:00Z'}});});
server.post('/test/mode',(req,res)=>{assert.ok(['normal','slow','read-error','auth-error'].includes(req.body.mode));mode=req.body.mode;res.json({ok:true});});
server.get('/test/calls',(_req,res)=>res.json(calls));
server.post('/test/shutdown',(_req,res)=>{res.json({ok:true});setTimeout(()=>process.emit('SIGTERM'),50);});
server.post('/test/seed/:stage',async(req,res)=>{
  const stage=req.params.stage;
  if(stage==='accounts'){
    assert.ok(!fixture.bank);fixture.bank=await accounts.createAccount(owner,{name:'A bank',type:'bank',openingBalance:'100.00'});
    fixture.debt=await accounts.createAccount(owner,{name:'A card',type:'credit_card',openingBalance:'40.00'});
    fixture.credit=await accounts.createAccount(owner,{name:'A overpaid card',type:'credit_card',openingBalance:'-10.00'});
    fixture.negative=await accounts.createAccount(owner,{name:'A archived negative cash',type:'cash',openingBalance:'-20.00'});await accounts.archiveAccount(owner,fixture.negative.id);
  }else if(stage==='actuals'){
    for(const [date,type,amount] of [['2025-10-31','income','1.00'],['2025-11-01','income','2.00'],['2026-04-30','income','3.00'],['2026-05-01','income','4.00'],['2026-07-31','income','5.00'],['2026-08-01','income','6.00'],['2026-08-31','expense','0.10'],['2026-09-01','income','7.00'],['2026-09-30','expense','0.20'],['2026-10-01','income','0.10'],['2026-10-12','income','0.20'],['2026-10-12','expense','0.40']])await actuals.createTransaction(owner,{accountId:fixture.bank.id,categoryId:type==='income'?incomeCat:expenseCat,type,amount,date,description:`Boundary ${date} ${type}`});
  }else if(stage==='transfer')await transfers.createTransfer(owner,{sourceAccountId:fixture.bank.id,destinationAccountId:fixture.debt.id,amount:'25.00',date:'2026-10-12',description:'Card payment'});
  else if(stage==='recurring')fixture.recurring=await recurring.createRecurring(owner,{accountId:fixture.bank.id,categoryId:incomeCat,type:'income',amount:'0.10',description:'Daily generated income',frequency:'daily',startDate:'2026-10-12',endDate:null});
  else assert.fail('Unknown stage');res.json({ok:true,fixture});
});
server.post('/test/process',async(_req,res)=>res.json(await createRecurringProcessor(pool).processDueRecurring({referenceDate:'2026-10-12'})));
server.post('/test/delete-generated',async(_req,res)=>{
  const row=(await pool.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 AND recurring_transaction_id IS NOT NULL',[owner])).rows[0];assert.ok(row);await actuals.deleteTransaction(owner,row.id);
  res.json({markers:(await pool.query("SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE user_id=$1",[owner])).rows});
});
server.post('/test/stress',async(_req,res)=>{
  for(let i=0;i<3;i++)await actuals.createTransaction(owner,{accountId:fixture.bank.id,categoryId:expenseCat,type:'expense',amount:'999999999.99',date:'2026-10-12',description:'Long expense '+('x'.repeat(187))});
  await actuals.createTransaction(owner,{accountId:fixture.debt.id,categoryId:incomeCat,type:'income',amount:'999999999.99',date:'2026-10-12',description:'Card credit'});res.json({ok:true});
});
server.get('/test/state',async(_req,res)=>res.json({fixture,accounts:await accounts.listAccounts(owner,'active'),archived:await accounts.listAccounts(owner,'archived'),summary:await accounts.getSummary(owner),transactions:await actuals.listTransactions(owner,{limit:5}),upcoming:await recurring.upcomingRecurring(owner,30),role:(await pool.query('SELECT current_user role')).rows[0].role}));
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,accounts,profiles:createProfileService(pool),categories:createCategoryService(pool),transactions:createTransactionService(pool),v2Transactions:actuals,transfers,recurring,dashboard:{getDashboard:async(...args)=>{
  const current=mode;calls.push({user:args[0]===owner?'a':'b',period:args[1]});
  if(current==='read-error')throw new ApiError(503,'DATABASE_UNAVAILABLE','Unavailable.');
  if(current==='auth-error')throw new ApiError(401,'AUTH_INVALID','Session expired.');
  const result=await dashboard.getDashboard(...args);if(current==='slow')await pause(1400);return result;
}}}));
const listener=server.listen(4000,'127.0.0.1');await once(listener,'listening');process.stdout.write('T37 local disposable API ready\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await auth.close();await pool.end();await admin.end();process.exit(0);});
