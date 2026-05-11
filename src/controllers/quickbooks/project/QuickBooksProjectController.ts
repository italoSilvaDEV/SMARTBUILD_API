import { Request, Response } from "express";
import axios from "axios";
import { getQbClientOrThrow, getQbClientWithAccountOrThrow } from "../util/QuickBooksClientUtil";
import { qboClientForAccount } from "../util/http/qboClientFactory";
import { resolveImportedProjectBaseStatus } from "../util/QuickBooksProjectStatusUtil";
import { prisma } from "../../../utils/prisma";

type QuickBooksPreferenceNameValue = {
  Name?: string;
  Value?: string | boolean;
};

type QuickBooksProjectRelatedEntity =
  | "Estimate"
  | "Invoice"
  | "Payment"
  | "SalesReceipt"
  | "Bill"
  | "TimeActivity";

const PROJECT_RELATED_ENTITIES: QuickBooksProjectRelatedEntity[] = [
  "Estimate",
  "Invoice",
  "Payment",
  "SalesReceipt",
  "Bill",
  "TimeActivity",
];

type QuickBooksProjectRelatedPayload = {
  ok: boolean;
  count: number;
  query: string;
  rows: any[];
  error?: any;
};

type EnrichedQuickBooksProject = Record<string, any> & {
  relatedData: Record<QuickBooksProjectRelatedEntity, QuickBooksProjectRelatedPayload>;
  relatedSummary: Record<QuickBooksProjectRelatedEntity, number>;
};

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function extractProjectsEnabled(preferencesPayload: any): boolean | null {
  const directValue = normalizeBoolean(
    preferencesPayload?.Preferences?.OtherPrefs?.ProjectsEnabled
  );

  if (directValue !== null) {
    return directValue;
  }

  const rootDirectValue = normalizeBoolean(
    preferencesPayload?.OtherPrefs?.ProjectsEnabled
  );

  if (rootDirectValue !== null) {
    return rootDirectValue;
  }

  const nameValues = preferencesPayload?.Preferences?.OtherPrefs?.NameValue;

  if (Array.isArray(nameValues)) {
    const projectsPreference = nameValues.find(
      (item: QuickBooksPreferenceNameValue) => item?.Name === "ProjectsEnabled"
    );

    return normalizeBoolean(projectsPreference?.Value);
  }

  const rootNameValues = preferencesPayload?.OtherPrefs?.NameValue;

  if (Array.isArray(rootNameValues)) {
    const projectsPreference = rootNameValues.find(
      (item: QuickBooksPreferenceNameValue) => item?.Name === "ProjectsEnabled"
    );

    return normalizeBoolean(projectsPreference?.Value);
  }

  return null;
}

function escapeQboString(value: string): string {
  return value.replace(/'/g, "\\'");
}

function normalizeQboRows<T = any>(queryResponse: any, entityName: string): T[] {
  const payload = queryResponse?.[entityName];

  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload) {
    return [payload];
  }

  return [];
}

async function runQboQuery(
  api: ReturnType<typeof qboClientForAccount>,
  query: string,
  minorversion: number
) {
  const { data } = await api.get(`/query`, {
    params: { query, minorversion },
  });

  return data;
}

async function fetchQboCustomerById(
  api: ReturnType<typeof qboClientForAccount>,
  customerId: string,
  minorversion: number
) {
  const { data } = await api.get(`/customer/${customerId}`, {
    params: { minorversion },
  });

  return data?.Customer ?? data ?? null;
}

