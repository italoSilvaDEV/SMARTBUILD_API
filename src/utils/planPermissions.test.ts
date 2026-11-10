import { describe, expect, it } from '@jest/globals';
import { resolveEffectivePermissions } from './planPermissions';

describe('subscription permission contract (TASK-218)', () => {
  it('does not grant a role feature that the purchased plan does not include', () => {
    expect(resolveEffectivePermissions(['invoices', 'estimates'], ['invoices', 'payroll'], 'Worker'))
      .toEqual(['invoices']);
  });

  it.each(['Owner', ' administrator '])('limits privileged role %s to the plan', (role) => {
    expect(resolveEffectivePermissions(['invoices'], ['payroll'], role)).toEqual(['invoices']);
  });

  it('grants nothing when a role has no intersection with the plan', () => {
    expect(resolveEffectivePermissions(['invoices'], ['payroll'], 'Worker')).toEqual([]);
  });

  it('preserves the legacy empty-office fallback, without inventing plan permissions', () => {
    expect(resolveEffectivePermissions(['invoices'], [], null, true)).toEqual(['invoices']);
    expect(resolveEffectivePermissions([], [], 'Owner')).toEqual([]);
  });

  it('recomputes permissions when switching companies instead of keeping the previous plan', () => {
    const office = ['invoices', 'payroll'];
    expect(resolveEffectivePermissions(['invoices', 'payroll'], office, 'Worker')).toEqual(office);
    expect(resolveEffectivePermissions(['invoices'], office, 'Worker')).toEqual(['invoices']);
  });
});

it('does not grant implicit privileges to a new empty role or missing role', () => {
 expect(resolveEffectivePermissions(['invoices'], [], 'Custom')).toEqual([]);
 expect(resolveEffectivePermissions(['invoices'], [], null)).toEqual([]);
});
