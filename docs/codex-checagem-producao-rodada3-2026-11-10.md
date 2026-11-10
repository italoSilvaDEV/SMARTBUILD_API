# Checagem só leitura da produção — rodada 3

Continuação das rodadas 1 e 2. Pasta da API: `/projetos/smartbuild-api`. **Só leitura**, com as mesmas regras:

- **Nada pode ser alterado:**
  - banco: nenhuma escrita, nenhum `prisma migrate`, `db push` ou `generate`;
  - git: nenhum `pull`, `fetch`, `checkout`, `reset`, `stash`, `merge`, `commit` ou `push`;
  - nenhum build, nenhuma edição de arquivo do projeto e nenhum restart do pm2 ou do nginx;
  - nenhuma instalação.
- **Na Stripe, só `GET`.**
- **Nenhum segredo nem e-mail no relatório.** Use `git diff`, nunca `git format-patch` nem `git log` com autor, porque esses mostram e-mail.
- **No MySQL,** cada arquivo `.sql` começa com `SET SESSION TRANSACTION READ ONLY;` e tem só `SELECT`. Conecte por TCP como na rodada 2 (`my.cnf` com `protocol=TCP`, `host=127.0.0.1`, `chmod 600`, em `/tmp/sb-check/`).
- **Temporários só em `/tmp/sb-check/`**, e apague no final.

**Diferença desta rodada:** a migração com problema agora é um item a investigar e relatar, **não** um motivo para parar. Investigue, relate e siga para as seções seguintes. Continue parando diante de erro de comando, de permissão ou de qualquer coisa que exigiria alteração.

## 1. Qual é a migração com problema

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count,
       LEFT(REPLACE(REPLACE(COALESCE(logs,''), '\n', ' '), '\r', ' '), 400) AS log_inicio
  FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
