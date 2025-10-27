import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateWorkContextController {
  async handle(req: Request, res: Response) {
    try {
      const {
        id,
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

      // Required field validation
      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

      // Type validation if provided
      if (type && type !== 'COMPANY' && type !== 'PERSONAL') {
        return res.status(400).json({ error: "type must be COMPANY or PERSONAL" });
      }

      // Check if WorkContext exists
      const workContextExists = await prisma.workContext.findUnique({
        where: { id },
      });

      if (!workContextExists) {
        return res.status(404).json({ error: "Work context not found" });
      }

      // Prepare data for update (only provided fields)
      const dataToUpdate: any = {};
      
      if (type !== undefined) dataToUpdate.type = type;
      if (label !== undefined) dataToUpdate.label = label;
      if (Name !== undefined) dataToUpdate.Name = Name;
      if (Email !== undefined) dataToUpdate.Email = Email;
      if (street !== undefined) dataToUpdate.street = street;
      if (district !== undefined) dataToUpdate.district = district;
      if (zip_code !== undefined) dataToUpdate.zip_code = zip_code;
      if (city_and_state !== undefined) dataToUpdate.city_and_state = city_and_state;
      if (state !== undefined) dataToUpdate.state = state;
      if (number !== undefined) dataToUpdate.number = number;
      if (complement !== undefined) dataToUpdate.complement = complement;
      if (phone !== undefined) dataToUpdate.phone = phone;
      if (location !== undefined) dataToUpdate.location = location;
      if (addressOffice !== undefined) dataToUpdate.addressOffice = addressOffice;
      if (latitude !== undefined) dataToUpdate.latitude = latitude;
      if (longitude !== undefined) dataToUpdate.longitude = longitude;
      if (radius !== undefined) dataToUpdate.radius = radius;
      if (notes !== undefined) dataToUpdate.notes = notes;
      if (isActive !== undefined) dataToUpdate.isActive = isActive;

      // Handle project associations if projectIds is provided
      if (projectIds !== undefined && Array.isArray(projectIds)) {
        console.log(`Atualizando projetos do WorkContext ${id}. Projetos selecionados:`, projectIds);
        
        // Remove this work context from all projects first
        await prisma.project.updateMany({
          where: { workContextId: id },
          data: { workContextId: null }
        });
        
        // Add work context to selected projects
        if (projectIds.length > 0) {
          await prisma.project.updateMany({
            where: { 
              id: { in: projectIds },
              client_id: workContextExists.clientId // Ensure projects belong to the same client
            },
            data: { workContextId: id }
          });
        }
        
        console.log(` Projetos atualizados com sucesso para o WorkContext ${id}`);
      }

      // Update WorkContext
      const workContext = await prisma.workContext.update({
        where: { id },
        data: dataToUpdate,
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

      return res.json(workContext);
    } catch (error: any) {
      console.error("Error updating WorkContext:", error);
      return res.status(500).json({ 
        error: "Error updating work context" 
      });
    }
  }
}

