import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindWorkContextController {
  // GET: Get WorkContext by ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "Work context ID is required" });
      }

      const workContext = await prisma.workContext.findUnique({
        where: { id },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatar: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          projects: {
            select: {
              id: true,
              contract_number: true,
              status_project: true,
              price: true,
              start_date: true,
              deadline: true,
              location: true,
              lat: true,
              log: true,
              radius: true,
              date_creation: true,
            },
            orderBy: {
              date_creation: 'desc',
            },
          },
        },
      });

      if (!workContext) {
        return res.status(404).json({ error: "Work context not found" });
      }

      return res.json(workContext);
    } catch (error: any) {
      console.error("Error fetching WorkContext:", error);
      return res.status(500).json({ 
        error: "Error fetching work context" 
      });
    }
  }

  // GET: Get Client with all WorkContexts and associated Projects
  async getByClientId(req: Request, res: Response) {
    try {
      const { clientId } = req.params;

      if (!clientId) {
        return res.status(400).json({ error: "Client ID is required" });
      }

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          workContexts: {
            include: {
              projects: {
                select: {
                  id: true,
                  contract_number: true,
                  status_project: true,
                  price: true,
                  start_date: true,
                  deadline: true,
                  location: true,
                  lat: true,
                  log: true,
                  radius: true,
                  date_creation: true,
                  amountPaid: true,
                  balanceDue: true,
                },
                orderBy: {
                  date_creation: 'desc',
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Add statistics
      const totalProjects = client.workContexts.reduce(
        (acc, wc) => acc + wc.projects.length, 
        0
      );

      const totalAmount = client.workContexts.reduce(
        (acc, wc) => acc + wc.projects.reduce(
          (sum, p) => sum + Number(p.price), 
          0
        ), 
        0
      );

      const response = {
        ...client,
        statistics: {
          totalWorkContexts: client.workContexts.length,
          totalProjects: totalProjects,
          totalAmount: totalAmount,
        },
      };

      return res.json(response);
    } catch (error: any) {
      console.error("Error fetching client with WorkContexts:", error);
      return res.status(500).json({ 
        error: "Error fetching client data" 
      });
    }
  }

  // GET: Get all WorkContexts by company
  async getByCompanyId(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      const { isActive, type } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      const whereClause: any = {
        companyId: companyId,
      };

      if (isActive !== undefined) {
        whereClause.isActive = isActive === 'true';
      }

      if (type && (type === 'COMPANY' || type === 'PERSONAL')) {
        whereClause.type = type;
      }

      const workContexts = await prisma.workContext.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatar: true,
            },
          },
          projects: {
            select: {
              id: true,
              contract_number: true,
              status_project: true,
              price: true,
              date_creation: true,
            },
          },
          _count: {
            select: {
              projects: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        total: workContexts.length,
        workContexts: workContexts,
      });
    } catch (error: any) {
      console.error("Error fetching WorkContexts by company:", error);
      return res.status(500).json({ 
        error: "Error fetching work contexts" 
      });
    }
  }

  // POST: Search with advanced filters
  async search(req: Request, res: Response) {
    try {
      const { 
        companyId, 
        clientId, 
        type, 
        isActive, 
        hasProjects,
        search 
      } = req.body;

      const whereClause: any = {};

      if (companyId) whereClause.companyId = companyId;
      if (clientId) whereClause.clientId = clientId;
      if (type) whereClause.type = type;
      if (isActive !== undefined) whereClause.isActive = isActive;

      if (search) {
        whereClause.OR = [
          { Name: { contains: search, mode: 'insensitive' } },
          { Email: { contains: search, mode: 'insensitive' } },
          { label: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const workContexts = await prisma.workContext.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              projects: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Filter by hasProjects if needed
      let filteredContexts = workContexts;
      if (hasProjects !== undefined) {
        filteredContexts = workContexts.filter(wc => 
          hasProjects ? wc._count.projects > 0 : wc._count.projects === 0
        );
      }

      return res.json({
        total: filteredContexts.length,
        workContexts: filteredContexts,
      });
    } catch (error: any) {
      console.error("Error searching WorkContexts:", error);
      return res.status(500).json({ 
        error: "Error searching work contexts" 
      });
    }
  }

  // GET: List all WorkContexts with pagination
  async list(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [workContexts, total] = await Promise.all([
        prisma.workContext.findMany({
          skip,
          take: Number(limit),
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                projects: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        prisma.workContext.count(),
      ]);

      return res.json({
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
        workContexts,
      });
    } catch (error: any) {
      console.error("Error listing WorkContexts:", error);
      return res.status(500).json({ 
        error: "Error listing work contexts" 
      });
    }
  }
}

