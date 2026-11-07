import { billingPurchaseCoordinator } from '../../services/BillingPurchaseCoordinator';
import { GooglePlayCatalogController } from './GooglePlayCatalogController';
import { buildAuthResponse } from './MobileAuthController';
import { androidBillingAccess, AndroidBillingError } from '../../services/AndroidBillingAccess';
import { prisma } from '../../utils/prisma';
jest.mock('./MobileAuthController', () => ({ buildAuthResponse: jest.fn() }));
jest.mock('../../services/AndroidBillingAccess', () => ({ androidBillingAccess: jest.fn(), AndroidBillingError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
jest.mock('../../utils/prisma', () => ({ prisma: { plan: { findMany: jest.fn() }, subscription: { findMany: jest.fn() }, googlePlayPurchaseSync: { findFirst: jest.fn() } } }));
const controller = new GooglePlayCatalogController();
const env = { ...process.env };
const mappings = [
  { planId: 'starter', productId: 'smartbuild_starter_monthly', basePlanId: 'monthly' },
  { planId: 'essentials', productId: 'smartbuild_essentials_monthly', basePlanId: 'monthly' },
];
const req = (body: any = {}) => ({ body: { companyId: 'company', country: 'BR', ...body }, headers: {} } as any);
const response = () => { const r: any = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() }; r.status.mockReturnValue(r); return r; };
const auth = (patch: any = {}) => ({ token: 'session', isExpired: true, paymentFailed: false, stripeSubscriptionCanceled: false,
  subscription: null, user: { company: { id: 'company' }, plan: { validityType: 'MONTHLY' } }, ...patch });
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.googlePlayPurchaseSync.findFirst as jest.Mock).mockResolvedValue(null);
  process.env = { ...env, GOOGLE_PLAY_NATIVE_ENABLED: 'true', GOOGLE_PLAY_PACKAGE_NAME: 'test.app', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: 'never-return-this',
    GOOGLE_PLAY_PUBSUB_AUDIENCE: 'https://test.invalid', GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT: 'push@test.invalid',
    GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES: 'false', GOOGLE_PLAY_TEST_COMPANY_IDS: 'company', ANDROID_BILLING_PLAN_MAPPINGS: JSON.stringify(mappings) };
  (androidBillingAccess as jest.Mock).mockResolvedValue({ companyId: 'company', userId: 'owner' });
  (buildAuthResponse as jest.Mock).mockResolvedValue(auth());
  (prisma.plan.findMany as jest.Mock).mockResolvedValue([{ id: 'starter', name: 'Starter', features: ['feature'], description: 'Starter plan' }]);
});
afterAll(() => { process.env = env; });

