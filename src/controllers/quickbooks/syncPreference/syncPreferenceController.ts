import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import {
  buildUnsupportedTypesEntityError,
  isTypesEntitySupportedByPrismaClient,
  normalizeSyncTypeForEntity,
  shouldNormalizeProjectsSyncType,
} from "./syncPreferenceUtils";

const QBO_TO_SMART_ONLY_SYNC_ENTITIES = ["projects", "estimates"];

export class SyncPreferencesController {
  private async normalizeQboToSmartOnlyPreferences(where: { companyId?: string; userId?: string }) {
    for (const typesEntity of QBO_TO_SMART_ONLY_SYNC_ENTITIES) {
      if (!isTypesEntitySupportedByPrismaClient(typesEntity)) {
        continue;
      }

      await (prisma as any).syncPreferences.updateMany({
        where: {
          ...where,
          typesEntity,
          NOT: { typeSync: "QuickBooksToSmartBuild" },
        },
        data: {
          typeSync: "QuickBooksToSmartBuild",
        },
      });
    }
  }

  async listByCompany(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      await this.normalizeQboToSmartOnlyPreferences({ companyId });

      const prefs = await prisma.syncPreferences.findMany({
        where: { companyId },
        include: {
          userCreate: { select: { id: true, name: true, email: true } },
        },
      });

      return res.json(prefs);
    } catch (error: any) {
      console.error("Erro ao listar preferências por empresa:", error);
      return res.status(500).json({ error: "Erro interno ao listar preferências" });
    }
  }

  async listByUser(req: Request, res: Response) {
    const { userId } = req.params;

    try {
      await this.normalizeQboToSmartOnlyPreferences({ userId });

      const prefs = await prisma.syncPreferences.findMany({
        where: { userId },
        include: { company: { select: { id: true, name: true } } },
      });

      return res.json(prefs);
    } catch (error: any) {
      console.error("Erro ao listar preferências por usuário:", error);
      return res.status(500).json({ error: "Erro interno ao listar preferências" });
    }
  }

  async create(req: Request, res: Response) {
    const { typesEntity, typeSync, userId, companyId } = req.body;

    if (!isTypesEntitySupportedByPrismaClient(typesEntity)) {
      const error = buildUnsupportedTypesEntityError(typesEntity);
      return res.status(409).json({
        error: "QuickBooks sync setup is not ready",
        details: error.message,
        code: (error as any).code,
        typesEntity,
      });
    }

    try {
      if (!isTypesEntitySupportedByPrismaClient(typesEntity)) {
        throw buildUnsupportedTypesEntityError(typesEntity);
      }

      const existing = await prisma.syncPreferences.findFirst({
        where: { typesEntity, userId, companyId },
      });

      if (existing) {
        return res.status(400).json({ error: "Preferência já cadastrada para essa entidade." });
      }

      const normalizedTypeSync = normalizeSyncTypeForEntity(typesEntity, typeSync);

      const created = await prisma.syncPreferences.create({
        data: {
          typesEntity,
          typeSync: normalizedTypeSync,
          userId,
          companyId,
        },
      });

      return res.status(201).json(created);
    } catch (error: any) {
      console.error("Erro ao criar preferência:", error);
      return res.status(500).json({ error: "Erro interno ao criar preferência" });
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const { typeSync } = req.body;

    try {
      const existing = await prisma.syncPreferences.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: "PreferÃªncia nÃ£o encontrada" });
      }

      const normalizedTypeSync = normalizeSyncTypeForEntity(existing.typesEntity, typeSync);

      const updated = await prisma.syncPreferences.update({
        where: { id },
        data: { typeSync: normalizedTypeSync },
      });

      return res.json(updated);
    } catch (error: any) {
      console.error("Erro ao atualizar preferência:", error);
      return res.status(500).json({ error: "Erro interno ao atualizar preferência" });
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;

    try {
      await prisma.syncPreferences.delete({ where: { id } });
      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao deletar preferência:", error);
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
      const existing = await prisma.syncPreferences.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: "PreferÃªncia nÃ£o encontrada" });
      }

      const data: { isDisable: boolean; typeSync?: "QuickBooksToSmartBuild" } = {
        isDisable,
      };

      if (shouldNormalizeProjectsSyncType(existing.typesEntity, existing.typeSync)) {
        data.typeSync = "QuickBooksToSmartBuild";
      }

      const updated = await prisma.syncPreferences.update({
        where: { id },
        data,
      });

      return res.json(updated);
    } catch (error: any) {
      console.error("Erro ao atualizar isDisable:", error);
      return res.status(500).json({ error: "Erro interno ao atualizar isDisable" });
    }
  }
}
