# Auditoria do bloco de assinaturas, planos, pagamentos e permissões

Data: 2026-11-09. Etapa somente de investigação: nenhum código de produto, dado, Stripe, iOS ou produção foi alterado, nenhuma cobrança ou mensagem foi disparada. Este arquivo é o único acréscimo.

**Conclusão: o conjunto atual (`6738aec` + `b6e5093` + `89d79f80`) não deve ir para produção como está.** Há bloqueadores que atingem cliente pagante mesmo com todas as flags novas desligadas. Ver seção 6.

## Como ler as evidências

| Marca | Significado |
|---|---|
| **[V]** | Inspeção conferida diretamente no código nesta auditoria |
| **[R]** | Inspeção de revisão independente por área, não reconferida linha a linha |
| **[T]** | Teste automatizado executado nesta auditoria |
| **[H]** | Observado na homologação (somente leitura) |
| **[N]** | Ainda não testado |
| **Hipótese** | Depende de dado ou comportamento que não pude observar |

Os caminhos são relativos a cada repositório. A numeração `B`, `S`, `M`, `L` dos achados está na seção 6.

---

## 1. Linha do tempo e baseline

### Ponto de partida por repositório

| Repositório | Último estado anterior | Commits do trabalho | Observação |
|---|---|---|---|
| **API** (`SMARTBUILD_API`) | `3a28f16` (04/11) | `de91b63`, `6e030bc`, `6738aec` | Os 3 commits informados por Rian. Confere com o histórico |
| **Admin** (`C:/SB_ADMIN_LOCAL`) | `fa0504d` (02/11) | `b6e5093` (07/11) + alterações não commitadas | Único commit do bloco |
| **Web** (`SmartBuild_WEB_FRONT`) | `0682d831` (04/11) | `89d79f80` (07/11) | Entre os dois há `afc62e98` (invoice/estimate), fora do bloco |
| **Crew** (`smartbuild-funcionario-app-2026`) | `6858620` | Nenhum | Não foi alterado pelo bloco, mas consome a API alterada. TASK-21 em backlog |
| **Backoffice** | Faz parte do Web e da API | Nenhum commit próprio | Afetado por rotas `requireMaster` na API |

### Etapas

| Data | Commit | Conteúdo | Tasks |
|---|---|---|---|
| 06/11 04:55 | API `de91b63` | Pedido público de exclusão de conta (rota, página, 1 migration) | Sem task |
| 06/11 13:48 | API `6e030bc` "[feat] planos" | Android alternativo via Stripe (controller, política, reporting, job, 2 tabelas), núcleo inicial de decisão de acesso e comparador, docs da 218 | Sem task própria para o Android alternativo; docs da 218/219 |
| 06/11 | Branch `codex/task-219-subscription-comparison` (`2a096e2`, `58fa12f`) | Comparador opt-in. **Não é ancestral de `6738aec`** | 219 |
| 07/11 11:39 | API `6738aec` | 5003+/738−, 119 arquivos: 219, 220, 221, 53, 50 num único commit; 4 migrations | 219, 220, 221, 53, 50 |
| 07/11 11:39 | Admin `b6e5093` | Google nativo, preflight Apple/Google, perfil `hml-billing` | 53, 50 |
| 07/11 11:39 | Web `89d79f80` | Token de cadastro no checkout, mensagem de conflito | 50 |
| 07/11 15:09 | HML | API `6738aec`, web `bee57f0e`, 4 migrations | **[H]** |
| 08/11 10:13 | HML | Flags Google e coordenação ligadas, empresa sintética | **[H]** |
| 08/11 | EAS | AAB 1.1.1 (3), `7d6c86b7` | Build |

Tasks: TASK-218 a 221, 53 e 50 em validação; TASK-21 e TASK-54 em backlog com prazo vencido.

### Onde cada coisa está

| Item | Só local | GitHub (dev) | GitHub (produção) | HML | Produção real |
|---|---|---|---|---|---|
| Exclusão de conta `de91b63` | | sim | **sim** (`PRODUÇÃO` `101d8b4`) | sim **[H]** | **Desconhecido** |
| API `6e030bc` | | sim | **não** | sim **[H]** | **Desconhecido** |
| API `6738aec` | | sim | **não** | sim **[H]** | **Desconhecido** |
| Migrations 20261105 + 4 de 20261106 | | sim | **não** | aplicadas **[H]** | **Desconhecido** |
| Web `89d79f80` | | `new-HML` | **não** (`main` `9d333597`, `HOMOLOGACAO` `d6276089`) | Como `bee57f0e` | **Desconhecido** |
| Web `bee57f0e` (cherry-pick sobre `0682d831`) | Só na VPS HML | **não existe** | não | sim **[H]** | Não |
| Admin `b6e5093` | | `feat/timecard-management` | **não** (`main` `50dca13`, 97 commits atrás) | AAB (3) | **Desconhecido** |
| Skia HML, `versionCode 3` | **sim, sem commit** | não | não | AAB (3) | Não |
| Admin `docs/android-billing.md`, `modules/`, `src/app/billing-return.tsx` | **sim, não versionados** | não | não | Fora do AAB (3): a worktree não os contém | Não |

### Lacunas de evidência

1. **Não há como afirmar o que roda em produção.** Só existe chave da HML, e branch não prova deploy. O arquivo de CI tem extensão inválida (`deploy.ymlsssssssssssssss`), então não há deploy automático a inferir. **[R]**
2. **O estado do banco de produção é desconhecido.** Os números abaixo vêm da HML, restaurada de backup de 23/04/2026. São indicativos, não medição de produção.
3. **Versões publicadas nas lojas não foram inspecionadas.** O iOS é 1.1.1 (34) segundo `9a0c7f7`; o Android publicado não foi identificado.
4. **Alterações locais anteriores ao `6e030bc`** só existem pelo relato em `docs/subscriptions-baseline.md`. O estado antes do commit não é recuperável.
5. **Textos das tasks estão defasados:** dizem "sem commit" para trabalho hoje em `6738aec`. É defasagem, não falsidade. **[R]**
6. **`de91b63` e o Android alternativo de `6e030bc` não têm task.** **[R]**
7. **Sem SHA de entrega por task:** `6738aec` mistura cinco tasks, o que impede reverter uma isoladamente.

---

## 2. Inventário das mudanças

Convenção: **Regra** = muda regra de negócio. **Correção** = implementação ou segurança. Sem flag = vale assim que o código subir.

### 2.1 Decisão de acesso (TASK-219)

