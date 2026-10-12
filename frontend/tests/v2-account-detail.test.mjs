import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transportSource=readFileSync(new URL('../src/lib/api/v2-client.ts',import.meta.url),'utf8').replace('import { getAccessToken } from "../auth/auth-service";','const getAccessToken=async()=>({data:null,error:null});');
const transportUrl=compile(transportSource),{createV2ApiClient,V2ApiError}=await import(transportUrl);
const domainSource=readFileSync(new URL('../src/lib/api/accounts.ts',import.meta.url),'utf8').replace('from "./v2-client"',`from "${transportUrl}"`).replace('import { getSession } from "../auth/auth-service";','const getSession=async()=>({data:null,error:null});');
const {createAccountClient}=await import(compile(domainSource));
const {createAccountsStore}=await import(compile(readFileSync(new URL('../src/lib/accounts-store.ts',import.meta.url),'utf8')));
const id='a1900000-0000-4000-8000-000000000001';
const account={id,name:'Bank',type:'bank',openingBalance:'0.00',currentBalance:'0.30',currency:'EGP',status:'active',openingBalanceEditable:true,createdAt:'2026-10-07T12:00:00.000Z',updatedAt:'2026-10-07T12:00:00.000Z'};
const summary={netPosition:'0.30',currency:'EGP'};
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
const fake=(overrides={})=>({listAccounts:async()=>[account],getSummary:async()=>summary,...overrides});
const tick=()=>new Promise(r=>setTimeout(r,0));

const detailSummary={currentBalance:'0.30',openingBalance:'0.00',totalIncome:'0.30',totalExpenses:'0.00',incomingTransfers:'0.00',outgoingTransfers:'0.00',currency:'EGP'};
const detailFake=(overrides={})=>({...fake(),getAccount:async()=>account,getAccountSummary:async()=>detailSummary,...overrides});
test('T20 authenticated detail and summary reads preserve exact list balance and strict resource IDs',async()=>{
  const calls=[];const client=createAccountClient('owner',createV2ApiClient({baseUrl:'https://api.example.invalid/api/v1',tokenSupplier:async()=>({data:'token',error:null}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json({data:url.endsWith('/summary')?detailSummary:account});}}));
  assert.equal((await client.getAccount(id)).currentBalance,account.currentBalance);assert.deepEqual(await client.getAccountSummary(id),detailSummary);
  assert.equal(calls[0].options.headers.Authorization,'Bearer token');assert.ok(calls[0].url.endsWith('/accounts/'+id));assert.ok(calls[1].url.endsWith('/accounts/'+id+'/summary'));
});
test('T20 active, archived, asset, card debt and overpayment load without balance arithmetic',async()=>{
  for(const [status,type,currentBalance] of [['active','bank','0.30'],['archived','bank','-999999999.99'],['active','credit_card','123.45'],['archived','credit_card','-250.00']]) {
    const row={...account,status,type,currentBalance};const store=createAccountsStore(detailFake({getAccount:async()=>row,getAccountSummary:async()=>({...detailSummary,currentBalance})}),id);assert.equal(await store.refresh(),true);assert.deepEqual(store.getSnapshot().accounts,[row]);assert.equal(store.getSnapshot().detailSummary.currentBalance,currentBalance);
  }
});
test('T20 foreign and missing detail clear retained financial content identically',async()=>{
  let fail=false;const client=detailFake({getAccount:async()=>{if(fail)throw new V2ApiError(404,'NOT_FOUND','not-found');return account;}});const store=createAccountsStore(client,id);await store.refresh();fail=true;await store.refresh();assert.equal(store.getSnapshot().accounts,null);assert.equal(store.getSnapshot().detailSummary,null);assert.equal(store.getSnapshot().notFound,true);
});
test('T20 initial failure never fabricates zero; retained stale and mismatched snapshots recover',async()=>{
  let failure=true,mismatch=false;const store=createAccountsStore(detailFake({getAccount:async()=>{if(failure)throw Error('network');return account;},getAccountSummary:async()=>({...detailSummary,currentBalance:mismatch?'1.00':'0.30'})}),id);
  await store.refresh();assert.equal(store.getSnapshot().accounts,null);assert.ok(store.getSnapshot().error);failure=false;await store.refresh();mismatch=true;assert.equal(await store.refresh(),false);assert.equal(store.getSnapshot().detailSummary.currentBalance,'0.30');mismatch=false;assert.equal(await store.refresh(),true);
});
test('T20 edit/archive/restore reuse mutation handling; locked rejection preserves financial state',async()=>{
  let row=account;const store=createAccountsStore(detailFake({getAccount:async()=>row}),id);await store.refresh();
  assert.equal(await store.mutate(async()=>{row={...row,name:'Edited'};},'Account saved.'),true);assert.equal(store.getSnapshot().accounts[0].name,'Edited');
  for(const status of ['archived','active']){await store.mutate(async()=>{row={...row,status};},'Account changed.');assert.equal(store.getSnapshot().accounts[0].status,status);}
  assert.equal(await store.mutate(async()=>{throw new V2ApiError(409,'ACCOUNT_CONFLICT','conflict');},'saved'),false);assert.equal(store.getSnapshot().mutationError.code,'ACCOUNT_CONFLICT');assert.equal(store.getSnapshot().accounts[0].name,'Edited');
});
test('T20 user teardown aborts reads/writes and suppresses old owner responses',async()=>{
  const pending=deferred();let signal;
  const isolated=createAccountsStore(detailFake({getAccount:(_id,options)=>{signal=options.signal;return pending.promise;}}),id);const stop=isolated.start();stop();assert.equal(signal.aborted,true);pending.resolve(account);await tick();assert.equal(isolated.getSnapshot().accounts,null);
  const write=deferred(),mutationStore=createAccountsStore(detailFake(),id);const stopMutation=mutationStore.start();await tick();const saving=mutationStore.mutate(options=>{signal=options.signal;return write.promise;},'Saved');stopMutation();assert.equal(signal.aborted,true);write.resolve(account);assert.equal(await saving,false);assert.equal(mutationStore.getSnapshot().accounts,null);
});
test('T20 authentication failure clears account and summary immediately',async()=>{
  let failure=false;const store=createAccountsStore(detailFake({getAccount:async()=>{if(failure)throw new V2ApiError(401,'AUTH_INVALID','auth');return account;}}),id);await store.refresh();failure=true;await store.refresh();assert.equal(store.getSnapshot().authError,true);assert.equal(store.getSnapshot().accounts,null);assert.equal(store.getSnapshot().detailSummary,null);
});
test('T20 auth boundary recognizes account details and safe return URLs',async()=>{
  const {isProtectedPath,safeNext}=await import(compile(readFileSync(new URL('../src/lib/auth/redirects.ts',import.meta.url),'utf8')));
  assert.equal(isProtectedPath('/v2/accounts/'+id),true);assert.equal(safeNext('/v2/accounts/'+id),'/v2/accounts/'+id);assert.equal(safeNext('//evil.invalid/v2/accounts/'+id),'/v2/dashboard');assert.equal(isProtectedPath('/v2/accounts/'+id+'/extra'),false);
});