function formatAddressFromQbo(address: any): string | null {
  if (!address) return null;

  const parts = [
    address.Line1,
    address.Line2,
    address.Line3,
    address.City,
    address.CountrySubDivisionCode,
    address.PostalCode,
    address.Country,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function formatCityAndStateFromQbo(address: any): string | null {
  if (!address) return null;

  const parts = [address.City, address.CountrySubDivisionCode]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function getLatestCommercialDocs(qboProject: EnrichedQuickBooksProject) {
  return [
    ...(qboProject.relatedData?.Estimate?.rows || []),
    ...(qboProject.relatedData?.Invoice?.rows || []),
    ...(qboProject.relatedData?.SalesReceipt?.rows || []),
  ]
    .slice()
    .sort((a: any, b: any) => String(b?.TxnDate || "").localeCompare(String(a?.TxnDate || "")));
}

function collectProjectRefValues(rows: any[]): string[] {
  const refs = new Set<string>();

  const addRef = (value: any) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (normalized) refs.add(normalized);
  };

  for (const row of rows) {
    addRef(row?.ProjectRef?.value);

    const lines = Array.isArray(row?.Line) ? row.Line : [];
    for (const line of lines) {
      addRef(line?.ProjectRef?.value);
      addRef(line?.AccountBasedExpenseLineDetail?.ProjectRef?.value);
      addRef(line?.ItemBasedExpenseLineDetail?.ProjectRef?.value);
      addRef(line?.SalesItemLineDetail?.ProjectRef?.value);
    }
  }

  return Array.from(refs);
}

function summarizeAddress(address: any) {
  if (!address) return null;

  return {
    formatted: formatAddressFromQbo(address),
    cityAndState: formatCityAndStateFromQbo(address),
    raw: address,
  };
}

function pickLatestTxn(rows: any[]) {
  return rows
    .slice()
    .sort((a: any, b: any) =>
      String(b?.TxnDate || b?.MetaData?.LastUpdatedTime || "").localeCompare(
        String(a?.TxnDate || a?.MetaData?.LastUpdatedTime || "")
      )
    )
    .at(0) ?? null;
}

function resolveImportedProjectLocation(
  qboProject: EnrichedQuickBooksProject,
  parentCustomer: any | null,
  projectReadById: any | null
) {
  const latestDocs = getLatestCommercialDocs(qboProject);
  const addressCandidates = [
    { source: "projectReadById.ShipAddr", address: projectReadById?.ShipAddr },
    { source: "projectReadById.BillAddr", address: projectReadById?.BillAddr },
    { source: "projectQuery.ShipAddr", address: qboProject?.ShipAddr },
    { source: "projectQuery.BillAddr", address: qboProject?.BillAddr },
    { source: "parentCustomer.ShipAddr", address: parentCustomer?.ShipAddr },
    { source: "parentCustomer.BillAddr", address: parentCustomer?.BillAddr },
  ];

  const normalizedDocCandidates = latestDocs.flatMap((doc: any) => [
    { source: `${doc?.Id || "doc"}.ShipAddr`, address: doc?.ShipAddr },
    { source: `${doc?.Id || "doc"}.BillAddr`, address: doc?.BillAddr },
  ]);

  const selectedCandidate = [...addressCandidates.slice(0, 4), ...normalizedDocCandidates, ...addressCandidates.slice(4)]
    .find((candidate) => formatAddressFromQbo(candidate.address));
  const selectedAddress = selectedCandidate?.address;

  return {
    address: selectedAddress ? formatAddressFromQbo(selectedAddress) : null,
    cityAndState: selectedAddress ? formatCityAndStateFromQbo(selectedAddress) : null,
    lat:
      selectedAddress && typeof selectedAddress.Lat === "string"
        ? selectedAddress.Lat
        : selectedAddress && typeof selectedAddress.Lat === "number"
          ? String(selectedAddress.Lat)
          : null,
    log:
      selectedAddress && typeof selectedAddress.Long === "string"
        ? selectedAddress.Long
        : selectedAddress && typeof selectedAddress.Long === "number"
          ? String(selectedAddress.Long)
          : null,
    source: selectedCandidate?.source || null,
  };
}

function decimalishToNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object" && "toString" in (value as any)) {
    const parsed = Number((value as any).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.includes("T") ? value.slice(0, 10) : value;
}

function getLatestTxnDate(rows: any[]): string | undefined {
  const dates = rows
    .map((row) => toIsoDate(row?.TxnDate || row?.MetaData?.LastUpdatedTime || row?.MetaData?.CreateTime))
    .filter(Boolean) as string[];

  return dates.sort().at(-1);
}

function mapQboProjectStatus(project: any, estimates: any[], invoices: any[], payments: any[]): string {
  if (project?.Active === false) return "Canceled";

  const latestEstimate = estimates
    .slice()
    .sort((a, b) => String(a?.TxnDate || "").localeCompare(String(b?.TxnDate || "")))
    .at(-1);

  const txnStatus = String(latestEstimate?.TxnStatus || "").toLowerCase();

  if (payments.length > 0 || invoices.length > 0) return "In Progress";
  if (txnStatus === "accepted" || txnStatus === "pending") return "Pre-Start";
  if (txnStatus === "closed") return "Finished";
  if (txnStatus === "declined" || txnStatus === "rejected") return "Denied";

  return "Pre-Start";
}

function computeProjectFinancials(qboProject: EnrichedQuickBooksProject) {
  const estimates = qboProject.relatedData?.Estimate?.rows || [];
  const invoices = qboProject.relatedData?.Invoice?.rows || [];
  const payments = qboProject.relatedData?.Payment?.rows || [];
  const salesReceipts = qboProject.relatedData?.SalesReceipt?.rows || [];

  const latestEstimate = estimates
    .slice()
    .sort((a, b) => String(a?.TxnDate || "").localeCompare(String(b?.TxnDate || "")))
    .at(-1);

  const estimateTotal = latestEstimate ? decimalishToNumber(latestEstimate?.TotalAmt) : 0;
  const invoiceTotal = invoices.reduce((sum: number, row: any) => sum + decimalishToNumber(row?.TotalAmt), 0);
  const paymentTotal = payments.reduce((sum: number, row: any) => sum + decimalishToNumber(row?.TotalAmt), 0);
  const salesReceiptTotal = salesReceipts.reduce((sum: number, row: any) => sum + decimalishToNumber(row?.TotalAmt), 0);
  const amountPaid = paymentTotal + salesReceiptTotal;
  const price = estimateTotal || invoiceTotal || salesReceiptTotal || 0;

  return {
    price,
    amountPaid,
    balanceDue: Math.max(price - amountPaid, 0),
    startDate:
      getLatestTxnDate(estimates) ||
      getLatestTxnDate(invoices) ||
      toIsoDate(qboProject?.MetaData?.CreateTime),
    deadline: undefined,
    statusProject: mapQboProjectStatus(qboProject, estimates, invoices, payments),
  };
}

function buildImportedServices(qboProject: EnrichedQuickBooksProject) {
  const docs = [
    ...(qboProject.relatedData?.Estimate?.rows || []).map((row: any) => ({ source: "Estimate", row })),
    ...(qboProject.relatedData?.Invoice?.rows || []).map((row: any) => ({ source: "Invoice", row })),
    ...(qboProject.relatedData?.SalesReceipt?.rows || []).map((row: any) => ({ source: "SalesReceipt", row })),
  ];

  const serviceMap = new Map<
    string,
    {
      name: string;
      description: string;
      price: number;
      sources: Set<string>;
    }
  >();

  for (const doc of docs) {
    const lines = Array.isArray(doc.row?.Line) ? doc.row.Line : [];

    for (const line of lines) {
      if (line?.DetailType !== "SalesItemLineDetail") continue;

      const detail = line?.SalesItemLineDetail || {};
      const name =
        detail?.ItemRef?.name ||
        line?.Description ||
        `${doc.source} item ${line?.Id || ""}`.trim();

      const key = String(detail?.ItemRef?.value || name).trim().toLowerCase();
      const descriptionParts = [
        typeof line?.Description === "string" ? line.Description.trim() : "",
        `Imported from QuickBooks ${doc.source}${doc.row?.DocNumber ? ` #${doc.row.DocNumber}` : ""}.`,
      ].filter(Boolean);

      const current = serviceMap.get(key);

      if (current) {
        current.price += decimalishToNumber(line?.Amount);
        current.sources.add(doc.source);
        if (descriptionParts[0] && !current.description.includes(descriptionParts[0])) {
          current.description = `${current.description}\n${descriptionParts.join(" ")}`.trim();
        }
      } else {
        serviceMap.set(key, {
          name: String(name).slice(0, 191),
          description: descriptionParts.join(" ").trim() || `Imported from QuickBooks ${doc.source}.`,
          price: decimalishToNumber(line?.Amount),
          sources: new Set([doc.source]),
        });
      }
    }
  }

  return Array.from(serviceMap.values()).map((service) => ({
    ...service,
    hours: 0,
    status: "Pending",
  }));
}

async function enrichProjectWithRelatedData(
  api: ReturnType<typeof qboClientForAccount>,
  project: any,
  minorversion: number
): Promise<EnrichedQuickBooksProject> {
  const projectId = String(project?.Id || "");
  const customerRefEntities = PROJECT_RELATED_ENTITIES.filter(
    (entityName) => entityName !== "Bill"
  );
  const relatedQueries = Object.fromEntries(
    customerRefEntities.map((entityName) => [
        entityName,
        `SELECT * FROM ${entityName} WHERE CustomerRef = '${escapeQboString(projectId)}'`,
      ])
    ) as Partial<Record<QuickBooksProjectRelatedEntity, string>>;

  const relatedEntries = await Promise.all(
    customerRefEntities.map(async (entityName) => {
        const entityQuery = relatedQueries[entityName]!;

        try {
          const entityData = await runQboQuery(api, entityQuery, minorversion);
        const rows = normalizeQboRows(entityData?.QueryResponse, entityName);

        return [
          entityName,
          {
            ok: true,
            count: rows.length,
            query: entityQuery,
            rows,
          },
        ] as const;
      } catch (entityError: any) {
        return [
          entityName,
          {
            ok: false,
            count: 0,
            query: entityQuery,
            rows: [],
            error:
              entityError?.response?.data ||
              entityError?.message ||
              "Unknown error",
          },
        ] as const;
      }
      })
    );

  const relatedData = Object.fromEntries(relatedEntries) as Partial<
    Record<QuickBooksProjectRelatedEntity, QuickBooksProjectRelatedPayload>
  >;

  const projectRefIds = collectProjectRefValues([
    ...(relatedData.Estimate?.rows || []),
    ...(relatedData.Invoice?.rows || []),
    ...(relatedData.SalesReceipt?.rows || []),
  ]);

  const billQuery = "SELECT * FROM Bill MAXRESULTS 1000";
  try {
    const billData = await runQboQuery(api, billQuery, minorversion);
    const allBills = normalizeQboRows(billData?.QueryResponse, "Bill");
    const filteredBills =
      projectRefIds.length > 0
        ? allBills.filter((bill: any) => {
            const billProjectRefs = collectProjectRefValues([bill]);
            return billProjectRefs.some((ref) => projectRefIds.includes(ref));
          })
        : [];

    relatedData.Bill = {
      ok: true,
      count: filteredBills.length,
      query: `${billQuery} // filtered locally by ProjectRef: ${projectRefIds.join(", ") || "none"}`,
      rows: filteredBills,
    };
  } catch (entityError: any) {
    relatedData.Bill = {
      ok: false,
      count: 0,
      query: billQuery,
      rows: [],
      error:
        entityError?.response?.data ||
        entityError?.message ||
        "Unknown error",
    };
  }

  for (const entityName of PROJECT_RELATED_ENTITIES) {
    if (!relatedData[entityName]) {
      relatedData[entityName] = {
        ok: true,
        count: 0,
        query: "",
        rows: [],
      };
    }
  }

  return {
    ...project,
    relatedData: relatedData as Record<
      QuickBooksProjectRelatedEntity,
      QuickBooksProjectRelatedPayload
    >,
    relatedSummary: Object.fromEntries(
      PROJECT_RELATED_ENTITIES.map((entityName) => [
        entityName,
        relatedData[entityName]?.count ?? 0,
      ])
    ) as Record<QuickBooksProjectRelatedEntity, number>,
  };
}

async function fetchEnrichedQuickBooksProjects(
  userId: string,
  companyId: string
) {
  const { api, minorversion, customers, projects } = await fetchQuickBooksProjectShells(
    userId,
    companyId
  );
  const enrichedProjects = await Promise.all(
    projects.map((project: any) => enrichProjectWithRelatedData(api, project, minorversion))
  );

  return {
    api,
    minorversion,
    query: "SELECT * FROM Customer WHERE Job = true MAXRESULTS 1000",
    customers,
    projects: enrichedProjects,
  };
}

async function fetchQuickBooksProjectShells(
  userId: string,
  companyId: string
) {
  const { qb, account } = await getQbClientWithAccountOrThrow(userId, companyId);
  const api = qboClientForAccount(account.id);
  const query = "SELECT * FROM Customer WHERE Job = true MAXRESULTS 1000";
  const minorversion = 40;
  const data = await runQboQuery(api, query, minorversion);

  const customers = Array.isArray(data?.QueryResponse?.Customer)
    ? data.QueryResponse.Customer
    : data?.QueryResponse?.Customer
      ? [data.QueryResponse.Customer]
      : [];

  const projects = customers.filter((customer: any) => customer?.IsProject === true);

  return {
    qb,
    account,
    api,
    minorversion,
    query,
    customers,
    projects,
  };
}

async function findOrCreateClientForImportedProject(params: {
  companyId: string;
  userId: string;
  qboProject: EnrichedQuickBooksProject;
  parentCustomer: any | null;
  projectAddress: string | null;
  projectCityAndState: string | null;
}) {
  const { companyId, userId, qboProject, parentCustomer, projectAddress, projectCityAndState } = params;

  const parentId = parentCustomer?.Id ? String(parentCustomer.Id) : null;
  const email =
    parentCustomer?.PrimaryEmailAddr?.Address ||
    qboProject?.PrimaryEmailAddr?.Address ||
    `qbo-project-${qboProject.Id}@smartbuild.local`;
  const phone = parentCustomer?.PrimaryPhone?.FreeFormNumber || null;
  const address =
    formatAddressFromQbo(parentCustomer?.BillAddr) ||
    formatAddressFromQbo(parentCustomer?.ShipAddr) ||
    projectAddress;
  const cityAndState =
    formatCityAndStateFromQbo(parentCustomer?.BillAddr) ||
    formatCityAndStateFromQbo(parentCustomer?.ShipAddr) ||
    projectCityAndState;
  const clientName =
    parentCustomer?.DisplayName ||
    parentCustomer?.FullyQualifiedName ||
    qboProject?.ParentRef?.name ||
    qboProject?.DisplayName ||
    "QuickBooks Client";

  let client =
    (parentId
      ? await prisma.client.findFirst({
          where: {
            company_id: companyId,
            idQuickbooks: parentId,
          },
        })
      : null) ||
    (email
      ? await prisma.client.findFirst({
          where: {
            company_id: companyId,
            email,
          },
        })
      : null);

  const clientData = {
    name: clientName,
    email,
    phone,
    company_id: companyId,
    location: address,
    addressOffice: address,
    city_and_state: cityAndState,
    idQuickbooks: parentId,
    quickbooksUpdatedAt: parentCustomer?.MetaData?.LastUpdatedTime
      ? new Date(parentCustomer.MetaData.LastUpdatedTime)
      : undefined,
    autorId: client?.autorId || userId,
  };

  if (client) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: clientData,
    });
  } else {
    client = await prisma.client.create({
      data: clientData,
    });
  }

  return client;
}