**I1. Núcleo comum de status web/mobile** — `SubscriptionAccessDecision.ts`, `UserController.ts`, `MobileAuthController.ts`
- Antes: status web e mobile divergiam; o mobile olhava registro inativo.
- Agora: mesma projeção, só registros ativos. Sem flag.
- Motivo: um dispositivo dizer uma coisa e outro, outra.
- Afeta: todos. Tipo: **Correção**.
- Evidência: **[T]** `SubscriptionAccessConsumers.characterization`, `MobileSubscriptionComparison`, `SubscriptionAccessDecision`.
- Risco: médio. Rollback: reverter hunks. Sem flag de retorno.

**I2. Duas linhas ativas ou plano divergente bloqueiam a empresa** — `SubscriptionAccessDecision.ts:109,118,175-193` **[V]**
- Antes: a linha mais recente decidia e o acesso seguia.
- Agora: `isExpired:true`, `plan:null`, `permissions:[]`, `accessIssue`. Sem flag.
- Motivo: não escolher contrato por acidente; plano divergente concedia permissões erradas.
- Afeta: toda empresa nesse estado. Tipo: **Regra**.
- Evidência: **[T]** para a decisão; nenhum cliente lê `accessIssue` **[R]**; **[N]** na UX.
- Risco: **alto** (B1, B2, B6). Rollback: voltar a seleção nos dois consumidores.

**I3. Mobile deixa de expirar Stripe pago pela data local** — `SubscriptionAccessDecision.ts:72-76`
- Antes: mobile expirava; web não.
- Agora: alinhado à web. Sem flag. Tipo: **Correção**.
- Risco: baixo. Depende dos webhooks de encerramento para bloquear.

**I4. Fronteira de tempo** — `<` virou `<=` para FREE/Apple/Google. **Correção**. **[T]**

**I5. Carência Apple com prazo confirmado** — `AppleBillingStatusService.ts`
- Agora libera durante a carência com data da Apple. Sem flag. Tipo: **Correção** com efeito de direito de acesso. **[T]** `AppleSubscriptionAccess.integration`.

**I6. Mapeamento de loja sem fallback por preço** — `MobileStorePlanMapping.ts`
- Antes: por preço ou primeiro plano disponível.
- Agora: explícito; produto sem mapa gera erro. Sem flag.
- Tipo: **Correção**. **[T]** `MobileStorePlanMapping`.
- Risco: médio (M3). Conferir os dois `planId` em produção.

**I7. Cadastro pendente com assinatura válida passa** — Tipo: **Correção**. **[T]**

### 2.2 Autorização e limites (TASK-220)

**I8. Guardas de plano, cargo e empresa nas rotas** — `middlewares/*Access.ts`, `projectRoutes`, `estimateRoutes`, `invoiceRoutes`, `customInvoice*`, `changeOrderRoutes`
- Antes: só token.
- Agora: empresa real do recurso, plano e cargo. Sem flag.
- Motivo: acesso entre empresas e a recursos fora do plano.
- Afeta: todos os usuários, em especial Crew e cargos parciais.
- Tipo: **Correção de segurança** com efeito de **Regra**.
- Evidência: **[T]** com autenticação simulada.
- Risco: **alto** (B3, B4, S2, S3). Rollback: retirar middleware reabre as brechas.

**I9. Rotas administrativas exigem Master** — `planRoutes`, `permission*`, `subscriptionRoutes`, `dashboardMasterRoutes`, `companyRoutes`, `extraEmployeeRoutes:18`
- Tipo: **Correção de segurança**. **[T]**
- O CRUD genérico de assinatura era acessível com qualquer token.

**I10. Extras de vagas exigem User Management** — `extraEmployeeRoutes.ts:21-30`. Tipo: **Correção** com efeito de regra. Ver B7 e M1.

**I11. `legacyPlanPermissions`** — migration `20261106220000`, `planPermissions.ts:14` **[V]**
- Antes: cargo vazio herdava o plano inteiro.
- Agora: só herda se legado. A migration marca **todos** os existentes como legados.
- Efeito: Worker de empresa nova nasce sem permissões efetivas. Sem flag.
- Tipo: **Regra**.
- Rollback: reverter código; **não** apagar a coluna, para não perder os `false` já gravados.

**I12. Vagas: transação, trava e nova contagem** — `employeeLimit.ts`, `UserController.ts`
- Antes: sem trava; filtro conforme modo.
- Agora: `company_id OU UserCompany`, com `FOR UPDATE`. Sem flag.
- Tipo: **Correção** de concorrência com efeito de **Regra** (M1).
- Evidência: **[T]** `UserController.seats`; relato de MySQL descartável, não reexecutado.

**I13. Criação de FREE restrita e transacional** — `SubscriptionController.ts`. Tipo: **Correção**. **[T]** Ver M2.

**I14. PDF com autor** — migration `20261106223000`, `companyResourceAccess.ts`. PDFs pendentes sem autor não podem mais ser vinculados. Tipo: **Correção**. **[T]**

**I15. Cancelamento administrativo declara escopo local** — `operationScope=local`, `providerActionPerformed=false`. Tipo: **Correção**. **[T]**

### 2.3 Google Play (TASK-221 e 53)

**I16. Validação Google por `subscriptionsv2`, fila, reconciliação e ack** — `GooglePlayBillingService.ts`, `GooglePlayPurchase.ts`, `jobs/googlePlayBillingJob.ts`, migration `20261106230000`
- Antes: validador simples, sem vínculo com empresa; RTDN sem autenticação.
- Agora: vínculo SHA-256, OIDC, fila durável. Flag `GOOGLE_PLAY_NATIVE_ENABLED`.
- **Com a flag ausente, o caminho antigo não existe mais: 503** (S1).
- Tipo: **Correção**, efeito operacional. **[T]** com gateway falso.
- Rollback: manter a fila; com compras reais, desligar interrompe ack e renovação.

**I17. Catálogo nativo e status** — `GooglePlayCatalogController.ts`, duas rotas novas. Tipo: funcionalidade. **[T]**

**I18. App Android nativo** — `android-billing.android.tsx`, `google-play-*`. **[T]** 110 testes Node.

### 2.4 Coordenação de compras (TASK-50)

**I19. Guarda de outro provedor — sempre ativa** — `SubscriptionPurchaseGuard.ts`, `StripeController.ts:2477`, `MobileAuthController.ts:531` **[V]**
- Antes: não existia no checkout; restore Apple só bloqueava Stripe ativo e válido.
- Agora: bloqueia com histórico não encerrado, **com flag desligada**.
- Tipo: **Regra**. **Desvio do limite.** Ver B5 e S4.