-- A mesma migração foi aplicada com sucesso depois?
SELECT p.migration_name, COUNT(*) AS tentativas, SUM(p.finished_at IS NOT NULL AND p.rolled_back_at IS NULL) AS concluidas
  FROM _prisma_migrations p
  WHERE p.migration_name IN (SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
  GROUP BY p.migration_name;
SELECT COUNT(*) AS total_registros, COUNT(DISTINCT migration_name) AS migracoes_distintas FROM _prisma_migrations;
```

Liste também as pastas em `prisma/migrations/` do servidor que **não** aparecem como concluídas na tabela:

```bash
cd /projetos/smartbuild-api
ls prisma/migrations | grep -E '^[0-9]' | sort > /tmp/sb-check/pastas.txt
```

Para gerar a lista do banco, use `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1;` com `mysql -N`, salvando em `/tmp/sb-check/banco.txt`. Depois:

```bash
comm -23 /tmp/sb-check/pastas.txt <(sort -u /tmp/sb-check/banco.txt)
```

Por fim, `npx prisma migrate status`. Esse comando só lê, mas confirme isso antes de rodar e não aceite nenhuma sugestão de comando que ele mostrar.

## 2. Código do servidor que precisa ir para o GitHub

Cole no relatório, **completos e sem resumo**, dentro de blocos de código:

```bash
cd /projetos/smartbuild-api
git diff 101d8b4c7cecb911184a517b539badf106f355c6 HEAD -- src/utils/estimateDiscountSync.ts src/utils/estimateDiscountSync.test.ts
git diff -- src/server.ts src/services/LandingAnalyticsService.ts src/services/LandingAnalyticsService.test.ts
```

E informe se o build em execução já inclui essas alterações:

```bash
ls -l --time-style=full-iso dist/server.js dist/utils/estimateDiscountSync.js src/server.ts src/utils/estimateDiscountSync.ts src/services/LandingAnalyticsService.ts
git log -1 --format='%h %ad' --date=iso HEAD
grep -c "dotenv/config" dist/server.js
```

Não mostre o diff do `ecosystem.config.js`.

## 3. Seções D a G da rodada 2

Rode as seções D (assinaturas), Apple (mapeamento de plano), E (planos × Stripe), F (webhooks) e G (nginx e logs) **exatamente como estão na rodada 2**. Se precisar, abra este trecho do arquivo `codex-checagem-producao-rodada2-2026-11-10.md`, que eu repito abaixo para não depender dele.

### D

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT billingProvider, isActive, COUNT(*) n FROM Subscription GROUP BY billingProvider, isActive;
SELECT COUNT(*) AS empresas_com_2_ou_mais_ativas FROM (SELECT companyId FROM Subscription WHERE isActive = 1 GROUP BY companyId HAVING COUNT(*) > 1) t;
SELECT companyId, COUNT(*) n, GROUP_CONCAT(DISTINCT billingProvider) provedores FROM Subscription WHERE isActive = 1 GROUP BY companyId HAVING n > 1 LIMIT 20;
SELECT isActive, storeEnvironment, COUNT(*) n FROM Subscription WHERE billingProvider = 'google' GROUP BY isActive, storeEnvironment;
SELECT COUNT(*) AS apple_com_id_stripe FROM Subscription WHERE billingProvider = 'apple' AND stripeSubscriptionId IS NOT NULL;
SELECT COUNT(*) AS plano_divergente FROM Company c JOIN Subscription s ON s.companyId = c.id AND s.isActive = 1 WHERE c.planId IS NOT NULL AND c.planId <> s.planId;
SELECT mobileSubscriptionStatus, COUNT(*) n FROM Company GROUP BY mobileSubscriptionStatus;
SELECT billingProvider, COUNT(*) AS ativas_vencidas FROM Subscription WHERE isActive = 1 AND endDate < NOW() GROUP BY billingProvider;
SELECT COUNT(*) AS stripe_ativas_com_falha FROM Subscription WHERE billingProvider='stripe' AND isActive=1 AND paymentFailed=1;
```

### Apple

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT id, name, price, validityType, isActive, isCampaign FROM Plan
  WHERE id IN ('4ee81776-538a-4e45-99eb-c7d32fcadc16','d52f1833-119d-4024-beb9-7fa767ce23b7');
SELECT id, name, price, validityType, isActive, createdAt FROM Plan
  WHERE isActive = 1 AND isCampaign = 0 AND TRUNCATE(price,0) IN (29,99) ORDER BY price, createdAt DESC;
SELECT storeProductId, isActive, storeEnvironment, COUNT(*) n FROM Subscription WHERE billingProvider = 'apple' GROUP BY storeProductId, isActive, storeEnvironment;
SELECT planId, storeProductId, COUNT(*) n FROM Subscription WHERE billingProvider = 'apple' AND isActive = 1 GROUP BY planId, storeProductId;
```

### E

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT id, name, validityType, validityDuration, isCampaign, isInviteOnly, stripeProductId, stripePriceId
  FROM Plan WHERE isActive = 1 ORDER BY name;
```

Para cada `stripePriceId` não nulo, faça só `GET`, lendo a chave sem imprimi-la:

```bash
set +x
KEY=$(grep -E '^STRIPE_SECRET_KEY=' .env | tail -n1 | cut -d= -f2- | tr -d '"')
curl -s -u "$KEY:" https://api.stripe.com/v1/prices/<PRICE_ID>
```

Do resultado, relate `id`, `active`, `livemode`, `currency`, `unit_amount`, `recurring.interval` e `product`, e também os preços que derem erro. Filtre com `jq`, `python3` ou `node`.

Depois o portal: `GET https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=5`. Relate `id`, `is_default`, `features.subscription_update.enabled` e os produtos e preços oferecidos. Diga quais `stripePriceId` de planos ativos **não** aparecem no portal.

### F

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT name, event, url, status, stripeId, LENGTH(secret) > 0 AS tem_segredo FROM webhooks;
```

Depois `GET https://api.stripe.com/v1/webhook_endpoints?limit=20`, relatando só `id`, `url`, `status` e a quantidade de eventos. Diga se cada `stripeId` da tabela existe na Stripe e está `enabled`. No final, `unset KEY`.

### G

```bash
nginx -T 2>/dev/null | grep -n -E '^\s*(server_name|proxy_pass|listen)\b|# configuration file' | head -60
```

No log de acesso configurado, conte as chamadas dos últimos 7 dias para `/mobile-subscriptions/webhooks/google`, `/mobile-subscriptions/webhooks/apple` e para o webhook da Stripe, agrupadas por código HTTP.

## Relatório

Para cada seção, traga o que encontrou, o que está fora do normal e o que não deu para verificar. Mostre as consultas como tabelas e os diffs completos.

No final, confirme:
- que nada foi alterado;
- que nenhum segredo nem e-mail foi impresso;
- que `/tmp/sb-check/` foi apagada.