async function ensureWorkContextForImportedProject(params: {
  client: any;
  companyId: string;
  qboProject: EnrichedQuickBooksProject;
  parentCustomer: any | null;
  projectAddress: string | null;
}) {
  const { client, companyId, qboProject, parentCustomer, projectAddress } = params;
  const email = qboProject?.PrimaryEmailAddr?.Address || parentCustomer?.PrimaryEmailAddr?.Address || client.email;
  const name = qboProject?.DisplayName || parentCustomer?.DisplayName || client.name;
  const phone = parentCustomer?.PrimaryPhone?.FreeFormNumber || client.phone || "";
  const address = projectAddress || client.addressOffice || client.location || "";

  if (!name || !email) return null;

  const existing = await prisma.workContext.findFirst({
    where: {
      clientId: client.id,
      companyId,
      Name: name,
      Email: email,
    },
  });

  if (existing) {
    return prisma.workContext.update({
      where: { id: existing.id },
      data: {
        phone,
        addressOffice: address,
        location: address,
        notes: `QuickBooks project import for project ${qboProject.Id}`,
      },
    });
  }

  return prisma.workContext.create({
    data: {
      clientId: client.id,
      companyId,
      type: "PERSONAL",
      Name: name,
      Email: email,
      phone,
      addressOffice: address,
      location: address,
      notes: `QuickBooks project import for project ${qboProject.Id}`,
    },
  });
}

