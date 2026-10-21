---
title: Faturas (Invoices)
module: financials
routes: [/invoice-all]
---

# Faturas (Invoices)

## Para que serve

A tela "Invoices" é o painel de faturas da sua empresa. A partir dela você:

- cria faturas a partir de um projeto ("Invoice") ou avulsas ("Custom invoice");
- acompanha o status de cada fatura (pendente, paga, cancelada etc.);
- edita faturas ainda não pagas;
- registra pagamentos, envia a fatura ou o recibo por e-mail e baixa os PDFs;
- anexa imagens e PDFs extras, vincula a fatura a um projeto e consulta a linha do tempo de eventos.

Cada fatura pertence a um dos três tipos exibidos na coluna de tipo: **Stripe**, **QuickBooks** ou **Other** (fatura de controle manual, sem integração de pagamento).

## Onde encontrar

- Menu lateral: item "Invoice" (ícone de fatura).
- Rota da lista: `/invoice-all`. O título da página é "Invoices".
- Quem vê: é preciso ter a permissão **"Invoice"**. Sem ela, o item não aparece no menu e a tela não abre.
- Os pagamentos pelo link público e o registro de pagamentos estão em "Pagamentos de faturas". A conexão com Stripe e QuickBooks e os lembretes automáticos estão em "Configurações: Stripe e QuickBooks".

## O que aparece na tela

### Cabeçalho e filtros

- Título "Invoices" e subtítulo "Monitor your invoices, payments, and revenue" (PT: "Monitore suas faturas, pagamentos e receitas").
- Filtros no topo:
  - "Period" (período). Opções: "This Year", "This Quarter", "Last 3 Months", "Last Month", "This Month", "Last 30 Days" e "All Period".
  - "Status": "Pending" (pendentes) e "Paid" (pagas). Por padrão os dois ficam marcados.
  - "Type": "Stripe", "QuickBooks" e "Other".
  - "Clear All" limpa os filtros e volta ao padrão.

### Cards e gráficos

- Cards: "Total Invoices" (PT: "Total de faturas"), "Paid" (PT: "Pago"), "Pending" (PT: "Pendente") e "Average Invoice" (PT: "Fatura Média").
- Gráfico "Invoice Status Distribution" (distribuição por status: Paid, Pending e Canceled).
- Gráfico "Monthly Revenue Trend" (tendência de receita mensal).

### Lista "Recent Invoices"

- Título da seção: "Recent Invoices" (PT: "Faturas recentes").
- Botão "Custom invoice" (PT: "Fatura personalizada"): cria uma fatura avulsa, sem projeto.
- Botão "Invoice" (ao lado): abre a escolha de um projeto para criar a fatura a partir dele.
- Campo de busca com o texto "Search by invoice ID, client name, email, address..." (PT: "Pesquise por ID da fatura, nome do cliente, e-mail, endereço...").

### Colunas da tabela

- "Invoice" (PT: "Fatura"): número da fatura e data de criação. Tem uma caixa de seleção à esquerda.
- "Type": mostra "Invoice" enquanto a fatura não está paga. Depois de paga, mostra a forma de pagamento usada.
- "Client": nome do cliente e e-mail abaixo.
- "Description": descrição da fatura.
- "Amount": valor total em dólar.
- "Status / Payment" (PT: "Status / Pagamento"): o status (por exemplo "Pending" ou "Paid") e, abaixo, o tipo ("Stripe", "QuickBooks" ou "Other").
- "Payment Date" (PT: "Data de Pagamento"): data em que a fatura foi paga, quando existir.
- "Due Date" (PT: "Data de Vencimento").
- "Actions": ícone de olho ("View Details"), ícone de lixeira ("Delete Invoice") e um menu com três pontinhos.

Quando não há resultados, aparece: "No invoices found matching your search criteria." (PT: "Nenhuma fatura encontrada que corresponda aos seus critérios de pesquisa.").

### Menu de ações de cada fatura

O menu de três pontinhos tem o título "Invoice Actions". Os itens podem aparecer ou ficar desabilitados conforme o status e o tipo da fatura:

