# Deploy em produção: assinaturas (roteiro para o Codex)

Servidor de **produção**. Pasta da API: `/projetos/smartbuild-api`. Processos no pm2: `api-smartbuild` e `worker-smartbuild`.

Este roteiro **altera a produção**. Siga as etapas na ordem, **sem pular nem improvisar**. Ao fim de cada etapa marcada com **PARE**, entregue o relatório da etapa e **espere o Rian escrever "pode seguir"** antes de continuar.

## Regras

1. **Rode só os comandos deste roteiro.** Se algum comando falhar, pedir confirmação ou mostrar algo diferente do esperado, **pare, não tente corrigir** e relate.
2. **Não imprima segredos:** nada de `.env`, senhas, tokens, connection string ou e-mails. Para o MySQL, use o `my.cnf` temporário como nas checagens: `protocol=TCP`, `host=127.0.0.1`, `chmod 600`, em `/tmp/sb-deploy/`.
3. **Não mexa** no `.env`, no `ecosystem.config.js`, no nginx nem nos arquivos não rastreados (`backups/`, `dist.pre-*` e outros).
4. **Não rode** `npm install` nem `npm ci`, porque as dependências não mudam. Também não rode `prisma db push`, `prisma migrate dev`, `prisma migrate reset` nem nenhum seed.
5. **Variáveis:** defina uma única vez, antes da Etapa 0, e grave num arquivo:

   ```bash
   mkdir -p /root/backups && chmod 700 /root/backups
   printf 'TS=%s\nESPERADO=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "4d08c452b55afb0a78489d7a4a588f07785854ea" > /root/backups/deploy-assinaturas.vars
   ```

   **Comece toda etapa**, inclusive a Reversão, com:

   ```bash
   cd /projetos/smartbuild-api && . /root/backups/deploy-assinaturas.vars && B=/root/backups/deploy-$TS && DB=$(cat /tmp/sb-deploy/dbname 2>/dev/null)
   ```

   Assim nada se perde se o shell mudar entre as etapas.

## Etapa 0: conferir o ponto de partida

```bash
cd /projetos/smartbuild-api
git rev-parse HEAD                      # esperado: 8bed558acadee311089a53fd52225a0f1097845d
git status --short --untracked-files=no # esperado: só os 4 arquivos conhecidos (M)
pm2 ls                                  # api-smartbuild e worker-smartbuild online
df -h /projetos /root | tail -n +2
git ls-remote origin 'refs/heads/PRODUÇÃO'   # precisa ser 4d08c452b55afb0a78489d7a4a588f07785854ea
```

Os 4 arquivos conhecidos são:
- `ecosystem.config.js`
- `src/server.ts`
- `src/services/LandingAnalyticsService.ts`
- `src/services/LandingAnalyticsService.test.ts`

Se o HEAD, os arquivos ou o SHA remoto forem diferentes do esperado, **pare**.

Prepare o acesso ao MySQL sem imprimir nada. O `[client]` **não** leva `database=`, porque o `mysqldump` recusa essa opção; o nome do banco fica num arquivo à parte.

```bash
mkdir -p /tmp/sb-deploy && chmod 700 /tmp/sb-deploy
node -e '
const fs=require("fs");
const line=fs.readFileSync(".env","utf8").split(/\r?\n/).filter(l=>/^DATABASE_URL=/.test(l)).pop();
const u=new URL(line.slice(13).trim().replace(/^["\x27]|["\x27]$/g,""));
const host=u.hostname==="localhost"?"127.0.0.1":u.hostname;
fs.writeFileSync("/tmp/sb-deploy/my.cnf",`[client]\nprotocol=TCP\nhost=${host}\nport=${u.port||3306}\nuser=${decodeURIComponent(u.username)}\npassword=${decodeURIComponent(u.password)}\n`,{mode:0o600});
fs.writeFileSync("/tmp/sb-deploy/dbname",decodeURIComponent(u.pathname.slice(1).split("?")[0]),{mode:0o600});
console.log("acesso pronto");'
DB=$(cat /tmp/sb-deploy/dbname)
mysql --defaults-extra-file=/tmp/sb-deploy/my.cnf "$DB" -e "SELECT 1 AS ok"
```