async function getNextProjectContractNumber(companyId: string) {
  const lastEstimate = await prisma.estimate.findFirst({
    where: {
      project: {
        company_id: companyId,
      },
    },
    select: {
      number: true,
    },
    orderBy: {
      number: "desc",
    },
  });

  const lastProject = await prisma.project.findFirst({
    where: {
      company_id: companyId,
      contract_number: { not: null },
    },
    select: {
      contract_number: true,
    },
    orderBy: {
      contract_number: "desc",
    },
  });

  let lastEstimateNumber = 0;
  if (lastEstimate?.number) {
    const parts = lastEstimate.number.split("/");
    lastEstimateNumber = Number(parts[0]) || 0;
  }

  const lastProjectNumber = Number(lastProject?.contract_number || 0);
  return Math.max(lastEstimateNumber, lastProjectNumber) + 1;
}

function buildMinimalProjectFinancials(qboProject: any) {
  return {
    price: 0,
    amountPaid: 0,
    balanceDue: 0,
    startDate: toIsoDate(qboProject?.MetaData?.CreateTime),
    deadline: undefined,
    statusProject: resolveImportedProjectBaseStatus(qboProject),
  };
}

export async function importQuickBooksProjectToSmartBuild(params: {
  api: ReturnType<typeof qboClientForAccount>;
  minorversion: number;
  companyId: string;
  userId: string;
  qboProject: any;
}) {
  const { api, minorversion, companyId, userId, qboProject } = params;
  const parentCustomerId = qboProject?.ParentRef?.value
    ? String(qboProject.ParentRef.value)
    : null;
  const parentCustomer = parentCustomerId
    ? await fetchQboCustomerById(api, parentCustomerId, minorversion).catch(() => null)
    : null;
  const resolvedProjectLocation = resolveImportedProjectLocation(
    qboProject as any,
    parentCustomer,
    null
  );

  const client = await findOrCreateClientForImportedProject({
    companyId,
    userId,
    qboProject: qboProject as any,
    parentCustomer,
    projectAddress: resolvedProjectLocation.address,
    projectCityAndState: resolvedProjectLocation.cityAndState,
  });

  const workContext = await ensureWorkContextForImportedProject({
    client,
    companyId,
    qboProject: qboProject as any,
    parentCustomer,
    projectAddress: resolvedProjectLocation.address,
  });

  const financials = buildMinimalProjectFinancials(qboProject);
  const metadataMarker = `QBO_PROJECT:${qboProject.Id}`;

  const existingImportedLink = await prisma.projectPastes.findFirst({
    where: {
      companyId,
      name: metadataMarker,
    },
    select: {
      projectId: true,
      project: {
        select: {
          status_project: true,
        },
      },
    },
  });

  let project: any;
  let action: "created" | "updated" = "created";

  if (existingImportedLink?.projectId) {
    action = "updated";
    project = await prisma.project.update({
      where: { id: existingImportedLink.projectId },
      data: {
        seller_user_id: userId,
        price: financials.price,
        status_project: resolveImportedProjectBaseStatus(
          qboProject,
          existingImportedLink.project?.status_project
        ),
        client_id: client.id,
        start_date: financials.startDate,
        deadline: financials.deadline,
        company_id: companyId,
        location: resolvedProjectLocation.address || client.location || "",
        lat: resolvedProjectLocation.lat || client.lat || "",
        log: resolvedProjectLocation.log || client.log || "",
        radius: client.radius ?? null,
        balanceDue: financials.balanceDue,
        amountPaid: financials.amountPaid,
        workContextId: workContext?.id || null,
      },
    });
  } else {
    const nextContractNumber = await getNextProjectContractNumber(companyId);

    project = await prisma.project.create({
      data: {
        seller_user_id: userId,
        price: financials.price,
        status_project: financials.statusProject,
        client_id: client.id,
        start_date: financials.startDate,
        deadline: financials.deadline,
        company_id: companyId,
        contract_number: nextContractNumber,
        location: resolvedProjectLocation.address || client.location || "",
        lat: resolvedProjectLocation.lat || client.lat || "",
        log: resolvedProjectLocation.log || client.log || "",
        radius: client.radius ?? null,
        balanceDue: financials.balanceDue,
        amountPaid: financials.amountPaid,
        workContextId: workContext?.id || null,
      },
    });

    await prisma.projectPastes.create({
      data: {
        name: metadataMarker,
        userAuthorId: userId,
        projectId: project.id,
        companyId,
      },
    });
  }

  return {
    action,
    localProjectId: project.id,
    contractNumber: project.contract_number,
    qboProjectId: qboProject.Id,
    qboProjectName: qboProject.DisplayName,
    localClientId: client.id,
    workContextId: workContext?.id || null,
    importedServices: {
      created: 0,
      updated: 0,
      detected: 0,
    },
    financials,
    resolvedLocation: resolvedProjectLocation,
    qboData: {
      projectQuery: qboProject,
      parentCustomer,
      relatedData: null,
    },
  };
}

