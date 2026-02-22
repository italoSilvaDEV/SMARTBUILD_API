import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetAllProjectServicesController {
  async handle(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // "services" = SubContractorServiceProject vinculados a ServiceProject do projeto (não ServiceProject direto)
      const subcontractorServiceProjects = await prisma.subContractorServiceProject.findMany({
        where: {
          service_project_id: { not: null },
          service_project: { projectId },
        },
        select: {
          id: true,
          service_project: {
            select: {
              id: true,
              name: true,
              start_date: true,
              deadline: true,
            },
          },
        },
      });

      const subServicesViaService = await prisma.subServicesProject.findMany({
        where: {
          serviceProject: { projectId },
        },
        select: {
          id: true,
          name: true,
          start_date: true,
          deadline: true,
          serviceProject: { select: { id: true, name: true } },
          custom_service_schedule: { select: { id: true, name: true } },
        },
      });

      const subServicesViaCustom = await prisma.subServicesProject.findMany({
        where: {
          custom_service_schedule: { projectId },
        },
        select: {
          id: true,
          name: true,
          start_date: true,
          deadline: true,
          serviceProject: { select: { id: true, name: true } },
          custom_service_schedule: { select: { id: true, name: true } },
        },
      });

      const allSubServiceIds = new Set<string>();
      const allSubServices = [...subServicesViaService, ...subServicesViaCustom].filter((s) => {
        if (allSubServiceIds.has(s.id)) return false;
        allSubServiceIds.add(s.id);
        return true;
      });

      const customServices = await prisma.customServiceSchedule.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          start_date: true,
          deadline: true,
        },
      });

      const services = subcontractorServiceProjects
        .filter((s) => s.service_project)
        .map((s) => ({
          id: s.id,
          name: s.service_project!.name,
          type: "service" as const,
          start_date: s.service_project!.start_date,
          deadline: s.service_project!.deadline,
        }));

      const subServices = allSubServices.map((s) => ({
        id: s.id,
        name: s.name,
        type: "subservice" as const,
        parentName: s.serviceProject?.name ?? s.custom_service_schedule?.name ?? null,
        start_date: s.start_date,
        deadline: s.deadline,
      }));

      const customServicesMapped = customServices.map((s) => ({
        id: s.id,
        name: s.name,
        type: "custom" as const,
        start_date: s.start_date,
        deadline: s.deadline,
      }));

      return res.status(200).json({
        services,
        subServices,
        customServices: customServicesMapped,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}
