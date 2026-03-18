import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

function getProjectLocation(project: any) {
  return project?.location || project?.client?.location || null;
}

function getProjectName(project: any) {
  return (
    project?.workContext?.Name ||
    project?.client?.name ||
    (project?.contract_number ? `#${project.contract_number}` : null) ||
    getProjectLocation(project) ||
    "Project"
  );
}

async function mapUserAssignees(items: any[] = []) {
  return Promise.all(
    items
      .filter((item) => item?.user?.id)
      .map(async (item) => ({
        id: item.user.id,
        type: "worker" as const,
        name: item.user.name,
        avatarUrl: item.user.avatar ? await getPresignedUrl(item.user.avatar) : null,
      }))
  );
}

function mapSubcontractorAssignees(items: any[] = []) {
  return items
    .filter((item) => item?.subcontractor?.id)
    .map((item) => ({
      id: item.subcontractor.id,
      type: "subcontractor" as const,
      name: item.subcontractor.name,
      avatarUrl: null,
    }));
}

function dedupeAssignees<T extends { id: string; type: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class GetDispatchJobsByCompanyController {
  async handle(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const [serviceProjects, customServices, subServices] = await Promise.all([
        prisma.serviceProject.findMany({
          where: {
            Project: { company_id: company.id },
            start_date: { not: null },
            deadline: { not: null },
          },
          include: {
            Project: {
              include: {
                workContext: true,
                client: true,
              },
            },
            UserServiceProject: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            subContractorServiceProjects: {
              include: {
                subcontractor: { select: { id: true, name: true } },
              },
            },
          },
        }) as Promise<any[]>,
        prisma.customServiceSchedule.findMany({
          where: {
            project: { company_id: company.id },
            start_date: { not: null },
            deadline: { not: null },
          },
          include: {
            project: {
              include: {
                workContext: true,
                client: true,
              },
            },
            userServiceProjects: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            subContractorServiceProjects: {
              include: {
                subcontractor: { select: { id: true, name: true } },
              },
            },
          },
        }) as Promise<any[]>,
        prisma.subServicesProject.findMany({
          where: {
            OR: [
              { serviceProject: { Project: { company_id: company.id } } },
              { custom_service_schedule: { project: { company_id: company.id } } },
            ],
            start_date: { not: null },
            deadline: { not: null },
          },
          include: {
            serviceProject: {
              include: {
                Project: {
                  include: {
                    workContext: true,
                    client: true,
                  },
                },
              },
            },
            custom_service_schedule: {
              include: {
                project: {
                  include: {
                    workContext: true,
                    client: true,
                  },
                },
              },
            },
            userServiceProject: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            subContractorServiceProjects: {
              include: {
                subcontractor: { select: { id: true, name: true } },
              },
            },
          },
        }) as Promise<any[]>,
      ]);

      const serviceJobs = await Promise.all(
        serviceProjects.map(async (service) => {
          const assignees = dedupeAssignees([
            ...(await mapUserAssignees((service.UserServiceProject || []).filter((item: any) => !item?.sub_service_project_id && !item?.custom_service_schedule_id))),
            ...mapSubcontractorAssignees((service.subContractorServiceProjects || []).filter((item: any) => !item?.sub_service_project_id && !item?.custom_service_schedule_id)),
          ]);

          return {
            id: service.id,
            jobType: "service",
            title: service.name,
            description: service.description,
            startDate: service.start_date,
            deadline: service.deadline,
            scheduleCompleted: Boolean(service.scheduleCompleted),
            projectId: service.Project?.id || null,
            projectName: getProjectName(service.Project),
            projectLocation: getProjectLocation(service.Project),
            contractNumber: service.Project?.contract_number || null,
            serviceProjectId: service.id,
            customServiceId: null,
            subServiceId: null,
            assignees,
          };
        })
      );

      const customJobs = await Promise.all(
        customServices.map(async (service) => {
          const assignees = dedupeAssignees([
            ...(await mapUserAssignees((service.userServiceProjects || []).filter((item: any) => !item?.sub_service_project_id && !item?.service_project_id))),
            ...mapSubcontractorAssignees((service.subContractorServiceProjects || []).filter((item: any) => !item?.sub_service_project_id && !item?.service_project_id)),
          ]);

          return {
            id: service.id,
            jobType: "customservice",
            title: service.name,
            description: service.description,
            startDate: service.start_date,
            deadline: service.deadline,
            scheduleCompleted: Boolean(service.scheduleCompleted),
            projectId: service.project?.id || null,
            projectName: getProjectName(service.project),
            projectLocation: getProjectLocation(service.project),
            contractNumber: service.project?.contract_number || null,
            serviceProjectId: null,
            customServiceId: service.id,
            subServiceId: null,
            assignees,
          };
        })
      );

      const subserviceJobs = await Promise.all(
        subServices.map(async (service) => {
          const project = service.serviceProject?.Project || service.custom_service_schedule?.project;
          const assignees = dedupeAssignees([
            ...(await mapUserAssignees(service.userServiceProject || [])),
            ...mapSubcontractorAssignees(service.subContractorServiceProjects || []),
          ]);

          return {
            id: service.id,
            jobType: "subservice",
            title: service.name,
            description: service.description,
            startDate: service.start_date,
            deadline: service.deadline,
            scheduleCompleted: Boolean(service.scheduleCompleted),
            projectId: project?.id || null,
            projectName: getProjectName(project),
            projectLocation: getProjectLocation(project),
            contractNumber: project?.contract_number || null,
            serviceProjectId: service.serviceProjectId || null,
            customServiceId: service.custom_service_schedule_id || null,
            subServiceId: service.id,
            assignees,
          };
        })
      );

      const data = [...serviceJobs, ...customJobs, ...subserviceJobs].sort((a, b) => {
        const aTime = new Date(a.startDate || 0).getTime();
        const bTime = new Date(b.startDate || 0).getTime();
        return aTime - bTime;
      });

      return res.status(200).json({
        message: "Dispatch jobs fetched successfully",
        data,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
