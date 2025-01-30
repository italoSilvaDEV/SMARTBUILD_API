import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../utils/prisma"; // Adapte para seu setup do Prisma
import dotenv from "dotenv";

dotenv.config();

const stripeRoutes = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-01-27.acacia",
});

// Rota para conectar uma Company ao Stripe (Onboarding)
stripeRoutes.get("/stripe/connect/:companyId", async (req: Request, res: Response) => {
  const { companyId } = req.params;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Verifica se já há uma conta Stripe conectada
    if (company.stripeAccountId) {
      console.log(`Conta Stripe já conectada para a companyId: ${companyId}`);
      return res.status(400).json({
        error: "Account already connected",
        stripeAccountId: company.stripeAccountId,
      });
    }

    // Criação da nova conta Stripe
    const account = await stripe.accounts.create({ type: "standard" });

    // Criando o link de onboarding no Stripe
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.APP_URL}/stripe-config`,
      return_url: `${process.env.APP_URL}/stripe-config`,
      type: "account_onboarding",
    });

    // Atualiza o ID da conta Stripe na tabela Company
    await prisma.company.update({
      where: { id: companyId },
      data: { stripeAccountId: account.id },
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (error) {
    console.error("Erro ao criar conta Stripe:", error);
    return res.status(500).json({ error: "Error creating Stripe account" });
  }
});

//  Rota para verificar status da conexão Stripe
stripeRoutes.get("/stripe/status/:companyId", async (req: Request, res: Response) => {
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
});

export { stripeRoutes };
