# TASK-219 — evidências de comparação

Validação de 06/11/2026, autorizada por Rian: somente leitura em homologação, sem modificar Stripe, assinaturas ou dados. Commit publicado: `6e030bc7d99b911f6da0d23327a9470b55cd8917`, branch `new-hml`, serviço `smartbuild-api` ativo.

## Método e limites

O script `scripts/task219-readonly-comparison.cjs` foi enviado por stdin ao Node da homologação, sem gravar arquivo remoto. Executa os corpos reais de `getLocalSubscriptionsStatus` e `getCompanyStatus`, extraídos por AST do código publicado. O contexto de execução oferece somente métodos Prisma de leitura; não importa os controllers completos, clientes Stripe/Apple/Google, envio de email ou servidor HTTP. Usa o resolvedor compilado existente e um mesmo instante de comparação. Não imprime credenciais, nomes de clientes, emails ou IDs de contas/empresas.

Esta evidência verifica as funções de status com banco real. Não equivale a chamada HTTP autenticada, execução completa de login mobile, compra, evento de loja ou autorização de todos os endpoints. No mobile, compara status e permissões calculadas; não reproduz todos os guards do app. O nome exibido na sessão corresponde a duas contas no banco; ambas foram mantidas separadas, sem presumir qual empresa estava selecionada no browser.

## Amostra real — 17:51:13 UTC

| Contexto anonimizado | Plano | Resultado antigo web/mobile | Núcleo candidato | Limite de vagas | Permissões |
| --- | --- | --- | --- | --- | --- |
| account-1/company-1 | Sem plano | Expirado / expirado | deny: plan_missing | 0 | 0 |
| account-2/company-1 | Professional | Válido / válido | allow | 15 | 26 |
| account-2/company-2 | Sub-Contractor Silver | Válido / válido | allow | 12 | 27 |
| account-2/company-3 | Start 14-Day Free Trial | Válido / válido | allow | 50 | 13 |
| account-2/company-4 | Start 14-Day Free Trial | Válido / válido | allow | 50 | 24 |

Nos cinco contextos não houve divergência de acesso, planId, assinatura selecionada, flags financeiras, limite ou conjunto de permissões entre as funções de status atuais e o candidato. Os períodos dos planos existentes foram preservados.

Há dados que precisam de classificação, não correção automática: Professional mensal com validade local até 2027, Silver mensal até 2030 e trials de nome “14-Day” até 2028. Datas podem refletir concessões/fixtures; não comprovam fraude nem pagamento remoto. Não foram consultados os provedores. Os dois trials têm cargos/contextos diferentes; contagens de permissões diferentes não são, por si só, divergência entre dispositivos.

## Diferenças reproduzidas localmente

`src/services/SubscriptionAccessConsumers.characterization.test.ts` executa as funções reais extraídas por AST contra fixtures em memória, sem banco/rede/provedores. Foram aprovados 9 testes: 2 controles e 7 caracterizações abaixo. Aprovação significa reprodução do comportamento, não aprovação da regra existente.

| Caso | Função web atual | Função mobile atual | Núcleo candidato | Tratamento necessário |
| --- | --- | --- | --- | --- |
| D1. Stripe ativo com data local vencida | Não expirado | Expirado | review | Normalizar direito confirmado sem alterar contrato Stripe nem inferir vencimento apenas pela data local. |
| D2. Registro inativo mais recente e outro ativo válido | Seleciona ativo válido | Seleciona inativo e expira | Seleciona ativo válido | Uniformizar seleção da assinatura. |
| D3. Trial FREE inativo com fim futuro | Sem ativo: expirado | Ignora inatividade: não expirado | deny | Validar estado da concessão, além da data. |
| D4. Cadastro pending_subscription com assinatura válida | Não expirado | Expirado | review | Resolver conflito de cadastro/assinatura antes de ativar decisão comum. |
| D5. Duas assinaturas ativas válidas | Escolhe a mais recente | Escolhe a mais recente | review: multiple_subscriptions | Não escolher provedor ou cancelar cobrança automaticamente. |
| D6. Plano da empresa diferente do plano da assinatura | Retorna plano da empresa sem rejeitar conflito | Mesmo comportamento | review: company_subscription_plan_mismatch | Reconciliar vínculo antes de conceder permissões pelo novo núcleo. |
| D7. Instante exatamente igual ao fim da assinatura Apple | Não expirado (`<`) | Não expirado (`<`) | deny (`<=`) | Definir e padronizar limite temporal exclusivo. |

