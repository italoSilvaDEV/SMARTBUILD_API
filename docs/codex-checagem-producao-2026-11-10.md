# Checagem só leitura da produção, antes do deploy de assinaturas

Você está na VPS de **produção** do SmartBuild. Esta tarefa é **só de leitura**: levantar informações para planejar um deploy que ainda não vai acontecer. Nada deve mudar no servidor, no banco, na Stripe nem nos serviços.

## Regras (obrigatórias)

1. **Proibido alterar qualquer coisa.** Isso inclui:
   - Banco: `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, `GRANT`, `prisma migrate`, `prisma db push` e `prisma generate`.
   - Código e arquivos: `git pull`, `fetch`, `checkout`, `reset`, `stash` e `merge`; `npm install` e `npm run build`; editar `.env` ou qualquer arquivo da pasta do projeto.
   - Serviços: `systemctl restart`, `stop` e `reload`; `pm2 restart`, `reload`, `stop` e `delete`; mexer no nginx.
   - Serviços externos: na Stripe, só requisições `GET`.
2. **Não imprima segredos.** Do `.env`, mostre só se a chave existe, e mostre o valor apenas quando for `true`, `false` ou vazio. Nada de chaves, tokens, senhas, connection string, purchase tokens, e-mails nem nomes de clientes. Para identificar empresas, use só o `id`.
3. **No MySQL,** comece a sessão com `SET SESSION TRANSACTION READ ONLY;` e rode só `SELECT`. Se existir um usuário só de leitura, prefira ele. Para conectar, use os dados do `DATABASE_URL` sem imprimi-los. Por exemplo, monte um `/tmp/sb-check/my.cnf` com `chmod 600` e use `mysql --defaults-extra-file=/tmp/sb-check/my.cnf`. Não passe a senha na linha de comando.
4. **Não instale nada:** nada de `apt`, `npm -g` ou `pip`. Se o `jq` não existir, use `python3 -c` ou `node -e` para filtrar os campos pedidos.
5. **Arquivos temporários** só em `/tmp/sb-check/`. Apague a pasta no final.
6. **Se algo fugir do esperado** (comando pedindo confirmação, erro de permissão, dado estranho), **pare e relate**. Não tente corrigir.
7. No final, entregue o relatório no formato da última seção.

## A. Servidor

- Sistema, `nproc`, `free -m` e `df -h`.
- Como a API roda (`systemctl list-units --type=service | grep -i -E 'smart|api'` e/ou `pm2 ls`), o nome do serviço e a pasta do projeto.
- Na pasta do projeto: `git rev-parse HEAD`, `git branch --show-current`, `git remote -v` (sem credenciais na URL) e `git status --short`, **incluindo arquivos não rastreados**. Liste qualquer alteração local, porque ela pode ser perdida no deploy.
- `node -v`, `npm -v` e `npx prisma -v`.
- Se existe a pasta `dist` e qual a data dela.
- Se o nginx faz proxy da API: o domínio e a porta. Não mostre certificados.

## B. Formato do `.env` da API (sem valores)

Para cada chave abaixo, diga `ausente`, `vazio`, `true`, `false` ou `definido (N chars)`:

`DATABASE_URL, SECRET_JWT, STRIPE_SECRET_KEY, STRIPE_PRICE_EXTRA_EMPLOYEE, URL_API, BILLING_COORDINATION_ENABLED, SUBSCRIPTION_ACCESS_COMPARE, GOOGLE_PLAY_NATIVE_ENABLED, GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES, GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_PUBSUB_AUDIENCE, GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT, GOOGLE_PLAY_TEST_COMPANY_IDS, ANDROID_BILLING_PLAN_MAPPINGS, ANDROID_BILLING_REPORTING_ENABLED, ALLOW_MOBILE_STORE_TEST_PURCHASES, MOBILE_APP_PRODUCTS_JSON, MOBILE_APP_PRODUCT_ID, MOBILE_APP_PLAN_ID, APP_STORE_BUNDLE_ID, APP_STORE_KEY_ID, PUBLIC_ACCESS_JWT_SECRET`

O `GOOGLE_PLAY_PACKAGE_NAME` não é segredo, então pode mostrar o valor.

## C. Banco: migrações e tamanho

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
  FROM _prisma_migrations ORDER BY started_at DESC LIMIT 15;
SELECT COUNT(*) AS problemas FROM _prisma_migrations
  WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
-- O que o deploy vai criar não pode existir ainda:
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('AndroidBillingAttempt','AndroidBillingReport','GooglePlayPurchaseSync','BillingPurchaseAttempt','BillingConflict');
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME='Office' AND COLUMN_NAME='legacyPlanPermissions') OR (TABLE_NAME='pdf_project' AND COLUMN_NAME='uploadedById'));
-- Tamanhos
SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('Office','pdf_project','Subscription','Company','Plan','webhooks');
SELECT ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS banco_mb
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
SELECT VERSION();
```

