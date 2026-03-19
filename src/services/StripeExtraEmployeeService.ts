import { prisma } from "../utils/prisma";

/**
 * Service for managing Extra Employee configuration
 * 
 * This service only manages the price configuration in the database.
 * The actual Stripe subscription items are created dynamically per company
 * when they add extra employees (see StripeSubscriptionItemService).
 */
export class StripeExtraEmployeeService {
  /**
   * Gets the current extra employee configuration
   * Creates a default config if none exists
   */
  static async getConfig(): Promise<{
    id: string;
    price: number;
    isActive: boolean;
  } | null> {
    const config = await prisma.extraEmployeeConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      // Create default config from env variable
      const envPriceInCents = parseInt(
        process.env.STRIPE_PRICE_EXTRA_EMPLOYEE || "1000",
        10
      );
      const defaultPrice = envPriceInCents / 100;

      const newConfig = await prisma.extraEmployeeConfig.create({
        data: {
          price: defaultPrice,
        },
      });

      return {
        id: newConfig.id,
        price: newConfig.price.toNumber(),
        isActive: newConfig.isActive,
      };
    }

    return {
      id: config.id,
      price: config.price.toNumber(),
      isActive: config.isActive,
    };
  }

  /**
   * Updates the extra employee price
   * This affects new subscriptions only - existing subscriptions
   * keep their current price until updated
   */
  static async updatePrice(newPrice: number): Promise<{
    id: string;
    price: number;
    isActive: boolean;
  }> {
    let config = await prisma.extraEmployeeConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      config = await prisma.extraEmployeeConfig.create({
        data: {
          price: newPrice,
        },
      });
    } else {
      config = await prisma.extraEmployeeConfig.update({
        where: { id: config.id },
        data: {
          price: newPrice,
        },
      });
    }

    return {
      id: config.id,
      price: config.price.toNumber(),
      isActive: config.isActive,
    };
  }

  /**
   * Gets the current price per extra employee
   */
  static async getPrice(): Promise<number> {
    const config = await this.getConfig();
    return config?.price ?? 10; // Default to $10 if no config
  }
}
