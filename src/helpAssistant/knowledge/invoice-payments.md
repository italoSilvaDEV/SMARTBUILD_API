---
title: Pagamentos de faturas
module: financials
routes: [/invoice-all, /pay/:invoiceId, /payment-success, /invoice/:invoiceId, /invoice-success]
---

# Pagamentos de faturas

## Para que serve

Este módulo cobre tudo o que acontece com o dinheiro de uma fatura:

- registrar manualmente um pagamento recebido (cheque, dinheiro, transferência etc.) pela tela de faturas;
- o cliente pagar a fatura online pelo link de pagamento, com cartão ou débito bancário (ACH);
- o cliente abrir o link público da fatura para ver os detalhes e o PDF;
- o sistema atualizar o status da fatura quando o pagamento é confirmado, inclusive quando o pagamento foi feito no QuickBooks.

## Onde encontrar

- **Registrar pagamento manual**: na tela "Invoices" (menu "Invoice", rota `/invoice-all`), no menu de ações da fatura, item "Receive Payment". Quem vê é quem tem a permissão **"Invoice"**.
- **Página de pagamento do cliente**: `/pay/:invoiceId`. É aberta pelo link de pagamento enviado ao cliente. Não exige login.
- **Página de confirmação**: `/payment-success`, exibida depois que o cliente tenta pagar pelo link.
- **Link público da fatura**: `/invoice/:invoiceId`. Mostra os detalhes da fatura para quem tem o link. Não exige login.
- **Página de confirmação de fatura**: `/invoice-success`.

## O que aparece na tela

### Janela "Receive Payment" (registrar pagamento)

Campos e botões, na ordem em que aparecem:

- "Payment Amount" (PT: "Valor do pagamento"): valor do pagamento em USD. Vem preenchido com o total da fatura e não pode ser alterado.
- "Payment Method" (PT: "Método de pagamento"), obrigatório. Opções: "Credit Card", "Bank Transfer", "Cash", "Check", "PayPal", "Stripe" e "QuickBooks".
- Caixa "Use retroactive payment date" (usar data de pagamento retroativa). Quando marcada, aparece o campo "Payment Date" (PT: "Data de Pagamento"), obrigatório.
- "Notes (Optional)" (PT: "Observações (opcional)"): texto livre sobre o pagamento.
- Botões: "Cancel" e "Process Payment".

Se a fatura já estiver paga, a mesma janela abre só para consulta, com os dados do pagamento registrado e o botão "Close".

### Página de pagamento do cliente (`/pay/:invoiceId`)

- Título "Complete Payment" (PT: "Concluir pagamento") e subtítulo "Complete your payment securely" (PT: "Conclua seu pagamento com segurança").
- Cabeçalho com "Payment #número" (PT: "Pagamento #número") e "Payment for" (PT: "Pagamento para") o nome da empresa.
- Botão "View Invoice" (PT: "Ver fatura"), que abre a fatura.
- Resumo: "Subtotal" e, quando aplicável, "Card Payment Surcharge (2.9%)" (PT: "Sobretaxa de pagamento com cartão (2,9%)"), depois "Total".
- Aviso: "A 2.9% surcharge will be added for card payments." (PT: "Uma sobretaxa de 2,9% será adicionada para pagamentos com cartão.").
- Bloco "Payment Information" (PT: "Informações de pagamento"), com o texto "Select your preferred payment method" (PT: "Selecione seu método de pagamento preferido").
- Botão "Pay" (PT: "Pagar"), com o valor. Enquanto processa, mostra "Processing..." (PT: "Processando...").

### Página de confirmação (`/payment-success`)

- Enquanto verifica, aparece "Checking the status of your payment...".
- Pagamento aprovado: "Payment Successful!" (PT: "Pagamento realizado com sucesso!") e "Your payment was processed and confirmed." Também aparece "Payment Confirmed" no topo.
- Pagamento que precisa de confirmação extra: "Action Required", com o texto "Please check your email to complete the payment verification.".
- Detalhes mostrados: "Payment Details", "Invoice Number" (PT: "Número da fatura"), "Company", "Total Paid" (PT: "Total pago"), "Processing Fee" (PT: "Taxa de processamento") e "Payment Method" (PT: "Método de pagamento").
- Se não for possível verificar o pagamento: "Error verifying payment".

### Página de fatura pública (`/invoice/:invoiceId`)

