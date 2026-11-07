# TASK-221 — ciclo Google Play na API

## Escopo e dor resolvida
Compra confirmada pelo Google passa a atualizar o plano interno e as permissões existentes da empresa. A confirmação do catálogo por HTTP 200 não comprova este ciclo. Implementação local; nenhuma publicação, chamada Stripe, alteração em produção/homologação ou envio de e-mail.

Preservadas as correções das TASK-219/220. Nenhuma mudança em preços, contratos, checkout web, catálogo Apple ou regras Stripe. O helper de preparação da empresa foi extraído para MobilePlanSetup com o mesmo comportamento Apple; no Google executa dentro da transação. Novos cargos continuam com a política explícita da 220; cargos personalizados existentes não são recriados.

## Implementado
- GooglePlayPurchase: interpreta exclusivamente a resposta subscriptionsv2 do servidor. Exige produto/base plan mapeados; não infere plano por preço. Package definido no servidor e no RTDN. Item futuro de troca diferida não concede acesso antecipado.
- Vínculo por obfuscatedExternalAccountId = SHA-256(companyId). Uma compra nova sem vínculo é recusada. Compras anteriormente vinculadas no banco podem ser reconciliadas sem esse campo; nunca mudam de empresa. Ator precisa ser Owner/Administrator atual e ativo.
- Sandbox exige empresa explicitamente permitida; produção exige gate próprio. O antigo bypass de tokens test_ não existe no caminho Google.
- Compra pendente não cria benefício nem confirma compra. Trial real vem de offerPhase.freeTrial, nunca do nome da oferta. ACTIVE, GRACE e CANCELED preservam acesso somente até o vencimento; HOLD, PAUSED e EXPIRED não liberam acesso. Recuperação limpa paymentFailed. Cancelar renovação não apaga período pago.
- Plano, assinatura e preparação das permissões são persistidos atomicamente antes do acknowledgement. Falha do acknowledgement deixa nova tentativa persistida, sem duplicar assinatura.
- GooglePlayPurchaseSync: fila durável, lease por token, trava por empresa, erros sanitizados, confirmação, estado e próxima tentativa. Concorrência de criação da primeira linha MySQL (P2002) recupera o registro já criado. Token tem índice único.
- Substituição confirmada desativa a assinatura Google anterior e aposenta seu token. Substituição pendente mantém o período pago anterior. Eventos atrasados do token aposentado não reativam o plano antigo.
- Contrato ativo concorrente é recusado para revisão; nenhum contrato Stripe/Apple é cancelado ou alterado. Não há migração automática de provedor nesta tarefa.
- RTDN exige OIDC com audience, e-mail verificado, identidade esperada e emissor Google em todos os ambientes. Persiste o token antes do HTTP 200; não usa tipo/data do evento para conceder acesso. Refund/revocation consulta estado atual no Google; reembolso sem revogação não é interpretado como cancelamento por conta própria.
- Job por minuto descobre assinaturas Google existentes e reconcilia até 50 registros por rodada. Assinaturas verificadas voltam em 15 minutos; pendentes/falhas em 1 minuto. Lease expira em 2 minutos; timeouts de rede 15 segundos. Token ainda sem empresa permanece para nova tentativa e posterior claim autenticado.
- Gate nativo bloqueia a abertura do checkout alternativo Android legado. Não habilita reporting legado nem altera seu processamento de obrigações anteriores.

## Evidências locais
- 29 suítes de regressão, 816 testes aprovados (219/220, Apple, Stripe/permissions, Google e reporting legado).
- Verificações adicionais dos endpoints: 8 testes aprovados. Teste adicional de corrida P2002 aprovado; 825 testes distintos aprovados ao todo, em 30 suítes, somando a regressão e as execuções direcionadas finais (45 testes na última execução).
- TypeScript, npm run build e git diff --check aprovados. Aviso de depreciação url.parse de dependência existente não impediu os testes.
- MySQL 8.4 descartável em 127.0.0.1:33221/task221, dados sintéticos e gateway Google falso: migration real, cinco verificações concorrentes do mesmo token, dois tokens concorrentes da empresa, retentativa de acknowledgement, troca pendente/confirmada, isolamento de empresa, carência/cancelamento/hold/recuperação/pausa/expiração e conflito com contrato Stripe sintético. Todos passaram. Nenhuma API de pagamento foi chamada.
- Harness reproduzível: scripts/task221-google-cycle-local.cjs. Recusa hostname, porta e database diferentes dos dedicados; apaga somente assinaturas sintéticas e recria a tabela da fila nesse banco descartável.

## Preparação para homologação e aceite externo — PENDENTE
1. Publicar somente após revisão das alterações acumuladas 219/220/221; aplicar migration 20261106230000_google_play_sync antes de ligar o job.
2. Manter ANDROID_BILLING_ENABLED e ANDROID_BILLING_REPORTING_ENABLED desligados se nunca utilizados. Configurar GOOGLE_PLAY_NATIVE_ENABLED=true apenas no ambiente aprovado; GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false em homologação; GOOGLE_PLAY_TEST_COMPANY_IDS com empresa dedicada. Não habilitar compra sandbox para empresas reais.
3. GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON e ANDROID_BILLING_PLAN_MAPPINGS precisam corresponder a esse ambiente. Mapeamento manual dos produtos existentes Starter/Essentials para IDs internos reais; não copiar IDs de produção sem conferir o banco de homologação.
4. Criar/configurar tópico e assinatura Pub/Sub para RTDN com push autenticado para a rota /mobile-subscriptions/webhooks/google (confirmar prefixo de montagem do ambiente). GOOGLE_PLAY_PUBSUB_AUDIENCE deve ser exatamente a audience configurada; GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT deve ser o e-mail da identidade do push. A identidade do push não é necessariamente a conta de serviço Android Publisher.
5. Configurar o publicador Google Play no tópico conforme documentação oficial e associar o tópico no Play Console. Enviar test notification: verificar entrega autenticada e HTTP 200. Falha de persistência deve causar redelivery.
6. No aplicativo instalado pela trilha de teste, usar testador licenciado e empresa dedicada. Confirmar envio do accountId, seleção da oferta elegível, compra pendente, trial, acknowledgement, renovação acelerada, cancelamento, recuperação, expiração, revogação e restauração. A adaptação do app é dependência da tarefa mobile; os produtos retornados ao app também precisam corresponder ao catálogo Google.
7. Validar a mesma empresa no web/Admin/Crew e suas permissões reais. Simular RTDN perdido/duplicado/atrasado e confirmar reconciliação. Guardar evidências sem credenciais/tokens. Consultar catálogo 200 não satisfaz este item.

Não finalizada nem liberada para produção: testes licenciados, RTDN real e integração app/ambiente continuam pendentes. Código pronto localmente não substitui esses aceites.

## Reversão
Antes da primeira ativação, manter GOOGLE_PLAY_NATIVE_ENABLED=false impede chamadas e gravações deste serviço. Depois de existirem compras reais, desligar reconciliação interrompe atualização/ack: exige acompanhamento das compras pendentes. Não apagar a fila nem desfazer migration com dados. Não religar automaticamente o checkout alternativo. Reversão de versão deve preservar o acompanhamento das assinaturas Google e não tocar contratos Stripe/Apple.

## Referências oficiais consultadas
- https://developer.android.com/google/play/billing/lifecycle/subscriptions
- https://developer.android.com/google/play/billing/security
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
- https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
