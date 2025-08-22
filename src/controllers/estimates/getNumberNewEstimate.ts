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
                    type_estimate: "estimate",
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

            if (number.length === 0) {
                const number = await prisma.estimate.findMany({
                    where: {
                        type_estimate: "estimateProject",
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

                const lastNumber = number.map(e => (e.number ?? "").toString().split("/")[0].trim()).map(n => {
                    const v = parseInt(n, 10)
                    return Number.isFinite(v) ? v : null
                }).filter((v): v is number => v !== null)

                const nextNumber = (lastNumber.length ? Math.max(...lastNumber) : 1000) + 1

                return res.status(200).json({
                    number: nextNumber
                })
            }

            const lastNumber = number.map(e => (e.number ?? "").toString().split("/")[0].trim()).map(n => {
                const v = parseInt(n, 10)
                return Number.isFinite(v) ? v : null
            }).filter((v): v is number => v !== null)

            const nextNumber = (lastNumber.length ? Math.max(...lastNumber) : 1000) + 1

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

            if (lastEstimateNumber && Number(lastEstimateNumber?.number) >= Number(number)) {
                return res.status(200).json({
                    number: Number(lastEstimateNumber?.number) + 1
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