- Título "Invoice Details" (PT: "Detalhes da fatura") e subtítulo "View your invoice information" (PT: "Veja as informações da sua fatura").
- Cabeçalho "Invoice #número" (PT: "Fatura #número") e o botão "View Invoice PDF" (PT: "Ver PDF da fatura").
- Blocos "Company" (PT: "Empresa"), "Status" (PT: "Status"), "Due Date" (PT: "Data de Vencimento") e "Description" (PT: "Descrição").
- "Summary" (PT: "Resumo") com "Subtotal" e "Total".
- "Payment Information" (PT: "Informações de pagamento"), com "Payment Method", "Amount Paid" (PT: "Valor pago") e "Paid At" (PT: "Pago em"), além de observações ("Notes").
- Faixa de aviso quando a fatura está paga: "This invoice has been paid. Thank you for your payment." (PT: "Esta fatura foi paga. Obrigado pelo seu pagamento.").
- Faixa de aviso quando a fatura foi anulada: "This invoice has been voided and is no longer valid." (PT: "Esta fatura foi anulada e não é mais válida.").
- Se o link não for válido: "Error loading invoice" (PT: "Erro ao carregar a fatura") ou "Invoice ID not provided".

### Página de link de pagamento cancelado

- Quando o pagamento foi cancelado, a página mostra "Payment Canceled" (PT: "Pagamento cancelado") e o texto: "This payment link is no longer valid. Please request a new payment link from the company.". O botão "Back" (PT: "Voltar") fecha a página.

## Como fazer

### Como registrar um pagamento manual

1. Na tela "Invoices", localize a fatura que está "Pending" (ou "Partial", no caso QuickBooks).
2. Abra o menu de ações da fatura (três pontinhos) e escolha "Receive Payment".
3. Confira o valor em "Payment Amount". Ele é sempre o total da fatura.
4. Escolha o "Payment Method".
5. Se o pagamento foi recebido em outra data, marque "Use retroactive payment date" e escolha a data em "Payment Date". Não é permitido usar data futura.
6. Se quiser, escreva uma observação em "Notes".
7. Clique em "Process Payment".

Resultado: a fatura passa para "Paid", o evento "Payment recorded on ..." aparece na linha do tempo e, se o cliente tiver e-mail, ele recebe a confirmação "Payment Received" com o PDF pago anexado.

Mensagens de erro na janela:

- "Please select a payment method" (escolha um método de pagamento).
- "Please select the payment date" (escolha a data do pagamento).
- "Payment date cannot be in the future" (a data do pagamento não pode ser futura).

### Como o cliente paga pelo link

1. O cliente abre o link de pagamento recebido por e-mail (`/pay/:invoiceId`).
2. Confere o resumo e escolhe o método na área "Payment Information".
3. Clica em "Pay".
4. Ao cartão, é aplicada a sobretaxa de 2,9%, que aparece no resumo antes de pagar.
5. Se o pagamento for aprovado, a página mostra "Payment Successful!". Se for necessária uma etapa extra, mostra "Action Required" e pede para verificar o e-mail.

### Como consultar o link público da fatura

1. Na linha de uma fatura Other, no menu de ações, escolha "Generate Invoice Link" (PT: "Gerar link de fatura"). O link é copiado para a área de transferência.
2. Envie o link ao cliente. Quem abrir o link vê os detalhes e pode baixar o PDF.

### Como gerar o link de pagamento

1. Na linha da fatura, no menu de ações, escolha "Generate Payment Link" (PT: "Gerar link de pagamento").
2. O link é copiado ("Payment link copied to clipboard!"). O item aparece em todas as faturas QuickBooks, e em faturas Stripe que não estão pagas nem canceladas, quando o cliente tem e-mail.

## Status e ciclo de vida

Status da fatura relacionados a pagamento (veja o detalhamento em "Faturas (Invoices)"):

- **Pending** (open): aguardando pagamento. Se um pagamento falhar, a fatura volta para este status para que o cliente tente de novo.
- **Partial**: pagamento parcial (somente QuickBooks). Só é alterado pelo QuickBooks.
- **Paid**: pagamento confirmado. A fatura fica travada para edição.

Status do pagamento online (Stripe), visto pelo cliente e pela equipe:

- **Processing** ("Checking the status of your payment..."): pagamento em processamento, comum em débito bancário (ACH). A fatura só vira "Paid" quando o pagamento é confirmado.
- **Requires action** ("Action Required"): o cliente precisa concluir uma etapa, geralmente confirmar pelo e-mail.
- **Succeeded** ("Payment Successful!"): pagamento aprovado. A fatura passa para "Paid".
- **Canceled** ("Payment Canceled"): pagamento cancelado. O link deixa de ser válido e a equipe deve gerar um novo.

## Regras de negócio

### Pagamento manual

