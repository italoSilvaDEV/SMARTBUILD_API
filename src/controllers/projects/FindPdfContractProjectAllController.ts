import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindPdfContractProjectAllController {
  async handle(request: Request, response: Response) {
    try {
      const { projectId } = request.body;

      if (!projectId) {
        return response.status(400).json({ error: "Project ID is required" });
      }

      const result = await prisma.contractProject.findMany({
        where: {
          projectId: projectId
        },
        select: {
          id: true,
          original_file_name: true,
          uri: true,
          date_creation: true,
          date_update: true,
        },
        orderBy: {
          date_creation: "desc"
        },
      });

      const total = await prisma.contractProject.count({
        where: {
          projectId: projectId
        }
      });

      // Gerar URLs presignadas para cada contrato
      const resultWithPresignedUrls = await Promise.all(
        result.map(async (contract) => ({
          ...contract,
          uri: contract.uri ? await getPresignedUrl(contract.uri) : null,
        }))
      );

      return response.json({ 
        total, 
        result: resultWithPresignedUrls 
      });

    } catch (error) {
      // console.error(error);
      if (error instanceof Error) {
        return response.status(500).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal server error" });
    }
  }
} 