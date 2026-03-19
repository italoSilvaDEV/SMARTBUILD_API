import { Request, Response } from "express";
import { StripeExtraEmployeeService } from "../../services/StripeExtraEmployeeService";
import { prisma } from "../../utils/prisma";

export class ExtraEmployeeController {
  /**
   * Get the current Extra Employee configuration
   * GET /api/admin/extra-employee
   */
  static async getConfig(req: Request, res: Response) {
    try {
      const config = await StripeExtraEmployeeService.getConfig();

      if (!config) {
        return res.status(404).json({ error: "Extra Employee config not found" });
      }

      // Return formatted response
      res.json({
        id: config.id,
        price: config.price.toNumber(),
        stripeProductId: config.stripeProductId,
        stripePriceId: config.stripePriceId,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      console.error("[ExtraEmployeeController] Error getting config:", error);
      res.status(500).json({ error: "Failed to get Extra Employee config" });
    }
  }

  /**
   * Update the Extra Employee price
   * PUT /api/admin/extra-employee/price
   * Body: { price: number }
   */
  static async updatePrice(req: Request, res: Response) {
    try {
      const { price } = req.body;

      // Validate price
      if (typeof price !== "number" || price < 0) {
        return res.status(400).json({ error: "Invalid price. Must be a positive number." });
      }

      // Round to 2 decimal places
      const roundedPrice = Math.round(price * 100) / 100;

      const config = await StripeExtraEmployeeService.updatePriceByAdmin(roundedPrice);

      res.json({
        id: config.id,
        price: config.price.toNumber(),
        stripeProductId: config.stripeProductId,
        stripePriceId: config.stripePriceId,
        isActive: config.isActive,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      console.error("[ExtraEmployeeController] Error updating price:", error);
      res.status(500).json({ error: "Failed to update Extra Employee price" });
    }
  }

  /**
   * Get count of users with isExtraPaidUser = true
   * GET /api/admin/extra-employee/users/count
   */
  static async getExtraUsersCount(req: Request, res: Response) {
    try {
      const count = await prisma.user.count({
        where: { isExtraPaidUser: true },
      });

      res.json({ count });
    } catch (error) {
      console.error("[ExtraEmployeeController] Error getting extra users count:", error);
      res.status(500).json({ error: "Failed to get extra users count" });
    }
  }
}
