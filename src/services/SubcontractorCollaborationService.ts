import { createHash } from 'crypto';
import { prisma } from '../utils/prisma';
import { ExternalSession, externalAccessEnabled, SubcontractorAccessError } from '../utils/subcontractorIdentity';
import { getPresignedUrl } from '../utils/S3/getPresignedUrl';
import { SocketService } from './SocketService';
import { deleteFileFromS3 } from '../utils/S3/deleteFileFromS3';
import { PushNotificationService } from './PushNotificationService';

export const collaborationEnabled = () => externalAccessEnabled() && process.env.SUBCONTRACTOR_COLLABORATION_ENABLED === 'true';
export const collaborationFail = (status: number, code: string): never => { throw new SubcontractorAccessError(status, code); };
export type CollaborationScope = { accountId: string; participantId: string; accessId: string; version: number; subcontractorId: string; companyId: string; name: string; subcontractorName: string };
const participantInclude = { subcontractorAccount: { select: { id: true, name: true } } } as const;
const chatInclude = {
  members: { include: { user: { select: { id: true, name: true, avatar: true, isDisabled: true, expoPushToken: true } } } },
  externalMembers: { include: { participant: { include: participantInclude }, access: { include: { account: true, subcontractor: { include: { company: true } } } } } },
} as const;
const page = (limit: unknown = 50, offset: unknown = 0) => ({ take: Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 100), skip: Math.min(Math.max(Math.floor(Number(offset)) || 0, 0), 10000) });
export const externalRoom = (scope: Pick<CollaborationScope, 'accountId' | 'accessId' | 'version'>) => `subcontractor:${scope.accountId}:${scope.accessId}:${scope.version}`;

export class SubcontractorCollaborationService {
  async scope(session: ExternalSession, db: any = prisma): Promise<CollaborationScope> {
    if (!collaborationEnabled()) return collaborationFail(503, 'SUBCONTRACTOR_COLLABORATION_DISABLED');
    if (!session.accessId || !Number.isInteger(session.accessVersion)) return collaborationFail(403, 'COMPANY_SELECTION_REQUIRED');
    const grant = await db.subcontractorAccess.findFirst({ where: { id: session.accessId, accountId: session.sub, status: 'active', version: session.accessVersion,
      account: { isDisabled: false, sessionVersion: session.sessionVersion }, subcontractor: { company: { isActive: true } } },
      include: { account: { include: { participant: true } }, subcontractor: true } });
    if (!grant?.account.participant || grant.account.participant.type !== 'subcontractor') return collaborationFail(403, 'ACCESS_DENIED');
    return { accountId: grant.accountId, participantId: grant.account.participant.id, accessId: grant.id, version: grant.version,
      subcontractorId: grant.subcontractorId, companyId: grant.subcontractor.company_id, name: grant.account.name, subcontractorName: grant.subcontractor.name };
  }

