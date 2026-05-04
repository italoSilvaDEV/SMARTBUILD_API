import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { qboClientForAccount } from "../util/http/qboClientFactory";

export class QuickBooksProjectController {
  async listProjects(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const mode = req.query.mode === "all" || req.query.mode === "children" ? req.query.mode : "jobs";

    if (!companyId || !userId) {
      return res.status(400).json({ error: "Missing companyId/userId" });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const account = await prisma.quickBooksAccount.findUnique({
        where: { company_id: companyId },
      });

      if (!account) {
        return res.status(404).json({ error: "QuickBooks account not found" });
      }

      const api = qboClientForAccount(account.id);
      // TEMP DEBUG - remover após validação da sincronização de projetos QBO
      const sql =
        mode === "jobs"
          ? "select * from Customer where Job = true"
          : "select * from Customer";
      const q = encodeURIComponent(sql);
      const { data } = await api.get(`/query?query=${q}`);
      const customers = data?.QueryResponse?.Customer ?? [];
      const filteredCustomers =
        mode === "children"
          ? customers.filter((customer: any) => customer.ParentRef)
          : customers;
      const projects = filteredCustomers.map((customer: any) => ({
        qboId: customer.Id ?? null,
        name: customer.DisplayName ?? customer.Name ?? customer.FullyQualifiedName ?? null,
        fullyQualifiedName: customer.FullyQualifiedName ?? null,
        active: customer.Active ?? null,
        job: customer.Job ?? false,
        isProject: customer.IsProject ?? null,
        parentRef: customer.ParentRef ?? null,
        billWithParent: customer.BillWithParent ?? null,
        balance: customer.Balance ?? null,
        balanceWithJobs: customer.BalanceWithJobs ?? null,
        raw: customer,
      }));

      return res.status(200).json({
        mode,
        sql,
        total: projects.length,
        projects,
      });
    } catch (error: any) {
      const status = error?.response?.status || 500;
      const payload = error?.response?.data || null;

      return res.status(status).json({
        error: error?.message || "Failed to list QuickBooks projects",
        status,
        payload,
      });
    }
  }
}
