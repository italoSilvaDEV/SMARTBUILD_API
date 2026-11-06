import { createHash } from 'crypto';
import { google, androidpublisher_v3 } from 'googleapis';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { stripeConfig } from '../config/stripe';

export const externalTransactionId = (invoiceId: string) => createHash('sha256').update(`smartbuild-android:${invoiceId}`).digest('hex');

export function invoiceAmounts(invoice: Pick<Stripe.Invoice, 'total' | 'total_tax_amounts' | 'currency'>) {
  // The shared catalog is USD. Fail closed for currencies with different minor-unit exponents.
  if (!['usd', 'brl'].includes(invoice.currency)) throw new Error('Unsupported reporting currency');
  const tax = invoice.total_tax_amounts.reduce((sum, entry) => sum + entry.amount, 0);
  if (!Number.isSafeInteger(invoice.total) || tax < 0 || invoice.total < tax) throw new Error('Invalid invoice amounts');
  const amount = (cents: number) => ({ currency: invoice.currency.toUpperCase(), priceMicros: (BigInt(cents) * 10000n).toString() });
  return { originalPreTaxAmount: amount(invoice.total - tax), originalTaxAmount: amount(tax) };
}

function subscriptionId(invoice: Stripe.Invoice) {
  return typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
}

export async function getAndroidReplacementContext(companyId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { companyId, billingProvider: 'stripe', isActive: true }, orderBy: { startDate: 'desc' } });
  if (!subscription?.stripeSubscriptionId) return null;
  const attempt = await prisma.androidBillingAttempt.findFirst({ where: { companyId, subscriptionId: subscription.stripeSubscriptionId, planId: subscription.planId, status: 'completed' }, orderBy: { createdAt: 'desc' } });
  if (!attempt) return null;
  const delivered = await prisma.androidBillingReport.findFirst({ where: { attemptId: attempt.id, status: 'sent' } });
  if (!delivered) return null;
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: subscription.planId } });
  let first: Stripe.Invoice | null = null;
  for await (const invoice of stripeConfig.getClient().invoices.list({ subscription: subscription.stripeSubscriptionId, limit: 100 })) {
    if (invoice.status === 'paid' && invoice.created * 1000 + 999 >= attempt.createdAt.getTime() && invoice.lines.data.some(line => line.price?.id === plan.stripePriceId) && (!first || invoice.created < first.created)) first = invoice;
  }
  return first ? { originalExternalTransactionId: externalTransactionId(first.id) } : null;
}

async function findAttempt(invoice: Stripe.Invoice) {
  const id = subscriptionId(invoice);
  if (!id) return null;
  const stripe = stripeConfig.getClient();
  const subscription = await stripe.subscriptions.retrieve(id);
  const original = subscription.metadata.androidBillingAttemptId;
  if (original) {
    await prisma.androidBillingAttempt.updateMany({ where: { id: original }, data: { subscriptionId: id } });
  }
  const prices = invoice.lines.data.map(line => line.price?.id).filter((price): price is string => !!price);
  const plans = await prisma.plan.findMany({ where: { stripePriceId: { in: prices } }, select: { id: true } });
  return prisma.androidBillingAttempt.findFirst({ where: {
    subscriptionId: id, status: { notIn: ['management', 'expired', 'rejected'] }, planId: { in: plans.map(p => p.id) },
    createdAt: { lte: new Date((invoice.created + 1) * 1000) },
  }, orderBy: { createdAt: 'desc' } });
}

/** Called only after Stripe signature verification. Persistence failure requests a webhook retry. */
export async function enqueueAndroidBillingEvent(event: Stripe.Event) {
  // Off until the migration is deployed. Keep this ON once the first Android subscription exists,
  // even if new checkout is subsequently disabled, so renewals and refunds are still reported.
  if (process.env.ANDROID_BILLING_REPORTING_ENABLED !== 'true') return;
  const stripe = stripeConfig.getClient();
  let invoice: Stripe.Invoice | null = null;
  let chargeId: string | undefined;
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    invoice = event.data.object as Stripe.Invoice;
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const id = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
    if (!id) return;
    chargeId = charge.id;
    invoice = await stripe.invoices.retrieve(id);
  } else return;
  const attempt = await findAttempt(invoice);
  if (!attempt) return;
  const id = chargeId ? externalTransactionId(event.id) : externalTransactionId(invoice.id);
  await prisma.androidBillingReport.upsert({ where: { id }, update: {}, create: {
    id, invoiceId: invoice.id, subscriptionId: subscriptionId(invoice)!, attemptId: attempt.id,
    payload: { invoice, ...(chargeId ? { chargeId } : {}) } as unknown as Prisma.InputJsonValue,
  } });
  await prisma.androidBillingAttempt.updateMany({ where: { id: attempt.id, status: 'pending' }, data: { status: 'completed' } });
}

