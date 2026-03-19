import express from 'express';
import { createServer } from 'http';
import { SocketService } from './services/SocketService';
import { router } from './routes/routes';
import path from 'path';
import dotenv from 'dotenv';
import { setupWebhook } from './config/stripeWebHook';
import { setupAttendanceJobs } from './jobs/attendanceJobs';
import { auditRoutes } from './routes/auditRoutes';
import { setupConnectWebhook } from './config/stripeWebHookConnect';
import { quickbooksWebHooksRoutes } from './routes/quickbooksWebhooksRoutes';
import { setupInvoiceAutoEmailJob } from './jobs/invoiceAutoEmailJob';
import { StripeWebHooksController } from './controllers/stripe/WebHookController';
import { StripeWebHookControllerConnect } from './controllers/stripe/WebHookControllerConnect';
import { StripeExtraEmployeeService } from './services/StripeExtraEmployeeService';
const cors = require('cors');

dotenv.config();

const app = express();
const server = createServer(app);

// Inicializar Socket.io
SocketService.init(server);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  exposedHeaders: ['new-token'],
  maxAge: 86400 // Cache preflight por 24 horas
}));

app.use('/public', express.static(path.join(__dirname, '../public')));

// Instanciar controllers de webhook do Stripe
const stripeWebhookController = new StripeWebHooksController();
const stripeConnectWebhookController = new StripeWebHookControllerConnect();

//  Webhooks devem vir ANTES do express.json() para não interferir na verificação da assinatura
//  Stripe webhooks: aplicar express.raw apenas para essas rotas específicas
app.post('/webhook', 
  express.raw({ type: 'application/json' }), 
  (req, res) => stripeWebhookController.handleWebhook(req, res)
);

app.post('/webhook/connect', 
  express.raw({ type: 'application/json' }), 
  (req, res) => stripeConnectWebhookController.handleConnectWebhook(req, res)
);

//  QuickBooks webhooks: aplicar express.raw para /webhooks/*
app.use('/webhooks', express.raw({ type: '*/*' }), quickbooksWebHooksRoutes);

//  DEPOIS registrar o express.json para as outras rotas
app.use(express.json({ limit: '25mb' }));
app.use(router)

// Register the audit routes
app.use('/api/audits', auditRoutes);

app.use(express.static('public'));

(async () => {
  await setupWebhook();
  await setupConnectWebhook();
  // Note: Extra Employee config is created on-demand when first accessed
  // setupAttendanceJobs();
  setupInvoiceAutoEmailJob(); // Iniciar job de envio automático de emails
})();

server.listen(4003, () =>
  console.log("server is running on http://localhost:4003")
)



