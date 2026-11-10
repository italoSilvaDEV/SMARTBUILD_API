import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { assertNoForeignSubscription, SubscriptionPurchaseConflict } from '../../services/SubscriptionPurchaseGuard';
// Execute the actual checkout method without loading dotenv, SDKs or credentials.
function load(db: any, stripe: any, enabled=false, authorizeBillingCheckout=jest.fn()) {
 const src=fs.readFileSync(path.resolve(__dirname,'StripeController.ts'),'utf8');
 const ast=ts.createSourceFile('controller.ts',src,99,true);
 const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='StripeController') as ts.ClassDeclaration;
 const method=cls.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='createCheckoutSession')!;
 return vm.runInNewContext(ts.transpileModule(`class Controller { ${method.getText(ast)} }; new Controller()`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,
 {authorizeBillingCheckout,billingPurchaseCoordinator:{stripeCheckout:async(_company:any,_plan:any,params:any,gateway:any)=>gateway.create(params,"stable-fixture-key")},billingCoordinationEnabled:()=>enabled,BillingAttemptError:class extends Error{},prisma:db,stripe,assertNoForeignSubscription,SubscriptionPurchaseConflict,parseMetaCheckoutAttribution:()=>null,process:{env:{URL_FRONT:'https://web.test'}},console:{log:()=>{},error:()=>{}}});
}
let db:any,stripe:any,controller:any,res:any;
beforeEach(()=>{
 db={plan:{findUnique:jest.fn(async()=>({id:'plan',validityType:'MONTHLY',validityDuration:4,stripePriceId:'price_unchanged',allowedEmployees:6}))},company:{findUnique:jest.fn(async()=>({id:'company',stripeCustomerId:'cus_existing',allowedEmployees:8}))},subscription:{findMany:jest.fn(async()=>[])},googlePlayPurchaseSync:{findMany:jest.fn(async()=>[])}};
 stripe={checkout:{sessions:{create:jest.fn(async()=>({id:'cs_test',url:'https://checkout.test'}))}}};
 controller=load(db,stripe);res={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);
});
const request=()=>({body:{planId:'plan',companyId:'company',referralId:'referral',returnUrl:'billing'}});
test('legitimate Stripe checkout retains price, duration, customer, referral and redirect payload',async()=>{
 await controller.createCheckoutSession(request(),res);
 expect(res.status).toHaveBeenCalledWith(200);
 expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
 expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({payment_method_types:['card'],mode:'subscription',line_items:[{price:'price_unchanged',quantity:1}],customer:'cus_existing',client_reference_id:'referral',success_url:'https://web.test/billing?checkout_success=true&session_id={CHECKOUT_SESSION_ID}',cancel_url:'https://web.test/billing',metadata:{planId:'plan',companyId:'company',validityType:'MONTHLY',validityDuration:'4',allowedEmployees:'8',referralId:'referral'}});
 expect(res.json).toHaveBeenCalledWith({checkoutUrl:'https://checkout.test',sessionId:'cs_test'});
});
test.each(['apple','google'])('%s contract blocks before Stripe is called and identifies its provider',async billingProvider=>{
 db.subscription.findMany.mockResolvedValue([{billingProvider,isActive:true,plan:{validityType:'MONTHLY'}}]);
 await controller.createCheckoutSession(request(),res);
 expect(res.status).toHaveBeenCalledWith(409);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:'SUBSCRIPTION_PROVIDER_CONFLICT',provider:billingProvider}));expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});
test('lookup outage cannot create checkout',async()=>{db.subscription.findMany.mockRejectedValue(new Error('offline'));await controller.createCheckoutSession(request(),res);expect(res.status).toHaveBeenCalledWith(500);expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();});
test('pending Google purchase blocks web checkout without granting access',async()=>{db.googlePlayPurchaseSync.findMany.mockResolvedValue([{state:'SUBSCRIPTION_STATE_PENDING'}]);await controller.createCheckoutSession(request(),res);expect(res.status).toHaveBeenCalledWith(409);expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();});

test.each([['MONTHLY',4],['ANNUAL',1]])('coordinated %s checkout retains financial payload and authenticates before provider call',async(validityType,validityDuration)=>{
 db.plan.findUnique.mockResolvedValue({id:'plan',validityType,validityDuration,stripePriceId:'price_unchanged',allowedEmployees:6});
 const authorize=jest.fn();await load(db,stripe,true,authorize).createCheckoutSession(request(),res);
 expect(authorize).toHaveBeenCalledWith(request(),'company');
 expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({line_items:[{price:'price_unchanged',quantity:1}],customer:'cus_existing',metadata:expect.objectContaining({validityType,validityDuration:String(validityDuration),allowedEmployees:'8'})}),{idempotencyKey:'stable-fixture-key'});
 expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(stripe.checkout.sessions.create.mock.invocationCallOrder[0]);
});
test('failed authorization stops checkout before contacting Stripe',async()=>{
 const authorize=jest.fn(async()=>{throw Error('denied');});await load(db,stripe,true,authorize).createCheckoutSession(request(),res);expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});