export class QuickBooksProjectController {
  async preCheck(req: Request, res: Response) {
    const { companyId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    try {
      const qb = await getQbClientOrThrow(userId, companyId);

      const preferencesPayload = await new Promise<any>((resolve, reject) => {
        qb.getPreferences((error: any, data: any) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(data);
        });
      });

      const projectsEnabled = extractProjectsEnabled(preferencesPayload);
      const preferenceCandidates = [
        preferencesPayload?.Preferences?.OtherPrefs?.NameValue,
        preferencesPayload?.OtherPrefs?.NameValue,
      ];

      const projectPreference =
        preferenceCandidates
          .find((value) => Array.isArray(value))
          ?.find((item: QuickBooksPreferenceNameValue) => item?.Name === "ProjectsEnabled") ?? null;

      const preCheckPassed = projectsEnabled === true;
      const supported = projectsEnabled === true;

      return res.status(200).json({
        ok: preCheckPassed,
        projectsEnabled,
        supported,
        preCheckPassed,
        status: preCheckPassed ? "ok" : projectsEnabled === false ? "disabled" : "unknown",
        message:
          preCheckPassed
            ? "QuickBooks Projects is enabled for this company."
            : projectsEnabled === false
              ? "QuickBooks Projects is disabled for this company."
              : "Could not determine whether QuickBooks Projects is enabled for this company.",
        preference: projectPreference,
      });
    } catch (error: any) {
      console.error("QuickBooks Projects pre-check error:", error);

      return res.status(500).json({
        error: "Failed to run QuickBooks Projects pre-check",
        details: error?.Fault || error?.message || "Unknown error",
      });
    }
  }

