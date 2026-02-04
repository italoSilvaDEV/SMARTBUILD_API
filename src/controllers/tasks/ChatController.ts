import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

export class ChatController {
  // Listar conversas do usuário
  async listChats(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { companyId } = req.query;

      const chatMemberships = await prisma.chatMember.findMany({
        where: { 
          userId,
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
          lastMessage: chat.messages[0] || null,
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

      const users = await prisma.user.findMany({
        where: {
          company_id: companyId,
          id: { not: userId as string },
          isDisabled: false
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          profession: true,
          office: { select: { name: true } }
        }
      });

      const usersWithUrls = await Promise.all(users.map(async (u) => {
        if (u.avatar) u.avatar = await getPresignedUrl(u.avatar);
        return u;
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

      // Buscar membros do chat para emitir via socket
      const members = await prisma.chatMember.findMany({
        where: { chatId }
      });

      // Gerar URL assinada se houver arquivo
      const messageToSend = { ...message };
      if (messageToSend.fileUrl) {
        messageToSend.fileUrl = await getPresignedUrl(messageToSend.fileUrl);
      }
      if (messageToSend.sender.avatar) {
        messageToSend.sender.avatar = await getPresignedUrl(messageToSend.sender.avatar);
      }

      members.forEach(member => {
        SocketService.emitToUser(member.userId, 'new_chat_message', messageToSend);
      });

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

      const messagesWithUrls = await Promise.all(messages.map(async (msg) => {
        if (msg.fileUrl) msg.fileUrl = await getPresignedUrl(msg.fileUrl);
        if (msg.sender.avatar) msg.sender.avatar = await getPresignedUrl(msg.sender.avatar);
        return msg;
      }));

      return res.json(messagesWithUrls.reverse());
    } catch (error: any) {
      console.error("[ChatController.listMessages] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
