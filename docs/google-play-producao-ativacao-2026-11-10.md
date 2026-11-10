# Ativar a compra pelo Google Play em produção (TASK-55)

## Situação

- **[V]** HML e produção usam o **mesmo app** no Play (`com.anonymous.smartbuildadminapp`), com os mesmos produtos e o mesmo tópico de notificações (RTDN). **No Play Console não muda nada.**
- **[V]** A HML recebe as notificações por uma assinatura push autenticada com a conta `smartbuild-rtdn-hml@smartbuild-play-billing.iam.gserviceaccount.com`, com a audience igual à URL do webhook da HML.
- **[V]** A consulta das compras usa a conta `smartbuild-play-billing@smartbuild-play-billing.iam.gserviceaccount.com` (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`). A produção já tem essa variável, mas falta conferir se é a mesma conta (etapa B).
- **[V]** O mapeamento de planos da HML serve na produção, porque os IDs são os mesmos: Starter `4ee81776-538a-4e45-99eb-c7d32fcadc16` e Essentials `d52f1833-119d-4024-beb9-7fa767ce23b7`.
- **Correção necessária antes:** com as duas assinaturas push no mesmo tópico, cada ambiente recebe as compras do outro. Antes, uma compra de empresa desconhecida era repetida a cada minuto, para sempre. Agora ela fica estacionada até o app verificar a compra ou chegar uma notificação nova. Essa correção precisa estar na HML e na produção **antes** da etapa C.

## Ordem

| Etapa | Quem | O quê |
|---|---|---|
| A | Claude + Rian | Correção no `new-hml`: deploy na HML, PR para a `PRODUÇÃO` e deploy na produção pelo Codex, sem migrações |
| B | Codex | Variáveis do Google no `.env` da produção, com **compra real desligada** e só a empresa de teste do Rian |
| C | Rian | Google Cloud: conta de serviço e assinatura push da produção |
| D | Rian | Compra de testador pelo Admin `1.1.1 (5)` do teste interno, que fala com a produção e não cobra |
| E | Codex + Rian | Ligar a compra real e promover o Admin Android para a faixa Produção |

## Etapa B: variáveis na produção (Codex)

Faça backup do `.env` antes de mudar. Depois:

1. Confira, sem imprimir a chave, que o `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` da produção é da conta `smartbuild-play-billing@smartbuild-play-billing.iam.gserviceaccount.com`. Basta ler o `client_email`.
2. Acrescente:

```
GOOGLE_PLAY_NATIVE_ENABLED=true
GOOGLE_PLAY_PUBSUB_AUDIENCE=https://api.smartbuild4u.com/mobile-subscriptions/webhooks/google
GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT=smartbuild-rtdn-prod@smartbuild-play-billing.iam.gserviceaccount.com
ANDROID_BILLING_PLAN_MAPPINGS=[{"planId":"4ee81776-538a-4e45-99eb-c7d32fcadc16","productId":"smartbuild_starter_monthly","basePlanId":"monthly"},{"planId":"d52f1833-119d-4024-beb9-7fa767ce23b7","productId":"smartbuild_essentials_monthly","basePlanId":"monthly"}]
GOOGLE_PLAY_TEST_COMPANY_IDS=<id da empresa de teste do Rian na produção>
GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false
```

3. Mantenha `ANDROID_BILLING_REPORTING_ENABLED` e `ALLOW_MOBILE_STORE_TEST_PURCHASES` ausentes.
4. `pm2 restart api-smartbuild`. O worker não usa essas variáveis.
5. Confira o log: sem erro, e com o job do Google rodando sem falhas.

Com `GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false`:
- só a empresa de teste vê o catálogo do Google;
- as outras empresas continuam vendo "Google Play billing is not available yet", como hoje;
- uma compra de testador só é aceita para a empresa de teste.

## Etapa C: Google Cloud (Rian), projeto `smartbuild-play-billing`

Faça tudo **sem mexer** na assinatura push da HML.

1. **IAM e administrador > Contas de serviço > Criar**, com o nome `smartbuild-rtdn-prod`. Não precisa de papel no projeto.
2. **Permissão para o Pub/Sub assinar com essa conta:** abra a conta `smartbuild-rtdn-prod` > Permissões > Conceder acesso. Use o principal `service-<NÚMERO DO PROJETO>@gcp-sa-pubsub.iam.gserviceaccount.com` e o papel **Criador de token da conta de serviço** (`roles/iam.serviceAccountTokenCreator`). Copie como está feito na conta `smartbuild-rtdn-hml`: se lá não tiver essa permissão, aqui também não precisa.
3. **Pub/Sub > Tópicos:** abra o tópico configurado no Play Console (Monetização > Configuração de monetização > Notificações em tempo real) e veja a assinatura da HML que já está lá. Clique em **Criar assinatura**:
   - ID: `smartbuild-rtdn-prod-push`;
   - tipo de entrega: **Push**;
   - endpoint: `https://api.smartbuild4u.com/mobile-subscriptions/webhooks/google`;
   - **Ativar autenticação**, com a conta `smartbuild-rtdn-prod@smartbuild-play-billing.iam.gserviceaccount.com`;
   - audience: `https://api.smartbuild4u.com/mobile-subscriptions/webhooks/google`;
   - prazo de confirmação, retenção e política de nova tentativa: iguais aos da assinatura da HML.
4. **Play Console > Configuração de monetização > Enviar notificação de teste.** As duas APIs devem receber e responder 200, e a de produção registra `test: true`.

## Etapa D: teste sem cobrança (Rian)

1. No celular, instale o Admin `1.1.1 (5)` pelo link do teste interno. A conta Google do aparelho precisa ser **testadora de licença**.
2. Entre na empresa de teste da produção e assine o Starter. É uma compra de testador, sem cobrança.
3. Confira:
   - o acesso foi liberado;
   - a assinatura aparece como Google na produção;
   - o log da produção mostra o webhook do Google com 200.
4. Cancele pela Play Store e confira que a assinatura continua até o fim do período.

## Etapa E: ligar para todos (Codex + Rian)

1. Na produção: `GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=true` e `pm2 restart api-smartbuild`.
2. Promova o Admin Android `1.1.1 (5)` para a faixa Produção no Play Console. O Google revisa antes de liberar.
3. Acompanhe as primeiras compras reais: webhook 200, assinatura criada e acknowledgement feito.

## Reversão

- **Parar novas vendas:** volte `GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false` e reinicie a API. O catálogo volta a responder "not available" e ninguém compra mais. **Quem já assinou continua sincronizando** renovações e cancelamentos.
- **Não desligue `GOOGLE_PLAY_NATIVE_ENABLED` se já houver assinante Google.** Isso para a sincronização: as renovações deixam de ser registradas, e o assinante vence pela data local mesmo pagando (item S1 da auditoria). Só desligue se não houver nenhuma assinatura Google ativa.
- **Notificações:** a assinatura push da produção pode ser pausada ou excluída no Google Cloud sem afetar a HML.