async function deliver(report: { id: string; attemptId: string; subscriptionId: string; payload: Prisma.JsonValue }) {
  const payload = report.payload as unknown as { invoice: Stripe.Invoice; chargeId?: string };
  const invoice = payload.invoice;
  const attempt = await prisma.androidBillingAttempt.findUniqueOrThrow({ where: { id: report.attemptId } });
  const stripe = stripeConfig.getClient();
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: attempt.planId } });
  const invoices: Stripe.Invoice[] = [];
  // Enumerate the series, not just the latest 10 invoices. Out-of-order webhooks are expected.
  for await (const item of stripe.invoices.list({ subscription: report.subscriptionId, limit: 100 })) {
    if (item.created * 1000 + 999 >= attempt.createdAt.getTime() && item.status === 'paid' && item.lines.data.some(line => line.price?.id === plan.stripePriceId)) invoices.push(item);
  }
  invoices.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const first = invoices[0];
  if (!first) throw new Error('Initial paid invoice is not available yet');
  const api = google.androidpublisher({ version: 'v3', auth: new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '{}'),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  }) });
  const parent = `applications/${process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.anonymous.smartbuildadminapp'}`;
  async function send(item: Stripe.Invoice) {
    const id = externalTransactionId(item.id);
    const body: androidpublisher_v3.Schema$ExternalTransaction = {
      ...invoiceAmounts(item), transactionTime: new Date((item.status_transitions.paid_at || item.created) * 1000).toISOString(),
      userTaxAddress: { regionCode: item.customer_address?.country || attempt.country },
      recurringTransaction: item.id === first.id
        ? { externalTransactionToken: attempt.externalTransactionToken, externalSubscription: { subscriptionType: 'RECURRING' } }
        : { initialExternalTransactionId: externalTransactionId(first.id) },
    };
    try { await api.externaltransactions.createexternaltransaction({ parent, externalTransactionId: id, requestBody: body }); }
    catch (error) {
      if ((error as { code?: number }).code !== 409) throw error;
      // A duplicate is success only if it is the SAME invoice amount/currency.
      const existing = await api.externaltransactions.getexternaltransaction({ name: `${parent}/externalTransactions/${id}` });
      if (existing.data.originalPreTaxAmount?.priceMicros !== body.originalPreTaxAmount?.priceMicros || existing.data.originalTaxAmount?.priceMicros !== body.originalTaxAmount?.priceMicros || existing.data.originalPreTaxAmount?.currency !== body.originalPreTaxAmount?.currency) throw new Error('External transaction conflict');
    }
  }
  await send(first);
  if (invoice.id !== first.id) await send(invoice);
  if (payload.chargeId) {
    // Replay the cumulative refund list using stable refund IDs. Partial refunds remain idempotent.
    const refunds: Stripe.Refund[] = [];
    for await (const refund of stripe.refunds.list({ charge: payload.chargeId, limit: 100 })) if (refund.status === 'succeeded') refunds.push(refund);
    refunds.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
    const tax = invoice.total_tax_amounts.reduce((sum, entry) => sum + entry.amount, 0);
    let cumulative = 0;
    let taxRefunded = 0;
    for (const refund of refunds) {
      cumulative += refund.amount;
      const cumulativeTax = Math.round(tax * cumulative / invoice.total);
      const refundTax = cumulativeTax - taxRefunded;
      taxRefunded = cumulativeTax;
      try { await api.externaltransactions.refundexternaltransaction({ name: `${parent}/externalTransactions/${externalTransactionId(invoice.id)}`, requestBody: {
        refundTime: new Date(refund.created * 1000).toISOString(),
        ...(cumulative === invoice.total ? { fullRefund: {} } : { partialRefund: {
          refundId: externalTransactionId(refund.id),
          refundPreTaxAmount: { currency: invoice.currency.toUpperCase(), priceMicros: (BigInt(refund.amount - refundTax) * 10000n).toString() },
        } }),
      } }); } catch (error) {
        // Google deduplicates partial refunds by refundId.
        if ((error as { code?: number }).code !== 409) throw error;
      }
    }
  }
}

export async function processAndroidBillingReports() {
  if (process.env.ANDROID_BILLING_REPORTING_ENABLED !== 'true') return;
  const now = new Date();
  const reports = await prisma.androidBillingReport.findMany({ where: { status: { in: ['pending', 'processing'] }, nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: 20 });
  for (const report of reports) {
    const lease = new Date(Date.now() + 10 * 60 * 1000);
    const claimed = await prisma.androidBillingReport.updateMany({ where: { id: report.id, status: report.status, nextAttemptAt: report.nextAttemptAt }, data: { status: 'processing', nextAttemptAt: lease, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      await deliver(report);
      await prisma.androidBillingReport.updateMany({ where: { id: report.id, nextAttemptAt: lease }, data: { status: 'sent', lastError: null } });
    } catch (error) {
      // Do not log Google tokens, Stripe payloads or credentials.
      const code = (error as { code?: string | number }).code;
      await prisma.androidBillingReport.updateMany({ where: { id: report.id, nextAttemptAt: lease }, data: {
        status: 'pending', lastError: `Reporting failed (${code || 'retry required'})`,
        nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(report.attempts, 7))),
      } });
      console.error('[AndroidBilling] Reporting retry required', report.id, code || 'unknown');
    }
  }
}
