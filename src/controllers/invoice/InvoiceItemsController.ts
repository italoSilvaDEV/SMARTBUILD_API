import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

type Fields = {
    name?: string
    description?: string
    quantity?: number
    price?: number
    totalAmount?: number
}

export class InvoiceItemsController {
    async create(req: Request, res: Response) {
        const {
            name,
            description,
            quantity,
            price,
            totalAmount,
            invoiceId,
        } = req.body

        if (!name || !quantity || !price || !totalAmount) {
            return res.status(400).json({
                error: "Name, quantity, price and total amount are required"
            })
        }

        try {
            await prisma.invoiceItem.create({
                data: {
                    name,
                    description,
                    quantity,
                    price,
                    totalAmount,
                    invoiceId,
                }
            })

            return res.status(201).json({
                message: "Invoice item created successfully",
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async update(req: Request, res: Response) {
        const {
            id,
            name,
            description,
            quantity,
            price,
            totalAmount,
        } = req.body

        if (!id) {
            return res.status(400).json({
                error: "Invoice item ID is required"
            })
        }

        const invoiceItem = await prisma.invoiceItem.findUnique({
            where: {
                id
            }
        })

        if (!invoiceItem) {
            return res.status(404).json({
                error: "Invoice item not found"
            })
        }

        if (!name && !description && !quantity && !price && !totalAmount) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            let campos: Fields = {
                name,
                description,
                quantity,
                price,
                totalAmount
            }

            if (name !== undefined) {
                campos.name = name
            }
            if (description !== undefined) {
                campos.description = description
            }
            if (quantity !== undefined) {
                campos.quantity = quantity
            }
            if (price !== undefined) {
                campos.price = price
            }
            if (totalAmount !== undefined) {
                campos.totalAmount = totalAmount
            }

            await prisma.invoiceItem.update({
                where: {
                    id
                },
                data: {
                    ...campos,
                    updatedAt: new Date()
                }
            })

            return res.status(200).json({
                message: "Invoice item updated successfully",
            })

        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async delete(req: Request, res: Response) {
        const {
            id,
        } = req.params

        if (!id) {
            return res.status(400).json({
                error: "Invoice item ID is required"
            })
        }

        const invoiceItem = await prisma.invoiceItem.findUnique({
            where: {
                id
            }
        })

        if (!invoiceItem) {
            return res.status(404).json({
                error: "Invoice item not found"
            })
        }

        try {
            await prisma.invoiceItem.delete({
                where: {
                    id
                }
            })

            return res.status(200).json({
                message: "Invoice item deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
