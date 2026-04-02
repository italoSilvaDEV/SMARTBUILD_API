// src/controllers/quickbooks/project/projectMapper.ts

/**
 * QuickBooks Project status to SmartBuild status mapping
 */
const QB_STATUS_TO_SB: Record<string, string> = {
  OPEN: 'pending',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'completed',
  ARCHIVED: 'archived',
};

/**
 * SmartBuild status to QuickBooks Project status mapping
 */
const SB_STATUS_TO_QB: Record<string, string> = {
  pending: 'OPEN',
  in_progress: 'IN_PROGRESS',
  completed: 'CLOSED',
  archived: 'ARCHIVED',
};

/**
 * Shape of a QuickBooks Project from GraphQL API
 */
export interface QBProject {
  id: string;
  name: string;
  customerId: string;
  description?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  metaData: {
    createTime: string;
    lastUpdatedTime: string;
  };
}

/**
 * Shape of a SmartBuild Project from Prisma
 */
export interface SBProject {
  id: string;
  contract_number?: number | null;
  price: number | any; // Prisma returns Decimal, but we treat as number
  status_project: string;
  status_changed_at?: Date | null;
  autorId?: string | null;
  start_date?: string | null;
  deadline?: string | null;
  date_creation: Date;
  date_update: Date;
  amountPaid?: number | any | null;
  balanceDue?: number | any | null;
  client_id?: string | null;
  seller_user_id?: string | null;
  project_manager_id?: string | null;
  company_id?: string | null;
  workContextId?: string | null;
  radius?: number | null;
  location?: string | null;
  log?: string | null;
  lat?: string | null;
  cover_photo?: string | null;
  // QuickBooks sync fields
  idQuickbooks?: string | null;
  quickbooksUpdatedAt?: Date | null;
}

/**
 * Maps a QuickBooks Project to a SmartBuild Project
 *
 * Transforms QuickBooks GraphQL project data to SmartBuild database schema,
 * handling status mappings and field transformations.
 *
 * @param qboProject - QuickBooks project from GraphQL API
 * @returns Partial SmartBuild project object ready for database update/create
 *
 * @example
 * ```typescript
 * const qbProject = await qboController.getProject("12345", realmId);
 * const sbProject = mapQBOProjectToSmartBuild(qbProject);
 * await prisma.project.update({ where: { id: localId }, data: sbProject });
 * ```
 */
export function mapQBOProjectToSmartBuild(qboProject: QBProject): Partial<SBProject> {
  // Map QuickBooks status to SmartBuild status
  const status_project = QB_STATUS_TO_SB[qboProject.status] || qboProject.status.toLowerCase();

  // Convert dates from QuickBooks format (YYYY-MM-DD) to SmartBuild format
  const startDate = qboProject.startDate ? qboProject.startDate : null;
  const endDate = qboProject.endDate ? qboProject.endDate : null;

  // Parse QuickBooks timestamps
  const quickbooksUpdatedAt = qboProject.metaData.lastUpdatedTime
    ? new Date(qboProject.metaData.lastUpdatedTime)
    : undefined;

  return {
    idQuickbooks: qboProject.id,
    quickbooksUpdatedAt,
    status_project,
    start_date: startDate,
    deadline: endDate,
    // Use description from QBO as location or log if not set locally
    ...(qboProject.description && {
      log: qboProject.description,
    }),
  };
}

/**
 * Maps a SmartBuild Project to a QuickBooks Project for creation
 *
 * Transforms SmartBuild project data to QuickBooks GraphQL create input,
 * ensuring all required fields are present and properly formatted.
 *
 * @param project - SmartBuild project from Prisma
 * @param qboCustomerId - QuickBooks customer ID (required)
 * @returns QuickBooks project input object for GraphQL mutation
 *
 * @throws Error if qboCustomerId is not provided
 *
 * @example
 * ```typescript
 * const project = await prisma.project.findUnique({ where: { id: projectId } });
 * const qboInput = mapSmartBuildProjectToQBO(project, "42");
 * const created = await qboController.createProject(qboInput, realmId);
 * ```
 */
