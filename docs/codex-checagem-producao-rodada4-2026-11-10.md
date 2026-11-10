# Checagem só leitura da produção — rodada 4: status de assinatura hoje × código novo

Pasta da API: `/projetos/smartbuild-api`. **Só leitura**, com as mesmas regras das rodadas anteriores.

## Regras

- **Nada pode ser alterado:**
  - banco: nenhuma escrita, nenhum `prisma migrate`, `db push` ou `generate`;
  - nenhum `git` que altere algo;
  - nenhum build ou `npm install`;
  - nenhuma edição de arquivo do projeto ou do `.env`;
  - nenhum restart do pm2 ou do nginx.
- **Nenhum segredo nem e-mail no relatório.** Empresas só pelos 8 primeiros caracteres do `id`, como o script já imprime.
- **Arquivos temporários só em `/tmp/sb-check/`.** O script apaga a pasta no final.
- **Se algo fugir do esperado, pare e relate.**

## O que o script faz

1. Cria em `/tmp/sb-check/cmp/` três arquivos JavaScript:
   - a regra de status do código novo (`SubscriptionAccessDecision.js`, compilada do `new-hml` `85720d9`), com a dependência dela (`planPermissions.js`);
   - `run.js`, que reproduz linha a linha a regra de status de hoje (`101d8b4`) da web e do app.
2. Com o Prisma da própria API, faz **só leituras** (`findMany` e `findFirst`) de empresas, planos e assinaturas.
3. Compara, para cada empresa, se ela está liberada ou bloqueada hoje e no código novo.
4. Apaga `/tmp/sb-check/`.

Ele não chama Stripe, Apple nem Google, e não grava nada.

## Como rodar

1. Salve o bloco abaixo em `/tmp/sb-compare.sh`, exatamente como está, por exemplo com `cat > /tmp/sb-compare.sh <<'FIM' ... FIM`.
2. Rode `bash /tmp/sb-compare.sh`.
3. Confira os 3 hashes `sha256` que o script imprime. Eles precisam ser **exatamente** estes:
   - `3b4aa043af01066ef72cf6be0d3e01ca36ecdcc5d9a07ecafcf146c4328ecf7e`  `SubscriptionAccessDecision.js`
   - `31b7214018516614c98f2c72b42de4bbbf4e660bdd9c45b64d74e97e0095b868`  `planPermissions.js`
   - `05b520940d8f49bc0ac63b7a3d30c6c14728d1935534cb94bb3b8f9527c5778a`  `run.js`

   Se algum for diferente, a cópia corrompeu. Nesse caso, ignore o resultado e relate.
4. No final, apague `/tmp/sb-compare.sh`.

