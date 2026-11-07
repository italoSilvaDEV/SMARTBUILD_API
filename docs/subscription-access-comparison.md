# TASK-219 — decisão de acesso por empresa

Estado em 06/11/2026: implementação local e validação concluídas para revisão; sem implantação. Sem commit, deploy ou alteração em dados de homologação/produção.

## Código e contrato

`SubscriptionAccessDecision.ts` contém a avaliação pura e a projeção `resolveCompanySubscriptionStatus`, utilizada por `getLocalSubscriptionsStatus` (web) e `getCompanyStatus`/`buildAuthResponse` (mobile). Recebe snapshots do servidor; não chama provedores, banco ou email. A autenticação web que consulta Stripe diretamente não foi reescrita.

- Preserva identidade do plano, duração mensal/trimestral/quadrimestral/anual/customizada, datas e limites existentes. Não transforma contrato web em plano mensal mobile.
- Usa apenas registros ativos da empresa. Duas ativas ou plano divergente geram `accessIssue`, sem escolher/cancelar/reescrever assinatura. Dados inconsistentes não concedem permissões.
- FREE representa trial/concessão interna por convite, não plano público. Usa o prazo explicitamente armazenado, inclusive extensões legadas.
- Para Stripe pago, preserva o contrato web existente: a data local isolada não revoga acesso e as flags financeiras continuam separadas de `isExpired`. Nenhum cliente Stripe, webhook Stripe, checkout, preço ou contrato foi alterado.
- Apple/Google respeitam fim exclusivo do direito. Desligar renovação não é vencimento. O campo legado `stripeSubscriptionCanceled` do registro de loja não vira bloqueio Stripe na resposta; permanece intacto no registro retornado para rastreabilidade.
- Cadastro `pending_subscription` só é superado por direito inequívoco. Não é prova de pagamento.
- `confirmedState` é um contrato interno para snapshots confiáveis, nunca um campo aceito de request. Estados pendente/suspenso/expirado/revogado não concedem direito. Carência precisa de prazo confirmado.
- Serviço Apple distingue carência com `gracePeriodExpiresDate` futuro: persiste `appleBillingStatus=grace`, prazo confirmado e falha financeira original. A projeção de acesso libera durante a carência, mantendo `subscription.paymentFailed` para diagnóstico. Carência não conta como receita paga no backoffice (`isMasterPaidSubscription` permanece intacto).
- Falha de consulta Apple ocorre antes da escrita e preserva snapshot anterior. Não houve chamada real à Apple nos testes. Fluxo completo de recebimento/ordenação/idempotência de eventos Google continua no escopo da TASK-221, não foi declarado validado aqui.

Referências Apple: https://developer.apple.com/documentation/appstoreserverapi/graceperiodexpiresdate e https://github.com/apple/app-store-server-library-node/blob/main/models/Status.ts.

## Mapeamento

`MobileStorePlanMapping.ts` substitui fallback por preço/primeiro plano em `getMobilePlan`. Os dois produtos Apple legados têm associação explícita aos IDs Starter/Essentials confirmados no relatório da VPS e catálogo HML. Configuração explícita pode sobrescrever o mapeamento; plano ausente é erro, nunca fallback. Produtos desconhecidos e duplicidades são rejeitados.

Google exige `ANDROID_BILLING_PLAN_MAPPINGS` e basePlan correspondente. `.env.example` foi corrigido com IDs do catálogo observado; nenhum `.env` real foi alterado. Outros ambientes devem configurar seus próprios IDs. Não habilitar venda de produto sem associação verificada.

## Observador

`SubscriptionAccessComparison.ts` continua diagnóstico opcional (`SUBSCRIPTION_ACCESS_COMPARE=true`). Lê histórico com limite, registra somente campos/motivos; não grava e não muda resposta se falhar. A flag NÃO desliga o núcleo comum agora integrado. Reversão exige reverter código da 219, preservando patches da 220 nos mesmos controllers/rotas. Não há migração de schema nesta etapa.

## Evidência local e leitura HML

12 suítes / 262 testes aprovados: decisão, projeção real dos consumidores, mapeamentos, login mobile, observador, integração Apple simulada, permissões e regressão dos incrementos 220. TypeScript `npx tsc --noEmit` e `git diff --check` aprovados (apenas avisos de conversão LF/CRLF). Testes não fazem compras, chamadas reais aos provedores ou gravações HML.

`scripts/task219-local-consumers-hml-readonly.cjs` lê por SSH apenas metadados de planos/assinaturas, mantém snapshots em memória e executa corpos reais dos consumidores do checkout LOCAL. Não implanta código na VPS e não imprime nomes/emails/tokens. Resultado em 06/11:

- 166 empresas, 149 registros de assinatura, todos com billingProvider=stripe (inclui trials internos).
- Zero diferenças entre respostas web/mobile locais no mesmo instante.
- 13 respostas não expiradas, 153 expiradas. Isso não confirma situação financeira remota.
- 3 conflitos: empresa em plano MONTHLY, única assinatura ativa em FREE, prazo FREE vencido.
- 6 conflitos: empresa MONTHLY com duas assinaturas marcadas ativas, uma FREE e outra MONTHLY, ambas com endDate local passado.

Diagnóstico antes da classificação final: os seis últimos NÃO podem ser considerados vencidos financeiramente pela data local: o contrato Stripe existente ignora esse prazo local para assinatura paga ativa. Não desativamos a linha FREE, não escolhemos a mensal nem bloqueamos clientes na VPS: apenas observamos a resposta que o novo código produziria. A implantação dos guards nessas empresas exige revisão explícita do legado para evitar regressão em assinantes válidos. Amostra HML não prova situação de produção e não cobre compra real Apple/Google.

## Classificação final e repetição da comparação

A leitura agora exclui apenas registros cujo plano é comprovadamente FREE e cujo endDate já passou. Esse histórico não constitui segunda cobrança nem direito atual. A exclusão é feita na consulta antes do limite de duas linhas, e também na avaliação pura quando recebe o tipo do plano da assinatura. Não presume que uma mensal Stripe esteja vencida e não altera nenhuma linha do banco.

Repetição dos mesmos 166 contextos: zero diferenças web/mobile, 19 respostas não expiradas, 147 expiradas, zero conflitos restantes nessa amostra. As seis mensais deixam de ser bloqueadas pelo trial vencido. As três empresas com somente trial vencido continuam sem direito atual, sem trocar seu plano. Trials ainda válidos junto de assinatura paga e duas assinaturas pagas continuam conflito. Casos de regressão adicionados.

Mais quatro suítes Android existentes passaram (18 testes); total acumulado de 16 suítes/280 testes em duas rodadas. A última alteração de exclusão de histórico FREE foi exercitada nos consumidores/núcleo e não altera essas quatro suítes de política/relato Android.

Entrega local pronta para revisão da TASK-219. Marcar em validação, sem anunciar deploy, compra real, ciclo Google completo ou revisão da loja. Produção permanece no código anterior; esta evidência não é autorização automática de implantação. A próxima tarefa só começa após apresentar esta entrega ao Rian.
