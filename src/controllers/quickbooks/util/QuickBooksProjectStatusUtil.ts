const PROJECT_STATUSES_LOCKED_FROM_ESTIMATE_SYNC = new Set([
  "In Progress",
  "Final walkthrough",
  "Finished",
  "Canceled",
]);

export function resolveImportedProjectBaseStatus(
  qboProject: any,
  currentStatus?: string | null
): string {
  if (qboProject?.Active === false) return "Canceled";

  // Without estimate context, active imported QBO projects should behave like
  // standalone SmartBuild projects, which start in Pre-Start.
  return currentStatus || "Pre-Start";
}

export function resolveProjectStatusFromImportedEstimate(
  currentProjectStatus: string | null | undefined,
  estimateStatus: string
): string | null {
  const current = currentProjectStatus || null;

  if (PROJECT_STATUSES_LOCKED_FROM_ESTIMATE_SYNC.has(current || "")) return null;

  if (estimateStatus === "approved") {
    return current === "Accepted" ? null : "Accepted";
  }

  if (estimateStatus === "pending") {
    if (current === "Accepted") return null;
    return current === "Pending" ? null : "Pending";
  }

  return null;
}
