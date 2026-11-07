# TASK-50 — coordenação de assinaturas — 06/11/2026

Implementação local pronta para validação integrada. Não liberada para produção. TASK-221 e TASK-53 continuam em validação; nenhuma próxima tarefa foi iniciada.

## Dor e comportamento entregue

A empresa mantém o direito da assinatura aplicável ao usar outro dispositivo. Login e troca de empresa não compram um plano. Os consumidores continuam usando a decisão de acesso das TASK-219/220; plano web trimestral, quadrimestral e anual não é convertido para o catálogo mensal das lojas.

Antes de uma nova contratação, a API verifica autoridade do usuário, contratos ainda ativos/recuperáveis e uma reserva exclusiva por empresa. Stripe, Apple e Google usam o mesmo lock de Company. As seis direções entre provedores são bloqueadas quando existe obrigação anterior. FREE de convite não equivale a contrato pago; encerramento confirmado continua necessário.

Uma confirmação externa conflitante não substitui o plano nem desativa o contrato existente: grava BillingConflict, idempotente por empresa/provedor/contrato. Não há cancelamento ou reembolso automático como estratégia de resolução. Restaurar/reprocessar consulta novamente o provedor e só resolve a ocorrência se a condição bloqueadora cessou.

## Alterações e impacto

- BillingPurchaseCoordinator: reserva durável, lock MySQL, estados da tentativa, chave estável para repetição Stripe, detecção de outro contrato do mesmo provedor e ocorrência rastreável.
- StripeController: autorização por sessão Owner/Administrator/Master ou capability de cadastro já existente; payload financeiro preservado. Login web passa o token de cadastro. A tela existente apenas informa o provedor que bloqueia a compra.
- WebHookController: com coordenação ligada, consulta o estado atual Stripe dentro do lock; callbacks concorrentes/antigos não sobrepõem outro contrato. Aplica plano, permissões e assinatura na mesma transação. As regras de extras receberam somente o cliente transacional; quantidades, preços e prorratação mantidos.
- Apple: preflight antes de abrir StoreKit nas duas telas existentes; nenhuma mudança de SKU, preço, oferta ou payload StoreKit. Verificação e reconciliação atualizam plano/assinatura atomicamente. A notificação é um sinal para consultar estado atual autenticado, não autoridade para expirar/reativar pela etiqueta do evento. Resposta de empresa anterior não abre compra nova.
- Google: preflight, reserva antes da folha nativa, vínculo da referência verificada e ocorrência de conflito. Estado terminal de compra pendente libera apenas a tentativa vinculada; evento antigo não libera tentativa nova. Catálogo/status identificam tentativa ou conflito não resolvido.
- Banco: migração aditiva 20261106233000_billing_purchase_coordination cria BillingPurchaseAttempt e BillingConflict. Nenhuma migração em HML/produção.
- Configuração: BILLING_COORDINATION_ENABLED=false documentado em .env.example. Nenhum .env real alterado. A flag controla o coordenador novo; guardas do incremento anterior permanecem.

## Expiração e recuperação

- Reserva nativa ainda não lançada expira após 15 minutos.
- Depois do lançamento, somente passagem do tempo NÃO prova ausência de compra. Cancelamento explícito da folha libera a tentativa da UI; callback tardio continua sujeito à admissão e ao registro de conflito.
- Google pendente/hold/paused impede liberação local. Cancelamento terminal confirmado fecha a tentativa vinculada à referência exata.
- Stripe repete o POST com os parâmetros persistidos e a mesma chave. Sessão confirmada expirada permite outra tentativa. Sessão completa aguarda confirmação. POST de resultado desconhecido após 23h exige reconciliação, evitando reutilizar chave que o provedor possa ter descartado.
- Em perda de resposta/app encerrado, primeiro restaurar compras e aguardar notificações. Tentativa lançada sem comprovante de desfecho permanece bloqueada para atendimento; não existe expiração automática insegura ou liberação manual pública.
- Um usuário ainda pode comprar/reativar fora das telas controladas (loja, versão antiga, painel do provedor). A entrega detecta e registra esse conflito; não promete impossibilidade absoluta de dupla cobrança externa.

