import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { fireAndForgetUpsertToQBO } from "../quickbooks/customer/FireAndForgetUpsertToQBO";

export class UpdateClientController {
    async handle(req: Request, res: Response) {
        try {
          const clientId = req.params.id;
          const updatedData = req.body;
      
          const errors: string[] = [];
          const {
            name,
            email,
            document,
            phone,
            location,
            addressOffice,
            birth_date,
            lat,
            log,
            radius,
            avatar,
            city_and_state,
            autorId,
            stripeCustomerId,
            company_id,
          } = updatedData;
      
          // Validações obrigatórias
          if (!name) {
            errors.push("Name is required!");
          }
          if (!email) {
            errors.push("Email is required!");
          }
      
          // Verificar se o cliente existe
          const existingClient = await prisma.client.findUnique({
            where: { id: clientId },
          });
      
          if (!existingClient) {
            return res.status(404).json({ error: "Client not found!" });
          }
      
          // Verificar unicidade do email para a companhia, excluindo o próprio registro
          if (email && email !== existingClient.email) {
            const emailExists = await prisma.client.findFirst({
              where: {
                email,
                company_id: company_id || existingClient.company_id,
                id: { not: clientId }, // Exclui o próprio registro
              },
            });
      
            if (emailExists) {
              errors.push(`Client with email ${email} already exists for this company!`);
            }
          }
      
          if (errors.length > 0) {
            return res.status(400).json({ errors });
          }
      
          // Atualização do cliente com todos os campos possíveis
          const result = await prisma.client.update({
            where: { id: clientId },
            data: {
              name,
              email,
              document,
              phone,
              location,
              addressOffice,
              birth_date,
              lat,
              log,
              radius: radius !== undefined ? Math.ceil(Number(radius)) : undefined,
              avatar,
              city_and_state,
              autorId,
              stripeCustomerId,
              company_id: company_id || existingClient.company_id,
            },
          });

        
          if (clientId && company_id) {
            // console.log(`[QBO][update] disparando upsert fire-and-forget client=${result.id} company=${company_id} user=${autorId}`);
            fireAndForgetUpsertToQBO(company_id, autorId, result.id);
          } else {
            // console.warn("[QBO][update] Não foi possível disparar sync: userId ou company_id ausentes");
          }
      
          return res.json(result);
        } catch (error) {
          if (error instanceof Error) {
            return res.status(500).json({ error: error.message });
          }
          return res.status(500).json({ error: "Internal error" });
        }
      }
}
