import { RequestHandler, Request } from 'express';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';

export type ResourceKind = 'company' | 'project' | 'estimate' | 'estimateService' | 'invoice' | 'invoiceItem' | 'pdf' | 'serviceProject' | 'client' | 'changeOrder' | 'changeOrderService';
export type ResourceRef = { kind: ResourceKind; path: string; optional?: boolean };
export const ref = (kind: ResourceKind, path: string, optional = false): ResourceRef => ({ kind, path, optional });
function valueAt(req: Request, path: string): unknown {
  return path.split('.').reduce<any>((value, key) => {
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try { value = JSON.parse(value); } catch { return undefined; }
    }
    return value?.[key];
  }, req);
}
async function companyFor(kind: ResourceKind, id: string): Promise<string | null> {
  if (kind === 'company') return id;
  if (kind === 'project') return (await prisma.project.findUnique({ where: { id }, select: { company_id: true } }))?.company_id ?? null;
  if (kind === 'client') return (await prisma.client.findUnique({ where: { id }, select: { company_id: true } }))?.company_id ?? null;
  if (kind === 'estimate') return (await prisma.estimate.findUnique({ where: { id }, select: { project: { select: { company_id: true } } } }))?.project.company_id ?? null;
  if (kind === 'estimateService') {
    const row = await prisma.estimateServiceProject.findUnique({ where: { id }, select: { estimateId: true } });
    return row ? companyFor('estimate', row.estimateId) : null;
  }
  if (kind === 'invoice') {
    const row = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true, project: { select: { company_id: true } } } });
    if (!row || row.companyId && row.project?.company_id && row.companyId !== row.project.company_id) return null;
    return row.companyId ?? row.project?.company_id ?? null;
  }
  if (kind === 'invoiceItem') {
    const row = await prisma.invoiceItem.findUnique({ where: { id }, select: { invoiceId: true } });
    return row ? companyFor('invoice', row.invoiceId) : null;
  }
  if (kind === 'serviceProject') {
    const row = await prisma.serviceProject.findUnique({ where: { id }, select: { projectId: true } });
    return row?.projectId ? companyFor('project', row.projectId) : null;
  }
  if (kind === 'changeOrderService') {
    const row = await prisma.changeOrderService.findUnique({ where: { id }, select: { changeOrderId: true } });
    return row ? companyFor('changeOrder', row.changeOrderId) : null;
  }
  if (kind === 'changeOrder') {
    const order = await prisma.changeOrder.findUnique({ where: { id }, select: { estimateId: true } });
    return order?.estimateId ? companyFor('estimate', order.estimateId) : null;
  }
  const row = await prisma.pdfProject.findUnique({ where: { id }, select: { project_id: true, estimate_id: true, invoice_id: true, changeOrderId: true, uploadedById: true } });
  if (!row) return null;
  const companies = await Promise.all([
    row.project_id ? companyFor('project', row.project_id) : null,
    row.estimate_id ? companyFor('estimate', row.estimate_id) : null,
    row.invoice_id ? companyFor('invoice', row.invoice_id) : null,
    row.changeOrderId ? companyFor('changeOrder', row.changeOrderId) : null,
  ]);
  const ids = companies.filter((value): value is string => value !== null);
  if (!ids.length && row.uploadedById && !row.project_id && !row.estimate_id && !row.invoice_id && !row.changeOrderId) return 'pending-upload:' + row.uploadedById;
  return ids.length && new Set(ids).size === 1 ? ids[0] : null;
}

// Installed clients address these invoices by number, which repeats across companies.
// Run after the company was authorized; the controller reads exactly the invoice bound here.
export function bindInvoiceByNumber(source: 'body' | 'query', invoiceTypes?: string[]): RequestHandler {
  return async (req, res, next) => {
    try {
      const invoice = await prisma.invoice.findFirst({
        where: { externalInvoiceId: req.params.invoiceId, companyId: String(req[source].companyId),
          ...(invoiceTypes ? { invoiceType: { in: invoiceTypes as any } } : {}) },
        select: { id: true },
      });
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      (req as any).authorizedInvoiceId = invoice.id;
      return next();
    } catch {
      return res.status(503).json({ error: 'Unable to verify resource access' });
    }
  };
}

// Run after the invoice was authorized. A missing id stays with the controller's existing 400.
export const requirePaidReceiptOfInvoice: RequestHandler = async (req, res, next) => {
  const { pdfInvoicePaidId, invoiceId } = req.body ?? {};
  if (!pdfInvoicePaidId) return next();
  try {
    const receipt = typeof pdfInvoicePaidId === 'string'
      ? await prisma.pdfInvoicePaid.findUnique({ where: { id: pdfInvoicePaidId }, select: { invoiceId: true } }) : null;
    if (!receipt || receipt.invoiceId !== invoiceId) return res.status(403).json({ error: 'Resource access denied' });
    return next();
  } catch {
    return res.status(503).json({ error: 'Unable to verify resource access' });
  }
};

// Explicit per-route references avoid guessing what an ambiguous :id represents.
// Multipart callers must run this AFTER parsing, BEFORE business writes/provider calls.
// A feature list is only for reads a client screen gated by one of those permissions depends on.
export function requireCompanyResourceAccess(feature: string | readonly string[], refs: ResourceRef[], allowPublicEstimate = false): RequestHandler {
  const features = typeof feature === 'string' ? [feature] : feature;
  return async (req, res, next) => {
    if (allowPublicEstimate && (req as any).publicEstimateAccess === true) return next();
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    try {
      const companies: string[] = [];
      for (const resource of refs) {
        const id = valueAt(req, resource.path);
        if (resource.optional && (id === undefined || id === null || id === '')) continue;
        if (typeof id !== 'string' || !id.trim()) return res.status(400).json({ error: 'Invalid resource identifier' });
        const company = await companyFor(resource.kind, id);
        if (!company) return res.status(403).json({ error: 'Resource access denied' });
        if (company.startsWith('pending-upload:')) {
          if (company !== 'pending-upload:' + userId) return res.status(403).json({ error: 'Pending upload belongs to another user' });
          continue;
        }
        companies.push(company);
      }
      if (!companies.length) return res.status(400).json({ error: 'Company resource required' });
      // Do not trust a second company selector even when the actor belongs to both companies.
      for (const path of ['body.companyId', 'body.company_id', 'query.companyId', 'query.company_id']) {
        const value = valueAt(req, path);
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value !== 'string') return res.status(400).json({ error: 'Invalid company identifier' });
          companies.push(value);
        }
      }
      if (new Set(companies).size !== 1) return res.status(403).json({ error: 'Resource access denied' });
      for (const candidate of features) if (await canUseCompanyFeature(userId, companies[0], candidate)) return next();
      return res.status(403).json({ error: 'Resource access denied' });
    } catch {
      return res.status(503).json({ error: 'Unable to verify resource access' });
    }
  };
}
