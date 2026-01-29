import { Request, Response } from 'express';
import { SubscriptionService } from '../../application/services/subscriptionService';

export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Creates a new subscription for a company
   * @param req Request with subscription data
   * @param res API response
   */
  async createSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { companyId, planId, startDate, endDate } = req.body;
      
      const subscription = await this.subscriptionService.createSubscription({
        companyId,
        planId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true
      });
      
      res.status(201).json(subscription);
    } catch (error: unknown) {
      // Erro ao criar assinatura
      console.error('Error creating subscription:', error);
      res.status(500).json({ message: 'Error creating subscription', error: (error as Error).message });
    }
  }

  /**
   * Lists all subscriptions
   * @param req Request
   * @param res API response
   */
  async getAllSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const subscriptions = await this.subscriptionService.getAllSubscriptions();
      res.status(200).json(subscriptions);
    } catch (error: unknown) {
      // Erro ao listar assinaturas
      console.error('Error listing subscriptions:', error);
      res.status(500).json({ message: 'Error listing subscriptions', error: (error as Error).message });
    }
  }

  /**
   * Finds subscriptions for a company
   * @param req Request with company ID
   * @param res API response
   */
  async getSubscriptionsByCompany(req: Request, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const subscriptions = await this.subscriptionService.getSubscriptionsByCompany(companyId);
      res.status(200).json(subscriptions);
    } catch (error: unknown) {
      // Erro ao buscar assinaturas da empresa
      console.error('Error fetching company subscriptions:', error);
      res.status(500).json({ message: 'Error fetching company subscriptions', error: (error as Error).message });
    }
  }

  /**
   * Finds a subscription by ID
   * @param req Request with subscription ID
   * @param res API response
   */
  async getSubscriptionById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = await this.subscriptionService.getSubscriptionById(id);
      
      if (!subscription) {
        // Assinatura não encontrada
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      res.status(200).json(subscription);
    } catch (error: unknown) {
      // Erro ao buscar assinatura
      console.error('Error fetching subscription:', error);
      res.status(500).json({ message: 'Error fetching subscription', error: (error as Error).message });
    }
  }

  /**
   * Updates a subscription
   * @param req Request with updated subscription data
   * @param res API response
   */
  async updateSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { planId, startDate, endDate, isActive } = req.body;
      
      const updatedSubscription = await this.subscriptionService.updateSubscription(id, {
        planId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isActive
      });
      
      if (!updatedSubscription) {
        // Assinatura não encontrada
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      res.status(200).json(updatedSubscription);
    } catch (error: unknown) {
      // Erro ao atualizar assinatura
      console.error('Error updating subscription:', error);
      res.status(500).json({ message: 'Error updating subscription', error: (error as Error).message });
    }
  }

  /**
   * Cancels a subscription
   * @param req Request with subscription ID
   * @param res API response
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const canceledSubscription = await this.subscriptionService.cancelSubscription(id);
      
      if (!canceledSubscription) {
        // Assinatura não encontrada
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      res.status(200).json(canceledSubscription);
    } catch (error: unknown) {
      // Erro ao cancelar assinatura
      console.error('Error canceling subscription:', error);
      res.status(500).json({ message: 'Error canceling subscription', error: (error as Error).message });
    }
  }

  /**
   * Renews a subscription
   * @param req Request with subscription ID and new end date
   * @param res API response
   */
  async renewSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { newEndDate } = req.body;
      
      const renewedSubscription = await this.subscriptionService.renewSubscription(id, new Date(newEndDate));
      
      if (!renewedSubscription) {
        // Assinatura não encontrada
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      res.status(200).json(renewedSubscription);
    } catch (error: unknown) {
      // Erro ao renovar assinatura
      console.error('Error renewing subscription:', error);
      res.status(500).json({ message: 'Error renewing subscription', error: (error as Error).message });
    }
  }
} 