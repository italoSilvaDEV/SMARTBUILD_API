import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

type CreateFields = {
    invoiceId: string,
    name: string,
    description?: string,
    quantity: number,
    price: number,
    totalAmount: number
}

type UpdateFields = {
    invoiceItemId?: string
    name?: string,
    description?: string,
    quantity?: number,
    price?: number,
    totalAmount?: number
}

type DeleteFields = {
    invoiceItemId: string
}

export class InvoiceItemsController {
    async createInvoiceItem(req: Request, res: Response) {
        const data = req.body as CreateFields

        if (!data.invoiceId) {
            return res.status(400).json({
                error: "Invoice ID is required"
            })
        }

        const invoice = await prisma.invoice.findUnique({
            where: {
                id: data.invoiceId
            }
        })

        if (!invoice) {
            return res.status(404).json({
                error: "Invoice not found"
            })
        }

        if (!data.name || !data.quantity || !data.price || !data.totalAmount) {
            return res.status(400).json({
                error: "Name, quantity, price and totalAmount are required"
            })
        }

        try {
            const newInvoiceItem = await prisma.invoiceItem.create({
                data: {
                    name: data.name,
                    description: data.description,
                    quantity: data.quantity,
                    price: data.price,
                    totalAmount: data.totalAmount,
                    invoiceId: data.invoiceId
                }
            })

            return res.status(201).json({
                message: "Invoice item created successfully",
                invoiceItem: newInvoiceItem
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while creating invoice item"
            })
        }
    }

    async updateInvoiceItem(req: Request, res: Response) {
        const data = req.body as UpdateFields

        if (!data.invoiceItemId) {
            return res.status(400).json({
                error: "Invoice item ID is required"
            })
        }

        const invoiceItem = await prisma.invoiceItem.findUnique({
            where: {
                id: data.invoiceItemId
            },
        })

        if (!invoiceItem) {
            return res.status(404).json({
                error: "Invoice item not found"
            })
        }

        try {
            let fields: UpdateFields = {}

            if (data.name) {
                fields.name = data.name
            }
            if (data.description) {
                fields.description = data.description
            }
            if (data.quantity) {
                fields.quantity = data.quantity
            }
            if (data.price) {
                fields.price = data.price
            }
            if (data.totalAmount) {
                fields.totalAmount = data.totalAmount
            }

            const updatedInvoiceItem = await prisma.invoiceItem.update({
                where: {
                    id: data.invoiceItemId
                },
                data: fields
            })

            return res.status(200).json({
                message: "Invoice item updated successfully",
                invoiceItem: updatedInvoiceItem
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while updating invoice item"
            })
        }
    }

    async deleteInvoiceItem(req: Request, res: Response) {
        const data = req.params as DeleteFields

        if (!data.invoiceItemId) {
            return res.status(400).json({
                error: "Invoice item ID is required"
            })
        }

        const invoiceItem = await prisma.invoiceItem.findUnique({
            where: {
                id: data.invoiceItemId
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
                    id: data.invoiceItemId
                }
            })

            return res.status(200).json({
                message: "Invoice item deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting invoice item"
            })
        }
    }
}