**I20. Reserva, idempotência, admissão** — `BillingPurchaseCoordinator.ts`, migration `20261106233000`, flag `BILLING_COORDINATION_ENABLED`. Tipo: **Regra**. Ver S6 a S11.

**I21. Webhook Stripe em transação, flag ligada** — `WebHookController.ts:224-243`. Com a flag desligada é equivalente **[R]**. Com a flag ligada: **Regra**.

**I22. `StripeSubscriptionItemService` aceita cliente transacional** — Valores e proração idênticos. **[T]** `StripeSeatsCoordination`, comparando com `6e030bc`. Tipo: refatoração.

**I23. Web: token de cadastro e mensagem** — `Login.tsx:764`, `SubscriptionPlans.tsx:236-240`. Mensagem em inglês fora do i18n. Tipo: compatibilidade.

### 2.5 iOS, compartilhado

**I24. Preflight Apple antes do StoreKit** — `billing-screen.tsx`, `sign-in-screen.tsx`, `apple-purchase-attempt.ts`
- Antes: abria o StoreKit direto.
- Agora: chama a API antes; falha impede a compra. Roda com flag desligada.
- Tipo: **Regra**. **Desvio do limite** (S5).

**I25. `MobilePlanSetup`** — antes refazia Owner e Administrator a cada ativação; agora só se vazio. Tipo: **Regra** (M4).

### 2.6 Android alternativo via Stripe (`6e030bc`), abandonado

**I26.** `AndroidBillingController`, `Policy`, `Reporting`, `androidBillingReportingJob`, tabelas `AndroidBillingAttempt` e `AndroidBillingReport`, `invoice.paid`/`charge.refunded` em `stripeWebHook.ts`. Ver M7.

### 2.7 Exclusão de conta (`de91b63`)

**I27.** Rota pública, tabela própria. Só grava pedido; não apaga nada. Ver M6.

### 2.8 Migrations, configuração, jobs, dependências, infra

| Migration | Efeito em dados | Rollback |
|---|---|---|
| `20261105000000_android_billing` | 2 tabelas vazias | DROP se vazias |
| `20261106000000_account_deletion_requests` | 1 tabela | Manter; DROP perde pedidos |
| `20261106220000_explicit_office_permission_policy` | Coluna + `UPDATE` em **todos** os cargos | Sem volta limpa |
| `20261106223000_pdf_upload_ownership` | Coluna nula | Pode ficar |
| `20261106230000_google_play_sync` | Tabela com tokens sensíveis | DROP só se vazia |
| `20261106233000_billing_purchase_coordination` | 2 tabelas | DROP só se vazias |

- **Limite geral:** DDL no MySQL não tem rollback transacional. Falha parcial bloqueia as seguintes e exige diagnóstico. **[R]**
- **Ordem:** a migration `20261105` tem timestamp anterior à `20261106000000`, já presente em `PRODUÇÃO`. `migrate deploy` deve aplicar sem erro, mas **não** rodar `migrate dev` em banco compartilhado. Ensaiar em cópia. Hipótese, não executado.
- **Migrar antes do código:** código novo lê `Office.legacyPlanPermissions`; sem a coluna, login e autorização falham (S12).
- **Flags novas:** nenhuma liga por padrão. Tabela de variáveis em `docs/hml-billing/configuration.env.example`.
- **Sem flag:** guardas de rota, decisão de acesso, guarda de provedor, I11, mapeamento e remoção do caminho Google antigo.
- **Jobs:** `googlePlayBillingJob` e `androidBillingReportingJob` são agendados sempre, a cada minuto; saem de imediato com flag desligada. Não há interruptor global. **[R]**
- **Dependências:** `package.json` e lockfile da API sem mudança; Admin sem mudança nos commits. **[R]**
- **Não commitado no Admin:** `eas-build-post-install` chama `scripts/install-skia-hml.cjs`, não versionado. Commitar um sem o outro quebra todo build, inclusive iOS. **[R]**
- **HML:** override 90 de isolamento, override 95, proxy Google, 495 cargos legados. **[H]**

---

## 3. Verificação dos limites combinados

| Limite | Resultado | Evidência |
|---|---|---|
| Não mudar preços | **Cumprido** | `line_items` e `stripePriceId` iguais **[V]**; `StripeSeatsCoordination` **[T]** |
| Não mudar contratos Stripe | **Cumprido nos dados**; nenhum contrato é cancelado ou recriado | **[R]** |
| Não mudar regras do Stripe | **DESVIO** | Guarda de provedor no checkout sem flag (`StripeController.ts:2477`) **[V]**. Com flag ligada: autenticação, reserva, admissão e reescrita do webhook **[V]** |
| Não mudar checkout/telas Stripe | **DESVIO pequeno** | Web: mensagem nova e envio de token. Payload da sessão intacto **[V]** |
| Não mudar fluxo iOS | **DESVIO** | Preflight no StoreKit; guarda de provedor recusando compra já cobrada; bloqueio de login; mapeamento **[V]/[R]**. Uma OTA leva o preflight ao build 34, se o runtime continuar 1.1.1 **[R]** |
| Não reestruturar backoffice | **Cumprido** | Sem mudança em telas. Rotas passaram a exigir Master |
| Não automatizar catálogo | **Cumprido** | Mapeamento manual |
| Não ativar Stripe no Android | **Parcial** | Nenhuma tela chama. Rotas existem; `checkout` só abre com várias flags ligadas e `GOOGLE_PLAY_NATIVE_ENABLED` diferente de `true`. `POST /android-billing/status` fica sem flag (M7) **[R]** |

---

## 4. Regressão dos clientes existentes

