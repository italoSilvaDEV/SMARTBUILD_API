import { Request, Response } from "express";
import { prisma } from "../../utils/prisma"; 

const PROTECTED_OFFICE_NAMES = ["worker", "seller", "administrator", "general manager", "master", "owner"];

export class OfficeController {
  async create(req: Request, res: Response) {
    try {
      const { name, permissions, companyId } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      // Nome único por companhia (case insensitive via collation ou filtro)
      const officesInCompany = await prisma.office.findMany({
        where: { company_id: companyId },
        select: { id: true, name: true },
      });
      const existingOffice = officesInCompany.find((o) => o.name.toLowerCase() === name.trim().toLowerCase());
      if (existingOffice) {
        return res.status(400).json({ error: "Office with this name already exists for this company" });
      }

      const office = await prisma.office.create({
        data: {
          name,
          company_id: companyId,
          ...(permissions && permissions.length > 0 && {
            userPermissions: {
              create: permissions.map((permissionId: string) => ({
                permission_id: permissionId,
                editAll: false,
              })),
            },
          }),
        },
        include: {
          userPermissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      return res.json(office);
    } catch (error) {
      console.error("Error creating office:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, permissions, companyId } = req.body;
      const companyIdFromQuery = req.query.companyId as string;
      const companyIdToUse = companyId || companyIdFromQuery;

      const office = await prisma.office.findFirst({
        where: companyIdToUse ? { id, company_id: companyIdToUse } : { id },
        include: { userPermissions: true },
      });

      if (!office) {
        return res.status(404).json({ error: "Office not found" });
      }

      const isProtected = PROTECTED_OFFICE_NAMES.includes(office.name.toLowerCase());

      // Offices protegidos: só permitir alterar permissões (não o nome)
      const nameToApply = isProtected ? undefined : name;

      // Verificar se o novo nome já existe na mesma companhia (se estiver mudando e não for protegido)
      if (nameToApply && nameToApply !== office.name && office.company_id) {
        const othersInCompany = await prisma.office.findMany({
          where: { company_id: office.company_id, id: { not: id } },
          select: { name: true },
        });
        const existingByName = othersInCompany.some((o) => o.name.toLowerCase() === nameToApply.trim().toLowerCase());
        if (existingByName) {
          return res.status(400).json({ error: "Office with this name already exists for this company" });
        }
      }

      // Atualizar office e userPermissions (protegidos: só userPermissions)
      const updatedOffice = await prisma.office.update({
        where: { id },
        data: {
          ...(nameToApply && { name: nameToApply }),
          userPermissions: {
            deleteMany: {},
            ...(permissions && permissions.length > 0 && {
              create: permissions.map((permissionId: string) => ({
                permission_id: permissionId,
                editAll: false,
              })),
            }),
          },
        },
        include: {
          userPermissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      return res.json(updatedOffice);
    } catch (error) {
      console.error("Error updating office:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = (req.query.companyId as string) || (req.body?.companyId as string);

      const office = await prisma.office.findFirst({
        where: companyId ? { id, company_id: companyId } : { id },
      });

      if (!office) {
        return res.status(404).json({ error: "Office not found" });
      }

      // Não permitir excluir: Worker, Administrator, Owner, Master, General Manager (Seller pode)
      const cannotDelete = ["worker", "administrator", "owner", "master", "general manager"];
      if (cannotDelete.includes(office.name.toLowerCase())) {
        return res.status(403).json({
          error: `Cannot delete office with name: ${office.name}`,
        });
      }

      // Verificar se há usuários nesta empresa usando este office (UserCompany, não User)
      const usersCount = companyId
        ? await prisma.userCompany.count({
            where: { office_id: id, companyId },
          })
        : await prisma.user.count({
            where: { office_id: id },
          });

      if (usersCount > 0) {
        return res.status(400).json({ 
          error: `Cannot delete office. There are ${usersCount} user(s) using this office.` 
        });
      }

      await prisma.office.delete({
        where: { id },
      });

      return res.json({ message: "Office deleted successfully" });
    } catch (error) {
      console.error("Error deleting office:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const companyId = (req.query.companyId as string) || (req.body?.companyId as string);
      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required (query: companyId)" });
      }

      const offices = await prisma.office.findMany({
        where: {
          company_id: companyId,
          name: { notIn: ["Master", "Owner"] },
        },
        include: {
          userPermissions: {
            include: {
              permission: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      // Contagem de usuários por office nesta empresa: UserCompany (não User.office_id)
      const userCountByOffice = await prisma.userCompany.groupBy({
        by: ["office_id"],
        where: { companyId },
        _count: { userId: true },
      });
      const countMap = new Map(userCountByOffice.map((c) => [c.office_id, c._count.userId]));

      const officesWithCount = offices.map((office) => ({
        ...office,
        _count: {
          User: countMap.get(office.id) ?? 0,
        },
      }));

      return res.json(officesWithCount);
    } catch (error) {
      console.error("Error listing offices:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.query.companyId as string;
      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required (query: companyId)" });
      }

      const office = await prisma.office.findFirst({
        where: { id, company_id: companyId },
        include: {
          userPermissions: {
            include: {
              permission: true,
            },
          },
          _count: {
            select: {
              User: true,
            },
          },
        },
      });

      if (!office) {
        return res.status(404).json({ error: "Office not found" });
      }

      // Não retornar office Master
      if (office.name === "Master") {
        return res.status(404).json({ error: "Office not found" });
      }

      return res.json(office);
    } catch (error) {
      console.error("Error getting office:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getPermissionsByCompany(req: Request, res: Response) {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      // Buscar a company com o plano ativo
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          Plan: {
            include: {
              permissionGroup: {
                include: {
                  GroupPermissionsList: {
                    include: {
                      Permissions: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (!company.Plan) {
        return res.status(404).json({ error: "Company does not have an active plan" });
      }

      // Extrair as permissões do plano
      const permissions = company.Plan.permissionGroup.GroupPermissionsList.map(
        (gpl) => gpl.Permissions
      );

      // Remover duplicatas (caso existam)
      const uniquePermissions = Array.from(
        new Map(permissions.map((p) => [p.id, p])).values()
      );

      return res.json(uniquePermissions);
    } catch (error) {
      console.error("Error getting permissions by company:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
