import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class GetEstimateNumberController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

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

            return res.status(200).json({
                number2: Number(number[0].number) + 1
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while getting estimate number"
            })
        }
    }
}