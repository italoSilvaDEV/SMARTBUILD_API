# Plano de deploy em produção: assinaturas (10/11/2026)

Leva o `new-hml` para a produção. A produção roda em `/projetos/smartbuild-api`, pelo pm2, com os processos `api-smartbuild` e `worker-smartbuild`. O servidor tem 48 GB de RAM, Node 20.18.3 e MySQL 8.0.41.

Legenda: **[V]** confirmado no código, na HML ou pela checagem só leitura da produção (rodadas 1 a 3 do Codex, 10/11) · **[D]** decisão do Rian

## 1. Estado da produção e o que sobe

- **[V] O servidor não está igual ao GitHub.** Ele roda o commit `8bed558`, que fica 3 commits à frente de `origin/PRODUÇÃO` (`101d8b4`), e tem 4 arquivos alterados sem commit:
  - `src/utils/estimateDiscountSync.ts` e o teste dele, vindos dos commits locais: na sincronização de serviços do orçamento, reusa um serviço antigo do projeto só quando há uma correspondência exata e única;
  - `src/server.ts`: carrega o `.env` antes de todos os imports (`import 'dotenv/config'`). Sem isso, os módulos que leem `OPENAI_KEY` e as configurações do SmartBuilder no import ficam sem valor;
  - `src/services/LandingAnalyticsService.ts` e o teste dele: aceita o dispositivo `unknown`;
  - `ecosystem.config.js`: configuração do pm2. O `new-hml` não mexe nesse arquivo, então ele fica como está no servidor.
- **[V] O build em execução já tem essas alterações.** Elas foram trazidas para o `new-hml` com conteúdo idêntico (os hashes batem), e os testes delas passam.
- **[V] O `new-hml` contém todo o resto do conteúdo de `PRODUÇÃO`:** os 10 commits exclusivos da `PRODUÇÃO` são merges sem conteúdo próprio.
- **[V]** Não há dependência nova nem evento novo de webhook.

## 2. Migrações

- **[V] Histórico limpo:** 274 pastas e 274 migrações concluídas. O `prisma migrate status` diz "up to date". O único registro marcado como revertido é a tentativa de abril de `20260310024840_ai_assistant`, que depois foi aplicada com sucesso.
- **[V] Nenhuma das 5 tabelas ou colunas novas existe ainda.**
- **[V] As tabelas afetadas são pequenas:** `Office` com 448 linhas e `pdf_project` com 4.365. As migrações rodam em segundos.

| Migração | O que faz |
|---|---|
| `20261105000000_android_billing` | 2 tabelas novas, vazias |
| `20261106220000_explicit_office_permission_policy` | Coluna `Office.legacyPlanPermissions`; marca **todos** os cargos atuais como `true`, então nada muda para eles |
| `20261106223000_pdf_upload_ownership` | Coluna `pdf_project.uploadedById`, nula |
| `20261106230000_google_play_sync` | 1 tabela nova, vazia |
| `20261106233000_billing_purchase_coordination` | 2 tabelas novas, vazias |

**Ordem obrigatória:** migração primeiro, código novo depois. O código antigo ignora as colunas novas; já o código novo sem as migrações quebra as consultas de cargo.

## 3. Dados da produção e efeito do código novo

| Situação na produção | Quantidade | Hoje | Código novo |
|---|---:|---|---|
| Stripe ativa com `endDate` vencido | 122 | libera | libera, igual |
| Apple ativa com `endDate` vencido | 2 | vencida | vencida, igual |
| 2 assinaturas Stripe ativas na mesma empresa | 7 empresas | usa a mais recente | **corrigido em 10/11:** usa a mais recente e só registra no log |
| `Company.planId` diferente do plano da assinatura | 10 | não compara | **corrigido em 10/11:** não bloqueia e só registra no log |
| Stripe ativa com `paymentFailed` | 0 | — | — |
| Assinaturas Google | 0 | — | — |
| Apple com ID Stripe | 0 | — | — |

- **[V] Apple:** os IDs fixos do código novo, Starter `4ee81776…` (29) e Essentials `d52f1833…` (99), são exatamente os planos que a produção escolhe hoje pelo preço. As 2 assinaturas Apple são de `smartbuild_pro_monthly_99` no Essentials. O job de status da Apple não roda na produção, porque não há `APP_STORE_ISSUER_ID` nem `APP_STORE_PRIVATE_KEY`. Isso já é assim hoje.
- **[V] Stripe:** os 9 preços dos planos ativos existem, estão ativos e em `livemode`. Os 13 webhooks da tabela batem com a Stripe, todos `enabled`. O `/webhook` recebeu 28 chamadas com 200 e 2 com 301 em 7 dias.
- **[V] Portal da Stripe:** a configuração padrão está com troca de plano habilitada, mas **sem nenhum produto listado**. Isso já é assim hoje e o deploy não muda; fica como pendência à parte.
- **Correção de 10/11** (`resolveCompanySubscriptionStatus`): com 2 assinaturas ativas ou plano divergente, vale a assinatura ativa mais recente, como o `findFirst` da produção, e o conflito vai para o log como `[billing-review]`. Cadastro pendente e empresa sem plano continuam bloqueados, como a produção já faz no mobile. Compra nova continua barrada para empresa com 2 assinaturas ativas.

