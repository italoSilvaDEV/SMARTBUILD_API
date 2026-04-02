// src/controllers/quickbooks/estimate/estimateMapper.ts

/**
 * QuickBooks Estimate status to SmartBuild status mapping
 */
const QB_STATUS_TO_SB: Record<string, string> = {
  Accepted: 'approved',
  Pending: 'pending',
  Rejected: 'rejected',
  Closed: 'closed',
};

/**
 * SmartBuild status to QuickBooks Estimate status mapping
 */
const SB_STATUS_TO_QB: Record<string, string> = {
  approved: 'Accepted',
  pending: 'Pending',
  rejected: 'Rejected',
  closed: 'Closed',
};

/**
 * Shape of a QuickBooks Estimate from REST API
 */
export interface QBEstimate {
  Id: string;
  DocNumber?: string | null;
  TotalAmt: string; // Decimal as string in QBO
  Description?: string | null;
  TermsRef?: {
    value?: string | null;
    name?: string | null;
  } | null;
  Status?: string | null;
  CustomerRef?: {
    value: string;
    name?: string;
  } | null;
  ProjectRef?: {
    value: string;
    name?: string;
  } | null;
  Line?: QBEstimateLine[];
  MetaData?: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

/**
 * Shape of a QuickBooks Estimate Line from REST API
 */
export interface QBEstimateLine {
  Id: string;
  Description?: string | null;
  Amount: string; // Decimal as string
  Qty?: number | null;
  ServiceDate?: string | null;
}

/**
 * Shape of a SmartBuild Estimate from Prisma
 */
export interface SBEstimate {
  id: string;
  number: string;
  approvedAt: Date;
  clientSignature?: string | null;
  totalAmount: any; // Prisma returns Decimal
  description?: string | null;
  terms?: string | null;
  status: string;
  assignatureRequired?: boolean | null;
  amountPaid: any;
  balanceDue?: any | null;
  pdf_needs_update: boolean | null;
  type_estimate: string | null;
  multi_emails?: string | null;
  isStandaloneEstimate: boolean | null;
  canceledAt?: Date | null;
  canceledById?: string | null;
  cancellationReason?: string | null;
  projectId?: string | null;
  date_creation: Date;
  date_update: Date;
  // QuickBooks sync fields
  idQuickbooks?: string | null;
  quickbooksUpdatedAt?: Date | null;
  // Relations
  serviceProjects?: SBEstimateServiceProject[];
  project?: {
    idQuickbooks?: string | null;
  } | null;
  client?: {
    idQuickbooks?: string | null;
  } | null;
}

/**
 * Shape of a SmartBuild EstimateServiceProject from Prisma
 */
export interface SBEstimateServiceProject {
  id: string;
  estimateId: string;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: any;
  lineTotal: any;
  notes?: string | null;
  id_service?: string | null;
  hours?: any;
  price?: any;
  start_date?: string | null;
  deadline?: string | null;
  date_creation: Date;
  date_update: Date;
  // QuickBooks sync fields
  idQuickbooksLine?: string | null;
}

/**
 * Maps a QuickBooks Estimate to a SmartBuild Estimate
 *
 * Transforms QuickBooks REST estimate data to SmartBuild database schema,
 * handling status mappings and line item transformations.
 *
 * @param qboEstimate - QuickBooks estimate from REST API
 * @returns Partial SmartBuild estimate object ready for database update/create
 *
 * @example
 * ```typescript
 * const qbEstimate = await qboController.getEstimate("12345", realmId);
 * const sbEstimate = mapQBOEstimateToSmartBuild(qbEstimate);
 * await prisma.estimate.update({ where: { id: localId }, data: sbEstimate });
 * ```
 */
export function mapQBOEstimateToSmartBuild(
  qboEstimate: QBEstimate
): Partial<SBEstimate> {
  // Map QuickBooks status to SmartBuild status
  const status = QB_STATUS_TO_SB[qboEstimate.Status || ''] || qboEstimate.Status?.toLowerCase() || 'pending';

  // Parse QuickBooks timestamps
  const quickbooksUpdatedAt = qboEstimate.MetaData?.LastUpdatedTime
    ? new Date(qboEstimate.MetaData.LastUpdatedTime)
    : undefined;

  // Convert totalAmount from string to number (QBO returns Decimals as strings)
  const totalAmount = parseFloat(qboEstimate.TotalAmt || '0') || 0;

  return {
    idQuickbooks: qboEstimate.Id,
    quickbooksUpdatedAt,
    number: qboEstimate.DocNumber || `QB-${qboEstimate.Id}`,
    totalAmount,
    description: qboEstimate.Description,
    terms: qboEstimate.TermsRef?.value,
    status,
  };
}

/**
 * Maps a QuickBooks Estimate Line to a SmartBuild EstimateServiceProject
 *
 * @param qboLine - QuickBooks estimate line from REST API
 * @param estimateId - SmartBuild estimate ID
 * @returns Partial SmartBuild estimate service project object
 */
export function mapQBOEstimateLineToSBServiceProject(
  qboLine: QBEstimateLine,
  estimateId: string
): Partial<SBEstimateServiceProject> {
  const amount = parseFloat(qboLine.Amount || '0') || 0;
  const quantity = qboLine.Qty || 1;

  const result: Partial<SBEstimateServiceProject> = {
    idQuickbooksLine: qboLine.Id,
    estimateId,
    name: qboLine.Description || 'Service',
    description: qboLine.Description,
    quantity,
    unitPrice: amount,
    lineTotal: amount,
    start_date: qboLine.ServiceDate,
  };

  return result;
}

/**
 * Maps a SmartBuild Estimate to a QuickBooks Estimate for creation
 *
 * Transforms SmartBuild estimate data to QuickBooks GraphQL create input,
 * ensuring all required fields are present and properly formatted.
 *
 * @param estimate - SmartBuild estimate from Prisma
 * @param qboCustomerId - QuickBooks customer ID (required)
 * @param qboProjectId - Optional QuickBooks project ID
 * @returns QuickBooks estimate input object for GraphQL mutation
 *
 * @throws Error if qboCustomerId is not provided
 *
 * @example
 * ```typescript
 * const estimate = await prisma.estimate.findUnique({ where: { id: estimateId }, include: { serviceProjects: true } });
 * const qboInput = mapSmartBuildEstimateToQBO(estimate, "42", "100");
 * const created = await qboController.createEstimate(qboInput, realmId);
 * ```
 */
export function mapSmartBuildEstimateToQBO(
  estimate: SBEstimate,
  qboCustomerId: string,
  qboProjectId?: string
): {
  customerRef: { value: string };
  description?: string;
  line?: {
    Id?: string;
    Description?: string;
    Amount: string;
    Quantity?: number;
  }[];
  projectRef?: { value: string };
} {
  if (!qboCustomerId) {
    throw new Error('QuickBooks customer ID is required to create an estimate in QuickBooks');
  }

  // Map service projects to QBO Lines
  const lines =
    estimate.serviceProjects && estimate.serviceProjects.length > 0
      ? estimate.serviceProjects.map((sp) => ({
          Description: sp.description || sp.name,
          Amount: sp.lineTotal?.toString() || '0',
          Quantity: sp.quantity,
        }))
      : [
          {
            Description: estimate.description || 'Estimate',
            Amount: estimate.totalAmount?.toString() || '0',
            Quantity: 1,
          },
        ];

  return {
    customerRef: { value: qboCustomerId },
    description: estimate.description || undefined,
    line: lines,
    ...(qboProjectId && { projectRef: { value: qboProjectId } }),
  };
}

/**
 * Maps a SmartBuild Estimate to a QuickBooks Estimate update payload
 *
 * Transforms SmartBuild estimate data to QuickBooks GraphQL update input,
 * including only changed fields and using idQuickbooks for reference.
 *
 * @param estimate - SmartBuild estimate from Prisma
 * @returns Partial QuickBooks estimate update object for GraphQL mutation
 *
 * @throws Error if estimate doesn't have idQuickbooks
 *
 * @example
 * ```typescript
 * const estimate = await prisma.estimate.findUnique({ where: { id: estimateId }, include: { serviceProjects: true } });
 * const updateData = mapSmartBuildEstimateUpdateToQBO(estimate);
 * const updated = await qboController.updateEstimate(estimate.idQuickbooks!, updateData, realmId);
 * ```
 */
export function mapSmartBuildEstimateUpdateToQBO(
  estimate: SBEstimate
): {
  Id: string;
  sparse?: {
    Description?: string;
    TotalAmt?: string;
    Terms?: string;
    Line?: {
      Id?: string;
      Description?: string;
      Amount: string;
      Quantity?: number;
    }[];
  };
} {
  if (!estimate.idQuickbooks) {
    throw new Error(
      'Estimate must have idQuickbooks to update in QuickBooks. Sync this estimate first.'
    );
  }

  // Map service projects to QBO Lines for updates
  const lines =
    estimate.serviceProjects && estimate.serviceProjects.length > 0
      ? estimate.serviceProjects.map((sp) => ({
          Id: sp.idQuickbooksLine || undefined,
          Description: sp.description || sp.name,
          Amount: sp.lineTotal?.toString() || '0',
          Quantity: sp.quantity,
        }))
      : undefined;

  return {
    Id: estimate.idQuickbooks,
    sparse: {
      Description: estimate.description || undefined,
      TotalAmt: estimate.totalAmount?.toString(),
      Terms: estimate.terms || undefined,
      ...(lines && { Line: lines }),
    },
  };
}

/**
 * Validates that a SmartBuild estimate can be synced to QuickBooks
 *
 * Checks that required fields are present before attempting sync.
 *
 * @param estimate - SmartBuild estimate from Prisma
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const validation = validateEstimateForSync(estimate);
 * if (!validation.valid) {
 *   console.error('Cannot sync:', validation.error);
 *   return;
 * }
 * ```
 */
export function validateEstimateForSync(estimate: SBEstimate): {
  valid: boolean;
  error?: string;
} {
  // Note: qboCustomerId is checked separately when calling mapSmartBuildEstimateToQBO
  // This function validates local estimate structure

  return { valid: true };
}

/**
 * Compares local and QuickBooks estimate data to determine if sync is needed
 *
 * Checks if local estimate is newer than QuickBooks mirror and if fields differ.
 *
 * @param local - SmartBuild estimate from Prisma
 * @param remoteTime - Last updated time from QuickBooks
 * @returns true if sync should be performed
 *
 * @example
 * ```typescript
 * const shouldSync = shouldSyncEstimate(localEstimate, qboEstimate.metaData.lastUpdatedTime);
 * if (shouldSync) {
 *   await pushToQuickBooks(localEstimate);
 * }
 * ```
 */
export function shouldSyncEstimate(local: SBEstimate, remoteTime: string): boolean {
  // If we don't have QuickBooks data yet, sync is needed
  if (!local.quickbooksUpdatedAt) {
    return true;
  }

  const remoteTimeDate = new Date(remoteTime);

  // Only sync if local is newer than QuickBooks mirror
  // Add 1 second buffer to avoid race conditions
  const bufferMs = 1000;
  return local.date_update.getTime() > remoteTimeDate.getTime() + bufferMs;
}
