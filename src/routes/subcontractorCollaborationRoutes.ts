import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { checkSubcontractorToken, ExternalRequest } from '../middlewares/checkSubcontractorToken';
import { collaboration, CollaborationScope, collaborationEnabled, collaborationFail } from '../services/SubcontractorCollaborationService';
import { externalServiceError } from '../services/SubcontractorAccessService';
import { uploadFileToS3_2 } from '../utils/S3/uploadFIleS3';
import { deleteFileFromS3 } from '../utils/S3/deleteFileFromS3';
import { prisma } from '../utils/prisma';

type ScopedRequest = ExternalRequest & { collaborationScope?: CollaborationScope };
export const subcontractorCollaborationRoutes = Router();
const upload = multer({ dest: './public/tmp/subcontractor-collaboration', limits: { fileSize: 25 * 1024 * 1024, files: 50, fields: 8, fieldSize: 100000 } });
const route = (fn: (req: ScopedRequest, res: Response) => Promise<unknown>) => async (req: ScopedRequest, res: Response) => {
  try { await fn(req, res); } catch (e) { const error = externalServiceError(e); res.status(error.status).json({ error: error.code }); }
  finally {
    const files = [...(req.file ? [req.file] : []), ...(Array.isArray(req.files) ? req.files : [])];
    await Promise.all(files.map(file => fs.unlink(file.path).catch(() => {})));
  }
};
subcontractorCollaborationRoutes.use('/subcontractor', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!collaborationEnabled()) return res.status(503).json({ error: 'SUBCONTRACTOR_COLLABORATION_DISABLED' });
  return next();
}, checkSubcontractorToken, async (req: ScopedRequest, res: Response, next: NextFunction) => {
  try { req.collaborationScope = await collaboration.scope(req.externalSession!); next(); }
  catch (e) { const error = externalServiceError(e); res.status(error.status).json({ error: error.code }); }
});
const scope = (req: ScopedRequest) => req.collaborationScope!;
subcontractorCollaborationRoutes.post('/subcontractor/device', route(async (req,res) => {
  const token = req.body?.token;
  const leaseId = req.body?.leaseId;
  if (typeof token !== 'string' || token.length > 191 || !/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) || typeof leaseId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(leaseId)) return collaborationFail(400,'INVALID_DEVICE_TOKEN');
  await prisma.$transaction(async tx => {
    await collaboration.scope(req.externalSession!, tx);
    await tx.subcontractorAccess.updateMany({where:{accountId:scope(req).accountId,expoPushToken:token},data:{expoPushToken:null,pushTokenExpiresAt:null,pushTokenLeaseId:null}});
    await tx.subcontractorAccess.update({where:{id:scope(req).accessId},data:{expoPushToken:token,pushTokenLeaseId:leaseId,pushTokenExpiresAt:new Date(Date.now()+7*86400000)}});
  });
  res.sendStatus(204);
}));
subcontractorCollaborationRoutes.delete('/subcontractor/device', route(async (req,res) => {
  if (typeof req.body?.token !== 'string' || typeof req.body?.leaseId !== 'string') return collaborationFail(400,'INVALID_DEVICE_TOKEN');
  await prisma.subcontractorAccess.updateMany({where:{id:scope(req).accessId,accountId:scope(req).accountId,expoPushToken:req.body.token,pushTokenLeaseId:req.body.leaseId},data:{expoPushToken:null,pushTokenExpiresAt:null,pushTokenLeaseId:null}});
  res.sendStatus(204);
}));
const writeWindows = new Map<string, { count: number; expires: number }>();
subcontractorCollaborationRoutes.use('/subcontractor', (req: ScopedRequest, res, next) => {
  if (req.method === 'GET') return next();
  const now = Date.now();
  for (const [key, value] of writeWindows) if (value.expires <= now) writeWindows.delete(key);
  const key = scope(req).accessId;
  const window = writeWindows.get(key) || { count: 0, expires: now + 60000 };
  if (window.count >= 60 || (!writeWindows.has(key) && writeWindows.size >= 10000)) return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS' });
  window.count++; writeWindows.set(key, window); next();
});
for (const action of ['enhance-description', 'transcribe-and-enhance'] as const) subcontractorCollaborationRoutes.post(`/subcontractor/report-ai/${action}`, route(async (req,res) => {
  if (typeof req.query.serviceProjectId !== 'string') return collaborationFail(400, 'INVALID_SERVICE');
  await collaboration.assertService(scope(req), req.query.serviceProjectId);
  const { OpenAIController } = await import('../controllers/OpenAI/OpenAIController');
  const controller = new OpenAIController();
  return action === 'enhance-description' ? controller.enhanceDescription(req,res) : controller.transcribeAndEnhance(req,res);
}));
subcontractorCollaborationRoutes.get('/subcontractor/chat/contacts', route(async (req,res) => res.json(await collaboration.contacts(scope(req)))));
subcontractorCollaborationRoutes.get('/subcontractor/chat', route(async (req,res) => res.json(await collaboration.chats(scope(req), scope(req).companyId, req.query.archived === 'true'))));
subcontractorCollaborationRoutes.post('/subcontractor/chat/private', route(async (req,res) => res.status(201).json(await collaboration.privateChat(scope(req), req.body?.targetUserId))));
subcontractorCollaborationRoutes.get('/subcontractor/chat/:chatId/messages', route(async (req,res) => res.json(await collaboration.messages(req.params.chatId, scope(req), req.query.limit, req.query.offset))));
subcontractorCollaborationRoutes.post('/subcontractor/chat/:chatId/messages', upload.single('file'), route(async (req,res) => {
  await collaboration.authorizeChat(req.params.chatId, scope(req));
  let file;
  if (req.file) file = { fileUrl: await uploadFileToS3_2(req.file, 'chat'), fileName: req.file.originalname, fileType: req.file.mimetype };
  try {
    const current = await collaboration.scope(req.externalSession!);
    res.status(201).json(await collaboration.send(req.params.chatId, current, req.body?.text, file));
  } catch(e) { if(file) await deleteFileFromS3(file.fileUrl).catch(() => {}); throw e; }
}));
subcontractorCollaborationRoutes.delete('/subcontractor/chat/:chatId/messages/:messageId', route(async (req,res) => res.json(await collaboration.deleteMessage(req.params.chatId, req.params.messageId, scope(req)))));
for (const archived of [true, false]) subcontractorCollaborationRoutes.patch(`/subcontractor/chat/:chatId/${archived ? 'archive' : 'unarchive'}`, route(async (req,res) => {
  await collaboration.archive(req.params.chatId, scope(req), archived); res.sendStatus(204);
}));
subcontractorCollaborationRoutes.get('/subcontractor/report-services', route(async (req,res) => res.json(await collaboration.services(scope(req)))));
subcontractorCollaborationRoutes.get('/subcontractor/reports', route(async (req,res) => res.json(await collaboration.reports(scope(req), req.query.limit, req.query.offset))));
subcontractorCollaborationRoutes.post('/subcontractor/reports', upload.array('photos', 50), route(async (req,res) => {
  const photos: { key: string }[] = [];
  try {
    if (typeof req.body?.serviceProjectId !== 'string') return collaborationFail(400, 'INVALID_SERVICE');
    await collaboration.assertService(scope(req), req.body.serviceProjectId);
    const files = req.files as Express.Multer.File[] || [];
    if ((!req.body.text || !req.body.text.trim()) && !files.length) return collaborationFail(400, 'INVALID_REPORT');
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) return collaborationFail(400, 'INVALID_PHOTO');
      photos.push({ key: await uploadFileToS3_2(file, 'feed') });
    }
    res.status(201).json({ success: true, data: await collaboration.createReport(req.externalSession!, req.body.text, req.body.serviceProjectId, photos) });
  } catch(e) { await Promise.all(photos.map(photo => deleteFileFromS3(photo.key).catch(() => {}))); throw e; }
}));
subcontractorCollaborationRoutes.put('/subcontractor/reports/:postId', route(async (req,res) => res.json(await collaboration.editReport(scope(req), req.params.postId, req.body?.text))));
subcontractorCollaborationRoutes.delete('/subcontractor/reports/:postId', route(async (req,res) => res.json(await collaboration.deleteReport(scope(req), req.params.postId))));
subcontractorCollaborationRoutes.get('/subcontractor/reports/:postId/comments', route(async (req,res) => res.json(await collaboration.comments(scope(req), req.params.postId))));
subcontractorCollaborationRoutes.post('/subcontractor/reports/:postId/comments', route(async (req,res) => res.status(201).json(await collaboration.comment(scope(req), req.params.postId, req.body?.text))));
subcontractorCollaborationRoutes.delete('/subcontractor/report-comments/:commentId', route(async (req,res) => res.json(await collaboration.deleteComment(scope(req), req.params.commentId))));
subcontractorCollaborationRoutes.post('/subcontractor/reports/:postId/like', route(async (req,res) => res.json(await collaboration.like(scope(req), req.params.postId, true))));
subcontractorCollaborationRoutes.delete('/subcontractor/reports/:postId/like', route(async (req,res) => res.json(await collaboration.like(scope(req), req.params.postId, false))));
subcontractorCollaborationRoutes.use('/subcontractor', (error: any, req: Request, res: Response, next: NextFunction) => {
  if (!error) return next();
  res.status(error instanceof multer.MulterError ? 400 : 500).json({ error: error instanceof multer.MulterError ? 'INVALID_UPLOAD' : 'COLLABORATION_FAILED' });
});
