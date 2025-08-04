import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateClientController {
    async handle(req: Request, res: Response) {
        try {
          const client = req.body;
      
          const errors: string[] = [];
          const {
            name,
            email,
            document,
            phone,
            location,
            birth_date,
            lat,
            log,
            radius,
            avatar,
            city_and_state,
            autorId,
            stripeCustomerId,
            company_id,
          } = client;
      
          // Validações obrigatórias
          if (!name) {
            errors.push("Name is required!");
          }
          if (!email) {
            errors.push("Email is required!");
          }
          if (!company_id) {
            errors.push("Company ID is required!");
          }
      
          // Verificar se o email já existe para a companhia
          if (email && company_id) {
            const existingClient = await prisma.client.findFirst({
              where: {
                email,
                company_id,
              },
            });
      
            if (existingClient) {
              errors.push(`Client with email ${email} already exists for this company!`);
            }
          }
      
          if (errors.length > 0) {
            return res.status(400).json({ errors });
          }
      
          // Criação do cliente com todos os campos possíveis
          const result = await prisma.client.create({
            data: {
              name,
              email,
              document,
              phone,
              location,
              birth_date,
              lat,
              log,
              radius,
              avatar,
              city_and_state,
              autorId,
              stripeCustomerId,
              company_id,
            },
          });
      
          return res.json(result);
        } catch (error) {
          if (error instanceof Error) {
            return res.status(500).json({ error: error.message });
          }
          return res.status(500).json({ error: "Internal error" });
        }
      }
}
