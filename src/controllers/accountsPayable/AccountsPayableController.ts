import { Request, Response } from "express";
import { AccountPayable } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { validateAccountPayableInput } from "./accountPayableInput";

function serialize(account: AccountPayable) {
  return {
    id: account.id,
    companyId: account.companyId,
    name: account.name,
    description: account.description,
    amount: account.amount.toFixed(2),
    status: account.paidAt ? "paid" : "pending",
    paidAt: account.paidAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function serverError(res: Response, error: unknown) {
  console.error("Accounts payable request failed:", error);
  return res.status(500).json({ error: "Unable to process account payable" });
}

export class AccountsPayableController {
  list = async (req: Request, res: Response) => {
    try {
      const accounts = await prisma.accountPayable.findMany({
        where: { companyId: req.params.companyId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return res.json({ data: accounts.map(serialize) });
    } catch (error) {
      return serverError(res, error);
    }
  };

  create = async (req: Request, res: Response) => {
    const parsed = validateAccountPayableInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const account = await prisma.accountPayable.create({
        data: { companyId: req.params.companyId, ...parsed.value },
      });
      return res.status(201).json({ data: serialize(account) });
    } catch (error) {
      return serverError(res, error);
    }
  };

  update = async (req: Request, res: Response) => {
    const parsed = validateAccountPayableInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const where = { id: req.params.id, companyId: req.params.companyId };
    try {
      const result = await prisma.accountPayable.updateMany({ where, data: parsed.value });
      if (!result.count) return res.status(404).json({ error: "Account payable not found" });
      const account = await prisma.accountPayable.findFirstOrThrow({ where });
      return res.json({ data: serialize(account) });
    } catch (error) {
      return serverError(res, error);
    }
  };

  setPayment = async (req: Request, res: Response) => {
    if (typeof req.body?.paid !== "boolean") {
      return res.status(400).json({ error: "Paid must be true or false" });
    }
    const where = { id: req.params.id, companyId: req.params.companyId };
    try {
      const current = await prisma.accountPayable.findFirst({ where });
      if (!current) return res.status(404).json({ error: "Account payable not found" });
      if (Boolean(current.paidAt) === req.body.paid) {
        return res.json({ data: serialize(current) });
      }
      await prisma.accountPayable.updateMany({
        where: { ...where, paidAt: current.paidAt },
        data: { paidAt: req.body.paid ? new Date() : null },
      });
      const account = await prisma.accountPayable.findFirstOrThrow({ where });
      return res.json({ data: serialize(account) });
    } catch (error) {
      return serverError(res, error);
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      const result = await prisma.accountPayable.deleteMany({
        where: { id: req.params.id, companyId: req.params.companyId },
      });
      if (!result.count) return res.status(404).json({ error: "Account payable not found" });
      return res.status(204).send();
    } catch (error) {
      return serverError(res, error);
    }
  };
}
