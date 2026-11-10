const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.TASK221_TEST_DATABASE_URL||'invalid:');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'33221');assert.equal(url.pathname,'/task221');
const db=new PrismaClient({datasources:{db:{url:url.href}}});
const p=require.resolve('../src/utils/prisma');require.cache[p]={id:p,filename:p,loaded:true,exports:{prisma:db}};
const {GooglePlayBillingService}=require('../src/services/GooglePlayBillingService');
const {googleCompanyAccountId}=require('../src/services/GooglePlayPurchase');
let seq=0,failAck=false,acks=0;
const receipts=new Map();
const run=Date.now().toString();
const gateway={get:async token=>{assert(receipts.has(token));return receipts.get(token);},acknowledge:async token=>{assert(await db.subscription.findUnique({where:{googlePurchaseToken:token}}),'commit before ack');if(failAck)throw Error('synthetic failure');acks++;},verifyPush:async()=>({email:'test@example.invalid',email_verified:true,iss:'accounts.google.com'})};
let plan,service;
async function fixture(){const company=await db.company.create({data:{name:'Synthetic TASK221'}});const office=await db.office.create({data:{name:'Owner',company_id:company.id}});const actor=await db.user.create({data:{name:'Synthetic',email:'task221-'+run+'-'+(++seq)+'@example.invalid',password:'not-a-login',rules:{},office_id:office.id,company_id:company.id}});await db.userCompany.create({data:{userId:actor.id,companyId:company.id,office_id:office.id}});return {company,actor};}
function register(f,token,state='ACTIVE',linked){receipts.set(token,{subscriptionState:'SUBSCRIPTION_STATE_'+state,startTime:'2026-01-01T00:00:00Z',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',externalAccountIdentifiers:{obfuscatedExternalAccountId:googleCompanyAccountId(f.company.id)},linkedPurchaseToken:linked,lineItems:[{productId:'synthetic',offerDetails:{basePlanId:'monthly'},expiryTime:'2099-01-01T00:00:00Z',latestSuccessfulOrderId:'order-'+token,autoRenewingPlan:{autoRenewEnabled:true}}]});return {token,companyId:f.company.id,actorId:f.actor.id};}
(async()=>{
 await db.subscription.deleteMany();
 await db.$executeRawUnsafe('DROP TABLE GooglePlayPurchaseSync');
 const migration=fs.readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261106230000_google_play_sync/migration.sql'),'utf8');
 await db.$executeRawUnsafe(migration.trim().replace(/;$/,''));console.log('PASS actual additive Google ledger migration');
 const group=await db.permissionGroup.create({data:{description:'Synthetic'}});
 plan=await db.plan.create({data:{name:'Synthetic',description:'Local only',validityType:'MONTHLY',validityDuration:1,permissionGroupId:group.id,allowedEmployees:2}});
 const env={GOOGLE_PLAY_NATIVE_ENABLED:'true',GOOGLE_PLAY_PACKAGE_NAME:'synthetic',GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES:'true',ANDROID_BILLING_PLAN_MAPPINGS:JSON.stringify([{productId:'synthetic',basePlanId:'monthly',planId:plan.id}])};
 service=new GooglePlayBillingService(db,gateway,env);
 const f=await fixture(),input=register(f,'same-token');
 const concurrent=await Promise.allSettled(Array.from({length:5},()=>service.sync(input)));
 assert(concurrent.some(r=>r.status==='fulfilled'));assert.equal(await db.subscription.count({where:{companyId:f.company.id}}),1);
 for(const result of concurrent.filter(r=>r.status==='rejected'))assert(['GOOGLE_SYNC_BUSY','GOOGLE_SYNC_FAILED'].includes(result.reason.code));
 await service.sync(input);assert.equal(await db.subscription.count({where:{companyId:f.company.id}}),1);console.log('PASS same-token concurrent verification and replay create exactly one subscription');
 const f2=await fixture();const two=await Promise.allSettled([service.sync(register(f2,'token-a')),service.sync(register(f2,'token-b'))]);assert.equal(two.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.subscription.count({where:{companyId:f2.company.id,isActive:true}}),1);console.log('PASS competing purchases serialize company entitlement');
 const f3=await fixture(),third=register(f3,'ack-retry');failAck=true;await assert.rejects(service.sync(third),/GOOGLE_SYNC_FAILED/);assert.equal(await db.subscription.count({where:{companyId:f3.company.id}}),1);failAck=false;await service.sync(third);assert.equal(await db.subscription.count({where:{companyId:f3.company.id}}),1);assert((await db.googlePlayPurchaseSync.findUniqueOrThrow({where:{purchaseToken:third.token}})).acknowledgedAt);console.log('PASS persisted entitlement survives failed acknowledgement and retries without duplication');
 const pending=register(f,'pending-replacement','PENDING','same-token');const before=acks;await service.sync(pending);assert.equal(acks,before);assert.equal((await db.subscription.findUniqueOrThrow({where:{googlePurchaseToken:'same-token'}})).isActive,true);assert.equal(await db.subscription.count({where:{googlePurchaseToken:'pending-replacement'}}),0);
 register(f,'pending-replacement','ACTIVE','same-token');await service.sync(pending);assert.equal((await db.subscription.findUniqueOrThrow({where:{googlePurchaseToken:'same-token'}})).isActive,false);assert.equal(await db.subscription.count({where:{companyId:f.company.id,isActive:true}}),1);await assert.rejects(service.sync(input),/GOOGLE_TOKEN_REPLACED/);console.log('PASS pending replacement preserves paid access; confirmed replacement retires old token permanently');
 const foreign=await fixture();await assert.rejects(service.sync({...pending,companyId:foreign.company.id,actorId:foreign.actor.id}),/GOOGLE_COMPANY_MISMATCH/);console.log('PASS claimed purchase cannot move to another company');
 for(const state of ['IN_GRACE_PERIOD','CANCELED','ON_HOLD','ACTIVE','PAUSED','EXPIRED']){register(f3,'ack-retry',state);await service.sync(third);const row=await db.subscription.findUniqueOrThrow({where:{googlePurchaseToken:'ack-retry'}});assert.equal(row.isActive,['ACTIVE','IN_GRACE_PERIOD','CANCELED'].includes(state));assert.equal(row.paymentFailed,state==='ON_HOLD');}console.log('PASS grace, cancellation, hold, recovery, pause and expiration change only Google entitlement');
 const other=await fixture();await db.subscription.create({data:{companyId:other.company.id,planId:plan.id,billingProvider:'stripe',isActive:true,startDate:new Date('2026-01-01'),endDate:new Date('2099-01-01')}});await assert.rejects(service.sync(register(other,'conflicting-google')),/GOOGLE_OTHER_SUBSCRIPTION_ACTIVE/);assert.equal(await db.subscription.count({where:{companyId:other.company.id}}),1);console.log('PASS synthetic Stripe contract untouched on conflicting Google purchase (no Stripe client/network)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