## Reprocessamento operacional

`node dist/scripts/reconcileBillingConflict.js <incident-id>` apenas inspeciona a ocorrência (sem imprimir recibos, tokens ou credenciais).

`node dist/scripts/reconcileBillingConflict.js <incident-id> --apply` exige coordenação habilitada e executa novamente os handlers de estado atual. Stripe e Apple consultam seu contrato; Google recupera o recibo pelo hash interno. Apple sem contrato local requer restauração na conta original. Não editar manualmente state=resolved: o handler resolve após nova admissão ou encerramento confirmado. As regras financeiras existentes do handler continuam aplicáveis. Este comando NÃO foi executado contra nenhum ambiente remoto.

## Evidências locais

- API: **37 suítes / 932 testes aprovados**, abrangendo permissões/consumidores 219/220, Google 221/53, seis direções, auth do checkout, notificações Apple e cancelamento.
- Build TypeScript API aprovado.
- Regressão de vagas Stripe compara execução atual com código do HEAD 6e030bc: mesmas operações, quantidades e prorratação em cinco cenários, com e sem cliente transacional.
- Checkout coordenado preserva preço, customer, referral, URLs, metadata e duração de quatro meses/anual. Falha de autorização impede chamada ao gateway.
- App: **103 testes aprovados**, lint e typecheck aprovados. Inclui reserva antes do SDK, cancelamento, erro desconhecido, mudança de empresa durante preflight e restauração.
- Web: `npx tsc --noEmit` aprovado. Conferidos interceptor de sessão e troca de empresa: auth/by-company retorna a sessão nova; estado da empresa anterior é limpo.
- MySQL real descartável, exclusivamente 127.0.0.1:33250/task50: migração SQL executada; três provedores concorrentes produzem uma reserva; cinco checkouts simultâneos reutilizam uma chave/sessão simulada; expiração, timeout e cancelamento vinculado; callback tardio, replay antigo e resolução após encerramento. Handlers reais Stripe/Apple executados com gateway simulado, incluindo rollback por SKU não mapeado e preservação de contrato estrangeiro.
- O teste MySQL usa fixtures únicas por execução, sem dados reais. Uma repetição detectou colisão no transactionId fixo do próprio teste; fixture corrigida e suíte repetida com sucesso.
- Nenhuma chamada real a Stripe/Apple/Google, nenhum e-mail, nenhum acesso/mutação a HML/produção, deploy ou commit.

Comandos principais: `npm run build`; seleção Jest de 37 suítes registrada no relatório de execução; `node -r ts-node/register/transpile-only scripts/task50-coordination-local.cjs` com TASK50_TEST_DATABASE_URL obrigatoriamente local (script valida host/porta/banco); app `node --test scripts/*.test.cjs`, `npm run lint`, `npm run typecheck`; web `npx tsc --noEmit`.

## Validação ainda necessária para liberar

Compra/renovação/cancelamento e notificação reais Google em homologação, junto com 221/53; exercício equivalente dos caminhos Apple e Stripe em sandbox, incluindo versões de app que ainda não têm preflight. Conferir experiência em aparelho, restore após interrupção, troca de empresa e mensagens nos idiomas do produto. Os testes locais não substituem essas evidências. Revisar tratamento operacional de tentativas sem resultado e permissões/configuração antes de habilitar a flag.

## Implantação e reversão (não executadas)

Aplicar migração aditiva e gerar Prisma Client antes de habilitar coordenação. Publicar API compatível antes dos clientes que chamam os novos endpoints. Habilitar inicialmente apenas no ambiente de validação, com credenciais de teste/allowlist existente. Nada nesta entrega autoriza ativação em produção.

Reversão de código por hunks da TASK-50; preservar 219/220/221/53 nos arquivos compartilhados. Não apagar tabelas/ocorrências para reverter. Desligar a flag remove as garantias novas de concorrência: antes disso, suspender novas contratações e tratar tentativas em aberto; não usar rollback como liberação de compras pendentes.