## 4. Variáveis de ambiente

A API lê o `.env` (`dotenv`). O `ecosystem.config.js` só define `NODE_ENV` e `REDIS_URL`.

| Variável | Produção hoje | No deploy |
|---|---|---|
| `BILLING_COORDINATION_ENABLED` | ausente | **[D]** recomendado: deixar ausente, igual a hoje, até corrigir S6 e S8 |
| `SUBSCRIPTION_ACCESS_COMPARE` | ausente | **[D]** `true` só registra comparações no log; pode ficar ausente |
| `GOOGLE_PLAY_NATIVE_ENABLED` | ausente | ausente, porque o Google ainda não está configurado na produção |
| `GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES` | ausente | ausente |
| `GOOGLE_PLAY_PUBSUB_AUDIENCE` / `_SERVICE_ACCOUNT` | ausentes | ausentes, até configurar a notificação do Google (RTDN) |
| `ANDROID_BILLING_PLAN_MAPPINGS` | ausente | ausente |
| `ANDROID_BILLING_REPORTING_ENABLED` | ausente | ausente |
| `ALLOW_MOBILE_STORE_TEST_PURCHASES` | ausente | ausente, e precisa continuar assim |

Com essa configuração, **nenhuma variável precisa ser criada no deploy**. A produção fica sem a coordenação entre provedores e sem o Google, como hoje.

## 5. Deploy, executado pelo Codex na VPS e conferido passo a passo

1. **GitHub:** commit no `new-hml` (código do servidor e correção de 10/11), validação na HML e PR do `new-hml` para a `PRODUÇÃO`, com merge pelo Rian.
2. **Backups no servidor:**
   - dump completo do banco;
   - `cp -a dist dist.pre-assinaturas-<ts>`;
   - `git diff > /root/backups/prod-local-<ts>.patch`;
   - `git branch backup/prod-8bed558 8bed558`.
3. **Migrações com o código antigo rodando:** `npx --no-install prisma migrate deploy`. Conferir as 5 migrações concluídas e `Office.legacyPlanPermissions = true` nas 448 linhas.
4. **Código:**
   - `git checkout -- src/server.ts src/services/LandingAnalyticsService.ts src/services/LandingAnalyticsService.test.ts`. O conteúdo deles já está no GitHub; o `ecosystem.config.js` não é tocado.
   - `git fetch origin` e depois `git reset --keep origin/PRODUÇÃO`. O `--keep` preserva o `ecosystem.config.js` alterado e recusa a operação se algo mais estiver em risco.
   - Conferir que `git status` mostra só o `ecosystem.config.js`.
5. **Build:** `npx --no-install prisma generate` e `npm run build`. Se falhar, restaurar o `dist` e não reiniciar.
6. **Reinício:** `pm2 restart api-smartbuild worker-smartbuild`.
7. **Testes rápidos:**
   - login na web e no app;
   - status de uma empresa normal e de uma das 7 duplicadas;
   - envio de invoice;
   - Crew com Worker;
   - assistente de IA (confirma o `.env` carregado antes dos imports);
   - log sem erros e com `[billing-review]` só para as empresas esperadas.

## 6. Reversão

- **Código:**
  - `git reset --keep backup/prod-8bed558`;
  - `git apply /root/backups/prod-local-<ts>.patch`, só para os 3 arquivos de `src`;
  - restaurar `dist.pre-assinaturas-<ts>` como `dist`;
  - `pm2 restart api-smartbuild worker-smartbuild`.
- **Banco:** não precisa reverter. O código antigo ignora as tabelas e colunas novas.

## 7. Depois do deploy

- **Admin Android `1.1.1 (5)`:** só promover para a faixa Produção depois de a API estar no ar. Sem o Google configurado, a tela de compra no Android mostra que a compra não está disponível.
- **Acompanhar os primeiros dias:** as compras Apple (risco aceito em 09/11, TASK-54), os webhooks Stripe e os logs `[billing-review]`.
- **Verificar à parte, só lendo:** se as 7 empresas com 2 assinaturas Stripe ativas estão sendo cobradas duas vezes.
- **Pendências separadas:** produtos no portal da Stripe; configuração do Google (RTDN, Pub/Sub e mapeamentos); S6 e S8 antes de ligar a coordenação.
- **Limpar a HML:** restaurar logins e assinaturas pelos backups em `/opt/smartbuild-hml-releases/`.

## Decisões pendentes [D]

1. Ligar `SUBSCRIPTION_ACCESS_COMPARE` (só log) ou deixar ausente.
2. Confirmar a coordenação desligada no primeiro deploy.
3. Decidir se um gestor pode continuar promovendo outra pessoa a Owner (fora deste deploy).
