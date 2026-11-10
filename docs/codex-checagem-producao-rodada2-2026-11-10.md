# Checagem só leitura da produção — rodada 2

Continuação da checagem anterior, que parou na conexão com o MySQL. Pasta da API: `/projetos/smartbuild-api`. Esta tarefa continua **só de leitura**.

## Regras (as mesmas, obrigatórias)

1. **Proibido alterar qualquer coisa:**
   - banco: qualquer escrita, `prisma migrate`, `db push` ou `generate`;
   - git: `pull`, `fetch`, `checkout`, `reset`, `stash`, `merge` ou `commit`;
   - `npm install` ou build;
   - editar arquivos do projeto ou o `.env`;
   - reiniciar, parar ou recarregar o pm2 ou o nginx;
   - instalar pacotes.

   Na Stripe, só `GET`. O `git ls-remote` é permitido, porque só lê.
2. **Nenhum segredo impresso.** Do `.env` e do ambiente do pm2, mostre só se a chave existe, ou o valor quando for `true`, `false` ou vazio. Nada de senhas, chaves, tokens, connection string, e-mails ou nomes de clientes; empresas só por `id`.
3. **MySQL:** cada arquivo `.sql` começa com `SET SESSION TRANSACTION READ ONLY;` e contém só `SELECT`.
4. **Temporários** só em `/tmp/sb-check/` (`chmod 700`). Apague a pasta no final.
5. **Se algo fugir do esperado, pare e relate**, sem tentar corrigir.

## 1. Git: o que está rodando no servidor

O commit `8bed558` **não existe** no GitHub, e há 4 arquivos alterados sem commit. Precisamos saber exatamente o que são.

```bash
cd /projetos/smartbuild-api
git log -8 --format='%h %ad %an %s' --date=iso
git status -sb | head -1
git branch -vv | grep '^\*'
git ls-remote origin 'refs/heads/PRODUÇÃO'
```

Com o SHA que o `ls-remote` devolver (chame de `REMOTO`):

```bash
git cat-file -t REMOTO && git log --oneline REMOTO..HEAD && git log --oneline HEAD..REMOTO | head
git show --stat --format='%H%n%ad %an%n%s%n%b' 8bed558
```

Se o `8bed558` mexer em `src/`, `prisma/` ou `package.json`, mostre o diff completo desses caminhos (`git show 8bed558 -- src prisma package.json`). Se mexer em outros arquivos de configuração, mostre só os nomes das chaves que mudaram, sem valores.

Alterações sem commit:

```bash
git diff --stat
git diff -- src/server.ts src/services/LandingAnalyticsService.ts src/services/LandingAnalyticsService.test.ts
git diff -- ecosystem.config.js | sed -E "s/(:[[:space:]]*)([\"'])[^\"']*([\"'])/\1\"<mascarado>\"/g"
```

## 2. pm2 (sem variáveis de ambiente)

```bash
pm2 jlist | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const keys=["BILLING_COORDINATION_ENABLED","SUBSCRIPTION_ACCESS_COMPARE","GOOGLE_PLAY_NATIVE_ENABLED","GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES","MOBILE_APP_PRODUCTS_JSON","APP_STORE_ISSUER_ID","APP_STORE_PRIVATE_KEY","APP_STORE_KEY_ID","APP_STORE_BUNDLE_ID","APPLE_BUNDLE_ID","DATABASE_URL","STRIPE_SECRET_KEY"];
  for(const p of JSON.parse(s)){const e=p.pm2_env||{};
    console.log(p.name,{script:e.pm_exec_path,cwd:e.pm_cwd,mode:e.exec_mode,instances:e.instances,status:e.status,restarts:e.restart_time,node_args:e.node_args,
      env_no_pm2:Object.fromEntries(keys.map(k=>[k, e.env&&k in e.env ? (["true","false",""].includes(String(e.env[k]))?e.env[k]:"definido") : "ausente"]))});}
});'
```

## 3. Mais chaves do `.env`

No mesmo formato da rodada 1 (`ausente`, `vazio`, `true`, `false` ou `definido (N chars)`):

`APP_STORE_ISSUER_ID, APP_STORE_PRIVATE_KEY, APPLE_BUNDLE_ID, IOS_BUNDLE_ID, MOBILE_APP_PRODUCT_IDS, REDIS_URL`

Mostre também o **tipo** de host do `DATABASE_URL`, sem o valor: `localhost`, `127.0.0.1`, IP privado, nome de container ou host externo.

## 4. Conexão com o MySQL

