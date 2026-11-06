import cron from 'node-cron';
import { processAndroidBillingReports } from '../services/AndroidBillingReporting';

export function setupAndroidBillingReportingJob() {
  let running = false;
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try { await processAndroidBillingReports(); }
    catch { console.error('[AndroidBilling] Reporting job failed'); }
    finally { running = false; }
  });
}
