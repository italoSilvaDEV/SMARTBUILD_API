import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class WorkOrderSettingsController {
  async get(req: Request, res: Response) {
    if (!await this.canAccess(req, req.params.companyId)) return res.status(403).json({ error: "Access denied" });
    const settings = await prisma.workOrderSettings.findUnique({ where: { companyId: req.params.companyId } });
    return res.json({ data: settings || { companyId: req.params.companyId, terms: "" } });
  }

  async save(req: Request, res: Response) {
    const { companyId, terms } = req.body;
    if (!companyId || typeof terms !== "string") return res.status(400).json({ error: "Company ID and terms are required" });
    if (!await this.canAccess(req, companyId)) return res.status(403).json({ error: "Access denied" });
    const settings = await prisma.workOrderSettings.upsert({
      where: { companyId }, create: { companyId, terms }, update: { terms },
    });
    return res.json({ data: settings });
  }

  private async canAccess(req: Request, companyId: string) {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return false;
    return Boolean(await prisma.user.findFirst({
      where: { id: userId, OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] },
      select: { id: true },
    }));
  }
}
