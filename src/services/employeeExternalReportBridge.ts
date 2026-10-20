import Jwt from 'jsonwebtoken';
import { SubcontractorAccessError } from '../utils/subcontractorIdentity';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { collaboration, collaborationEnabled } from './SubcontractorCollaborationService';
import { externalServiceError, SubcontractorAccessService } from './SubcontractorAccessService';

export async function withExternalAuthors<T extends { id: string; author: any }>(pending: Promise<T[]>, userId: string | undefined, permittedServiceIds?: ReadonlySet<string>): Promise<(T & { externalLikesCount?: number; externalCommentsCount?: number })[]> {
  const activities = await pending;
  const missing = activities.filter(a => !a.author).map(a => a.id);
  if (!missing.length) return activities;
  const records = await prisma.activities.findMany({ where: { id: { in: missing }, externalAuthorId: { not: null } }, include: {
    externalAuthor: { include: { subcontractorAccount: { select: { name: true } } } },
    externalAccess: { include: { subcontractor: { select: { company_id: true, name: true } } } },
    _count: { select: { externalComments: true, externalLikes: true } },
  } });
  if (!collaborationEnabled()) { const externalIds = new Set(records.map(record => record.id)); return activities.filter(activity => !externalIds.has(activity.id)); }
  const allowed = new Set<string>();
  for (const companyId of new Set(records.map(r => r.externalAccess!.subcontractor.company_id))) {
    if (!companyId) continue;
    try { if (userId) { await collaboration.internalMember(userId, companyId); allowed.add(companyId); } } catch { /* Never expose an external report across companies. */ }
  }
  const byId = new Map(records.map(r => [r.id, r]));
  return activities.filter(a => !byId.has(a.id) || allowed.has(byId.get(a.id)!.externalAccess!.subcontractor.company_id || '') || permittedServiceIds?.has(byId.get(a.id)!.serviceProjectId || '')).map(a => {
    const record = byId.get(a.id);
    if (!record) return a;
    return { ...a, author: { id: record.externalAuthorId!, name: `${record.externalAuthor!.subcontractorAccount!.name} · ${record.externalAccess!.subcontractor.name}`, avatar: null },
      externalLikesCount: record._count.externalLikes, externalCommentsCount: record._count.externalComments };
  });
}

export async function externalCommentsForEmployee(postId: string) {
  if (!collaborationEnabled()) return [];
  const comments = await prisma.feedExternalComment.findMany({ where: { activityId: postId }, include: { participant: { include: { subcontractorAccount: { select: { name: true } } } } } });
  return comments.map(c => ({ id: c.id, text: c.text, date_creation: c.date_creation, date_update: c.date_creation,
    author: { id: c.participantId, name: c.participant.subcontractorAccount!.name, avatar: null } }));
}

export async function guardExternalReportForEmployee(req: Request, res: Response, next: NextFunction) {
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  const photoMatch = /\/feed\/photos\/([^/]+)$/.exec(path);
  const commentMatch = /\/feed\/comments\/([^/]+)$/.exec(path);
  const match = /\/feed\/([^/]+)(?:\/(comments|like|likes))?$/.exec(path);
  if (!photoMatch && !commentMatch && (!match || ['all', 'photos', 'comments'].includes(match[1]))) return next();
  try {
    let postId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    let commentAuthorId: string | undefined;
    const deletingPhoto = Boolean(photoMatch || (req.method === 'DELETE' && req.body?.type === 'photo'));
    if (deletingPhoto) {
      const photo = await prisma.galleryAfter.findUnique({ where: { id: photoMatch ? decodeURIComponent(photoMatch[1]) : postId! }, select: { description: true, title: true } });
      if (photo?.title !== 'FEED_POST' || !photo.description) return next();
      postId = photo.description;
    } else if (commentMatch) {
      const comment = await prisma.feedComment.findUnique({ where: { id: decodeURIComponent(commentMatch[1]) }, select: { activityId: true, authorId: true } });
      if (!comment) return next();
      postId = comment.activityId; commentAuthorId = comment.authorId;
    }
    if (!postId) return next();
    const post = await prisma.activities.findUnique({ where: { id: postId }, select: { externalAuthorId: true, externalAccess: { include: { subcontractor: true } } } });
    if (!post?.externalAuthorId || !post.externalAccess) return next();
    if (!collaborationEnabled()) return res.status(503).json({error:"SUBCONTRACTOR_COLLABORATION_DISABLED"});
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!post.externalAccess.subcontractor.company_id) return res.status(403).json({ error: 'ACCESS_DENIED' });
    await collaboration.internalMember(userId, post.externalAccess.subcontractor.company_id);
    if (commentMatch && commentAuthorId !== userId) return res.status(403).json({ error: 'ACCESS_DENIED' });
    if (!commentMatch && (deletingPhoto || !match?.[2]) && ['PUT', 'DELETE'].includes(req.method)) await new SubcontractorAccessService().authorizeManager(userId, post.externalAccess.subcontractorId);
    if (req.body && (commentMatch || match?.[2])) req.body.userId = userId;
    return next();
  } catch(e) { const failure = externalServiceError(e); return res.status(failure.status).json({ error: failure.code }); }
}

export async function externalLikesForEmployee(postId: string) {
  if (!collaborationEnabled()) return [];
  const likes = await prisma.feedExternalLike.findMany({where:{activityId:postId},include:{participant:{include:{subcontractorAccount:{select:{name:true}}}}}});
  return likes.map(like=>({id:like.id,date_creation:like.date_creation,user:{id:like.participantId,name:like.participant.subcontractorAccount!.name,avatar:null}}));
}

// Legacy gallery reads are public. Only newly external-authored photos require
// a verified internal company member; legacy photos keep their existing contract.
export function employeeRequestId(req: Request): string | undefined {
  if (typeof (req as any).userId === 'string') return (req as any).userId;
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
  try {
    const claims = token ? Jwt.verify(token, process.env.SECRET_JWT!, {algorithms:['HS256']}) as Jwt.JwtPayload : null;
    if (!claims || claims.type || claims.purpose) return undefined;
    return typeof claims.id === 'string' ? claims.id : typeof claims.sub === 'string' ? claims.sub : undefined;
  } catch { return undefined; }
}
export async function authorizeExternalReportEmployee(postId: string, userId: string | undefined, manage = false) {
  const post = await prisma.activities.findUnique({where:{id:postId},select:{externalAuthorId:true,externalAccess:{include:{subcontractor:true}}}});
  if (!post?.externalAuthorId || !post.externalAccess) return false;
  if (!collaborationEnabled()) throw new SubcontractorAccessError(503,'SUBCONTRACTOR_COLLABORATION_DISABLED');
  const companyId = post.externalAccess.subcontractor.company_id;
  if (!userId || !companyId) throw new SubcontractorAccessError(403,'ACCESS_DENIED');
  await collaboration.internalMember(userId,companyId);
  if (manage) await new SubcontractorAccessService().authorizeManager(userId,post.externalAccess.subcontractorId);
  return true;
}
export async function filterExternalFeedPhotos<T extends {title:string|null;description:string|null}>(photos: T[], req: Request): Promise<T[]> {
  const ids=Array.from(new Set(photos.filter(photo=>photo.title==='FEED_POST'&&photo.description).map(photo=>photo.description!)));
  if (!ids.length) return photos;
  const visible=await withExternalAuthors(Promise.resolve(ids.map(id=>({id,author:null}))),employeeRequestId(req));
  const allowed=new Set(visible.map(activity=>activity.id));
  return photos.filter(photo=>photo.title!=='FEED_POST'||!photo.description||allowed.has(photo.description));
}
