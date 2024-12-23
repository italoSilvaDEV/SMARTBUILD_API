import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { Prisma } from "@prisma/client";

export class UserServiceProjectController {
  // Criar um novo UserServiceProject

  async create(req: Request, res: Response) {
    try {
      const { user_ids, service_project_id, assigned_at } = req.body;

      // Verifica se o projeto existe
      const serviceProjectExists = await prisma.serviceProject.findUnique({
        where: { id: service_project_id },
      });

      if (!serviceProjectExists) {
        return res.status(400).json({ error: "Service project not found." });
      }

      // Verifica se todos os usuários existem
      const usersExist = await prisma.user.findMany({
        where: { id: { in: user_ids } },
        select: { id: true },
      });

      const existingUserIds = usersExist.map((user) => user.id);

      const invalidUserIds = user_ids.filter(
        (id: string) => !existingUserIds.includes(id)
      );

      if (invalidUserIds.length > 0) {
        return res.status(400).json({
          error: "Some users were not found.",
          invalidUserIds,
        });
      }

      // Obtém relações já existentes
      const existingRelations = await prisma.userServiceProject.findMany({
        where: {
          service_project_id,
          user_id: { in: user_ids },
        },
        select: { user_id: true },
      });

      const associatedUserIds = existingRelations.map(
        (relation) => relation.user_id
      );

      // Busca usuários que não possuem dados relacionados em outras tabelas
      const removableRelations = await prisma.userServiceProject.findMany({
        where: {
          service_project_id,
          user_id: { notIn: user_ids },
        },
        select: {
          id: true,
          user_id: true,
        },
      });

      const removableUserIds = [];

      for (const relation of removableRelations) {
        const hasDependencies = await prisma.userAttendance.findFirst({
          where: { user_service_project_id: relation.id },
        });

        if (!hasDependencies) {
          removableUserIds.push(relation.user_id);
        }
      }

      // Remove apenas usuários sem dependências
      if (removableUserIds.length > 0) {
        await prisma.userServiceProject.deleteMany({
          where: {
            service_project_id,
            user_id: { in: removableUserIds },
          },
        });
      }

      // Filtra IDs que não estão associados
      const newUserIds = user_ids.filter(
        (id: string) => !associatedUserIds.includes(id)
      );

      // Cria novas relações
      const newRelations = await prisma.userServiceProject.createMany({
        data: newUserIds.map((user_id: string) => ({
          user_id,
          service_project_id,
          assigned_at: assigned_at || new Date(),
        })),
      });

      res.status(201).json({
        message: `${newRelations.count} users successfully added to the project.`,
        addedUserIds: newUserIds,
        removedUserIds: removableUserIds,
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: "Error while creating relationships.",
        details: error.message || "Unknown error",
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do ServiceProject
      // Obter todos os usuários da empresa (employees)
      const employees = await prisma.user.findMany({
        where: {
          office: {
            OR: [
              {
                name: "Employee"
              },
              {
                name: "Worker"
              }
            ]
          }
        },
        select: {
          id: true,
          avatar: true,
          name: true,
          office: true,
          
          UserServiceProject: {
            select: {
              service_project: {
                select: {
                  id: true,
                  name: true,
                  start_date: true,
                  deadline: true,
                },
              },
            },
          },
        },
      });

      // Formatar o resultado
      const result = employees.map((employee) => {
        const isLinked = employee.UserServiceProject.some(
          (usp) => usp.service_project?.id === id
        );

        return {
          id: employee.id,
          avatar: employee.avatar,
          name: employee.name,
          isLinked, // Retorna true se o usuário estiver vinculado ao serviço
          office: employee.office.name,
          services: employee.UserServiceProject.map((usp) => ({
            id: usp.service_project?.id,
            name: usp.service_project?.name,
            start_date: usp.service_project?.start_date,
            deadline: usp.service_project?.deadline,
          })),
        };
      });

      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Mistake when looking for employees and their services",
      });
    }
  }

  async getByUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const userServiceProject = await prisma.userServiceProject.findMany({
        where: { user_id: { equals: id } },
        include: {
          service_project: true,
        },
      });

      res.status(200).json(userServiceProject);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error when searching for services" });
    }
  }
}
