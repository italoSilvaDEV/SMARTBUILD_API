---
title: Configurações de pagamentos, QuickBooks e lembretes (Settings)
module: financials
routes: [/stripe-config, /qbo-integration]
---

# Configurações de pagamentos, QuickBooks e lembretes (Settings)

## Para que serve

A tela "Settings" (PT: "Configurações") é onde a empresa conecta as integrações de pagamento e contabilidade e define algumas regras financeiras. Nela você:

- conecta a conta de pagamentos Stripe, que permite cobrar faturas online;
- conecta a conta QuickBooks Online, escolhe o que será sincronizado e liga ou desliga a criação automática de faturas no QuickBooks;
- configura os lembretes automáticos de cobrança por e-mail;
- atualiza os dados da empresa que aparecem nos documentos;
- configura o texto de apresentação e os termos dos contratos e orçamentos.

Também existe o guia somente leitura "QuickBooks Online Integration", que explica o que a integração faz em cada módulo.

## Onde encontrar

- Menu lateral: item "Settings" (ícone de Stripe). Rota: `/stripe-config`. Título: "Settings".
- Guia do QuickBooks: `/qbo-integration`, com o título "QuickBooks Online Integration". É aberto a partir da aba "Integrations" (botão de voltar: "Back to Integrations").
- Quem vê: é preciso ter a permissão **"Settings"** para abrir as duas telas. Sem ela, o item não aparece no menu e a tela não abre.
- A aba "Email Reminders" só aparece para quem tem a permissão **"Email Reminders"**.

Descrição da tela: "Manage your payment integrations, company information, and contract settings." (PT: "Gerencie integrações de pagamento, informações da empresa e configurações de contratos.").

## O que aparece na tela

A tela tem seis abas, nesta ordem: "Payments" (PT: "Pagamentos"), "Subscription" (PT: "Assinatura"), "Integrations" (PT: "Integrações"), "Company" (PT: "Empresa"), "Policies & Terms" (PT: "Políticas e termos") e "Email Reminders" (PT: "Lembretes por e-mail").

### Aba "Payments"

- Cartão "Payment Setup": "Connect your payment provider account to enable secure payment processing." (conecte a conta do provedor de pagamentos para habilitar o processamento seguro).
- Etiqueta de situação: "Connected" (PT: "Conectado") ou "Disconnected" (PT: "Desconectado").
- Botão de conexão com a Stripe. Quando a conta já está conectada, o botão fica desabilitado.
- Se a conta exigir complementação, a tela indica as pendências da conta Stripe.

### Aba "Integrations" (Integrações)

**Cartão "QuickBooks Integration"** (PT: "Integração com QuickBooks"): "Connect your QuickBooks account to synchronize invoices and financial data."

- Etiqueta "Connected" ou "Disconnected", e o botão de conexão. Quando a conta está conectada e não precisa de nova autorização, o botão fica desabilitado. Se for preciso reautorizar, o botão fica disponível para reconectar.

**Cartão "Sync Settings"** (PT: "Configurações de sincronização"): "Choose the entities you want to sync with SmartBuild."

- Uma linha por entidade: "Customers" (clientes), "Projects" (projetos), "Estimates" (orçamentos) e "Invoices" (faturas).
- Cada linha mostra a direção da sincronização: "Bidirectional" (PT: "Bidirecional"), "Disabled" (PT: "Desativado") ou "Checking" (PT: "Verificando").
- Botão "Start Synchronization" (PT: "Iniciar sincronização"), que mostra "Synchronizing..." enquanto roda. Se nenhuma entidade estiver marcada, aparece "Select at least one entity to sync.".
- Para desativar uma entidade, a janela "Disable QuickBooks Synchronization" pede confirmação: "This stops synchronization for this entity. You can enable it again later." (botão "Disable Synchronization").
- Dica de projetos: "Projects sync from QuickBooks to SmartBuild." (PT: "Os projetos são sincronizados do QuickBooks para o SmartBuild.").

