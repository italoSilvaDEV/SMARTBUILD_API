import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CreateSubcontractorRequest {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  company_id: string;
}

export class CreateSubcontractorController {
  async handle(req: Request, res: Response) {
    try {
      const {
        name,
        email,
        phone,
        address,
        company_id
      } = req.body as CreateSubcontractorRequest;

      const errors: string[] = [];

      if (!name || typeof name !== 'string' || name.trim() === '') {
        errors.push("Name is required and must not be empty!");
      }

      if (!email || typeof email !== 'string' || email.trim() === '') {
        errors.push("Email is required and must not be empty!");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        errors.push("Invalid email format!");
      }

      if (!company_id) {
        errors.push("Company ID is required!");
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: errors });
      }

      // Check if email already exists for this company
      const existingSubcontractor = await prisma.subcontractor.findFirst({
        where: {
          email: email.toLowerCase(),
          company_id: company_id
        }
      });

      if (existingSubcontractor) {
        return res.status(400).json({ 
          error: ["A subcontractor with this email already exists in your company!"] 
        });
      }

      const subcontractor = await prisma.subcontractor.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone?.trim() || null,
          address: address?.trim() || null,
          company: {
            connect: {
              id: company_id
            }
          }
        }
      });

      return res.status(201).json({ 
        message: "Subcontractor created successfully!",
        subcontractor 
      });

    } catch (error) {
      // console.error("Error creating subcontractor:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}

