# TASK-220 — validação local, 06/11/2026

## Escopo implementado até agora

- GET /subscriptions e PUT /subscriptions/:id, PATCH /subscriptions/:id/cancel e /renew exigem o requireMaster existente. Usuários de empresas não administram contratos locais.
- GET /subscriptions/:id e GET /companies/:companyId/subscriptions exigem vínculo com a empresa real do recurso. Preservados vínculo legado por company_id, UserCompany multiempresa e Master global com os mesmos critérios do middleware administrativo.
- GET /user/local-subscription-status/:userId/:company_id exige identidade da sessão igual ao userId e vínculo com company_id. Isso impede consultar permissões/status em nome de outro usuário.
- Campos do body não concedem autoridade. Falha de consulta de autorização não libera acesso. Assinatura inexistente e inacessível retornam o mesmo 403 para sessões comuns.

## Evidência

- 8 suítes, 183 testes aprovados: subscriptionRoutes.authorization, subscriptionAccess, SubscriptionAccessConsumers.characterization, MobileSubscriptionComparison, SubscriptionAccessDecision, SubscriptionAccessComparison, planPermissions e masterPaidSubscription.
- Testes HTTP exercitam rotas reais de assinatura e middlewares reais de autorização; autenticação de sessão e Prisma simulados. Não são testes com compras reais.
- npx tsc --noEmit e git diff --check aprovados.
- Chamadores verificados: AuthProvider e SubscriptionGuard do web e validateSession do Admin enviam identidade da própria sessão. Telas Master de gestão usam as rotas administrativas.

## Efeitos e limites

Nenhuma chamada a Stripe, homologação ou produção. Nenhuma mudança de preço, checkout, provedor, schema ou dados. Nenhum commit/deploy.

A proteção roda antes dos controllers. Respostas de consultas autorizadas permanecem produzidas pelos mesmos controllers. A leitura de status agora consulta o vínculo antes de carregar plano/permissões.

Ainda pendentes na tarefa: proteção funcional por plano e cargo; limites de vagas sob concorrência; permissões personalizadas; distinguir cancelamento administrativo local de cancelamento no provedor. Não considerar TASK-220 concluída ou app pronto para publicação.

Reversão técnica deste incremento: retirar os middlewares adicionados das rotas. Isso reabre as brechas; não executar sem avaliar alternativa de proteção. Não há migração de banco para reverter.

## Terceiro incremento — criação FREE

POST /subscriptions agora exige Owner/Administrator da empresa ou Master global, inclusive quando autenticado por token de cadastro. Usa identidade verificada pelo middleware, não userId/cargo enviados no body. Cargo do vínculo multiempresa tem precedência sobre cargo da empresa principal.

Assinatura ativa de qualquer provedor impede criação (409), sem atualizar seu plano ou datas. A criação inicial preserva duração, campanha, convite, allowance existente e configuração inicial dos cargos. Registros históricos inativos não foram transformados em uma nova regra de elegibilidade. A concorrência entre este endpoint e outros escritores/provedores ainda pertence à prevenção geral de conflitos; esta validação cobre chamadas concorrentes ao endpoint FREE.

Todas as gravações ficam numa transação Serializable. grantOwnerFullAccessForCompany aceita cliente transacional opcional; demais chamadores mantêm o cliente padrão e o comportamento existente. Conflito P2034 retorna 409 e orienta consultar status antes de repetir. Não há retry fora da transação nem chamadas ao provedor.

Validação: 9 suítes/212 testes aprovados, TypeScript e diff-check aprovados. Testes HTTP incluem token real de cadastro assinado com segredo sintético, acesso cruzado, usuário desabilitado, Worker, Master de empresa, convite, campanha, plano pago, repetição e falhas de gravação.

Validação adicional em MySQL 8.4 descartável local, schema completo sem dados reais, com scripts/task220-free-subscription-local.cjs:

