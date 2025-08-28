import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { Prisma } from "@prisma/client";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { isMultiCompanyEnabled } from "../../helpers/featureToggle";

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
      if (serviceProjectExists.status == null) {
        await prisma.serviceProject.update({
          where: { id: service_project_id },
          data: {
            status: 'Scheduled'
          }
        });
      }
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
      const { id, id_company } = req.params; // ID do ServiceProject
      const isMultiCompany = await isMultiCompanyEnabled()
      // Obter todos os usuários da empresa (employees)
      const employees = await prisma.user.findMany({
        where: {
          AND: [
            {
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
            isMultiCompany ? {
              companies: {
                some: {
                  companyId: {
                    equals: id_company
                  }
                }
              }
            } : {
              company_id: {
                equals: id_company
              }
            }
          ]
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

  async getByUserWithSearch(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do usuário
      const { search } = req.body; // Termo de busca

      // Consulta otimizada que filtra projetos cancelados e evita duplicações
      const userServiceProjects = await prisma.userServiceProject.findMany({
        where: {
          user_id: id,
          service_project: {
            name: search ? { contains: search.toLowerCase() } : undefined,
            // Filtrar apenas serviços ativos ou sem status definido
            OR: [
              { status: { not: "Canceled" } },
              { status: null }
            ],
            Project: {
              // Filtrar apenas projetos não cancelados
              status_project: {
                notIn: ["Canceled", "Declined", "Rejected"]
              }
            }
          },
        },
        include: {
          service_project: {
            include: {
              Project: {
                include: {
                  client: true,
                },
              },
            },
          },
        },
        orderBy: {
          assigned_at: "desc"
        }
      });

      const formattedResult = userServiceProjects.map((usp) => ({
        id_userServiceProject: usp.id,
        name_service: usp.service_project.name,
        address_client: usp.service_project.Project?.location || usp.service_project.Project?.client?.location,
        selected: false,
        project_status: usp.service_project.Project?.status_project,
        service_status: usp.service_project.status
      }));

      res.status(200).json(formattedResult);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Error when searching for user service projects" });
    }
  }

  async getServicesWithDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { search } = req.body;

      const userServiceProjects = await prisma.userServiceProject.findMany({
        where: {
          user_id: id,
          service_project: {
            name: search ? { contains: search.toLowerCase() } : undefined,
          },
        },
        include: {
          service_project: {
            include: {
              stages: true,
              Project: {
                include: {
                  client: true,
                },
              },
              UserServiceProject: {
                include: {
                  user_attendances: true,
                },
              },
            },
          },
        },
      });

      const formattedResult = userServiceProjects.map((usp) => {
        const stages = usp.service_project.stages || [];
        const totalStages = stages.length;
        const completedStages = stages.filter((stage) => stage.check).length;

        const attendances = usp.service_project.UserServiceProject.flatMap(
          (usp) => usp.user_attendances || []
        );

        const workedHours = attendances.reduce((total, attendance) => {
          if (attendance.check_out_time && attendance.check_in_time) {
            const duration =
              new Date(attendance.check_out_time).getTime() -
              new Date(attendance.check_in_time).getTime();
            return total + duration / (1000 * 60 * 60); // Convertendo para horas
          }
          return total;
        }, 0);

        // Correção para tratar start_date e deadline como strings
        const startDate = usp.service_project.start_date
          ? new Date(`${usp.service_project.start_date}T00:00:00`)
          : null;
        const deadline = usp.service_project.deadline
          ? new Date(`${usp.service_project.deadline}T00:00:00`)
          : null;

        // Cálculo correto de daysLeft
        const daysLeft =
          startDate && deadline
            ? Math.ceil((deadline.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
            : null;

        return {
          id: usp.id,
          service_project_id: usp.service_project_id,
          name: usp.service_project.name,
          address: usp.service_project.Project?.client?.location || null,
          startDate: startDate ? startDate.toLocaleDateString("pt-BR") : null,
          daysLeft: daysLeft !== null ? `${daysLeft} dias` : null,
          workedHours: workedHours.toFixed(1), // Horas trabalhadas formatadas
          stages: `${completedStages}/${totalStages}`, // Etapas completas de total
          status: usp.service_project.status || null,
        };
      });

      res.status(200).json(formattedResult);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error when fetching service details" });
    }
  }

  async getServiceProjectDetailsGeral(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do ServiceProject

      const serviceProject = await prisma.serviceProject.findUnique({
        where: { id },
        include: {
          stages: true, // Etapas
          Project: {
            include: {
              client: true, // Cliente para obter o endereço
            },
          },
          UserServiceProject: {
            include: {
              user_attendances: true, // Presenças para calcular horas trabalhadas
            },
          },
          photos: true, // Fotos relacionadas ao projeto
          Activities: true, // Atividades relacionadas ao projeto
        },
      });

      if (!serviceProject) {
        return res.status(404).json({ error: "ServiceProject not found" });
      }

      // Cálculo de etapas
      const stages = serviceProject.stages || [];
      const totalStages = stages.length;
      const completedStages = stages.filter((stage) => stage.check).length;

      // Cálculo de horas trabalhadas
      const attendances = serviceProject.UserServiceProject.flatMap(
        (usp) => usp.user_attendances || []
      );

      const workedHours = attendances.reduce((total, attendance) => {
        if (attendance.check_out_time && attendance.check_in_time) {
          const duration = new Date(attendance.check_out_time).getTime() - new Date(attendance.check_in_time).getTime();
          return total + duration / (1000 * 60 * 60); // Convertendo para horas
        }
        return total;
      }, 0);

      // Cálculo de dias restantes
      const startDate = serviceProject.start_date
        ? new Date(serviceProject.start_date)
        : null;
      const deadline = serviceProject.deadline
        ? new Date(serviceProject.deadline)
        : null;

      const daysLeft = startDate && deadline
        ? Math.ceil((deadline.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Formatação do resultado
      const formattedResult = {
        description: serviceProject.description,
        status: serviceProject.status || null,
        address: serviceProject.Project?.client?.location || null,
        start_date: startDate?.toLocaleDateString("pt-BR") || null,
        daysLeft: daysLeft !== null ? `${daysLeft} dias` : null,
        workedHours: workedHours.toFixed(1),
        stages: `${completedStages}/${totalStages}`,
        photos: serviceProject.photos || [],
        activities: serviceProject.Activities || [],
      };

      res.status(200).json(formattedResult);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error when fetching ServiceProject details" });
    }
  }

  async getCostsByServiceProject(req: Request, res: Response) {
    const { serviceProjectId } = req.params;

    if (!serviceProjectId) {
      return res.status(400).json({ error: "ServiceProjectId is required." });
    }

    try {
      const costs = await prisma.costProject.findMany({
        where: {
          serviceProjectId,
        },
        include: {
          invoiceCostProject: true, // Inclui informações do arquivo relacionado, se houver
        },
      });

      const formattedCosts = await Promise.all(
        costs.map(async (cost) => {
          let presignedUrl = null;

          if (cost.invoiceCostProject?.uri) {
            presignedUrl = await getPresignedUrl(cost.invoiceCostProject.uri);
          }

          return {
            id: cost.id,
            title: cost.material_name,
            price: cost.price.toFixed(2),
            quantity: cost.amout,
            invoice: cost.invoiceCostProject
              ? {
                id: cost.invoiceCostProject.id,
                fileName: cost.invoiceCostProject.original_file_name,
                uri: presignedUrl,
              }
              : null,
          };
        })
      );

      return res.status(200).json(formattedCosts);
    } catch (error) {
      console.error("Error fetching costs:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  }

}
