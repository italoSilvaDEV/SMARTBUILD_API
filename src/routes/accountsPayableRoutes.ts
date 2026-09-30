import { Router } from "express";
import { AccountsPayableController } from "../controllers/accountsPayable/AccountsPayableController";
import { checkToken } from "../middlewares/checkToken";
import { userCanViewFinancials } from "../utils/financialAccess";
import { prisma } from "../utils/prisma";

const accountsPayableRoutes = Router({ mergeParams: true });
const controller = new AccountsPayableController();

accountsPayableRoutes.use(checkToken);
accountsPayableRoutes.use(async (req, res, next) => {
  try {
    const companyId = req.params.companyId;
    const userId = (req as any).userId as string | undefined;
    if (!await userCanViewFinancials(userId, companyId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return res.status(404).json({ error: "Company not found" });
    next();
  } catch (error) {
    console.error("Accounts payable access check failed:", error);
    return res.status(500).json({ error: "Unable to verify access" });
  }
});

accountsPayableRoutes.get("/", controller.list);
accountsPayableRoutes.post("/", controller.create);
accountsPayableRoutes.put("/:id", controller.update);
accountsPayableRoutes.patch("/:id/payment", controller.setPayment);
accountsPayableRoutes.delete("/:id", controller.remove);

export { accountsPayableRoutes };
