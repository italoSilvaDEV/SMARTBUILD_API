---
title: Contratos (Contracts)
module: financials
routes: [/contracts, /contracts/new, /contracts/:contractId/edit, /contract-response/:publicToken]
---

# Contratos (Contracts)

## Para que serve

O módulo de contratos permite enviar um contrato em PDF ao cliente para assinatura eletrônica. Com ele você:

- monta o contrato a partir de um ou mais arquivos PDF;
- posiciona os campos de assinatura e de data da empresa e do cliente sobre o PDF;
- envia o contrato por e-mail ao cliente, com link para revisão e assinatura, e pode proteger o acesso com um código;
- acompanha o andamento (enviado, visualizado, assinado, expirado ou cancelado) e a linha do tempo de cada contrato;
- reenvia lembretes, cancela contratos ainda não assinados e baixa o PDF final.

## Onde encontrar

- Menu lateral: item "Contracts" (ícone de documento com assinatura).
- Rota da lista: `/contracts`. Título da página: "Contracts" (PT: "Contratos").
- Criação: `/contracts/new`, pelo botão "New Contract" (PT: "Novo Contrato"). Edição: `/contracts/:contractId/edit`, pelo menu de ações da linha.
- Quem vê: é preciso ter a permissão **"Contracts"**. Sem ela, o item não aparece e a tela não abre.
- Quem assina: o cliente não precisa de login. Ele acessa pelo link recebido por e-mail, em `/contract-response/:publicToken`.

## O que aparece na tela

### Lista de contratos (`/contracts`)

- Título "Contracts" e subtítulo "Manage customer contracts, signature requests, and reminders." (PT: "Gerencie contratos de clientes, solicitações de assinatura e lembretes.").
- Botão "New Contract".
- Campo de busca "Search by number or client..." (busca pelo número do contrato, pelo nome do cliente ou pelo local de trabalho).
- Filtro de status, com as opções "All statuses" (PT: "Todos os status"), "Draft", "Sent", "Viewed", "Signed", "Expired" e "Canceled".
- Tabela com as colunas:
  - "Number": número do contrato. Clique no cabeçalho para ordenar. Também é possível ordenar por "Client/Address", "Status" e "Expires".
  - "Client/Address": nome do cliente e local de trabalho ou endereço.
  - "Status": etiqueta colorida com o status atual (ver seção de status).
  - "Expires" (PT: "Expira"): data de validade e, abaixo, o tempo restante: "1 day left", "N days left" ou "Expired".
  - "Actions": menu com três pontinhos.
- Quando não há contratos: "No contracts found." (PT: "Nenhum contrato encontrado.").

Itens do menu de ações de cada contrato:

- "Timeline" (PT: "Linha do tempo"): abre a linha do tempo, com o título "Timeline - Contract #número".
- "Download PDF" (PT: "Baixar PDF"): baixa o PDF do contrato. Se não houver PDF pronto, aparece "No PDF available for this contract.".
- "Send Reminder" (PT: "Enviar lembrete"): abre a janela de envio para reenviar o contrato ao cliente. Desabilitado para contratos assinados ou cancelados.
- "Edit": abre o assistente de edição. Desabilitado para contratos assinados ou cancelados.
- "Cancel": cancela o contrato. Desabilitado para contratos assinados ou cancelados.
- "Delete": exclui o contrato. Desabilitado para contratos assinados.

### Assistente de criação e edição (`/contracts/new`)

O assistente tem dois passos, mostrados como abas no topo: "Documents" (PT: "Documentos") e "Signature Request" (PT: "Solicitação de Assinatura").

Antes de começar um contrato novo, aparece a janela "Let's get started", com a mensagem "Select a customer to send a contract for e-signature.". O botão "Continue" abre a escolha do cliente. Sem cliente escolhido, a tela volta para a lista.

**Passo 1 – Documents**

- Área "Upload Documents", com o aviso "Acceptable file format: PDF" (PT: "Formato de arquivo aceitável: PDF") e o limite "20MB max total" (PT: "Total máximo de 20 MB").
- Cada documento aparece em uma lista, com "Edit" e "Delete", e a quantidade de páginas.
- Bloco de autenticação, com o campo "Authentication method" (PT: "Método de autenticação"):
  - "No authentication": o cliente acessa só pelo link.
  - "Access code" (PT: "Código de acesso"): o cliente precisa digitar um código de 6 a 9 dígitos. A dica é "Enter 6 to 9 digits to continue.".

**Passo 2 – Signature Request**

