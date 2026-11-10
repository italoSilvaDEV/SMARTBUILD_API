import 'dotenv/config';
import { setupGooglePlayBillingJob } from './jobs/googlePlayBillingJob';
import express from 'express';
import { accountDeletionRoutes } from './routes/accountDeletionRoutes';
import { setupAppAnalyticsRetentionJob } from './jobs/appAnalyticsRetentionJob';
import compression from 'compression';
import { createServer } from 'http';
import { SocketService } from './services/SocketService';
import { router } from './routes/routes';
import path from 'path';
import { setupAttendanceJobs } from './jobs/attendanceJobs';
import { auditRoutes } from './routes/auditRoutes';
// setupConnectWebhook is now deprecated - setupWebhook() handles all webhooks
import { quickbooksWebHooksRoutes } from './routes/quickbooksWebhooksRoutes';
import { setupInvoiceAutoEmailJob } from './jobs/invoiceAutoEmailJob';
import { setupTrackingHealthJob } from './jobs/trackingHealthJob';
import { setupTrackingRetentionJob } from './jobs/trackingRetentionJob';
import { setupMetaPurchaseRetryJob } from './jobs/metaPurchaseRetryJob';
import { setupAppleBillingStatusJob } from './jobs/appleBillingStatusJob';
import { StripeWebHooksController } from './controllers/stripe/WebHookController';
import { StripeWebHookControllerConnect } from './controllers/stripe/WebHookControllerConnect';
import { setupAndroidBillingReportingJob } from './jobs/androidBillingReportingJob';
import { StripeExtraEmployeeService } from './services/StripeExtraEmployeeService';
import { assistantWhatsappWebhookRoutes } from './routes/assistantWhatsappRoutes';
const cors = require('cors');


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

//  WhatsApp/QuickBooks webhooks: aplicar express.raw para /webhooks/*
app.use('/webhooks', express.raw({ type: '*/*' }), assistantWhatsappWebhookRoutes);
app.use('/webhooks', express.raw({ type: '*/*' }), quickbooksWebHooksRoutes);

//  DEPOIS registrar o express.json para as outras rotas
// Compress API payloads without changing their JSON contract. Webhooks stay
// above this middleware so their raw-body verification path remains untouched.
app.use(compression({ threshold: 1024 }));
app.use('/account-deletion', accountDeletionRoutes);
app.use('/mobile/analytics/events', express.json({ limit: '64kb' }));
app.use('/mobile/analytics/auth-events', express.json({ limit: '16kb' }));
app.use('/landing/analytics/events', express.json({ limit: '32kb' }));
app.use(express.json({ limit: '25mb' }));
app.use(router)

// Register the audit routes
app.use('/api/audits', auditRoutes);

app.use(express.static('public'));

(async () => {
  // Note: Extra Employee config is created on-demand when first accessed
  // setupAttendanceJobs();
  setupInvoiceAutoEmailJob(); // Iniciar job de envio automático de emails
  setupTrackingHealthJob();
  setupTrackingRetentionJob();
  setupMetaPurchaseRetryJob();
  setupAppleBillingStatusJob();
  setupGooglePlayBillingJob();
  setupAndroidBillingReportingJob();
  setupAppAnalyticsRetentionJob();
})();

// Node closes idle keep-alive sockets after 5s by default, but mobile clients
// (Android OkHttp) reuse pooled connections for minutes. Reusing a socket the
// server already closed makes the next request fail instantly (seen on receipt
// scan uploads after picking a photo). Keep idle sockets longer than typical
// client/proxy pools; headersTimeout must stay above keepAliveTimeout.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(4003, () =>
  console.log("server is running on http://localhost:4003")
)
