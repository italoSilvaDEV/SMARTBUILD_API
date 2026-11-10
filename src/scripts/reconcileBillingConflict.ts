/** Operator recovery: default is inspection only; apply reuses the existing provider handlers. */
import 'dotenv/config';
import Stripe from 'stripe';
import { prisma } from '../utils/prisma';
import { billingCoordinationEnabled, billingReference } from '../services/BillingPurchaseCoordinator';
import { StripeWebHooksController } from '../controllers/stripe/WebHookController';
import { refreshAppleBillingStatus } from '../services/AppleBillingStatusService';
import { GooglePlayBillingService } from '../services/GooglePlayBillingService';

async function main() {
  const id=process.argv[2];
  if(!id || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Usage: reconcileBillingConflict <incident-id> [--apply]');
  const incident=await prisma.billingConflict.findUniqueOrThrow({where:{id}});
  console.log(JSON.stringify({id:incident.id,companyId:incident.companyId,provider:incident.provider,state:incident.state,reason:incident.reason}));
  if(!process.argv.includes('--apply') || incident.state!=='open') return;
  if(!billingCoordinationEnabled()) throw new Error('Billing coordination must be enabled.');
  if(incident.provider==='stripe') {
    // processVerifiedEvent re-reads the provider under the company lock. An event
    // replay cannot select prices, cancel contracts or override another provider.
    await new StripeWebHooksController().processVerifiedEvent({
      type:'customer.subscription.updated',data:{object:{id:incident.contractRef,metadata:{companyId:incident.companyId}}},
    } as unknown as Stripe.Event);
  } else if(incident.provider==='apple') {
    const subscription=await prisma.subscription.findFirst({where:{companyId:incident.companyId,billingProvider:'apple',OR:[{storeOriginalTransactionId:incident.contractRef},{storeTransactionId:incident.contractRef}]}});
    if(!subscription) throw new Error('Restore the verified Apple purchase from its original account; no local contract is linked yet.');
    await refreshAppleBillingStatus(subscription.id);
  } else if(incident.provider==='google') {
    const rows=await prisma.googlePlayPurchaseSync.findMany({where:{companyId:incident.companyId,retired:false},select:{purchaseToken:true}});
    const row=rows.find(value=>billingReference(value.purchaseToken)===incident.contractRef);
    if(!row) throw new Error('Restore the Google purchase from its original account; no linked receipt is available.');
    await new GooglePlayBillingService().sync({token:row.purchaseToken});
  } else throw new Error('Unsupported billing provider.');
  const after=await prisma.billingConflict.findUniqueOrThrow({where:{id}});
  console.log(JSON.stringify({id:after.id,state:after.state,resolvedAt:after.resolvedAt}));
}
main().catch(()=>{console.error('Billing reconciliation did not complete. Inspect the incident and provider status; no manual release was performed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
