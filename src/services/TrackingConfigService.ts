import { Prisma } from "@prisma/client";
import {
  applyTrackingEmergencyEnvironmentOverrides,
  applyTrackingConfigPatch,
  getTrackingConfig,
  normalizePersistedTrackingConfigPatch,
  normalizeTrackingConfigPatch,
  TRACKING_CONFIG_CONSTRAINTS,
  TrackingConfig,
  TrackingConfigPatch,
} from "../config/trackingConfig";
import { prisma } from "../utils/prisma";

const GLOBAL_TRACKING_CONFIG_ID = "global";
const GLOBAL_SCOPE = "GLOBAL";
const COMPANY_SCOPE = "COMPANY";

const updaterSelect = {
  id: true,
  name: true,
  email: true,
} as const;

const configRecordInclude = {
  updatedBy: { select: updaterSelect },
} as const;

type ConfigRecordWithUpdater = Prisma.TrackingRuntimeConfigGetPayload<{
  include: typeof configRecordInclude;
}>;

type CompanySummary = {
  id: string;
  name: string;
  isActive: boolean;
};

export type TrackingConfigMasterActor = {
  id: string;
  name: string;
  email: string;
};

export type GlobalTrackingConfigEntry = {
  config: TrackingConfig;
  storedConfig: TrackingConfig | null;
  source: "database" | "environment";
  updatedAt: Date | null;
  updatedBy: TrackingConfigMasterActor | null;
};

export type CompanyTrackingConfigEntry = {
  companyId: string;
  companyName: string;
  isActive: boolean;
  hasOverride: boolean;
  override: TrackingConfigPatch | null;
  effectiveConfig: TrackingConfig;
  updatedAt: Date | null;
  updatedBy: TrackingConfigMasterActor | null;
};

export class TrackingConfigAccessError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "TrackingConfigAccessError";
  }
}

function companyConfigId(companyId: string) {
  return `company:${companyId}`;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toNullableJsonInput(value: Prisma.JsonValue) {
  return value === null ? Prisma.JsonNull : toJsonValue(value);
}

function normalizeCompanyId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 191) {
    throw new TrackingConfigAccessError(400, "companyId is invalid");
  }
  return value.trim();
}

function isMasterOfficeName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "master";
}

function mapUpdater(
  updater: { id: string; name: string; email: string } | null | undefined
): TrackingConfigMasterActor | null {
  return updater
    ? { id: updater.id, name: updater.name, email: updater.email }
    : null;
}

function buildGlobalEntry(
  record: ConfigRecordWithUpdater | null,
  environmentConfig = getTrackingConfig()
): GlobalTrackingConfigEntry {
  const storedPatch = record
    ? normalizePersistedTrackingConfigPatch(record.config)
    : {};
  const storedConfig = applyTrackingConfigPatch(environmentConfig, storedPatch);
  const config = applyTrackingEmergencyEnvironmentOverrides(storedConfig);

  return {
    config,
    storedConfig: record ? storedConfig : null,
    source: record ? "database" : "environment",
    updatedAt: record?.updatedAt || null,
    updatedBy: mapUpdater(record?.updatedBy),
  };
}

function buildCompanyEntry(
  company: CompanySummary,
  record: ConfigRecordWithUpdater | null,
  globalConfig: TrackingConfig
): CompanyTrackingConfigEntry {
  const override = record
    ? normalizePersistedTrackingConfigPatch(record.config)
    : null;

  return {
    companyId: company.id,
    companyName: company.name,
    isActive: company.isActive,
    hasOverride: !!record,
    override,
    effectiveConfig: applyTrackingEmergencyEnvironmentOverrides(
      applyTrackingConfigPatch(globalConfig, override || {})
    ),
    updatedAt: record?.updatedAt || null,
    updatedBy: mapUpdater(record?.updatedBy),
  };
}

async function getConfigRecordWithUpdaterById(id: string) {
  return prisma.trackingRuntimeConfig.findUnique({
    where: { id },
    include: configRecordInclude,
  });
}

