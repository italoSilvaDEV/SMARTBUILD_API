jest.mock('../utils/prisma', () => ({ prisma: {} }));
jest.mock('./SubscriptionPurchaseGuard', () => ({
  assertNoForeignSubscription: jest.fn(),
  assertNoPendingGooglePurchase: jest.fn(),
  conflictingProvider: jest.fn(() => null),
  SubscriptionPurchaseConflict: class extends Error {},
}));
import { BillingAttemptError, BillingPurchaseCoordinator } from './BillingPurchaseCoordinator';

const paramsFor = (price: string) => ({ line_items: [{ price, quantity: 1 }], customer: 'cus_1', success_url: 's', cancel_url: 'c' });

function setup() {
  let row: any = null;
  const billingPurchaseAttempt = {
    findUnique: jest.fn(async () => row),
    upsert: jest.fn(async ({ create }: any) => { row = { ...create }; return row; }),
    update: jest.fn(async ({ data }: any) => { row = { ...row, ...data }; return row; }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (!row || row.id !== where.id || row.state !== where.state) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    }),
  };
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: 'company-a' }]),
    billingConflict: { findFirst: jest.fn(async () => null) },
    subscription: { findMany: jest.fn(async () => []) },
    googlePlayPurchaseSync: { findMany: jest.fn(async () => []) },
    billingPurchaseAttempt,
  };
  const db = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) } as any;
  return { coordinator: new BillingPurchaseCoordinator(db), state: () => row?.state };
}
const session = { id: 'cs_1', url: 'https://checkout.test', expires_at: 2000000000 };
const gatewayFailing = (error: unknown) => ({ create: jest.fn(async () => { throw error; }), retrieve: jest.fn() });
const gatewayOk = () => ({ create: jest.fn(async () => session), retrieve: jest.fn() });

describe('stripeCheckout when Stripe does not create the session', () => {
  it.each([[400, 'StripeInvalidRequestError'], [401, 'StripeAuthenticationError'], [402, 'StripeCardError'], [403, 'StripePermissionError'], [404, 'StripeInvalidRequestError']])(
    'a definitive %i refusal releases the company and keeps the original error', async (statusCode, type) => {
      const { coordinator, state } = setup();
      const refusal = Object.assign(new Error('No such price'), { statusCode, type });
      await expect(coordinator.stripeCheckout('company-a', 'plan-a', paramsFor('price_missing'), gatewayFailing(refusal))).rejects.toBe(refusal);
      expect(state()).toBe('closed');
      const gateway = gatewayOk();
      await expect(coordinator.stripeCheckout('company-a', 'plan-b', paramsFor('price_ok'), gateway)).resolves.toBe(session);
      expect(state()).toBe('open');
    });

  it.each([
    ['network failure', Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' })],
    ['server error', Object.assign(new Error('boom'), { statusCode: 500, type: 'StripeAPIError' })],
    ['lock conflict', Object.assign(new Error('conflict'), { statusCode: 409, type: 'StripeInvalidRequestError' })],
    ['rate limit', Object.assign(new Error('slow down'), { statusCode: 429, type: 'StripeRateLimitError' })],
    ['idempotency mismatch', Object.assign(new Error('keys'), { statusCode: 400, type: 'StripeIdempotencyError' })],
  ])('an uncertain outcome (%s) keeps blocking another checkout', async (_name, failure) => {
    const { coordinator, state } = setup();
    await expect(coordinator.stripeCheckout('company-a', 'plan-a', paramsFor('price_a'), gatewayFailing(failure))).rejects.toBe(failure);
    expect(state()).toBe('creating');
    const gateway = gatewayOk();
    await expect(coordinator.stripeCheckout('company-a', 'plan-b', paramsFor('price_b'), gateway)).rejects.toBeInstanceOf(BillingAttemptError);
    expect(gateway.create).not.toHaveBeenCalled();
  });

  it('retrying the same uncertain request reuses the same idempotency key', async () => {
    const { coordinator } = setup();
    const first = gatewayFailing(Object.assign(new Error('timeout'), { type: 'StripeConnectionError' }));
    await expect(coordinator.stripeCheckout('company-a', 'plan-a', paramsFor('price_a'), first)).rejects.toBeDefined();
    const retry = gatewayOk();
    await expect(coordinator.stripeCheckout('company-a', 'plan-a', paramsFor('price_a'), retry)).resolves.toBe(session);
    expect((retry.create.mock.calls[0] as any)[1]).toBe((first.create.mock.calls[0] as any)[1]);
  });
});
