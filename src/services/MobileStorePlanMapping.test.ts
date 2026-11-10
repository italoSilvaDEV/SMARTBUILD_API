import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { LEGACY_APPLE_PLAN_MAPPINGS, resolveApplePlanId } from './MobileStorePlanMapping';

describe('explicit store plan mapping', () => {
  test.each(Object.entries(LEGACY_APPLE_PLAN_MAPPINGS))('preserves classified legacy product %s', (productId, id) => {
    expect(resolveApplePlanId({ productId, configuredProducts: [] })).toBe(id);
  });
  test.each(['unknown_29', 'unknown_99', 'constructor', 'toString', undefined])('rejects unmapped %s', productId => {
    expect(() => resolveApplePlanId({ productId, configuredProducts: [], legacyPlanId: 'global' })).toThrow();
  });
  test('explicit mapping overrides a classified default without using price', () => {
    expect(resolveApplePlanId({ productId: 'smartbuild_pro_monthly_29', configuredProducts: [{ productId: 'smartbuild_pro_monthly_29', planId: 'another-environment-plan' }] })).toBe('another-environment-plan');
  });
  test('legacy global mapping is restricted to the named product', () => {
    expect(resolveApplePlanId({ productId: 'legacy', configuredProducts: [], legacyProductId: 'legacy', legacyPlanId: 'plan' })).toBe('plan');
    expect(() => resolveApplePlanId({ productId: 'other', configuredProducts: [], legacyProductId: 'legacy', legacyPlanId: 'plan' })).toThrow();
  });
  test('rejects duplicate and empty explicit mappings', () => {
    const mapping = { productId: 'smartbuild_pro_monthly_29', planId: 'plan' };
    expect(() => resolveApplePlanId({ productId: mapping.productId, configuredProducts: [mapping, mapping] })).toThrow('duplicate');
    expect(() => resolveApplePlanId({ productId: mapping.productId, configuredProducts: [{ ...mapping, planId: ' ' }] })).toThrow('empty');
  });
});

// Execute the real controller resolver without importing network/provider/bootstrap modules.
function resolver(env: Record<string, string> = {}) {
  const file = path.resolve(__dirname, '../controllers/mobile/MobileAuthController.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['parseMobileProductsJson', 'getMobilePlan'];
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text || ''));
  expect(functions).toHaveLength(2);
  const prisma = { plan: { findUnique: jest.fn(), findMany: jest.fn() } };
  const js = ts.transpileModule(functions.map(node => node.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const getPlan = vm.runInNewContext(js + '\ngetMobilePlan', { prisma, process: { env }, resolveApplePlanId });
  return { prisma, getPlan };
}
test('missing explicit target fails without trying price or any other plan', async () => {
  const { prisma, getPlan } = resolver({ MOBILE_APP_PRODUCTS_JSON: '{"product":"missing-plan"}' });
  prisma.plan.findUnique.mockResolvedValue(null);
  await expect(getPlan('product')).rejects.toThrow('no longer exists');
  expect(prisma.plan.findMany).not.toHaveBeenCalled();
  expect(prisma.plan.findUnique).toHaveBeenCalledTimes(1);
});
test.each(['{"product":{"price":29}}', '[{"productId":"product","price":99}]'])('price-only config cannot grant a plan: %s', raw => {
  const { prisma, getPlan } = resolver({ MOBILE_APP_PRODUCTS_JSON: raw });
  return expect(getPlan('product')).rejects.toThrow('explicit').then(() => expect(prisma.plan.findMany).not.toHaveBeenCalled());
});
test('malformed JSON fails before querying the catalog', async () => {
  const { prisma, getPlan } = resolver({ MOBILE_APP_PRODUCTS_JSON: '{invalid' });
  await expect(getPlan('smartbuild_pro_monthly_29')).rejects.toThrow();
  expect(prisma.plan.findUnique).not.toHaveBeenCalled();
});
test.each(['MONTHLY', 'ANNUAL', 'CUSTOM'])('returns mapped %s plan intact, without converting duration', async validityType => {
  const { prisma, getPlan } = resolver({ MOBILE_APP_PRODUCTS_JSON: '{"product":"plan"}' });
  const plan = { id: 'plan', validityType, validityDuration: 4, price: 900, allowedEmployees: 6 };
  prisma.plan.findUnique.mockResolvedValue(plan);
  expect(await getPlan('product')).toBe(plan);
  expect(prisma.plan.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'plan' } }));
  expect(prisma.plan.findMany).not.toHaveBeenCalled();
});
test('Google uses the plan ID already resolved from verified product/base-plan mapping', async () => {
  const { prisma, getPlan } = resolver(); const plan = { id: 'google-plan' };
  prisma.plan.findUnique.mockResolvedValue(plan);
  expect(await getPlan('google-product', 'google-plan')).toBe(plan);
  expect(prisma.plan.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'google-plan' } }));
});
