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

  // Imported QBO projects need to land in a visible active state. Older syncs
  // may have stored them as Pending, which the main project listing excludes.
  if (!currentStatus || currentStatus === "Pending") return "Pre-Start";

  return currentStatus;
}

export function resolveProjectStatusFromImportedEstimate(
  currentProjectStatus: string | null | undefined,
  estimateStatus: string
): string | null {
  const current = currentProjectStatus || null;

  if (PROJECT_STATUSES_LOCKED_FROM_ESTIMATE_SYNC.has(current || "")) return null;

  if (estimateStatus === "approved") {
    // QBO estimates can be accepted while their linked SmartBuild project is
    // already an active project. Do not move it back to the estimate pipeline.
    return null;
  }

  if (estimateStatus === "pending") {
    // QBO pending estimates should keep imported projects in a visible active
    // state instead of pushing them back to Pending, which hides them in the
    // main project list.
    if (current === "Accepted" || current === "Pre-Start") return null;
    return "Pre-Start";
  }

  return null;
}
