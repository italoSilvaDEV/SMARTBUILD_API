import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindPdfProjectAllController {
  async handle(request: Request, response: Response) {
    try {
      const { project_id, name, pag } = request.body;

      if (!project_id) {
        return response.status(400).json({ error: "Project ID is required" });
      }

      const filtro: any = { project_id };

      if (name) {
        filtro.original_file_name = { contains: name };
      }

      const pageNumber = Number(pag) || 0;

      const result = await prisma.pdfProject.findMany({
        where: filtro,
        select: {
          id: true,
          original_file_name: true,
          uri: true,
          date_creation: true,
          date_update: true,
        },
        skip: pageNumber * 20,
        take: 20,
        orderBy: {
          date_creation: "desc"
        },
      });

      const total = await prisma.pdfProject.count({
        where: filtro
      });

      return response.json({ total, result });
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        return response.status(500).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal server error" });
    }
  }
}