| Cenário | Resultado com flags desligadas | Com coordenação ligada | Base |
|---|---|---|---|
| Stripe válida, linha única | OK | OK sem histórico; recusada com histórico (S6) | **[V]** |
| Apple válida | OK; bloqueio se houver duas linhas | Renovação pode congelar (S7, S8) | **[V]** |
| Mensal, trimestral, anual | OK, sem cálculo por período | Igual a linha acima | **[V]** |
| **Quatro meses** | Código é genérico por `validityDuration`. **O catálogo HML não tem plano de 4 meses** | Idem | **[H]**, legado desconhecido |
| Cancelamento com período pago | OK, ativa até o fim | OK, salvo S6 | **[R]** |
| Expiração | OK | Igual | **[T]** |
| Falha de pagamento Stripe | API nega no primeiro `payment_failed` (B8) | Igual; pior caso em S6 | **[R]** |
| Carência Apple/Google | OK | S7 a S8 | **[T]** |
| Legada, demo, trial da master | Sem linha vira bloqueio como antes; FREE usa a data | Igual | **[R]** |
| **Upgrade durante trial** | **Bloqueio (B1, B2)** | Linhas novas: caminho muda; existentes seguem | **[V]** |
| Troca de empresa, sessão antiga | OK, reavalia por request | Igual | **[R]** |
| Cargos | Conforme I11; S3 | Igual | **[V]** |
| Workers | Recibo falha (B3); perfil falha (B4); plano vencido perde horas (M5) | Igual | **[V]** |
| Permissões e limites | Starter sem `Projects` (S2); `SmartBuild Pro Monthly` sem `User Management` | Igual | **[H]** |
| Duas assinaturas | Bloqueio (B6) | Igual | **[V]** |
| Outro provedor | Bloqueio por histórico (B5, S4) | Mais amplo | **[V]** |
| Restauração e vínculo | Vínculo correto no código; aparelho **[N]** | Igual | **[R]** |
| Webhook repetido/atrasado/fora de ordem | Stripe como antes; Google relê estado | Stripe `subscription.*` melhora; `invoice.*` não | **[R]** |
| Concorrência | Vagas protegidas; compras não | Trava por empresa | **[R]** |
| Falha temporária Google/backend | Não concede; cliente pago expira no `endDate` se a falha persistir (M8) | Igual | **[R]** |
| Endpoints que contornam | **Sim** (S10) | Igual | **[R]** |
| Jobs e migrations | Seção 2.8 | | **[R]** |

### Medição na cópia HML (backup de 23/04/2026, somente leitura) **[H]**

| Medida | Valor |
|---|---|
| Linhas de assinatura ativas, todas Stripe | 142 ativas, 7 inativas |
| Provedores Apple/Google | 0 |
| Empresas com mais de uma linha ativa válida agora | 0 |
| Plano divergente | 0 |
| FREE ativa e não vencida (expostas a B1/B2 ao pagar) | **4** |
| Stripe pago inativo sem `stripeSubscriptionCanceled` | 2 linhas, 2 empresas |
| Dessas, empresas com outra linha ativa | 1 |
| Empresas que já tiveram FREE + mensal ativas juntas (TASK-219) | **6**, FREE já vencida |
| Cargos Worker legados e vazios | **159**, com **331** usuários |

A HML não tem Apple nem Google, portanto **não mede** esses grupos em produção.

---

## 5. Evidência de validação

### Confirmado por inspeção direta **[V]**
B1, B2, B3, B4, B5, S3, S6, S7 (código), S8, I2, I11, guardas de provedor, comportamento do coordenador.

### Confirmado por revisão independente **[R]**
Demais achados. Uma leitura estática pode errar; a reconferência por teste é parte das correções.

### Confirmado por teste automatizado **[T]**, executado em 09/11
- **API:** 37 de 37 suítes, 941 testes, todas as suítes alteradas no intervalo. Banco inválido e credenciais neutralizadas. Uma suíte falhou na primeira rodada porque `git` não estava no PATH e passou ao repetir.
- **Admin:** 110 de 110 testes Node.

**Limite:** os testes usam mocks e fixam o comportamento atual. Vários fixam como desejado justamente o que este relatório aponta (ex.: `MobilePurchaseGuard`, `SubscriptionPurchaseGuard`). `ResourceWrites.authorization.test.ts:44` chama-se "Crew", mas envia `project_id`, que o Crew não envia. Não reexecutei os harnesses MySQL (`task220`, `task221`, `task50`); seus resultados são relato. Não há teste contra build publicada.

### Confirmado em homologação **[H]**
Commit e migrations implantados; serviços ativos; isolamento de rede; flags; catálogo HTTP 200; 2 notificações RTDN com HTTP 200; empresa sintética com zero compras; agregados acima.

### Ainda não testado **[N]**
- Qualquer compra Google real ou sandbox, ack, renovação, cancelamento, expiração, restauração.
- Sandbox Apple e Stripe nesta versão.
- Webhooks Stripe reais.
- Web, Admin e Crew percorridos contra a HML.
- Versões antigas publicadas contra a API nova.
- Troca de empresa em aparelho.
- Qualquer dado de produção.

---

## 6. Relatório em linguagem simples

### O que entrou

1. **Regra única de "essa empresa pode usar?".** Web e app agora decidem igual.
2. **Porteiros em quase toda a API.** Antes, ter login bastava para muitas operações. Agora o sistema confere empresa, plano e cargo. Isso fecha brechas reais e é onde mora o maior risco de barrar quem tem direito.
3. **Assinatura Android pelo Google Play**, com confirmação no servidor e notificações.
4. **Trava para não pagar duas vezes** em provedores diferentes.
5. **Formulário público de pedido de exclusão de conta.**
6. **Sobra de Android via Stripe**, abandonada, ainda no código.

### Exemplos do dia a dia

- Uma empresa em trial decide pagar: **paga e fica sem acesso**, sendo levada de volta à tela de compra.
- O trabalhador tenta anexar um recibo no app Crew: erro.
- O trabalhador tenta trocar a própria foto ou telefone de perfil: erro, pois o sistema pede permissão de gestor.
- Quem já foi assinante Stripe compra no iPhone: **a Apple cobra e a SmartBuild recusa**.
- Um cartão falha uma vez: Crew e Admin passam a dar erro antes do fim das tentativas de cobrança.
- Um Worker antigo consegue se promover a dono (brecha que já existia e continua aberta).

### Problemas por gravidade

#### Crítico, vale mesmo com flags desligadas

| # | Problema | Evidência | Correção a discutir |
|---|---|---|---|
| **B1** | Pagar no Stripe durante trial válido deixa duas linhas ativas e bloqueia a empresa. O checkout não define `subscription_data`, então cai no caminho sem `companyId` (`WebHookController.ts:549-656`), que não desativa a FREE | **[V]**; 4 empresas expostas e 6 precedentes **[H]**. Teste do webhook **[N]** | Não contar FREE como conflito contra pago, sem mudar Stripe |
| **B2** | Compra Apple durante trial: mesmo bloqueio. `persistVerifiedStoreSubscription` só desativa linhas do próprio provedor, e a FREE é `stripe` por padrão (`MobileAuthController.ts:534-542`) | **[V]**; **[N]** | Mesma correção de B1 |
| **B3** | Crew não anexa recibo: o guarda exige `project_id`, o Crew envia `serviceProjectId` (`CreateInvoiceCostProjectController.ts:84`, Crew `ModalAddCost:165-173`). HTTP 400 | **[V]**; teste enganoso | Derivar o projeto do `serviceProjectId` no servidor |
| **B4** | "Meu perfil" no Web e Admin passa pelo guarda de gestão (`userRoutes.ts:31`). Quem não tem User Management recebe 403; cargo novo também, por causa de `office` sem `company_id` (`userManagementAccess.ts:29,33`) | **[V]**; **[N]** | Auto-edição separada, com campos fechados e sem troca de cargo |
| **B5** | Compra Apple já cobrada é recusada se houver Stripe pago inativo sem marca de cancelada, linha que o próprio webhook gera (`SubscriptionPurchaseGuard.ts:30-33`, `MobileAuthController.ts:531`). Google tem efeito análogo | **[V]**; 2 linhas **[H]** | Só bloquear contrato vigente; checar antes da compra |

