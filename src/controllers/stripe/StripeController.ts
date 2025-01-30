import { Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-01-27.acacia",
});

export class StripeController {
    // Conectar uma Company ao Stripe (Onboarding)
  async connectCompany(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (company.stripeAccountId) {
        console.log(`Conta Stripe já conectada para a companyId: ${companyId}`);
        return res.status(400).json({
          error: "Account already connected",
          stripeAccountId: company.stripeAccountId,
        });
      }

      // Criando conta no Stripe
      const account = await stripe.accounts.create({ type: "standard" });

      // Criando link de onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.URL_FRONT}/stripe-config`,
        return_url: `${process.env.URL_FRONT}/stripe-config`,
        type: "account_onboarding",
      });

      // Atualizando a tabela Company com o stripeAccountId
      await prisma.company.update({
        where: { id: companyId },
        data: { stripeAccountId: account.id },
      });

      return res.status(200).json({ url: accountLink.url });
    } catch (error) {
      console.error("Erro ao criar conta Stripe:", error);
      return res.status(500).json({ error: "Error creating Stripe account" });
    }
  }

//   Verificar status da conexão Stripe
  async checkStripeStatus(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const isConnected = !!company.stripeAccountId;

      return res.status(200).json({ connected: isConnected });
    } catch (error) {
      console.error("Erro ao verificar status do Stripe:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