D1–D4 são divergências entre consumidores atuais. D5–D6 são ambiguidades detectadas pelo candidato que os consumidores atuais não sinalizam. D7 é diferença na fronteira temporal. Nenhum desses sete casos foi observado na amostra real acima; foram construídos localmente para caracterizar os caminhos existentes.

## Evidência operacional

- Catálogo público respondeu 200; cobrança externa Android BR/US respondeu 503 com indisponibilidade esperada.
- Consulta local sem token foi recusada com 400 / Token not informed. Isso não valida autorização entre empresas.
- `.env` da homologação contém SUBSCRIPTION_ACCESS_COMPARE=true e quatro flags de billing externo false. As flags não aparecem no ambiente inicial em `/proc`; dotenv é carregado pela aplicação, portanto isso não demonstra que a flag esteja falsa no processo.
- Não foram encontrados eventos SubscriptionAccessComparison no journal desde o deploy consultado. O observador só registra diferenças/erros; silêncio não prova execução nem paridade. O diagnóstico explícito acima fornece evidência independente.

## Estado da tarefa

TASK-219 permanece em andamento. O candidato ainda não controla autorização. Falta resolver/normalizar estados ambíguos, integrar os consumidores gradualmente, validar endpoints/login e testar estados Google/Apple, cancelamento, carência e suspensão de ponta a ponta. Não marcar entregue com base apenas em smoke test ou testes unitários.

Nesta etapa foram adicionados apenas script, testes de caracterização e documentação local. Nenhuma regra de produto foi alterada; sem deploy, restart, migração, mutation de banco, chamada Stripe ou envio de email.

## Correções locais posteriores à validação

Autorização: corrigir uma por uma no localhost, explicando o impacto antes de editar, com regressão e sem modificar Stripe ou dados da homologação.

1. **D2 e D3 — seleção da assinatura mobile.** `getCompanyStatus` passa a selecionar somente registros ativos, como `getLocalSubscriptionsStatus` já faz. Um histórico inativo mais recente não esconde a assinatura ativa; um trial inativo com data futura não concede acesso. Isso afeta a resposta de autenticação/status compartilhada por Android e iOS. Não altera registros, cancelamentos, cobranças, períodos ou limites.
2. **D7 — fronteira temporal.** Nos dois consumidores comparados, FREE, Apple e Google expiram quando `endDate <= now`, em conformidade com o núcleo candidato. O teste cobre um milissegundo antes, no instante e depois do fim. A regra de data para assinaturas pagas Stripe permanece intacta. Outros endpoints de autenticação web não foram refatorados nesta etapa; a cobertura aqui é dos consumidores citados.

As caracterizações D1, D4, D5 e D6 continuam explícitas e pendentes; testes verdes nesses casos significam que a divergência continua reproduzida. Não ativar o candidato como autoridade de acesso nem declarar a TASK-219 concluída. D1 envolve diferença de interpretação de estado Stripe; D4–D6 exigem tratamento de conflitos sem escolher cobrança/plano arbitrariamente ou retirar acesso legítimo.

Os testes usam fixtures em memória, Prisma mockado e funções reais; não acessam banco, provedores nem enviam emails. As alterações estão apenas no checkout local, sem commit, push ou deploy.

