import { Prisma, SyncType } from "@prisma/client";

export const PROJECTS_SYNC_TYPE: SyncType = "QuickBooksToSmartBuild";
const QBO_TO_SMART_ONLY_ENTITIES = new Set(["projects", "estimates"]);

export function isTypesEntitySupportedByPrismaClient(typesEntity: string): boolean {
  const typesEntityEnum = Prisma.dmmf.datamodel.enums.find(
    (enumDef) => enumDef.name === "TypesEntity"
  );

  if (!typesEntityEnum) return true;

  return typesEntityEnum.values.some((value) => value.name === typesEntity);
}

export function buildUnsupportedTypesEntityError(typesEntity: string) {
  const error = new Error(
    `Sync entity "${typesEntity}" is not available in the generated Prisma Client yet. Apply the migration, run prisma generate, and restart the API.`
  );
  (error as any).statusCode = 409;
  (error as any).code = "UNSUPPORTED_TYPES_ENTITY";
  (error as any).typesEntity = typesEntity;

  return error;
}

export function normalizeSyncTypeForEntity(
  typesEntity: string,
  typeSync: SyncType
): SyncType {
  if (QBO_TO_SMART_ONLY_ENTITIES.has(typesEntity)) {
    return PROJECTS_SYNC_TYPE;
  }

  return typeSync;
}

export function shouldNormalizeProjectsSyncType(
  typesEntity: string,
  typeSync: SyncType
): boolean {
  return QBO_TO_SMART_ONLY_ENTITIES.has(typesEntity) && typeSync !== PROJECTS_SYNC_TYPE;
}
