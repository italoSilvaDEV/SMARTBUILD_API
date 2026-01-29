import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface UpdateSubcontractorRequest {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  company_id: string;
}

export class UpdateSubcontractorController {
  async handle(req: Request, res: Response) {
    try {
      const {
        id,
        name,
        email,
        phone,
        address,
        company_id
      } = req.body as UpdateSubcontractorRequest;

      const errors: string[] = [];

      if (!id) {
        errors.push("Subcontractor ID is required!");
      }

      if (!company_id) {
        errors.push("Company ID is required!");
      }

      if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
        errors.push("Name must not be empty!");
      }

      if (email !== undefined && (typeof email !== 'string' || email.trim() === '')) {
        errors.push("Email must not be empty!");
      }

      // Validate email format if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push("Invalid email format!");
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: errors });
      }

      // Check if subcontractor exists and belongs to the company
      const existingSubcontractor = await prisma.subcontractor.findFirst({
        where: {
          id: id,
          company_id: company_id
        }
      });

      if (!existingSubcontractor) {
        return res.status(404).json({ 
          error: "Subcontractor not found or does not belong to your company!" 
        });
      }

      // Check if email is already in use by another subcontractor
      if (email && email.toLowerCase() !== existingSubcontractor.email) {
        const emailExists = await prisma.subcontractor.findFirst({
          where: {
            email: email.toLowerCase(),
            company_id: company_id,
            id: {
              not: id
            }
          }
        });

        if (emailExists) {
          return res.status(400).json({ 
            error: ["A subcontractor with this email already exists in your company!"] 
          });
        }
      }

      const updateData: any = {};
      
      if (name !== undefined) updateData.name = name.trim();
      if (email !== undefined) updateData.email = email.toLowerCase().trim();
      if (phone !== undefined) updateData.phone = phone?.trim() || null;
      if (address !== undefined) updateData.address = address?.trim() || null;

      const updatedSubcontractor = await prisma.subcontractor.update({
        where: { id: id },
        data: updateData
      });

      return res.status(200).json({ 
        message: "Subcontractor updated successfully!",
        subcontractor: updatedSubcontractor 
      });

    } catch (error) {
      console.error("Error updating subcontractor:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}