Verificação final local: **6 suítes / 71 testes aprovados**, `npx tsc --noEmit` aprovado e `git diff --check` sem erros. Suítes: SubscriptionAccessConsumers.characterization, MobileSubscriptionComparison, SubscriptionAccessDecision, SubscriptionAccessComparison, planPermissions e masterPaidSubscription. Isso não substitui testes de compra/eventos de loja ou autorização HTTP entre empresas.

## Correção seguinte — cadastro pendente com assinatura válida

Autorizada separadamente pelo usuário após o primeiro lote. O marcador `pending_subscription` descreve o cadastro e não deve, isoladamente, invalidar uma assinatura local válida. O avaliador puro agora continua as verificações normais quando existem candidatos; mantém recusa para cadastro sem assinatura e revisão para conflitos. Não altera as regras financeiras dos provedores.

No mobile, somente empresas com esse marcador fazem uma leitura adicional das assinaturas ativas. O bloqueio pode ser superado apenas se o avaliador permitir a assinatura selecionada pelo consumidor: plano correspondente, período válido, provedor reconhecido e ausência de estados ambíguos. O vencimento já calculado pelo consumidor continua sendo respeitado. Uma falha nessa leitura não concede acesso. Os demais cadastros seguem pelo caminho anterior.

Isso ativa o avaliador apenas nessa condição específica do login/status mobile, independentemente da flag de diagnóstico; ele ainda não é a autoridade geral dos endpoints. A validação de vínculo usuário/empresa e o cálculo final de permissões por cargo permanecem no fluxo existente. Android e iOS compartilham a correção. Não há `update`, webhook, reconciliação de cobrança nem mudança persistida no marcador da empresa.

Cobertura: resposta completa do login preservada para assinaturas válidas Stripe/Apple/Google, com diagnóstico ligado e desligado; cadastro pendente sem assinatura bloqueado; recuperação `allowExpired` preservada; erro de leitura não libera acesso. Fixtures de assinatura ausente, inativa, vencida, futura, com falha de pagamento, provedor desconhecido, plano divergente, reembolso e múltiplos candidatos não desbloqueiam o cadastro pendente.

Resultado: **6 suítes / 87 testes aprovados**, TypeScript (`npx tsc --noEmit`) e `git diff --check` aprovados. O script de diagnóstico recebeu a dependência pura necessária, mas não foi executado contra homologação. Sem banco real, Stripe, emails, commit, push ou deploy nesta correção.

Pendências anteriores atualizadas: cadastro pendente com direito local inequívoco corrigido. Permanecem diferença de interpretação de vencimento Stripe entre consumidores e tratamento geral de assinaturas simultâneas/plano divergente. Esses conflitos continuam bloqueando o desbloqueio de um cadastro pendente; o comportamento geral das empresas não pendentes não foi alterado. TASK-219 continua em andamento.

## Proteção seguinte — plano da empresa divergente da assinatura

Solicitada pelo usuário somente no localhost, com explicação prévia e regressão, sem Stripe ou homologação. Antes da edição foi explicitado que um conflito bloqueia o acesso nesses consumidores e requer correção do vínculo; não seria escolhido um novo plano automaticamente.

`hasSubscriptionPlanConflict` detecta uma assinatura ativa da mesma empresa cujo `planId` não corresponde ao plano da empresa (incluindo plano ausente). A função é pura e não compara preço ou nome. `getLocalSubscriptionsStatus` e `getCompanyStatus` deixam de devolver o plano conflitante e suas permissões: retornam plano nulo, permissões vazias, `isExpired: true` como bloqueio compatível com os consumidores atuais e `accessIssue: company_subscription_plan_mismatch` para distinguir inconsistência de vencimento. Nenhuma data ou flag financeira é reescrita; a assinatura original permanece na resposta de status.

No login mobile completo, o conflito gera mensagem específica orientando procurar suporte antes de contratar outra assinatura. `allowExpired` não contorna o conflito. O marcador pendente também não o contorna. Owner e Administrator não recebem permissões nesse estado. Histórico inativo de outro plano não bloqueia uma assinatura ativa consistente. Respostas consistentes não recebem o novo campo.