  async internalMember(userId: string, companyId: string) {
    if (typeof userId !== 'string' || !userId || typeof companyId !== 'string' || !companyId) return collaborationFail(403, 'ACCESS_DENIED');
    const user = await prisma.user.findFirst({ where: { id: userId, isDisabled: false,
      OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] }, select: { id: true, name: true, avatar: true } });
    if (!user) return collaborationFail(403, 'ACCESS_DENIED');
    return user;
  }

  async contacts(scope: CollaborationScope) {
    return prisma.user.findMany({ where: { isDisabled: false, OR: [{ company_id: scope.companyId }, { companies: { some: { companyId: scope.companyId } } }] },
      select: { id: true, name: true, avatar: true, profession: true }, orderBy: { name: 'asc' } }).then(users => Promise.all(users.map(async user => ({ ...user, avatar: user.avatar ? await getPresignedUrl(user.avatar) : null }))));
  }

  async privateChat(scope: CollaborationScope, targetUserId: unknown, viewerId = scope.participantId) {
    if (typeof targetUserId !== 'string' || !targetUserId) return collaborationFail(400, 'INVALID_CONTACT');
    await this.internalMember(targetUserId, scope.companyId);
    const key = createHash('sha256').update(`${scope.accessId}:${targetUserId}`).digest('hex');
    // Unique key prevents concurrent requests creating two private conversations.
    let chat;
    try {
      chat = await prisma.chat.upsert({ where: { externalPrivateKey: key }, update: {}, create: {
        externalPrivateKey: key, companyId: scope.companyId, isGroup: false,
        members: { create: { userId: targetUserId } }, externalMembers: { create: { participantId: scope.participantId, accessId: scope.accessId } },
      }, include: chatInclude });
    } catch (e: any) { if (e.code === 'P2002') chat = await prisma.chat.findUniqueOrThrow({ where: { externalPrivateKey: key }, include: chatInclude }); else throw e; }
    return this.serializeChat(chat, viewerId, false);
  }

  async externalContacts(userId: string, companyId: string) {
    await this.internalMember(userId, companyId);
    const accesses = await prisma.subcontractorAccess.findMany({where:{status:'active',account:{isDisabled:false,participant:{isNot:null}},subcontractor:{company_id:companyId,company:{isActive:true}}},include:{account:{include:{participant:true}},subcontractor:true}});
    return accesses.map(a=>({id:`external:${a.id}`,accessId:a.id,participantId:a.account.participant!.id,identityType:'subcontractor',name:`${a.account.name} · ${a.subcontractor.name}`,avatar:null,profession:a.subcontractor.name}));
  }

  async scopeForRecipient(userId: string, companyId: string, accessId: string) {
    await this.internalMember(userId,companyId);
    const grant=await prisma.subcontractorAccess.findFirst({where:{id:accessId,status:'active',subcontractor:{company_id:companyId}},include:{account:true}});
    if(!grant)return collaborationFail(403,'ACCESS_DENIED');
    return this.scope({type:'subcontractor_session',sub:grant.accountId,sessionVersion:grant.account.sessionVersion,accessId:grant.id,accessVersion:grant.version});
  }

  async externalGroup(userId: string, companyId: string, name: unknown, memberIds: unknown, chatId?: string, avatar?: string | (() => Promise<string>)) {
    if (typeof name !== 'string' || !name.trim() || name.length > 191 || !Array.isArray(memberIds) || memberIds.length > 200 || memberIds.some(id => typeof id !== 'string')) return collaborationFail(400, 'INVALID_GROUP');
    const externalIds = memberIds.filter(id => id.startsWith('external:')).map(id => id.slice(9));
    if (externalIds.length > 1) return collaborationFail(400, 'ONE_SUBCONTRACTOR_PER_GROUP');
    await this.internalMember(userId, companyId);
    const current = chatId ? await prisma.chat.findUnique({ where: { id: chatId }, include: chatInclude }) : null;
    if (chatId && (!current || !current.isGroup || current.companyId !== companyId || !current.members.some(member => member.userId === userId))) return collaborationFail(403, 'ACCESS_DENIED');
    let scope: CollaborationScope | undefined;
    if (externalIds.length) scope = await this.scopeForRecipient(userId, companyId, externalIds[0]);
    else if (current) {
      const member = current.externalMembers.find(m => !m.removedAt) || current.externalMembers[0];
      if (member) scope = { accountId: member.access.accountId, participantId: member.participantId, accessId: member.accessId, version: member.access.version, subcontractorId: member.access.subcontractorId, companyId, name: member.participant.subcontractorAccount!.name, subcontractorName: member.access.subcontractor.name };
    }
    if (!scope) return collaborationFail(400, 'INVALID_GROUP');
    const { SubcontractorAccessService } = await import('./SubcontractorAccessService');
    await new SubcontractorAccessService().authorizeManager(userId, scope.subcontractorId);
    const internalIds = Array.from(new Set([userId, ...memberIds.filter(id => !id.startsWith('external:'))]));
    for (const id of internalIds) await this.internalMember(id, companyId);
    const image = typeof avatar === 'function' ? await avatar() : avatar;
    let result;
    try {
      result = await prisma.$transaction(async tx => {
        if (externalIds.length) {
          const active = await tx.subcontractorAccess.findFirst({ where: { id: scope!.accessId, version: scope!.version, status: 'active', account: { isDisabled: false }, subcontractor: { company_id: companyId, company: { isActive: true } } }, select: { id: true } });
          if (!active) return collaborationFail(403, 'ACCESS_DENIED');
        }
        if (!chatId) return tx.chat.create({ data: { name: name.trim(), isGroup: true, companyId, creatorId: userId, avatar: image, members: { create: internalIds.map(id => ({ userId: id, isAdmin: id === userId })) }, externalMembers: { create: { accessId: scope!.accessId, participantId: scope!.participantId } } }, include: chatInclude });
        // Retained internal memberships keep their read/archive cursors. External
        // removals retain sender rows so historic messages never lose authors.
        await tx.chatMember.deleteMany({ where: { chatId, userId: { notIn: internalIds } } });
        for (const id of internalIds) await tx.chatMember.upsert({ where: { chatId_userId: { chatId, userId: id } }, create: { chatId, userId: id, isAdmin: id === userId }, update: {} });
        await tx.chatExternalMember.updateMany({ where: { chatId, accessId: { notIn: externalIds } }, data: { removedAt: new Date() } });
        if (externalIds.length) await tx.chatExternalMember.upsert({ where: { chatId_accessId: { chatId, accessId: scope!.accessId } }, create: { chatId, accessId: scope!.accessId, participantId: scope!.participantId }, update: { removedAt: null } });
        return tx.chat.update({ where: { id: chatId }, data: { name: name.trim(), ...(image ? { avatar: image } : {}) }, include: chatInclude });
      });
    } catch (error) {
      if (image && typeof avatar === 'function') await deleteFileFromS3(image).catch(() => {});
      throw error;
    }
    const payload = await this.serializeChat(result, userId, false);
    await this.emit(result, chatId ? 'group_updated' : 'added_to_group', payload);
    return payload;
  }

  async authorizeChat(chatId: string, actor: CollaborationScope | string) {
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: chatInclude });
    if (!chat || !chat.externalMembers.length) return collaborationFail(404, 'CHAT_UNAVAILABLE');
    if (typeof actor === 'string') {
      await this.internalMember(actor, chat.companyId);
      if (!chat.members.some(m => m.userId === actor)) return collaborationFail(403, 'ACCESS_DENIED');
    } else if (chat.companyId !== actor.companyId || !chat.externalMembers.some(m => !m.removedAt && m.accessId === actor.accessId && m.participantId === actor.participantId)) {
      return collaborationFail(403, 'ACCESS_DENIED');
    }
    // An inactive external grant cannot continue receiving messages or being used as a contact.
    if (typeof actor !== 'string' && chat.externalMembers.some(m => !m.removedAt && (m.access.status !== 'active' || m.access.account.isDisabled || !m.access.subcontractor.company?.isActive))) return collaborationFail(403, 'ACCESS_DENIED');
    return chat;
  }

  private async serializeMessage(message: any, chat: any) {
    const external = Boolean(message.senderMember);
    const author = external ? message.senderMember.participant.subcontractorAccount : message.sender;
    const senderId = external ? message.senderMember.participantId : message.senderId;
    const readers = [...chat.members.map((m: any) => ({ id: m.userId, lastReadAt: m.lastReadAt })),
      ...chat.externalMembers.map((m: any) => ({ id: m.participantId, lastReadAt: m.lastReadAt }))];
    const seenByCount = readers.filter((m: any) => m.id !== senderId && m.lastReadAt >= message.createdAt).length;
    return { id: message.id, chatId: message.chatId, senderId, sender: { id: senderId, name: author?.name || '', avatar: !external && author?.avatar ? await getPresignedUrl(author.avatar) : null },
      identityType: external ? 'subcontractor' : 'internal', participantId: external ? senderId : undefined,
      text: message.deletedAt ? 'This message was deleted' : message.text,
      fileUrl: !message.deletedAt && message.fileUrl ? await getPresignedUrl(message.fileUrl) : null,
      fileName: message.deletedAt ? null : message.fileName, fileType: message.deletedAt ? null : message.fileType,
      deletedAt: message.deletedAt, createdAt: message.createdAt, seenByCount, seenByOthers: seenByCount > 0 };
  }

  async serializeChat(chat: any, actorId: string, archived: boolean) {
    const externalMembers = chat.externalMembers.filter((m:any)=>!m.removedAt).map((m: any) => ({ id: m.id, userId: m.participantId, accessId:m.accessId, participantId: m.participantId, identityType: 'subcontractor', isAdmin: false,
      user: { id: m.participantId, name: `${m.participant.subcontractorAccount.name} · ${m.access.subcontractor.name}`, avatar: null } }));
    const members = [...chat.members.map((m: any) => ({ id: m.id, userId: m.userId, isAdmin: m.isAdmin, user: { id: m.user.id, name: m.user.name, avatar: m.user.avatar } })), ...externalMembers];
    const other = members.find(m => m.userId !== actorId);
    const [internalMessages, externalMessages] = await Promise.all([
      prisma.chatMessage.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: 'desc' }, include: { sender: true }, take: 1 }),
      prisma.chatExternalMessage.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: 'desc' }, include: { senderMember: { include: { participant: { include: participantInclude } } } }, take: 1 }),
    ]);
    const latest = [...internalMessages, ...externalMessages].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const membership = chat.members.find((m: any) => m.userId === actorId) || chat.externalMembers.find((m: any) => !m.removedAt && m.participantId === actorId);
    const since = membership?.lastReadAt || new Date(0);
    const [ic, ec] = await Promise.all([
      prisma.chatMessage.count({ where: { chatId: chat.id, senderId: { not: actorId }, createdAt: { gt: since } } }),
      prisma.chatExternalMessage.count({ where: { chatId: chat.id, senderMember: { participantId: { not: actorId } }, createdAt: { gt: since } } }),
    ]);
    return { id: chat.id, companyId: chat.companyId, isGroup: chat.isGroup, name: chat.isGroup ? chat.name : other?.user.name,
      avatar: chat.isGroup && chat.avatar ? await getPresignedUrl(chat.avatar) : !chat.isGroup && other?.user.avatar ? await getPresignedUrl(other.user.avatar) : null,
      creatorId: chat.creatorId, createdAt: chat.createdAt, lastMessageAt: chat.lastMessageAt, members, unreadCount: ic + ec,
      lastMessage: latest ? await this.serializeMessage(latest, chat) : null, hasExternalParticipants: true, archived };
  }

  async chats(actor: CollaborationScope | string, companyId: string, archived = false) {
    if (typeof actor === 'string') await this.internalMember(actor, companyId);
    const where = typeof actor === 'string' ? { members: { some: { userId: actor, archivedAt: archived ? { not: null } : null } } }
      : { externalMembers: { some: { accessId: actor.accessId, participantId: actor.participantId, removedAt:null, archivedAt: archived ? { not: null } : null } } };
    const chats = await prisma.chat.findMany({ where: { companyId, ...where, externalMembers: { some: {}, ...('externalMembers' in where ? where.externalMembers : {}) } }, include: chatInclude, orderBy: { lastMessageAt: 'desc' } });
    return Promise.all(chats.map(chat => this.serializeChat(chat, typeof actor === 'string' ? actor : actor.participantId, archived)));
  }

  async messages(chatId: string, actor: CollaborationScope | string, limit?: unknown, offset?: unknown) {
    const chat = await this.authorizeChat(chatId, actor);
    const paging = page(limit, offset);
    const [internal, external] = await Promise.all([
      prisma.chatMessage.findMany({ where: { chatId }, orderBy: { createdAt: 'desc' }, take: paging.take + paging.skip, include: { sender: true } }),
      prisma.chatExternalMessage.findMany({ where: { chatId }, orderBy: { createdAt: 'desc' }, take: paging.take + paging.skip, include: { senderMember: { include: { participant: { include: participantInclude } } } } }),
    ]);
    const readAt = new Date();
    if (typeof actor === 'string') await prisma.chatMember.updateMany({ where: { chatId, userId: actor }, data: { lastReadAt: readAt } });
    else await prisma.chatExternalMember.updateMany({ where: { chatId, accessId: actor.accessId, participantId: actor.participantId }, data: { lastReadAt: readAt } });
    await this.emit(chat, 'chat_messages_seen', { chatId, readerId: typeof actor === 'string' ? actor : actor.participantId, lastReadAt: readAt.toISOString() });
    const merged = [...internal, ...external].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(paging.skip, paging.skip + paging.take).reverse();
    return Promise.all(merged.map(message => this.serializeMessage(message, chat)));
  }

  async send(chatId: string, actor: CollaborationScope | string, text: unknown, file?: { fileUrl: string; fileName: string; fileType: string }) {
    const chat = await this.authorizeChat(chatId, actor);
    if(chat.externalMembers.some(m=>!m.removedAt&&(m.access.status!=='active'||m.access.account.isDisabled||!m.access.subcontractor.company?.isActive)))return collaborationFail(403,'ACCESS_DENIED');
    if ((!text || typeof text !== 'string' || !text.trim()) && !file) return collaborationFail(400, 'MESSAGE_REQUIRED');
    if (typeof text === 'string' && text.length > 20000) return collaborationFail(400, 'MESSAGE_TOO_LONG');
    const data = { chatId, text: typeof text === 'string' ? text.trim() || null : null, ...file };
    const message = typeof actor === 'string'
      ? await prisma.chatMessage.create({ data: { ...data, senderId: actor }, include: { sender: true } })
      : await prisma.chatExternalMessage.create({ data: { ...data, senderMemberId: chat.externalMembers.find(m => m.accessId === actor.accessId)!.id }, include: { senderMember: { include: { participant: { include: participantInclude } } } } });
    await prisma.chat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } });
    const payload = await this.serializeMessage(message, chat);
    await this.emit(chat, 'new_chat_message', payload);
    const body = payload.text || (payload.fileType?.startsWith('audio/') ? 'Audio' : payload.fileType?.startsWith('image/') ? 'Photo' : 'File');
    const senderId = typeof actor === 'string' ? actor : actor.participantId;
    const recipients = [] as string[];
    for (const member of chat.members) {
      if (member.userId === senderId || !member.user.expoPushToken || member.user.isDisabled) continue;
      try { await this.internalMember(member.userId, chat.companyId); recipients.push(member.user.expoPushToken); } catch { /* Former company members cannot receive new content. */ }
    }
    if (recipients.length) void PushNotificationService.sendChatMessagePush(recipients, payload.sender.name, body, chatId).catch(() => {});
    for (const member of chat.externalMembers) {
      if (member.removedAt || member.access.status!=='active' || member.access.account.isDisabled || member.participantId === senderId || !member.access.expoPushToken || !member.access.pushTokenExpiresAt || member.access.pushTokenExpiresAt <= new Date()) continue;
      void PushNotificationService.sendSubcontractorPush(member.access.expoPushToken, payload.sender.name, body, { type: 'chat_message', chatId, accessId: member.accessId }).catch(() => {});
    }
    return payload;
  }

  async archive(chatId: string, actor: CollaborationScope | string, archived: boolean) {
    await this.authorizeChat(chatId, actor);
    const data = { archivedAt: archived ? new Date() : null };
    if (typeof actor === 'string') await prisma.chatMember.updateMany({ where: { chatId, userId: actor }, data });
    else await prisma.chatExternalMember.updateMany({ where: { chatId, accessId: actor.accessId, participantId: actor.participantId }, data });
  }

  async deleteMessage(chatId: string, messageId: string, actor: CollaborationScope | string) {
    const chat = await this.authorizeChat(chatId, actor);
    let result;
    if (typeof actor === 'string') {
      const message = await prisma.chatMessage.findFirst({ where: { id: messageId, chatId, senderId: actor } });
      if (!message) return collaborationFail(403, 'ACCESS_DENIED');
      result = await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: actor, text: 'This message was deleted', fileUrl: null, fileName: null, fileType: null }, include: { sender: true } });
    } else {
      const message = await prisma.chatExternalMessage.findFirst({ where: { id: messageId, chatId, senderMember: { participantId: actor.participantId, accessId: actor.accessId } } });
      if (!message) return collaborationFail(403, 'ACCESS_DENIED');
      result = await prisma.chatExternalMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), text: null, fileUrl: null, fileName: null, fileType: null }, include: { senderMember: { include: { participant: { include: participantInclude } } } } });
    }
    const payload = await this.serializeMessage(result, chat);
    await this.emit(chat, 'chat_message_deleted', payload);
    return payload;
  }

  async emit(chat: any, event: string, data: any) {
    for (const member of chat.members) {
      try { await this.internalMember(member.userId, chat.companyId); SocketService.emitToVerifiedUser(member.userId, event, data); } catch { /* Removed or disabled recipients do not receive messages. */ }
    }
    chat.externalMembers.filter((m: any) => !m.removedAt && m.access.status === 'active' && !m.access.account.isDisabled).forEach((m: any) =>
      SocketService.emitToExternalRoom(externalRoom({ accountId: m.access.accountId, accessId: m.accessId, version: m.access.version }), event, data));
  }

  serviceWhere(scope: CollaborationScope) {
    return { Project: { company_id: scope.companyId, status_project: { in: ['Pre-Start', 'In Progress', 'Final walkthrough'] } },
      AND: [
        { OR: [{ status: null }, { status: { not: 'Canceled' } }] },
        { OR: [
          { subContractorServiceProjects: { some: { subcontractor_id: scope.subcontractorId, removed_at: null } } },
          { subServicesProjects: { some: { status: { not: 'Canceled' }, subContractorServiceProjects: { some: { subcontractor_id: scope.subcontractorId, removed_at: null } } } } },
        ] },
      ] };
  }
  async services(scope: CollaborationScope) {
    return prisma.serviceProject.findMany({ where: this.serviceWhere(scope), select: { id: true, name: true, projectId: true, Project: { select: { id: true, location: true, status_project: true, client: { select: { name: true } } } } }, orderBy: { name: 'asc' } });
  }
  async assertService(scope: CollaborationScope, id: string, db: any = prisma) {
    // A service or one of its subservices must have an active assignment.
    // A schedule-only assignment never grants every service in the project.
    const service = await db.serviceProject.findFirst({ where: { id, ...this.serviceWhere(scope) }, select: { id: true, name: true, projectId: true } });
    if (!service) return collaborationFail(403, 'SERVICE_ACCESS_DENIED');
    return service;
  }
  reportWhere(scope: CollaborationScope) {
    return { externalAuthorId: scope.participantId, externalAccessId: scope.accessId, ServiceProject: { Project: { company_id: scope.companyId } } };
  }
  async ownReport(scope: CollaborationScope, id: string, db: any = prisma) {
    const post = await db.activities.findFirst({ where: { id, ...this.reportWhere(scope) } });
    if (!post) return collaborationFail(404, 'REPORT_UNAVAILABLE');
    return post;
  }
  async createReport(session: ExternalSession, text: unknown, serviceId: unknown, photos: { key: string }[]) {
    const scope = await this.scope(session);
    if (typeof serviceId !== 'string') return collaborationFail(400, 'INVALID_SERVICE');
    const content = typeof text === 'string' ? text.trim() : '';
    if ((!content && !photos.length) || content.length > 20000 || photos.length > 50) return collaborationFail(400, 'INVALID_REPORT');
    return prisma.$transaction(async tx => {
      await this.scope(session, tx);
      const service = await this.assertService(scope, serviceId, tx);
      const activity = await tx.activities.create({ data: { text: content || '📷', serviceProjectId: service.id, externalAuthorId: scope.participantId, externalAccessId: scope.accessId } });
      for (const photo of photos) await tx.galleryAfter.create({ data: { serviceProjectId: service.id, url: photo.key, title: 'FEED_POST', description: activity.id } });
      return { id: activity.id };
    });
  }
  async reports(scope: CollaborationScope, limit?: unknown, offset?: unknown) {
    const [posts, total] = await Promise.all([
      prisma.activities.findMany({ where: this.reportWhere(scope), include: { ServiceProject: { include: { Project: { include: { client: true } } } }, _count: { select: { comments: true, likes: true, externalComments: true, externalLikes: true } } }, orderBy: { date_creation: 'desc' }, ...page(limit, offset) }),
      prisma.activities.count({ where: this.reportWhere(scope) }),
    ]);
    return { success: true, data: { total, posts: await Promise.all(posts.map(async post => {
      const photos = await prisma.galleryAfter.findMany({ where: { description: post.id, title: 'FEED_POST', serviceProjectId: post.serviceProjectId } });
      return { id: post.id, type: 'post', text: post.text === '📷' ? null : post.text, date_creation: post.date_creation,
        author: { id: scope.participantId, name: scope.name, avatar: null }, authorType: 'subcontractor',
        serviceProject: { id: post.ServiceProject!.id, name: post.ServiceProject!.name },
        project: { id: post.ServiceProject!.Project!.id, status: post.ServiceProject!.Project!.status_project, client: post.ServiceProject!.Project!.client },
        photos: await Promise.all(photos.map(async photo => ({ id: photo.id, url: await getPresignedUrl(photo.url), date_creation: photo.date_creation }))),
        likesCount: post._count.likes + post._count.externalLikes, commentsCount: post._count.comments + post._count.externalComments };
    })) } };
  }
  async editReport(scope: CollaborationScope, id: string, text: unknown) {
    const post = await this.ownReport(scope, id);
    await this.assertService(scope, post.serviceProjectId!);
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) return collaborationFail(400, 'INVALID_REPORT');
    await prisma.activities.update({ where: { id }, data: { text: text.trim() } });
    return { success: true };
  }
  async deleteReport(scope: CollaborationScope, id: string) {
    await this.ownReport(scope, id);
    const photos = await prisma.galleryAfter.findMany({ where: { description: id, title: 'FEED_POST' }, select: { url: true } });
    await prisma.$transaction(async tx => {
      await tx.galleryAfter.deleteMany({ where: { description: id, title: 'FEED_POST' } });
      await tx.activities.delete({ where: { id } });
    });
    await Promise.all(photos.map(photo => deleteFileFromS3(photo.url).catch(() => {})));
    return { success: true };
  }
  async comments(scope: CollaborationScope, id: string) {
    await this.ownReport(scope, id);
    const [internal, external] = await Promise.all([
      prisma.feedComment.findMany({ where: { activityId: id }, include: { author: { select: { id: true, name: true, avatar: true } } } }),
      prisma.feedExternalComment.findMany({ where: { activityId: id }, include: { participant: { include: participantInclude } } }),
    ]);
    const mapped = await Promise.all(internal.map(async c => ({ ...c, author: { ...c.author, avatar: c.author.avatar ? await getPresignedUrl(c.author.avatar) : null } })));
    return { success: true, data: { total: internal.length + external.length, comments: [...mapped, ...external.map(c => ({ id: c.id, text: c.text, date_creation: c.date_creation, author: { id: c.participantId, name: c.participant.subcontractorAccount!.name, avatar: null } }))].sort((a,b) => a.date_creation.getTime() - b.date_creation.getTime()) } };
  }
  async comment(scope: CollaborationScope, id: string, text: unknown) {
    await this.ownReport(scope, id);
    if (typeof text !== 'string' || !text.trim() || text.length > 10000) return collaborationFail(400, 'INVALID_COMMENT');
    const c = await prisma.feedExternalComment.create({ data: { activityId: id, accessId: scope.accessId, participantId: scope.participantId, text: text.trim() } });
    return { success: true, data: { ...c, author: { id: scope.participantId, name: scope.name, avatar: null } } };
  }
  async deleteComment(scope: CollaborationScope, id: string) {
    const c = await prisma.feedExternalComment.findFirst({ where: { id, participantId: scope.participantId, accessId: scope.accessId } });
    if (!c) return collaborationFail(404, 'COMMENT_UNAVAILABLE');
    await this.ownReport(scope, c.activityId);
    await prisma.feedExternalComment.delete({ where: { id } });
    return { success: true };
  }
  async like(scope: CollaborationScope, id: string, liked: boolean) {
    await this.ownReport(scope, id);
    if (liked) await prisma.feedExternalLike.upsert({ where: { activityId_participantId: { activityId: id, participantId: scope.participantId } }, create: { activityId: id, participantId: scope.participantId, accessId: scope.accessId }, update: {} });
    else await prisma.feedExternalLike.deleteMany({ where: { activityId: id, participantId: scope.participantId, accessId: scope.accessId } });
    const [internal, external] = await Promise.all([prisma.feedLike.count({ where: { activityId: id } }), prisma.feedExternalLike.count({ where: { activityId: id } })]);
    return { success: true, data: { totalLikes: internal + external } };
  }
}
export const collaboration = new SubcontractorCollaborationService();
