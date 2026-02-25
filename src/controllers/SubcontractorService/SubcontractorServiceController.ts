import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SubcontractorServiceController {
  async list(req: Request, res: Response) {
    try {
      const { company_id } = req.query;
      if (!company_id || typeof company_id !== "string") {
        return res.status(400).json({ error: "company_id is required" });
      }
      const list = await prisma.subcontractorService.findMany({
        where: { company_id },
        orderBy: { name: "asc" },
      });
      return res.json(list);
    } catch (error) {
      console.error("SubcontractorServiceController.list", error);
      return res.status(500).json({ error: "Failed to list subcontractor services" });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { name, description, company_id } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      if (!company_id) {
        return res.status(400).json({ error: "company_id is required" });
      }
      const existing = await prisma.subcontractorService.findFirst({
        where: {
          company_id,
          name: name.trim(),
        },
      });
      if (existing) {
        return res.status(409).json({ error: "A service with this name already exists." });
      }
      const created = await prisma.subcontractorService.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          company_id,
        },
      });
      return res.status(201).json(created);
    } catch (error) {
      console.error("SubcontractorServiceController.create", error);
      return res.status(500).json({ error: "Failed to create subcontractor service" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!id) return res.status(400).json({ error: "id is required" });
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      if (name !== undefined) {
        const current = await prisma.subcontractorService.findUnique({
          where: { id },
          select: { company_id: true },
        });
        if (current?.company_id) {
          const existing = await prisma.subcontractorService.findFirst({
            where: {
              company_id: current.company_id,
              id: { not: id },
              name: name.trim(),
            },
          });
          if (existing) {
            return res.status(409).json({ error: "A service with this name already exists." });
          }
        }
      }
      const updated = await prisma.subcontractorService.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
        },
      });
      return res.json(updated);
    } catch (error) {
      console.error("SubcontractorServiceController.update", error);
      return res.status(500).json({ error: "Failed to update subcontractor service" });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "id is required" });
      await prisma.subcontractorService.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error("SubcontractorServiceController.delete", error);
      return res.status(500).json({ error: "Failed to delete subcontractor service" });
    }
  }
}
