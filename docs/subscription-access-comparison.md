# Decisão de acesso em comparação

TASK-219 — 06/11/2026. Rian autorizou avançar após a referência TASK-218; as pendências da referência continuam condicionando a ativação. Esta entrega é a preparação isolada do núcleo, não conclusão da integração nos consumidores.

## O que foi implementado

`src/services/SubscriptionAccessDecision.ts` recebe um snapshot explícito da empresa, plano, assinaturas, vínculo do usuário, permissões do cargo, limites existentes e horário. Não importa Prisma, clientes de pagamento, variáveis de ambiente ou rede. Não grava dados. O observador separado pode chamá-lo a partir de dois consumidores, mas seu resultado não substitui a autorização existente.

`SubscriptionAccessComparison.ts` conecta a comparação à consulta local de status e a `buildAuthResponse` do login mobile. SUBSCRIPTION_ACCESS_COMPARE ausente/false retorna sem consulta ou log adicional. Com true, lê até 101 registros da empresa, compara até 100 e registra somente consumidor, motivo e campos divergentes. Históricos maiores são sinalizados sem decisão parcial. Erros do diagnóstico não se propagam. Há custo de uma consulta adicional quando habilitado; a flag é para homologação controlada, não foi ativada em nenhum ambiente. O login web que consulta diretamente Stripe ainda não recebe esse observador.

O resultado preserva planId, validade, período e limite da empresa. Utiliza o resolvedor de permissões existente. As decisões são allow, deny e review; review exige investigação e não pode ser convertido automaticamente em isExpired, acesso concedido ou bloqueio do cliente atual.

Assinaturas de outra empresa não participam da seleção. Registros inativos não escondem um registro válido. Mais de uma assinatura candidata, planos divergentes, datas inválidas e estados incompletos produzem review. O resolvedor não escolhe o maior plano ou o registro mais recente arbitrariamente.

Renovação automática e falha financeira são campos separados da decisão de acesso. `confirmedState` é um estado de direito normalizado por um futuro adaptador confiável; não é um status bruto da loja. `non_renewing` significa direito ainda válido sem próxima renovação: não mapear automaticamente o status terminal `canceled` do Stripe para ele. `grace` precisa incluir a data efetiva de fim do direito, não simplesmente a data do último pagamento. Nenhum request do usuário poderá fornecer esse estado diretamente.

Sem estado normalizado, flags ambíguas e prazo Stripe local vencido exigem comparação, preservando o cálculo atual em produção. Não há consulta remota a falhar dentro do resolvedor; snapshots confirmados e ainda válidos podem ser avaliados sem criar pagamento nem prolongar direito vencido.

`compareSubscriptionAccess` recebe a resposta antiga do consumidor e compara acesso, plano, assinatura, permissões e limite. Retorna nomes dos campos divergentes, sem tokens, recibos ou dados pessoais. A comparação usa o bloqueio atual dos consumidores por isExpired/paymentFailed/stripeSubscriptionCanceled; comparar a resposta de login não reproduz por si só todos os guards de cada aplicativo.

`resolveMappedStorePlan` aceita somente uma associação explícita e não vazia produto→planId. Produto desconhecido ou duplicado retorna null. Não verifica a existência do plano no banco e não substitui ainda `getMobilePlan`: o chamador futuro deve validar o plano e tratar legado antes de remover o fallback publicado.

## Limites da entrega

Validação atual: 56 testes aprovados em seis suítes, executadas em duas rodadas: decisão/comparação/planPermissions/masterPaidSubscription/AppleBillingStatusService (50) e MobileSubscriptionComparison (6). As seis verificações do handler exercitam buildAuthResponse real com Prisma e dependências externas simuladas: respostas iguais com a comparação ligada/desligada em Stripe, Apple e Google, falha do diagnóstico, expiração/allowExpired e flags financeiras. `npx tsc --noEmit` aprovado; `git diff --check` sem erros de whitespace. Não houve teste de compra, banco real ou tráfego real. Comandos: `npx jest --runInBand --runTestsByPath src/services/SubscriptionAccessComparison.test.ts src/services/SubscriptionAccessDecision.test.ts src/utils/planPermissions.test.ts src/utils/masterPaidSubscription.test.ts src/services/AppleBillingStatusService.test.ts` e `npx jest --runInBand --runTestsByPath src/controllers/mobile/MobileSubscriptionComparison.test.ts`.

- Acrescenta chamadas ao observador no login mobile/consulta local, preservando decisões e payloads atuais. Não altera preços, contratos, Stripe, Apple ou Android distribuído.
- Não resolve autorização de endpoints: `hasCompanyAccess` deve ser calculado pelo servidor, assunto da TASK-220.
- Não normaliza eventos dos provedores nem reconcilia registros. Isso depende dos adaptadores e, no Google, da TASK-221.
- Os casos são sintéticos e determinísticos. Não representam inventário de clientes legados nem comparação com tráfego real.
- Demo/FREE com prazo é coberto. Concessões pagas sem provedor conhecido vão para review até serem classificadas, sem afetar o cliente atual.
- Somar allowedEmployees e extraEmployees preserva a fonte atual de limite; não substitui contagem de vagas ou o tratamento de adicionais.

## Antes de conectar aos consumidores

### Acesso à homologação — 06/11/2026

Endereço confirmado nos apontamentos locais de API/web/Admin: `https://apismartbuild.codelabsusa.com` (não `api.smartbuild.codelabsusa.com`). DNS resolve para 167.114.42.154; a API produtiva resolve para outro IP. Isso não comprova isolamento do banco nem modo das credenciais de pagamento. GET / e /plans?grouped=true falharam por timeout de conexão; HEAD / com curl também expirou. Nenhuma sessão ou fixture de homologação foi acessada. É necessário restabelecer/confirmar conectividade e identificar o processo de deploy de new-hml antes da validação no ambiente. O único arquivo de workflow localizado é antigo, aponta para SASS e tem extensão desativada; não foi executado.

1. Evidência de mapeamento recebida: Apple usa fallback para os IDs atuais Starter/Essentials; produtos Google ainda sem mapeamento no backend publicado. Classificar fixtures de legado, campanhas e adicionais; configurar Google apenas junto à integração correspondente. Não alterar env para ativar a antiga proposta de billing alternativo.
2. Definir adaptadores para estados já persistidos/confirmados, com testes específicos; não interpretar uma flag paymentFailed como graça.
3. Em homologação, obter snapshots e respostas antigas do mesmo contexto/horário; comparar todos os cenários pertinentes da matriz. Não escrever dados por causa de uma divergência.
4. Classificar cada diferença e validar preservação de Stripe e Apple antes de substituir qualquer resposta. Nenhuma ativação com review sem tratamento definido.
5. Conectar os consumidores gradualmente, validar payloads, sessão e autorização. Os critérios 1, 2, 4 e 5 da TASK-219 só ficam completos após essa integração e evidência.

Reversão do diagnóstico: desabilitar SUBSCRIPTION_ACCESS_COMPARE; para remover o código, retirar somente as chamadas/imports do observador e restaurar a posição anterior do guard isExpired em buildAuthResponse, preservando as alterações Android preexistentes no mesmo arquivo. Remover os novos arquivos de comparação/decisão/testes e a nova linha da flag quando apropriado. Não há migração. Não houve commit ou implantação nesta etapa.
