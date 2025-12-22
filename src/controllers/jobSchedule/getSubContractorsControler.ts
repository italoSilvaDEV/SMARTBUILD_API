import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetSubContractorsController {
    async handle(req: Request, res: Response) {
        const { companyId } = req.params

        try {
            if (!companyId) {
                return res.status(400).json({
                    error: "Company ID is required"
                })
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: companyId
                },
                select: {
                    id: true,
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const subContractors = await prisma.subcontractor.findMany({
                where: {
                    company_id: company.id
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    address: true,
                }
            })

            return res.status(200).json({
                message: "Subcontractors fetched successfully",
                data: subContractors
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}