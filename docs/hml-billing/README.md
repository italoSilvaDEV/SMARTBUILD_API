# Pacote de homologação — assinaturas (2026-11-07)

Estado: preparação local. Nenhum deploy, chamada ao Stripe, alteração de .env real,
compra ou acesso a banco remoto foi executado. TASK-50/53/221 continuam em validação.
Este pacote contém configuração de referência, migrações e roteiro; não é uma
release completa da API nem substitui os commits das TASK-219/220/221/53/50.

## 1. Fixar a versão antes de enviar

- API: checkout SMARTBUILD_API, branch new-hml. Há alterações locais ainda não
  commitadas sobre 6e030bc. Um git pull hoje não entrega esse conjunto.
- App: C:/SB_ADMIN_LOCAL; não usar o checkout antigo em OneDrive.
- Web: incluir as mudanças de token de cadastro e mensagem de provedor da TASK-50.
- Revisar o diff das tarefas, incluir arquivos novos e as quatro migrations SQL,
  preservar trabalhos não relacionados e registrar os SHAs aprovados de API/web/app.
- Não incluir .env, credenciais Google/Apple, tokens, dumps, node_modules ou pastas
  nativas geradas. O manifesto local serve para conferir os SQL, não como commit.

## 2. Isolamento obrigatório antes de subir a API

Destino esperado do app: https://apismartbuild.codelabsusa.com (já utilizado no
eas.json e documentação local). Confirmar DNS, certificado e reverse proxy da HML
antes de distribuir. Não trocar por api.smartbuild4u.com. O domínio com ponto
api.smartbuild.codelabsusa.com mencionado no chat não foi validado nesta etapa.

- Confirmar DATABASE_URL, Redis, armazenamento e processo PM2 exclusivos da HML.
- A cópia de produção contém clientes/contratos: usar empresas sintéticas dedicadas.
- Não iniciar workers QuickBooks ou scripts de sincronização de planos/webhooks.
- A API inicia jobs de invoices, Apple, Meta e retenção. Não há um interruptor
  global de jobs neste pacote. Isolar credenciais/saídas antes do restart; não
  presumir que NODE_ENV=development ou API em servidor separado impede efeitos.
- SENDGRID_KEY e META_CONVERSIONS_API_TOKEN não podem permitir envio real.
  APP_STORE_ISSUER_ID/APP_STORE_PRIVATE_KEY não devem ativar conciliação Apple
  nesta rodada Google. Remover valores também do ambiente herdado do processo,
  não apenas de uma linha do .env. Isso é exclusivo da HML.
- Bloquear saídas Stripe e demais integrações externas não usadas nesta rodada,
  mantendo liberados apenas os serviços necessários ao teste Google. Não testar
  checkout, cancelamento ou reprocessamento Stripe. Não usar chaves live.
- Revisar jobs de retenção/arquivos: não permitir que armazenamento de HML aponte
  ao bucket produtivo. Se o isolamento não estiver comprovado, não reiniciar.

## 3. Banco — conferir histórico, depois aplicar

Fazer backup exclusivamente de HML e conferir migrations aplicadas/falhadas com
`npx prisma migrate status`. O comando `migrate deploy` aplica TODAS as pendentes,
não apenas as quatro abaixo. Se houver pendências extras, revisar antes de seguir.
Não usar db push, reset, seed ou migrate resolve para esconder divergências.

| Ordem | Migration | Efeito |
|---|---|---|
| 1 | 20261106220000_explicit_office_permission_policy | Adiciona Office.legacyPlanPermissions; marca TODOS os cargos existentes como legados para manter compatibilidade. Novos cargos têm default false. Há UPDATE de dados, não é só DDL. |
| 2 | 20261106223000_pdf_upload_ownership | Adiciona pdf_project.uploadedById nullable. PDFs antigos continuam com NULL; não infere proprietário. |
| 3 | 20261106230000_google_play_sync | Cria GooglePlayPurchaseSync, índices e token único para reconciliação/ack. Contém tokens sensíveis: não exportar em relatórios. |
| 4 | 20261106233000_billing_purchase_coordination | Cria BillingPurchaseAttempt (incluindo contractRef) e BillingConflict. Uma reserva por empresa. |

As tabelas Office/pdf_project e o restante do schema anterior precisam existir.
Conferir também o histórico das migrations android_billing e account_deletion_requests
já presentes no código-base. Não reaplicar SQL manualmente sobre tabelas existentes.
MySQL DDL não oferece rollback transacional completo: falha parcial exige diagnóstico.

Após isolamento, revisão do histórico e disponibilização dos commits aprovados:

```sh
npm ci
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run build
```

Reiniciar apenas o processo da API de HML, pelo procedimento conhecido da VPS,
com ambiente atualizado. Registrar commit, migrations aplicadas e health check.

## 4. Configuração em duas etapas

