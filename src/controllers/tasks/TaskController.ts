import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { SocketService } from "../../services/SocketService";

export class TaskController {
  private async createTaskNotification(
    type: string,
    message: string,
    taskId: string,
    userId: string,
    actorId?: string
  ) {
    if (!prisma || !prisma.taskNotification) return;
    try {
      const notification = await prisma.taskNotification.create({
        data: { type, message, taskId, userId, actorId: actorId || null }
      });

      // Emitir via Socket.io
      SocketService.emitToUser(userId, 'new_notification', notification);
    } catch (error) {
      console.error("[TaskController.createTaskNotification] Error:", error);
    }
  }

  // Criar uma nova task
  async create(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        priority,
        dueDate,
        projectId,
        serviceProjectId,
        creatorId,
        assignedUserId,
      } = req.body;

      if (!title || !projectId || !creatorId) {
        return res.status(400).json({ error: "Title, projectId and creatorId are required" });
      }

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          priority: priority || "MEDIUM",
          dueDate: dueDate ? new Date(dueDate) : null,
          projectId,
          serviceProjectId,
          creatorId,
          assignedUserId,
        },
        include: {
          assignedUser: {
            select: { id: true, name: true, avatar: true }
          },
          creator: {
            select: { id: true, name: true }
          }
        }
      });

      if (assignedUserId) {
        await this.createTaskNotification(
          "assigned",
          `${task.creator.name || "Someone"} assigned the task "${title}" to you`,
          task.id,
          assignedUserId,
          creatorId
        );
      }

      return res.status(201).json(task);
    } catch (error: any) {
      console.error("[TaskController.create] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Listar tasks de um projeto
  async listByProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const tasks = await prisma.task.findMany({
        where: { projectId },
        include: {
          assignedUser: {
            select: { id: true, name: true, avatar: true }
          },
          files: true,
          serviceProject: {
            select: { id: true, name: true }
          },
          _count: {
            select: { comments: true }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      // Gerar URLs assinadas para os arquivos e avatares
      const tasksWithUrls = await Promise.all(tasks.map(async (task) => {
        const filesWithUrls = await Promise.all(task.files.map(async (file) => ({
          ...file,
          url: await getPresignedUrl(file.url)
        })));

        let avatarUrl = null;
        if (task.assignedUser?.avatar) {
          avatarUrl = await getPresignedUrl(task.assignedUser.avatar);
        }

        return {
          ...task,
          files: filesWithUrls,
          commentCount: task._count?.comments || 0,
          assignedUser: task.assignedUser ? {
            ...task.assignedUser,
            avatar: avatarUrl
          } : null
        };
      }));

      return res.json(tasksWithUrls);
    } catch (error: any) {
      console.error("[TaskController.listByProject] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Listar tasks atribuídas a um usuário
  async listByUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { status } = req.query;

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const tasks = await prisma.task.findMany({
        where: { 
          assignedUserId: userId,
          ...(status ? { status: status as any } : {})
        },
        include: {
          project: {
            select: { id: true, contract_number: true, location: true }
          },
          files: true,
          _count: {
            select: { comments: true }
          }
        },
        orderBy: { priority: "desc" }
      });

      const tasksWithUrls = await Promise.all(tasks.map(async (task: any) => {
        const filesWithUrls = await Promise.all(task.files.map(async (file: any) => ({
          ...file,
          url: await getPresignedUrl(file.url)
        })));

        return { 
          ...task, 
          files: filesWithUrls,
          commentCount: task._count?.comments || 0
        };
      }));

      return res.json(tasksWithUrls);
    } catch (error: any) {
      console.error("[TaskController.listByUser] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Atualizar uma task
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        status,
        priority,
        dueDate,
        assignedUserId,
        serviceProjectId
      } = req.body;

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const currentTask = await prisma.task.findUnique({
        where: { id },
        include: { creator: { select: { id: true, name: true } } }
      });

      if (!currentTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          title,
          description,
          status,
          priority,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          assignedUserId,
          serviceProjectId
        },
        include: {
          assignedUser: {
            select: { id: true, name: true, avatar: true }
          }
        }
      });

      // Notificações em inglês
      if (assignedUserId && assignedUserId !== currentTask.assignedUserId) {
        await this.createTaskNotification(
          "assigned",
          `${currentTask.creator.name || "Someone"} assigned the task "${task.title}" to you`,
          task.id,
          assignedUserId,
          currentTask.creatorId
        );
      }

      if (status && status !== currentTask.status) {
        const targetUserId = assignedUserId || currentTask.assignedUserId;
        if (targetUserId) {
          await this.createTaskNotification(
            "status_change",
            `The status of task "${task.title}" was changed to ${status.toLowerCase().replace("_", " ")}`,
            task.id,
            targetUserId,
            currentTask.creatorId
          );
        }
      }

      if (priority && priority !== currentTask.priority) {
        const targetUserId = assignedUserId || currentTask.assignedUserId;
        if (targetUserId) {
          await this.createTaskNotification(
            "priority_change",
            `The priority of task "${task.title}" was changed to ${priority.toLowerCase()}`,
            task.id,
            targetUserId,
            currentTask.creatorId
          );
        }
      }

      return res.json(task);
    } catch (error: any) {
      console.error("[TaskController.update] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Deletar uma task
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      await prisma.task.delete({ where: { id } });
      return res.status(204).send();
    } catch (error: any) {
      console.error("[TaskController.delete] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Upload de arquivo para uma task
  async uploadFile(req: Request, res: Response) {
    try {
      const { taskId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!prisma || !prisma.taskFile) {
        throw new Error("Prisma client or TaskFile model is not initialized");
      }

      const fileName = await uploadFileToS3_2(file, "system");

      const taskFile = await prisma.taskFile.create({
        data: {
          name: file.originalname,
          url: fileName,
          type: file.mimetype,
          size: file.size,
          taskId
        }
      });

      const signedUrl = await getPresignedUrl(fileName);

      return res.status(201).json({ ...taskFile, url: signedUrl });
    } catch (error: any) {
      console.error("[TaskController.uploadFile] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Deletar arquivo de uma task
  async deleteFile(req: Request, res: Response) {
    try {
      const { fileId } = req.params;

      if (!prisma || !prisma.taskFile) {
        throw new Error("Prisma client or TaskFile model is not initialized");
      }

      // Nota: Idealmente deletar do S3 também, mas seguindo o padrão do projeto de manter no S3 por enquanto
      await prisma.taskFile.delete({ where: { id: fileId } });
      return res.status(204).send();
    } catch (error: any) {
      console.error("[TaskController.deleteFile] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}