```bash
set -euo pipefail
APP="${SB_APP:-/projetos/smartbuild-api}"
test -f "$APP/.env" && test -d "$APP/node_modules/@prisma/client" || { echo "pasta da API nao encontrada: $APP"; exit 1; }
rm -rf /tmp/sb-check && mkdir -p /tmp/sb-check/cmp/services /tmp/sb-check/cmp/utils && chmod 700 /tmp/sb-check
cat > /tmp/sb-check/cmp/utils/planPermissions.js <<'SB_EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEffectivePermissions = resolveEffectivePermissions;
function resolveEffectivePermissions(planPermissions, officePermissions, officeName, legacyPlanPermissions = false) {
    const uniquePlanPermissions = [...new Set(planPermissions.filter(Boolean))];
    const normalizedOfficeName = String(officeName || '').trim().toLowerCase();
    if (normalizedOfficeName === 'owner' || normalizedOfficeName === 'administrator') {
        return uniquePlanPermissions;
    }
    if (officePermissions.length === 0 && legacyPlanPermissions) {
        return uniquePlanPermissions;
    }
    const planPermissionSet = new Set(uniquePlanPermissions);
    return [
        ...new Set(officePermissions.filter((permission) => permission && planPermissionSet.has(permission))),
    ];
}

SB_EOF
cat > /tmp/sb-check/cmp/services/SubscriptionAccessDecision.js <<'SB_EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSubscriptionPlanConflict = hasSubscriptionPlanConflict;
exports.evaluateSubscriptionAccess = evaluateSubscriptionAccess;
exports.compareSubscriptionAccess = compareSubscriptionAccess;
exports.resolveMappedStorePlan = resolveMappedStorePlan;
exports.resolveCompanySubscriptionStatus = resolveCompanySubscriptionStatus;
const planPermissions_1 = require("../utils/planPermissions");
// A current subscription cannot authorize the unrelated plan stored on a company.
// This detects an inconsistency only; it never chooses or persists a replacement.
function hasSubscriptionPlanConflict(companyId, planId, subscription) {
    return Boolean(subscription?.isActive && subscription.companyId === companyId && subscription.planId !== planId);
}
// Paying during a FREE grant leaves both rows active until the grant ends. Only the paid
// contract already applied to the company supersedes it; rows of unknown type stay conflicts.
function withoutSupersededFree(rows, companyPlanId) {
    const paidApplied = rows.some(row => row.isActive && row.plan && row.plan.validityType !== 'FREE' && row.planId === companyPlanId);
    return paidApplied ? rows.filter(row => !(row.isActive && row.plan?.validityType === 'FREE')) : [...rows];
}
function evaluateRow(row, free, now) {
    const start = row.startDate.getTime();
    const end = row.endDate.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        return 'review';
    if (start > now)
        return 'deny';
    if (row.confirmedState) {
        if (['pending', 'suspended', 'expired', 'revoked'].includes(row.confirmedState))
            return 'deny';
        if (!['active', 'trial', 'grace', 'non_renewing'].includes(row.confirmedState))
            return 'review';
        if (end <= now)
            return 'deny';
        // A confirmed state conflicting with the local active flag needs reconciliation.
        return row.isActive ? 'allow' : 'review';
    }
    if (!row.isActive)
        return 'deny';
    if (free)
        return end > now ? 'allow' : 'deny';
    if (row.billingProvider === 'stripe') {
        // Match the existing paid Stripe web status: local expiry alone is not authoritative.
        // Financial ambiguity still requires review; no provider state is inferred here.
        if (row.paymentFailed || row.stripeSubscriptionCanceled)
            return 'review';
        return 'allow';
    }
    if (row.billingProvider === 'apple' || row.billingProvider === 'google') {
        if (row.appleBillingStatus === 'refunded' || row.appleBillingStatus === 'expired')
            return 'deny';
        if (end <= now)
            return 'deny';
        if (row.billingProvider === 'apple' && row.appleBillingStatus === 'grace')
            return 'allow'; // Persisted only with the provider-confirmed grace end.
        if (row.paymentFailed)
            return 'review'; // A boolean alone is not evidence of grace.
        return 'allow';
    }
    return 'review'; // Legacy paid grants require classification, not price inference.
}
function evaluateSubscriptionAccess(input) {
    const result = (decision, reason, row) => ({
        decision, reason, subscriptionId: row?.id ?? null,
        planId: input.plan?.id ?? null,
        validityType: input.plan?.validityType ?? null,
        validityDuration: input.plan?.validityDuration ?? null,
        permissions: decision === 'allow' && input.plan
            ? (0, planPermissions_1.resolveEffectivePermissions)(input.plan.permissions, input.officePermissions, input.officeName, input.legacyPlanPermissions) : [],
        seatLimit: input.allowedEmployees + input.extraEmployees,
        autoRenewing: row?.autoRenewing ?? null,
        paymentFailed: decision === 'allow' && row && hasConfirmedStoreGrace(row) ? false : row?.paymentFailed ?? false,
    });
    if (!input.hasCompanyAccess)
        return result('deny', 'company_access_required');
    if (!input.plan)
        return result('deny', 'plan_missing');
    if (!Number.isFinite(input.now.getTime()) || ![input.allowedEmployees, input.extraEmployees].every(n => Number.isInteger(n) && n >= 0)) {
        return result('review', 'invalid_snapshot');
    }
    const rows = withoutSupersededFree(input.subscriptions.filter(row => row.companyId === input.companyId
        && !(row.plan?.validityType === 'FREE' && row.endDate.getTime() <= input.now.getTime())), input.plan.id);
    if (new Set(rows.map(row => row.id)).size !== rows.length)
        return result('review', 'duplicate_snapshot');
    // A local expiry is not proof that a second active billing record was closed.
    if (rows.filter(row => row.isActive).length > 1)
        return result('review', 'multiple_subscriptions');
    const evaluated = rows.map(row => ({ row, decision: evaluateRow(row, input.plan.validityType === 'FREE', input.now.getTime()) }));
    const candidates = evaluated.filter(item => item.decision !== 'deny');
    if (input.pendingSubscription && !candidates.length) {
        return result('deny', 'pending_subscription');
    }
    if (candidates.length > 1)
        return result('review', 'multiple_subscriptions');
    const candidate = candidates[0];
    if (!candidate)
        return result('deny', 'no_current_subscription');
    if (candidate.row.planId !== input.plan.id)
        return result('review', 'company_subscription_plan_mismatch', candidate.row);
    if (candidate.decision === 'review')
        return result('review', 'provider_or_legacy_state_required', candidate.row);
    return result('allow', 'confirmed_local_access', candidate.row);
}
// Receives the consumer's actual old response. No duplicate implementation of its rules.
// Returns field names only; no receipts, credentials or customer data in diagnostic logs.
function compareSubscriptionAccess(existing, candidate) {
    const differences = [];
    if (candidate.decision === 'review')
        differences.push('manual_review_required');
    const previousAllowed = !existing.isExpired && !existing.paymentFailed && !existing.stripeSubscriptionCanceled;
    if (candidate.decision !== 'review' && previousAllowed !== (candidate.decision === 'allow'))
        differences.push('access');
    if (existing.planId !== candidate.planId)
        differences.push('planId');
    if (existing.subscriptionId !== candidate.subscriptionId)
        differences.push('subscriptionId');
    if (existing.seatLimit !== candidate.seatLimit)
        differences.push('seatLimit');
    if (existing.paymentFailed !== candidate.paymentFailed)
        differences.push('paymentFailed');
    if (JSON.stringify([...new Set(existing.permissions)].sort()) !== JSON.stringify([...new Set(candidate.permissions)].sort()))
        differences.push('permissions');
    return differences;
}
function resolveMappedStorePlan(productId, mappings) {
    const matches = mappings.filter(mapping => mapping.productId === productId);
    if (matches.length !== 1 || !matches[0].planId.trim())
        return null;
    return matches[0].planId;
}
function hasConfirmedStoreGrace(row) {
    return row.billingProvider !== 'stripe' && (row.confirmedState === 'grace'
        || row.billingProvider === 'apple' && row.appleBillingStatus === 'grace');
}
// Compatibility projection for existing consumers. No database/provider calls or writes.
// Stripe financial flags remain separate from isExpired, exactly as in the web contract.
function resolveCompanySubscriptionStatus(input) {
    const active = withoutSupersededFree(input.subscriptions.filter(row => row.companyId === input.companyId && row.isActive
        && !(row.plan?.validityType === 'FREE' && row.endDate.getTime() <= input.now.getTime())), input.plan?.id);
    const detected = active.length > 1 ? 'multiple_subscriptions'
        : hasSubscriptionPlanConflict(input.companyId, input.plan?.id, active[0])
            ? 'company_subscription_plan_mismatch' : null;
    // Production (101d8b4) reads the newest active row and never compares it with Company.planId,
    // so existing companies in either state keep working and the conflict is only reported.
    // Pending signups and companies without a plan were already blocked there and stay blocked.
    const tolerated = !!detected && !!input.plan && !input.pendingSubscription;
    const byStart = [...active].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    const newest = byStart.find(row => row.startDate.getTime() <= input.now.getTime()) ?? byStart[0] ?? null;
    const subscription = tolerated ? newest : active.length === 1 ? active[0] : null;
    const access = evaluateSubscriptionAccess({ ...input,
        subscriptions: tolerated && newest ? [{ ...newest, planId: input.plan.id }] : active,
        hasCompanyAccess: true, officePermissions: [], officeName: 'Owner' });
    const conflict = tolerated ? null : detected;
    const paid = input.plan && input.plan.validityType !== 'FREE';
    const stripeFinancialReview = paid && subscription?.billingProvider === 'stripe'
        && !subscription.confirmedState && access.reason === 'provider_or_legacy_state_required'
        && (subscription.paymentFailed || subscription.stripeSubscriptionCanceled)
        && Number.isFinite(subscription.startDate.getTime()) && Number.isFinite(subscription.endDate.getTime())
        && subscription.endDate >= subscription.startDate && subscription.startDate <= input.now;
    const isExpired = !!conflict || (access.decision !== 'allow' && !(stripeFinancialReview && !input.pendingSubscription));
    const accessIssue = conflict || (access.decision === 'review' && !stripeFinancialReview ? access.reason : null);
    return {
        subscription, access, accessIssue, isExpired, billingReview: tolerated ? detected : null,
        paymentFailed: paid && subscription
            ? (hasConfirmedStoreGrace(subscription) && access.decision === 'allow'
                ? false : subscription.paymentFailed)
            : false,
        stripeSubscriptionCanceled: paid && subscription?.billingProvider === 'stripe' ? subscription.stripeSubscriptionCanceled : false,
        permissions: isExpired ? [] : input.plan?.permissions ?? [],
    };
}

SB_EOF
cat > /tmp/sb-check/cmp/run.js <<'SB_EOF'
// Read-only: compares today's status rules (101d8b4) with the new rule for every company.
// Only SELECTs through Prisma (findMany/findFirst). No writes, no provider calls.
const APP = process.env.SB_APP;
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env' });
const { PrismaClient } = require(APP + '/node_modules/@prisma/client');
const newD = require('./services/SubscriptionAccessDecision');
const p = new PrismaClient();
// 101d8b4 getLocalSubscriptionsStatus (web status), line by line.
function prodWeb(plan, sub) {
  if (!plan) return true;
  if (plan.validityType === 'FREE') return sub ? new Date(sub.endDate) < new Date() : true;
  if (!sub) return true;
  return !sub.isActive || ((sub.billingProvider === 'apple' || sub.billingProvider === 'google') && new Date(sub.endDate) < new Date());
}
// 101d8b4 mobile getCompanyStatus (Admin/Crew login), line by line.
function prodMobile(plan, any, pending) {
  if (pending) return true;
  if (!plan) return true;
  if (plan.validityType === 'FREE') return any ? new Date(any.endDate) < new Date() : true;
  if (!any) return true;
  return !any.isActive || new Date(any.endDate) < new Date();
}
const tag = b => (b ? 'bloq' : 'lib');
(async () => {
  const now = new Date();
  const companies = await p.company.findMany({ select: { id: true, allowedEmployees: true, extraEmployees: true, mobileSubscriptionStatus: true,
    Plan: { select: { id: true, validityType: true, validityDuration: true, permissionGroup: { select: { GroupPermissionsList: { select: { Permissions: { select: { description: true } } } } } } } } } });
  const buckets = {}, worse = [], reviews = {};
  for (const c of companies) {
    const rows = await p.subscription.findMany({ where: { companyId: c.id, isActive: true, NOT: { plan: { validityType: 'FREE' }, endDate: { lte: now } } },
      orderBy: { startDate: 'desc' }, take: 10, include: { plan: { select: { validityType: true } } } });
    const newestActive = await p.subscription.findFirst({ where: { companyId: c.id, isActive: true }, orderBy: { startDate: 'desc' } });
    const newestAny = await p.subscription.findFirst({ where: { companyId: c.id }, orderBy: { startDate: 'desc' } });
    const plan = c.Plan ? { id: c.Plan.id, validityType: c.Plan.validityType, validityDuration: c.Plan.validityDuration,
      permissions: c.Plan.permissionGroup.GroupPermissionsList.map(x => x.Permissions.description) } : null;
    const pending = c.mobileSubscriptionStatus === 'pending_subscription';
    const s = newD.resolveCompanySubscriptionStatus({ companyId: c.id, plan, allowedEmployees: c.allowedEmployees ?? 0, extraEmployees: c.extraEmployees ?? 0,
      pendingSubscription: pending, subscriptions: rows, now });
    if (s.billingReview) reviews[s.billingReview] = (reviews[s.billingReview] || 0) + 1;
    const w = prodWeb(plan, newestActive), m = prodMobile(plan, newestAny, pending), n = s.isExpired;
    const key = `web ${tag(w)}->${tag(n)} | app ${tag(m)}->${tag(n)}`;
    buckets[key] = (buckets[key] || 0) + 1;
    if ((!w || !m) && n) {
      const na = newestActive;
      worse.push([c.id.slice(0, 8), `hoje web=${tag(w)} app=${tag(m)}`, `novo=bloq motivo=${s.accessIssue || s.access.reason}`,
        `plano=${plan ? plan.validityType : 'nenhum'}`, `pendente=${pending}`, `linhas_ativas_validas=${rows.length}`,
        `ativa_mais_recente=${na ? [na.billingProvider, na.stripeSubscriptionId ? 'comStripeId' : 'semStripeId', 'fim ' + na.endDate.toISOString().slice(0, 10)].join('/') : '-'}`].join(' | '));
    }
  }
  console.log('empresas=' + companies.length);
  Object.entries(buckets).sort().forEach(([k, v]) => console.log(String(v).padStart(4), k));
  console.log('conflitos so registrados (billingReview):', JSON.stringify(reviews));
  console.log('--- liberadas hoje (web ou app) e bloqueadas no codigo novo: ' + worse.length);
  worse.forEach(l => console.log(l));
  await p.$disconnect();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

SB_EOF
sha256sum /tmp/sb-check/cmp/services/SubscriptionAccessDecision.js /tmp/sb-check/cmp/utils/planPermissions.js /tmp/sb-check/cmp/run.js
cd /tmp/sb-check/cmp && SB_APP="$APP" node run.js
cd / && rm -rf /tmp/sb-check && echo "temporarios apagados"
```

## Relatório

Cole a saída completa do script: os hashes, a tabela `web .../app ...`, a linha `billingReview` e a lista "liberadas hoje e bloqueadas no código novo".

No final, confirme:
- que os hashes bateram;
- que nada foi alterado;
- que `/tmp/sb-check/` e `/tmp/sb-compare.sh` foram apagados.