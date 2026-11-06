# Base de assinaturas e controle de regressão

TASK-218 · referência de 06/11/2026 · responsável: Rian Gonçalves.

## Escopo e evidência

Esta etapa altera apenas documentação e testes. Não modifica cobrança, preços, contratos, banco, migrações, checkout, telas ou acesso dos clientes. Não autoriza implantação. A integração Stripe existente é referência a preservar, não alvo de refatoração geral. O fluxo comercial iOS permanece existente. Android passa a usar Google Play nativo nas etapas posteriores; o trabalho local anterior de checkout alternativo não deve ser ativado.

Após `git fetch origin new-hml PRODUÇÃO`, `origin/new-hml` aponta para `de91b6361046706513f317fcdb0b6c32c3f7866d` e `origin/PRODUÇÃO` para `101d8b4` (merge PR #247). A comparação de árvores não tem diferenças. A comparação de histórico retorna 0 commits exclusivos de homologação e 10 exclusivos de produção, todos merges. Portanto, homologação está incorporada à branch de produção. Isso confirma o código no Git; não inspeciona processos ou variáveis da VPS.

Há alterações locais anteriores nesta API em schema, migração, webhooks, MobileAuthController, rotas e serviços Android. Elas não pertencem à referência publicada nem a esta tarefa. Admin local: `C:/SB_ADMIN_LOCAL`, HEAD `fa0504d9`; web: `SmartBuild_WEB_FRONT`, HEAD `ebfaae28`; Crew: `smartbuild-funcionario-app-2026`, HEAD `68586202`. Admin e Crew também têm trabalho local anterior. Estes hashes identificam checkouts examinados, não comprovam versões distribuídas nas lojas.

## Contrato que precisamos preservar

- Plano interno: funcionalidades, grupo de permissões, limite e período contratados. A descrição comercial não substitui autorização no servidor.
- Produto/preço/oferta da loja: forma de comprar o plano. Trial e renovação são estados da assinatura, não novos privilégios.
- Assinatura: vínculo da empresa com plano, provedor, identificador externo, período e estado verificado. Mudar de dispositivo não cria outra assinatura.
- Acesso efetivo: empresa selecionada + vínculo do usuário + situação da assinatura + permissões do plano e do cargo. Métrica de cliente pago no Master não é autorização.
- Plano web trimestral/anual continua válido nos aplicativos durante o período contratado, ainda que não seja vendido pelo catálogo mobile. Não converter período, preço ou ID ao trocar de dispositivo.
- Cancelar renovação e perder acesso são acontecimentos diferentes. O período já adquirido deve ser considerado; falha, graça, reembolso e revogação precisam respeitar o estado efetivo do provedor.
- Um pagamento em outro provedor não cancela automaticamente o anterior. Não alterar estado remoto por inferência nem apagar recibos conflitantes. A prevenção e o tratamento de conflito serão implementados na TASK-50.
- Demo, FREE, campanhas, planos por convite e adicionais existentes precisam de fixtures próprias; não transformá-los em fraude ou assinatura de loja por falta de mapeamento.

## Catálogo público conferido

Consulta somente leitura em `https://api.smartbuild4u.com/plans?grouped=true`, em 06/11/2026. Valores abaixo são os campos do catálogo da API, não conversões nem propostas de alteração de preços das lojas.

| Plano | Período | planId | Valor | Limite | Stripe priceId |
|---|---|---|---:|---:|---|
| Starter | mensal | 4ee81776-538a-4e45-99eb-c7d32fcadc16 | 29 | 2 | price_1T7mnUG1ZNZbk48uWJqHhaMn |
| Starter | trimestral | 18a2582a-93d6-45f9-b27b-c51e291ead08 | 78 | 2 | price_1T7moiG1ZNZbk48ucJrLVRDS |
| Starter | anual | aada80df-6a5a-4c95-8df8-d42d7500b5e9 | 288 | 2 | price_1T7mpKG1ZNZbk48uEe1esSpk |
| Essentials | mensal | d52f1833-119d-4024-beb9-7fa767ce23b7 | 99 | 6 | price_1T7mqKG1ZNZbk48ueYsLTXDJ |
| Essentials | trimestral | ac8bec79-a25b-42b5-a1af-f290f27a83bb | 261 | 6 | price_1T7mr2G1ZNZbk48ujrqgdulz |
| Essentials | anual | ea993af1-e6d4-4eb2-a028-21f85e6bf793 | 948 | 6 | price_1T7mrlG1ZNZbk48uLodDM03A |

O período trimestral é MONTHLY com validityDuration=3. Não há plano de quatro meses nesse catálogo público; isso não prova ausência em contratos legados. Professional também está ativo no catálogo web e deve ser preservado, mas não será criado como produto mobile nesta entrega.

Google: pacote `com.anonymous.smartbuildadminapp`; produtos `smartbuild_starter_monthly` e `smartbuild_essentials_monthly`; base `monthly`; oferta `trial-7-days`; Brasil, EUA e Espanha. A evidência fornecida pelo usuário mostra base/oferta ativas e consulta Google HTTP 200 na VPS. Isso não comprova compra, acknowledgement, RTDN ou liberação de acesso.

Mapeamento manual pretendido: Google Starter → Starter mensal acima; Google Essentials → Essentials mensal acima. **Relatório da VPS fornecido por Rian em 06/11: não há mapeamento; os dois produtos não são aceitos pelo backend publicado.** ANDROID_BILLING_PLAN_MAPPINGS está ausente e ainda não é lida pelo backend publicado. O código local não commitado já possui leitura dessa variável; não confundir isso com produção.

Apple: defaults no código `smartbuild_pro_monthly_29` e `smartbuild_pro_monthly_99`, além de ID legado configurável. Relatório da VPS fornecido por Rian em 06/11 confirma MOBILE_APP_PRODUCTS_JSON e MOBILE_APP_PLAN_ID ausentes. O fallback atual resolve `smartbuild_pro_monthly_29` → `4ee81776-538a-4e45-99eb-c7d32fcadc16` (Starter) e `smartbuild_pro_monthly_99` → `d52f1833-119d-4024-beb9-7fa767ce23b7` (Essentials). Não há configuração apontando para planos inexistentes. Os UUIDs do arquivo de exemplo não representam essa configuração. Esta evidência é relatório de leitura da VPS, não teste de compra. Preservar o fluxo Apple existente até substituir o fallback de forma explícita e validada.

## Caminhos atuais e divergências

| Evidência no código | Classificação | Tratamento |
|---|---|---|
| `src/utils/planPermissions.ts`: cargo com permissões usa interseção com plano; Owner/Administrator recebem somente permissões do plano | Preservar | Testes de caracterização nesta tarefa |
| Mesmo resolvedor retorna permissões do plano quando cargo não tem permissões | Compatibilidade legada explícita, não corrigir por inferência | Preservar clientes existentes; distinguir cargo ausente de vínculo não autorizado na TASK-220 |
| `UserController.getLocalSubscriptionsStatus` escolhe última assinatura ativa; `MobileAuthController.getCompanyAccess` escolhe a última assinatura sem o mesmo filtro | Divergência comprovada por leitura | Fixtures com histórico ativo/inativo na TASK-219 |
| Status local avalia prazo de plano pago Apple/Google, enquanto acesso do login mobile avalia prazo de todos os provedores | Divergência comprovada por leitura | Comparar saídas sem alterar regra Stripe por inferência |
| Web SubscriptionGuard bloqueia por isExpired, paymentFailed ou stripeSubscriptionCanceled; Apple refresh pode manter isActive em graça e marcar paymentFailed | Divergência de estados a reproduzir | Separar falha/grace/acesso nas TASK-219 e TASK-50 |
| `src/utils/masterPaidSubscription.ts` exige Apple pago, produção e renovação habilitada; para outros provedores usa regra existente | Métrica, não entitlement | Não reutilizar como autorização; teste existente preserva Stripe |
| Mobile getMobilePlan possui fallback por preço/plano disponível | Risco de associação incorreta | Mapeamento explícito e teste produto desconhecido na integração; preservar Apple até confirmar configuração |
| `subscriptionRoutes.ts` e SubscriptionController permitem CRUD/renew/cancel com checkToken, sem checagem de empresa/cargo nos handlers | Lacuna de autorização identificada estaticamente | TASK-220: reprodução isolada, negação por tenant/cargo e regressão. Não explorar em produção |
| Cancel/renew genéricos alteram somente banco local | Risco de divergência com provedor | Não usar esses endpoints como cancelamento comercial remoto |
| Trabalho Android local altera verificação Google e autenticação Pub/Sub | Trabalho não publicado | Revisar na TASK-221, não considerar integração pronta |
| Crew mantém sessão/cache; web reconsulta status periodicamente e ao navegar | Superfície de sessão desatualizada | Revalidar troca de empresa, expiração e reconexão na TASK-21 |

Fontes adicionais: `prisma/schema.prisma` (Plan, Company, Subscription); `src/controllers/stripe/StripeController.ts`; `src/config/stripeWebHook.ts`; `src/services/AppleBillingStatusService.ts`; `src/routes/mobileAuthRoutes.ts`; `src/middlewares/checkToken.ts`. Arquivos Android e MobileAuthController devem sempre ser comparados com origin/PRODUÇÃO ao distinguir comportamento publicado e local.

## Matriz de regressão e entrega

Resultados abaixo são critérios futuros, não alegação de testes E2E aprovados. Executar com dados sintéticos e provedores de teste; nenhuma cobrança real nesta etapa.

| ID | Entrada/ação | Resultado exigido | Consumidores / etapa | Evidência atual |
|---|---|---|---|---|
| R01 | Stripe ativo mensal, trimestral e anual; login em outro dispositivo | Mesmo plano, prazo e permissões; nenhuma nova cobrança | API/web/Admin/Crew; 219/50/21 | Catálogo conferido; integração pendente |
| R02 | Cancelamento de renovação com prazo futuro | Gerenciar no provedor de origem; não confundir com expiração | Todos; 219/50 | Cenário pendente |
| R03 | Prazo encerrado, falha, graça, hold, recuperação | Saída consistente com estado verificado, sem liberar indefinidamente ou bloquear período válido | Todos; 219/221/54 | Divergências documentadas |
| R04 | Google compra aprovada versus pendente | Liberar somente após validação; registrar e confirmar compra conforme exigido | API/Admin; 221/53 | Consulta de catálogo não cobre cenário |
| R05 | Trial sete dias e primeira renovação | Acesso durante trial elegível, conversão/expiração sem duplicação | API/Admin; 221/53/54 | Oferta ativa; E2E pendente |
| R06 | Webhook repetido, atrasado, fora de ordem; indisponibilidade | Idempotência, reconsulta de estado, recuperação sem rebaixamento indevido | API; 221/54 | Pendente |
| R07 | Token/recibo inválido, outro pacote, outra empresa ou ambiente | Recusar; não conceder acesso nem reutilizar em outra empresa | API; 221/54 | Pendente |
| R08 | Usuário usa outro provedor com contrato anterior vigente | Evitar segunda compra controlada; detectar conflito externo sem cancelar ou reembolsar automaticamente | API/Admin/web; 50 | Pendente |
| R09 | Reembolso/revogação da loja | Atualizar acesso após verificação; histórico rastreável | API/apps; 221/54 | Classificação Apple coberta por teste existente |
| R10 | Restore/reinstalação/novo dispositivo | Reassociar compra válida à empresa autorizada; não duplicar plano | API/Admin; 53/50 | Pendente |
| R11 | Cargo pede recurso fora do plano; Owner limitado ao plano | Nenhuma permissão extra | API; 220 | Teste puro nesta tarefa; endpoints ainda pendentes |
| R12 | Cargo vazio legado | Preservar regra existente sem conceder vínculo a outra empresa | API; 220 | Fallback coberto; isolamento pendente |
| R13 | Troca de empresa/cargo, sessão antiga, offline/reconexão | Recalcular acesso para contexto atual; não reutilizar privilégios da anterior | API/web/Admin/Crew; 220/50/21 | Resolvedor puro coberto; sessão E2E pendente |
| R14 | Chamada direta CRUD de assinatura por não autorizado | Negar leitura/mutação fora do escopo permitido | API; 220 | Lacuna estática registrada |
| R15 | Limite atingido, extra pago, desativar/reativar usuário, convites concorrentes | Preservar cálculo atual de vagas/adicionais; impedir excedente indevido | API/apps; 220/54 | Fixtures pendentes |
| R16 | FREE, demo, campanha, convite e contrato legado | Respeitar concessão e prazo existentes | API/apps; 219/54 | Inventário de registros não consultado |
| R17 | Produto desconhecido ou sem mapeamento | Não conceder plano por semelhança de preço/nome | API; 221 | Mapeamento efetivo pendente |
| R18 | Assinatura antiga inativa mais recente que outra válida | Decisão única reproduzível entre login e consulta de status | API; 219 | Divergência documentada |
| R19 | Fluxos Stripe existentes: compra, renovação, cancelamento, extra | Contratos, IDs, valores, checkout e acesso mantidos | API/web; 54 | Regressão de integração pendente; sem alteração runtime |
| R20 | App Android instalado pela Play em conta de teste | Compra/trial/renovação/restore/cancelamento completos com backend de homologação isolado | Admin/API; 54 | Pendente; não usar API produtiva com fixtures |

## Sequência e pontos de parada

Validação executada nesta tarefa: `npx jest --runInBand --runTestsByPath src/utils/planPermissions.test.ts src/utils/masterPaidSubscription.test.ts src/services/AppleBillingStatusService.test.ts` — 3 suítes e 10 testes aprovados. Seis casos novos caracterizam o resolvedor de permissões; quatro casos existentes cobrem classificação Apple e métrica Master. São testes unitários, não validação de compra, sessão ou endpoint. `git diff --check` não encontrou erros de whitespace. Nenhuma migração, implantação ou operação de cobrança foi executada. Reversão desta entrega: remover somente o documento e o novo arquivo de teste, preservando todo trabalho anterior.

218 referência → 219 leitura única e comparação → 220 autorização/limites → 221 Google backend → Admin 53 compra nativa → Admin 50 consistência/conflitos → Crew 21 sessão/acesso → Admin 54 regressão e envio.

Antes de consolidar a referência: confirmar associação efetiva Apple/Google sem expor credenciais e registrar fixtures sanitizadas de legado/demo/campanha/adicionais. Antes de ativar qualquer alteração compartilhada: executar matriz pertinente, comparar clientes de referência, plano de reversão e homologação. Não tornar flag de billing alternativo ativa. Não usar alteração de data no banco como pagamento ou cancelamento remoto.

Entrega ao Rian por tarefa: dor resolvida, arquivos e consumidores afetados, mudanças de comportamento, testes realmente executados, limitações e rollback. A tarefa 218 não certifica o motor nem a versão Android pronta para publicação.