**Cartão "QuickBooks Configuration"** (PT: "Configuração do QuickBooks"): "Configure your company's QuickBooks integration settings."

- Opção "Create QuickBooks Invoices" (PT: "Criar faturas no QuickBooks"): "Automatically create a QuickBooks invoice when a Stripe invoice is created in SmartBuild."
- Explicação "How it works" (PT: "Como funciona"): quando a opção está ligada, as faturas criadas com Stripe no SmartBuild também são criadas no QuickBooks. Desligue a opção se preferir lançar as faturas do QuickBooks manualmente.

**Guia "QuickBooks Online Integration"** (`/qbo-integration`): página somente leitura. Abre com "Read-only guide" e a explicação "Connect one SmartBuild company to one QuickBooks Online Accounting company." Depois, há um bloco por módulo (Clients, Projects, Estimates e Invoices), com o tipo de sincronização, o que é suportado e observações. O resumo do que o guia descreve está em "Como o QuickBooks sincroniza" abaixo.

### Aba "Company" (Empresa)

Cartão "Company Details" (dados da empresa), com os campos:

- "Company Name" (nome da empresa), com a dica "Enter company name".
- "Phone", "Address", "Email" e "Website", cada um com seu texto de exemplo.
- Logo da empresa: a dica "Click to change logo" troca a imagem.
- Botão "Save Changes" (PT: "Salvar alterações"), que mostra "Saving..." enquanto grava.

### Aba "Policies & Terms" (Políticas e termos)

- Título "Contract Terms & Policies" (PT: "Termos e políticas contratuais"): "Configure the introduction letter and terms included in contracts and estimates." (PT: "Configure a carta de apresentação e os termos incluídos em contratos e orçamentos.").
- Campos "Introduction Letter" (PT: "Carta de apresentação"), "Terms & Conditions (Estimate)" (termos do orçamento) e "Terms & Conditions (Work Order)" (termos da ordem de serviço).
- Lista "Available Variables" (variáveis disponíveis): clique em uma variável para inserir no campo ativo. Botões "Load Default" (carregar padrão) e "Clear" (limpar).
- Mensagem ao salvar: "Contract terms saved successfully." (PT: "Termos do contrato salvos com sucesso.").

### Aba "Email Reminders" (Lembretes por e-mail)

- Título "Automatic Email Reminders" (PT: "Lembretes automáticos por e-mail") e a explicação: "Configure automatic email reminders for pending invoices. Emails are sent daily at 9:00 AM according to your schedule."
- Chave "Enable Automatic Reminders" (ativar lembretes automáticos).
- "Reminders Before Due Date" (lembretes antes do vencimento): "7 days before due date", "3 days before due date" e "1 day before due date".
- "On Due Date" (no dia do vencimento): "On the due date (payment due today)".
- "Reminders After Due Date (Overdue)" (lembretes após o vencimento, em atraso): "1 day after due date", "3 days after due date" e "7 days after due date".
- Botão "Save Configuration" (PT: "Salvar configuração").

## Como fazer

### Como conectar a conta Stripe

1. Abra "Settings" e vá para a aba "Payments".
2. No cartão "Payment Setup", clique no botão de conexão com a Stripe.
3. Conclua o cadastro na Stripe. Quando a conexão estiver pronta, a etiqueta muda para "Connected".

Sem a conta Stripe conectada, as opções de cobrança online ficam indisponíveis ("Setup required") ao criar faturas.

### Como conectar o QuickBooks

1. Abra "Settings" e vá para a aba "Integrations".
2. No cartão "QuickBooks Integration", clique no botão de conexão e autorize o acesso à conta QuickBooks Online.
3. Quando a conexão estiver pronta, a etiqueta muda para "Connected".

Uma empresa SmartBuild pode estar conectada a apenas uma empresa do QuickBooks Online. Se a autorização expirar, aparece "Reauthorization required" e você precisa conectar de novo.

