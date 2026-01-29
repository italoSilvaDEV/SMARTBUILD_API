import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateWorkContextController {
  async handle(req: Request, res: Response) {
    try {
      const {
        clientId,
        companyId,
        type,
        label,
        Name,
        Email,
        street,
        district,
        zip_code,
        city_and_state,
        state,
        number,
        complement,
        phone,
        location,
        addressOffice,
        latitude,
        longitude,
        radius,
        notes,
        isActive,
        projectIds // Array de IDs dos projetos a serem vinculados
      } = req.body;

      // Required fields validation
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      if (!type) {
        return res.status(400).json({ error: "type is required" });
      }

      if (type !== 'COMPANY' && type !== 'PERSONAL') {
        return res.status(400).json({ error: "type must be COMPANY or PERSONAL" });
      }

      // Check if client exists
      const clientExists = await prisma.client.findUnique({
        where: { id: clientId },
      });

      if (!clientExists) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Check if company exists
      const companyExists = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!companyExists) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Create WorkContext
      const workContext = await prisma.workContext.create({
        data: {
          clientId,
          companyId,
          type,
          label: label || null,
          Name: Name || null,
          Email: Email || null,
          street: street || null,
          district: district || null,
          zip_code: zip_code || null,
          city_and_state: city_and_state || null,
          state: state || null,
          number: number || null,
          complement: complement || null,
          phone: phone || null,
          location: location || null,
          addressOffice: addressOffice || null,
          latitude: latitude || null,
          longitude: longitude || null,
          radius: radius || null,
          notes: notes || null,
          isActive: isActive !== undefined ? isActive : true,
        },
        include: {
          client: true,
          company: true,
        },
      });

      // Vincular projetos ao WorkContext se projectIds foi fornecido
      if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
        
        await prisma.project.updateMany({
          where: { 
            id: { in: projectIds },
            client_id: clientId // Ensure projects belong to the same client
          },
          data: { workContextId: workContext.id }
        });
        
      }

      // Fetch the complete work context with projects
      const completeWorkContext = await prisma.workContext.findUnique({
        where: { id: workContext.id },
        include: {
          client: true,
          company: true,
          projects: {
            select: {
              id: true,
              contract_number: true,
              status_project: true,
              price: true,
              location: true,
              lat: true,
              log: true,
            },
          },
        },
      });

      return res.status(201).json(completeWorkContext);
    } catch (error: any) {
      return res.status(500).json({ 
        error: "Error creating work context" 
      });
    }
  }
}