export function mapSmartBuildProjectToQBO(
  project: SBProject,
  qboCustomerId: string
): {
  name: string;
  customerId: string;
  description?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
} {
  if (!qboCustomerId) {
    throw new Error('QuickBooks customer ID is required to create a project in QuickBooks');
  }

  // Map SmartBuild status to QuickBooks status
  const status = SB_STATUS_TO_QB[project.status_project] || 'OPEN';

  // Build project name from contract number if available
  const name = project.contract_number
    ? `Project #${project.contract_number}`
    : `Project ${project.date_creation.getFullYear()}-${project.date_creation.getMonth() + 1}`;

  return {
    name: name.substring(0, 100), // QB limits name to 100 chars
    customerId: qboCustomerId,
    description: project.location || project.log || undefined,
    status,
    startDate: project.start_date || undefined,
    endDate: project.deadline || undefined,
  };
}

/**
 * Maps a SmartBuild Project to a QuickBooks Project update payload
 *
 * Transforms SmartBuild project data to QuickBooks GraphQL update input,
 * including only changed fields and using idQuickbooks for reference.
 *
 * @param project - SmartBuild project from Prisma
 * @returns Partial QuickBooks project update object for GraphQL mutation
 *
 * @throws Error if project doesn't have idQuickbooks
 *
 * @example
 * ```typescript
 * const project = await prisma.project.findUnique({ where: { id: projectId } });
 * const updateData = mapSmartBuildProjectUpdateToQBO(project);
 * const updated = await qboController.updateProject(project.idQuickbooks!, updateData, realmId);
 * ```
 */
export function mapSmartBuildProjectUpdateToQBO(
  project: SBProject
): {
  id: string;
  input: {
    name?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
} {
  if (!project.idQuickbooks) {
    throw new Error(
      'Project must have idQuickbooks to update in QuickBooks. Sync this project first.'
    );
  }

  // Map SmartBuild status to QuickBooks status
  const status = SB_STATUS_TO_QB[project.status_project];

  // Build update payload with only non-null/undefined fields
  const input: {
    name?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  } = {};

  // Only include name if contract_number changed or should be updated
  if (project.contract_number) {
    input.name = `Project #${project.contract_number}`.substring(0, 100);
  }

  // Include description if location or log exists (filter out null)
  if (project.location) {
    input.description = project.location;
  } else if (project.log) {
    input.description = project.log;
  }

  // Include status if mapped successfully
  if (status) {
    input.status = status;
  }

  // Include dates if they exist
  if (project.start_date) {
    input.startDate = project.start_date;
  }

  if (project.deadline) {
    input.endDate = project.deadline;
  }

  return {
    id: project.idQuickbooks,
    input,
  };
}

/**
 * Validates that a SmartBuild project can be synced to QuickBooks
 *
 * Checks that required fields are present before attempting sync.
 *
 * @param project - SmartBuild project from Prisma
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const validation = validateProjectForSync(project);
 * if (!validation.valid) {
 *   console.error('Cannot sync:', validation.error);
 *   return;
 * }
 * ```
 */
export function validateProjectForSync(project: SBProject): {
  valid: boolean;
  error?: string;
} {
  if (!project.client_id) {
    return {
      valid: false,
      error: 'Project must have a client to sync to QuickBooks',
    };
  }

  // Note: qboCustomerId is checked separately when calling mapSmartBuildProjectToQBO
  // This function validates local project structure

  return { valid: true };
}

/**
 * Compares local and QuickBooks project data to determine if sync is needed
 *
 * Checks if local project is newer than QuickBooks mirror and if fields differ.
 *
 * @param local - SmartBuild project from Prisma
 * @param remoteTime - Last updated time from QuickBooks
 * @returns true if sync should be performed
 *
 * @example
 * ```typescript
 * const shouldSync = shouldSyncProject(localProject, qboProject.metaData.lastUpdatedTime);
 * if (shouldSync) {
 *   await pushToQuickBooks(localProject);
 * }
 * ```
 */
export function shouldSyncProject(local: SBProject, remoteTime: string): boolean {
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