- Seis usuários distintos da mesma empresa criaram simultaneamente: exatamente 1 resposta 201, 5 respostas 409, 1 assinatura e 3 cargos. Repetição posterior retornou 409.
- Trigger de teste gerou falha na criação do Administrator após outras gravações: retorno 500; banco confirmou zero assinaturas, plano/allowance ainda null, só cargo Owner original, zero permissões e flags de Owner originais.
- Primeira tentativa de criar o trigger via prepared statement do Prisma não foi suportada pelo MySQL; harness corrigido para mysql2 query e teste completo repetido com sucesso.
- Container temporário removido após execução; nenhum acesso a homologação, produção, Stripe ou dados de trabalho.

A transação não altera regra de cobrança nem cria proteção global entre todos os provedores. Personalização de cargos ao reativar histórico FREE e demais escritores continuam pendentes de revisão na TASK-220.


## Quarto incremento — autorização, legado e vagas (local)

### Alterações e efeitos

- Mutações de planos, permissões e grupos de permissões exigem o requireMaster existente. Leituras de catálogo permanecem compatíveis; controllers e integração Stripe não foram modificados.
- Rotas de cargos verificam vínculo, empresa real do recurso e autoridade. Atribuições devem pertencer ao plano; nomes Owner/Administrator/Master não podem ser criados por essa rota ou obtidos renomeando um cargo comum. Edição só do nome preserva as permissões existentes.
- Gestão de usuários (cadastro, edição, exclusão, remoção de vínculo, alteração de email com senha e reenvio de senha) verifica User Management pela decisão da TASK-219, assinatura atual, cargo e vínculo. Operações globais exigem acesso em todas as empresas afetadas. Edição do próprio perfil não aceita ID de terceiro.
- CompanyFeatureAccess consulta estado atual do banco a cada chamada; sessão antiga não conserva uma permissão retirada. Não realiza chamadas a provedores.
- Office.legacyPlanPermissions explicita compatibilidade: migração marca cargos existentes como legados; novos cargos recebem false. Editar explicitamente o conjunto de permissões encerra o fallback legado. Owner/Administrator continuam limitados ao plano. Cargos legados compartilhados entre empresas são aceitos apenas com vínculo real da empresa e marca de legado.
- Consumidores web/mobile, comparador e assistente passam a política explícita ao resolvedor existente. O cálculo de status/validade da 219 foi preservado.
- Criação do trial reaproveita Worker/Administrator e não apaga permissões customizadas existentes. Owner sem permissões ainda recebe a configuração inicial.
- Cancelamento administrativo retorna operationScope=local e providerActionPerformed=false, com mensagem explícita de que a cobrança no provedor não foi cancelada. Nenhum cancelamento real foi executado.
- Cadastro/convite e ativação usam bloqueios de empresa em transação ReadCommitted. Usuário existente é bloqueado antes das empresas para serializar convite/reativação; vínculos são relidos sob bloqueio. A contagem transacional inclui company_id e UserCompany sem duplicar o usuário. Adicionais existentes são preservados. Email ocorre após commit.
- Reativação de usuário multiempresa verifica vagas em todas as empresas; usuários já ativos não consomem nova vaga. Downgrade acima do limite bloqueia novas alocações, sem apagar usuários.
- Convite de conta com company_id legado preserva a senha existente, mesmo sem UserCompany.

### Validação

20 suítes / 447 testes aprovados, incluindo regressões da 219, contratos de decisão, Apple/Google, autorização HTTP de catálogo/cargos/gestão de usuários, estado atualizado com sessão antiga e gravação de usuários dentro da transação. TypeScript sem erros e git diff --check aprovado.

MySQL 8.4 descartável, acessível somente em 127.0.0.1:33220/task220:

- Reexecutado harness FREE: seis solicitações => uma criação / cinco conflitos; falha real confirmou rollback integral.
- Harness de vagas: seis convites/ativações => uma vaga / cinco rejeições; cadastro versus reativação disputaram a mesma última vaga.
- Adicionais pagos preservados; downgrade acima do limite não removeu usuários; falha de callback fez rollback.
- Migração SQL real preservou cargos existentes como legados e criou cargo novo com fallback desativado.
- Na primeira organização do teste, o harness FREE recusou corretamente o banco já preenchido pelo teste de vagas; fixtures sintéticas foram removidas somente do banco descartável, e os dois harnesses foram executados novamente em sequência após conclusão do schema.
- Container removido. Nenhum dado de homologação/produção foi lido ou modificado neste incremento. Nenhum email real ou chamada a Stripe.

