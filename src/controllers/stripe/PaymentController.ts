import stripe from "../../config/stripe"; // Importa a instância do Stripe
import { Request, Response } from "express";
import nodemailer from "nodemailer";

export class PaymentController {
  async createInvoice(req: Request, res: Response) {
    try {
      const { customerEmail, amount, currency, description } = req.body;

      if (!customerEmail || !amount) {
        return res.status(400).json({ error: "Email e valor são obrigatórios" });
      }

      // Criar um boleto ou link de pagamento via Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Stripe trabalha com centavos (exemplo: R$ 100,00 = 10000)
        currency: currency || "brl", // Define a moeda
        payment_method_types: ["boleto"], // Pode ser 'card' para cartão ou 'boleto'
        description: description || "Pagamento do orçamento",
        receipt_email: customerEmail,
      });

      // Enviar e-mail com o link de pagamento
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: true,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: { rejectUnauthorized: false },
      });

      const mailOptions = {
        from: SMTP_CONFIG.user,
        to: customerEmail,
        subject: "Pagamento do Orçamento",
        html: `
          <p>Olá,</p>
          <p>Segue o link para pagamento do seu orçamento:</p>
          <p><a href="${paymentIntent.next_action?.boleto_display_details?.hosted_voucher_url}">Clique aqui para pagar</a></p>
          <p>Atenciosamente,<br>Equipe Smart Build</p>
        `,
      };

      await transporter.sendMail(mailOptions);

      return res.status(200).json({ message: "Boleto enviado com sucesso!", paymentIntent });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao gerar pagamento" });
    }
  }
}
