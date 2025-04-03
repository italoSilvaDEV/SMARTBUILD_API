import { SubscriptionRepository } from '../../domain/repositories/subscriptionRepository';
import { Subscription } from '../../domain/entities/subscription';

export class SubscriptionService {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  /**
   * Cria uma nova assinatura
   * @param subscriptionData Dados da assinatura
   * @returns Assinatura criada
   */
  async createSubscription(subscriptionData: Omit<Subscription, 'id'>): Promise<Subscription> {
    // Validação dos dados
    if (!subscriptionData.companyId || !subscriptionData.planId) {
      throw new Error('Empresa e plano são obrigatórios');
    }

    if (!subscriptionData.startDate || !subscriptionData.endDate) {
      throw new Error('Datas de início e fim são obrigatórias');
    }

    if (subscriptionData.startDate >= subscriptionData.endDate) {
      throw new Error('A data de início deve ser anterior à data de fim');
    }

    return this.subscriptionRepository.create(subscriptionData);
  }

  /**
   * Lista todas as assinaturas
   * @returns Lista de assinaturas
   */
  async getAllSubscriptions(): Promise<Subscription[]> {
    return this.subscriptionRepository.findAll();
  }

  /**
   * Busca assinaturas de uma empresa
   * @param companyId ID da empresa
   * @returns Lista de assinaturas da empresa
   */
  async getSubscriptionsByCompany(companyId: string): Promise<Subscription[]> {
    return this.subscriptionRepository.findByCompany(companyId);
  }

  /**
   * Busca uma assinatura pelo ID
   * @param id ID da assinatura
   * @returns Assinatura encontrada ou null
   */
  async getSubscriptionById(id: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findById(id);
  }

  /**
   * Atualiza uma assinatura
   * @param id ID da assinatura
   * @param subscriptionData Dados atualizados
   * @returns Assinatura atualizada ou null
   */
  async updateSubscription(id: string, subscriptionData: Partial<Omit<Subscription, 'id' | 'companyId'>>): Promise<Subscription | null> {
    return this.subscriptionRepository.update(id, subscriptionData);
  }

  /**
   * Cancela uma assinatura
   * @param id ID da assinatura
   * @returns Assinatura cancelada ou null
   */
  async cancelSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptionRepository.update(id, { isActive: false });
  }

  /**
   * Renova uma assinatura
   * @param id ID da assinatura
   * @param newEndDate Nova data de término
   * @returns Assinatura renovada ou null
   */
  async renewSubscription(id: string, newEndDate: Date): Promise<Subscription | null> {
    const subscription = await this.subscriptionRepository.findById(id);
    
    if (!subscription) {
      return null;
    }
    
    if (newEndDate <= subscription.endDate) {
      throw new Error('A nova data de término deve ser posterior à atual');
    }
    
    return this.subscriptionRepository.update(id, { 
      endDate: newEndDate,
      isActive: true 
    });
  }
} 