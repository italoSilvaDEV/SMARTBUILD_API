import { prisma } from "../../../utils/prisma";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

export const PROJECT_SYNC_ENTITY = "projects";

export type ProjectSyncSource = "sync" | "webhook";

type UpsertProjectParams = {
  companyId: string;
  qbCustomer: any;
  syncExecutionId?: string;
  source?: ProjectSyncSource;
};

export type UpsertProjectResult = {
  action: "Inserted" | "Updated" | "LinkedExisting" | "Skipped" | "Conflict";
  projectId?: string;
  reason?: string;
};

type ProjectClientForSync = {
  id?: string;
  idQuickbooks?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city_and_state?: string | null;
  location?: string | null;
};

type ProjectWorkContextForSync = {
  label?: string | null;
  Name?: string | null;
  Email?: string | null;
  phone?: string | null;
  street?: string | null;
  district?: string | null;
  zip_code?: string | null;
  city_and_state?: string | null;
  state?: string | null;
  number?: string | null;
  complement?: string | null;
  location?: string | null;
  addressOffice?: string | null;
  notes?: string | null;
};

type LocalProjectForSync = {
  id: string;
  contract_number: number | null;
  client_id: string | null;
  company_id?: string | null;
  quickbooksCustomerId: string | null;
  quickbooksSyncToken: string | null;
  quickbooksUpdatedAt: Date | null;
  status_project: string;
  price?: any;
  amountPaid?: any;
  balanceDue?: any;
  start_date?: string | null;
  deadline?: string | null;
  location: string | null;
  lat?: string | null;
  log?: string | null;
  radius?: number | null;
  client?: ProjectClientForSync | null;
  workContext?: ProjectWorkContextForSync | null;
};

type ProjectMirrorMetadata = {
  projectId?: string | null;
  contractNumber?: number | null;
  status?: string | null;
  price?: string | null;
  amountPaid?: string | null;
  balanceDue?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  location?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  radius?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  workContextLabel?: string | null;
  workContextName?: string | null;
  workContextEmail?: string | null;
  workContextPhone?: string | null;
  workContextStreet?: string | null;
  workContextDistrict?: string | null;
  workContextZipCode?: string | null;
  workContextCityState?: string | null;
  workContextState?: string | null;
  workContextNumber?: string | null;
  workContextComplement?: string | null;
  workContextNotes?: string | null;
};

const PROJECT_SYNC_NOTES_START = "[SmartBuild Project Sync]";
const PROJECT_SYNC_NOTES_END = "[/SmartBuild Project Sync]";

function compactString(value: unknown, maxLength = 250) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).replace(/\r?\n/g, " \\n ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeDecimalValue(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return String(numeric);
  }

  return compactString(value, 80);
}

function splitCityAndState(value: string | null | undefined) {
  if (!value) {
    return {
      city: null,
      state: null,
    };
  }

  const [cityPart, ...stateParts] = value.split(",");
  const city = cityPart?.trim() || null;
  const state = stateParts.join(",").trim() || null;

  return { city, state };
}

function normalizeAddressForCompare(address: any) {
  if (!address) {
    return null;
  }

  return {
    Line1: compactString(address.Line1, 500),
    Line2: compactString(address.Line2, 500),
    City: compactString(address.City, 100),
    CountrySubDivisionCode: compactString(address.CountrySubDivisionCode, 50),
    PostalCode: compactString(address.PostalCode, 30),
  };
}

function buildProjectAddress(project: LocalProjectForSync) {
  const workContext = project.workContext;
  const cityState = splitCityAndState(
    workContext?.city_and_state ?? project.client?.city_and_state ?? null
  );
  const line1 =
    compactString(project.location, 500) ??
    compactString(workContext?.location, 500) ??
    compactString(
      [workContext?.street, workContext?.number].filter(Boolean).join(" "),
      500
    ) ??
    compactString(project.client?.location, 500);

  const line2 = compactString(
    [workContext?.district, workContext?.complement].filter(Boolean).join(" - "),
    500
  );

  const city = compactString(cityState.city, 100);
  const state =
    compactString(workContext?.state, 50) ?? compactString(cityState.state, 50);
  const postalCode = compactString(workContext?.zip_code, 30);

  if (!line1 && !line2 && !city && !state && !postalCode) {
    return undefined;
  }

  return {
    Line1: line1 ?? undefined,
    Line2: line2 ?? undefined,
    City: city ?? undefined,
    CountrySubDivisionCode: state ?? undefined,
    PostalCode: postalCode ?? undefined,
  };
}

