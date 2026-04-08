import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { stripeConfig } from "../config/stripe";

const stripe = stripeConfig.getClient();

const EXTRA_EMPLOYEE_METADATA_TYPE = "extra_employee";

/**
 * Service for managing Extra Employee configuration
 *
 * This service manages the price configuration in the database
 * and can sync price updates to all existing Stripe subscriptions.
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

  /**
   * Updates the extra employee price and syncs to all existing Stripe subscriptions
   *
   * This method:
   * 1. Updates the price in the database
   * 2. Finds all companies with active subscriptions and extra employees > 0
   * 3. For each company, updates the Stripe subscription item with the new price
   *
   * @param newPrice - The new price per extra employee
   * @returns Object with config, updated count, failed count, and errors
   */
  static async updatePriceAndSyncStripe(newPrice: number): Promise<{
    config: {
      id: string;
      price: number;
      isActive: boolean;
    };
    updatedCount: number;
    failedCount: number;
    errors: Array<{
      companyId: string;
      error: string;
    }>;
  }> {
    console.log(`[ExtraEmployee] Updating price to $${newPrice} and syncing to Stripe...`);

    // 1. Update price in database
    const config = await this.updatePrice(newPrice);
    const priceInCents = Math.round(newPrice * 100);

    const errors: Array<{ companyId: string; error: string }> = [];
    let updatedCount = 0;
    let failedCount = 0;

    // 2. Get all companies with active subscriptions and extra employees > 0
    const companiesWithExtras = await prisma.company.findMany({
      where: {
        extraEmployees: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        extraEmployees: true,
      },
    });

    console.log(`[ExtraEmployee] Found ${companiesWithExtras.length} companies with extra employees`);

    // 3. For each company, update the Stripe subscription item
    for (const company of companiesWithExtras) {
      try {
        // Get active subscription for this company
        const subscription = await prisma.subscription.findFirst({
          where: {
            companyId: company.id,
            isActive: true,
            stripeSubscriptionId: { not: null },
          },
          select: {
            stripeSubscriptionId: true,
          },
        });

        if (!subscription?.stripeSubscriptionId) {
          console.log(`[ExtraEmployee] No active subscription for company ${company.id}, skipping`);
          continue;
        }

        // Get subscription from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );

        // Find the extra employee item
        const extraEmployeeItem = this.findExtraEmployeeItem(stripeSubscription);

        if (!extraEmployeeItem) {
          console.log(`[ExtraEmployee] No extra employee item found for company ${company.id}, skipping`);
          continue;
        }

        // Get the product ID from the existing price
        const productId = extraEmployeeItem.price.product as string;

        // Create a new price with the updated amount
        const newStripePrice = await stripe.prices.create({
          product: productId,
          unit_amount: priceInCents,
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
          metadata: {
            type: EXTRA_EMPLOYEE_METADATA_TYPE,
          },
        });

        // Update the subscription item with the new price
        await stripe.subscriptionItems.update(extraEmployeeItem.id, {
          price: newStripePrice.id,
          proration_behavior: 'create_prorations',
        });

        console.log(`[ExtraEmployee] Updated subscription item for company ${company.id} (${company.name})`);
        updatedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[ExtraEmployee] Failed to update subscription for company ${company.id}:`, errorMessage);
        errors.push({
          companyId: company.id,
          error: errorMessage,
        });
        failedCount++;
      }
    }

    console.log(`[ExtraEmployee] Price update complete. Updated: ${updatedCount}, Failed: ${failedCount}`);

    return {
      config,
      updatedCount,
      failedCount,
      errors,
    };
  }

  /**
   * Finds the extra employee item in a subscription
   */
  private static findExtraEmployeeItem(
    subscription: Stripe.Subscription
  ): Stripe.SubscriptionItem | undefined {
    return subscription.items.data.find(
      (item) => item.price.metadata?.type === EXTRA_EMPLOYEE_METADATA_TYPE
    );
  }
}
