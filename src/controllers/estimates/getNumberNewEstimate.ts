import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class GetNumberNewEstimateController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
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
            const number = await prisma.estimate.findMany({
                where: {
                    project: {
                        company_id: companyId
                    }
                },
                select: {
                    number: true
                },
                orderBy: {
                    date_creation: 'desc'
                }
            })

            if (!number) {
                return res.status(404).json({
                    error: "Estimate number not found"
                })
            }

            return res.status(200).json({
                number: Number(number[0].number) + 1
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
            number
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
            const lastEstimateNumber = await prisma.estimate.findFirst({
                where: {
                    project: {
                        company_id: companyId
                    }
                },
                select: {
                    number: true
                },
                orderBy: {
                    date_creation: 'desc'
                }
            })

            console.log("Ultimo numero: ", lastEstimateNumber)
            console.log("Numero atual: ", number)

            if (Number(lastEstimateNumber?.number) >= Number(number)) {
                console.log("Entrou aqui")
                return res.status(200).json({
                    number: Number(lastEstimateNumber?.number) + 1
                })
            }

            console.log("Não entrou aqui")

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