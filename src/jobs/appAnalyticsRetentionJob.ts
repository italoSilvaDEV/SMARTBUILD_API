import cron from 'node-cron';
import { prisma } from '../utils/prisma';

export function setupAppAnalyticsRetentionJob() {
  let running = false;
  cron.schedule('43 * * * *', async () => {
    if (running || process.env.APP_ANALYTICS_ENABLED !== 'true') return;
    running = true;
    try {
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      // Bounded deletes, exclusively on the telemetry table.
      for (let batch = 0; batch < 10; batch++) {
        const rows = await prisma.appAnalyticsEvent.findMany({
          where: { occurredAt: { lt: cutoff } }, select: { id: true }, take: 1000,
        });
        if (!rows.length) break;
        await prisma.appAnalyticsEvent.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
      }
    } catch { console.error('[AppAnalytics] retention failed'); }
    finally { running = false; }
  });
}