#### Alto

| # | Problema | Condição | Base |
|---|---|---|---|
| **B6** | Duas linhas ou plano divergente: bloqueio total, sem tela explicativa, empurrando para nova compra (risco de cobrança dupla) | Sem flag | **[V]/[R]** |
| **B7** | Worker legado com permissão herdada pode trocar o próprio cargo por Owner via `PUT /user` e comprar vagas reais. Já existia; o guarda não fecha. **Corrigido em `e667b54`, na HML em 09/11/2026:** o guarda valida `office_id` e `office.id`, e só Owner troca o próprio cargo. Testes automatizados passam. Na HML, em 10/11, o `worker@hml.test` (Worker legado com User Management) tentou virar Owner por `office.id`, por `office_id`, pelos dois juntos, e também virar Administrator: as quatro tentativas receberam 403 e o cargo não mudou. A edição de usuários pelo Owner na web segue normal. Promover **outro** usuário a Owner segue permitido (regra a decidir) | 331 usuários **[H]** | **[V]** |
| **B8** | Primeiro `payment_failed` nega a API enquanto o Stripe ainda retenta | Sem flag; decisão de negócio | **[R]** |
| **S1** | Google existente para de sincronizar sem a flag (503); produto legado não mapeia | **Só se houver Google em produção** | **[R]** |
| **S2** | Tela liberada e API negada: Dispatch, Schedule e modais de Invoice exigem `Projects`; Starter não tem essa permissão | Sem flag | **[R]/[H]** |
| **S3** | Multiempresa: gestor de uma empresa não edita quem também está em outra | Sem flag; decisão de negócio | **[V]** |
| **S4** | Checkout Stripe bloqueado por linha Apple/Google inativa não terminal, possivelmente para sempre | Sem flag | **[V]** |
| **S5** | Preflight iOS: falha de API, 403 ou 404 impede a compra; só Owner/Administrator passa | Sem flag | **[R]** |
| **S6** | Renovação Stripe válida ignorada por linha antiga inativa, com HTTP 200 e sem reenvio. Pior caso: pagou e ficou bloqueado | **Flag ligada** | **[V]**; 1 empresa **[H]** |
| **S7** | Refresh Apple falha com o `MOBILE_APP_PRODUCTS_JSON` no formato objeto, que é o do `.env.example` (`AppleBillingStatusService.ts:183-184`). Assinante expira na data antiga | **Flag ligada** | **[V]** no código; valor real desconhecido |
| **S8** | Renovação Apple descartada por conflito | **Flag ligada** | **[V]** |
| **S9** | Reserva `launched` nunca expira: app fechado prende a empresa em todos os provedores, sem ferramenta de liberação | **Flag ligada; a HML está assim** | **[V]** |
| **S10** | Rotas irmãs sem guarda: `/timecards/all/:companyId`, faturas e portal Stripe, `companyRoutes`, `clientRoutes`, várias de usuário. Já existiam | Sem flag | **[R]**, controllers não lidos integralmente |
| **S11** | Checkout abandonado segura a empresa até 24 h; POST incerto trava após 23 h; autenticação nova afeta aba antiga e cargos personalizados | **Flag ligada** | **[V]/[R]** |
| **S12** | Subir o código antes das migrations derruba login e autorização | Ordem de deploy | **[R]** |

#### Médio

- **M1.** Contagem de vagas mudou; ex-funcionário com `company_id` pode ocupar vaga.
- **M2.** `POST /subscriptions` retorna 409 com FREE vencida e ainda ativa. Na HML, 3 empresas nessa condição.
- **M3.** Mapeamento Apple sem fallback: confirmar IDs e env de produção. `MOBILE_APP_PLAN_ID` mudou de alcance.
- **M4.** Ativação de plano não atualiza mais Owner/Administrator preenchidos em upgrade.
- **M5.** Plano vencido tira do Worker as próprias horas e agenda. Decisão de negócio.
- **M6.** Exclusão de conta (em `PRODUÇÃO`): sem `trust proxy`, 30 envios por hora podem valer para todos; sem operação para atender o prazo de 7 dias prometido; se as variáveis de retenção faltarem, retorna 503.
- **M7.** Sobras do Android alternativo: rotas ativas, `POST /android-billing/status` sem flag, módulo nativo local `modules/` com User Choice Billing, `billing-return.tsx`. Remover antes de qualquer AAB de produção.
- **M8.** Google: retry sem limite; falha prolongada expira pagante sem folga; conta Google em duas empresas trava o catálogo no aparelho.
- **M9.** Coordenação: substituição Google em duas etapas e linhas históricas Apple bloqueiam; transação segura a trava durante chamada à Apple.
- **M10.** Migration falha no meio exige intervenção manual.
- **M11.** `6738aec` mistura cinco tasks; rollback seletivo é difícil.

#### Baixo

Eventos Stripe extras se `setupStripeWebhooks` rodar de novo; arquivo temporário em multipart negado; docs defasados; mensagem fora do i18n; dados legados com referências inconsistentes (Hipótese); Worker com plano expirado em loop de navegação no Android.

### Correções aplicadas depois da auditoria

**B1/B2 — corrigido localmente em 09/11, aprovado por Rian. Sem commit, sem deploy, sem validação com pagamento real.**
- Regra: uma linha FREE válida deixa de contar como conflito quando há assinatura paga ativa cujo plano é o plano atual da empresa. Fica em `withoutSupersededFree`, em `SubscriptionAccessDecision.ts`.
- Leituras em `UserController.ts`, `MobileAuthController.ts` e `CompanyFeatureAccess.ts`: de 2 para 10 linhas, com o tipo do plano. Efeito no contrato: `subscription.plan.validityType` passa a vir na resposta; é aditivo e nenhum cliente lê `subscription.plan`.
- `GooglePlayBillingService.ts`: FREE não recusa mais compra Google já paga.
- Sem alteração em webhook, checkout Stripe, compra Apple, preços, dados ou migrations.
- Permanecem como conflito: duas pagas ativas; FREE com pago de plano diferente do da empresa; linha paga de tipo desconhecido.
- O teste que exigia o conflito (`a still-valid FREE grant...`) foi substituído, por ser a decisão revertida. A expectativa de formato da consulta em `MobileSubscriptionComparison.test.ts` foi atualizada.
- Limites conhecidos: pago cancelado antes do fim do trial deixa a empresa bloqueada até nova compra; Android em trial válido não compra pela tela.
- Reversão: desfazer essas alterações. Não há dado nem migration envolvidos.