Usar `configuration.env.example` como referência, não sobrescrever o .env inteiro.
Primeiro aplicar schema/código com flags novas false; depois verificar configuração
e ativar GOOGLE_PLAY_NATIVE_ENABLED e BILLING_COORDINATION_ENABLED apenas em HML.
Não existe allowlist do coordenador: ele é global para essa instância da API.

Confirmar no banco HML que os IDs mapeados são os planos mensais corretos, públicos
e ativos, com permissões existentes. Não criar ou sincronizar planos/preços.
Preencher somente IDs de empresas sintéticas em GOOGLE_PLAY_TEST_COMPANY_IDS.
ALLOW_MOBILE_STORE_TEST_PURCHASES=false evita o bypass de recibos simulados;
GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES=false aceita somente compras Google de teste.

Configurar push Pub/Sub autenticado para
https://apismartbuild.codelabsusa.com/mobile-subscriptions/webhooks/google,
com audience exata e e-mail da identidade de push correspondente. A identidade
de push não é automaticamente a credencial que consulta a Play Developer API.
Conferir tópico do pacote Admin; não redirecionar notificações de produção.
Se o tópico é compartilhado, revisar roteamento antes de mudar o Play Console.
HTTP 200 no catálogo não prova entrega RTDN ou compra validada.

## 5. Android para teste interno

Perfil novo `hml-billing` em C:/SB_ADMIN_LOCAL/eas.json: AAB, API HML explícita,
canal próprio, OTA desabilitado nessa variante e build Android somente.
Production, preview e configuração iOS permanecem preservados nesta preparação.
As variáveis públicas de OAuth são herdadas de preview; confirmar a assinatura
Play/OAuth do pacote. AAB deve usar a chave de upload já cadastrada, nunca criar
ou substituir credenciais por tentativa. O package continua o mesmo do Admin.

```sh
npx eas-cli build --platform android --profile hml-billing
```

Não executado nesta preparação. autoIncrement incrementa versionCode no build;
conferir que supera o maior valor já enviado ao Play antes do upload. Publicar
manualmente SOMENTE na faixa interna. Nunca promover esse AAB de HML a produção.
O perfil preview anterior gera APK e não é o artefato escolhido para este teste.
Não usar OTA para entregar módulos nativos.

## 6. Aceite integrado e evidências

Conta Google deve estar tanto na lista de testadores internos quanto em License
testing; usar método de pagamento de teste. Antes de confirmar, verificar que
o app está na API HML e a empresa está na allowlist.

1. Starter/Essentials: preços regionais BR/US/ES e trial elegível/inelegível.
2. Compra/teste gratuito libera somente após verificação API; conferir plano,
   período, permissões e limites na mesma empresa no web/Admin/Crew.
3. Cancelar diálogo, pagamento pendente/recusado, perda de rede e app encerrado:
   nenhuma liberação antecipada nem nova compra duplicada; restore recupera.
4. Renovação de teste, cancelamento até vencimento, expiração, grace/hold e refund:
   RTDN autenticado + reconciliação aplicam o estado correto; ack confirmado.
5. Replay/notificação fora de ordem e troca de empresa não mudam a empresa errada.
6. Contrato de outro provedor bloqueia nova compra; usar fixtures sintéticas ou
   mocks locais nesta rodada, sem operar contratos Stripe/Apple reais.
7. Registrar horário, empresa sintética, produto, estado e resultado esperado/real;
   nunca registrar purchaseToken, JSON privado ou dados de clientes.

Os cenários reais de sandbox Apple/Stripe ficam separados e pendentes; esta rodada
Google não os comprova. Não fechar 221/53/50 apenas pelo build/health check.

## Reversão

Suspender novas compras/testes antes de reverter. Preservar as novas tabelas e
ocorrências. Reverter para SHA conhecido e compatível com schema; não apagar
dados ou restaurar backup sobre eventos novos sem análise. Desligar coordenação
remove suas garantias; desligar Google também interrompe RTDN/reconciliação.
Havendo compra de teste pendente de ack/desfecho, concluir/reconciliar antes da
desativação, sem apagar a reserva para permitir outra compra.

## Verificações desta preparação

- Os quatro SQLs foram executados, em ordem, em MySQL 8.4 local com dados
  sintéticos. Confirmados: preservação de cargo/PDF legado, default dos cargos
  novos, contractRef nullable, unicidade de token e reserva por empresa.
  Esse ensaio cobre as quatro migrações sobre tabelas mínimas anteriores; não
  comprova o histórico completo nem o estado do banco remoto.
- Três testes de configuração Android aprovados: AAB/HML, bloqueio de API
  produtiva/URL ausente/iOS e preservação dos perfis EAS existentes.
- npm run validate: lint e TypeScript aprovados; Expo Doctor 19/20. Persiste a
  pendência anterior de 21 patches de dependências do SDK 55. Não houve upgrade
  compartilhado com iOS. Portanto a validação completa ainda NÃO está verde.
- Não foi gerado AAB nem executado deploy/commit. Preparação não é aceite real.

Referência de perfis EAS: https://docs.expo.dev/build/eas-json/
