import express from 'express';
import { router } from './routes/routes';
import path from 'path';
import dotenv from 'dotenv';
import { setupWebhook } from './config/stripeWebHook';
import { setupAttendanceJobs } from './jobs/attendanceJobs';
const cors = require('cors');


dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/public', express.static(path.join(__dirname, '../public')));

// Webhook deve vir antes do express.json() para não interferir na verificação da assinatura
app.use("/webhook", express.raw({ type: 'application/json' }), router);

app.use(express.json())
app.use(router)


app.use(express.static('public'));

(async () => {
  await setupWebhook(); 
  setupAttendanceJobs(); 
})();

app.listen(4003, () =>
  console.log("server is running on http://localhost:4003")
)