**B3 — corrigido localmente em 09/11, aprovado por Rian. Sem commit, sem deploy, sem validação no app Crew.**
- O problema era maior que o registrado: o passo 1 (`POST /invoicecostproject`, 400) e o passo 2 (`POST /costproject`, 403) falhavam, e custos antigos sem projeto no recibo não podiam ser editados nem excluídos (33 na cópia HML **[H]**).
- `CreateInvoiceCostProjectController.ts` aceita `project_id` ou `serviceProjectId`. O recibo do Crew continua sem projeto e registra `autorId`.
- `projectWorkAccess.ts`: recibo sem projeto resolve o projeto pelos custos já ligados; sem custos, só quem enviou pode usar, e o serviço da requisição decide o projeto. Custo cujo recibo não tem projeto usa o próprio serviço.
- Não mudam: app Crew, Web, Admin, totais financeiros, dados ou migrations. Preencher o projeto foi rejeitado porque faria esses custos entrarem no total de materiais (`ProjectController.ts:490`).
- O teste que dizia "Crew" e enviava `project_id` foi renomeado; há testes novos com o envio real.
- Fora desta correção: custo sem recibo no Crew já falhava antes deste trabalho (`CreateCostProjectController.ts:64`); custos com recibo do Crew ficam fora do total de materiais, decisão pendente.
- Reversão: desfazer essas alterações. Recibos criados no intervalo ficam com `autorId`, sem efeito.

**B4 — corrigido localmente em 09/11, aprovado por Rian. Sem commit, sem deploy, sem validação nas telas.**
- `PUT /user` com o `id` da própria sessão e sem `company_id` agora é auto-edição: `routeOwnProfileUpdate` repassa só `id`, `name`, `email` e `phone` a `updateUserProfile`, a mesma função que o Crew já usa.
- Toda chamada de `PUT /user` com `company_id` (telas de gestão) segue pelo guarda sem mudança.
- `updateUserProfile` passou a recusar nome ou e-mail vazios e e-mail de outra conta, com 400. Campos ausentes continuam sem alteração, o que preserva envios parciais do Crew.
- Salvar o próprio perfil deixa de depender de plano, cargo ou assinatura, como antes de `6738aec`.
- Efeito colateral positivo: fica fechada a troca do próprio cargo sem `company_id`. O caminho com `company_id` foi fechado depois, em `e667b54` (ver B7).
- Fora desta correção: S3 (gestor multiempresa editando outra pessoa).
- Reversão: desfazer essas alterações. Sem dado nem migration envolvidos.

**B5 — corrigido localmente em 09/11, aprovado por Rian. Sem commit, sem deploy, sem sandbox Apple.**
- Nova `assertNoActiveForeignContract`: depois da cobrança da loja, só contrato ativo em outro provedor recusa o recibo; histórico inativo e FREE não recusam. Aplicada em `MobileAuthController.ts` (coordenação desligada) e `GooglePlayBillingService.ts`.
- Antes da cobrança nada mudou: `assertNoForeignSubscription` segue no checkout Stripe, no catálogo Google e na reserva.
- **Complemento do B2:** a checagem `rejectActiveStripe`, usada pela tela de assinatura do app logado, tratava FREE como assinatura web ativa e recusava a compra Apple já cobrada. Essa checagem já existia antes do bloco. FREE foi excluída dela. A correção anterior do B2 só cobria o fluxo de cadastro.
- Risco aceito: linha Stripe inativa que ainda esteja em cobrança no Stripe (`past_due`) não é distinguível sem consultar o Stripe. O cliente pode pagar nos dois provedores e, se o Stripe se recuperar, cair em B6.
- Fora desta correção: S4 e S6 a S9. Recibo recusado por contrato realmente ativo continua cobrado.
- Reversão: desfazer essas alterações. Sem dado nem migration envolvidos.

### Regressão de contrato: API antiga × nova com banco cópia (09/11)

Critério: cliente desatualizado precisa continuar funcionando depois do deploy, sem atualização obrigatória.

**Método.** `3a28f16` e a árvore local atual (com B1 a B5), rodando lado a lado em dois clones descartáveis do banco local, com rede externa bloqueada no processo. Foram 496 rotas e 11 perfis reais. 120 rotas tiveram guarda alterada. Foram 1.947 GETs e 968 escritas válidas, comparando status e formato. Chamadas ao Stripe e à Intuit foram bloqueadas e registradas (nada saiu). Em paralelo, leitura de cada rota alterada contra o que envia cada cliente: Web `main` e `new-HML`, Admin `9a0c7f7` (iOS 1.1.1 build 34), Crew `testescomsdk55` e `new-idv`.

**Quebras confirmadas por execução e pelo envio real do cliente**

| # | Grav. | O que quebra | Quem | Evidência (antes → agora) |
|---|---|---|---|---|
| **R1** | Crítica | `POST /custom/invoice/:id/send` e `/send-multiple`: o cliente envia `externalInvoiceId`; o guarda procura por `Invoice.id` | Todos, inclusive Owner, em Web e Admin | Chegava ao controller (400 por corpo de teste) → 403. 1.204 invoices com esse campo no clone |
| **R2** | Crítica | `POST /invoice/send/paid`: o guarda procura `pdfInvoicePaidId` na tabela errada | Web `new-HML` e Admin | Chegava ao controller → 403. 752 recibos no clone |
| **R3** | Alta | Stripe ativo com `paymentFailed` ou `stripeSubscriptionCanceled`: status diz que está válido, rotas respondem 403 | Empresa pagante durante tentativa de cobrança | `GET /project/find/:id` 200 → 403. Zero linhas hoje no clone; ocorre a cada falha de cobrança |
| **R4** | Alta, decisão | Empresa vencida: rotas passam a responder 403. O Admin antigo não tem paywall | Empresas expiradas, em Web, Admin e Crew | Dezenas de rotas 200 → 403 |
| **R5** | Média | Cargo com permissões explícitas: tela liberada, rota exige outra permissão | 16 usuários em cargos personalizados no clone | Ex.: `GET /invoice/:id` 200 → 403 para cargo Sales |
| **R6** | Alta, condicional | Android antigo: `verify` e `restore` respondem 503 sem `GOOGLE_PLAY_NATIVE_ENABLED`; com a flag, compra nova recusada por falta de account ID | Só se a versão publicada vender pelo Google | Inspeção; versão publicada não identificada |

