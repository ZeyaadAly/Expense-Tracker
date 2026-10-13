// Synthetic loopback-only T46 browser harness. Never load application .env.
import assert from 'node:assert/strict';
import process from 'node:process';
import {once} from 'node:events';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createGoalService} from '../dist/services/goals.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAnalyticsService} from '../dist/services/analytics.js';
import {ApiError} from '../dist/utils/api-error.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser,financialSnapshot} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T46_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a3700000-0000-4000-8000-000000000001'},b:{userId:'b3700000-0000-4000-8000-000000000001'}};for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
const auth=await createTestAuthHarness(pool),tokens={a:await auth.createTestAuthToken(users.a,{expiration:'2h'}),b:await auth.createTestAuthToken(users.b,{expiration:'2h'})};
const accounts=createAccountService(pool),goals=createGoalService(pool),actuals=createV2TransactionService(pool),transfers=createTransferService(pool),dashboard=createDashboardService(pool,{now:()=>new Date('2026-10-13T09:00:00Z')}),analytics=createAnalyticsService(pool),owner=users.a.userId;
const fixture={},calls=[];let mode='normal',failNextList=false;
const server=express();server.use(express.json());server.use((_req,res,next)=>{res.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(req,res)=>{const who=req.params.user;assert.ok(who==='a'||who==='b');const time=Math.floor(Date.now()/1000);res.json({access_token:tokens[who],refresh_token:'synthetic-local-only',token_type:'bearer',expires_in:7200,expires_at:time+7200,user:{id:users[who].userId,email:`${who}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-12T00:00:00Z'}});});
server.post('/test/mode',(req,res)=>{assert.ok(['normal','slow','read-error','auth-error','not-found','lost-write','saved-stale','slow-write','validation'].includes(req.body.mode));mode=req.body.mode;res.json({ok:true});});
server.get('/test/calls',(_req,res)=>res.json(calls));
server.get('/test/financial',async(_req,res)=>{const state=await financialSnapshot(admin);delete state.goals;res.json({state,dashboard:(await dashboard.getDashboard(owner,'this_month')).summary,analytics:(await analytics.getOverview(owner,{from:'2026-10-01',to:'2026-10-13'})).summary});});
server.post('/test/accounts',async(_req,res)=>{
  fixture.bank=await accounts.createAccount(owner,{name:'A savings reference',type:'bank',openingBalance:'100.00'});
  fixture.second=await accounts.createAccount(owner,{name:'A second reference',type:'cash',openingBalance:'50.00'});
  fixture.archived=await accounts.createAccount(owner,{name:'Archived choice',type:'cash',openingBalance:'0.00'});await accounts.archiveAccount(owner,fixture.archived.id);
  fixture.foreign=await accounts.createAccount(users.b.userId,{name:'B private reference',type:'cash',openingBalance:'0.00'});res.json(fixture);
});
server.post('/test/activity',async(_req,res)=>{
  await actuals.createTransaction(owner,{accountId:fixture.bank.id,categoryId:'c1200000-0000-4000-8000-000000000001',type:'income',amount:'999999999.99',description:'Metadata only proof',date:'2026-10-13'});
  await transfers.createTransfer(owner,{sourceAccountId:fixture.bank.id,destinationAccountId:fixture.second.id,amount:'10.00',description:null,date:'2026-10-13'});res.json({ok:true});
});
server.post('/test/archive-account',async(_req,res)=>res.json(await accounts.archiveAccount(owner,fixture.bank.id)));
server.post('/test/stress',async(_req,res)=>{
  const reference=await accounts.createAccount(owner,{name:'حساب طويل '+('x'.repeat(88)),type:'savings',openingBalance:'0.00'});
  for(const [name,targetAmount,savedAmount,linkedAccountId,status]of [['Zero saved','999999999.99','0.00',null,'active'],['Rounded display below target','10000.00','9999.99',null,'active'],['هدف طويل '+('😀'.repeat(110)),'0.01','999999999.99',reference.id,'active'],['Completed reference','0.30','0.30',reference.id,'completed'],['Archived reference','0.30','0.40',reference.id,'archived']]){
    const g=await goals.createGoal(owner,{name,targetAmount,savedAmount,linkedAccountId,targetDate:'9999-12-31'});if(status==='completed')await goals.completeGoal(owner,g.id);if(status==='archived')await goals.archiveGoal(owner,g.id);
  }await accounts.archiveAccount(owner,reference.id);res.json({ok:true});
});
server.post('/test/shutdown',(_req,res)=>{res.json({ok:true});setTimeout(()=>process.emit('SIGTERM'),50);});
server.use(async(req,res,next)=>{
  if(req.path.startsWith('/api/v2/goals')&&['POST','PUT'].includes(req.method)){
    calls.push({path:req.path,method:req.method});const current=mode;
    if(current==='slow-write')await pause(1200);
    if(current==='validation')return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Check fields.',details:[{field:'name',message:'Choose a different goal name.'}]}});
    // Flush headers before losing the body, as in T44. Dropping a reused socket
    // before headers can make Chromium retransmit below the application layer.
    const json=res.json.bind(res);res.json=body=>{if(current==='lost-write'&&res.statusCode<300){res.writeHead(500,{'Content-Type':'application/json'});res.flushHeaders();req.socket.destroy();return res;}if(current==='saved-stale'&&res.statusCode<300)failNextList=true;return json(body);};
  }next();
});
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,profiles:createProfileService(pool),accounts,goals:{...goals,
  listGoals:async(...args)=>{const current=mode;if(current==='read-error'||failNextList){failNextList=false;throw new ApiError(503,'DATABASE_UNAVAILABLE','Unavailable.');}if(current==='auth-error')throw new ApiError(401,'AUTH_INVALID','Expired.');const rows=await goals.listGoals(...args);if(current==='slow')await pause(1400);return rows;},
  getGoal:async(...args)=>{if(mode==='not-found')throw new ApiError(404,'NOT_FOUND','Unavailable.');return goals.getGoal(...args);},
}}));
const listener=server.listen(4000,'127.0.0.1');await once(listener,'listening');process.stdout.write('T46 local disposable API ready\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await auth.close();await pool.end();await admin.end();process.exit(0);});
