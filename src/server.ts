import express from 'express';
import { router } from './routes/routes';
import path from 'path';
import dotenv from 'dotenv';
import { setupWebhook } from './config/stripeWebHook';
import { setupAttendanceJobs } from './jobs/attendanceJobs';
import { auditRoutes } from './routes/auditRoutes';
import { setupConnectWebhook } from './config/stripeWebHookConnect';
import { quickbooksWebHooksRoutes } from './routes/quickbooksWebhooksRoutes';
import { setupInvoiceAutoEmailJob } from './jobs/invoiceAutoEmailJob';
const cors = require('cors');


dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight por 24 horas
}));

app.use('/public', express.static(path.join(__dirname, '../public')));

// Webhook deve vir antes do express.json() para não interferir na verificação da assinatura
app.use("/webhook", express.raw({ type: 'application/json' }), router);
app.use("/webhook/connect", express.raw({ type: 'application/json' }), router);

// Para o QBO, nesse caso, você PRECISA de um app.use raw genérico cobrindo /webhooks
app.use("/webhooks", express.raw({ type: "*/*" }), router);

app.use(express.json({ limit: '25mb' }));
app.use(router)

// Register the audit routes
app.use('/api/audits', auditRoutes);

app.use(express.static('public'));

(async () => {
  await setupWebhook(); 
  await setupConnectWebhook();
  // setupAttendanceJobs();
  setupInvoiceAutoEmailJob(); // Iniciar job de envio automático de emails
})();

app.listen(4003, () =>
  console.log("server is running on http://localhost:4003")
)