- "Timeline": abre a linha do tempo da fatura.
- "Link to Project" (PT: "Link para o projeto"): vincula a fatura a um projeto.
- "Send Invoices By Email" (PT: "Enviar faturas por e-mail"): abre a janela de envio por e-mail.
- "Send Invoice from QuickBooks" (PT: "Enviar fatura do QuickBooks"): aparece só em faturas QuickBooks que não estão pagas nem canceladas e cujo cliente tem e-mail.
- "View Details" (PT: "Ver detalhes da fatura").
- "Download Invoice" (PT: "Baixar fatura"): baixa o PDF da fatura.
- "Download Paid Invoice" (PT: "Baixar fatura paga"): baixa o PDF de recibo. Aparece em faturas Stripe ou Other já pagas.
- "Generate Payment Link" (PT: "Gerar link de pagamento"): aparece para faturas QuickBooks e Stripe não pagas nem canceladas, quando o cliente tem e-mail.
- "Generate Invoice Link" (PT: "Gerar link de fatura"): copia o link público da fatura.
- "Receive Payment" (PT: "Receber pagamento"): registra um pagamento. Aparece em faturas não pagas e não canceladas.
- "Edit Invoice" (PT: "Editar fatura"): abre a edição. Não aparece em faturas pagas ou canceladas. Para faturas Stripe, só aparece quando a cobrança é feita diretamente na página de pagamento (ver "Regras de negócio").
- "Cancel Invoice" (PT: "Cancelar fatura"): cancela a fatura. Não aparece em faturas canceladas ou pagas.

Ao clicar em uma linha da tabela, a fatura abre para edição, desde que ela não esteja paga.

### Seleção e exportação

- Marque as caixas de seleção para escolher faturas. A caixa do topo marca todas as visíveis ("Select all invoices").
- Com faturas selecionadas, aparecem os botões "Export PDF (n)" e "Export Excel (n)", onde n é a quantidade selecionada. Sem seleção, aparece o aviso "Please select at least one invoice to export".

### Tela de criação e edição

Ao criar ou editar, abre-se uma janela com o título "Create Invoice" (criação) ou "Edit Invoice" (edição). Ela tem:

- "Client Information" e "Client Selection", com o botão "Select Client" (PT: "Selecionar cliente"). Em fatura avulsa, o cliente é escolhido aqui.
- "Work Site (Optional)" (PT: "Local de trabalho"), com o botão "Add Work Site" (PT: "Adicionar local de trabalho") para criar um local sem sair da fatura.
- "Services & Items" (PT: "Serviços e Itens"), com o botão "Add Service" (PT: "Adicionar serviço"). As opções são "Existing Service" (PT: "Serviço Existente"), "Custom Service" (PT: "Serviço personalizado") e "AI Service" (PT: "Serviço de IA"). Também existe a opção "Add Service Manually".
- "Attachments" (PT: "Anexos"), com imagens e PDFs extras (ver "Regras de negócio").
- "Payment Details" (PT: "Detalhes de pagamento"), com os campos:
  - "Custom Creation Date" (opcional; se vazio, usa a data de hoje).
  - "Due Date" (PT: "Data de Vencimento"), obrigatório.
  - "Description" (aparece na fatura enviada ao cliente).
  - "Invoice Manager (Optional)" (PT: "Gerente da fatura (opcional)").
  - "Email Recipients" (PT: "Destinatários de e-mail"): um ou mais e-mails separados por vírgula.
  - "Payment Method" (PT: "Método de pagamento"): ver "Tipo de pagamento" abaixo.
  - "Show PDF accepted payment methods" (PT: "Mostrar métodos de pagamento aceitos no PDF"): liga ou desliga a exibição das bandeiras de cartão no PDF final.
- Um bloco de valores com a alternância "Fixed" (PT: "Fixo") e "Percentage" (PT: "Porcentagem"). Mostra "Project Total:" (PT: "Total do Projeto:") e "Invoice Amount:" (PT: "Valor da fatura:").
- Botão "Preview" para ver o PDF antes de salvar.
- Botões do rodapé: "Cancel", "Save Invoice" (PT: "Salvar fatura") ou "Save Changes" (na edição), e "Create & Send" (PT: "Criar e enviar") ou "Update & Send" (PT: "Atualizar e enviar") na edição.

#### Tipo de pagamento na criação

- "Other" (PT: "Outro"), com o texto "Manual tracking" (PT: "Rastreamento manual"). Você controla o recebimento manualmente.
- "QuickBooks", com o texto "Card & ACH payments" (PT: "Pagamentos com cartão e ACH") quando a conta está pronta. Se não estiver, mostra "Setup required" (PT: "Configuração necessária") ou "Reauthorization required".
- "Stripe", com o texto "Online payments" (PT: "Pagamentos on-line") quando está pronto. Se não estiver, mostra "Setup required" ou "Development mode enabled" (PT: "Modo de desenvolvimento ativado").

