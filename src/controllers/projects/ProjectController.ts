import { deleteFile } from "../../config/file";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export interface INewProject {
  seller_user_id: string;
  price: number;
  status_project: string;
  type_category: string;
  client: IClientData;
}

export interface IClientData {
  name: string;
  email: string;
  phone: string;
  birth_date: string;
  document: string;
  location: string;
  lat: string;
  log: string;
}

export interface IServicesData {
  id_project: string;
  id_service: string;
  name: string;
  description: string;
  hours: number;
  price: number;
}

export class ProjectController {
  // async getAllProjects(req: Request, res: Response) {
  //     const { id_seller, status_project, page } = req.query;
  //     const query: any = {};

  //     if (id_seller) query.seller_user_id = { equals: id_seller };

  //     if (status_project) {
  //         const statusArray = typeof status_project === 'string' ? status_project.split(',') : [status_project];
  //         query.status_project = { in: statusArray };
  //     }

  //     try {
  //         const projects = await prisma.project.findMany({
  //             where: query,
  //             include: {
  //                 client: true,
  //                 serviceProject: true,
  //                 user: {
  //                     select: {
  //                         id: true,
  //                         avatar: true,
  //                         email: true,
  //                         name: true,
  //                     }
  //                 }
  //             },
  //             skip: Number(page) * 10,
  //             take: 10,
  //             orderBy: { date_update: 'desc' },
  //         });

  //         // Calcular o preço total para cada projeto
  //         const projectsWithPrice = projects.map(project => {
  //             const totalPrice = project.serviceProject.reduce((total, service) => {
  //                 return total + Number(service.hours) * Number(service.price);
  //             }, 0);

  //             return {
  //                 ...project,
  //                 price: totalPrice
  //             };
  //         });

  //         const total = await prisma.project.count({
  //             where: query,
  //         });

  //         return res.json({ projects: projectsWithPrice, total });
  //     } catch (error) {
  //         if (error instanceof Error) {
  //             return res.json({ error: error.message });
  //         }
  //         return res.json({ error: "Erro interno do servidor" });
  //     }
  // };

  async getAllProjects(req: Request, res: Response) {
    const { id_seller, status_project, page } = req.query;
    const query: any = {};

    if (id_seller) query.seller_user_id = { equals: id_seller };

    if (status_project) {
      const statusArray =
        typeof status_project === "string"
          ? status_project.split(",")
          : [status_project];
      query.status_project = { in: statusArray };
    }

    try {
      const projects = await prisma.project.findMany({
        where: query,
        include: {
          client: true,
          serviceProject: {
            include: {
              service: true,
              Project: true,
              photos: true,
            },
          },
          workedHours: true,
          user: {
            select: {
              id: true,
              avatar: true,
              email: true,
              name: true,
            },
          },
        },
        skip: Number(page) * 10,
        take: 10,
        orderBy: { date_update: "desc" },
      });

      const projectsWithCalculations = projects.map((project) => {
        const totalServicePrice = project.serviceProject.reduce(
          (total, service) => {
            return total + Number(service.price);
          },
          0
        );

        let totalCostOfServiceHours = 0;
        let totalNumberOfHoursWorked = 0;
        const uniqueUsers = new Set();

        project.workedHours.forEach((workedHour) => {
          totalCostOfServiceHours +=
            Number(workedHour.amount_of_hours) *
            Number(workedHour.hourly_price);
          totalNumberOfHoursWorked += Number(workedHour.amount_of_hours);
          uniqueUsers.add(workedHour.name_user);
        });

        const workersOnThisProject = uniqueUsers.size;

        const { workedHours, ...projectWithoutWorkedHours } = project;

        return {
          ...projectWithoutWorkedHours,
          totalServicePrice,
          cost_of_service_hours: totalCostOfServiceHours,
          total_number_of_hours_worked: totalNumberOfHoursWorked,
          workers_on_this_project: workersOnThisProject,
        };
      });

      const total = await prisma.project.count({
        where: query,
      });

      return res.json({ projects: projectsWithCalculations, total });
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async getProjectById(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          client: true,
          serviceProject: true,
          user: {
            select: {
              id: true,
              avatar: true,
              email: true,
              name: true,
            },
          },
        },
      });
      if (project) {
        res.json(project);
      } else {
        res.status(404).json({ error: "Project not found" });
      }
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async getServicesByProjectId(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const services = await prisma.serviceProject.findMany({
        where: { projectId: id },
      });
      if (services) {
        res.json(services);
      } else {
        res.status(404).json({ error: "Services not found for this project" });
      }
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async createProject(req: Request, res: Response) {
    const data: INewProject = req.body;
    try {
      const result = await prisma.client.create({
        data: {
          name: data.client.name,
          email: data.client.email,
          document: data.client.document,
          phone: data.client.phone,
          location: data.client.location,
          birth_date: data.client.birth_date,
          lat: data.client.lat,
          log: data.client.log,
        },
      });
      const project = await prisma.project.create({
        data: {
          seller_user_id: data.seller_user_id,
          price: data.price,
          status_project: "Budget",
          client_id: result.id,
        },
      });
      return res.status(201).json(project);
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async createServiceProject(req: Request, res: Response) {
    const data: IServicesData = req.body;

    try {
      const result = await prisma.serviceProject.create({
        data: {
          id_service: data.id_service,
          projectId: data.id_project,
          description: data.description,
          hours: data.hours,
          name: data.name,
          price: data.price,
        },
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async upLoadPhotoServiceProject(req: Request, res: Response) {
    const { serviceProjectId } = req.body;
    let file = "";
    file = "";
    deleteFile(`./public/tmp/service-project/${req.file?.filename}`);
    file = `${req.file?.filename.split(".")[0]}.webp`;

    await prisma.imgServiceProject.create({
      data: {
        uri: file,
        serviceProjectId,
      },
    });

    return res.json();
  }

  async updateProject(req: Request, res: Response) {
    const { id } = req.params;
    const { seller_user_id, price, status_project, client_id, autorId } =
      req.body;
    try {
      const project = await prisma.project.update({
        where: { id },
        data: {
          seller_user_id,
          price,
          status_project,
          client_id,
          autorId,
        },
      });
      return res.json(project);
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }

  async deleteProject(req: Request, res: Response) {
    const { id } = req.params;
    try {
      await prisma.project.delete({ where: { id } });
      return res.status(204).end();
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Erro interno do servidor" });
    }
  }
}