### Migração e reversão

Migração preparada: prisma/migrations/20261106220000_explicit_office_permission_policy/migration.sql. NÃO aplicada a homologação/produção. Implantação futura exige migração antes do novo código e nova validação integrada. O campo é aditivo; uma reversão de código deve manter a coluna e seus valores para preservar a identificação do legado. Não remover a coluna como rotina de rollback. Reverter as proteções reabre as brechas corrigidas.

### Estado real / pendências para encerrar a 220

A tarefa permanece em andamento. A proteção funcional foi ligada à gestão de usuários e cargos; ainda é necessário mapear e validar os demais endpoints funcionais (por exemplo Projects, Estimates, Invoice), inclusive suas rotas públicas e de Crew, antes de declarar a autorização por plano completa. Outros escritores de ativação/vínculo, especialmente integrações externas, precisam ser conferidos para não contornar o bloqueio de vagas. Edições globais de usuários ainda têm gravações anteriores à ativação que precisam ser avaliadas quanto a rollback integral. Upgrade/downgrade de todos os provedores não foi validado nesta etapa.

Não há autorização de publicação nem conclusão da tarefa com base somente nos testes acima. Não houve commit, push, deploy, mudança de preços, checkout ou contratos Stripe.


## Quinto incremento — fechamento da implementação local

Este incremento substitui as pendências de implementação listadas no quarto incremento. A tarefa segue para validação; não equivale a implantação ou autorização de publicação.

### Dor, correção e superfície afetada

| Dor comprovada | Correção | Superfície |
| --- | --- | --- |
| Login permitia atingir operações sem verificar benefício/cargo/empresa real | Guardas resolvem a empresa pelo registro persistido e consultam CompanyFeatureAccess/decisão da 219 | Projects, Estimates, Invoice, invoices customizadas, registros de pagamento de invoice, change orders e seus serviços |
| Um ID relacionado podia apontar para outra empresa | Todos os recursos fornecidos devem corresponder à mesma empresa; falha de consulta bloqueia | Vínculo invoice/projeto, PDF/orçamento/invoice/change order, cliente/projeto, serviços |
| Worker precisa executar serviço sem virar administrador de Projects | Caminho Crew exige atribuição ativa real e assinatura válida da empresa; checa todos os itens de lotes | Custos, atividades, galeria, agenda e time cards do próprio trabalhador |
| Agenda permitia consulta sem escopo suficiente | Autenticação e identidade verificadas; consultas filtram somente empresas autorizadas, incluindo serviços e schedules customizados | Agenda própria e consulta administrativa por trabalhador |
| Operações Master expostas a sessão comum | requireMaster existente antes dos controllers | Dashboard Master, criação/administração Master de empresas e preço administrativo de vagas |
| Reativação falhava depois de alterar cargo/vínculo | Cargo, vínculo e usuário persistidos na mesma transação; duplicidade de email não cria vínculo implícito | Edição global/reativação de usuário, com verificação de vagas sob bloqueio |
| Aplicação de plano mobile apagava personalizações de cargos | Inicializa somente cargos novos e Owner inicial vazio; conserva cargos existentes e flags personalizadas | ensureCompanyPlanSetup, sem alterar validação de compra, preço ou checkout |
| Upload sem vínculo era legítimo no web, mas não tinha autor verificável | Guarda uploadedById da sessão; exige autor ao vincular PDF pendente e permissão na empresa destino | Upload em duas etapas do web, invoice, orçamento e change order |
| PDF poderia exigir Projects mesmo sendo de Invoice | Consulta/vinculação usam a funcionalidade do documento; tipo enviado não contorna permissão do recurso vinculado | Usuário com Invoice sem Projects continua operando seus PDFs |
| Serviço de orçamento podia ser atualizado por ID sem confirmar o orçamento | Busca exige serviceProjectId e estimateId correspondentes | Atualização/remoção de serviço de orçamento |
| Busca de custos não restringia empresa | Filtro por empresa aplicada a resultados e contagem | POST /costproject/find exige company_id autorizado |