- Bloco "Recipients" (PT: "Destinatários"), com o nome e o e-mail do cliente e a opção "Edit recipient" para trocar o cliente. A dica é "Confirm these details are correct for your client.".
- Área "Prepare signature fields", com o texto "Drag signature, date, and optional initials fields onto the PDF.".
- Campos disponíveis: "Signature" (PT: "Assinatura"), "Signature Date" (PT: "Data de Assinatura") e "Initials".
- Cada campo é atribuído a um signatário: "Company" ou "Client".
- "Expiration days": número de dias até o contrato expirar. O padrão é 7, e o mínimo é 1.
- "Signature style" (PT: "Estilo de assinatura") e "Change Style": escolhe a fonte da assinatura digitada entre "Allura", "Classic", "Great Vibes", "Marck Script", "Pacifico", "Parisienne" e "Sacramento".
- "Company signature text": texto opcional. Se vazio, usa a assinatura salva da empresa ou o nome da empresa.

**Botões do rodapé**

- "Back" e "Next".
- No último passo: "Save" e "Save And Send" (PT: "Salvar e enviar").

### Janela de envio ("Send Contract" / "Send Contract Reminder")

- Título "Send Contract" (PT: "Enviar contrato") ou "Send Contract Reminder" (PT: "Enviar lembrete de contrato").
- "Recipient Emails" (PT: "E-mails do destinatário"), obrigatório. Aceita vários e-mails separados por vírgula.
- "CC" e "BCC" (opcionais).
- "Subject", com o padrão "{company} - Contract #{number}".
- "Email Body" (PT: "Corpo do e-mail"), com o padrão "Please review and sign Contract #{number}.". O texto aparece no centro do e-mail.
- "Send me a copy" (PT: "Envie-me uma cópia"): envia uma cópia para você.
- "Attachments": "Automatic Attachment" (PT: "Anexação automática") com o PDF do contrato. Se houver código de acesso, aparece "Authentication code included" (PT: "Código de autenticação incluído").
- Botões "Cancel" e "Send Contract" (ou "Send Reminder", PT: "Enviar lembrete").

### Linha do tempo do contrato

Abre a janela "Timeline - Contract #número", com os eventos registrados. Os nomes exibidos são: "Contract Created" (PT: "Contrato criado"), "Contract Updated" (PT: "Contrato atualizado"), "Contract Sent" (PT: "Contrato enviado"), "Client Viewed" (PT: "Cliente visualizado"), "Client Signed" (PT: "Cliente assinado"), "Contract Canceled" (PT: "Contrato cancelado") e "Delivery Failed" (PT: "Falha na entrega").

### Página do cliente para assinar (`/contract-response/:publicToken`)

- Se houver código de acesso: "Authentication required" (PT: "Autenticação necessária"), com o texto "Enter the code included in the contract email." (PT: "Insira o código incluído no e-mail do contrato."), o campo "Authentication code" (PT: "Código de autenticação") e o botão de continuar. Código certo: "Code verified." (PT: "Código verificado."). Código errado: "Invalid authentication code." (PT: "Código de autenticação inválido." – texto da mensagem de erro).
- Visualização do PDF, com "Download" e o botão "Sign Contract" (PT: "Assinar Contrato").
- Janela de assinatura, com "Signature" (PT: "Assinatura"), "Type signature" (PT: "Tipo de assinatura"), o campo "Type your signature name", o botão "Use Typed Signature" e a escolha do estilo de fonte, com a prévia da assinatura.
- Depois de assinar: "Contract Signed" (PT: "Contrato assinado") e "Thank you for signing the contract. A signed copy will be available to the company." (PT: "Obrigado por assinar o contrato. Uma cópia assinada estará disponível para a empresa.").
- Link inválido ou removido: "Contract Not Found" (PT: "Contrato não encontrado") e "The contract link is invalid or no longer available." (PT: "O link do contrato é inválido ou não está mais disponível.").

## Como fazer

### Como criar um contrato

1. No menu, abra "Contracts" e clique em "New Contract".
2. Escolha o cliente na janela "Let's get started" e clique em "Continue".
3. No passo "Documents", envie pelo menos um PDF em "Upload Documents" (até 20 MB no total).
4. Escolha o método de autenticação. Se for "Access code", digite o código de 6 a 9 dígitos.
5. Clique em "Next" para ir ao passo "Signature Request".
6. Confira o destinatário em "Recipients".
7. Arraste os campos "Signature", "Signature Date" e, se quiser, "Initials" para o PDF, atribuindo cada um a "Company" ou "Client". Os campos de assinatura e data da empresa e do cliente são obrigatórios.
8. Ajuste "Expiration days" e, se quiser, o texto da assinatura da empresa.
9. Clique em "Save" para salvar e voltar à lista, ou em "Save And Send" para salvar e abrir a janela de envio.

