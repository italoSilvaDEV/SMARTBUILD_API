import { assertNoForeignSubscription, conflictingProvider, PurchaseRecord, SubscriptionPurchaseConflict } from './SubscriptionPurchaseGuard';
const now = new Date('2026-11-06T12:00:00Z');
const past = new Date('2026-01-01');
const future = new Date('2027-01-01');
const row = (billingProvider: string, patch: Partial<PurchaseRecord> = {}): PurchaseRecord => ({ id: 'sub', billingProvider, isActive: true, paymentFailed: false, endDate: future, stripeSubscriptionCanceled: false, appleBillingStatus: null, plan: { validityType: 'MONTHLY' }, ...patch });
const providers = ['stripe','apple','google'] as const;
for (const target of providers) for (const source of providers.filter(p => p !== target)) {
  test(`${source} -> ${target} blocks active contract regardless of local date`, () => {
    expect(conflictingProvider([row(source)], target, now)).toBe(source);
    expect(conflictingProvider([row(source,{endDate:past})], target, now)).toBe(source);
  });
  test(`${source} -> ${target} blocks recovery and local administrative deactivation`, () => {
    expect(conflictingProvider([row(source,{isActive:false,paymentFailed:true,endDate:past})],target,now)).toBe(source);
    expect(conflictingProvider([row(source,{isActive:false,endDate:past})],target,now)).toBe(source);
  });
}
test.each(providers)('same %s contract remains managed by existing provider rules', provider => {
  expect(conflictingProvider([row(provider)],provider,now)).toBeNull();
});
test('paid annual/four-month periods do not change entitlement or become free by changing device',()=>{
  for(const validityType of ['ANNUAL','MONTHLY']) expect(conflictingProvider([row('stripe',{plan:{validityType},endDate:past})],'google',now)).toBe('stripe');
});
test('invitation is not a foreign paid contract',()=>expect(conflictingProvider([row('stripe',{plan:{validityType:'FREE'}})],'google',now)).toBeNull());
test('scheduled cancellation keeps paid period and blocks a second provider',()=>expect(conflictingProvider([row('stripe',{stripeSubscriptionCanceled:true})],'apple',now)).toBe('stripe'));
test('confirmed terminal Stripe and Apple permit a different provider',()=>{
  expect(conflictingProvider([row('stripe',{isActive:false,stripeSubscriptionCanceled:true})],'google',now)).toBeNull();
  for(const appleBillingStatus of ['expired','refunded']) expect(conflictingProvider([row('apple',{isActive:false,appleBillingStatus,paymentFailed:true})],'google',now)).toBeNull();
});
test.each(['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'])('Google %s requires persisted terminal evidence and expired paid period',googleState=>{
  expect(conflictingProvider([row('google',{isActive:false,googleState,endDate:past})],'stripe',now)).toBeNull();
  expect(conflictingProvider([row('google',{isActive:false,googleState})],'stripe',now)).toBe('google');
});
test('unknown provider and invalid dates fail closed',()=>{
  expect(conflictingProvider([row('unknown',{isActive:false})],'google',now)).toBe('unknown');
  expect(conflictingProvider([row('google',{isActive:false,endDate:new Date(NaN),googleState:'SUBSCRIPTION_STATE_EXPIRED'})],'stripe',now)).toBe('google');
});
function db(rows: PurchaseRecord[]=[], ledger:any[]=[]) { return {subscription:{findMany:jest.fn(async()=>rows)},googlePlayPurchaseSync:{findMany:jest.fn(async()=>ledger)}} as any; }
test.each(['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED'])('Google %s blocks even without active Subscription row',async state=>{
  await expect(assertNoForeignSubscription(db([], [{state}]),'company','stripe',now)).rejects.toMatchObject({status:409,provider:'google'});
});
test('terminal Google record matched by subscription ID permits purchase; unrelated ledger cannot unblock it',async()=>{
  const rows=[row('google',{isActive:false,endDate:past})];
  await expect(assertNoForeignSubscription(db(rows,[{subscriptionId:'sub',state:'SUBSCRIPTION_STATE_EXPIRED'}]),'company','stripe',now)).resolves.toBeUndefined();
  await expect(assertNoForeignSubscription(db(rows,[{subscriptionId:'other',state:'SUBSCRIPTION_STATE_EXPIRED'}]),'company','stripe',now)).rejects.toBeInstanceOf(SubscriptionPurchaseConflict);
});
test('queries are company scoped and never mutate data or call providers',async()=>{
  const mock=db(); await assertNoForeignSubscription(mock,'company','stripe',now);
  expect(mock.subscription.findMany.mock.calls[0][0].where).toEqual({companyId:'company',billingProvider:{not:'stripe'}});
  expect(mock.googlePlayPurchaseSync.findMany.mock.calls[0][0].where).toEqual({companyId:'company',retired:false});
});
test('database failure is not interpreted as no subscription',async()=>{
  const mock=db();mock.subscription.findMany.mockRejectedValue(new Error('offline'));
  await expect(assertNoForeignSubscription(mock,'company','apple',now)).rejects.toThrow('offline');
});
