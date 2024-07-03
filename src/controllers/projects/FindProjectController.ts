// FindProjectController.ts
import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindProjectController {
  async handle(request: Request, response: Response) {
    try {
      const { client_name, seller_id, pag } = request.body;

      const filtro: any = {};
      if (client_name) {
        filtro.client = { name: { contains: client_name } };
      }
      if (seller_id) {
        filtro.seller_user_id = seller_id;
      }

      const pageNumber = Number(pag) || 0;

      const result = await prisma.project.findMany({
        where: filtro,
        select: {
          id: true,
          price: true,
          status_project: true,
          client: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
          invoiceCostProject: {
            select: {
              uri: true,
            },
          },
        },
        skip: pageNumber * 5, // Ajustado para 5 itens por página
        take: 5, // Ajustado para 5 itens por página
        orderBy: {
          date_creation: "desc",
        },
      });

      const total = await prisma.project.count({
        where: filtro,
      });

      return response.json({ total, result });
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Erro interno do servidor" });
    }
  }
}