export async function resolveTrackingConfigCompanyForUser(
  userId: string,
  requestedCompanyId?: unknown
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      company_id: true,
      office: { select: { name: true, company_id: true } },
      companies: {
        select: {
          companyId: true,
        },
      },
    },
  });

  if (!user) {
    throw new TrackingConfigAccessError(401, "Authenticated user was not found");
  }

  const isMaster =
    isMasterOfficeName(user.office.name) &&
    user.office.company_id == null &&
    user.company_id == null &&
    user.companies.length === 0;
  const accessibleCompanyIds = new Set(
    [user.company_id, ...user.companies.map((membership) => membership.companyId)].filter(
      (companyId): companyId is string => !!companyId
    )
  );

  if (requestedCompanyId != null && String(requestedCompanyId).trim()) {
    const companyId = normalizeCompanyId(requestedCompanyId);
    if (!isMaster && !accessibleCompanyIds.has(companyId)) {
      throw new TrackingConfigAccessError(403, "User does not have access to this company");
    }

    if (isMaster) {
      const companyExists = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!companyExists) {
        throw new TrackingConfigAccessError(404, "Company not found");
      }
    }
    return companyId;
  }

  const activeAttendance = await prisma.userAttendance.findFirst({
    where: { user_id: userId, check_out_time: null },
    orderBy: { check_in_time: "desc" },
    select: {
      company_id: true,
      UserServiceProject: {
        select: {
          service_project: {
            select: {
              company_id: true,
              Project: { select: { company_id: true } },
            },
          },
        },
      },
    },
  });
  const attendanceCompanyId =
    activeAttendance?.company_id ||
    activeAttendance?.UserServiceProject?.service_project?.company_id ||
    activeAttendance?.UserServiceProject?.service_project?.Project?.company_id ||
    null;

  if (
    attendanceCompanyId &&
    (isMaster || accessibleCompanyIds.has(attendanceCompanyId))
  ) {
    return attendanceCompanyId;
  }

  return user.company_id || null;
}

export async function getEffectiveTrackingConfig(
  companyId: string | null
): Promise<TrackingConfig> {
  const [globalRecord, companyRecord] = await Promise.all([
    getConfigRecordWithUpdaterById(GLOBAL_TRACKING_CONFIG_ID),
    companyId
      ? prisma.trackingRuntimeConfig.findUnique({
          where: { companyId },
          include: configRecordInclude,
        })
      : Promise.resolve(null),
  ]);
  const globalEntry = buildGlobalEntry(globalRecord);
  if (!companyRecord) return globalEntry.config;

  return applyTrackingEmergencyEnvironmentOverrides(
    applyTrackingConfigPatch(
      globalEntry.config,
      normalizePersistedTrackingConfigPatch(companyRecord.config)
    )
  );
}

export async function listTrackingConfigForMaster() {
  const [companies, records] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.trackingRuntimeConfig.findMany({ include: configRecordInclude }),
  ]);
  const globalRecord =
    records.find((record) => record.id === GLOBAL_TRACKING_CONFIG_ID) || null;
  const global = buildGlobalEntry(globalRecord);
  const recordsByCompanyId = new Map(
    records
      .filter((record) => !!record.companyId)
      .map((record) => [record.companyId as string, record])
  );

  return {
    global,
    companies: companies.map((company) =>
      buildCompanyEntry(
        company,
        recordsByCompanyId.get(company.id) || null,
        global.config
      )
    ),
    constraints: TRACKING_CONFIG_CONSTRAINTS,
  };
}

export async function getCompanyTrackingConfigForMaster(companyIdInput: unknown) {
  const companyId = normalizeCompanyId(companyIdInput);
  const [company, globalRecord, companyRecord] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, isActive: true },
    }),
    getConfigRecordWithUpdaterById(GLOBAL_TRACKING_CONFIG_ID),
    prisma.trackingRuntimeConfig.findUnique({
      where: { companyId },
      include: configRecordInclude,
    }),
  ]);
  if (!company) throw new TrackingConfigAccessError(404, "Company not found");
  const global = buildGlobalEntry(globalRecord);

  return {
    company: buildCompanyEntry(company, companyRecord, global.config),
    global,
    constraints: TRACKING_CONFIG_CONSTRAINTS,
  };
}

