import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import { PushNotificationService } from "../../services/PushNotificationService";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

export class ChatController {
  private readonly deletedMessagePlaceholder = "This message was deleted";

  private mapDeletedMessage<T extends { deletedAt?: Date | null; text?: string | null; fileUrl?: string | null; fileName?: string | null; fileType?: string | null }>(message: T): T {
    if (!message.deletedAt) return message;
    return {
      ...message,
      text: this.deletedMessagePlaceholder,
      fileUrl: null,
      fileName: null,
      fileType: null,
    };
  }

  private getPushMessageBody(
    text?: string | null,
    fileUrl?: string | null,
    fileType?: string | null,
    fileName?: string | null
  ): string {
    const trimmedText = text?.trim();
    if (trimmedText) return trimmedText;
    if (!fileUrl) return "Sent you a message";

    const mime = (fileType || "").toLowerCase();
    const fileNameLower = (fileName || "").toLowerCase();

    const isImage =
      mime.startsWith("image/") ||
      /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|svg)$/.test(fileNameLower);
    const isVideo =
      mime.startsWith("video/") ||
      /\.(mp4|mov|avi|mkv|webm|m4v)$/.test(fileNameLower);
    const isAudio =
      mime.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/.test(fileNameLower);

    if (isImage) return "Sent a photo";
    if (isVideo) return "Sent a video";
    if (isAudio) return "Sent an audio message";