### Como escolher o que sincronizar

1. Na aba "Integrations", no cartão "Sync Settings", ative a entidade desejada (Customers, Projects, Estimates ou Invoices).
2. Clique em "Start Synchronization" para iniciar uma sincronização completa.
3. Para parar, use a opção de desativação e confirme em "Disable Synchronization". Você pode ativar de novo depois.

### Como ligar ou desligar a criação de faturas no QuickBooks

1. Na aba "Integrations", no cartão "QuickBooks Configuration", ligue ou desligue "Create QuickBooks Invoices".
2. Com a opção ligada, cada fatura Stripe criada no SmartBuild também é criada no QuickBooks.

### Como configurar os lembretes de cobrança

1. Abra a aba "Email Reminders".
2. Ligue "Enable Automatic Reminders".
3. Marque os lembretes desejados: antes do vencimento (7, 3 ou 1 dia), no dia do vencimento e depois do vencimento (1, 3 ou 7 dias).
4. Clique em "Save Configuration".

### Como atualizar os dados da empresa

1. Abra a aba "Company".
2. Altere os campos em "Company Details" e, se quiser, clique na imagem para trocar o logo.
3. Clique em "Save Changes".

## Como o QuickBooks sincroniza

Esta seção resume o que a integração faz. Cada item depende de a entidade estar habilitada em "Sync Settings" (quando aplicável) e de a conta estar conectada.

- **Clientes (Customers)**: sincronização nos dois sentidos quando a opção está como "Bidirectional". Um cliente novo vindo do QuickBooks só vira cliente no SmartBuild se tiver e-mail. Se o e-mail já existir em outro cliente, o dado não é sobrescrito e fica para revisão. Do SmartBuild para o QuickBooks vão o nome de exibição, e-mail, telefone e endereço de cobrança.
- **Projetos (Projects)**: vão do QuickBooks para o SmartBuild. Projetos criados só no SmartBuild não são exportados para o QuickBooks.
- **Orçamentos (Estimates)**: os orçamentos ligados a projetos do QuickBooks são importados. Um orçamento do SmartBuild só vai para o QuickBooks se o projeto já estiver ligado a um projeto do QuickBooks. Orçamentos avulsos não são exportados. O QuickBooks precisa ter um item de serviço ativo para representar as linhas do orçamento.
- **Faturas (Invoices)**: são importadas as faturas do QuickBooks ligadas a projetos já ligados ao SmartBuild. A criação de faturas no SmartBuild gera a fatura correspondente no QuickBooks, conforme o tipo de fatura. Pagamentos registrados no QuickBooks atualizam o status da fatura no SmartBuild (parcial ou paga). Alterações de status que chegam sem um pagamento, como cancelamentos feitos direto no QuickBooks, podem não aparecer automaticamente no SmartBuild.

Quando as informações mudam no QuickBooks, o sistema recebe o aviso e atualiza o SmartBuild de forma automática, para as entidades habilitadas. Você também pode iniciar uma sincronização manual pelo botão "Start Synchronization".

## Status e ciclo de vida

Situação da conexão com cada integração:

- **Connected** (PT: "Conectado"): a integração está ativa e pode trocar informações.
- **Disconnected** (PT: "Desconectado"): sem conexão. Faturas e pagamentos que dependem da integração ficam indisponíveis.
- **Reauthorization required** (reautorização necessária): a autorização expirou ou perdeu permissões. Reconecte pelo botão da integração.

Situação da sincronização por entidade: "Bidirectional", "Disabled" ou "Checking" (verificando a configuração).

## Regras de negócio

### Conta Stripe

- Os pagamentos online pela página de pagamento e as faturas Stripe só funcionam com a conta conectada.
- Enquanto a conta não estiver pronta, o tipo "Stripe" aparece com a indicação "Setup required" ao criar faturas.

### QuickBooks