export async function updateGlobalTrackingConfig(
  input: unknown,
  actor: TrackingConfigMasterActor
) {
  const patch = normalizeTrackingConfigPatch(input);
  await prisma.$transaction(async (tx) => {
    const previous = await tx.trackingRuntimeConfig.findUnique({
      where: { id: GLOBAL_TRACKING_CONFIG_ID },
    });
    const previousEffective = applyTrackingConfigPatch(
      getTrackingConfig(),
      previous ? normalizePersistedTrackingConfigPatch(previous.config) : {}
    );
    const next = applyTrackingConfigPatch(previousEffective, patch);

    await tx.trackingRuntimeConfig.upsert({
      where: { id: GLOBAL_TRACKING_CONFIG_ID },
      create: {
        id: GLOBAL_TRACKING_CONFIG_ID,
        scope: GLOBAL_SCOPE,
        companyId: null,
        config: toJsonValue(next),
        updatedByUserId: actor.id,
      },
      update: {
        scope: GLOBAL_SCOPE,
        config: toJsonValue(next),
        updatedByUserId: actor.id,
      },
    });
    await tx.trackingRuntimeConfigAudit.create({
      data: {
        scope: GLOBAL_SCOPE,
        companyId: null,
        action: previous ? "UPDATE_GLOBAL" : "CREATE_GLOBAL",
        ...(previous
          ? { previousConfig: toNullableJsonInput(previous.config) }
          : {}),
        nextConfig: toJsonValue(next),
        changedByUserId: actor.id,
        changedByName: actor.name,
        changedByEmail: actor.email,
      },
    });
  });

  return buildGlobalEntry(
    await getConfigRecordWithUpdaterById(GLOBAL_TRACKING_CONFIG_ID)
  );
}

export async function updateCompanyTrackingConfig(
  companyIdInput: unknown,
  input: unknown,
  actor: TrackingConfigMasterActor
) {
  const companyId = normalizeCompanyId(companyIdInput);
  const requestedPatch = normalizeTrackingConfigPatch(input);

  await prisma.$transaction(async (tx) => {
    const [company, globalRecord, previous] = await Promise.all([
      tx.company.findUnique({ where: { id: companyId }, select: { id: true } }),
      tx.trackingRuntimeConfig.findUnique({ where: { id: GLOBAL_TRACKING_CONFIG_ID } }),
      tx.trackingRuntimeConfig.findUnique({ where: { companyId } }),
    ]);
    if (!company) throw new TrackingConfigAccessError(404, "Company not found");

    const globalConfig = applyTrackingConfigPatch(
      getTrackingConfig(),
      globalRecord ? normalizePersistedTrackingConfigPatch(globalRecord.config) : {}
    );
    const effectiveConfig = applyTrackingConfigPatch(globalConfig, requestedPatch);
    const patch: TrackingConfigPatch = { ...requestedPatch };
    if (Object.prototype.hasOwnProperty.call(patch, "insideMinDistanceMeters")) {
      patch.insideMinDistanceMeters = effectiveConfig.insideMinDistanceMeters;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "autoMinSendIntervalMs")) {
      patch.autoMinSendIntervalMs = effectiveConfig.autoMinSendIntervalMs;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "manualMinSendIntervalMs")) {
      patch.manualMinSendIntervalMs = effectiveConfig.manualMinSendIntervalMs;
    }

    await tx.trackingRuntimeConfig.upsert({
      where: { companyId },
      create: {
        id: companyConfigId(companyId),
        scope: COMPANY_SCOPE,
        companyId,
        config: toJsonValue(patch),
        updatedByUserId: actor.id,
      },
      update: {
        scope: COMPANY_SCOPE,
        config: toJsonValue(patch),
        updatedByUserId: actor.id,
      },
    });
    await tx.trackingRuntimeConfigAudit.create({
      data: {
        scope: COMPANY_SCOPE,
        companyId,
        action: previous ? "UPDATE_COMPANY_OVERRIDE" : "CREATE_COMPANY_OVERRIDE",
        ...(previous
          ? { previousConfig: toNullableJsonInput(previous.config) }
          : {}),
        nextConfig: toJsonValue(patch),
        changedByUserId: actor.id,
        changedByName: actor.name,
        changedByEmail: actor.email,
      },
    });
  });

  return (await getCompanyTrackingConfigForMaster(companyId)).company;
}

export async function restoreCompanyTrackingConfigInheritance(
  companyIdInput: unknown,
  actor: TrackingConfigMasterActor
) {
  const companyId = normalizeCompanyId(companyIdInput);

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new TrackingConfigAccessError(404, "Company not found");

    const previous = await tx.trackingRuntimeConfig.findUnique({
      where: { companyId },
    });
    if (!previous) return;

    await tx.trackingRuntimeConfig.delete({ where: { id: previous.id } });
    await tx.trackingRuntimeConfigAudit.create({
      data: {
        scope: COMPANY_SCOPE,
        companyId,
        action: "RESTORE_COMPANY_INHERITANCE",
        previousConfig: toNullableJsonInput(previous.config),
        changedByUserId: actor.id,
        changedByName: actor.name,
        changedByEmail: actor.email,
      },
    });
  });

  return (await getCompanyTrackingConfigForMaster(companyId)).company;
}

export { GLOBAL_TRACKING_CONFIG_ID };
