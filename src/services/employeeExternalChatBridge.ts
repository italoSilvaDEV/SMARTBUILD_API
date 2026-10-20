import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { collaboration, collaborationEnabled } from './SubcontractorCollaborationService';
import { externalServiceError } from './SubcontractorAccessService';
import { uploadFileToS3_2 } from '../utils/S3/uploadFIleS3';
import { deleteFileFromS3 } from '../utils/S3/deleteFileFromS3';
import fs from 'fs/promises';

// Only conversations containing external members use this additive path. Legacy
// employee-only chats keep their existing rows, routes and payload contracts.
export async function handleExternalChatForEmployee(req: Request, res: Response, action: 'messages' | 'send' | 'delete' | 'archive' | 'unarchive') {
  const external = await prisma.chatExternalMember.findFirst({ where: { chatId: req.params.chatId }, select: { id: true } });
  if (!external) return false;
  if (!collaborationEnabled()) { if(req.file) await fs.unlink(req.file.path).catch(()=>{}); res.status(503).json({error:"SUBCONTRACTOR_COLLABORATION_DISABLED"}); return true; }
  let uploaded: string | null = null;
  try {
    const userId = (req as any).userId as string;
    if (action === 'messages') res.json(await collaboration.messages(req.params.chatId, userId, req.query.limit, req.query.offset));
    else if (action === 'send') {
      await collaboration.authorizeChat(req.params.chatId, userId);
      if (req.file && req.file.size > 25 * 1024 * 1024) { res.status(400).json({ error: 'INVALID_UPLOAD' }); return true; }
      let file;
      if (req.file) { uploaded = await uploadFileToS3_2(req.file, 'chat'); file = { fileUrl: uploaded, fileName: req.file.originalname, fileType: req.file.mimetype }; }
      res.status(201).json(await collaboration.send(req.params.chatId, userId, req.body?.text, file));
      uploaded = null;
    } else if (action === 'delete') res.json(await collaboration.deleteMessage(req.params.chatId, req.params.messageId, userId));
    else { await collaboration.archive(req.params.chatId, userId, action === 'archive'); res.json({ success: true }); }
  } catch(e) {
    if (uploaded) await deleteFileFromS3(uploaded).catch(() => {});
    const error = externalServiceError(e); res.status(error.status).json({ error: error.code });
  } finally { if (req.file) await fs.unlink(req.file.path).catch(() => {}); }
  return true;
}