O erro anterior provavelmente veio do `localhost`: com ele, o cliente `mysql` usa o socket em vez da rede. Monte a conexão **forçando TCP**, sem imprimir nada:

```bash
mkdir -p /tmp/sb-check && chmod 700 /tmp/sb-check
cd /projetos/smartbuild-api
node -e '
const fs=require("fs");
const line=fs.readFileSync(".env","utf8").split(/\r?\n/).filter(l=>/^DATABASE_URL=/.test(l)).pop();
const u=new URL(line.slice(13).trim().replace(/^["\x27]|["\x27]$/g,""));
const host=u.hostname==="localhost"?"127.0.0.1":u.hostname;
fs.writeFileSync("/tmp/sb-check/my.cnf",
 `[client]\nprotocol=TCP\nhost=${host}\nport=${u.port||3306}\nuser=${decodeURIComponent(u.username)}\npassword=${decodeURIComponent(u.password)}\ndatabase=${decodeURIComponent(u.pathname.slice(1))}\n`,{mode:0o600});
console.log("my.cnf pronto");'
printf 'SET SESSION TRANSACTION READ ONLY;\nSELECT 1 AS ok, VERSION() AS versao;\n' > /tmp/sb-check/ping.sql
mysql --defaults-extra-file=/tmp/sb-check/my.cnf < /tmp/sb-check/ping.sql
```

Se ainda falhar, relate o erro e pare.

## 5. Consultas

Salve cada bloco em `/tmp/sb-check/<letra>.sql` e rode com `mysql --defaults-extra-file=/tmp/sb-check/my.cnf -t < arquivo`.

### C. Migrações e tamanho

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
  FROM _prisma_migrations ORDER BY started_at DESC LIMIT 15;
SELECT COUNT(*) AS problemas FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('AndroidBillingAttempt','AndroidBillingReport','GooglePlayPurchaseSync','BillingPurchaseAttempt','BillingConflict');
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME='Office' AND COLUMN_NAME='legacyPlanPermissions') OR (TABLE_NAME='pdf_project' AND COLUMN_NAME='uploadedById'));
SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('Office','pdf_project','Subscription','Company','Plan','webhooks');
SELECT ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS banco_mb FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
```

### D. Assinaturas

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

### Apple: mapeamento de plano (novo, importante)

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT id, name, price, validityType, isActive, isCampaign FROM Plan
  WHERE id IN ('4ee81776-538a-4e45-99eb-c7d32fcadc16','d52f1833-119d-4024-beb9-7fa767ce23b7');
SELECT id, name, price, validityType, isActive, createdAt FROM Plan
  WHERE isActive = 1 AND isCampaign = 0 AND TRUNCATE(price,0) IN (29,99) ORDER BY price, createdAt DESC;
SELECT storeProductId, isActive, storeEnvironment, COUNT(*) n FROM Subscription WHERE billingProvider = 'apple' GROUP BY storeProductId, isActive, storeEnvironment;
SELECT planId, storeProductId, COUNT(*) n FROM Subscription WHERE billingProvider = 'apple' AND isActive = 1 GROUP BY planId, storeProductId;
```

### E. Planos × Stripe

Siga a seção E da rodada 1: os planos ativos, `GET /v1/prices/<id>` de cada `stripePriceId` (com `livemode`) e o portal (`billing_portal/configurations`). Leia a chave com `set +x` e `KEY=$(grep ... | cut ...)`, sem imprimir. Use `jq`, ou `python3`/`node` se o `jq` não existir. No final, `unset KEY`.

### F. Webhooks

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT name, event, url, status, stripeId, LENGTH(secret) > 0 AS tem_segredo FROM webhooks;
```

E `GET /v1/webhook_endpoints?limit=20`, mostrando só `id`, `url`, `status` e a quantidade de eventos.

### G. Nginx e logs

```bash
nginx -T 2>/dev/null | grep -n -E '^\s*(server_name|proxy_pass|listen)\b|# configuration file' | head -60
```

Depois, no log de acesso que estiver configurado, conte as chamadas dos últimos 7 dias para `/mobile-subscriptions/webhooks/google`, `/mobile-subscriptions/webhooks/apple` e o webhook da Stripe, agrupadas por código HTTP.

## Relatório

Use o mesmo formato da rodada 1: o que encontrou, o que está fora do normal e o que não deu para verificar. Mostre as saídas das consultas como tabela.

No final, confirme:
- que nada foi alterado;
- que nenhum segredo foi impresso;
- que `/tmp/sb-check/` foi apagada.
