// Companion for the T63 benchmark's already seeded, disposable database.
/* global process, console, Buffer, fetch */
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {Client,Pool} from 'pg';
import {disposableIsolationUrl,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T63_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
assert.equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),realpathSync(resolve('.tmp-v2-t63/pgdata')));await admin.end();
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href,max:5});
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:'63'.repeat(32),dashboardOptions:{now:()=>new Date('2026-10-17T09:00:00Z')}});
const sessions={};for(const [who,id]of [['a','b6300000-0000-4000-8000-000000000001'],['b','a6300000-0000-4000-8000-000000000001']])sessions[who]={access_token:await auth.createTestAuthToken({userId:id},{expiration:'2h'}),refresh_token:'synthetic-local-only',token_type:'bearer',expires_in:7200,expires_at:Math.floor(Date.now()/1000)+7200,user:{id,email:who+'@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-17T00:00:00Z'}};
const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','http://localhost:3000');res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(req.url.startsWith('/test/session/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(sessions[req.url.split('/').at(-1)]));}assert.ok(req.url.startsWith('/api/'));const chunks=[];for await(const c of req)chunks.push(c);const response=await fetch(auth.apiOrigin+req.url,{method:req.method,headers:{...(req.headers.authorization?{authorization:req.headers.authorization}:{}),'content-type':'application/json'},...(chunks.length?{body:Buffer.concat(chunks)}:{})});res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));}).listen(4000,'127.0.0.1');
console.log('T63 local browser API ready');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.closeAllConnections();server.close();await auth.close();await pool.end();process.exit(0);});
