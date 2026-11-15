# Produção: correção do Google e variáveis do Google Play (roteiro para o Codex)

Servidor de **produção**. Pasta: `/projetos/smartbuild-api`. Processos no pm2: `api-smartbuild` e `worker-smartbuild`.

Este roteiro **altera a produção**. Siga na ordem, sem pular nem improvisar. Em cada **PARE**, entregue o relatório da etapa e espere o Rian escrever "pode seguir".

## Regras

1. Rode só os comandos deste roteiro. Se algo falhar ou fugir do esperado, **pare sem tentar corrigir** e relate.
2. **Não imprima segredos:** nada de `.env`, chaves, tokens, connection string ou e-mails. As variáveis novas deste roteiro não são segredos e podem aparecer.
3. Não mexa no `ecosystem.config.js`, no nginx nem nos arquivos não rastreados.
4. **Não rode:**
   - `npm install` nem `npm ci`;
   - nenhum comando `prisma migrate`, `db push` ou de seed.

   Esta atualização **não tem migração**.
5. **Variáveis:** grave uma vez, antes da Etapa 0, e comece toda etapa (inclusive a Reversão) com a linha de carregamento:

```bash
mkdir -p /root/backups && chmod 700 /root/backups
printf 'TS=%s\nESPERADO=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "20ec03d22443c4df3418a77deadc60d7b09ac9b9" > /root/backups/deploy-google.vars
# início de cada etapa:
cd /projetos/smartbuild-api && . /root/backups/deploy-google.vars && B=/root/backups/deploy-google-$TS
```

## Etapa 0: ponto de partida

```bash
git rev-parse HEAD                          # esperado: 4d08c452b55afb0a78489d7a4a588f07785854ea (deploy de hoje cedo)
git status --short --untracked-files=no     # esperado: só  M ecosystem.config.js
git ls-remote origin 'refs/heads/PRODUÇÃO'  # esperado: 20ec03d22443c4df3418a77deadc60d7b09ac9b9
pm2 ls                                      # api-smartbuild e worker-smartbuild online
```

Se algo for diferente, **pare**.

## Etapa 1: backups e troca do código

```bash
mkdir -p $B && chmod 700 $B
cp -a dist /projetos/smartbuild-api/dist.pre-google-$TS
cp -p .env $B/env && chmod 600 $B/env
cp -p ecosystem.config.js $B/ecosystem.config.js
git rev-parse HEAD > $B/head.txt
git fetch origin
test "$(git rev-parse 'origin/PRODUÇÃO')" = "$ESPERADO" && echo SHA_OK
git diff --stat HEAD 'origin/PRODUÇÃO' -- prisma package.json package-lock.json   # esperado: vazio
git diff --stat HEAD 'origin/PRODUÇÃO' -- src                                      # esperado: só GooglePlayBillingService.ts e o .test.ts dele
git reset --keep 'origin/PRODUÇÃO'
git rev-parse HEAD                          # esperado: ESPERADO
git status --short --untracked-files=no     # esperado: só  M ecosystem.config.js
cmp ecosystem.config.js $B/ecosystem.config.js && echo ECOSYSTEM_PRESERVADO
NODE_OPTIONS=--max-old-space-size=4096 npm run build > $B/build.log 2>&1; echo "build_exit=$?"
tail -n 5 $B/build.log
grep -c "UNRESOLVED_PARKED_UNTIL" dist/services/GooglePlayBillingService.js   # esperado: maior que 0
```

Se `build_exit` for diferente de 0, **não reinicie**: siga a Reversão.

```bash
pm2 restart api-smartbuild worker-smartbuild
sleep 15
pm2 ls
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4003/user                        # esperado: 400
curl -s -o /dev/null -w '%{http_code}\n' https://api.smartbuild4u.com/user                 # esperado: 400
```

**PARE.** Relate o `SHA_OK`, o build, o `grep`, o estado do pm2 e os dois códigos HTTP.

## Etapa 2: variáveis do Google, com compra real desligada