Nas consultas SQL deste roteiro, use `mysql --defaults-extra-file=/tmp/sb-deploy/my.cnf "$DB"`.

## Etapa 1: backups

```bash
mkdir -p /root/backups/deploy-$TS && chmod 700 /root/backups/deploy-$TS
B=/root/backups/deploy-$TS
# 1. Banco completo (MySQL 8, por TCP, sem bloquear tabelas InnoDB)
mysqldump --defaults-extra-file=/tmp/sb-deploy/my.cnf --single-transaction --routines --triggers --no-tablespaces "$DB" | gzip > $B/banco.sql.gz
test "${PIPESTATUS[0]}" = 0 && echo DUMP_OK
gzip -t $B/banco.sql.gz && ls -lh $B/banco.sql.gz
# 2. Build atual
cp -a dist /projetos/smartbuild-api/dist.pre-assinaturas-$TS
# 3. Alterações locais, configuração e ponto do git
git diff > $B/alteracoes-locais.patch
cp -p ecosystem.config.js $B/ecosystem.config.js
cp -p .env $B/env && chmod 600 $B/env
git branch backup/prod-8bed558 8bed558
git rev-parse HEAD > $B/head.txt
ls -la $B
```

Esperado:
- o dump tem algumas centenas de MB comprimido, e o `gzip -t` não acusa erro;
- o patch tem as alterações dos 4 arquivos.

**PARE.** Relate o `DUMP_OK`, os tamanhos dos arquivos, o resultado do `gzip -t` e a criação da branch `backup/prod-8bed558`.

## Etapa 2: migrações, com o código antigo ainda rodando

A API atual continua no ar. As migrações só **adicionam** 5 tabelas e 2 colunas, e o código antigo ignora tudo isso.

```bash
cd /projetos/smartbuild-api
git fetch origin
test "$(git rev-parse 'origin/PRODUÇÃO')" = "$ESPERADO" && echo SHA_OK
# O conteúdo novo precisa ser igual ao new-hml testado na HML
git diff --stat origin/new-hml 'origin/PRODUÇÃO' -- src prisma package.json package-lock.json   # esperado: vazio
git diff --stat HEAD 'origin/PRODUÇÃO' -- package.json package-lock.json                        # esperado: vazio
git diff --name-status HEAD 'origin/PRODUÇÃO' -- prisma/migrations                              # esperado: exatamente 5 linhas A
# Usa a pasta prisma nova, sem trocar o código em execução
rm -rf /tmp/sb-deploy/prisma && git archive 'origin/PRODUÇÃO' prisma | tar -x -C /tmp/sb-deploy
npx --no-install prisma migrate status --schema /tmp/sb-deploy/prisma/schema.prisma   # esperado: 5 migrações pendentes
npx --no-install prisma migrate deploy --schema /tmp/sb-deploy/prisma/schema.prisma
```

As 5 migrações esperadas:
- `20261105000000_android_billing`
- `20261106220000_explicit_office_permission_policy`
- `20261106223000_pdf_upload_ownership`
- `20261106230000_google_play_sync`
- `20261106233000_billing_purchase_coordination`

Se o `migrate status` mostrar qualquer coisa além dessas 5 como pendente, **pare antes do `migrate deploy`**.

Depois, confira:

```sql
SET SESSION TRANSACTION READ ONLY;
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 6;
SELECT COUNT(*) AS cargos, SUM(legacyPlanPermissions = 1) AS marcados FROM Office;   -- os dois números iguais
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('AndroidBillingAttempt','AndroidBillingReport','GooglePlayPurchaseSync','BillingPurchaseAttempt','BillingConflict');   -- 5 linhas
```

