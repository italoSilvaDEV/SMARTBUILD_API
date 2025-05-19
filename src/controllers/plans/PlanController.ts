import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { ValidityType } from '../../domain/entities/plan';
import Stripe from 'stripe';

// Inicializar o cliente Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia', // Atualizado para a versão compatível com os tipos
});

export class PlanController {
  // integrado com stripe
  async create(req: Request, res: Response) {
    try {
      const { name, description, price, features, validityType, validityDuration, permissionGroupId } = req.body;
      
      const processedFeatures = features ? 
        (typeof features === 'string' ? features : JSON.stringify(features)) : 
        JSON.stringify([]);

      // 1. Para planos gratuitos, não criamos no Stripe
      let stripeProductId = null;
      let stripePriceId = null;
      
      // Apenas criar no Stripe se NÃO for um plano FREE e tiver preço
      if (validityType !== 'FREE' && price && price > 0) {
        // Criar o produto no Stripe
        const product = await stripe.products.create({
          name,
          description: description || `Plano ${name}`,
          metadata: {
            features: processedFeatures,
            validityType,
            validityDuration: validityDuration?.toString() || "",
            permissionGroupId
          }
        });
        
        stripeProductId = product.id;
        
        // Criar o preço no Stripe
        // Convertendo para centavos (Stripe trabalha com a menor unidade monetária)
        const priceInCents = Math.round(parseFloat(price) * 100);
        
        // Configurar intervalo com base no validityType
        let interval: Stripe.PriceCreateParams.Recurring.Interval = 'month'; // padrão mensal
        if (validityType === 'ANNUAL' || validityType === 'yearly') {
          interval = 'year';
        }
        
        const stripePrice = await stripe.prices.create({
          product: product.id,
          unit_amount: priceInCents,
          currency: 'usd',
          recurring: {
            interval,
            interval_count: validityDuration || 1
          },
          metadata: {
            planId: 'pending'
          }
        });
        
        stripePriceId = stripePrice.id;
      }

      // 2. Criar o plano no banco de dados local
      const plan = await prisma.plan.create({
        data: {
          name,
          description,
          price: price || null,
          features: processedFeatures,
          validityType,
          validityDuration,
          permissionGroupId,
          stripeProductId,
          stripePriceId
        },
        include: {
          permissionGroup: true
        }
      });
      
      // 3. Se criamos um plano no Stripe, atualizar os metadados com o ID do plano local
      if (stripePriceId) {
        await stripe.prices.update(stripePriceId, {
          metadata: {
            planId: plan.id
          }
        });
      }

      // Formatar o resultado da mesma forma que o repository fazia
      const formattedPlan = {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price?.toNumber() || null,
        features: plan.features,
        validityType: plan.validityType as ValidityType,
        validityDuration: plan.validityDuration,
        permissionGroupId: plan.permissionGroupId,
        permissionGroup: plan.permissionGroup,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      };
      
      res.status(201).json(formattedPlan);
    } catch (error) {
      console.error('Error creating plan:', error);
      res.status(500).json({ message: 'Error creating plan', error: (error as Error).message });
    }
  }

  async getAllPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        include: {
          permissionGroup: true
        }
      });
      
      // Formatar os resultados como o repository fazia
      const formattedPlans = plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price?.toNumber() || null,
        features: plan.features,
        validityType: plan.validityType as ValidityType,
        validityDuration: plan.validityDuration,
        permissionGroupId: plan.permissionGroupId,
        permissionGroup: plan.permissionGroup,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId
      }));
      
      res.status(200).json(formattedPlans);
    } catch (error) {
      console.error('Error fetching plans:', error);
      res.status(500).json({ message: 'Error fetching plans', error: (error as Error).message });
    }
  }

  async getPlanById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const plan = await prisma.plan.findUnique({
        where: { id },
        include: { permissionGroup: true }
      });
      
      if (!plan) {
        res.status(404).json({ message: 'Plan not found' });
        return;
      }
      
      // Formatar o resultado
      const formattedPlan = {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price?.toNumber() || null,
        features: plan.features,
        validityType: plan.validityType as ValidityType,
        validityDuration: plan.validityDuration,
        permissionGroupId: plan.permissionGroupId,
        permissionGroup: plan.permissionGroup,
        createdAt: plan.createdAt,
        stripeProductId: plan.stripeProductId,
        updatedAt: plan.updatedAt
      };
      
      res.status(200).json(formattedPlan);
    } catch (error) {
      console.error('Error fetching plan:', error);
      res.status(500).json({ message: 'Error fetching plan', error: (error as Error).message });
    }
  }