### Janela "Paid Invoices Detected"

Quando existem faturas pagas que ainda não tiveram o PDF de recibo gerado e enviado, aparece a janela "Paid Invoices Detected" (PT: "Faturas pagas detectadas"). Ela pergunta: "Would you like to generate the paid PDFs and send them to your clients now?" (PT: "Gostaria de gerar os PDFs pagos e enviá-los para seus clientes agora?"). Os botões são "Start Now" e "Decline". A janela de andamento mostra "Updating Invoices", o progresso ("n of m") e o botão "Cancel Update". Enquanto roda, aparece o aviso "Do not close or reload this page during processing".

## Como fazer

### Como criar uma fatura a partir de um projeto

1. No painel "Invoices", clique em "Invoice".
2. Escolha o projeto na janela de seleção.
3. Confira o cliente e o e-mail do cliente. Se o e-mail estiver vazio ou inválido, a fatura não é salva.
4. Na seção "Services & Items", confirme os serviços (eles costumam vir das etapas anteriores do projeto). Se não houver nenhum, adicione com "Add Service".
5. Escolha "Fixed" ou "Percentage" e preencha o valor (veja "Como o valor é calculado").
6. Preencha "Due Date" (obrigatório) e, se quiser, "Description" e "Custom Creation Date".
7. Escolha o tipo de pagamento em "Payment Method".
8. Clique em "Save Invoice" para salvar sem enviar, ou em "Create & Send" para salvar e abrir a janela de envio por e-mail.

### Como criar uma fatura avulsa ("Custom invoice")

1. No painel, clique em "Custom invoice".
2. Escolha o cliente em "Select Client". O e-mail do cliente (ou do local de trabalho escolhido) é obrigatório.
3. Opcionalmente, escolha ou crie um "Work Site".
4. Adicione pelo menos um serviço em "Services & Items".
5. Preencha o valor, a data de vencimento e o tipo de pagamento.
6. Clique em "Save Invoice" ou "Create & Send".

### Como editar uma fatura

1. Clique na linha da fatura ou, no menu de ações, escolha "Edit Invoice".
2. Altere os campos necessários.
3. Clique em "Save Changes" ou em "Update & Send" para atualizar e enviar de novo.

Observações:

- Faturas pagas não podem ser editadas. O sistema mostra "Paid invoices cannot be edited.".
- Em faturas QuickBooks com pagamento parcial, os serviços e os itens ficam bloqueados (aviso "Services & Items are locked."). Você ainda pode alterar a data de vencimento e a descrição.
- Em faturas QuickBooks com pagamento parcial, a forma de pagamento também fica bloqueada.

### Como enviar uma fatura por e-mail

1. Na linha da fatura, abra o menu de ações e escolha "Send Invoices By Email".
2. Em "Email Type" (PT: "Tipo de e-mail"), escolha "Invoice" ("Send original invoice for payment") ou "Payment Receipt" (PT: "Recibo de pagamento", "Send payment confirmation receipt").
3. Confira os destinatários em "To" (ou "Email Recipients"). Separe vários e-mails por vírgula.
4. Revise o texto em "Email Body" (PT: "Corpo do e-mail"). O texto aparece no centro do e-mail.
5. Confira a pré-visualização ("Email Preview"). O PDF da fatura (ou do recibo) vai anexado automaticamente, em "Automatic Attachment" (PT: "Anexação automática").
6. Clique em "Send Invoice" (PT: "Enviar fatura") ou "Send Receipt" (PT: "Enviar recibo").

Mensagens de confirmação: "Invoice sent successfully!" e "Payment confirmation sent successfully!". Em caso de falha: "Failed to send invoice. Please try again.".

### Como anexar imagens e PDFs extras

1. Na seção "Attachments" da fatura, use "Attach Image" para incluir fotos. Elas também podem vir dos serviços que têm fotos.
2. Use "Add PDF Document" para incluir PDFs extras. Eles são enviados como anexos separados do e-mail.
3. Para remover, use "Remove image" ou "Remove PDF".

### Como ver a linha do tempo

1. No menu de ações da fatura, escolha "Timeline".
2. Abre-se a janela "Timeline - Invoice #número", com a lista de atividades ("Activity Timeline"). Sem eventos, aparece "No Timeline Events".

