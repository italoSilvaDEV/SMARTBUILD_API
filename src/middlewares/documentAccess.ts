import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';
import { requireCompanyResourceAccess, ref, ResourceRef } from './companyResourceAccess';
const featureFor = (type: unknown) => type === 'invoice' ? 'Invoice' : type === 'estimate' || type === 'changeorder' ? 'Estimates' : 'Projects';
const uploadRefs = [ref('project', 'body.project_id', true), ref('estimate', 'body.estimate_id', true), ref('invoice', 'body.invoice_id', true), ref('changeOrder', 'body.change_order_id', true)];
export const requireDocumentUpload: RequestHandler = async (req, res, next) => {
  const actorId = (req as any).userId;
  if (!actorId) return res.status(401).json({ error: 'Authentication required' });
  const feature = featureFor(req.body?.type_pdf);
  if (['project_id','estimate_id','invoice_id','change_order_id'].some(key => req.body?.[key])) {
    const features = new Set([feature]);
    if (req.body?.invoice_id) features.add('Invoice');
    if (req.body?.estimate_id || req.body?.change_order_id) features.add('Estimates');
    for (const required of features) {
      let allowed = false;
      await requireCompanyResourceAccess(required, uploadRefs)(req, res, () => { allowed = true; });
      if (!allowed) return;
    }
    return next();
  }
  try {
    // Existing web flow uploads before linking. Authorize upload now, target company at binding.
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { company_id: true, companies: { select: { companyId: true } } } });
    if (!actor) return res.status(403).json({ error: 'Upload access denied' });
    const ids = [...new Set([actor.company_id, ...actor.companies.map(link => link.companyId)].filter((id): id is string => Boolean(id)))];
    for (const id of ids) if (await canUseCompanyFeature(actorId, id, feature)) return next();
    return res.status(403).json({ error: 'Upload access denied' });
  } catch { return res.status(503).json({ error: 'Unable to verify upload access' }); }
};
export function requireDocumentMutation(refs: ResourceRef[]): RequestHandler {
  return async (req, res, next) => {
    if (!(req as any).userId) return res.status(401).json({ error: 'Authentication required' });
    try {
      const pdfId = req.params.id ?? req.body?.pdfId;
      const pdf = typeof pdfId === 'string' ? await prisma.pdfProject.findUnique({ where: { id: pdfId }, select: { type_pdf: true } }) : null;
      if (!pdf) return res.status(403).json({ error: 'Document access denied' });
      const features = new Set([featureFor(pdf.type_pdf)]);
      if (req.body?.invoiceId) features.add('Invoice');
      if (req.body?.estimateId) features.add('Estimates');
      for (const feature of features) {
        let allowed = false;
        await requireCompanyResourceAccess(feature, refs)(req, res, () => { allowed = true; });
        if (!allowed) return;
      }
      return next();
    } catch { return res.status(503).json({ error: 'Unable to verify document access' }); }
  };
}

// Lookup uses the linked document module, never a client-selected document type.
export const requireDocumentLookup: RequestHandler = async (req, res, next) => {
  const features = new Set<string>();
  if (req.body?.invoice_id) features.add('Invoice');
  if (req.body?.estimate_id || req.body?.change_order_id) features.add('Estimates');
  if (!features.size) features.add('Projects');
  for (const feature of features) {
    let allowed = false;
    await requireCompanyResourceAccess(feature, uploadRefs)(req, res, () => { allowed = true; });
    if (!allowed) return;
  }
  return next();
};
