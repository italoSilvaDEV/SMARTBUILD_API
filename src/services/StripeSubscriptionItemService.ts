import Stripe from "stripe";
import { stripeConfig } from "../config/stripe";
import { prisma } from "../utils/prisma";
import { StripeExtraEmployeeService } from "./StripeExtraEmployeeService";

const stripe = stripeConfig.getClient();

const EXTRA_EMPLOYEE_METADATA_TYPE = "extra_employee";

interface AddExtraEmployeesResult {
  success: boolean;
  extraEmployees: number;
  addedQuantity: number;
  pricePerUnit: number;
  message: string;
  stripeItemId?: string;
}

interface ReduceExtraEmployeesResult {
  success: boolean;
  extraEmployees: number;
  removedQuantity: number;
  convertedUsers: string[];
  message: string;
}

/**
 * Service for managing dynamic subscription items for extra employees
 * 
 * This service creates and manages subscription items dynamically per company,
 * without requiring a global product in Stripe.
 */
export class StripeSubscriptionItemService {
  /**
   * Adds extra employee seats to a company's subscription
   * 
   * @param companyId - The company ID
   * @param quantityToAdd - Number of extra seats to add
   * @param prorationBehavior - How to handle proration (default: 'create_prorations')
   */
  static async addExtraEmployees(
    companyId: string,
    quantityToAdd: number,
    prorationBehavior: 'create_prorations' | 'always_invoice' | 'none' = 'create_prorations'
  ): Promise<AddExtraEmployeesResult> {
    console.log(`[ExtraEmployee] Adding ${quantityToAdd} extra seats for company ${companyId}`);

    // 1. Get company with subscription info
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        extraEmployees: true,
        stripeCustomerId: true,
      },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // 2. Get active subscription for this company
    const subscription = await prisma.subscription.findFirst({
      where: {
        companyId,
        isActive: true,
        stripeSubscriptionId: { not: null },
      },
      select: {
        stripeSubscriptionId: true,
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error("No active subscription found for this company");
    }

    // 3. Get current price from config
    const pricePerUnit = await StripeExtraEmployeeService.getPrice();
    const priceInCents = Math.round(pricePerUnit * 100);

    // 4. Get subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // 5. Check if extra employee item already exists
    const existingItem = this.findExtraEmployeeItem(stripeSubscription);

    let newQuantity: number;
    let stripeItemId: string | undefined;

    if (existingItem) {
      // Update existing item
      newQuantity = (existingItem.quantity ?? 0) + quantityToAdd;
      
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: newQuantity,
        proration_behavior: prorationBehavior,
      });

      stripeItemId = existingItem.id;
      console.log(`[ExtraEmployee] Updated existing item ${existingItem.id} to quantity ${newQuantity}`);
    } else {
      // Create new price and item
      const newPrice = await this.createDynamicPrice(
        stripeSubscription.items.data[0].price.product as string,
        priceInCents
      );

      // Add new subscription item
      const newItem = await stripe.subscriptionItems.create({
        subscription: subscription.stripeSubscriptionId,
        price: newPrice.id,
        quantity: quantityToAdd,
        proration_behavior: prorationBehavior,
      });

      newQuantity = quantityToAdd;
      stripeItemId = newItem.id;
      console.log(`[ExtraEmployee] Created new item ${newItem.id} with quantity ${quantityToAdd}`);
    }

    // 6. Update company in database
    await prisma.company.update({
      where: { id: companyId },
      data: {
        extraEmployees: newQuantity,
      },
    });

