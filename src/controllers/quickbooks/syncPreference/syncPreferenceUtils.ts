import { SyncType } from "@prisma/client";

export const PROJECTS_SYNC_TYPE: SyncType = "QuickBooksToSmartBuild";

export function normalizeSyncTypeForEntity(
  typesEntity: string,
  typeSync: SyncType
): SyncType {
  if (typesEntity === "projects") {
    return PROJECTS_SYNC_TYPE;
  }

  return typeSync;
}

export function shouldNormalizeProjectsSyncType(
  typesEntity: string,
  typeSync: SyncType
): boolean {
  return typesEntity === "projects" && typeSync !== PROJECTS_SYNC_TYPE;
}
