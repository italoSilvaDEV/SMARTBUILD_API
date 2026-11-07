# TASK-53 — suporte ao catálogo Google nativo

Implementação local. TASK-221 continua em validação até compra licenciada/RTDN reais em homologação. Sem acesso a dados reais, deploy ou chamadas Stripe nesta tarefa.

Novos endpoints POST /android-billing/native/configuration e /android-billing/native/status em mobileAuthRoutes; implementação GooglePlayCatalogController. Reutilizam AndroidBillingAccess e buildAuthResponse, sem alterar seus contratos ou as regras do núcleo 219.

Catálogo: país BR/US/ES, conta autorizada, GOOGLE_PLAY_NATIVE_ENABLED, credenciais e RTDN configurados; exige live habilitado ou companyId da allowlist de testes. Mapeamento explícito ANDROID_BILLING_PLAN_MAPPINGS, produtos smartbuild_starter_monthly e smartbuild_essentials_monthly/base monthly. Somente planos internos ativos públicos MONTHLY de duração 1. Preços nunca retornados por esse endpoint: o app usa preços e oferta elegível da loja. Nenhuma chave é exposta. Configuração inválida falha fechada.

Status: usa a decisão atual do núcleo; assinatura ativa ou pendência financeira não autoriza nova cobrança. Não recalcula vencimento Stripe. Cadastro pendente não recebe auth normal antes de assinatura ativa. Conflito de empresa ou status ambíguo não permite compra.

Arquivos alterados nesta tarefa na API: novo controlador e respectivo teste, duas rotas adicionais, este documento. Nenhuma alteração em Stripe, Apple, schema/migrations, variáveis de ambiente, jobs ou serviço de sincronização da 221.

Regressão: 854 testes em 31 suítes passaram, incluindo 29 novos de catálogo/status, 219/220/221 e preservação Apple/Stripe. TypeScript aprovado. O relatório completo do app está em C:\SB_ADMIN_LOCAL\docs\task-53-validation-2026-11-06.md.

Limitação: a resposta canPurchase não reserva compra nem implementa exclusão mútua entre provedores. A compra Google continua sujeita às validações/locks da 221; o fechamento dos fluxos concorrentes entre provedores é escopo da TASK-50. Não tratar testes locais como autorização para produção.

Rollback local: remover somente controlador/teste e registros dessas duas rotas. Não reverter 219/220/221 nem ligar o antigo checkout Android Stripe como fallback.
