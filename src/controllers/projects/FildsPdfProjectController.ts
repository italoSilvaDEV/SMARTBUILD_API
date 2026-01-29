import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FildsPdfProjectController {

  async create(req: Request, res: Response) {
    try {
      const { 
        sections, 
        description, 
        pdfProjectId, 
        estimateId, 
        invoiceId 
      } = req.body;

      // Validar se pelo menos sections foi fornecido
      if (!sections) {
        return res.status(400).json({ error: "Sections is required" });
      }

      // Validar se os relacionamentos existem (se fornecidos)
      if (pdfProjectId) {
        const pdfProject = await prisma.pdfProject.findUnique({
          where: { id: pdfProjectId }
        });
        if (!pdfProject) {
          return res.status(404).json({ error: "PDF Project not found" });
        }
      }

      if (estimateId) {
        const estimate = await prisma.estimate.findUnique({
          where: { id: estimateId }
        });
        if (!estimate) {
          return res.status(404).json({ error: "Estimate not found" });
        }
      }

      if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId }
        });
        if (!invoice) {
          return res.status(404).json({ error: "Invoice not found" });
        }
      }

      // Criar o registro
      const fildsPdfProject = await prisma.fildsPdfProject.create({
        data: {
          sections,
          description,
          pdfProjectId: pdfProjectId || null,
          estimateId: estimateId || null,
          invoiceId: invoiceId || null,
        },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        }
      });

      return res.status(201).json(fildsPdfProject);
    } catch (error) {
      return res.status(500).json({ error: "Failed to create fildsPdfProject" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { 
        sections, 
        description, 
        pdfProjectId, 
        estimateId, 
        invoiceId 
      } = req.body;

      // Verificar se o registro existe
      const existingRecord = await prisma.fildsPdfProject.findUnique({
        where: { id }
      });

      if (!existingRecord) {
        return res.status(404).json({ error: "FildsPdfProject not found" });
      }

      // Validar se os relacionamentos existem (se fornecidos)
      if (pdfProjectId) {
        const pdfProject = await prisma.pdfProject.findUnique({
          where: { id: pdfProjectId }
        });
        if (!pdfProject) {
          return res.status(404).json({ error: "PDF Project not found" });
        }
      }

      if (estimateId) {
        const estimate = await prisma.estimate.findUnique({
          where: { id: estimateId }
        });
        if (!estimate) {
          return res.status(404).json({ error: "Estimate not found" });
        }
      }

      if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId }
        });
        if (!invoice) {
          return res.status(404).json({ error: "Invoice not found" });
        }
      }

      // Atualizar o registro
      const updatedFildsPdfProject = await prisma.fildsPdfProject.update({
        where: { id },
        data: {
          ...(sections !== undefined && { sections }),
          ...(description !== undefined && { description }),
          ...(pdfProjectId !== undefined && { pdfProjectId: pdfProjectId || null }),
          ...(estimateId !== undefined && { estimateId: estimateId || null }),
          ...(invoiceId !== undefined && { invoiceId: invoiceId || null }),
        },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        }
      });

      return res.json(updatedFildsPdfProject);
    } catch (error) {
      return res.status(500).json({ error: "Failed to update fildsPdfProject" });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Verificar se o registro existe
      const existingRecord = await prisma.fildsPdfProject.findUnique({
        where: { id }
      });

      if (!existingRecord) {
        return res.status(404).json({ error: "FildsPdfProject not found" });
      }

      // Deletar o registro
      await prisma.fildsPdfProject.delete({
        where: { id }
      });

      return res.json({ message: "FildsPdfProject deleted successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete fildsPdfProject" });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const fildsPdfProject = await prisma.fildsPdfProject.findUnique({
        where: { id },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        }
      });

      if (!fildsPdfProject) {
        return res.status(404).json({ error: "FildsPdfProject not found" });
      }

      return res.json(fildsPdfProject);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch fildsPdfProject" });
    }
  }

  async findByPdfProject(req: Request, res: Response) {
    try {
      const { pdfProjectId } = req.params;

      const fildsPdfProjects = await prisma.fildsPdfProject.findMany({
        where: { pdfProjectId },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        },
        orderBy: {
          date_creation: 'asc'
        }
      });

      return res.json(fildsPdfProjects);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch fildsPdfProjects by PDF Project" });
    }
  }

  async findByEstimate(req: Request, res: Response) {
    try {
      const { estimateId } = req.params;

      const fildsPdfProjects = await prisma.fildsPdfProject.findMany({
        where: { estimateId },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        },
        orderBy: {
          date_creation: 'asc'
        }
      });

      return res.json(fildsPdfProjects);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch fildsPdfProjects by Estimate" });
    }
  }

  async findByInvoice(req: Request, res: Response) {
    try {
      const { invoiceId } = req.params;

      const fildsPdfProjects = await prisma.fildsPdfProject.findMany({
        where: { invoiceId },
        include: {
          pdfProject: true,
          estimate: true,
          invoice: true
        },
        orderBy: {
          date_creation: 'asc'
        }
      });

      return res.json(fildsPdfProjects);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch fildsPdfProjects by Invoice" });
    }
  }
} 