import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class GetNumberEstimateProjectController {
    async handle(req: Request, res: Response) {
        const {
            companyId,
            projectId
        } = req.params

        if (!companyId || !projectId) {
            return res.status(400).json({
                error: "Company ID and project ID are required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            }
        })

        if (!company || !project) {
            return res.status(404).json({
                error: "Company or project not found"
            })
        }


        try {
            const number = await prisma.estimate.findMany({
                where: {
                    type_estimate: "estimateProject",
                    project: {
                        id: projectId,
                        company_id: companyId
                    },
                },
            })

            const nextNumber = number.length + 1

            return res.status(200).json({
                number: nextNumber
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while getting estimate number"
            })
        }
    }

    async verifyNumber(req: Request, res: Response) {
        const {
            companyId,
            number,
            projectId
        } = req.body

        if (!companyId || !number) {
            return res.status(400).json({
                error: "Company ID and number are required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            })
        }

        try {
            const lastEstimateNumber = await prisma.estimate.findMany({
                where: {
                    type_estimate: "estimateProject",
                    project: {
                        id: projectId,
                        company_id: companyId
                    },
                },
            })

            const lastNumber = lastEstimateNumber.length

            if (lastNumber >= Number(number)) {
                return res.status(200).json({
                    number: Number(lastNumber) + 1
                })
            }

            return res.status(200).json({
                number: Number(number)
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while verifying estimate number"
            })
        }
    }
}