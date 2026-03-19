import { Request, Response } from "express";
import { StripeSubscriptionItemService } from "../../services/StripeSubscriptionItemService";
import { StripeExtraEmployeeService } from "../../services/StripeExtraEmployeeService";
import { prisma } from "../../utils/prisma";

/**
 * Controller for managing extra employee subscription items
 */
export class ExtraEmployeeSubscriptionController {
  /**
   * POST /stripe/company/:companyId/extra-employees
   * Adds extra employee seats to a company's subscription
   */
  static async addExtraEmployees(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const { quantity } = req.body;

      // Validation
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: "Company ID is required",
        });
        return;
      }

      if (!quantity || typeof quantity !== "number" || quantity < 1) {
        res.status(400).json({
          success: false,
          error: "Valid quantity is required (must be a positive number)",
        });
        return;
      }

      // TODO: Add authorization check - verify user belongs to this company
      // const userId = req.headers["x-user-id"];
      // const user = await prisma.user.findUnique({ where: { id: userId } });
      // if (user?.company_id !== companyId) {
      //   res.status(403).json({ success: false, error: "Unauthorized" });
      //   return;
      // }

      const result = await StripeSubscriptionItemService.addExtraEmployees(
        companyId,
        quantity
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error adding extra employees:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * POST /stripe/company/:companyId/extra-employees/reduce
   * Removes extra employee seats from a company's subscription
   */
  static async reduceExtraEmployees(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const { quantity, userId } = req.body;

      // Validation
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: "Company ID is required",
        });
        return;
      }

      // Either quantity or userId must be provided
      if (!quantity && !userId) {
        res.status(400).json({
          success: false,
          error: "Either quantity or userId is required",
        });
        return;
      }

      // TODO: Add authorization check

      let result;

      if (userId) {
        // Remove specific user from extra employees
        result = await StripeSubscriptionItemService.removeExtraEmployeeUser(
          companyId,
          userId
        );
      } else {
        // Remove by quantity
        if (typeof quantity !== "number" || quantity < 1) {
          res.status(400).json({
            success: false,
            error: "Valid quantity is required (must be a positive number)",
          });
          return;
        }

        result = await StripeSubscriptionItemService.reduceExtraEmployees(
          companyId,
          quantity
        );
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error reducing extra employees:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /stripe/company/:companyId/extra-employees
   * Gets the current extra employee status for a company
   */
  static async getExtraEmployeesStatus(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        res.status(400).json({
          success: false,
          error: "Company ID is required",
        });
        return;
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          allowedEmployees: true,
          extraEmployees: true,
        },
      });

      if (!company) {
        res.status(404).json({
          success: false,
          error: "Company not found",
        });
        return;
      }

      // Count current employees
      const currentEmployeesCount = await prisma.user.count({
        where: { company_id: companyId },
      });

      // Count extra paid users
      const extraPaidUsersCount = await prisma.user.count({
        where: {
          company_id: companyId,
          isExtraPaidUser: true,
        },
      });

      const pricePerUnit = await StripeExtraEmployeeService.getPrice();

      res.status(200).json({
        success: true,
        data: {
          allowedEmployees: company.allowedEmployees ?? 0,
          extraEmployees: company.extraEmployees ?? 0,
          currentEmployees: currentEmployeesCount,
          extraPaidUsers: extraPaidUsersCount,
          totalCapacity: (company.allowedEmployees ?? 0) + (company.extraEmployees ?? 0),
          availableSlots: Math.max(
            0,
            (company.allowedEmployees ?? 0) + (company.extraEmployees ?? 0) - currentEmployeesCount
          ),
          pricePerUnit,
        },
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error getting extra employees status:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /extra-employee/config
   * Gets the current extra employee price configuration (admin only)
   */
  static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await StripeExtraEmployeeService.getConfig();

      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error getting config:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * PUT /extra-employee/price
   * Updates the extra employee price (admin only)
   */
  static async updatePrice(req: Request, res: Response): Promise<void> {
    try {
      const { price } = req.body;

      if (typeof price !== "number" || price < 0) {
        res.status(400).json({
          success: false,
          error: "Valid price is required (must be a non-negative number)",
        });
        return;
      }

      const config = await StripeExtraEmployeeService.updatePrice(price);

      res.status(200).json({
        success: true,
        data: config,
        message: `Extra employee price updated to $${price.toFixed(2)}. This will affect new subscriptions only.`,
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error updating price:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}
