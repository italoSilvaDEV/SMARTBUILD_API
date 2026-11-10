import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { assertNoActiveForeignContract } from '../../services/SubscriptionPurchaseGuard';
import { resolveCompanySubscriptionStatus } from '../../services/SubscriptionAccessDecision';
function load(db:any, setup:any, existing:any, coordination=false, admitVerifiedBilling:any=undefined) {
 const src=fs.readFileSync(path.resolve(__dirname,'MobileAuthController.ts'),'utf8');const ast=ts.createSourceFile('mobile.ts',src,99,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='persistVerifiedStoreSubscription')!;
 return vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+';persistVerifiedStoreSubscription',
 {billingCoordinationEnabled:()=>coordination,admitVerifiedBilling,BillingAttemptError:class extends Error{},prisma:db,assertNoActiveForeignContract,findExistingStoreSubscription:async()=>existing,getMobilePlan:async()=>({id:'plan'}),ensureCompanyPlanSetup:setup});
}
let db:any,setup:any,events:string[];
beforeEach(()=>{
 events=[];setup=jest.fn();db={subscription:{findMany:jest.fn(async()=>[]),findFirst:jest.fn(async()=>null),updateMany:jest.fn(async()=>{events.push('update');}),create:jest.fn(async({data}:any)=>({id:'sub',...data})),update:jest.fn(async({data}:any)=>({id:'sub',...data}))},googlePlayPurchaseSync:{findMany:jest.fn(async()=>[])},$queryRaw:jest.fn(async()=>{events.push('lock');})};db.$transaction=jest.fn(async(fn:any)=>fn(db));
});
const input=()=>({billingProvider:'apple',companyId:'company',purchase:{active:true,productId:'apple-product',transactionId:'transaction',originalTransactionId:'original',startDate:new Date('2026-01-01'),endDate:new Date('2027-01-01'),appAccountToken:'company',environment:'sandbox',autoRenewing:true}});
test('legitimate Apple purchase retains receipt mapping and locks before activation',async()=>{
 const result=await load(db,setup,null)(input());expect(events).toEqual(['lock','update']);expect(result).toMatchObject({billingProvider:'apple',storeTransactionId:'transaction',storeOriginalTransactionId:'original',planId:'plan',companyId:'company',isActive:true});expect(setup).toHaveBeenCalledWith('company',{id:'plan'},db);
});
test.each(['stripe','google'])('%s active contract blocks Apple signup even without old rejectActiveStripe flag',async billingProvider=>{
 db.subscription.findMany.mockResolvedValue([{billingProvider,isActive:true,plan:{validityType:'MONTHLY'}}]);
 await expect(load(db,setup,null)(input())).rejects.toMatchObject({provider:billingProvider,status:409});
 expect(events).toEqual(['lock']);expect(db.subscription.create).not.toHaveBeenCalled();expect(setup).not.toHaveBeenCalled();
});
test('Apple purchase during a valid FREE grant is accepted and grants the paid plan',async()=>{
 const free={id:'trial',companyId:'company',planId:'free-plan',billingProvider:'stripe',isActive:true,paymentFailed:false,stripeSubscriptionCanceled:false,appleBillingStatus:null,startDate:new Date('2026-11-01'),endDate:new Date('2099-01-01'),plan:{validityType:'FREE'}};
 db.subscription.findMany.mockResolvedValue([free]);
 const created=await load(db,setup,null)(input());
 expect(db.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({billingProvider:'apple'})}));
 const status=resolveCompanySubscriptionStatus({companyId:'company',plan:{id:'plan',validityType:'MONTHLY',validityDuration:1,permissions:['Projects']},allowedEmployees:2,extraEmployees:0,pendingSubscription:false,subscriptions:[free,{...created,plan:{validityType:'MONTHLY'},paymentFailed:false,stripeSubscriptionCanceled:false}],now:new Date('2026-11-09')});
 expect(status).toMatchObject({isExpired:false,accessIssue:null,permissions:['Projects'],subscription:{billingProvider:'apple'}});
});
describe('receipt already charged by the store',()=>{
 const paidRow=(billingProvider:string,patch:object={})=>({billingProvider,isActive:false,paymentFailed:false,endDate:new Date('2026-01-01'),stripeSubscriptionCanceled:false,appleBillingStatus:null,plan:{validityType:'MONTHLY'},...patch});
 const useRows=(rows:any[])=>db.subscription.findMany.mockImplementation(async({where}:any)=>rows.filter(row=>where.isActive===undefined||row.isActive===where.isActive));
 test.each([['Stripe not marked canceled','stripe'],['unresolved Google history','google']])('%s history does not refuse the Apple receipt',async(_name,provider)=>{
  useRows([paidRow(provider)]);
  await expect(load(db,setup,null)(input())).resolves.toMatchObject({billingProvider:'apple',isActive:true});
  expect(setup).toHaveBeenCalledTimes(1);
 });
 test('database failure never accepts the receipt',async()=>{
  db.subscription.findMany.mockRejectedValue(new Error('offline'));
  await expect(load(db,setup,null)(input())).rejects.toThrow('offline');
  expect(db.subscription.create).not.toHaveBeenCalled();
 });
 test('billing screen purchase during a FREE grant is accepted',async()=>{
  const free={id:'trial'};
  db.subscription.findFirst.mockImplementation(async({where}:any)=>where.NOT?.plan?.validityType==='FREE'?null:free);
  await expect(load(db,setup,null)({...input(),rejectActiveStripe:true})).resolves.toMatchObject({billingProvider:'apple',isActive:true});
 });
 test('billing screen purchase with a paid web contract stays refused',async()=>{
  db.subscription.findFirst.mockResolvedValue({id:'paid'});
  await expect(load(db,setup,null)({...input(),rejectActiveStripe:true})).rejects.toThrow('active web subscription');
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 test('coordination keeps deciding through admission',async()=>{
  const admit=jest.fn(async()=>false);
  await load(db,setup,null,true,admit)(input()).catch(()=>undefined);
  expect(admit).toHaveBeenCalledTimes(1);
  expect(db.subscription.findMany).not.toHaveBeenCalled();
  expect(db.subscription.create).not.toHaveBeenCalled();
 });
});
test('restore updates the existing Apple receipt without creating a second row',async()=>{
 await load(db,setup,{id:'sub',companyId:'company'})(input());expect(db.subscription.create).not.toHaveBeenCalled();expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'sub'}}));
});
test('foreign company receipt is rejected before locking or writing',async()=>{
 await expect(load(db,setup,{id:'sub',companyId:'foreign'})(input())).rejects.toThrow('another');expect(db.$transaction).not.toHaveBeenCalled();
});