- Só é possível registrar pagamento manual em faturas que não estão pagas nem canceladas.
- Para faturas do tipo **Other** (controle manual), só cabe **um** pagamento por fatura. Se já existir um pagamento, o sistema responde "Payment already exists for this invoice".
- O valor registrado é sempre o total da fatura. A janela não aceita pagamento parcial para faturas Other.
- Ao registrar, o sistema grava a data do pagamento (hoje, ou a data retroativa escolhida), marca a fatura como paga e gera o PDF pago.
- Se o cliente tiver e-mail, é enviado o e-mail "Payment Received - Invoice #..." com o PDF pago anexado.
- Para faturas Stripe e QuickBooks, o registro segue o fluxo da integração correspondente. Em QuickBooks, o pagamento manual é registrado também no QuickBooks.

### Pagamento online (link `/pay/:invoiceId`)

- **Sobretaxa de 2,9%**: aplicada a pagamentos com cartão e carteiras digitais (Apple Pay, Google Pay e Link). O valor é 2,9% do valor da fatura, sem taxa fixa.
- **Débito bancário (ACH)**: não recebe a sobretaxa.
- A taxa aparece no resumo como "Card Payment Surcharge (2.9%)" e, depois da confirmação, em "Processing Fee".
- Os métodos oferecidos dependem da configuração da conta Stripe da empresa (ver "Configurações: Stripe e QuickBooks").
- Se o pagamento falhar, a fatura continua em aberto ("Pending") para nova tentativa.
- Se a fatura estiver anulada, a página mostra o aviso de fatura inválida.

### Pagamento pelo QuickBooks

- Para faturas QuickBooks, o status é atualizado quando o QuickBooks registra o pagamento.
- Pagamento parcial: o status vira "Partial". O sistema envia e-mails de pagamento parcial com o valor pago e o saldo restante.
- Pagamento total: o status vira "Paid". O sistema envia a confirmação "Payment Confirmation" com o PDF pago.

### Acesso ao link público

- Os links `/pay/:invoiceId` e `/invoice/:invoiceId` não pedem login. Quem tiver o link pode ver a fatura. Por isso, use o link "Generate Invoice Link" e envie apenas ao cliente.

### Lembretes de cobrança

- Lembretes automáticos por e-mail são enviados somente para faturas com status "Pending". Veja os dias de envio em "Configurações: Stripe e QuickBooks".

## Relação com outros módulos

- **Faturas (Invoices)**: é de lá que você registra pagamentos, gera links e baixa recibos. O status exibido na lista é o mesmo mostrado nas páginas de pagamento.
- **Configurações (Settings)**: a conexão com Stripe é necessária para pagamentos online e para faturas Stripe. A conexão com QuickBooks é necessária para faturas QuickBooks e para pagamentos registrados no QuickBooks. Veja "Configurações: Stripe e QuickBooks".
- **Clientes**: o e-mail do cliente é usado para enviar o link, a confirmação e o recibo.
- **Projetos**: a fatura pertence a um projeto (ou é avulsa).

## Dúvidas frequentes

**P:** Registrei um pagamento e o cliente não recebeu o recibo. O que aconteceu?
**R:** O e-mail "Payment Received" só é enviado se o cliente tiver um e-mail cadastrado na fatura. Confira o e-mail do cliente. Você também pode reenviar o recibo com "Send Invoices By Email" e o tipo "Payment Receipt".

**P:** O cliente pagou um valor parcial. Como registro isso?
**R:** Para faturas do tipo Other, a janela "Receive Payment" registra sempre o total, e só cabe um pagamento por fatura. Pagamentos parciais são controlados pelo QuickBooks, em faturas QuickBooks.

**P:** Posso colocar uma data de pagamento de ontem?
**R:** Sim. Marque "Use retroactive payment date" e escolha a data. Datas futuras não são aceitas.

**P:** Por que apareceu "Card Payment Surcharge (2.9%)" no pagamento?
**R:** A sobretaxa de 2,9% é cobrada quando o pagamento é feito com cartão ou carteira digital. Pagamentos por débito bancário (ACH) não têm essa taxa.

**P:** O cliente disse que pagou, mas a fatura ainda aparece como "Pending".
**R:** Enquanto o pagamento estiver em processamento (comum em débito bancário), a fatura continua pendente e só vira "Paid" quando o pagamento é confirmado. Se o pagamento falhou, ela também continua pendente.

**P:** O link de pagamento mostra "Payment Canceled". E agora?
**R:** O link deixou de ser válido. Gere um novo pelo menu de ações da fatura ("Generate Payment Link") e envie ao cliente.

**P:** O cliente abriu o link da fatura e viu "This invoice has been voided and is no longer valid.". Por quê?
**R:** A fatura foi cancelada. Se precisar cobrar, crie uma nova fatura.

**P:** Quem pode ver o link público da fatura?
**R:** Qualquer pessoa que tenha o link. Não há login. Envie o link apenas ao cliente.