### Como cancelar uma fatura

1. No menu de ações, escolha "Cancel Invoice".
2. Confirme. A fatura passa para o status "Canceled".

Não é possível cancelar faturas pagas. Faturas QuickBooks com pagamento parcial também não podem ser canceladas; o menu mostra "Cannot cancel QuickBooks invoice with partial payment".

### Como excluir uma fatura

1. Clique no ícone de lixeira da linha, ou escolha a exclusão no menu de ações.
2. Leia a janela "Confirm Deletion" (PT: "Confirmar exclusão") e clique em "Delete Permanently".

A janela avisa: "Warning: This action cannot be undone!" e lista o que será apagado: "Invoice details and line items", "Payment records", "Associated documents", "Client communication history" e "Invoice status and notes". Se a fatura é Other e já está paga, a janela também avisa que o pagamento sairá dos totais financeiros, e a exclusão fica registrada no histórico de auditoria.

Não é possível excluir faturas pagas ou canceladas em geral. Os casos específicos estão em "Regras de negócio".

Para registrar pagamentos, use "Receive Payment" (passo a passo em "Pagamentos de faturas"). Para baixar PDFs, use "Download Invoice" ou "Download Paid Invoice"; se o PDF ainda não existir, o sistema avisa.

## Status e ciclo de vida

Os status exibidos na coluna "Status / Payment" são:

- **Draft**: fatura criada, ainda não emitida.
- **Pending**: fatura emitida e aguardando pagamento. O filtro "Pending" mostra as faturas em "Draft", "Pending" e "Partial".
- **Partial**: pagamento parcial. Hoje é usado só para faturas QuickBooks.
- **Paid**: fatura quitada. Fica travada para edição.
- **Canceled**: fatura cancelada. Não pode ser editada nem paga.
- **Uncollectible**: fatura marcada como incobrável.

Fluxo típico: criada como "Pending" (ou "Draft") → "Partial" (se houver pagamento parcial, no caso QuickBooks) → "Paid". Também pode ir para "Canceled" antes de ser paga.

Tipos de fatura (coluna "Type" e filtro "Type"):

- **Stripe**: cobrança online pela Stripe. Pode ser uma fatura enviada pela Stripe ou uma cobrança feita diretamente na página de pagamento.
- **QuickBooks**: fatura criada e controlada pelo QuickBooks Online.
- **Other**: fatura de controle manual. Os pagamentos são registrados por você.

## Regras de negócio

### Validações ao salvar

- É obrigatório ter um cliente. Sem ele: "Please select a client first.".
- É obrigatório ter pelo menos um serviço. Sem ele: "Please add at least one service.".
- O e-mail do cliente é obrigatório e precisa ser válido: "Client email address is required." e "Invalid client email address.". Em fatura de projeto, vale o e-mail do cliente do projeto.
- No modo "Percentage", o percentual precisa ser maior que zero: "Please enter a valid percentage greater than zero.". O máximo é 100%.
- No modo "Fixed", o valor precisa ser maior que zero: "Please enter a valid price greater than zero.".
- A data de vencimento é obrigatória: "Due date is required.".

### Como o valor é calculado

- **Fixed**: você digita o valor só com números. Exemplo: 150000 vira $1,500.00 (os dois últimos dígitos são centavos).
- **Percentage**: o valor é o percentual aplicado sobre o saldo a receber do projeto. Se o total dos serviços é menor ou igual ao preço do projeto, a base é o total dos serviços menos o que já foi pago. Se os serviços ultrapassam o preço do projeto, a base é o restante do preço original (menos o que já foi pago) mais o valor dos serviços extras.

### Quem pode o quê

- Apenas usuários com a permissão "Invoice" acessam a tela.
- Faturas pagas não podem ser editadas.

### Criação por tipo

- **QuickBooks**: exige que a conta QuickBooks esteja conectada. Se for preciso reconectar, o sistema pede: "You need to reconnect your QuickBooks account with additional permissions". A fatura é criada também no QuickBooks.
- **Stripe**: exige que a empresa tenha conta Stripe conectada. Sem ela, a fatura não é criada.
- **Other**: não cria nada em outro sistema.

### Envio e lembretes

- Ao usar "Create & Send" ou "Send Invoices By Email", o e-mail sai com o PDF da fatura ou do recibo como anexo automático.
- Faturas "Pending" recebem lembretes automáticos perto do vencimento ou em atraso, conforme Settings ("Configurações: Stripe e QuickBooks").

