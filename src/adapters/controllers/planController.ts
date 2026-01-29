import { Request, Response } from 'express';
import { PlanService } from '../../application/services/planService';

export class PlanController {
  constructor(private planService: PlanService) {}

  /**
   * Creates a new plan
   * @param req Request with plan data
   * @param res API response
   */
  async createPlan(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, price, features, validityType, validityDuration, permissionGroupId } = req.body;
      
      // Process features if it's an array
      const processedFeatures = features ? 
        (typeof features === 'string' ? features : JSON.stringify(features)) : 
        JSON.stringify([]);

      const planData = {
        name,
        description,
        price: price || null,
        features: processedFeatures,
        validityType,
        validityDuration,
        permissionGroupId
      };

      const plan = await this.planService.createPlan(planData);
      
      res.status(201).json(plan);
    } catch (error: unknown) {
      // Erro ao criar plano
      res.status(500).json({ message: 'Error creating plan', error: (error as Error).message });
    }
  }

  /**
   * Lists all available plans
   * @param req Request
   * @param res API response
   */
  async getAllPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await this.planService.getAllPlans();
      res.status(200).json(plans);
    } catch (error: unknown) {
      res.status(500).json({ message: 'Error fetching plans', error: (error as Error).message });
    }
  }

  /**
   * Finds a plan by ID
   * @param req Request with plan ID
   * @param res API response
   */
  async getPlanById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plan = await this.planService.getPlanById(id);
      
      if (!plan) {
        // Plano não encontrado
        res.status(404).json({ message: 'Plan not found' });
        return;
      }
      
      res.status(200).json(plan);
    } catch (error: unknown) {
      // Erro ao buscar plano
      res.status(500).json({ message: 'Error fetching plan', error: (error as Error).message });
    }
  }

  /**
   * Updates an existing plan
   * @param req Request with updated plan data
   * @param res API response
   */
  async updatePlan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, price, features, validityType, validityDuration, permissionGroupId } = req.body;
      
      // Process features if it's an array
      const processedFeatures = features ? 
        (typeof features === 'string' ? features : JSON.stringify(features)) : 
        JSON.stringify([]);

      const updatedPlan = await this.planService.updatePlan(id, {
        name,
        description,
        price: price || null,
        features: processedFeatures,
        validityType,
        validityDuration,
        permissionGroupId
      });
      
      if (!updatedPlan) {
        // Plano não encontrado
        res.status(404).json({ message: 'Plan not found' });
        return;
      }
      
      res.status(200).json(updatedPlan);
    } catch (error: unknown) {
      // Erro ao atualizar plano
      res.status(500).json({ message: 'Error updating plan', error: (error as Error).message });
    }
  }

  /**
   * Removes a plan
   * @param req Request with plan ID
   * @param res API response
   */
  async deletePlan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.planService.deletePlan(id);
      res.status(204).send();
    } catch (error: unknown) {
      // Erro ao excluir plano
      res.status(500).json({ message: 'Error deleting plan', error: (error as Error).message });
    }
  }
} 