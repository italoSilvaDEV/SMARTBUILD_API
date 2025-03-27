import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ChangeOrderController {
  async create(req: Request, res: Response) {
    try {
      const { projectId, description, terms, totalAmount, serviceProjects } = req.body;

      const changeOrder = await prisma.changeOrder.create({
        data: {
          description,
          terms,
          totalAmount,
          status: "pending",
          project: {
            connect: { id: projectId }
          },
          serviceProjects: {
            create: serviceProjects.map((sp: any) => ({
              quantity: sp.quantity,
              unitPrice: sp.unitPrice,
              lineTotal: sp.lineTotal,
              notes: sp.notes,
              serviceProject: {
                connect: { id: sp.serviceProjectId }
              }
            }))
          }
        },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          }
        }
      });

      return res.status(201).json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create change order" });
    }
  }

  async findByProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      const changeOrders = await prisma.changeOrder.findMany({
        where: {
          projectId
        },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          },
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          date_creation: 'desc'
        }
      });

      return res.json(changeOrders);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch change orders" });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          },
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          project: true
        }
      });

      if (!changeOrder) {
        return res.status(404).json({ error: "Change order not found" });
      }

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch change order" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, terms, totalAmount } = req.body;

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          description,
          terms,
          totalAmount,
          date_update: new Date()
        }
      });

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update change order" });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          status,
          date_update: new Date()
        }
      });

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update change order status" });
    }
  }

  async addSignature(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { clientSignature } = req.body;

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          clientSignature,
          status: "approved",
          date_update: new Date()
        }
      });

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add signature to change order" });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { cancellationReason } = req.body;
      const userId = req.user.id; // Assuming you have user info in the request from checkToken middleware

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          status: "rejected",
          canceledAt: new Date(),
          canceledById: userId,
          cancellationReason,
          date_update: new Date()
        }
      });

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to cancel change order" });
    }
  }

  async addService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { serviceProjectId, quantity, unitPrice, lineTotal, notes } = req.body;

      const changeOrderServiceProject = await prisma.changeOrderServiceProject.create({
        data: {
          changeOrder: {
            connect: { id }
          },
          serviceProject: {
            connect: { id: serviceProjectId }
          },
          quantity,
          unitPrice,
          lineTotal,
          notes
        }
      });

      // Update the total amount of the change order
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.status(201).json(changeOrderServiceProject);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add service to change order" });
    }
  }

  async removeService(req: Request, res: Response) {
    try {
      const { id, serviceProjectId } = req.params;

      // Find the record to delete
      const record = await prisma.changeOrderServiceProject.findFirst({
        where: {
          changeOrderId: id,
          serviceProjectId
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Delete the record
      await prisma.changeOrderServiceProject.delete({
        where: {
          id: record.id
        }
      });

      // Update the total amount of the change order
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      ) || 0;

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json({ message: "Service removed from change order" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to remove service from change order" });
    }
  }

  async updateService(req: Request, res: Response) {
    try {
      const { id, serviceProjectId } = req.params;
      const { quantity, unitPrice, lineTotal, notes } = req.body;

      // Find the record to update
      const record = await prisma.changeOrderServiceProject.findFirst({
        where: {
          changeOrderId: id,
          serviceProjectId
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Update the record
      const updatedRecord = await prisma.changeOrderServiceProject.update({
        where: {
          id: record.id
        },
        data: {
          quantity,
          unitPrice,
          lineTotal,
          notes,
          date_update: new Date()
        }
      });

      // Update the total amount of the change order
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json(updatedRecord);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update service in change order" });
    }
  }
} 