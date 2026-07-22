jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    chatMember: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock("../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(async (value: string) => value),
}));

jest.mock("../../src/utils/S3/uploadFIleS3", () => ({
  uploadFileToS3_2: jest.fn(),
}));

jest.mock("../../src/services/SocketService", () => ({
  SocketService: { emitToUser: jest.fn() },
}));

jest.mock("../../src/services/PushNotificationService", () => ({
  PushNotificationService: { sendChatMessagePush: jest.fn() },
}));

import { ChatController } from "../../src/controllers/tasks/ChatController";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;

describe("chat unread compatibility", () => {
  it("returns the unread count calculated from the member read cursor", async () => {
    prismaMock.chatMember.findMany.mockResolvedValue([
      {
        chatId: "chat-1",
        userId: "worker-1",
        lastReadAt: new Date("2026-07-16T10:00:00.000Z"),
        chat: {
          id: "chat-1",
          name: null,
          avatar: null,
          isGroup: false,
          members: [
            { userId: "worker-1", user: { id: "worker-1", name: "Worker", avatar: null } },
            { userId: "admin-1", user: { id: "admin-1", name: "Admin", avatar: null } },
          ],
          messages: [],
        },
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([{ chatId: "chat-1", unreadCount: 2n }]);

    const request = {
      params: { userId: "worker-1" },
      query: { companyId: "company-1" },
      userId: "worker-1",
    } as any;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;

    await new ChatController().listChats(request, response);

    expect(response.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: "chat-1", unreadCount: 2 }),
    ]);
  });
});