- Cada empresa SmartBuild se conecta a uma única empresa do QuickBooks Online.
- Desconectar para a comunicação com o QuickBooks, mas não apaga os registros que já foram criados ou importados no SmartBuild. Você pode reconectar depois pela aba "Integrations".
- Para criar faturas no QuickBooks, a conexão precisa estar ativa. Se não estiver, a criação é recusada com "QuickBooks not connected".
- Faturas QuickBooks com pagamento parcial têm restrições: não podem ser editadas em itens ou valor, nem canceladas ou excluídas.
- Links de pagamento do QuickBooks dependem de a conta QuickBooks ter pagamentos online habilitados.

### Lembretes automáticos

- O envio roda uma vez por dia, às 9:00 da manhã, no horário do servidor.
- Só recebem lembrete as faturas com status "Pending" (aberta), que tenham data de vencimento e e-mail do cliente.
- O lembrete é enviado no dia exato da regra. Por exemplo, a regra de 3 dias antes do vencimento dispara quando faltam exatamente 3 dias.
- Cada tipo de lembrete é enviado no máximo uma vez por dia para a mesma fatura.
- Faturas com pagamento parcial do QuickBooks não recebem esses lembretes, pois o status delas não é "Pending".
- O envio fica registrado no histórico da fatura.

### Dados da empresa

- Os dados da aba "Company", como nome e logo da empresa, são usados nos documentos gerados pelo sistema.

### Termos de contratos e orçamentos

- O texto de apresentação e os termos alteram os contratos e orçamentos gerados depois de salvos.

## Relação com outros módulos

- **Faturas (Invoices)**: a conexão com Stripe e QuickBooks define quais tipos de fatura e de pagamento estão disponíveis. Os lembretes automáticos atingem as faturas em aberto.
- **Pagamentos de faturas**: a página de pagamento do cliente usa a conta Stripe conectada e aplica a sobretaxa de cartão.
- **Contratos**: o texto de apresentação e os termos vêm da aba "Policies & Terms".
- **Clientes, projetos e orçamentos**: são as entidades sincronizadas com o QuickBooks.

## Dúvidas frequentes

**P:** Conectei o QuickBooks, mas as faturas não aparecem lá. Por quê?
**R:** Confira se "Create QuickBooks Invoices" está ligado (para faturas Stripe) e se a conexão está como "Connected". Faturas do tipo QuickBooks são criadas no QuickBooks no momento em que você as salva.

**P:** Desconectei o QuickBooks. Perdi as faturas e os clientes?
**R:** Não. A desconexão só interrompe a comunicação com o QuickBooks. Os registros que já existem no SmartBuild continuam lá. Você pode reconectar depois.

**P:** O que acontece se eu desativar a sincronização de Customers?
**R:** Os clientes deixam de ser sincronizados automaticamente com o QuickBooks, até você ativar a entidade de novo.

**P:** Por que o botão de conectar a Stripe está desabilitado?
**R:** Porque a conta já está conectada. O botão só volta a ficar disponível se a conexão for desfeita.

**P:** O cliente vai receber o lembrete mesmo se eu tiver marcado a opção só para antes do vencimento?
**R:** Só recebem lembrete os tipos que você marcou em "Email Reminders". A regra exata é enviada no dia correspondente, e somente para faturas em aberto com e-mail do cliente.

**P:** Os lembretes são enviados a qualquer hora?
**R:** Não. Os lembretes são enviados uma vez por dia, às 9:00 da manhã, no horário do servidor.

**P:** Como vejo o que a integração com QuickBooks faz em cada módulo?
**R:** Abra "Integrations" e use o guia "QuickBooks Online Integration", que mostra o tipo de sincronização, o que é suportado e as limitações de cada módulo.

**P:** Onde altero o texto de apresentação dos contratos?
**R:** Na aba "Policies & Terms", no campo "Introduction Letter". Salve as alterações para que valham para os próximos contratos e orçamentos.