## D. Assinaturas que a trava nova pode afetar

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT billingProvider, isActive, COUNT(*) FROM Subscription GROUP BY billingProvider, isActive;
-- Empresas com mais de uma assinatura ativa
SELECT COUNT(*) FROM (SELECT companyId FROM Subscription WHERE isActive = 1 GROUP BY companyId HAVING COUNT(*) > 1) t;
SELECT companyId, COUNT(*) n, GROUP_CONCAT(DISTINCT billingProvider) provedores
  FROM Subscription WHERE isActive = 1 GROUP BY companyId HAVING n > 1 LIMIT 20;
-- Google já existente
SELECT isActive, storeEnvironment, COUNT(*) FROM Subscription WHERE billingProvider = 'google' GROUP BY isActive, storeEnvironment;
-- Apple com ID Stripe (caso de dados misturados)
SELECT COUNT(*) FROM Subscription WHERE billingProvider = 'apple' AND stripeSubscriptionId IS NOT NULL;
-- Plano da empresa diferente do plano da assinatura ativa
SELECT COUNT(*) FROM Company c JOIN Subscription s ON s.companyId = c.id AND s.isActive = 1
  WHERE c.planId IS NOT NULL AND c.planId <> s.planId;
-- Status mobile
SELECT mobileSubscriptionStatus, COUNT(*) FROM Company GROUP BY mobileSubscriptionStatus;
-- Ativas já vencidas
SELECT billingProvider, COUNT(*) FROM Subscription WHERE isActive = 1 AND endDate < NOW() GROUP BY billingProvider;
```

## E. Planos × Stripe de produção

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT id, name, validityType, validityDuration, isCampaign, isInviteOnly, stripeProductId, stripePriceId
  FROM Plan WHERE isActive = 1 ORDER BY name;
```

Para cada `stripePriceId` não nulo, consulte a Stripe **só com GET**. Leia a chave sem imprimir:

```bash
set +x
KEY=$(grep -E '^STRIPE_SECRET_KEY=' .env | tail -n1 | cut -d= -f2- | tr -d '"')
curl -s -u "$KEY:" https://api.stripe.com/v1/prices/<PRICE_ID> | jq '{id, active, livemode, currency, unit_amount, recurring: .recurring.interval, product}'
```

Relate também os preços que voltarem com erro, como `No such price`. Confirme que `livemode` é `true`.

Configuração do portal do cliente:

```bash
curl -s -u "$KEY:" "https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=5" \
  | jq '.data[] | {id, is_default, update_enabled: .features.subscription_update.enabled, products: .features.subscription_update.products}'
```

Diga quais `stripePriceId` dos planos ativos **não** aparecem entre os preços oferecidos no portal.

## F. Webhooks

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT name, event, url, status, stripeId, LENGTH(secret) > 0 AS tem_segredo FROM webhooks;
```

```bash
curl -s -u "$KEY:" "https://api.stripe.com/v1/webhook_endpoints?limit=20" | jq '.data[] | {id, url, status, eventos: (.enabled_events | length)}'
unset KEY
```

Diga se cada `stripeId` da tabela existe na Stripe e está `enabled`.

## G. Notificações das lojas

Pelo log de acesso do nginx, sem mostrar o conteúdo das requisições, conte as chamadas dos últimos 7 dias para:
- `/mobile-subscriptions/webhooks/google`
- `/mobile-subscriptions/webhooks/apple`
- o webhook da Stripe

Mostre também os códigos HTTP retornados.

## Formato do relatório

Para cada seção (A a G), traga:
- o que encontrou;
- o que parece fora do normal;
- o que não conseguiu verificar, e por quê.

Termine confirmando três pontos:
- que nada foi alterado;
- que nenhum segredo foi impresso;
- que `/tmp/sb-check/` foi apagada.