As proteções multipart rodam depois da leitura do formulário e antes de gravações de negócio/S3/email. Arquivo temporário negado é removido nos controllers cobertos. Controllers de cobrança não foram alterados. Rotas públicas já existentes de visualização/assinatura de clientes e relatórios foram preservadas; não são declaradas autenticadas por esta tarefa. O grant público de estimate só é aceito nas rotas explicitamente destinadas ao fluxo público.

### Escritores e preservação

- Reavaliados cadastro, convite, edição e reativação de User; caminhos de alocação existentes usam bloqueios transacionais, sem gravação antecipada de cargo na edição.
- Criação administrativa de empresa continua inicializando Owner; não é reativação de colaborador de empresa existente. Agora restrita ao Master onde aplicável.
- Aplicação de plano mobile não cria/reabilita usuários nem zera adicionais. Permissões efetivas continuam limitadas ao plano atual pela 219.
- Ativação QuickBooks encontrada na busca é de conta de integração, não de usuário/vaga; não alterada.
- Sincronizador existente de permissões Stripe somente lido e exercitado isoladamente: renovação sem reescrita, preservação de negação personalizada/editAll, remoção apenas de benefício perdido. Nenhum arquivo de integração Stripe modificado; nenhum SDK/credencial/chamada real foi usado nesse teste.
- Ciclo completo de eventos/compras Google, conflito de pagamentos entre provedores e publicação continuam nas tarefas próprias. Não se afirma que a 220 conclui o módulo inteiro.

### Evidências desta rodada

- Rodada conjunta: 27 suítes / 758 testes aprovados, incluindo regressões da 219, Apple/Google, catálogo, autorização HTTP, transações de usuário, permissões mobile, Crew e documentos.
- Adicionados depois dois casos de consulta de PDF (Invoice sem Projects; consulta sem recurso negada), revalidados com as rotas reais. Total da seleção: 760 casos distintos.
- Testes HTTP executam registros reais de rotas e middlewares com autenticação/Prisma controlados. Controllers que poderiam enviar email, gravar arquivos remotos ou cobrar são isolados. Testes específicos executam controllers reais em VM com dependências simuladas.
- Testes de upload positivos/negativos, inclusive change order, confirmam ausência de efeitos na negação e autor obtido da sessão, não do body.
- TypeScript e diff-check verificados ao finalizar. Um espaço no fim de linha foi corrigido após diff-check.
- MySQL 8.4 descartável: SQL real de uploadedById preservou PDF legado/URI e recebeu autor em novo registro. Primeira tentativa ocorreu antes do socket ficar disponível; repetida após inicialização com sucesso. Harness scripts/task220-pdf-migration-local.cjs só executa no container fixo descartável, não lê DATABASE_URL. Container removido.
- Evidências anteriores de concorrência e rollback em MySQL permanecem válidas; esta rodada acrescenta teste de rollback/cargo da edição global.

### Migrações, validação integrada e reversão

Há DUAS migrações aditivas locais: 20261106220000_explicit_office_permission_policy e 20261106223000_pdf_upload_ownership. Ambas devem preceder o novo código quando houver autorização para implantação. Não foram aplicadas em homologação/produção.

PDFs antigos já vinculados continuam autorizados pelo recurso. PDFs antigos sem vínculo e sem autor não podem ser reivindicados: devem ser reenviados. Isso evita atribuir arquivos órfãos a usuários por adivinhação. Não houve backfill inventando autoria.

Reversão de código deve manter as colunas/valores aditivos. Retirar guardas reabre vulnerabilidades; avaliar a causa antes de reverter. Não executar rollback destrutivo de schema.

A implementação local da 220 está concluída para o escopo registrado. Antes de liberar, validar o conjunto 219/220 implantado em ambiente autorizado e percorrer web/Admin/Crew com as migrações presentes. Testes locais não substituem validação integrada nem compra real/sandbox do ciclo de pagamento. Nenhum commit, push, deploy, email, compra, alteração de Stripe ou dados de homologação/produção nesta execução. Não foi iniciada a tarefa seguinte.
