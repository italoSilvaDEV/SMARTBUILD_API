import cron from 'node-cron';
import { googlePlayBilling } from '../services/GooglePlayBillingService';
export function setupGooglePlayBillingJob() {
    let running = false, cursor: string | undefined;
    return cron.schedule('* * * * *', async () => {
        if (running || process.env.GOOGLE_PLAY_NATIVE_ENABLED !== 'true')
            return;
        running = true;
        try {
            const seed = await googlePlayBilling.seedExisting(cursor);
            cursor = seed.scanned === 50 ? seed.lastId : undefined;
            const result = await googlePlayBilling.reconcile();
            if (result.scanned)
                console.log('[GooglePlayBilling] Reconciled', result);
        }
        catch {
            console.error('[GooglePlayBilling] Reconciliation failed');
        }
        finally {
            running = false;
        }
    });
}
