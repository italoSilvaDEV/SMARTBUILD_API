import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { assertNoForeignSubscription } from '../../services/SubscriptionPurchaseGuard';
function load(db:any, setup:any, existing:any) {
 const src=fs.readFileSync(path.resolve(__dirname,'MobileAuthController.ts'),'utf8');const ast=ts.createSourceFile('mobile.ts',src,99,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='persistVerifiedStoreSubscription')!;
 return vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+';persistVerifiedStoreSubscription',
 {billingCoordinationEnabled:()=>false,BillingAttemptError:class extends Error{},prisma:db,assertNoForeignSubscription,findExistingStoreSubscription:async()=>existing,getMobilePlan:async()=>({id:'plan'}),ensureCompanyPlanSetup:setup});
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
test('restore updates the existing Apple receipt without creating a second row',async()=>{
 await load(db,setup,{id:'sub',companyId:'company'})(input());expect(db.subscription.create).not.toHaveBeenCalled();expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'sub'}}));
});
test('foreign company receipt is rejected before locking or writing',async()=>{
 await expect(load(db,setup,{id:'sub',companyId:'foreign'})(input())).rejects.toThrow('another');expect(db.$transaction).not.toHaveBeenCalled();
});