    return "Sent an attachment";
  }

  // Listar conversas do usuário
  async listChats(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { companyId, archived } = req.query;
      const archivedOnly = archived === "true";

      const chatMemberships = await prisma.chatMember.findMany({
        where: {
          userId,
          archivedAt: archivedOnly ? { not: null } : null,
          chat: {
            ...(companyId ? { companyId: companyId as string } : {})
          }
        },
        include: {
          chat: {
            include: {
              members: {
                include: {
                  user: {
                    select: { id: true, name: true, avatar: true }
                  }
                }
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  sender: { select: { name: true } }
                }
              }
            }
          }
        },
        orderBy: {
          chat: { lastMessageAt: 'desc' }
        }
      });

      const chats = await Promise.all(chatMemberships.map(async (membership) => {
        const chat = membership.chat;

        // Se for 1:1, definir o nome e avatar baseado no outro membro
        if (!chat.isGroup) {
          const otherMember = chat.members.find(m => m.userId !== userId);
          chat.name = otherMember?.user.name || "Unknown";
          chat.avatar = otherMember?.user.avatar || null;
        }

        if (chat.avatar) {
          chat.avatar = await getPresignedUrl(chat.avatar);
        }

        return {
          ...chat,
          lastMessage: chat.messages[0] ? this.mapDeletedMessage(chat.messages[0] as any) : null,
          unreadCount: 0 // Implementar lógica de unread depois
        };
      }));

      return res.json(chats);
    } catch (error: any) {
      console.error("[ChatController.listChats] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Criar ou buscar chat 1:1
  async getOrCreatePrivateChat(req: Request, res: Response) {
    try {
      const { userId, targetUserId, companyId } = req.body;

      // Buscar chat 1:1 existente entre esses dois usuários
      const existingChat = await prisma.chat.findFirst({
        where: {
          isGroup: false,
          companyId,
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: targetUserId } } }
          ]
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, avatar: true } } }
          }
        }
      });

      if (existingChat) {
        return res.json(existingChat);
      }

      // Criar novo chat
      const newChat = await prisma.chat.create({
        data: {
          isGroup: false,
          companyId,
          members: {
            create: [
              { userId },
              { userId: targetUserId }
            ]
          }
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, avatar: true } } }
          }
        }
      });

      return res.status(201).json(newChat);
    } catch (error: any) {
      console.error("[ChatController.getOrCreatePrivateChat] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Criar grupo
  async createGroup(req: Request, res: Response) {
    try {
      const { name, memberIds, creatorId, companyId } = req.body;
      const file = req.file;

      let avatar = null;
      if (file) {
        avatar = await uploadFileToS3_2(file, "chat-avatars");
      }

      // memberIds pode vir como string se for enviado via FormData
      const parsedMemberIds = typeof memberIds === 'string' ? JSON.parse(memberIds) : memberIds;

      const chat = await prisma.chat.create({
        data: {
          name,
          isGroup: true,
          companyId,
          creatorId,
          avatar,
          members: {
            create: [
              { userId: creatorId, isAdmin: true },
              ...parsedMemberIds.map((id: string) => ({ userId: id }))
            ]
          }
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, avatar: true } } }
          }
        }
      });

      if (chat.avatar) {
        chat.avatar = await getPresignedUrl(chat.avatar);
      }

      // Notificar todos os membros via Socket que eles entraram em um grupo
      chat.members.forEach(member => {
        SocketService.emitToUser(member.userId, 'added_to_group', chat);
      });

      return res.status(201).json(chat);
    } catch (error: any) {
      console.error("[ChatController.createGroup] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Atualizar grupo
  async updateGroup(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const { name, memberIds, companyId } = req.body;
      const file = req.file;

      if (!prisma || !prisma.chat) {
        throw new Error("Prisma client or Chat model is not initialized");
      }

      const currentChat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { members: true }
      });

      if (!currentChat || !currentChat.isGroup) {
        return res.status(404).json({ error: "Group not found" });
      }

      let avatar = currentChat.avatar;
      if (file) {
        avatar = await uploadFileToS3_2(file, "chat-avatars");
      }

      const parsedMemberIds = typeof memberIds === 'string' ? JSON.parse(memberIds) : memberIds;

      // Atualizar o chat
      const updatedChat = await prisma.chat.update({
        where: { id: chatId },
        data: {
          name: name || currentChat.name,
          avatar,
          members: parsedMemberIds ? {
            deleteMany: {},
            create: parsedMemberIds.map((id: string) => ({
              userId: id,
              isAdmin: currentChat.members.find(m => m.userId === id)?.isAdmin || false
            }))
          } : undefined
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, avatar: true } } }
          }
        }
      });

      if (updatedChat.avatar) {
        updatedChat.avatar = await getPresignedUrl(updatedChat.avatar);
      }

      // Notificar membros via Socket
      updatedChat.members.forEach(member => {
        SocketService.emitToUser(member.userId, 'group_updated', updatedChat);
      });

      return res.json(updatedChat);
    } catch (error: any) {
      console.error("[ChatController.updateGroup] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Listar usuários da empresa para convidar para o chat
  async listCompanyUsers(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      const { userId } = req.query; // ID do usuário logado para excluir da lista

      const users = await prisma.userCompany.findMany({
        where: {
          companyId: companyId,
          userId: {
            not: userId as string
          },
          user: {
            isDisabled: false
          }
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              profession: true
            }
          },
          office: {
            select: {
              name: true
            }
          }
        }
      });

      const usersWithUrls = await Promise.all(users.map(async (u) => {
        if (u.user.avatar) u.user.avatar = await getPresignedUrl(u.user.avatar);
        return u.user;
      }));

      return res.json(usersWithUrls);
    } catch (error: any) {
      console.error("[ChatController.listCompanyUsers] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Enviar mensagem
  async sendMessage(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const { senderId, text, companyId } = req.body;
      const file = req.file;

      // Validar se o chat pertence à empresa
      if (companyId) {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { companyId: true }
        });

        if (chat && chat.companyId !== companyId) {
          return res.status(403).json({ error: "Chat does not belong to the specified company" });
        }
      }

      let fileUrl = null;
      let fileName = null;
      let fileType = null;

      if (file) {
        fileName = file.originalname;
        fileType = file.mimetype;
        const uploadedName = await uploadFileToS3_2(file, "chat");
        fileUrl = uploadedName;
      }

      const message = await prisma.chatMessage.create({
        data: {
          chatId,
          senderId,
          text,
          fileUrl,
          fileName,
          fileType
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } }
        }
      });

      // Atualizar timestamp do chat
      await prisma.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date() }
      });

      // Buscar membros do chat (com push token) para emitir via socket e push
      const members = await prisma.chatMember.findMany({
        where: { chatId },
        include: {
          user: { select: { expoPushToken: true } }
        }
      });

      // Gerar URL assinada se houver arquivo
      const messageToSend = this.mapDeletedMessage({ ...message } as any);
      if (messageToSend.fileUrl) {
        messageToSend.fileUrl = await getPresignedUrl(messageToSend.fileUrl);
      }
      if (messageToSend.sender.avatar) {
        messageToSend.sender.avatar = await getPresignedUrl(messageToSend.sender.avatar);
      }
      (messageToSend as any).seenByOthers = false;
      (messageToSend as any).seenByCount = 0;

      // Emitir via socket para todos os membros
      members.forEach(member => {
        SocketService.emitToUser(member.userId, 'new_chat_message', messageToSend);
      });

      // Enviar push notification para membros (exceto o remetente)
      const pushTokens = members
        .filter(m => m.userId !== senderId && m.user?.expoPushToken)
        .map(m => m.user!.expoPushToken!);

      if (pushTokens.length > 0) {
        const senderName = message.sender.name || "New message";
        const messageBody = this.getPushMessageBody(text, fileUrl, fileType, fileName);
        PushNotificationService.sendChatMessagePush(
          pushTokens,
          senderName,
          messageBody,
          chatId
        ).catch(() => { }); // Fire-and-forget, não bloqueia a resposta
      }

      return res.status(201).json(messageToSend);
    } catch (error: any) {
      console.error("[ChatController.sendMessage] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Listar mensagens de um chat
  async listMessages(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const { limit = "50", offset = "0", companyId } = req.query;
      const userId = (req as any).userId as string | undefined;

      // Validar se o chat pertence à empresa
      if (companyId) {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { companyId: true }
        });

        if (chat && chat.companyId !== companyId) {
          return res.status(403).json({ error: "Chat does not belong to the specified company" });
        }
      }

      const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        include: {
          sender: { select: { id: true, name: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      // Marca o chat como lido para o usuário autenticado e notifica os demais.
      let readAt: Date | null = null;
      if (userId) {
        readAt = new Date();
        const updateResult = await prisma.chatMember.updateMany({
          where: { chatId, userId },
          data: { lastReadAt: readAt },
        });

        if (updateResult.count > 0) {
          const members = await prisma.chatMember.findMany({
            where: { chatId },
            select: { userId: true },
          });

          members
            .filter((member) => member.userId !== userId)
            .forEach((member) => {
              SocketService.emitToUser(member.userId, "chat_messages_seen", {
                chatId,
                readerId: userId,
                lastReadAt: readAt!.toISOString(),
              });
            });
        }
      }

      const chatMembers = await prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true, lastReadAt: true },
      });

      const messagesWithUrls = await Promise.all(messages.map(async (msg) => {
        const hydratedMessage = this.mapDeletedMessage({ ...msg });
        if (hydratedMessage.fileUrl) hydratedMessage.fileUrl = await getPresignedUrl(hydratedMessage.fileUrl);
        if (msg.sender.avatar) msg.sender.avatar = await getPresignedUrl(msg.sender.avatar);
        const seenByCount = chatMembers.filter(
          (member) =>
            member.userId !== msg.senderId &&
            member.lastReadAt &&
            member.lastReadAt >= msg.createdAt
        ).length;

        return {
          ...hydratedMessage,
          seenByCount,
          seenByOthers: seenByCount > 0,
        };
      }));

      return res.json(messagesWithUrls.reverse());
    } catch (error: any) {
      console.error("[ChatController.listMessages] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async archiveChat(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const userId = (req as any).userId as string | undefined;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const updated = await prisma.chatMember.updateMany({
        where: { chatId, userId },
        data: { archivedAt: new Date() },
      });

      if (!updated.count) return res.status(404).json({ error: "Chat membership not found" });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[ChatController.archiveChat] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async unarchiveChat(req: Request, res: Response) {
    try {
      const { chatId } = req.params;
      const userId = (req as any).userId as string | undefined;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const updated = await prisma.chatMember.updateMany({
        where: { chatId, userId },
        data: { archivedAt: null },
      });

      if (!updated.count) return res.status(404).json({ error: "Chat membership not found" });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[ChatController.unarchiveChat] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async deleteMessage(req: Request, res: Response) {
    try {
      const { chatId, messageId } = req.params;
      const userId = (req as any).userId as string | undefined;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
        },
      });

      if (!message || message.chatId !== chatId) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (message.senderId !== userId) {
        return res.status(403).json({ error: "You can only delete your own messages" });
      }

      const updatedMessage = await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
          text: this.deletedMessagePlaceholder,
          fileUrl: null,
          fileName: null,
          fileType: null,
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
        },
      });

      const chatMembers = await prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });

      const payload = this.mapDeletedMessage({
        ...updatedMessage,
        seenByCount: 0,
        seenByOthers: false,
      } as any);

      if (payload.sender.avatar) {
        payload.sender.avatar = await getPresignedUrl(payload.sender.avatar);
      }

      chatMembers.forEach((member) => {
        SocketService.emitToUser(member.userId, "chat_message_deleted", payload);
      });

      return res.json(payload);
    } catch (error: any) {
      console.error("[ChatController.deleteMessage] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