// integrado com stripe
  async updatePlan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, price, features, validityType, validityDuration, permissionGroupId } = req.body;
      
      // Buscar o plano atual para verificar se há alterações e se existem IDs do Stripe
      const currentPlan = await prisma.plan.findUnique({
        where: { id }
      });

      if (!currentPlan) {
        return res.status(404).json({ message: 'Plan not found' });
      }
      
      const processedFeatures = features ? 
        (typeof features === 'string' ? features : JSON.stringify(features)) : 
        JSON.stringify([]);

      // Verificar se há IDs do Stripe para atualizar
      let stripeProductId = currentPlan.stripeProductId;
      let stripePriceId = currentPlan.stripePriceId;
      
      // Se existe um produto no Stripe, atualizar ele
      if (stripeProductId && validityType !== 'FREE') {
        await stripe.products.update(stripeProductId, {
          name,
          description: description || `Plano ${name}`,
          metadata: {
            features: processedFeatures,
            validityType,
            validityDuration: validityDuration?.toString() || "",
            permissionGroupId
          }
        });
        
        // O Stripe não permite mudar o valor de um preço existente
        // Se o preço mudou, precisamos criar um novo preço
        const priceChanged = price !== currentPlan.price?.toString();
        
        if (priceChanged && price && parseFloat(price) > 0) {
          const priceInCents = Math.round(parseFloat(price) * 100);
          
          // Configurar intervalo com base no validityType
          let interval: Stripe.PriceCreateParams.Recurring.Interval = 'month';
          if (validityType === 'ANNUAL' || validityType === 'yearly') {
            interval = 'year';
          }
          
          // Criar novo preço
          const stripePrice = await stripe.prices.create({
            product: stripeProductId,
            unit_amount: priceInCents,
            currency: 'usd',
            recurring: {
              interval,
              interval_count: validityDuration || 1
            },
            metadata: {
              planId: id
            }
          });
          
          // Salvar ID do novo preço
          stripePriceId = stripePrice.id;
        }
      } else if (stripeProductId && validityType === 'FREE' && currentPlan.validityType !== 'FREE') {
        // Desativar produto e preço se o plano mudou para gratuito
        await stripe.products.update(stripeProductId, {
          active: false
        });
        
        if (stripePriceId) {
          await stripe.prices.update(stripePriceId, {
            active: false
          });
        }
        
        // Remover as referências do Stripe no banco local
        stripeProductId = null;
        stripePriceId = null;
      }

      // Atualizar o plano no banco de dados
      const updatedPlan = await prisma.plan.update({
        where: { id },
        data: {
          name,
          description,
          price: price || null,
          features: processedFeatures,
          validityType,
          validityDuration,
          permissionGroupId,
          stripeProductId,
          stripePriceId
        },
        include: { permissionGroup: true }
      });
      
      // Formatar o resultado
      const formattedPlan = {
        id: updatedPlan.id,
        name: updatedPlan.name,
        description: updatedPlan.description,
        price: updatedPlan.price?.toNumber() || null,
        features: updatedPlan.features,
        validityType: updatedPlan.validityType as ValidityType,
        validityDuration: updatedPlan.validityDuration,
        permissionGroupId: updatedPlan.permissionGroupId,
        permissionGroup: updatedPlan.permissionGroup,
        stripeProductId: updatedPlan.stripeProductId,
        stripePriceId: updatedPlan.stripePriceId,
        createdAt: updatedPlan.createdAt,
        updatedAt: updatedPlan.updatedAt
      };
      
      res.status(200).json(formattedPlan);
    } catch (error) {
      console.error('Error updating plan:', error);
      res.status(500).json({ message: 'Error updating plan', error: (error as Error).message });
    }
  }

  // integrado com stripe
  async deletePlan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // 1. Verificar se o plano está em uso antes de excluir
      const hasAssociations = await PlanController.checkPlanAssociations(id);
      
      if (hasAssociations) {
        return res.status(400).json({ 
          message: 'Cannot delete plan that is in use by subscriptions or companies' 
        });
      }
      
      // 2. Buscar o plano para verificar se tem integração com Stripe
      const plan = await prisma.plan.findUnique({
        where: { id }
      });
      
      if (!plan) {
        return res.status(404).json({ message: 'Plan not found' });
      }
      
      // 3. Se o plano tem integração com Stripe, arquivar no Stripe
      if (plan.stripeProductId) {
        try {
          // Arquivar o produto no Stripe (não excluir)
          await stripe.products.update(plan.stripeProductId, {
            active: false
          });
          
          // Se existe um preço, arquivar também
          if (plan.stripePriceId) {
            await stripe.prices.update(plan.stripePriceId, {
              active: false
            });
          }
        } catch (stripeError) {
          console.error('Error archiving Stripe product/price:', stripeError);
          // Continuamos mesmo se houver erro no Stripe, para não bloquear a exclusão local
        }
      }
      
      // 4. Excluir o plano do banco de dados
      await prisma.plan.delete({
        where: { id }
      });
      
      res.status(200).json({ message: 'Plan deleted successfully' });
    } catch (error) {
      console.error('Error deleting plan:', error);
      res.status(500).json({ message: 'Error deleting plan', error: (error as Error).message });
    }
  }

  // Transformando em método estático para poder ser chamado sem o contexto de 'this'
  private static async checkPlanAssociations(id: string): Promise<boolean> {
    const subscriptionsCount = await prisma.subscription.count({
      where: { planId: id }
    });

    const companiesCount = await prisma.company.count({
      where: { planId: id }
    });

    return subscriptionsCount > 0 || companiesCount > 0;
  }
} 