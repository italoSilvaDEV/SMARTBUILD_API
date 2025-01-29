import { Router } from "express";

import { checkToken } from "../middlewares/checkToken";
import { PaymentController } from "../controllers/stripe/PaymentController";


const paymentRoutes = Router();
const Payment = new PaymentController();

// Rota para criar um boleto e enviá-lo por e-mail
paymentRoutes.post("/create-invoice", checkToken, Payment.createInvoice);

export default paymentRoutes;
