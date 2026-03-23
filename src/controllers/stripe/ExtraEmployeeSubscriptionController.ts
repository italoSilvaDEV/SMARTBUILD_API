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
   * POST /extra-employees/company/:companyId/reduce
   * Removes extra employee seats from a company's subscription
   *
   * Request body:
   * - quantity: number (required) - Number of seats to reduce
   * - userIds: string[] (optional) - Specific users to disable when reducing assigned seats
   */
  static async reduceExtraEmployees(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const { quantity, userIds } = req.body;

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

      // Get current status to calculate unused seats
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
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

      // Count extra paid users
      const extraPaidUsersCount = await prisma.userCompany.count({
        where: {
          companyId,
          user: {
            isExtraPaidUser: true,
          },
        },
      });

      const extraEmployeesCount = company.extraEmployees ?? 0;
      const unusedSeats = Math.max(0, extraEmployeesCount - extraPaidUsersCount);
      
      // Calculate how many users need to be disabled
      const usersToDisable = Math.max(0, quantity - unusedSeats);

      // Validate userIds if users need to be disabled
      if (usersToDisable > 0) {
        if (!userIds || !Array.isArray(userIds) || userIds.length !== usersToDisable) {
          res.status(400).json({
            success: false,
            error: `Must select exactly ${usersToDisable} user(s) to disable. You have ${unusedSeats} unused seat(s) and are reducing by ${quantity} seat(s).`,
          });
          return;
        }

        // Verify all userIds belong to this company and are extra paid users
        const validUsers = await prisma.userCompany.findMany({
          where: {
            companyId,
            userId: { in: userIds },
            user: {
              isExtraPaidUser: true,
            },
          },
          select: {
            userId: true,
          },
        });

        if (validUsers.length !== userIds.length) {
          res.status(400).json({
            success: false,
            error: "Some selected users are not valid extra paid users in this company",
          });
          return;
        }
      }

      // Call service to reduce extra employees
      const result = await StripeSubscriptionItemService.reduceExtraEmployees(
        companyId,
        quantity,
        'create_prorations',
        userIds
      );

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

      // Count total users using UserCompany model (new N:N relationship)
      const totalUsersCount = await prisma.userCompany.count({
        where: { companyId },
      });

      // Count extra paid users using UserCompany model
      // We need to join with User to check isExtraPaidUser
      const extraPaidUsersResult = await prisma.userCompany.findMany({
        where: { companyId },
        select: {
          user: {
            select: {
              isExtraPaidUser: true,
            },
          },
        },
      });
      const extraPaidUsersCount = extraPaidUsersResult.filter(uc => uc.user?.isExtraPaidUser).length;

      // Get price per unit
      const pricePerUnit = await StripeExtraEmployeeService.getPrice();

      // Check if there's an active subscription (check for any active subscription)
      const activeSubscription = await prisma.subscription.findFirst({
        where: {
          companyId,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      const extraEmployeesCount = company.extraEmployees ?? 0;
      const allowedEmployeesCount = company.allowedEmployees ?? 0;
      
      // Calculate unused seats (extra seats not assigned to any user)
      const unusedSeats = Math.max(0, extraEmployeesCount - extraPaidUsersCount);

      res.status(200).json({
        success: true,
        data: {
          currentExtraEmployees: extraEmployeesCount,
          allowedEmployees: allowedEmployeesCount,
          totalUsers: totalUsersCount,
          extraEmployeePrice: pricePerUnit,
          hasActiveSubscription: !!activeSubscription,
          extraPaidUsersCount: extraPaidUsersCount,
          unusedSeats: unusedSeats,
          // Keep legacy fields for backward compatibility
          extraEmployees: extraEmployeesCount,
          currentEmployees: totalUsersCount,
          extraPaidUsers: extraPaidUsersCount,
          totalCapacity: allowedEmployeesCount + extraEmployeesCount,
          availableSlots: Math.max(
            0,
            allowedEmployeesCount + extraEmployeesCount - totalUsersCount
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
   * GET /extra-employees/company/:companyId/users
   * Gets the list of extra paid users for a company
   */
  static async getExtraPaidUsers(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        res.status(400).json({
          success: false,
          error: "Company ID is required",
        });
        return;
      }

      // Get extra paid users using UserCompany model
      const extraPaidUsers = await prisma.userCompany.findMany({
        where: {
          companyId,
          user: {
            isExtraPaidUser: true,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isExtraPaidUser: true,
              date_creation: true,
            },
          },
        },
      });

      const users = extraPaidUsers.map(uc => ({
        id: uc.user.id,
        name: uc.user.name,
        email: uc.user.email,
        isExtraPaidUser: uc.user.isExtraPaidUser ?? false,
        date_creation: uc.user.date_creation,
      }));

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error("[ExtraEmployee] Error getting extra paid users:", error);
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
   * Also updates all existing Stripe subscription items with the new price
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

      const result = await StripeExtraEmployeeService.updatePriceAndSyncStripe(price);

      res.status(200).json({
        success: true,
        data: {
          price: result.config.price,
          updatedCount: result.updatedCount,
          failedCount: result.failedCount,
          errors: result.errors,
        },
        message: `Extra employee price updated to $${price.toFixed(2)}. Updated ${result.updatedCount} subscription(s) in Stripe.${result.failedCount > 0 ? ` ${result.failedCount} update(s) failed.` : ''}`,
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
