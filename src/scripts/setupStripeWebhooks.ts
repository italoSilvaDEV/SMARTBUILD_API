import dotenv from 'dotenv';
import { setupWebhook } from '../config/stripeWebHook';

dotenv.config();

async function main() {
  await setupWebhook();
}

main()
  .then(() => {
    console.log('Stripe webhook sync finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Stripe webhook sync failed:', error);
    process.exit(1);
  });