Escopo: proteção nos dois consumidores da TASK-219 e no login mobile que utiliza esse status. Não corrige dados existentes automaticamente, não identifica qual dos dois vínculos está desatualizado, não escolhe entre assinaturas simultâneas e não substitui a autorização por funcionalidade de todos os endpoints ou de sessões já abertas. Outros fluxos web não foram refatorados. O frontend web ainda precisa tratar o motivo específico para oferecer recuperação adequada; não declarar que a experiência completa de suporte/reconciliação foi implementada.

Regressão local: **6 suítes / 95 testes aprovados**, TypeScript (`npx tsc --noEmit`) e `git diff --check` aprovados. Cobertura de Stripe/Apple/Google, cargos Worker/Owner/Administrator, cadastro ativo/pendente, plano ausente, histórico inativo, preservação das flags/datas e login com diagnóstico ligado/desligado e recuperação ligada/desligada. Fixtures e mocks, sem acesso a banco real/provedores. Sem emails, commit, push ou deploy. TASK-219 permanece em andamento.

## Proteção seguinte — múltiplas assinaturas ativas

Autorizada no localhost, com explicação prévia, sem Stripe e sem dados de homologação. Nos dois consumidores de status, a consulta agora lê no máximo dois registros `isActive: true` da empresa em uma única operação. Zero registros mantém o comportamento sem assinatura; um registro mantém o contrato e a resposta existentes; dois registros comprovam conflito, independentemente da ordem, provedor, plano ou data local. Não é necessário carregar todo o histórico nem fazer uma contagem separada sujeita a outra leitura.

No conflito, retornam `accessIssue: multiple_subscriptions`, plano e assinatura selecionada nulos, permissões vazias e bloqueio compatível (`isExpired: true`). Nenhum registro é escolhido como autoridade financeira. As flags financeiras escalares ficam nos valores padrão do payload, sem representar uma agregação das cobranças; o consumidor deve interpretar primeiro `accessIssue`. Nenhum estado persistido é alterado. O login mobile emite erro específico para suporte e não permite contornar pelo `allowExpired`. O motivo de múltiplas assinaturas tem precedência sobre o conflito de plano, porque não há assinatura única para comparar.

O avaliador puro também sinaliza `multiple_subscriptions` quando mais de um registro da empresa está marcado ativo, antes de interpretar datas. Uma data local vencida/futura não comprova encerramento da outra cobrança. Histórico inativo continua ignorado. O fluxo de cadastro pendente reutiliza a mesma leitura única, sem uma consulta adicional de autorização; a consulta de diagnóstico continua separada e opcional, e falha nela não interrompe o login válido.

Regressão: **6 suítes / 107 testes aprovados**, TypeScript (`npx tsc --noEmit`) e `git diff --check` aprovados. Casos: Stripe/Google, Apple/Google, Stripe/Apple e Google/Google; ordem invertida; cargos Worker/Owner/Administrator; cadastro ativo/pendente; recuperação e diagnóstico ligados/desligados; três registros ativos; outra empresa; histórico inativo; segunda assinatura com data local vencida/futura ou outro plano. Fixtures permanecem sem mutação. Casos consistentes, expiração, conflito de plano e permissões anteriores continuam aprovados.

Limites: proteção de status/login, não reconciliação ou cancelamento de cobrança duplicada, nem prevenção transacional de novas duplicidades em todos os pontos de compra/webhook. Tampouco substitui guards de endpoints para sessões já abertas. Não houve banco real, chamada Stripe/lojas, email, commit, push ou deploy. TASK-219 permanece em andamento; a divergência de interpretação da data local Stripe continua pendente.

## Alinhamento seguinte — vencimento local de plano pago Stripe