### Exclusão

- Faturas **pagas** ou **canceladas** não podem ser excluídas, em regra. O botão aparece desabilitado com a dica "Cannot delete paid or void invoices".
- Faturas **Other pagas** podem ser excluídas somente se não tiverem vínculo com Stripe nem com QuickBooks. Caso tenham, o sistema bloqueia com a dica "This Other invoice has QuickBooks accounting data and cannot be deleted only in SmartBuild" ou "This Other invoice has Stripe payment data and cannot be deleted only in SmartBuild".
- Faturas **QuickBooks** com pagamento parcial não podem ser excluídas: "Cannot delete QuickBooks invoice with partial payment".
- Ao excluir uma fatura QuickBooks, ela também é excluída no QuickBooks: "Invoice deleted successfully from QuickBooks and local database!".
- Ao excluir uma fatura Stripe, as cobranças ligadas a ela são canceladas e a fatura é removida.

### Cancelamento

- Cancelar muda o status para "Canceled" e registra o evento na linha do tempo.
- Faturas pagas não podem ser canceladas.
- Faturas QuickBooks com pagamento parcial não podem ser canceladas.

### Edição de faturas Stripe

- Em faturas Stripe, a edição cancela a fatura anterior na Stripe e cria uma nova. Por isso, o cliente pode receber uma fatura nova no lugar da anterior.
- A opção "Edit Invoice" não aparece para faturas Stripe enviadas pela Stripe. Ela aparece para as cobranças feitas diretamente na página de pagamento.

### Faturas pagas pendentes de recibo

- Ao aceitar ("Start Now"), o sistema gera e envia o PDF pago de cada fatura, uma por vez. Se uma fatura falhar três vezes, ela é pulada. Ao clicar em "Decline", essas faturas deixam de ser oferecidas nessa janela.

## Relação com outros módulos

- **Projetos**: a fatura normalmente nasce de um projeto. O valor usa o preço do projeto e o que já foi pago. A ação "Link to Project" conecta faturas avulsas a um projeto.
- **Orçamentos (Estimates)**: faturas podem ser criadas a partir de um orçamento. Os serviços e os valores vêm do orçamento.
- **Clientes**: o cliente da fatura é o cliente do projeto (ou o escolhido na fatura avulsa). O e-mail de envio vem do cadastro do cliente.
- **Pagamentos de faturas**: pagamentos manuais, pagamento pelo link público e registro de pagamentos ficam no arquivo "Pagamentos de faturas".
- **Configurações (Settings)**: conexão com Stripe e QuickBooks e lembretes automáticos de cobrança ficam em "Configurações: Stripe e QuickBooks".
- **Contas a pagar**: não há vínculo entre faturas (a receber) e contas a pagar.

## Dúvidas frequentes

**P:** Por que não consigo editar uma fatura?
**R:** Faturas pagas não podem ser editadas. Em faturas QuickBooks com pagamento parcial, os serviços e o valor também ficam bloqueados; só a data de vencimento e a descrição podem mudar.

**P:** Como crio uma fatura sem projeto?
**R:** Clique em "Custom invoice", escolha o cliente, adicione pelo menos um serviço e preencha o vencimento.

**P:** Salvei a fatura mas o cliente não recebeu nada. Por quê?
**R:** O botão "Save Invoice" salva sem enviar. Para enviar, use "Create & Send" ou "Send Invoices By Email" na linha da fatura.

**P:** Qual a diferença entre "Save Invoice" e "Create & Send"?
**R:** "Save Invoice" só salva. "Create & Send" salva, gera o PDF e abre a janela de envio por e-mail, onde você confirma os destinatários e a mensagem.

**P:** Por que o botão de excluir está desabilitado?
**R:** Faturas pagas ou canceladas não podem ser excluídas. Passe o cursor sobre o botão para ver o motivo exato. Para faturas com vínculo com QuickBooks ou Stripe, a exclusão precisa ser feita pelo sistema de origem.

**P:** O que significa "Other" na coluna de tipo?
**R:** É uma fatura de controle manual, sem cobrança pela Stripe nem pelo QuickBooks. Você registra os pagamentos recebidos.

**P:** Quantos anexos posso colocar?
**R:** Até 10 imagens (comprimidas para o PDF ficar abaixo de 25 MB) e até 2 PDFs extras, de no máximo 5 MB cada.

