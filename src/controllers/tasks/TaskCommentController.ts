import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class TaskCommentController {
  // Criar um comentário em uma task
  async create(req: Request, res: Response) {
    try {
      const { taskId } = req.params;
      const { text, authorId } = req.body;

      if (!text || !authorId) {
        return res.status(400).json({ error: "Text and authorId are required" });
      }

      if (!prisma || !prisma.taskComment) {
        throw new Error("Prisma client or TaskComment model is not initialized");
      }

      // Verifica se a task existe
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignedUser: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      });

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Cria o comentário
      const comment = await prisma.taskComment.create({
        data: {
          text: text.trim(),
          taskId,
          authorId
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } }
        }
      });

      // Busca informações do autor para notificação
      const author = await prisma.user.findUnique({
        where: { id: authorId },
        select: { name: true }
      });

      // Cria notificações para usuários relevantes (em inglês)
      const notificationsToCreate = [];
      const notificationMessage = `${author?.name || "Someone"} commented on task "${task.title}"`;

      if (task.assignedUserId && task.assignedUserId !== authorId) {
        notificationsToCreate.push({
          type: "comment",
          message: notificationMessage,
          taskId,
          userId: task.assignedUserId,
          actorId: authorId
        });
      }

      if (task.creatorId && task.creatorId !== authorId && task.creatorId !== task.assignedUserId) {
        notificationsToCreate.push({
          type: "comment",
          message: notificationMessage,
          taskId,
          userId: task.creatorId,
          actorId: authorId
        });
      }

      if (notificationsToCreate.length > 0 && prisma.taskNotification) {
        await prisma.taskNotification.createMany({
          data: notificationsToCreate
        });
      }

      let avatarUrl = null;
      if (comment.author.avatar) {
        avatarUrl = await getPresignedUrl(comment.author.avatar);
      }

      return res.status(201).json({
        ...comment,
        author: { ...comment.author, avatar: avatarUrl }
      });
    } catch (error: any) {
      console.error("[TaskCommentController.create] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Listar comentários de uma task
  async listByTask(req: Request, res: Response) {
    try {
      const { taskId } = req.params;

      if (!prisma || !prisma.taskComment) {
        throw new Error("Prisma client or TaskComment model is not initialized");
      }

      const comments = await prisma.taskComment.findMany({
        where: { taskId },
        include: {
          author: { select: { id: true, name: true, avatar: true } }
        },
        orderBy: { createdAt: "asc" }
      });

      const commentsWithUrls = await Promise.all(
        comments.map(async (comment) => {
          let avatarUrl = null;
          if (comment.author.avatar) {
            avatarUrl = await getPresignedUrl(comment.author.avatar);
          }
          return {
            ...comment,
            author: { ...comment.author, avatar: avatarUrl }
          };
        })
      );

      return res.json(commentsWithUrls);
    } catch (error: any) {
      console.error("[TaskCommentController.listByTask] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Deletar um comentário
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!prisma || !prisma.taskComment) {
        throw new Error("Prisma client or TaskComment model is not initialized");
      }

      await prisma.taskComment.delete({ where: { id } });
      return res.status(204).send();
    } catch (error: any) {
      console.error("[TaskCommentController.delete] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}