test.each(['BR','US','ES'])('native catalog in %s has store IDs but no prices or credentials', async country => {
  const res = response(); await controller.configuration(req({ country }), res);
  expect(res.json).toHaveBeenCalledWith({ country, program: 'google-play', packageName: 'test.app', canPurchase: true, coordinationEnabled: false,
    mappings: [{ ...mappings[0], name: 'Starter', features: ['feature'], description: 'Starter plan', trialOfferId: 'trial-7-days' }] });
  expect(prisma.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, isInviteOnly: false, isCampaign: false, validityType: 'MONTHLY', validityDuration: 1 }) }));
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('never-return-this');
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});
test.each(['GOOGLE_PLAY_NATIVE_ENABLED','GOOGLE_PLAY_SERVICE_ACCOUNT_JSON','GOOGLE_PLAY_PACKAGE_NAME','GOOGLE_PLAY_PUBSUB_AUDIENCE','GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT'])('catalog fails closed without %s', async key => {
  delete process.env[key]; const res = response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(503); expect(prisma.plan.findMany).not.toHaveBeenCalled();
});
test('sandbox rollout cannot offer checkout to a real company outside the allowlist', async () => {
  process.env.GOOGLE_PLAY_TEST_COMPANY_IDS = 'another'; const res = response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(503);
});
test('live rollout can serve an authorized company', async () => {
  process.env.GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES = 'true'; process.env.GOOGLE_PLAY_TEST_COMPANY_IDS = '';
  const res = response(); await controller.configuration(req(),res); expect(res.status).not.toHaveBeenCalled();
});
test.each([401,403])('unauthorized request stops before catalog/status on %s', async status => {
  (androidBillingAccess as jest.Mock).mockRejectedValue(new AndroidBillingError(status, 'denied'));
  const res = response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(status); expect(buildAuthResponse).not.toHaveBeenCalled(); expect(prisma.plan.findMany).not.toHaveBeenCalled();
});
test.each(['CA','',undefined])('unsupported country %s cannot offer a purchase', async country => {
  const res = response(); await controller.configuration(req({country}),res); expect(res.status).toHaveBeenCalledWith(400);
});
test('missing mapped plans never fall back to web prices', async () => {
  (prisma.plan.findMany as jest.Mock).mockResolvedValue([]); const res = response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(503);
});
test('ambiguous mappings fail closed', async () => {
  process.env.ANDROID_BILLING_PLAN_MAPPINGS=JSON.stringify([mappings[0],mappings[0]]); const res=response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(503);
});
test('future/annual products are not exposed by this monthly rollout', async () => {
  process.env.ANDROID_BILLING_PLAN_MAPPINGS=JSON.stringify([{planId:'pro',productId:'pro',basePlanId:'annual'}]);
  (prisma.plan.findMany as jest.Mock).mockResolvedValue([]); const res=response(); await controller.configuration(req(),res);
  expect(prisma.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:{in:[]}})})); expect(res.status).toHaveBeenCalledWith(503);
});
test('pending signup cannot receive a normal session before payment', async () => {
  const res=response(); await controller.status(req({pendingToken:'capability'}),res); expect(res.json).toHaveBeenCalledWith({state:'pending',canPurchase:true});
});
test('confirmed signup receives the existing authoritative auth response', async () => {
  const value=auth({isExpired:false,subscription:{isActive:true,billingProvider:'google'}}); (buildAuthResponse as jest.Mock).mockResolvedValue(value);
  const res=response(); await controller.status(req({pendingToken:'capability'}),res); expect(res.json).toHaveBeenCalledWith({state:'active',canPurchase:false,auth:value});
});
test.each(['stripe','apple','google'])('active %s blocks duplicate checkout without recalculating expiry', async billingProvider => {
  const value=auth({isExpired:false,subscription:{isActive:true,billingProvider,endDate:'2000-01-01'}}); (buildAuthResponse as jest.Mock).mockResolvedValue(value);
  const res=response(); await controller.status(req(),res); expect(res.json).toHaveBeenCalledWith({state:'active',canPurchase:false,auth:value});
});
test.each([{paymentFailed:true},{stripeSubscriptionCanceled:true}])('existing financial problem cannot be bypassed by another checkout', async patch => {
  const value=auth({isExpired:false,subscription:{isActive:true,billingProvider:'stripe'},...patch}); (buildAuthResponse as jest.Mock).mockResolvedValue(value);
  const res=response(); await controller.status(req(),res); expect(res.json).toHaveBeenCalledWith({state:'pending',canPurchase:false,auth:value});
});
test('unreconciled active mobile row requires attention instead of a new charge', async () => {
  const value=auth({subscription:{isActive:true,billingProvider:'google'}}); (buildAuthResponse as jest.Mock).mockResolvedValue(value);
  const res=response(); await controller.status(req(),res); expect(res.json).toHaveBeenCalledWith({state:'pending',canPurchase:false,auth:value});
});
test('status still works with new sales disabled',async()=>{
  process.env.GOOGLE_PLAY_NATIVE_ENABLED='false'; const res=response(); await controller.status(req(),res); expect(res.status).not.toHaveBeenCalled();
});
test('wrong company auth result fails closed',async()=>{
  (buildAuthResponse as jest.Mock).mockResolvedValue(auth({user:{company:{id:'other'}}})); const res=response(); await controller.status(req(),res); expect(res.status).toHaveBeenCalledWith(409);
});
test('ambiguous subscription errors do not expose details or return a purchasable catalog',async()=>{
  (buildAuthResponse as jest.Mock).mockRejectedValue(new Error('private details')); const res=response(); await controller.configuration(req(),res); expect(res.status).toHaveBeenCalledWith(503); expect(JSON.stringify(res.json.mock.calls)).not.toContain('private details');
});