function buildProjectMirrorMetadata(project: LocalProjectForSync): ProjectMirrorMetadata {
  return {
    projectId: project.id,
    contractNumber: project.contract_number,
    status: compactString(project.status_project, 100),
    price: normalizeDecimalValue(project.price),
    amountPaid: normalizeDecimalValue(project.amountPaid),
    balanceDue: normalizeDecimalValue(project.balanceDue),
    location: compactString(project.location, 500),
  };
}

function buildProjectPhoneBundle(project: LocalProjectForSync) {
  const primaryPhone = compactString(project.workContext?.phone ?? project.client?.phone, 80);
  const secondaryPhoneSource =
    project.workContext?.phone && project.client?.phone && project.workContext.phone !== project.client.phone
      ? project.client.phone
      : null;
  const mobilePhone = compactString(secondaryPhoneSource, 80);

  return {
    primaryPhone,
    mobilePhone,
  };
}

function buildProjectNotes(metadata: ProjectMirrorMetadata) {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${value}`);

  if (lines.length === 0) {
    return null;
  }

  return [PROJECT_SYNC_NOTES_START, ...lines, PROJECT_SYNC_NOTES_END].join("\n");
}

function parseProjectSyncNotes(notes: unknown): ProjectMirrorMetadata | null {
  if (!notes) {
    return null;
  }

  const raw = String(notes);
  const startIndex = raw.indexOf(PROJECT_SYNC_NOTES_START);
  const endIndex = raw.indexOf(PROJECT_SYNC_NOTES_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const block = raw
    .slice(startIndex + PROJECT_SYNC_NOTES_START.length, endIndex)
    .trim();

  if (!block) {
    return null;
  }

  const metadata: Record<string, any> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    metadata[key] = value.replace(/\\n/g, "\n").trim();
  }

  const contractNumber = Number(metadata.contractNumber);
  if (Number.isFinite(contractNumber)) {
    metadata.contractNumber = contractNumber;
  } else {
    delete metadata.contractNumber;
  }

  return metadata as ProjectMirrorMetadata;
}

function parseNumericFromMetadata(value: string | null | undefined) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actionNameForSource(
  source: ProjectSyncSource,
  action: "Inserted" | "Updated" | "LinkedExisting"
) {
  if (source === "webhook") {
    if (action === "Inserted") return "InsertedFromWebhook";
    if (action === "Updated") return "UpdatedFromWebhook";
    return "LinkedAndUpdatedFromWebhook";
  }

  return action;
}

export function buildProjectDisplayName(project: {
  contract_number?: number | null;
  id: string;
}) {
  const base = project.contract_number != null
    ? `Project ${project.contract_number}`
    : `Project ${project.id.slice(0, 8)}`;

  return base.slice(0, 100);
}

export function extractProjectDisplayName(qbCustomer: any) {
  return (
    qbCustomer?.DisplayName ??
    qbCustomer?.Name ??
    qbCustomer?.FullyQualifiedName ??
    null
  );
}

export function buildProjectKey(parentCustomerId: string, projectName: string) {
  return `${parentCustomerId}::${projectName.trim().toLowerCase()}`;
}

export function parseQboUpdatedAt(customer: any) {
  return customer?.MetaData?.LastUpdatedTime
    ? new Date(customer.MetaData.LastUpdatedTime)
    : null;
}

export function parseProjectContractNumber(projectName: string | null | undefined) {
  if (!projectName) {
    return null;
  }

  const match = projectName.match(/\bproject\s*#?\s*(\d+)\b/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeLocalProjectForQbo(project: {
  id: string;
  contract_number?: number | null;
  status_project?: string | null;
  client?: ProjectClientForSync | null;
  workContext?: ProjectWorkContextForSync | null;
  quickbooksCustomerId?: string | null;
  price?: unknown;
  amountPaid?: unknown;
  balanceDue?: unknown;
  start_date?: string | null;
  deadline?: string | null;
  location?: string | null;
  lat?: string | null;
  log?: string | null;
  radius?: number | null;
}) {
  const address = buildProjectAddress(project as LocalProjectForSync);
  const notesMetadata = buildProjectMirrorMetadata(project as LocalProjectForSync);

  return {
    DisplayName: buildProjectDisplayName(project),
    ParentRefValue: project.client?.idQuickbooks ?? null,
    Job: true,
    Active: project.status_project !== "Finished",
    PrimaryEmail: compactString(project.workContext?.Email ?? project.client?.email, 150),
    PrimaryPhone: buildProjectPhoneBundle(project as LocalProjectForSync).primaryPhone,
    MobilePhone: buildProjectPhoneBundle(project as LocalProjectForSync).mobilePhone,
    BillAddr: normalizeAddressForCompare(address),
    ShipAddr: normalizeAddressForCompare(address),
    Notes: notesMetadata,
  };
}

export function normalizeQboProjectForCompare(qbCustomer: any) {
  const parsedNotes = parseProjectSyncNotes(qbCustomer?.Notes);

  return {
    DisplayName: compactString(extractProjectDisplayName(qbCustomer), 100),
    ParentRefValue: qbCustomer?.ParentRef?.value ?? null,
    Job: qbCustomer?.Job === true,
    Active: qbCustomer?.Active !== false,
    PrimaryEmail: compactString(qbCustomer?.PrimaryEmailAddr?.Address, 150),
    PrimaryPhone: compactString(qbCustomer?.PrimaryPhone?.FreeFormNumber, 80),
    MobilePhone: compactString(qbCustomer?.Mobile?.FreeFormNumber, 80),
    BillAddr: normalizeAddressForCompare(qbCustomer?.BillAddr),
    ShipAddr: normalizeAddressForCompare(qbCustomer?.ShipAddr),
    Notes: parsedNotes,
  };
}

export function buildProjectPayloadForQbo(project: LocalProjectForSync) {
  const projectName = buildProjectDisplayName(project);
  const address = buildProjectAddress(project);
  const notes = buildProjectNotes(buildProjectMirrorMetadata(project));
  const primaryEmail = compactString(project.workContext?.Email ?? project.client?.email, 150);
  const { primaryPhone, mobilePhone } = buildProjectPhoneBundle(project);

  return {
    DisplayName: projectName,
    Job: true,
    ParentRef: {
      value: project.client?.idQuickbooks ?? "",
    },
    Active: project.status_project !== "Finished",
    PrimaryEmailAddr: primaryEmail ? { Address: primaryEmail } : undefined,
    PrimaryPhone: primaryPhone ? { FreeFormNumber: primaryPhone } : undefined,
    Mobile: mobilePhone ? { FreeFormNumber: mobilePhone } : undefined,
    BillAddr: address,
    ShipAddr: address,
    Notes: notes ?? undefined,
  };
}

export function buildProjectLogDetails(params: {
  projectId: string;
  projectName: string | null;
  clientId?: string | null;
  qboParentCustomerId?: string | null;
  qboProjectCustomerId?: string | null;
  contractNumber?: number | null;
  reason?: string | null;
  error?: any;
}) {
  return jsonSafe({
    projectId: params.projectId,
    projectName: params.projectName ?? null,
    contractNumber: params.contractNumber ?? null,
    clientId: params.clientId ?? null,
    qboParentCustomerId: params.qboParentCustomerId ?? null,
    qboProjectCustomerId: params.qboProjectCustomerId ?? null,
    reason: params.reason ?? null,
    error: params.error ?? null,
  });
}

function deriveLocalProjectStatus(qbCustomer: any, currentStatus?: string | null) {
  const parsedNotes = parseProjectSyncNotes(qbCustomer?.Notes);

  if (qbCustomer?.Active === false) {
    return "Finished";
  }

  return parsedNotes?.status || currentStatus || "Pre-Start";
}

function buildProjectUpdateData(params: {
  companyId: string;
  localClientId: string;
  qbCustomer: any;
  parsedContractNumber: number | null;
  localProject?: LocalProjectForSync | null;
  projectName: string;
}) {
  const qbUpdatedAt = parseQboUpdatedAt(params.qbCustomer) ?? new Date();
  const currentStatus = params.localProject?.status_project ?? null;
  const parsedNotes = parseProjectSyncNotes(params.qbCustomer?.Notes);
  const billAddr = params.qbCustomer?.BillAddr ?? params.qbCustomer?.ShipAddr ?? null;
  const billLine1 = compactString(billAddr?.Line1, 500);
  const locationFallback =
    billLine1 ??
    compactString(parsedNotes?.location, 500) ??
    (params.parsedContractNumber == null ? params.projectName : null);
  const nextStatus = deriveLocalProjectStatus(params.qbCustomer, currentStatus);

  const data: Record<string, any> = {
    client_id: params.localClientId,
    company_id: params.companyId,
    quickbooksCustomerId: params.qbCustomer.Id ?? null,
    quickbooksSyncToken: params.qbCustomer.SyncToken ?? null,
    quickbooksUpdatedAt: qbUpdatedAt,
    status_project: nextStatus,
  };

  if (currentStatus !== nextStatus) {
    data.status_changed_at = new Date();
  }

  if (params.parsedContractNumber != null) {
    data.contract_number = params.parsedContractNumber;
  }

  const parsedPrice = parseNumericFromMetadata(parsedNotes?.price);
  if (parsedPrice != null) {
    data.price = parsedPrice;
  } else if (!params.localProject) {
    data.price = 0;
  }

  const parsedAmountPaid = parseNumericFromMetadata(parsedNotes?.amountPaid);
  if (parsedAmountPaid != null) {
    data.amountPaid = parsedAmountPaid;
  } else if (!params.localProject) {
    data.amountPaid = 0;
  }

  const parsedBalanceDue = parseNumericFromMetadata(parsedNotes?.balanceDue);
  if (parsedBalanceDue != null) {
    data.balanceDue = parsedBalanceDue;
  } else if (!params.localProject) {
    const basePrice = parsedPrice ?? 0;
    const basePaid = parsedAmountPaid ?? 0;
    data.balanceDue = basePrice - basePaid;
  }

  if (parsedNotes?.startDate != null) {
    data.start_date = parsedNotes.startDate;
  }

  if (parsedNotes?.deadline != null) {
    data.deadline = parsedNotes.deadline;
  }

  if (parsedNotes?.latitude != null) {
    data.lat = parsedNotes.latitude;
  }

  if (parsedNotes?.longitude != null) {
    data.log = parsedNotes.longitude;
  }

  const parsedRadius = parseNumericFromMetadata(parsedNotes?.radius);
  if (parsedRadius != null) {
    data.radius = parsedRadius;
  }

  if (!params.localProject) {
    data.location = locationFallback;
  } else if (!params.localProject.location && locationFallback) {
    data.location = locationFallback;
  } else if (locationFallback && params.localProject.location !== locationFallback) {
    data.location = locationFallback;
  }

  return data;
}

export async function upsertProjectFromQBO({
  companyId,
  qbCustomer,
  syncExecutionId,
  source = "sync",
}: UpsertProjectParams): Promise<UpsertProjectResult> {
  const qbId = qbCustomer?.Id as string | undefined;
  const projectName = extractProjectDisplayName(qbCustomer);
  const qboParentCustomerId = qbCustomer?.ParentRef?.value ?? null;
  const parsedNotes = parseProjectSyncNotes(qbCustomer?.Notes);
  const parsedContractNumber =
    parseProjectContractNumber(projectName) ?? parsedNotes?.contractNumber ?? null;
  const qbUpdatedAt = parseQboUpdatedAt(qbCustomer);

  if (!qbId || !qbCustomer?.Job) {
    return {
      action: "Skipped",
      reason: "Customer is not a QuickBooks job/subcustomer",
    };
  }

  if (!qboParentCustomerId) {
    await createSyncLog({
      entity: PROJECT_SYNC_ENTITY,
      action: source === "webhook" ? "WebhookSkipped" : "Skipped",
      entityId: qbId,
      companyId,
      details: buildProjectLogDetails({
        projectId: qbId,
        projectName,
        qboProjectCustomerId: qbId,
        reason: "QuickBooks job has no parent customer",
      }),
      syncExecutionId,
    });

    return {
      action: "Skipped",
      reason: "QuickBooks job has no parent customer",
    };
  }

  const localClient = await prisma.client.findFirst({
    where: {
      company_id: companyId,
      idQuickbooks: qboParentCustomerId,
    },
    select: {
      id: true,
    },
  });

  if (!localClient) {
    await createSyncLog({
      entity: PROJECT_SYNC_ENTITY,
      action: source === "webhook" ? "WebhookSkipped" : "Skipped",
      entityId: qbId,
      companyId,
      details: buildProjectLogDetails({
        projectId: qbId,
        projectName,
        qboParentCustomerId,
        qboProjectCustomerId: qbId,
        contractNumber: parsedContractNumber,
        reason: "Parent customer is not synced in SmartBuild",
      }),
      syncExecutionId,
    });

    return {
      action: "Skipped",
      reason: "Parent customer is not synced in SmartBuild",
    };
  }

  const existingByQbo = await prisma.project.findFirst({
    where: {
      company_id: companyId,
      quickbooksCustomerId: qbId,
    },
    select: {
      id: true,
      contract_number: true,
      client_id: true,
      company_id: true,
      quickbooksCustomerId: true,
      quickbooksSyncToken: true,
      quickbooksUpdatedAt: true,
      status_project: true,
      location: true,
    },
  });

  if (existingByQbo) {
    const lastSeenRemote = existingByQbo.quickbooksUpdatedAt ?? new Date(0);

    if (qbUpdatedAt && qbUpdatedAt <= lastSeenRemote) {
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: source === "webhook" ? "WebhookSkipped" : "Skipped",
        entityId: existingByQbo.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: existingByQbo.id,
          projectName,
          clientId: existingByQbo.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: qbId,
          contractNumber: parsedContractNumber,
          reason: "QBO not newer than local mirror",
        }),
        syncExecutionId,
      });

      return { action: "Skipped", projectId: existingByQbo.id, reason: "QBO not newer than local mirror" };
    }

    const updated = await prisma.project.update({
      where: { id: existingByQbo.id },
      data: buildProjectUpdateData({
        companyId,
        localClientId: localClient.id,
        qbCustomer,
        parsedContractNumber,
        localProject: existingByQbo,
        projectName: projectName ?? buildProjectDisplayName(existingByQbo),
      }),
      select: { id: true },
    });

    await createSyncLog({
      entity: PROJECT_SYNC_ENTITY,
      action: actionNameForSource(source, "Updated"),
      entityId: updated.id,
      companyId,
      details: buildProjectLogDetails({
        projectId: updated.id,
        projectName,
        clientId: localClient.id,
        qboParentCustomerId,
        qboProjectCustomerId: qbId,
        contractNumber: parsedContractNumber,
      }),
      syncExecutionId,
    });

    return { action: "Updated", projectId: updated.id };
  }

  if (parsedContractNumber != null) {
    const matchedProjects = await prisma.project.findMany({
      where: {
        company_id: companyId,
        client_id: localClient.id,
        contract_number: parsedContractNumber,
      },
      select: {
        id: true,
        contract_number: true,
        client_id: true,
        company_id: true,
        quickbooksCustomerId: true,
        quickbooksSyncToken: true,
        quickbooksUpdatedAt: true,
        status_project: true,
        location: true,
      },
      take: 2,
    });

    if (matchedProjects.length > 1) {
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "Conflict",
        entityId: qbId,
        companyId,
        details: buildProjectLogDetails({
          projectId: qbId,
          projectName,
          clientId: localClient.id,
          qboParentCustomerId,
          qboProjectCustomerId: qbId,
          contractNumber: parsedContractNumber,
          reason: "Multiple local projects matched the same contract number for this client",
        }),
        syncExecutionId,
      });

      return {
        action: "Conflict",
        reason: "Multiple local projects matched the same contract number for this client",
      };
    }

    if (matchedProjects.length === 1) {
      const matchedProject = matchedProjects[0];
      const updated = await prisma.project.update({
        where: { id: matchedProject.id },
        data: buildProjectUpdateData({
          companyId,
          localClientId: localClient.id,
          qbCustomer,
          parsedContractNumber,
          localProject: matchedProject,
          projectName: projectName ?? buildProjectDisplayName(matchedProject),
        }),
        select: { id: true },
      });

      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: actionNameForSource(source, "LinkedExisting"),
        entityId: updated.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: updated.id,
          projectName,
          clientId: localClient.id,
          qboParentCustomerId,
          qboProjectCustomerId: qbId,
          contractNumber: parsedContractNumber,
          reason: "Matched by contract number and parent customer",
        }),
        syncExecutionId,
      });

      return { action: "LinkedExisting", projectId: updated.id };
    }
  }

  const created = await prisma.project.create({
    data: buildProjectUpdateData({
      companyId,
      localClientId: localClient.id,
      qbCustomer,
      parsedContractNumber,
      projectName: projectName ?? `QBO Job ${qbId}`,
    }) as any,
    select: { id: true },
  });

  await createSyncLog({
    entity: PROJECT_SYNC_ENTITY,
    action: actionNameForSource(source, "Inserted"),
    entityId: created.id,
    companyId,
    details: buildProjectLogDetails({
      projectId: created.id,
      projectName,
      clientId: localClient.id,
      qboParentCustomerId,
      qboProjectCustomerId: qbId,
      contractNumber: parsedContractNumber,
    }),
    syncExecutionId,
  });

  return { action: "Inserted", projectId: created.id };
}

export async function logProjectDeleteEvent(params: {
  companyId: string;
  qboProjectCustomerId: string;
  projectId?: string;
  source?: ProjectSyncSource;
}) {
  await createSyncLog({
    entity: PROJECT_SYNC_ENTITY,
    action: params.source === "webhook" ? "WebhookDelete" : "Deleted",
    entityId: params.projectId ?? params.qboProjectCustomerId,
    companyId: params.companyId,
    details: buildProjectLogDetails({
      projectId: params.projectId ?? params.qboProjectCustomerId,
      projectName: null,
      qboProjectCustomerId: params.qboProjectCustomerId,
      reason: "Delete event received from QuickBooks",
    }),
  });
}