    return {
      success: true,
      extraEmployees: newQuantity,
      addedQuantity: quantityToAdd,
      pricePerUnit,
      stripeItemId,
      message: `${quantityToAdd} extra employee seat(s) added. Your next invoice will include a prorated charge of $${(pricePerUnit * quantityToAdd).toFixed(2)}.`,
    };
  }

  /**
   * Removes extra employee seats from a company's subscription
   * 
   * @param companyId - The company ID
   * @param quantityToRemove - Number of extra seats to remove
   * @param prorationBehavior - How to handle proration (default: 'create_prorations')
   */
  static async reduceExtraEmployees(
    companyId: string,
    quantityToRemove: number,
    prorationBehavior: 'create_prorations' | 'always_invoice' | 'none' = 'create_prorations'
  ): Promise<ReduceExtraEmployeesResult> {
    console.log(`[ExtraEmployee] Removing ${quantityToRemove} extra seats for company ${companyId}`);

    // 1. Get company with subscription info
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        extraEmployees: true,
      },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    const currentExtra = company.extraEmployees ?? 0;
    if (currentExtra < quantityToRemove) {
      throw new Error(`Cannot remove ${quantityToRemove} seats. Company only has ${currentExtra} extra employee seats.`);
    }

    // 2. Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        companyId,
        isActive: true,
        stripeSubscriptionId: { not: null },
      },
      select: {
        stripeSubscriptionId: true,
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error("No active subscription found for this company");
    }

    // 3. Get subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // 4. Find extra employee item
    const existingItem = this.findExtraEmployeeItem(stripeSubscription);

    if (!existingItem) {
      throw new Error("No extra employee item found in subscription");
    }

    const newQuantity = currentExtra - quantityToRemove;

    // 5. Update or delete the subscription item
    if (newQuantity === 0) {
      // Delete the item entirely
      await stripe.subscriptionItems.del(existingItem.id, {
        proration_behavior: prorationBehavior,
      });
      console.log(`[ExtraEmployee] Deleted item ${existingItem.id}`);
    } else {
      // Reduce quantity
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: newQuantity,
        proration_behavior: prorationBehavior,
      });
      console.log(`[ExtraEmployee] Reduced item ${existingItem.id} to quantity ${newQuantity}`);
    }

    // 6. Convert users from isExtraPaidUser to regular
    const convertedUsers = await this.convertExtraUsersToRegular(companyId, quantityToRemove);

    // 7. Update company in database
    await prisma.company.update({
      where: { id: companyId },
      data: {
        extraEmployees: newQuantity === 0 ? null : newQuantity,
      },
    });

    return {
      success: true,
      extraEmployees: newQuantity,
      removedQuantity: quantityToRemove,
      convertedUsers,
      message: `${quantityToRemove} extra employee seat(s) removed. ${convertedUsers.length} user(s) converted to regular seats.`,
    };
  }

  /**
   * Removes a specific user from extra employee status
   * 
   * @param companyId - The company ID
   * @param userId - The user ID to convert
   */
  static async removeExtraEmployeeUser(
    companyId: string,
    userId: string
  ): Promise<ReduceExtraEmployeesResult> {
    console.log(`[ExtraEmployee] Converting user ${userId} from extra to regular`);

    // 1. Verify user belongs to company and is extra paid
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        company_id: companyId,
        isExtraPaidUser: true,
      },
      select: { id: true },
    });

    if (!user) {
      throw new Error("User not found or is not an extra paid user");
    }

    // 2. Remove one extra seat
    const result = await this.reduceExtraEmployees(companyId, 1);

    return {
      ...result,
      convertedUsers: [userId],
    };
  }

  /**
   * Handles plan upgrade - adjusts extra employees based on new plan limits
   * Called from webhook when subscription is updated
   * 
   * @param companyId - The company ID
   * @param oldAllowedEmployees - Previous plan's allowed employees
   * @param newAllowedEmployees - New plan's allowed employees
   */
  static async handlePlanUpgrade(
    companyId: string,
    oldAllowedEmployees: number | null,
    newAllowedEmployees: number
  ): Promise<void> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { extraEmployees: true },
    });

    const oldAllowed = oldAllowedEmployees ?? 0;
    const oldExtra = company?.extraEmployees ?? 0;

    console.log(`[ExtraEmployee] Handling plan upgrade: oldAllowed=${oldAllowed}, oldExtra=${oldExtra}, newAllowed=${newAllowedEmployees}`);

    // Case 1: New plan covers all employees (including extras)
    if (newAllowedEmployees >= oldAllowed + oldExtra) {
      console.log(`[ExtraEmployee] New plan covers all employees, removing extras`);
      
      // Remove all extras
      if (oldExtra > 0) {
        await this.removeAllExtraEmployees(companyId);
        await this.convertExtraUsersToRegular(companyId, oldExtra);
      }
      return;
    }

    // Case 2: New plan has more seats but not enough to cover all
    if (newAllowedEmployees > oldAllowed) {
      const newPlanSlots = newAllowedEmployees - oldAllowed;
      const newExtra = Math.max(0, oldExtra - newPlanSlots);

      console.log(`[ExtraEmployee] Reducing extras: newPlanSlots=${newPlanSlots}, newExtra=${newExtra}`);

      if (newExtra < oldExtra) {
        // Reduce extras by the number of new plan slots
        const toRemove = oldExtra - newExtra;
        await this.reduceExtraEmployees(companyId, toRemove, 'none');
      }
      return;
    }

    // Case 3: Plan downgrade or same - keep extras as is
    console.log(`[ExtraEmployee] Plan downgrade or same, keeping extras`);
  }

  /**
   * Removes all extra employees from a company's subscription
   */
  private static async removeAllExtraEmployees(companyId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        companyId,
        isActive: true,
        stripeSubscriptionId: { not: null },
      },
      select: { stripeSubscriptionId: true },
    });

    if (!subscription?.stripeSubscriptionId) return;

    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const existingItem = this.findExtraEmployeeItem(stripeSubscription);
    if (existingItem) {
      await stripe.subscriptionItems.del(existingItem.id, {
        proration_behavior: 'none',
      });
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { extraEmployees: null },
    });
  }

  /**
   * Converts extra paid users to regular users
   * Selects the oldest extra users first
   */
  private static async convertExtraUsersToRegular(
    companyId: string,
    count: number
  ): Promise<string[]> {
    if (count <= 0) return [];

    // Get the oldest extra paid users
    const usersToConvert = await prisma.user.findMany({
      where: {
        company_id: companyId,
        isExtraPaidUser: true,
      },
      orderBy: {
        date_creation: 'asc', // Oldest first
      },
      take: count,
      select: { id: true },
    });

    if (usersToConvert.length === 0) return [];

    const userIds = usersToConvert.map(u => u.id);

    await prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        isExtraPaidUser: false,
      },
    });

    console.log(`[ExtraEmployee] Converted ${userIds.length} users from extra to regular`);
    return userIds;
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

  /**
   * Creates a dynamic price for extra employees
   * Uses the product from the main subscription item
   */
  private static async createDynamicPrice(
    productId: string,
    priceInCents: number
  ): Promise<Stripe.Price> {
    return await stripe.prices.create({
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
  }

  /**
   * Gets the current extra employee quantity from a Stripe subscription
   */
  static getExtraEmployeeQuantity(subscription: Stripe.Subscription): number {
    const item = subscription.items.data.find(
      (i) => i.price.metadata?.type === EXTRA_EMPLOYEE_METADATA_TYPE
    );
    return item?.quantity ?? 0;
  }
}
