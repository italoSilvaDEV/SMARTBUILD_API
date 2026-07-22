export function resolveEffectivePermissions(
  planPermissions: string[],
  officePermissions: string[],
  officeName?: string | null,
) {
  const uniquePlanPermissions = [...new Set(planPermissions.filter(Boolean))];
  const normalizedOfficeName = String(officeName || '').trim().toLowerCase();

  if (normalizedOfficeName === 'owner' || normalizedOfficeName === 'administrator') {
    return uniquePlanPermissions;
  }

  if (officePermissions.length === 0) {
    return uniquePlanPermissions;
  }

  const planPermissionSet = new Set(uniquePlanPermissions);
  return [
    ...new Set(
      officePermissions.filter(
        (permission) => permission && planPermissionSet.has(permission),
      ),
    ),
  ];
}
