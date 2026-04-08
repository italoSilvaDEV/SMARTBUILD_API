import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class TaskDispatchController {
  private async enrichTasksWithSignedUrls<T extends {
    files: Array<{ url: string } & Record<string, any>>;
    assignedUser?: { avatar?: string | null } | null;
    _count?: { comments?: number } | null;
  }>(tasks: T[]) {
    return Promise.all(tasks.map(async (task) => {
      const filesWithUrls = await Promise.all(
        task.files.map(async (file) => ({
          ...file,
          url: await getPresignedUrl(file.url),
        }))
      );

      let avatarUrl = null;
      if (task.assignedUser?.avatar) {
        avatarUrl = await getPresignedUrl(task.assignedUser.avatar);
      }

      return {
        ...task,
        files: filesWithUrls,
        commentCount: task._count?.comments || 0,
        assignedUser: task.assignedUser
          ? {
            ...task.assignedUser,
            avatar: avatarUrl,
          }
          : null,
      };
    }));
  }

  async listByCompany(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      const { search, status, projectId, page = "1", perPage = "100" } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const pageNumber = Math.max(1, Number(page) || 1);
      const perPageNumber = Math.min(200, Math.max(1, Number(perPage) || 100));
      const skip = (pageNumber - 1) * perPageNumber;
      const normalizedSearch = typeof search === "string" ? search.trim() : "";
      const contractNumberFromSearch = Number(normalizedSearch);
      const shouldFilterByContractNumber = normalizedSearch !== "" && !Number.isNaN(contractNumberFromSearch);

      const where: any = {
        project: {
          company_id: companyId,
        },
      };

      if (projectId && typeof projectId === "string") {
        where.projectId = projectId;
      }

      if (status && typeof status === "string") {
        where.status = status;
      }

      if (normalizedSearch) {
        where.OR = [
          { title: { contains: normalizedSearch } },
          { description: { contains: normalizedSearch } },
          { project: { location: { contains: normalizedSearch } } },
          ...(shouldFilterByContractNumber
            ? [{ project: { contract_number: contractNumberFromSearch } }]
            : []),
        ];
      }

      const [total, tasks] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          include: {
            assignedUser: {
              select: { id: true, name: true, avatar: true },
            },
            files: true,
            serviceProject: {
              select: { id: true, name: true },
            },
            project: {
              select: { id: true, contract_number: true, location: true },
            },
            _count: {
              select: { comments: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: perPageNumber,
        }),
      ]);

      const tasksWithUrls = await this.enrichTasksWithSignedUrls(tasks as any);

      return res.json({
        data: tasksWithUrls,
        meta: {
          page: pageNumber,
          perPage: perPageNumber,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPageNumber)),
        },
      });
    } catch (error: any) {
      console.error("[TaskDispatchController.listByCompany] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

      if (!prisma || !prisma.task) {
        throw new Error("Prisma client or Task model is not initialized");
      }

      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          assignedUser: {
            select: { id: true, name: true, avatar: true },
          },
          creator: {
            select: { id: true, name: true },
          },
          files: true,
          serviceProject: {
            select: { id: true, name: true },
          },
          project: {
            select: { id: true, contract_number: true, location: true },
          },
          _count: {
            select: { comments: true },
          },
        },
      });

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const [taskWithUrls] = await this.enrichTasksWithSignedUrls([task as any]);
      return res.json(taskWithUrls);
    } catch (error: any) {
      console.error("[TaskDispatchController.getById] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}