Mensagens: "Contract saved successfully." (PT: "Contrato salvo com sucesso.") e "Contract updated successfully." (PT: "Contrato atualizado com sucesso.").

Se faltar algo, o botão "Next" fica desabilitado. Ao tentar pular para um passo ainda não liberado, aparece "Please complete the current step before continuing.". Se faltar um campo de assinatura obrigatório, aparece "Company and Client signature/date fields are required.".

### Como enviar um contrato

1. Ao final da criação ou edição, clique em "Save And Send". A janela de envio abre logo depois de salvar.
2. Confira "Recipient Emails". Se houver mais de um destinatário, separe por vírgula.
3. Revise "Subject" e "Email Body". Ajuste se quiser.
4. Marque "Send me a copy" se quiser receber uma cópia.
5. Clique em "Send Contract".

Mensagem de sucesso: "Contract sent successfully." (PT: "Contrato enviado com sucesso."). Se um dos destinatários falhar, o envio registra "Delivery Failed" na linha do tempo.

### Como enviar um lembrete

1. Na lista, no menu de ações do contrato, escolha "Send Reminder".
2. Confira os destinatários e clique em "Send Reminder".

Mensagem: "Reminder sent successfully." (PT: "Lembrete enviado com sucesso.").

### Como editar um contrato

1. Na lista, no menu de ações, escolha "Edit".
2. Altere o que for necessário no assistente e clique em "Save" ou "Save And Send".

Contratos assinados ou cancelados não podem ser editados. Nesse caso, o sistema mostra "This contract cannot be edited.".

### Como cancelar um contrato

1. Na lista, no menu de ações, escolha "Cancel".
2. Confirme em "Cancel Contract #número?".

Mensagem: "Contract canceled." (PT: "Contrato cancelado."). Depois disso, o link do cliente deixa de aceitar a assinatura.

### Como excluir um contrato

1. Na lista, no menu de ações, escolha "Delete".
2. Confirme em "Delete Contract #número? This cannot be undone." (PT: "Excluir contrato #número? Isto não pode ser desfeito.").

Mensagem: "Contract deleted." (PT: "Contrato excluído.").

### Como baixar o PDF

1. Na lista, no menu de ações, escolha "Download PDF".
2. Se o contrato já foi assinado, o PDF baixado inclui as assinaturas.

### Como o cliente assina

1. O cliente abre o link recebido por e-mail.
2. Se houver código de acesso, digita o código e continua.
3. Revisa o PDF e clica em "Sign Contract".
4. Digita o nome para usar a assinatura digitada ("Use Typed Signature") ou escolhe um estilo de fonte.
5. A página mostra "Contract Signed".

## Status e ciclo de vida

Os status possíveis são seis. Os nomes abaixo são os exibidos na tela:

- **Draft** (PT: "Rascunho"): contrato salvo e ainda não enviado. Pode ser editado, enviado e excluído.
- **Sent** (PT: "Enviado"): enviado ao cliente por e-mail, ainda não aberto por ele.
- **Viewed** (PT: "Visualizado"): o cliente abriu o link do contrato antes da validade.
- **Signed** (PT: "Assinado"): o cliente assinou. Fica travado: não pode ser editado, cancelado nem excluído.
- **Canceled** (PT: "Cancelado"): cancelado pela empresa. Não pode ser assinado nem editado.
- **Expired** (PT: "Expirado"): a data de validade passou sem assinatura nem cancelamento. A tela mostra "Expired" quando a validade já passou e o contrato não foi assinado nem cancelado.

Fluxo típico: Draft → Sent → Viewed → Signed. O contrato também pode ir para Canceled a qualquer momento antes de ser assinado, ou para Expired se a validade passar.

## Regras de negócio

### Documentos e validações

- É obrigatório anexar pelo menos um PDF. Só são aceitos arquivos PDF, com no máximo 20 MB no total. Mensagens: "At least one PDF document is required", "Only PDF files are allowed" e "The total PDF upload size cannot exceed 20MB".
- O código de acesso, quando usado, precisa ter de 6 a 9 dígitos. Mensagem: "Authentication code must contain 6 to 9 digits".
- A validade ("Expiration days") precisa ser maior que zero. Mensagem: "Expiration days must be greater than zero".
- Precisa haver campos de assinatura da empresa e do cliente (assinatura e data) antes de salvar.
- O cliente é obrigatório.

