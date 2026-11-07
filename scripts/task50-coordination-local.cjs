const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.TASK50_TEST_DATABASE_URL||'invalid:');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'33250');assert.equal(url.pathname,'/task50');
process.env.BILLING_COORDINATION_ENABLED='true';
const db=new PrismaClient({datasources:{db:{url:url.href}}});
const p=require.resolve('../src/utils/prisma');require.cache[p]={id:p,filename:p,loaded:true,exports:{prisma:db}};
const coord=require('../src/services/BillingPurchaseCoordinator');
const service=new coord.BillingPurchaseCoordinator(db);
let plan,seq=0; const run=Date.now();
async function company(){return db.company.create({data:{name:'TASK50 synthetic '+run+' '+(++seq),planId:plan.id}});}
async function sub(c,provider,ref){return db.subscription.create({data:{companyId:c.id,planId:plan.id,billingProvider:provider,isActive:true,startDate:new Date('2026-01-01'),endDate:new Date('2099-01-01'),...(provider==='stripe'?{stripeSubscriptionId:ref}:provider==='apple'?{storeOriginalTransactionId:ref}:{googlePurchaseToken:ref})}});}
async function admit(c,provider,ref,active=true){return db.$transaction(async tx=>{await coord.lockBillingCompany(tx,c.id);return coord.admitVerifiedBilling(tx,c.id,provider,ref,active);},{isolationLevel:'ReadCommitted'});}
const snapshots=new Map();const stripe={subscriptions:{retrieve:async id=>{assert(snapshots.has(id));return snapshots.get(id);}},checkout:{sessions:{list:async()=>({data:[]})}}};
function webhook(){
 const source=fs.readFileSync(path.join(__dirname,'../src/controllers/stripe/WebHookController.ts'),'utf8');
 const ast=ts.createSourceFile('webhook.ts',source,99,true);const code=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n');
 const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,prisma:db,stripeConfig:{getClient:()=>stripe},...coord,
 grantOwnerFullAccessForCompany:async()=>{},StripeSubscriptionItemService:{handlePlanUpgrade:async()=>{}},console:{log(){},warn(){},error(){}},
 });return new exports.StripeWebHooksController();
}
function event(c,id,status='active'){const snapshot={id,status,metadata:{companyId:c.id},customer:'synthetic_customer',current_period_start:1760000000,current_period_end:4070908800,cancel_at_period_end:false,items:{data:[{price:{id:plan.stripePriceId,metadata:{}},quantity:1}]}};snapshots.set(id,snapshot);return {type:'customer.subscription.created',data:{object:snapshot}};}
(async()=>{
 // Prove the actual additive migration, not just db push.
 for(const table of ['BillingConflict','BillingPurchaseAttempt']) await db.$executeRawUnsafe('DROP TABLE '+table);
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261106233000_billing_purchase_coordination/migration.sql'),'utf8');
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 console.log('PASS additive migration on disposable MySQL');
 const group=await db.permissionGroup.create({data:{description:'TASK50 synthetic'}});
 plan=await db.plan.create({data:{name:'TASK50 synthetic',description:'Local only',stripePriceId:'price_'+run,validityType:'MONTHLY',validityDuration:4,allowedEmployees:2,permissionGroupId:group.id}});
 for(const existing of ['stripe','apple','google'])for(const target of ['stripe','apple','google'].filter(x=>x!==existing)){
  const c=await company();await sub(c,existing,'existing-'+c.id);
  await assert.rejects(service.reserve(c.id,target,plan.id,'request'),e=>e.provider===existing);
  assert.equal(await admit(c,target,'late-'+c.id),false);
  await admit(c,target,'late-'+c.id);
  assert.equal(await db.billingConflict.count({where:{companyId:c.id}}),1);
  assert.equal(await db.subscription.count({where:{companyId:c.id,isActive:true}}),1);
 }
 console.log('PASS all six directions block preflight and record late payments idempotently without changing contracts');
 const race=await company();
 const results=await Promise.allSettled(['stripe','apple','google'].map(provider=>service.reserve(race.id,provider,plan.id,'race-'+provider)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.billingPurchaseAttempt.count({where:{companyId:race.id}}),1);
 console.log('PASS three concurrent providers produce one reservation');
 const web=await company();let posts=0;const remote=new Map();
 const gateway={create:async(params,key)=>{posts++;if(!remote.has(key))remote.set(key,{id:'cs_'+key,url:'https://checkout.invalid/'+key,expires_at:Date.now()/1000+1800,status:'open'});return remote.get(key);},retrieve:async id=>[...remote.values()].find(s=>s.id===id)};
 const params={line_items:[{price:plan.stripePriceId,quantity:1}],mode:'subscription',success_url:'https://local.invalid/success',cancel_url:'https://local.invalid/cancel'};
 const sessions=await Promise.all(Array.from({length:5},()=>service.stripeCheckout(web.id,plan.id,params,gateway)));
 assert.equal(new Set(sessions.map(s=>s.id)).size,1);assert.equal(remote.size,1);
 const first=[...remote.values()][0];first.status='expired';const next=await service.stripeCheckout(web.id,plan.id,params,gateway);assert.notEqual(next.id,first.id);
 console.log('PASS concurrent Stripe retries reuse one provider key; confirmed expiry allows a new session');
 const uncertain=await company();await assert.rejects(service.stripeCheckout(uncertain.id,plan.id,params,{...gateway,create:async()=>{throw Error('synthetic network loss');}}));
 await assert.rejects(service.reserve(uncertain.id,'google',plan.id,'other'),/CHECKOUT_IN_PROGRESS/);
 await db.billingPurchaseAttempt.update({where:{companyId:uncertain.id},data:{createdAt:new Date(Date.now()-24*3600000)}});
 await assert.rejects(service.stripeCheckout(uncertain.id,plan.id,params,gateway),/RECONCILIATION/);
 console.log('PASS uncertain POST remains reserved and does not reuse a pruned provider key');
 const native=await company();let a=await service.reserve(native.id,'google',plan.id,'native');
 await db.billingPurchaseAttempt.update({where:{companyId:native.id},data:{expiresAt:new Date(0)}});
 a=await service.reserve(native.id,'apple',plan.id,'replacement');await service.launch(native.id,a.id);await service.launch(native.id,a.id);
 await db.billingPurchaseAttempt.update({where:{companyId:native.id},data:{expiresAt:new Date(0)}});
 await assert.rejects(service.reserve(native.id,'stripe',plan.id,'late'),/CHECKOUT_IN_PROGRESS/);
 await service.finishNative(native.id,a.id);await service.reserve(native.id,'stripe',plan.id,'next');
 assert.equal(await admit(native,'apple','late-native'),false);
 console.log('PASS only unlaunched reservations expire; cancellation releases UI attempt; late payment is recorded');

 const pending=await company();const pendingAttempt=await service.reserve(pending.id,'google',plan.id,'pending');await service.launch(pending.id,pendingAttempt.id);
 await db.$transaction(async tx=>{await coord.lockBillingCompany(tx,pending.id);await coord.admitVerifiedBilling(tx,pending.id,'google','pending-reference',false);});
 await db.$transaction(async tx=>{await coord.lockBillingCompany(tx,pending.id);await coord.admitVerifiedBilling(tx,pending.id,'google','old-canceled-reference',false,[],true);});
 assert.equal((await db.billingPurchaseAttempt.findUniqueOrThrow({where:{companyId:pending.id}})).state,'launched');
 await db.$transaction(async tx=>{await coord.lockBillingCompany(tx,pending.id);await coord.admitVerifiedBilling(tx,pending.id,'google','pending-reference',false,[],true);});
 assert.equal((await db.billingPurchaseAttempt.findUniqueOrThrow({where:{companyId:pending.id}})).state,'closed');
 console.log('PASS terminal pending purchase releases only its linked attempt; stale terminal event cannot release a new attempt');
 const duplicate=await company();await sub(duplicate,'stripe','sub_original');
 assert.equal(await admit(duplicate,'stripe','sub_other'),false);
 assert.equal(await admit(duplicate,'stripe','sub_original'),true);
 console.log('PASS unrelated same-provider contract conflicts; renewal of same contract remains allowed');
 const wh=webhook(),c=await company(),ev=event(c,'sub_wh_'+run);
 await Promise.all([wh.processVerifiedEvent(ev),wh.processVerifiedEvent(ev)]);
 assert.equal(await db.subscription.count({where:{companyId:c.id}}),1);
 const original=await db.subscription.findFirstOrThrow({where:{companyId:c.id}});
 snapshots.get(ev.data.object.id).cancel_at_period_end=true;
 await wh.processVerifiedEvent({...ev,type:'customer.subscription.updated'});
 assert.equal((await db.subscription.findUniqueOrThrow({where:{id:original.id}})).isActive,true);
 snapshots.get(ev.data.object.id).status='canceled';
 await wh.processVerifiedEvent({...ev,type:'customer.subscription.deleted'});
 // Replay an old activation; handler must read current canceled state.
 await wh.processVerifiedEvent(ev);
 assert.equal((await db.subscription.findUniqueOrThrow({where:{id:original.id}})).isActive,false);
 assert.equal((await db.subscription.findUniqueOrThrow({where:{id:original.id}})).stripeSubscriptionCanceled,true);
 console.log('PASS actual Stripe handler: concurrent delivery, paid cancellation period, terminal cancellation and stale replay');
 const foreign=await company();await sub(foreign,'apple','apple_existing');
 const late=event(foreign,'stripe_late_'+run);await wh.processVerifiedEvent(late);
 assert.equal(await db.subscription.count({where:{companyId:foreign.id}}),1);
 assert.equal(await db.billingConflict.count({where:{companyId:foreign.id,state:'open'}}),1);
 await db.subscription.updateMany({where:{companyId:foreign.id},data:{isActive:false,appleBillingStatus:'expired'}});
 await wh.processVerifiedEvent(late);
 assert.equal(await db.billingConflict.count({where:{companyId:foreign.id,state:'open'}}),0);
 assert.equal(await db.subscription.count({where:{companyId:foreign.id,billingProvider:'stripe',isActive:true}}),1);
 console.log('PASS actual Stripe handler: external conflict remains visible and replay resolves only after confirmed closure');

 const {generateKeyPairSync}=require('node:crypto');
 process.env.APP_STORE_PRIVATE_KEY=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
 process.env.APP_STORE_KEY_ID='local';process.env.APP_STORE_ISSUER_ID='local';process.env.APP_STORE_BUNDLE_ID='test.local';
 process.env.MOBILE_APP_PRODUCTS_JSON=JSON.stringify([{productId:'test.product',planId:plan.id}]);
 const apple=await company();const appleSub=await sub(apple,'apple','original-'+apple.id);
 const originalFetch=global.fetch;
 const appleStatus={status:1,productId:'test.product',expiresDate:4070908800000};
 const jws=body=>'header.'+Buffer.from(JSON.stringify(body)).toString('base64url')+'.fixture';
 global.fetch=async url=>{assert(String(url).startsWith('https://api.storekit.apple.com/inApps/v1/subscriptions/'));return {ok:true,status:200,json:async()=>({bundleId:'test.local',data:[{lastTransactions:[{
  originalTransactionId:appleSub.storeOriginalTransactionId,status:appleStatus.status,
  signedTransactionInfo:jws({bundleId:'test.local',originalTransactionId:appleSub.storeOriginalTransactionId,transactionId:'renewed-local-'+run,productId:appleStatus.productId,price:29000,purchaseDate:1760000000000,expiresDate:appleStatus.expiresDate}),
  signedRenewalInfo:jws({autoRenewStatus:1})}]}]})};};
 try {
  const {refreshAppleBillingStatus}=require('../src/services/AppleBillingStatusService');
  await refreshAppleBillingStatus(appleSub.id);
  assert.equal((await db.subscription.findUniqueOrThrow({where:{id:appleSub.id}})).storeTransactionId,'renewed-local-'+run);
  assert.equal((await db.company.findUniqueOrThrow({where:{id:apple.id}})).mobileSubscriptionStatus,'active');
  appleStatus.productId='unmapped';
  const before=await db.subscription.findUniqueOrThrow({where:{id:appleSub.id}});
  await assert.rejects(refreshAppleBillingStatus(appleSub.id),/mapping/);
  assert.deepEqual(await db.subscription.findUniqueOrThrow({where:{id:appleSub.id}}),before);
  appleStatus.productId='test.product';await sub(apple,'stripe','foreign-stripe');
  await assert.rejects(refreshAppleBillingStatus(appleSub.id),/REQUIRES_REVIEW/);
  assert.equal(await db.billingConflict.count({where:{companyId:apple.id,state:'open'}}),1);
  assert.deepEqual(await db.subscription.findUniqueOrThrow({where:{id:appleSub.id}}),before);
  appleStatus.status=2;appleStatus.expiresDate=1;await refreshAppleBillingStatus(appleSub.id);
  assert.equal((await db.subscription.findUniqueOrThrow({where:{id:appleSub.id}})).isActive,false);
  assert.equal(await db.billingConflict.count({where:{companyId:apple.id,state:'open'}}),0);
  console.log('PASS actual Apple reconciliation: mapped plan, atomic rollback, durable conflict and confirmed terminal resolution');
 } finally {global.fetch=originalFetch;delete process.env.APP_STORE_PRIVATE_KEY;}
 console.log('ALL TASK50 LOCAL MYSQL SCENARIOS PASSED; provider gateway simulated; no external calls');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