1. **ID da empresa de teste**, só leitura. Monte o acesso ao MySQL em `/tmp/sb-check/` como na Etapa 0 do roteiro `codex-deploy-producao-2026-11-10.md`: `my.cnf` com `protocol=TCP`, `host=127.0.0.1` e `chmod 600`, sem `database=`, e o nome do banco no arquivo `dbname`. Depois rode:

   ```sql
   SET SESSION TRANSACTION READ ONLY;
   SELECT id, name FROM Company WHERE name LIKE '%<EMPRESA DE TESTE INFORMADA PELO RIAN>%';
   ```

   Precisa voltar **exatamente 1 linha**. Se vier 0 ou mais de 1, **pare**.

2. **Confira a conta de serviço** de leitura das compras, sem imprimir a chave:

   ```bash
   node -e 'require("dotenv").config();const j=JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);console.log(j.client_email, j.project_id, !!j.private_key)'
   # esperado: smartbuild-play-billing@smartbuild-play-billing.iam.gserviceaccount.com smartbuild-play-billing true
   ```

   Se a conta for outra, **pare**.

3. **Confira que nenhuma das chaves já existe** no `.env`:

   ```bash
   grep -cE '^(GOOGLE_PLAY_NATIVE_ENABLED|GOOGLE_PLAY_PUBSUB_AUDIENCE|GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT|ANDROID_BILLING_PLAN_MAPPINGS|GOOGLE_PLAY_TEST_COMPANY_IDS|GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES)=' .env   # esperado: 0
   ```

4. **Acrescente as variáveis ao final do `.env`.** Use o bloco abaixo **exatamente como está, sem espaços no início das linhas**. Defina antes `ID_TESTE=<id do passo 1>`.

```bash
[ -n "$ID_TESTE" ] && cat >> .env <<FIM

# Google Play nativo (TASK-55) - 10/11/2026
GOOGLE_PLAY_NATIVE_ENABLED=true
GOOGLE_PLAY_PUBSUB_AUDIENCE=https://api.smartbuild4u.com/mobile-subscriptions/webhooks/google
GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT=smartbuild-rtdn-prod@smartbuild-play-billing.iam.gserviceaccount.com
ANDROID_BILLING_PLAN_MAPPINGS=[{"planId":"4ee81776-538a-4e45-99eb-c7d32fcadc16","productId":"smartbuild_starter_monthly","basePlanId":"monthly"},{"planId":"d52f1833-119d-4024-beb9-7fa767ce23b7","productId":"smartbuild_essentials_monthly","basePlanId":"monthly"}]
GOOGLE_PLAY_TEST_COMPANY_IDS=$ID_TESTE
GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false
FIM
tail -n 7 .env   # confira: 6 linhas sem espaço no início e o id correto; se ID_TESTE estava vazio, nada foi gravado: pare
```

5. **Reinicie só a API e confira:**

   ```bash
   pm2 restart api-smartbuild
   sleep 15
   pm2 ls
   node -e 'require("dotenv").config();console.log(JSON.parse(process.env.ANDROID_BILLING_PLAN_MAPPINGS).length, process.env.GOOGLE_PLAY_NATIVE_ENABLED, process.env.GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES)'   # esperado: 2 true false
   curl -s -X POST -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4003/mobile-subscriptions/webhooks/google   # esperado: 401 (sem autenticação)
   pm2 logs api-smartbuild --lines 40 --nostream | grep -iE "google|error|exception" | tail -n 10
   ```

**PARE.** Relate:
- o id e o nome da empresa (o id pode aparecer);
- o resultado da conta de serviço;
- o `2 true false`;
- o 401 do webhook;
- as linhas do log.

## Reversão

- **Só as variáveis do Google:** `cp -p $B/env .env && pm2 restart api-smartbuild`.
- **Código também:**

  ```bash
  git reset --keep "$(cat $B/head.txt)"
  rm -rf dist && cp -a /projetos/smartbuild-api/dist.pre-google-$TS dist
  cp -p $B/env .env
  pm2 restart api-smartbuild worker-smartbuild
  ```

  Isso volta ao `4d08c45` de hoje cedo.

## No final

Apague o `/tmp/sb-check/`, se ele tiver sido criado para a consulta. Os backups ficam.