E confirme que a API antiga segue no ar:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4003/user   # esperado: 400 (Token not informed)
pm2 ls
```

**PARE.** Relate as 5 migrações concluídas, `cargos = marcados`, as 5 tabelas e a API respondendo.

## Etapa 3: trocar o código

```bash
cd /projetos/smartbuild-api
# O conteúdo destes 3 arquivos já está no GitHub; o patch da Etapa 1 guarda a versão local.
git checkout -- src/server.ts src/services/LandingAnalyticsService.ts src/services/LandingAnalyticsService.test.ts
git reset --keep 'origin/PRODUÇÃO'
git rev-parse HEAD                       # esperado: 4d08c452b55afb0a78489d7a4a588f07785854ea
git status --short --untracked-files=no  # esperado: só  M ecosystem.config.js
cmp ecosystem.config.js /root/backups/deploy-$TS/ecosystem.config.js && echo ECOSYSTEM_PRESERVADO
```

Se o `reset --keep` recusar, **pare**. Ele só recusa quando algo local estaria em risco.

## Etapa 4: build

A API continua rodando o código antigo, que já está na memória.

```bash
cd /projetos/smartbuild-api
npx --no-install prisma generate
NODE_OPTIONS=--max-old-space-size=4096 npm run build > /tmp/sb-deploy/build.log 2>&1; echo "build_exit=$?"
tail -n 20 /tmp/sb-deploy/build.log
head -c 400 dist/server.js | grep -c "dotenv/config"   # esperado: 1
grep -c "billing-review" dist/controllers/User/UserController.js dist/controllers/mobile/MobileAuthController.js   # esperado: 1 em cada
```

Se `build_exit` for diferente de 0, **não reinicie** e siga a **Reversão do código** abaixo.

**PARE.** Relate o `build_exit`, as últimas linhas do log e os dois `grep`.

## Etapa 5: reiniciar

```bash
pm2 restart api-smartbuild worker-smartbuild
sleep 15
pm2 ls
pm2 logs api-smartbuild --lines 60 --nostream | grep -iE "error|exception|server is running|billing-review" | tail -n 20
pm2 logs worker-smartbuild --lines 30 --nostream | grep -iE "error|exception" | tail -n 10
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4003/user               # esperado: 400
curl -s -o /dev/null -w '%{http_code}\n' https://api.smartbuild4u.com/user        # esperado: 400
```

Esperado:
- os dois processos `online`, sem reinícios em sequência;
- "server is running" no log;
- nenhum erro novo.

Se a API não subir ou ficar reiniciando, siga a **Reversão do código** na hora e só depois relate.

**PARE.** Relate o estado do pm2, as linhas filtradas do log e os dois códigos HTTP. A partir daqui, o Rian testa:
- login na web e no app;
- tela de assinatura;
- envio de invoice;
- Crew com Worker;
- assistente de IA.

## Reversão do código (se o build ou o reinício falhar, ou se o Rian pedir)

```bash
cd /projetos/smartbuild-api
git reset --keep backup/prod-8bed558
git apply /root/backups/deploy-$TS/alteracoes-locais.patch --include='src/*'
git status --short --untracked-files=no      # esperado: os 4 arquivos de antes
npx --no-install prisma generate
rm -rf dist && cp -a /projetos/smartbuild-api/dist.pre-assinaturas-$TS dist
pm2 restart api-smartbuild worker-smartbuild
```

**O banco não precisa ser revertido.** O código antigo funciona com as tabelas e colunas novas, porque só ignora o que não conhece. O dump da Etapa 1 só deve ser restaurado se o Rian pedir.

## No final

```bash
rm -rf /tmp/sb-deploy
```

Relatório final:
- SHA em produção;
- o que foi feito em cada etapa;
- onde estão os backups;
- confirmação de que nenhum segredo foi impresso.
