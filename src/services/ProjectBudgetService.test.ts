jest.mock('../utils/prisma', () => ({ prisma: {
  project: { findUnique: jest.fn() },
  projectBudget: { create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  $transaction: jest.fn(),
} }));
import { prisma } from '../utils/prisma';
import { parseBudget, saveProjectBudget } from './ProjectBudgetService';
import { parseReceipt } from './ReceiptExtractionService';

test('budget distinguishes unset values from zero and preserves decimal precision', () => {
  expect(parseBudget({ revision: 0, materials: '1234.56', employees: '0', subcontractors: null })).toEqual({
    revision: 0, values: { materials: '1234.56', employees: '0', subcontractors: null },
  });
});
test.each(['-1', '1,000', '1e3', 'Infinity', '1.234', '1000000000000', 10, undefined])('rejects invalid budget amount %s', materials => {
  expect(() => parseBudget({ revision: 1, materials, employees: null, subcontractors: null })).toThrow();
});
test('rejects missing optimistic revision', () => {
  expect(() => parseBudget({ materials: '1', employees: null, subcontractors: null })).toThrow();
});
test('receipt total is not recomputed or combined with tax', () => {
  expect(parseReceipt({ merchant: 'Store', total: '108.25', tax: '8.25', date: '2026-10-27', currency: 'usd', description: '<p>Lumber</p>' }))
    .toEqual({ merchant: 'Store', total: '108.25', date: '2026-10-27', currency: 'USD', description: 'Lumber' });
});
test('formatted totals are normalized while invalid dates and ambiguous currency remain empty', () => {
  expect(parseReceipt({ total: '1,250.00', date: '2026-02-31', currency: '$' })).toMatchObject({ total: '1250.00', date: null, currency: null });
  expect(parseReceipt({ total: null })).toMatchObject({ total: null });
});

describe('budget persistence rules independent of HTTP', () => {
  const input = { revision: 1, materials: '25.50', employees: null, subcontractors: '0' };
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  });

  test('invalid input never opens a transaction', async () => {
    await expect(saveProjectBudget('project', 'actor', {})).rejects.toMatchObject({ code: 'INVALID_BUDGET' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('updates use the expected revision and increment it atomically', async () => {
    (prisma.projectBudget.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.projectBudget.findUniqueOrThrow as jest.Mock).mockResolvedValue({ revision: 2 });
    await expect(saveProjectBudget('project', 'actor', input)).resolves.toEqual({ revision: 2 });
    expect(prisma.projectBudget.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'project', revision: 1 },
      data: { materials: '25.50', employees: null, subcontractors: '0', updatedBy: 'actor', revision: { increment: 1 } },
    });
  });

  test('a stale revision returns a domain conflict without a follow-up read', async () => {
    (prisma.projectBudget.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(saveProjectBudget('project', 'actor', input)).rejects.toMatchObject({ code: 'BUDGET_CONFLICT' });
    expect(prisma.projectBudget.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  test('concurrent first creation is mapped to a domain conflict', async () => {
    (prisma.projectBudget.create as jest.Mock).mockRejectedValue({ code: 'P2002' });
    await expect(saveProjectBudget('project', 'actor', { ...input, revision: 0 })).rejects.toMatchObject({ code: 'BUDGET_CONFLICT' });
  });
});