### Validade e expiração

- A data de validade é calculada somando os "Expiration days" à data de criação do contrato.
- Ao editar um contrato, a validade é recalculada a partir da data de criação. Se a nova data ainda estiver no passado, o contrato continua expirado.
- Um contrato expirado não pode ser enviado: "This contract cannot be sent". Para voltar a enviá-lo, edite o contrato e aumente os dias de validade, de forma que a nova data fique no futuro. O status "Expired" é calculado pela data de validade; ele não é escolhido pelo usuário.
- O link do cliente não aceita assinatura depois da validade: "Contract link has expired".

### Quem pode o quê

- Acesso à lista e ao assistente: quem tem a permissão "Contracts".
- O cliente assina sem login, apenas pelo link (e pelo código, se houver).

### Envio e reenvio

- O envio só é feito se houver pelo menos um e-mail válido. Mensagens: "Recipient email is required" e "Please enter at least one valid recipient email.".
- Ao menos um envio bem-sucedido muda o status para "Sent".
- Contratos assinados, cancelados ou expirados não podem ser enviados.

### Abertura pelo cliente

- Ao abrir o link de um contrato em "Sent" (e ainda dentro da validade), o status muda para "Viewed" e o evento "Client Viewed" é registrado.

### Assinatura

- O cliente precisa digitar o nome para criar a assinatura. Sem assinatura, aparece "Signature is required".
- Ao assinar, o contrato fica como "Signed", a data da assinatura é registrada e o PDF final é gerado com as assinaturas.
- No fluxo de assinatura analisado, não há envio automático de e-mail no momento da assinatura. A empresa acompanha o resultado pela lista e pela linha do tempo.

### Exclusão e cancelamento

- Contratos assinados não podem ser excluídos: "Signed contracts cannot be deleted". Também não podem ser cancelados: "Signed contracts cannot be canceled".
- Cancelar um contrato registra "Contract Canceled" na linha do tempo.

### Numeração

- Cada contrato recebe um número próprio da empresa, gerado automaticamente em sequência. O número aparece na coluna "Number" e nos títulos.

### Textos de apresentação e termos

- O texto de apresentação ("Introduction Letter") e os termos incluídos nos contratos são configurados em Settings, na aba "Policies & Terms" (seção "Contract Terms & Policies"). Veja "Configurações: Stripe e QuickBooks".

## Relação com outros módulos

- **Clientes**: todo contrato é de um cliente. O e-mail e o nome do cliente são usados no envio.
- **Locais de trabalho (Work Sites)**: o contrato pode estar ligado a um local de trabalho, que aparece na coluna "Client/Address".
- **Configurações (Settings)**: texto de apresentação e termos dos contratos ficam na aba "Policies & Terms".
- **Faturas**: o contrato é independente das faturas. Não há cobrança automática vinculada a ele.

## Dúvidas frequentes

**P:** Por que o botão "Next" está desabilitado?
**R:** No passo "Documents", é preciso ter pelo menos um PDF, e, se o método for "Access code", o código precisa ter de 6 a 9 dígitos.

**P:** Por que não consigo salvar o contrato?
**R:** Os campos de assinatura e data da empresa e do cliente são obrigatórios. Arraste esses campos para o PDF e tente de novo.

**P:** O cliente disse que o link não funciona. O que pode ser?
**R:** O contrato pode ter expirado, sido cancelado ou já estar assinado. Confira o status na lista. Se o contrato expirou, aumente a validade na edição e reenvie.

**P:** Como sei se o cliente abriu o contrato?
**R:** Quando o cliente abre o link pela primeira vez, o status vira "Viewed" e aparece "Client Viewed" na linha do tempo.

**P:** Posso editar um contrato depois de enviado?
**R:** Sim, enquanto ele não estiver assinado nem cancelado. Depois de salvar as alterações, reenvie o contrato, se necessário.

**P:** Posso excluir um contrato assinado?
**R:** Não. Contratos assinados não podem ser excluídos nem cancelados.

**P:** Como coloco um código de acesso?
**R:** No passo "Documents", escolha "Access code" em "Authentication method" e digite de 6 a 9 dígitos. O código vai junto com o e-mail de envio.

**P:** Como o cliente sabe que a assinatura foi concluída?
**R:** A página do cliente mostra "Contract Signed". Você pode baixar o PDF assinado pela lista, no menu de ações.
