import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";


export class SyncPreferencesController {
  async listByCompany(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      const prefs = await prisma.syncPreferences.findMany({
        where: { companyId },
        include: {
          userCreate: { select: { id: true, name: true, email: true } },
        },
      });

      return res.json(prefs);
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao listar preferências" });
    }
  }

  async listByUser(req: Request, res: Response) {
    const { userId } = req.params;

    try {
      const prefs = await prisma.syncPreferences.findMany({
        where: { userId },
        include: { company: { select: { id: true, name: true } } },
      });

      return res.json(prefs);
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao listar preferências" });
    }
  }

  async create(req: Request, res: Response) {
    const { typesEntity, typeSync, userId, companyId } = req.body;

    try {
      const existing = await prisma.syncPreferences.findFirst({
        where: { typesEntity, userId, companyId },
      });

      if (existing) {
        return res.status(400).json({ error: "Preferência já cadastrada para essa entidade." });
      }

      const created = await prisma.syncPreferences.create({
        data: {
          typesEntity,
          typeSync,
          userId,
          companyId,
        },
      });

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao criar preferência" });
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const { typeSync } = req.body;

    try {
      const updated = await prisma.syncPreferences.update({
        where: { id },
        data: { typeSync },
      });

      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao atualizar preferência" });
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;

    try {
      await prisma.syncPreferences.delete({ where: { id } });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao deletar preferência" });
    }
  }

  async updateIsDisable(req: Request, res: Response) {
    const { id } = req.params;
    const { isDisable } = req.body;

    if (typeof isDisable !== 'boolean') {
      return res.status(400).json({ error: "isDisable deve ser um valor booleano" });
    }

    try {
      const updated = await prisma.syncPreferences.update({
        where: { id },
        data: { isDisable },
      });

      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno ao atualizar isDisable" });
    }
  }
}