  async listProjects(req: Request, res: Response) {
    const { companyId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    try {
      const { minorversion, query, customers, projects: enrichedProjects } =
        await fetchEnrichedQuickBooksProjects(userId, companyId);

      return res.status(200).json({
        ok: true,
        message: `Fetched ${enrichedProjects.length} QuickBooks project(s) with related QuickBooks data.`,
        count: enrichedProjects.length,
        projects: enrichedProjects,
        queryMode: "rest-customer-isproject",
        query,
        minorversion,
        sourceCount: customers.length,
        relatedEntities: PROJECT_RELATED_ENTITIES,
      });
    } catch (error: any) {
      console.error("QuickBooks Projects list error:", error?.response?.data || error);
      return res.status(error?.response?.status || 500).json({
        error: "Failed to list QuickBooks projects",
        details:
          error?.response?.data ||
          error?.message ||
          "Unknown error",
        queryMode: "rest-customer-isproject",
      });
    }
  }

  async debugProjectCount(req: Request, res: Response) {
    const { companyId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    try {
      const { account, api, query, minorversion, customers, projects } =
        await fetchQuickBooksProjectShells(userId, companyId);
      const enrichedProjects = await Promise.all(
        projects.map((project: any) => enrichProjectWithRelatedData(api, project, minorversion))
      );
      const restAddressDiagnostics = await Promise.all(
        enrichedProjects.map(async (project: EnrichedQuickBooksProject) => {
          const projectId = String(project?.Id || "");
          const parentId = project?.ParentRef?.value ? String(project.ParentRef.value) : null;
          const projectReadById = projectId
            ? await fetchQboCustomerById(api, projectId, minorversion).catch(() => null)
            : null;
          const parentCustomer = parentId
            ? await fetchQboCustomerById(api, parentId, minorversion).catch(() => null)
            : null;

          const latestEstimate = pickLatestTxn(project.relatedData?.Estimate?.rows || []);
          const latestInvoice = pickLatestTxn(project.relatedData?.Invoice?.rows || []);
          const latestSalesReceipt = pickLatestTxn(project.relatedData?.SalesReceipt?.rows || []);
          const latestPayment = pickLatestTxn(project.relatedData?.Payment?.rows || []);

          const resolvedLocation = resolveImportedProjectLocation(
            project,
            parentCustomer,
            projectReadById
          );

          return {
            projectId,
            queriesTested: {
              customerByProjectId: `GET /customer/${projectId}`,
              customerByParentId: parentId ? `GET /customer/${parentId}` : null,
              estimateByCustomerRef: `SELECT * FROM Estimate WHERE CustomerRef = '${projectId}'`,
              invoiceByCustomerRef: `SELECT * FROM Invoice WHERE CustomerRef = '${projectId}'`,
              salesReceiptByCustomerRef: `SELECT * FROM SalesReceipt WHERE CustomerRef = '${projectId}'`,
            },
            projectQuery: {
              billAddr: summarizeAddress(project?.BillAddr),
              shipAddr: summarizeAddress(project?.ShipAddr),
            },
            projectReadById: {
              found: !!projectReadById,
              billAddr: summarizeAddress(projectReadById?.BillAddr),
              shipAddr: summarizeAddress(projectReadById?.ShipAddr),
            },
            parentCustomer: {
              id: parentId,
              found: !!parentCustomer,
              displayName: parentCustomer?.DisplayName || null,
              billAddr: summarizeAddress(parentCustomer?.BillAddr),
              shipAddr: summarizeAddress(parentCustomer?.ShipAddr),
            },
            latestTransactions: {
              estimate: latestEstimate
                ? {
                    id: latestEstimate?.Id || null,
                    txnDate: latestEstimate?.TxnDate || null,
                    billAddr: summarizeAddress(latestEstimate?.BillAddr),
                    shipAddr: summarizeAddress(latestEstimate?.ShipAddr),
                  }
                : null,
              invoice: latestInvoice
                ? {
                    id: latestInvoice?.Id || null,
                    txnDate: latestInvoice?.TxnDate || null,
                    billAddr: summarizeAddress(latestInvoice?.BillAddr),
                    shipAddr: summarizeAddress(latestInvoice?.ShipAddr),
                  }
                : null,
              salesReceipt: latestSalesReceipt
                ? {
                    id: latestSalesReceipt?.Id || null,
                    txnDate: latestSalesReceipt?.TxnDate || null,
                    billAddr: summarizeAddress(latestSalesReceipt?.BillAddr),
                    shipAddr: summarizeAddress(latestSalesReceipt?.ShipAddr),
                  }
                : null,
              payment: latestPayment
                ? {
                    id: latestPayment?.Id || null,
                    txnDate: latestPayment?.TxnDate || null,
                  }
                : null,
            },
            resolvedLocation,
          };
        })
      );

      const projectsWithDiagnostics = enrichedProjects.map((project, index) => ({
        ...project,
        restAddressDiagnostics: restAddressDiagnostics[index],
      }));

      return res.status(200).json({
        ok: true,
        message: `Found ${projects.length} QuickBooks project(s) with IsProject=true and loaded their available QuickBooks details.`,
        companyId,
        userId,
        connectedRealmId: account.realmId,
        connectedCompanyName: account.companyName || null,
        queryMode: "rest-customer-isproject-count",
        query,
        minorversion,
        totalCustomersReturned: customers.length,
        totalProjects: projects.length,
        projectIds: projects.map((project: any) => String(project?.Id || "")),
        projectNames: projects.map((project: any) => String(project?.DisplayName || "")),
        relatedEntities: PROJECT_RELATED_ENTITIES,
        projects: projectsWithDiagnostics,
      });
    } catch (error: any) {
      console.error("QuickBooks Projects debug count error:", error?.response?.data || error);
      return res.status(error?.response?.status || 500).json({
        error: "Failed to count QuickBooks projects",
        details:
          error?.response?.data ||
          error?.message ||
          "Unknown error",
        queryMode: "rest-customer-isproject-count",
      });
    }
  }

  async importProjectsToSmartBuild(req: Request, res: Response) {
    const { companyId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    try {
      const { api, minorversion, projects } = await fetchQuickBooksProjectShells(userId, companyId);
      const results: Array<Record<string, any>> = [];

      for (const qboProject of projects) {
        const result = await importQuickBooksProjectToSmartBuild({
          api,
          minorversion,
          companyId,
          userId,
          qboProject,
        });

        results.push(result);
      }

      const createdCount = results.filter((result) => result.action === "created").length;
      const updatedCount = results.filter((result) => result.action === "updated").length;

      return res.status(200).json({
        ok: true,
        message: `Imported ${results.length} QuickBooks project(s) into SmartBuild.`,
        count: results.length,
        createdCount,
        updatedCount,
        results,
      });
    } catch (error: any) {
      console.error("QuickBooks Projects import error:", error?.response?.data || error);
      return res.status(error?.response?.status || 500).json({
        error: "Failed to import QuickBooks projects into SmartBuild",
        details: error?.response?.data || error?.message || "Unknown error",
      });
    }
  }

  async syncProjectsQboToSmartBuild(req: Request, res: Response) {
    return this.importProjectsToSmartBuild(req, res);
  }

  async listProjectsGraphql(req: Request, res: Response) {
    const { companyId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    try {
      const { account } = await getQbClientWithAccountOrThrow(userId, companyId);

      const graphQlEndpoint =
        process.env.QUICKBOOKS_ENVIRONMENT === "production"
          ? "https://qb.api.intuit.com/graphql"
          : "https://qb-sandbox.api.intuit.com/graphql";

      const query = `
        query projectManagementProjects(
          $first: PositiveInt!,
          $after: String,
          $filter: ProjectManagement_ProjectFilter!,
          $orderBy: [ProjectManagement_OrderBy!]
        ) {
          projectManagementProjects(
            first: $first,
            after: $after,
            filter: $filter,
            orderBy: $orderBy
          ) {
            edges {
              node {
                id
                name
                description
                type
                status
                dueDate
                startDate
                completedDate
                assignee {
                  id
                }
                priority
                customer {
                  id
                }
                account {
                  id
                }
                addresses {
                  streetAddressLine1
                  streetAddressLine2
                  streetAddressLine3
                  state
                  postalCode
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }
      `;

      const variables = {
        first: 50,
        after: null,
        filter: {
          dueDate: {
            between: {
              minDate: "2020-01-01T00:00:00.000Z",
              maxDate: "2035-12-31T00:00:00.000Z",
            },
          },
        },
        orderBy: ["DUE_DATE_DESC"],
      };

      const response = await axios.post(
        graphQlEndpoint,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const graphQlErrors = response.data?.errors;
      const connection = response.data?.data?.projectManagementProjects;

      if (Array.isArray(graphQlErrors) && graphQlErrors.length > 0) {
        return res.status(502).json({
          error: "QuickBooks Projects GraphQL query failed",
          details: graphQlErrors,
          queryMode: "graphql-projectmanagementprojects",
          endpoint: graphQlEndpoint,
        });
      }

      const projects = Array.isArray(connection?.edges)
        ? connection.edges.map((edge: any) => edge?.node).filter(Boolean)
        : [];

      return res.status(200).json({
        ok: true,
        message: `Fetched ${projects.length} QuickBooks project(s) via GraphQL.`,
        count: projects.length,
        projects,
        pageInfo: connection?.pageInfo ?? null,
        queryMode: "graphql-projectmanagementprojects",
        endpoint: graphQlEndpoint,
      });
    } catch (error: any) {
      console.error("QuickBooks Projects GraphQL list error:", error?.response?.data || error);

      return res.status(error?.response?.status || 500).json({
        error: "Failed to list QuickBooks projects via GraphQL",
        details:
          error?.response?.data?.errors ||
          error?.response?.data ||
          error?.message ||
          "Unknown error",
        queryMode: "graphql-projectmanagementprojects",
      });
    }
  }
}
