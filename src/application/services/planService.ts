import { PlanRepository } from '../../domain/repositories/planRepository';
import { Plan, ValidityType } from '../../domain/entities/plan';

export class PlanService {
  constructor(private planRepository: PlanRepository) {}

  /**
   * Creates a new plan
   * @param planData Plan data
   * @returns Created plan
   */
  async createPlan(planData: {
    name: string;
    description: string;
    price?: number | null;
    features?: any;
    validityType: ValidityType;
    validityDuration: number;
    permissionGroupId: string;
  }): Promise<Plan> {
    // Validação dos dados do plano
    if (!planData.name || !planData.description) {
      throw new Error('Name and description are required'); // Nome e descrição são obrigatórios
    }

    if (!planData.permissionGroupId) {
      throw new Error('Permission group is required'); // Grupo de permissões é obrigatório
    }

    if (planData.validityDuration <= 0) {
      throw new Error('Validity duration must be greater than zero'); // Duração da validade deve ser maior que zero
    }

    // Set default values for optional fields
    const planToCreate = {
      ...planData,
      price: planData.price || null,
      features: planData.features || JSON.stringify([])
    };

    return this.planRepository.create(planToCreate);
  }

  /**
   * Lists all plans
   * @returns List of plans
   */
  async getAllPlans(): Promise<Plan[]> {
    return this.planRepository.findAll();
  }

  /**
   * Finds a plan by ID
   * @param id Plan ID
   * @returns Found plan or null
   */
  async getPlanById(id: string): Promise<Plan | null> {
    return this.planRepository.findById(id);
  }

  /**
   * Updates an existing plan
   * @param id Plan ID
   * @param planData Updated plan data
   * @returns Updated plan or null
   */
  async updatePlan(id: string, planData: Partial<{
    name: string;
    description: string;
    price?: number | null;
    features?: any;
    validityType: ValidityType;
    validityDuration: number;
    permissionGroupId: string;
  }>): Promise<Plan | null> {
    // Verifica se o plano existe
    const existingPlan = await this.planRepository.findById(id);
    if (!existingPlan) {
      return null;
    }

    // Validação dos dados atualizados
    if (planData.validityDuration !== undefined && planData.validityDuration <= 0) {
      throw new Error('Validity duration must be greater than zero');
    }

    // Process features if provided
    if (planData.features && typeof planData.features !== 'string') {
      planData.features = JSON.stringify(planData.features);
    }

    return this.planRepository.update(id, planData);
  }

  /**
   * Removes a plan
   * @param id Plan ID
   * @returns void
   */
  async deletePlan(id: string): Promise<void> {
    // Verifica se o plano existe
    const existingPlan = await this.planRepository.findById(id);
    if (!existingPlan) {
      throw new Error('Plan not found'); // Plano não encontrado
    }

    // Verifica se há empresas ou assinaturas usando este plano
    const hasAssociations = await this.planRepository.hasAssociations(id);
    if (hasAssociations) {
      throw new Error('Cannot delete a plan that is in use'); // Não é possível excluir um plano que está sendo utilizado
    }

    await this.planRepository.delete(id);
  }
} 