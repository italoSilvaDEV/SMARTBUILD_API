import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma';
import { canAccessCompanySubscription, canUseCompanyFeature } from '../services/CompanyFeatureAccess';

type WorkKind = 'project' | 'service' | 'costInvoice' | 'cost' | 'activity' | 'gallery';
type WorkRef = { kind: WorkKind; field: string; optional?: boolean };
// A receipt just uploaded by this actor has no project yet; the service in the same request decides.
const OWN_UNLINKED_RECEIPT = '';
async function projectFor(kind: WorkKind, id: string, actorId: string, type?: string): Promise<string | null> {
  if (kind === 'project') return id;
  if (kind === 'service') return (await prisma.serviceProject.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (kind === 'costInvoice') {
    const invoice = await prisma.invoiceCostProject.findUnique({ where: { id }, select: { project_id: true, autorId: true,
      costProject: { where: { serviceProjectId: { not: null } }, select: { serviceProjectId: true }, take: 1 } } });
    if (!invoice) return null;
    if (invoice.project_id) return invoice.project_id;
    const serviceId = invoice.costProject?.[0]?.serviceProjectId;
    if (serviceId) return projectFor('service', serviceId, actorId);
    return invoice.autorId === actorId ? OWN_UNLINKED_RECEIPT : null;
  }
  if (kind === 'cost') {
    const row = await prisma.costProject.findUnique({ where: { id }, select: { invoice_cost_project_id: true, serviceProjectId: true } });
    const fromInvoice = row?.invoice_cost_project_id ? await projectFor('costInvoice', row.invoice_cost_project_id, actorId) : null;
    return fromInvoice || (row?.serviceProjectId ? projectFor('service', row.serviceProjectId, actorId) : null);
  }
  if (kind === 'activity') {
    const row = await prisma.activities.findUnique({ where: { id }, select: { serviceProjectId: true, externalProjectId: true } });
    return row?.externalProjectId ?? (row?.serviceProjectId ? projectFor('service', row.serviceProjectId, actorId) : null);
  }
  const row = type === 'before' ? await prisma.galleryBefore.findUnique({ where: { id }, select: { serviceProjectId: true } })
    : type === 'after' ? await prisma.galleryAfter.findUnique({ where: { id }, select: { serviceProjectId: true } }) : null;
  return row?.serviceProjectId ? projectFor('service', row.serviceProjectId, actorId) : null;
}
// A Crew assignment permits work on that project, never administrative access to all projects.
// Validate the entire batch before the controller can write its first item.
export function requireProjectWorkAccess(refs: WorkRef[], source: 'body' | 'params' = 'body', batch = false): RequestHandler {
  return async (req, res, next) => {
    const actorId = (req as any).userId;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    try {
      const rows = batch && Array.isArray(req.body) ? req.body : [req[source]];
      if (!rows.length) return res.status(400).json({ error: 'Work resource required' });
      for (const row of rows) {
        const projectIds: string[] = [];
        for (const ref of refs) {
          const id = row?.[ref.field];
          if (ref.optional && !id) continue;
          if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Invalid work resource' });
          const projectId = await projectFor(ref.kind, id, actorId, req.body?.type);
          if (projectId === OWN_UNLINKED_RECEIPT) continue;
          if (!projectId) return res.status(403).json({ error: 'Work access denied' });
          projectIds.push(projectId);
        }
        if (!projectIds.length || new Set(projectIds).size !== 1) return res.status(403).json({ error: 'Work access denied' });
        const project = await prisma.project.findUnique({ where: { id: projectIds[0] }, select: { company_id: true } });
        if (!project?.company_id) return res.status(403).json({ error: 'Work access denied' });
        if (await canUseCompanyFeature(actorId, project.company_id, 'Projects')) continue;
        const assignment = await prisma.userServiceProject.findFirst({ where: { user_id: actorId, removed_at: null, OR: [{ service_project: { projectId: projectIds[0] } }, { sub_service_project: { serviceProject: { projectId: projectIds[0] } } }, { custom_service_schedule: { projectId: projectIds[0] } }, { sub_service_project: { custom_service_schedule: { projectId: projectIds[0] } } }] }, select: { id: true } });
        if (!assignment || !await canAccessCompanySubscription(actorId, project.company_id)) return res.status(403).json({ error: 'Work access denied' });
        if ((row.userId && row.userId !== actorId) || (row.authorId && row.authorId !== actorId)) return res.status(403).json({ error: 'Work author must match session' });
      }
      next();
    } catch { return res.status(503).json({ error: 'Unable to verify work access' }); }
  };
}