Solicitado no localhost, sem modificar regras de cobrança Stripe ou homologação. O status web existente já trata a assinatura paga Stripe por `isActive`, devolvendo `paymentFailed` e `stripeSubscriptionCanceled` separadamente; não usa a data local como prova de expiração. O mobile agora aplica essa mesma interpretação para `billingProvider: stripe` em planos não-FREE. A condição de data dos outros provedores permanece como estava. Não houve alteração nesta etapa no consumidor web.

O avaliador puro deixa de exigir revisão apenas porque a data local Stripe venceu. Continua exigindo revisão quando existem flags financeiras ambíguas e mantém as validações de snapshot, vínculo/plano, assinatura única e estados confirmados. Essa alteração evita que o guard de cadastro pendente reintroduza o bloqueio exclusivamente pela data. Não representa consulta ao Stripe ou comprovação de pagamento atual: utiliza o estado local já aceito pelo status web. A sincronização desse estado por eventos/reconciliação continua necessária.

FREE continua expirando pela data, mesmo com `billingProvider: stripe`. Apple e Google continuam expirando no instante `endDate <= now`. Histórico inativo, conflitos de plano e múltiplos registros ativos continuam protegidos. Falha de pagamento e cancelamento são preservados no payload; `isExpired: false` não implica apagar ou ignorar essas flags. Os guards previamente adicionados a cadastros pendentes continuam recusando estados financeiros ambíguos.

Regressão: **6 suítes / 117 testes aprovados**, TypeScript (`npx tsc --noEmit`) e `git diff --check` aprovados. Comparação das funções reais com planos MONTHLY/ANNUAL/CUSTOM, datas antes/no instante/depois, cadastros ativos e pendentes, flags financeiras e FREE nos três provedores. Login completo mantém período/assinatura/permissões originais, com diagnóstico ligado/desligado; testes de rejeição por expiração Apple/Google e recuperação mantidos. Nenhuma data persistida foi prorrogada e nenhuma compra foi feita.

Sem acesso a homologação, banco real, Stripe/lojas, emails, commit, push ou deploy. As sete divergências originalmente reproduzidas têm tratamento local nos consumidores testados; isso não conclui a TASK-219 nem comprova o módulo inteiro: ainda há reconciliação dos conflitos, prevenção de duplicidade em escritas, autorização de todos os endpoints, UX de recuperação e testes ponta a ponta de compra/eventos a validar.

## Retomada exclusiva da TASK-219 — núcleo integrado localmente

Ver estado consolidado em `docs/subscription-access-comparison.md`. Mapeamento explícito substitui fallback por preço, status web/mobile usa a mesma projeção, cancelamento de renovação de loja preserva direito até o fim e carência Apple usa prazo confirmado. Regressão acumulada: 12 suítes/260 testes; tsc/diff-check aprovados. Correções 220 preservadas.

Leitura ampliada HML + execução dos consumidores LOCAIS: 166 empresas, zero diferenças web/mobile; 3 planos MONTHLY com assinatura FREE vencida; 6 empresas com FREE e MONTHLY simultaneamente ativos e datas locais passadas. Não interpretar a data local da mensal Stripe como prova de expiração. Esses conflitos são pendência de ativação, não corrigidos nos dados. Nenhum deploy, restart, email, compra ou chamada Stripe.

### Resultado final da classificação do legado

Os nove achados anteriores foram classificados sem gravações: FREE comprovadamente vencido é histórico sem direito atual. A consulta desconsidera esse histórico antes do limite, sem ignorar mensal Stripe por data. Comparação repetida: 166 empresas, zero diferenças web/mobile, zero conflitos remanescentes, 19 não expiradas/147 expiradas. Seis mensais preservadas; três empresas com somente trial vencido sem acesso. Trials ainda válidos e duplicidade de pagos continuam protegidos.

262 testes em 12 suítes mais 18 testes Android em quatro suítes (280 acumulados); tsc aprovado. Entrega LOCAL para revisão/validação da 219, sem deploy.
