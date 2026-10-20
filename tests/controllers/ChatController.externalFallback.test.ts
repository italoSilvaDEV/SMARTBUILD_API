jest.mock('../../src/utils/prisma', () => ({ prisma: {
  chatMember: { findMany: jest.fn() },
  userCompany: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
} }));
jest.mock('../../src/services/SubcontractorCollaborationService', () => ({
  collaborationEnabled: jest.fn(),
  collaboration: { chats: jest.fn(), externalContacts: jest.fn() },
}));
jest.mock('../../src/services/SocketService', () => ({ SocketService: {} }));
jest.mock('../../src/services/PushNotificationService', () => ({ PushNotificationService: {} }));
jest.mock('../../src/utils/S3/getPresignedUrl', () => ({ getPresignedUrl: jest.fn(async key => `signed:${key}`) }));
jest.mock('../../src/utils/S3/uploadFIleS3', () => ({ uploadFileToS3_2: jest.fn() }));
jest.mock('../../src/utils/S3/deleteFileFromS3', () => ({ deleteFileFromS3: jest.fn() }));

import { ChatController } from '../../src/controllers/tasks/ChatController';
import { prisma } from '../../src/utils/prisma';
import { collaboration, collaborationEnabled } from '../../src/services/SubcontractorCollaborationService';

const db = prisma as any;
const external = collaboration as jest.Mocked<typeof collaboration>;
const controller = new ChatController();
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const chatRequest = () => ({ params: { userId: 'worker' }, query: { companyId: 'company', archived: 'true' }, userId: 'worker' } as any);
const contactRequest = () => ({ params: { companyId: 'company' }, query: { userId: 'worker' }, userId: 'worker' } as any);

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (collaborationEnabled as jest.Mock).mockReturnValue(true);
  require('../../src/utils/S3/getPresignedUrl').getPresignedUrl.mockImplementation(async (key: string) => `signed:${key}`);
  db.chatMember.findMany.mockResolvedValue([{ chat: {
    id: 'legacy-chat', isGroup: false, lastMessageAt: '2026-10-19T10:00:00Z',
    members: [{ userId: 'worker', user: { name: 'Worker', avatar: null } }, { userId: 'colleague', user: { name: 'Colleague', avatar: 'avatar' } }],
    messages: [{ id: 'legacy-message', senderId: 'colleague', text: 'Existing message' }],
  } }]);
  db.$queryRaw.mockResolvedValue([{ chatId: 'legacy-chat', unreadCount: 2n }]);
  db.userCompany.findMany.mockResolvedValue([{ user: { id: 'colleague', name: 'Colleague', avatar: 'avatar', profession: 'Worker' } }]);
  external.chats.mockResolvedValue([]);
  external.externalContacts.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

it.each([new Error('External query unavailable'), Object.assign(new Error('Access denied'), { status: 403 })])(
  'preserves archived employee chats and unread counts when external listing fails (%s)', async error => {
    external.chats.mockRejectedValue(error);
    const res = response();
    await controller.listChats(chatRequest(), res as any);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: 'legacy-chat', name: 'Colleague', avatar: 'signed:avatar', unreadCount: 2,
      lastMessage: expect.objectContaining({ id: 'legacy-message', text: 'Existing message' }) })]);
    expect(external.chats).toHaveBeenCalledWith('worker', 'company', true);
    expect(db.chatMember.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'worker', archivedAt: { not: null }, chat: { companyId: 'company', externalMembers: { none: {} } } });
    expect(console.warn).toHaveBeenCalled();
  },
);
it('still combines and sorts internal and external chats when external listing succeeds', async () => {
  external.chats.mockResolvedValue([{ id: 'external-chat', lastMessageAt: '2026-10-20T10:00:00Z' }] as any);
  const res = response();
  await controller.listChats(chatRequest(), res as any);
  expect(res.json.mock.calls[0][0].map((chat: any) => chat.id)).toEqual(['external-chat', 'legacy-chat']);
});
it('does not query external chats when the feature is disabled', async () => {
  (collaborationEnabled as jest.Mock).mockReturnValue(false);
  const res = response();
  await controller.listChats(chatRequest(), res as any);
  expect(external.chats).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0][0].id).toBe('legacy-chat');
});
it('keeps the existing error response when the employee chat query fails', async () => {
  db.chatMember.findMany.mockRejectedValue(new Error('Employee query failed'));
  const res = response();
  await controller.listChats(chatRequest(), res as any);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(external.chats).not.toHaveBeenCalled();
});
it.each([new Error('External query unavailable'), Object.assign(new Error('Access denied'), { status: 403 })])(
  'preserves employee contacts when external contact lookup fails (%s)', async error => {
    external.externalContacts.mockRejectedValue(error);
    const res = response();
    await controller.listCompanyUsers(contactRequest(), res as any);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([{ id: 'colleague', name: 'Colleague', avatar: 'signed:avatar', profession: 'Worker' }]);
    expect(db.userCompany.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company', userId: { not: 'worker' }, user: { isDisabled: false } });
    expect(console.warn).toHaveBeenCalled();
  },
);
it('still includes external contacts after internal contacts when lookup succeeds', async () => {
  external.externalContacts.mockResolvedValue([{ id: 'external:access', name: 'External' }] as any);
  const res = response();
  await controller.listCompanyUsers(contactRequest(), res as any);
  expect(res.json.mock.calls[0][0].map((contact: any) => contact.id)).toEqual(['colleague', 'external:access']);
});
it('does not query external contacts when the feature is disabled', async () => {
  (collaborationEnabled as jest.Mock).mockReturnValue(false);
  const res = response();
  await controller.listCompanyUsers(contactRequest(), res as any);
  expect(external.externalContacts).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0][0].id).toBe('colleague');
});
it('keeps the existing error response when the employee contact query fails', async () => {
  db.userCompany.findMany.mockRejectedValue(new Error('Employee query failed'));
  const res = response();
  await controller.listCompanyUsers(contactRequest(), res as any);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(external.externalContacts).not.toHaveBeenCalled();
});
