// Isolated, disposable T49 browser API. No application .env is loaded.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import pg from 'pg';
import express from 'express';
import { createApp } from '../dist/app.js';
import { createProfileService } from '../dist/services/profiles.js';
import { createCategoryService } from '../dist/services/categories.js';
import { createAccountService } from '../dist/services/accounts.js';
import { createV2TransactionService } from '../dist/services/v2-transactions.js';
import { createRecurringService } from '../dist/services/recurring.js';
import { createBudgetService } from '../dist/services/budgets.js';
import { createDashboardService } from '../dist/services/dashboard.js';
import { createAnalyticsService } from '../dist/services/analytics.js';
import { createTestAuthHarness, prepareIsolationDatabase, disposableIsolationUrl, createTestUser, financialSnapshot } from '../tests/helpers/v2-isolation.mjs';
const {Client,Pool}=pg;

const url=disposableIsolationUrl(process.env.T49_DISPOSABLE_DATABASE_URL);
const admin=new Client({connectionString:url.href});await admin.connect();
await prepareIsolationDatabase(admin);
const users={a:{userId:'a4900000-0000-4000-8000-000000000001'},b:{userId:'b4900000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
const auth=await createTestAuthHarness(pool,{categoryManagement:true});
const tokens={a:await auth.createTestAuthToken(users.a,{expiration:'2h'}),b:await auth.createTestAuthToken(users.b,{expiration:'2h'})};
const dashboard=createDashboardService(pool,{now:()=>new Date('2026-10-13T09:00:00Z')}),analytics=createAnalyticsService(pool);
let mode='normal',nextReadFailure=false;const calls=[];
const server=express();server.use(express.json());
server.use((req,res,next)=>{res.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(req,res)=>{const which=req.params.user;assert.ok(which==='a'||which==='b');const time=Math.floor(Date.now()/1000);res.json({access_token:tokens[which],refresh_token:'synthetic-local-only',token_type:'bearer',expires_in:7200,expires_at:time+7200,user:{id:users[which].userId,email:`${which}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-13T00:00:00Z'}});});
server.post('/test/mode',(req,res)=>{assert.ok(['normal','profile-read-error','category-read-error','lost-write','saved-stale','auth-error'].includes(req.body.mode));mode=req.body.mode;res.json({ok:true});});
server.get('/test/calls',(_req,res)=>res.json(calls));
server.get('/test/financial',async(_req,res)=>{const snapshot=await financialSnapshot(admin);res.json({balances:snapshot.balances,totals:snapshot.totals,dashboard:(await dashboard.getDashboard(users.a.userId,'this_month')).summary,analytics:(await analytics.getOverview(users.a.userId,{from:'2026-10-01',to:'2026-10-13'})).summary});});
server.use((req,res,next)=>{
  if(req.path.startsWith('/api/v2/')){
    const isCategory=req.path.startsWith('/api/v2/categories'),isProfile=req.path.startsWith('/api/v2/profile');
    if(isCategory||isProfile){calls.push({path:req.path,method:req.method});
      if(req.method==='GET'&&((isCategory&&mode==='category-read-error')||(isProfile&&mode==='profile-read-error')||nextReadFailure)){nextReadFailure=false;return res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Unavailable',details:[]}});}
      if(mode==='auth-error')return res.status(401).json({error:{code:'AUTH_INVALID',message:'Expired',details:[]}});
      if(req.method!=='GET'&&mode==='saved-stale')nextReadFailure=true;
      if(req.method!=='GET'&&mode==='lost-write'){const json=res.json.bind(res);res.json=body=>{if(res.statusCode<300){res.writeHead(500,{'Content-Type':'application/json'});res.flushHeaders();req.socket.destroy();return res;}return json(body);};}
    }
  }next();
});
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,profiles:createProfileService(pool),categories:createCategoryService(pool),categoryManagement:true,accounts:createAccountService(pool),v2Transactions:createV2TransactionService(pool,{cursorSigningSecret:'49'.repeat(32)}),recurring:createRecurringService(pool),budgets:createBudgetService(pool),dashboard,analytics}));
const listener=server.listen(4000,'127.0.0.1');await once(listener,'listening');process.stdout.write('T49 disposable API ready\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await auth.close();await pool.end();await admin.end();process.exit(0);});