**Sem quebra encontrada.** Assinante pago ativo (Owner, Administrator, Worker, Apple) e multiempresa em leitura: nenhuma quebra confirmada. Login e biometria: sem mudança de contrato para os cenários existentes no clone. Formato de resposta: só `subscription.plan.validityType` a mais, ignorado pelos clientes. **Crew:** nenhuma quebra de contrato além de R3, R4 e do B3 já corrigido. Os dois planos do mapeamento Apple existem no clone.

**Bug anterior a este trabalho.** Duas aprovações manuais simultâneas do mesmo estimate geram erro não tratado (`manualApprovalEstimateController.ts:86`, P2002) que derruba o processo inteiro da API, nas duas versões.

**Limites.** O corpo das escritas foi genérico; a confirmação de cada quebra veio da leitura do cliente. Não houve execução de app real, upload de arquivo, Stripe, Apple ou Google. Dados do clone vão até 17/09/2026, com 16 empresas pagas e 1 Apple. Parte dos 200 → 403 listados pela sondagem é artefato de teste (`id` genérico, e-mail repetido, ordem de escrita) e foi descartada.

### Correções de contrato R1 a R6 (09/11, localhost; sem commit, push, deploy ou OTA)

| # | O que mudou | Arquivos | Compatibilidade com cliente antigo |
|---|---|---|---|
| **R1** | `send`, `send-multiple` e `GET .../pdf` autorizam a empresa enviada e depois resolvem o número dentro dela. O controller lê a invoice fixada pelo middleware (`authorizedInvoiceId`) | `companyResourceAccess.ts`, `customInvoiceRoutes.ts`, `CustomInvoiceController.ts` | Mesmo `externalInvoiceId` e `companyId` |
| **R2** | `pdfInvoicePaidId` é lido em `PdfInvoicePaid` e precisa pertencer à invoice pedida | `companyResourceAccess.ts`, `customInvoiceRoutes.ts` | Mesmo payload |
| **R3/R4** | O guarda de rota decide identidade, vínculo, cargo e plano. Estado de assinatura deixa de negar rota. A baseline só exigia login nessas rotas (`checkToken` em todas, sem guarda adicional). O status continua informando `paymentFailed`, cancelamento e expiração separadamente | `CompanyFeatureAccess.ts` | Nenhuma atualização necessária |
| **R5** | Lista explícita por rota, só para leituras comprovadas por tela (tabela abaixo) | `companyResourceAccess.ts`, `projectRoutes.ts`, `estimateRoutes.ts`, `changeOrderRoutes.ts`, `invoiceRoutes.ts` | Telas antigas voltam a ler |
| **R6** | Sem alteração de código | — | Risco condicional, ver abaixo |

Leituras liberadas em R5, além da permissão original: `GET /project/find` (Invoice, Time Cards, Job Schedule, Job Dispatch, Estimates); `GET /project/find/:id` (Invoice); `GET /project/services-project/:id` (Time Cards, Reports); `GET /time-activies` (Activities); `POST /project/schedule` (Job Schedule); `POST /service-project/schedule` (Job Dispatch); `GET /estimate/project/:id` (Projects, Invoice); `GET /changeorder/by-project/:id` (Projects); `GET /invoice/:id` (Projects).

**Evidência de execução** (banco cópia descartável, e-mail e S3 simulados, rede externa bloqueada):
- Testes escritos antes da correção falharam: R1/R2 17 de 24, R3/R4 8 de 17, R5 15. Depois: 41 suítes, 1086 testes, TypeScript e diff-check sem erro.
- Payload real antigo × nova, 13 de 13 conforme esperado: envio individual e múltiplo voltam a enviar; número ausente 404; empresa alheia e número repetido em outra empresa 403 sem e-mail; recibo válido envia; recibo inexistente, de outra invoice ou de outra empresa 403 sem e-mail; `paymentFailed`, flag de cancelamento e contrato encerrado voltam a ler.
- A API antiga enviava e-mail com empresa alheia e anexava recibo de outra invoice (bug fechado por R1/R2).
- Comparação ampla (496 rotas, 11 perfis, 2.915 chamadas): Owner vencido sem bloqueio real restante. O que resta foi triado em artefato de teste (`id` genérico, e-mail repetido, ausência de query, ordem de escrita) ou negação legítima (rotas Master; Worker criando cargo; cargo sem o módulo em rota sem tela correspondente).

**Inspeção estática:** mapa tela → endpoint de R5 em Web `new-HML` e Admin `9a0c7f7`.

**Testes alterados, com motivo:** em `resourceRoutes.authorization.test.ts`, `send`, `send-multiple` e `pdf` usavam `id` fictício e foram trocados para número e `companyId`, o contrato real. Em `userManagementAccess.test.ts` (5 casos) e `CompanyFeatureAccess.test.ts` (2 casos), os testes exigiam o bloqueio por assinatura removido por R3/R4. O conflito de duas assinaturas pagas continua testado no status.

**R6 (risco condicional).** O Admin `9a0c7f7` tem código de compra Android, mas os SKUs padrão são os da Apple (`smartbuild_pro_monthly_*`), inexistentes no catálogo Play atual, e o clone não tem assinatura Google. Não foi possível verificar o que está distribuído na Play Store. Nada foi afrouxado.

**Pendências e limites destas correções**
- Empresa sem plano (28 na HML): sem plano para intersectar, decide o cargo (Owner, Administrator ou permissão explícita). Worker sem permissão só usa o caminho de designação. **Decisão de Rian em 09/11: manter negadas as rotas administrativas para esses workers** (11 na cópia do banco, com cargo vazio e empresa sem plano), mesmo com a baseline abrindo.
- `multiple_subscriptions` e `plan mismatch`: o status segue bloqueando (B6), as rotas não. Essa divergência é a mesma da baseline nas rotas.
- `GET /project/find` devolve a mesma resposta completa a quem tem só a permissão da tela; era assim na baseline.
- Escritas a partir de telas de outro módulo continuam negadas (ex.: criar projeto a partir de Invoice; enviar invoice pela aba Projects sem `Invoice`). Se forem operações desejadas, é decisão própria.
- 5 números de invoice repetidos dentro da mesma empresa: o comportamento anterior (primeiro encontrado) foi mantido.
- Não há validação em app real, Stripe, Apple ou Google.

### Varredura final de regressão: `PRODUÇÃO` (`101d8b4`) × API local (09/11)

