# TASK-219: publicação do comparador e validação em homologação

## Destino e limites

API: https://apismartbuild.codelabsusa.com. Em 06/11/2026, GET /plans?grouped=true retornou 200 após a VPS voltar. A raiz / retornou 400, portanto não usar a raiz como health check. O catálogo contém Starter/Essentials, Group Trial e SmartBuild Mobile Core/Full; estes dois últimos têm IDs 2b82d6f3-6977-4908-9610-85728abe86b2 e 7edba762-c782-4132-b1cb-ad32f0236671. Isso difere do catálogo público produtivo.

Publicar apenas o pacote de comparação derivado de new-hml. Não incluir alterações locais anteriores de Android, schema, migrações, webhooks ou checkout. Não tocar PRODUÇÃO, credenciais produtivas, assinaturas ou estados de pagamento. A exportação de buildAuthResponse existe somente para testes; o comportamento de rejeição da assinatura expirada continua igual ao da branch publicada, sem o parâmetro allowExpired presente no trabalho Android anterior.

## Instrução para a IA da VPS

1. Confirmar que está na VPS e no diretório da API de homologação. Registrar branch, hash e estado Git, sem imprimir .env, tokens ou URLs com credenciais. Se houver mudanças locais, não usar reset, clean ou stash automático: informar a divergência.
2. Conferir isolamento do banco e dos provedores em relação à produção. Retornar somente conclusões (isolado/não confirmado), nunca valores secretos. Não realizar compras, migrações, mudanças em assinaturas, limpeza de dados ou disparos externos.
3. Atualizar new-hml por fast-forward para o commit informado junto ao pacote. Conferir que o diff não contém schema/migrações ou alterações de cobrança. Seguir o processo habitual de instalação/build da homologação. Não gerar ou aplicar migrações para este pacote.
4. Antes de habilitar comparação, rodar as seis suítes listadas abaixo e a compilação. Se houver falha, parar e informar o erro sanitizado.
5. Registrar o valor anterior (presente/ausente e true/false) de SUBSCRIPTION_ACCESS_COMPARE. Configurar true somente no ambiente da API de homologação e reiniciar exclusivamente seu processo pelo procedimento habitual. Confirmar PID/processo e commit efetivamente em execução. Não reiniciar processos produtivos ou outros workers.
6. GET /plans?grouped=true deve responder 200. Isso é verificação de disponibilidade, não aceite da TASK-219.
7. Identificar contas/empresas sintéticas já existentes para a matriz abaixo. Não criar fixtures em banco compartilhado com produção. Se faltar cenário, reportar como não executado; não alterar dados reais para simulá-lo. Não enviar senhas/tokens no relatório.
8. Executar os fluxos com as contas de teste autorizadas e registrar resposta anterior versus atual e os logs [SubscriptionAccessComparison]. As respostas não devem ser substituídas pela decisão candidata. Capturar diferenças por cenário, consumidor, motivo e campos, sem dados pessoais.
9. Ao terminar, restaurar a flag ao valor anterior ou false e reiniciar somente a API de homologação. Confirmar disponibilidade. Não publicar em produção.

## Testes do pacote isolado

```
npx tsc --noEmit
npx jest --runInBand --runTestsByPath src/controllers/mobile/MobileSubscriptionComparison.test.ts src/services/SubscriptionAccessComparison.test.ts src/services/SubscriptionAccessDecision.test.ts src/utils/planPermissions.test.ts src/utils/masterPaidSubscription.test.ts src/services/AppleBillingStatusService.test.ts
```

Nenhuma destas suítes usa banco real ou faz compra. A aplicação deve manter o comportamento publicado com a flag ausente/false; com true acrescenta leitura e diagnóstico, nunca gravação pelo comparador. Se o histórico exceder 100 assinaturas, snapshot_limit_exceeded requer investigação, não validação parcial.

## Matriz mínima no ambiente

| Cenário de conta sintética | Verificação | Situação inicial |
|---|---|---|
| Starter mensal ativo | Login mobile e status local concordam em plano/limite/permissões; resposta atual preservada | Não executado |
| Essentials trimestral e anual | Período e planId preservados, sem conversão para mensal | Não executado |
| Renovação desligada com período futuro | Comparação não modifica acesso ou contrato; explicar flags divergentes | Não executado |
| Expirada | Rejeição/status antigo preservado; divergências documentadas | Não executado |
| FREE/demo/Group Trial | Classificar concessão e prazo sem inferir pagamento | Não executado |
| Mobile Core/Full legado | Plano não é substituído pelo nome/preço de Starter/Essentials | Não executado |
| Worker versus Owner | Permissões efetivas respeitam o plano e o comportamento legado conhecido | Não executado |
| Usuário em duas empresas | Comparar plano e permissões no contexto de cada empresa | Não executado |
| Duas assinaturas concorrentes/plano divergente | Diagnóstico review; nenhuma alteração automática | Não executado |
| Falha financeira/graça | Não converter booleano de falha em graça; reportar estado que falta | Não executado |

Falha de banco/log do observador é coberta pelos testes isolados; não derrubar banco compartilhado para reproduzi-la. Compra/renovação de loja real não fazem parte deste pacote diagnóstico.

## Relatório de retorno

- Commit executado, branch, disponibilidade HTTP e isolamento confirmado ou pendente.
- Compilação e contagem real de testes aprovados.
- Para cada cenário: executado/não executado, consumidor, saída antiga, saída candidata, diferenças e explicação. Não chamar ausência de logs de sucesso se a flag/processo/fluxo não tiver sido confirmado.
- Valor final da flag e confirmação de que nenhum contrato/assinatura foi alterado.

Esta validação encerra a etapa de comparação, não toda a TASK-219. Para concluir a tarefa é preciso tratar as divergências, finalizar adaptadores de estado e a leitura comum, integrar consumidores, e repetir a regressão. Nunca converter review automaticamente em autorização ou expiração.