test.each(['stripe','apple'])('inactive %s billing recovery blocks new Google purchase',async billingProvider=>{
  (prisma.subscription.findMany as jest.Mock).mockResolvedValue([{billingProvider,isActive:false,paymentFailed:true,stripeSubscriptionCanceled:false,appleBillingStatus:'payment_failed',endDate:new Date('2026-01-01'),plan:{validityType:'MONTHLY'}}]);
  const res=response();await controller.status(req(),res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({canPurchase:false}));
});

test.each(['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED'])('same-store %s never opens a second Google purchase',async state=>{
 (prisma.googlePlayPurchaseSync.findFirst as jest.Mock).mockResolvedValue({id:'ledger'});
 const res=response();await controller.status(req({pendingToken:'capability'}),res);
 expect(res.json).toHaveBeenCalledWith({state:'pending',canPurchase:false,purchaseBlock:expect.objectContaining({provider:'google',code:'SUBSCRIPTION_PROVIDER_CONFLICT'})});
 expect(prisma.googlePlayPurchaseSync.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({companyId:'company',retired:false,state:{in:expect.arrayContaining([state])}})}));
});

describe('coordinated native preflight',()=>{
 beforeEach(()=>{ process.env.BILLING_COORDINATION_ENABLED='true'; jest.spyOn(billingPurchaseCoordinator,'reserve').mockResolvedValue({id:'attempt'} as any); jest.spyOn(billingPurchaseCoordinator,'launch').mockResolvedValue(); });
 afterEach(()=>jest.restoreAllMocks());
 test('reserves the configured plan and launches before returning an attempt',async()=>{
  const res=response();await controller.begin(req({productId:mappings[0].productId,basePlanId:'monthly',requestId:'12345678-12345678'}),res);
  expect(billingPurchaseCoordinator.reserve).toHaveBeenCalledWith('company','google','starter',expect.any(String));
  expect(billingPurchaseCoordinator.launch).toHaveBeenCalledWith('company','attempt');expect(res.json).toHaveBeenCalledWith({attemptId:'attempt'});
 });
 test.each([{productId:'foreign',basePlanId:'monthly'},{productId:mappings[0].productId,basePlanId:'annual'}])('invalid catalog selection cannot reserve',async body=>{
  const res=response();await controller.begin(req({...body,requestId:'12345678-12345678'}),res);expect(res.status).toHaveBeenCalledWith(400);expect(billingPurchaseCoordinator.reserve).not.toHaveBeenCalled();
 });
 test('active company cannot start another sheet',async()=>{
  (buildAuthResponse as jest.Mock).mockResolvedValue(auth({isExpired:false,subscription:{isActive:true}}));
  const res=response();await controller.begin(req(),res);expect(res.status).toHaveBeenCalledWith(409);expect(billingPurchaseCoordinator.reserve).not.toHaveBeenCalled();
 });
 test('unauthorized company cannot reserve',async()=>{
  (androidBillingAccess as jest.Mock).mockRejectedValue(new AndroidBillingError(403,'denied'));
  const res=response();await controller.begin(req(),res);expect(res.status).toHaveBeenCalledWith(403);expect(billingPurchaseCoordinator.reserve).not.toHaveBeenCalled();
 });
});
