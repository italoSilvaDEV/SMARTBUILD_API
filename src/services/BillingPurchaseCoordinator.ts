import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { assertNoForeignSubscription, assertNoPendingGooglePurchase, PurchaseProvider, SubscriptionPurchaseConflict, conflictingProvider } from './SubscriptionPurchaseGuard';

export const billingCoordinationEnabled = () => process.env.BILLING_COORDINATION_ENABLED === 'true';
export const billingReference = (value: string) => createHash('sha256').update(value).digest('hex');
export class BillingAttemptError extends Error {
  constructor(public readonly code: string, public readonly provider: string, public readonly status = 409) {
    super(`${code}: manage or finish the existing ${provider} subscription before trying again.`);
  }
}
export async function lockBillingCompany(tx: Prisma.TransactionClient, companyId: string) {
  const company = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM Company WHERE id = ${companyId} FOR UPDATE`;
  if (!company.length) throw new BillingAttemptError('COMPANY_NOT_FOUND','unknown',404);
}
export async function recordBillingConflict(tx: Prisma.TransactionClient, companyId:string, provider:PurchaseProvider, contractRef:string, blockingProvider:string, reason='PROVIDER_CONFLICT') {
  const id=billingReference(`${companyId}:${provider}:${contractRef}`);
  await tx.billingConflict.upsert({where:{id}, create:{id,companyId,provider,contractRef,blockingProvider,reason},update:{state:'open',blockingProvider,reason,resolvedAt:null,lastSeenAt:new Date()}});
}
export async function resolveBillingConflict(tx: Prisma.TransactionClient, companyId:string, provider:PurchaseProvider, contractRef:string) {
  await tx.billingConflict.updateMany({where:{id:billingReference(`${companyId}:${provider}:${contractRef}`),state:'open'},data:{state:'resolved',resolvedAt:new Date()}});
}
// Call with Company locked. A verified late payment is never silently discarded:
// the incident commits even when entitlement must remain on its existing provider.
export async function admitVerifiedBilling(tx: Prisma.TransactionClient, companyId:string, provider:PurchaseProvider, contractRef:string, active:boolean, allowedSubscriptionIds: string[] = [], terminal=false) {
  if (!billingCoordinationEnabled()) return true;
  if (!active) {
    if(terminal) {
      await resolveBillingConflict(tx,companyId,provider,contractRef);
      await tx.billingPurchaseAttempt.updateMany({where:{companyId,provider,contractRef,state:{notIn:['closed','expired']}},data:{state:'closed'}});
    } else {
      await tx.billingPurchaseAttempt.updateMany({where:{companyId,provider,contractRef:null,state:{in:['creating','open','launched']}},data:{contractRef}});
    }
    return true;
  }
  try { await assertNoForeignSubscription(tx,companyId,provider); }
  catch(error) {
    if (!(error instanceof SubscriptionPurchaseConflict)) throw error;
    await recordBillingConflict(tx,companyId,provider,contractRef,error.provider);
    return false;
  }

  const sameProvider = await tx.subscription.findMany({where:{companyId,billingProvider:provider,id:{notIn:allowedSubscriptionIds}},
    include:{plan:{select:{validityType:true}}}});
  const different = sameProvider.filter(row => provider==='stripe' ? row.stripeSubscriptionId!==contractRef
    : provider==='apple' ? row.storeOriginalTransactionId!==contractRef && row.storeTransactionId!==contractRef
    : billingReference(row.googlePurchaseToken || '')!==contractRef);
  const ledger = provider==='google' ? await tx.googlePlayPurchaseSync.findMany({where:{companyId,retired:false}}) : [];
  const blocker = conflictingProvider(different.map(row=>({...row,googleState:ledger.find(l=>l.subscriptionId===row.id)?.state})),
    provider==='stripe'?'apple':'stripe');
  if(blocker) { await recordBillingConflict(tx,companyId,provider,contractRef,provider,'ANOTHER_CONTRACT'); return false; }
  let attempt=await tx.billingPurchaseAttempt.findUnique({where:{companyId}});
  if(attempt?.state==='reserved' && attempt.expiresAt<=new Date()) attempt=await tx.billingPurchaseAttempt.update({where:{companyId},data:{state:'expired'}});

  if(attempt && !['closed','expired'].includes(attempt.state) && attempt.provider!==provider) {
    await recordBillingConflict(tx,companyId,provider,contractRef,attempt.provider,'OTHER_CHECKOUT_UNRESOLVED');return false;
  }
  await resolveBillingConflict(tx,companyId,provider,contractRef);
  if(attempt?.provider===provider) await tx.billingPurchaseAttempt.update({where:{companyId},data:{state:'closed'}});
  return true;
}

export class BillingPurchaseCoordinator {
  constructor(private readonly db: PrismaClient = prisma) {}
  async purchaseBlock(companyId:string) {
    const incident=await this.db.billingConflict.findFirst({where:{companyId,state:'open'},select:{provider:true}});
    if(incident) return new BillingAttemptError('BILLING_REQUIRES_REVIEW',incident.provider);
    const attempt=await this.db.billingPurchaseAttempt.findUnique({where:{companyId}});
    if(attempt && !['closed','expired'].includes(attempt.state) && !(attempt.state==='reserved' && attempt.expiresAt<=new Date()))
      return new BillingAttemptError('CHECKOUT_IN_PROGRESS',attempt.provider);
    return null;
  }
  async reserve(companyId:string,provider:PurchaseProvider,planId:string,requestKey:string,params?:Prisma.InputJsonValue, allowApplePlanChange=false) {
    return this.db.$transaction(async tx=>{
      await lockBillingCompany(tx,companyId);
      const incident=await tx.billingConflict.findFirst({where:{companyId,state:'open'},select:{provider:true}});
      if(incident) throw new BillingAttemptError('BILLING_REQUIRES_REVIEW',incident.provider);
      await assertNoForeignSubscription(tx,companyId,provider);
      await assertNoPendingGooglePurchase(tx,companyId);
      const paidRows=await tx.subscription.findMany({where:{companyId,billingProvider:provider},include:{plan:{select:{validityType:true}}}});
      const ledger=provider==='google'?await tx.googlePlayPurchaseSync.findMany({where:{companyId,retired:false}}):[];
      if(!(provider==='apple' && allowApplePlanChange && paidRows.filter(row=>row.isActive && row.plan.validityType!=='FREE').length===1) && conflictingProvider(paidRows.map(row=>({...row,googleState:ledger.find(l=>l.subscriptionId===row.id)?.state})),provider==='stripe'?'apple':'stripe'))
        throw new BillingAttemptError('SUBSCRIPTION_ALREADY_EXISTS',provider);
      let current=await tx.billingPurchaseAttempt.findUnique({where:{companyId}});
      // Only an unlaunched native reservation can time out locally. Launched store
      // sheets and uncertain Stripe POSTs require a confirmed outcome.
      if(current?.state==='reserved' && current.expiresAt<=new Date()) {
        current=await tx.billingPurchaseAttempt.update({where:{companyId},data:{state:'expired'}});
      }
      if(current && !['closed','expired'].includes(current.state)) {
        if(current.provider===provider && current.planId===planId && current.requestKey===requestKey) return current;
        throw new BillingAttemptError('CHECKOUT_IN_PROGRESS',current.provider);
      }
      const data={id:randomUUID(),provider,planId,requestKey,state:provider==='stripe'?'creating':'reserved',expiresAt:new Date(Date.now()+15*60000),params:params??Prisma.JsonNull,contractRef:null,checkoutId:null,checkoutUrl:null,createdAt:new Date()};
      return tx.billingPurchaseAttempt.upsert({where:{companyId},create:{companyId,...data},update:data});
    },{isolationLevel:'ReadCommitted',timeout:15000});
  }
  async launch(companyId:string,id:string) {
    const changed=await this.db.billingPurchaseAttempt.updateMany({where:{companyId,id,state:'reserved',expiresAt:{gt:new Date()}},data:{state:'launched'}});
    if(changed.count!==1) {
      const current=await this.db.billingPurchaseAttempt.findUnique({where:{companyId}});
      if(current?.id!==id || current.state!=='launched') throw new BillingAttemptError('CHECKOUT_REQUIRES_REFRESH','store');
    }
  }
  async finishNative(companyId:string,id:string) {
    return this.db.$transaction(async tx=>{
      await lockBillingCompany(tx,companyId);
      await assertNoPendingGooglePurchase(tx,companyId);
      // This releases a UI attempt, never cancels a contract. A late receipt still
      // runs admission and is durably recorded if another provider won meanwhile.
      await tx.billingPurchaseAttempt.updateMany({where:{companyId,id,provider:{in:['apple','google']},state:{in:['reserved','launched']}},data:{state:'closed'}});
    },{isolationLevel:'ReadCommitted'});
  }
  async stripeCheckout(companyId:string,planId:string,params:any,gateway:{create:(params:any,key:string)=>Promise<any>;retrieve:(id:string)=>Promise<any>}) {
    let current=await this.db.billingPurchaseAttempt.findUnique({where:{companyId}});
    if(current?.provider==='stripe' && current.checkoutId && !['closed','expired'].includes(current.state)) {
      const session=await gateway.retrieve(current.checkoutId);
      if(session.status==='expired') await this.db.billingPurchaseAttempt.updateMany({where:{companyId,id:current.id,checkoutId:session.id},data:{state:'expired'}});
      else if(session.status==='complete') throw new BillingAttemptError('PAYMENT_AWAITING_CONFIRMATION','stripe');
    }
    // A repeated web request reuses the same *stored* params and Stripe key;
    // regenerated timestamps/attribution must not mutate an in-flight POST.
    const requestKey=billingReference(JSON.stringify({planId,price:params.line_items,customer:params.customer,success:params.success_url,cancel:params.cancel_url}));
    current=await this.reserve(companyId,'stripe',planId,requestKey,JSON.parse(JSON.stringify(params)));
    if(current.checkoutId && current.checkoutUrl) return {id:current.checkoutId,url:current.checkoutUrl};
    // Never reuse a pruned Stripe idempotency key after its guaranteed window.
    if(current.createdAt.getTime()+23*3600000<Date.now()) throw new BillingAttemptError('CHECKOUT_REQUIRES_RECONCILIATION','stripe');
    const session=await gateway.create(current.params,`smartbuild-billing-${current.id}`);
    const saved=await this.db.billingPurchaseAttempt.updateMany({where:{companyId,id:current.id,state:'creating'},data:{checkoutId:session.id,checkoutUrl:session.url,state:'open',expiresAt:new Date(session.expires_at*1000)}});

    if(saved.count!==1) {
      const winner=await this.db.billingPurchaseAttempt.findUnique({where:{companyId}});
      if(winner?.id!==current.id || winner.checkoutId!==session.id || winner.state!=='open')
        throw new BillingAttemptError('CHECKOUT_REQUIRES_RECONCILIATION','stripe');
    }
    return session;
  }
}
export const billingPurchaseCoordinator = new BillingPurchaseCoordinator();
