import { Request, Response } from "express";
import { prisma } from "../../utils/prisma"; 

const PROTECTED_OFFICE_NAMES = ["worker", "seller", "administrator", "general manager", "master"];

export class OfficeController {
  async create(req: Request, res: Response) {
    try {
      const { name, permissions } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      // Verificar se já existe um office com esse nome (case insensitive)
      const allOffices = await prisma.office.findMany({
        select: { id: true, name: true },
      });
      const existingOffice = allOffices.find(
        (office) => office.name.toLowerCase() === name.toLowerCase()
      );

      if (existingOffice) {
        return res.status(400).json({ error: "Office with this name already exists" });
      }

      // Criar office
      const office = await prisma.office.create({
        data: {
          name,
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
      const { name, permissions } = req.body;

      // Verificar se o office existe
      const office = await prisma.office.findUnique({
        where: { id },
        include: { userPermissions: true },
      });

      if (!office) {
        return res.status(404).json({ error: "Office not found" });
      }

      // Verificar se é um office protegido
      if (PROTECTED_OFFICE_NAMES.includes(office.name.toLowerCase())) {
        return res.status(403).json({ 
          error: `Cannot edit office with name: ${office.name}` 
        });
      }

      // Verificar se o novo nome já existe (se estiver mudando)
      if (name && name !== office.name) {
        const allOffices = await prisma.office.findMany({
          where: { id: { not: id } },
          select: { id: true, name: true },
        });
        const existingOffice = allOffices.find(
          (o) => o.name.toLowerCase() === name.toLowerCase()
        );

        if (existingOffice) {
          return res.status(400).json({ error: "Office with this name already exists" });
        }
      }

      // Atualizar office e userPermissions
      const updatedOffice = await prisma.office.update({
        where: { id },
        data: {
          ...(name && { name }),
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

      // Verificar se o office existe
      const office = await prisma.office.findUnique({
        where: { id },
      });

      if (!office) {
        return res.status(404).json({ error: "Office not found" });
      }

      // Verificar se é um office protegido
      if (PROTECTED_OFFICE_NAMES.includes(office.name.toLowerCase())) {
        return res.status(403).json({ 
          error: `Cannot delete office with name: ${office.name}` 
        });
      }

      // Verificar se há usuários usando este office
      const usersCount = await prisma.user.count({
        where: { office_id: id },
      });

      if (usersCount > 0) {
        return res.status(400).json({ 
          error: `Cannot delete office. There are ${usersCount} user(s) using this office.` 
        });
      }

      // Deletar office (userPermissions será deletado em cascade)
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
      const offices = await prisma.office.findMany({
        where: {
          name: {
            not: "Master"
          }
        },
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
        orderBy: {
          name: "asc",
        },
      });

      return res.json(offices);
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

      const office = await prisma.office.findUnique({
        where: { id },
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