Comparação das duas versões em clones descartáveis, com rede externa bloqueada, usando IDs corretos por rota, e-mail real de cada usuário e login real. 496 rotas, 12 perfis (incluindo worker designado em serviço), cerca de 3.200 chamadas. `POST /auth` idêntico nos 12 perfis; `POST /auth/by-company` idêntico nos 3 usuários testados.

**Resultado para clientes pagantes (Owner, Administrator, Worker, Apple, trial, multiempresa):** nenhuma rota que eles usam quebrou. Cada diferença restante foi conferida no cliente:

| Diferença | Conclusão |
|---|---|
| `PUT /company/:id`, `/client/edit-data`, `/master-dashboard`, `PUT /subscriptions/:id` (Master) | Chamadas só nas telas Master. Owner edita pela rota `/company/update/:id`, que não mudou |
| `POST /pdfcontractproject/find` | Sem tela que use |
| Worker criando ou editando cargo | Brecha fechada de propósito; cargo personalizado com User Management continua podendo |
| Master em rotas com o próprio ID como alvo | Artefato do teste |
| `worker_expired` | Empresa sem plano, decisão registrada de manter negado |
| `subscription.plan.validityType` | Campo extra, nenhum cliente lê |

**Único ponto a observar:** a aba Invoice do projeto no Web aparece para quem tem `Projects`, mas cargo sem `Invoice` não consegue criar ou enviar invoice ali (leitura foi liberada em R5, escrita não). Na cópia do banco, 6 usuários em cargos personalizados têm `Projects` sem `Invoice`, e 2 deles sem `Estimates`. **Decisão de Rian em 09/11: manter negado.** Quem não tem `Invoice` não cria nem envia invoice pela aba do projeto.

Limites: mesmos da seção anterior. Sem app real, Stripe, Apple ou Google. O commit em produção real é presumido pelo branch, não verificado.

### Implantação na HML (09/11, 09:13 UTC)

`b6bea64` enviado a `origin/new-hml` e implantado **somente na HML**, por fast-forward a partir de `6738aec`. Sem migration, sem mudança de dependência e sem `npm ci`. `PRODUÇÃO` continua em `101d8b4`.

Backup: `/opt/smartbuild-hml-releases/pre-b6bea64-20261109T091307Z` (`dist.tar.gz` e `previous-sha`). Reversão: restaurar o `dist`, voltar o código a `6738aec` e reiniciar `smartbuild-api`.

Conferido após o reinício: serviço ativo, commit correto, isolamento de rede e overrides 90/95 preservados, flags inalteradas, proxy Google ativo, catálogo 200 (local e HTTPS), rota protegida sem token 400 e nenhum erro no journal no primeiro minuto. Isso prova só a saúde do serviço. Telas, apps e compras ainda não foram validados nesta versão.

### Teste real Google Play no Admin Android (09/11, HML)

Admin Android 1.1.1 (4), build `4498ed3d`, com OTA de homologação; API `b6bea64`; empresa sintética; conta de License testing; cartão de teste, sem cobrança real. Tempo acelerado do Google (trial 3 min, mês 5 min). Resultado observado no aparelho e confirmado no banco e no Nginx da HML:

| Teste | Resultado |
|---|---|
| Cancelar a folha do Google | Reserva liberada; sem assinatura |
| Compra Starter com trial | Validada no servidor, acknowledgement feito, RTDN 200 |
| Plano e permissões | Starter limitado às permissões do plano; Essentials com menu completo e 6 vagas |
| Renovação | Trial virou ativa; vigência avançou |
| Cancelamento | Renovação desligada; acesso mantido até o fim do período |
| Expiração | Assinatura inativa; app voltou à tela de planos |
| Nova compra após expirar, em outro plano | Essentials ativo; Starter preservado como histórico; sem conflito |
| Reinstalação | Restauração automática 200; uma única assinatura ativa, sem nova compra |
| Cadastro de conta nova com pagamento | Empresa autorizada na lista de teste; Starter ativo pelo `verify-purchase`, compra reconhecida, sem conflito; app foi direto ao produto |

Tela Android de assinatura refeita no padrão do Menu e da Home, com estados separados (planos, compra concluída, assinante, cancelada), publicada por OTA só em `hml-billing`. iOS não foi alterado. As alterações do app seguem sem commit.

**Pendência adiada por Rian (09/11):** conta Google com assinatura ativa de outra empresa impede a tela de planos de carregar na empresa aberta. A compra é recusada corretamente, mas o app trata a recusa como falha geral. Correção prevista só no Android, para depois da publicação.

**Não coberto:** toque manual no botão Restaurar; compra pendente; mesma empresa no Web e no Crew; Stripe e Apple em sandbox; B7; produção real.

### Bloqueadores para produção

0. R1 a R5 corrigidos e implantados na HML; ciclo Google validado no Admin Android; pendências acima.
1. Os críticos B1 a B5 estão corrigidos localmente. Faltam commit, implantação na HML e validação real.
2. Decidir como tratar B6 e os desvios de limite (guarda de provedor com flag desligada, preflight iOS).
3. Saber o que roda em produção e medir no banco: linhas Google e Apple, duas linhas ativas, plano divergente, FREE vigentes, Workers legados, formato de `MOBILE_APP_PRODUCTS_JSON`.
4. Definir a ordem de deploy: migrations, API, web, e só então apps ou OTA.
5. **Não ligar `BILLING_COORDINATION_ENABLED` em produção** até corrigir S6 a S9 e S11.
6. Validação real Google e Apple/Stripe em sandbox.
7. Commitar o ajuste Skia junto com seu script e limpar as sobras do Android.
8. Separar entregas por task, com SHA registrado.

### Decisões que dependem de você

- Pagamento com falha: bloquear na hora ou dar carência (B8)?
- Multiempresa: gestor de uma empresa pode editar dados daquela empresa (S3)?
- Worker com plano vencido mantém as próprias horas (M5)?
- Guarda de provedor com flag desligada: manter ou retirar (B5, S4)?
- Starter deve acessar Projetos (S2)?
- Quem atende o cliente com pagamento em dois provedores?

### Pendências e riscos residuais

- Compras fora dos fluxos controlados (loja, versões antigas, painel) ainda podem gerar contrato concorrente: o sistema registra, não impede.
- Dados de produção podem conter combinações que a HML, de abril e só com Stripe, não mostra.
- O teste de compra Google continua pendente e, com a flag ligada na HML, pode deixar a empresa sintética presa (S9) se o app fechar no meio.
- Mesmo corrigindo tudo acima, esta auditoria não garante ausência de bugs. Ela reduz o risco conhecido e separa o que foi provado do que não foi.
