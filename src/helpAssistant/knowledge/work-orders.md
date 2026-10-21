---
title: Ordens de Serviço (Work Orders)
module: people
routes: [/seller/work-orders, /seller/work-orders/new, /seller/work-orders/:workOrderId, /work-order-response/:publicToken]
---

# Ordens de Serviço (Work Orders)

## Para que serve

A Ordem de Serviço (Work Order) é o documento que autoriza um colaborador ou um subcontratado a executar um trabalho em um projeto. Ela descreve o título e o escopo do trabalho, os serviços ou itens com quantidade e preço, o período (data de início e de término), o responsável (funcionário ou subcontratado) e as assinaturas. Você cria a ordem, gera um PDF, envia por e-mail e acompanha a assinatura do responsável até a aprovação. A ordem também pode ser cancelada ou excluída.

## Onde encontrar

- Menu lateral: grupo "Workflow", item "Work Orders".
- Lista: `/seller/work-orders`.
- Nova ordem: `/seller/work-orders/new` (botão "New Work Order"). Também é possível abrir a criação a partir de um projeto, que já vem com o projeto preenchido.
- Edição e detalhes de uma ordem: `/seller/work-orders/:workOrderId` (opção "Edit" no menu de ações da linha).
- Página de assinatura do responsável (pública, pelo link enviado por e-mail): `/work-order-response/:publicToken`. O responsável não precisa estar logado no SmartBuild para assinar por esse link.
- Quem vê: o item "Work Orders" aparece no menu sem uma permissão específica, e a lista é restrita à empresa do usuário logado. Para criar, editar, enviar, cancelar ou excluir, o usuário precisa ter acesso à empresa.

## O que aparece na tela

### Lista de ordens de serviço

- Título "Work Orders" e subtítulo "Manage, schedule, and track all work orders.".
- Botão "New Work Order".
- Cards de resumo, como "Total Work Orders" e "Approval rate".
- Busca "Search by number, project, or service..." e filtro de período ("Period": "This Month", "This Quarter", "This Year", "Last Month", "Last 30 Days", "Last 3 Months", "All Period") e de status.
- Filtros de status disponíveis: "Pending", "Approved" e "Canceled". Por padrão, os três estão marcados. Use "Reset Status" para voltar ao padrão.
- Tabela com as colunas:
  - "Number" (número da ordem; ordenável).
  - "Project / Address" (projeto e endereço; ordenável).
  - "Work" (título do trabalho).
  - "Status" (ordenável).
  - "Scheduled" (período agendado; ordenável).
  - Menu de ações da linha (ícone de três pontos).
- Mensagem quando não há resultados: "No work orders found." ou "No work orders match the selected filters.", se houver filtros aplicados.

### Menu de ações da linha ("Work Order Actions")

- "View Work Order": abre a visualização do PDF.
- "Timeline": abre a linha do tempo da ordem ("Timeline - Work Order #[número]").
- "Send By Email": envia ou reenvia por e-mail. Fica desabilitado para ordens canceladas.
- "Edit": abre a tela de edição.
- "Cancel": cancela a ordem (não aparece em ordens já canceladas).
- "Delete": exclui a ordem.

### Tela de criação e edição ("New Work Order" / "Edit Work Order")

Os campos e seções são:

- **Project / Location** ("Project / Location *"): escolha do projeto, com busca "Search number, client, or location...". Mostra o número e o endereço do projeto.
- **Assignment & Contact** ("Assigned to *"): escolha do responsável, que pode ser um funcionário ("Employee") ou um subcontratado ("Subcontractor"). Busca "Search employee or subcontractor...". Há o botão "New subcontractor" para cadastrar um subcontratado sem sair da ordem.
- **Work Order Details** ("Job title", "Scope of work"): título do trabalho e descrição do escopo.
- **Schedule & Management** ("Start Date *", "End Date *", "Project managers"): datas de início e término e gerentes de projeto ("Select project managers...", até 20). Há o aviso "Select a project first" se ainda não houver projeto.
- **Line Items** ("Services & Items", "Service / Item", "Qty", "Unit price"): lista de serviços ou itens. Use "Add new line" para incluir linhas (preencha e pressione Enter para salvar a linha).
- **Image Attachments** ("Anexos de imagem"): até 10 imagens.
- **Terms and conditions** ("Terms"): termos da ordem. Já vêm preenchidos com os termos padrão da empresa, e podem ser alterados nesta ordem.
- **Options**:
  - "Show service prices in PDF": desligue para ocultar preços unitários, valores e totais do PDF.
  - "Show client name to recipient": desligue para retirar o nome do cliente do PDF, do e-mail e da página de revisão.
- **Signatures** ("Signatures"): "Company Signature" (aplicada automaticamente a partir do perfil da empresa) e a assinatura do responsável ("Subcontractor Signature" ou "Employee Signature"), que é colhida pelo link seguro.
- Botões no rodapé: "Generate PDF" (gera e mostra o PDF), "Save" (salva sem enviar), "Create & Send" (ao criar) ou "Update & Send" (ao editar). Use "Download PDF" para baixar o arquivo.

### Página de assinatura do responsável

- Título com o número da ordem ("Work Order #[número]").
- Mensagem "Review the document before signing." e o documento em PDF, para leitura e download ("Download PDF").
- Botão "Approve & Sign", que abre a área de assinatura.
- Estados: "Pending signature" (aguardando), "Approved" (aprovada e assinada: "This work order has been signed and approved.") e "Canceled" ("This work order has been canceled.").
- Se o link não for válido ou a ordem não existir mais: "The link is invalid or the work order no longer exists."

## Status e ciclo de vida

- **Pending** (Pendente, "Pending signature" na página de assinatura): criada e aguardando a assinatura do responsável. Pode ser editada, reenviada, cancelada ou excluída.
- **Approved** ("Approved", Aprovada): o responsável assinou pelo link ou pelo aplicativo. Foi registrado o horário da aprovação e a assinatura do responsável. O PDF assinado passa a ser o documento oficial.
- **Canceled** ("Canceled", Cancelada): cancelada manualmente. Não pode mais ser enviada nem assinada.

Eventos de histórico (linha do tempo): criação, envio por e-mail (com o resultado de cada envio, "Email sent to [e-mail]." ou "Email to [e-mail] failed"), aprovação e cancelamento.

## Regras de negócio

### Criação e validação

- Para salvar, são obrigatórios: projeto, título, data de início, data de término, responsável e pelo menos um serviço ou item com nome. A data de término não pode ser anterior à data de início ("End date cannot be before start date").
- Limites: título com até 191 caracteres; nome de cada serviço com até 191 caracteres; até 20 gerentes de projeto; até 10 imagens anexadas.
- Mensagem quando faltam campos: "Complete the required fields before creating the work order."
- O número da ordem é gerado em sequência para cada empresa.
- Ao criar, a ordem é gravada como "Pending". Se o e-mail não for enviado, a ordem continua criada e a tela avisa: "Work order #[número] was created, but the email was not sent".

### Assinatura da empresa

- A assinatura da empresa é aplicada automaticamente a partir do perfil da empresa ao criar ou atualizar a ordem. Para mudar a assinatura, altere o perfil da empresa.

### Envio por e-mail

- O envio usa o PDF gerado na tela. O destinatário padrão é o e-mail do responsável ("Assigned to"). Você pode escolher outro e-mail e adicionar uma mensagem opcional ("Add an optional message...").
- O e-mail inclui o PDF anexado e o link seguro para assinatura.
- Cada envio é registrado no histórico, com o destinatário e o resultado. Se houver falha, a tela mostra "Delivery Failed".
- Ordens canceladas não podem ser enviadas: "Canceled work orders cannot be sent".
- Ao reenviar uma ordem pendente, o PDF enviado passa a ser o documento de referência para a assinatura.

### Assinatura pelo responsável

- Subcontratado: assina pela página do link seguro, desenhando a assinatura. Ao assinar, a ordem passa para "Approved", o PDF assinado é gerado e a data da aprovação é registrada.
- Funcionário ("Employee"): assina pelo próprio acesso, na lista de ordens atribuídas a ele.
- Não é possível assinar uma ordem cancelada ("This work order has been canceled.").
- Não é possível assinar uma ordem que precisa ser reenviada, como uma ordem editada depois do último envio: a mensagem é "This work order must be sent again before it can be signed.".
- A assinatura precisa ser uma imagem (PNG ou JPG). Imagens grandes demais são recusadas com a mensagem "Signature image is too large".

### Edição

- Ao salvar alterações em uma ordem, ela volta para "Pending". As assinaturas e as datas de aprovação são apagadas. O PDF anterior é descartado, e é preciso reenviar a ordem.
- O link de assinatura antigo deixa de funcionar, porque um novo link é gerado. Quem recebeu o link anterior precisa receber o novo por meio do reenvio.
- Ao editar, use "Update & Send" para salvar e reenviar de uma vez.

### Cancelamento

- "Cancel Work Order" marca a ordem como cancelada. Ela não pode mais ser enviada nem assinada. O aviso é: "The work order will be marked as canceled and can no longer be sent or signed.".
- Não é possível cancelar uma ordem que já está cancelada ("Work order is already canceled").
- Cancelar não apaga a ordem. Ela continua na lista, com o filtro "Canceled".

### Exclusão

- "Delete" remove a ordem de forma permanente, junto com os arquivos e registros relacionados. A confirmação diz "This permanently removes the work order and its related records." e pede "Delete Permanently".
- Se quiser manter o histórico, cancele a ordem em vez de excluir.

### Ordem criada a partir de uma solicitação de proposta

- Quando uma proposta de subcontratado é aprovada em uma solicitação de proposta (Bid Request), o sistema cria a Ordem de Serviço para esse subcontratado, com os serviços da proposta. Ela aparece na lista como "Pending" e segue as regras acima. Veja a página de Solicitações de proposta.

## Como fazer

### Como criar uma ordem de serviço

1. Clique em "Work Orders" no menu e depois em "New Work Order".
2. Em "Project / Location", escolha o projeto.
3. Em "Assigned to", escolha o funcionário ou o subcontratado responsável. Se ele não estiver cadastrado, use "Create new subcontractor".
4. Preencha "Job title" e "Scope of work".
5. Defina "Start Date" e "End Date". Escolha os gerentes de projeto, se quiser.
6. Em "Line Items", adicione os serviços ou itens, com quantidade e preço unitário.
7. Revise os termos, as opções de exibição do PDF e as imagens, se houver.
8. Clique em "Save" para guardar sem enviar, ou em "Create & Send" para criar e enviar por e-mail.

### Como enviar uma ordem por e-mail

1. Na lista, abra o menu de ações da linha e escolha "Send By Email". Ou abra a ordem e use "Update & Send".
2. Confirme o destinatário (ou informe outro e-mail) e, se quiser, escreva uma mensagem.
3. Clique em "Send Email". A tela confirma com "Work order #[número] sent to [e-mail].".

### Como editar uma ordem

1. Na lista, abra o menu de ações da linha e escolha "Edit".
2. Altere os dados e clique em "Update & Send" (ou "Save").
3. Lembre-se: a ordem volta para "Pending" e precisa ser reenviada para ser assinada.

### Como acompanhar a assinatura

1. Na lista, abra o menu de ações e escolha "Timeline" para ver o histórico de envios e aprovações.
2. Ou filtre a lista por "Approved" ou "Pending".

### Como cancelar uma ordem

1. Na lista, abra o menu de ações da linha e escolha "Cancel".
2. Confirme em "Cancel Work Order". Para desistir, clique em "Keep Work Order".

### Como excluir uma ordem

1. Na lista, abra o menu de ações da linha e escolha "Delete".
2. Confirme em "Delete Permanently". A ação não pode ser desfeita.

### Como assinar uma ordem (responsável)

1. Abra o link recebido por e-mail.
2. Leia o documento e, se quiser, baixe o PDF.
3. Clique em "Approve & Sign" e desenhe a sua assinatura.
4. Confirme. A página mostra "This work order has been signed and approved.".

### Como ajustar os termos padrão

Os termos padrão da empresa são configurados na área de termos de contrato da empresa. Ao criar uma ordem, esses termos já vêm preenchidos, e podem ser alterados apenas naquela ordem.

## Relação com outros módulos

- **Projects**: toda ordem está ligada a um projeto. O endereço e o número do projeto aparecem no documento.
- **Subcontractors**: subcontratados podem ser responsáveis pela ordem. Eles são cadastrados na tela de Subcontratados e podem ser criados a partir da própria ordem.
- **Employees** (Funcionários e usuários): funcionários podem ser responsáveis pela ordem e assinam pelo próprio acesso.
- **Bid Requests** (Solicitações de proposta): a aprovação de uma proposta cria a ordem.
- **Clients**: o nome do cliente aparece no documento, a menos que a opção "Show client name to recipient" esteja desligada.
- **Time Cards e Schedule**: o período da ordem serve de referência para o agendamento do trabalho.

## Dúvidas frequentes

**P:** Por que o botão "Create & Send" não funciona?
**R:** Falta algum campo obrigatório: projeto, título, data de início, data de término, responsável ou pelo menos um serviço com nome. Também é necessário que a data de término não seja anterior à de início.

**P:** A ordem foi criada, mas o e-mail não chegou. O que faço?
**R:** A ordem continua criada, em "Pending". Abra o menu de ações e escolha "Send By Email" para reenviar. Verifique o endereço do responsável antes.

**P:** Posso alterar uma ordem que já foi assinada?
**R:** Pode, mas ao salvar a alteração a ordem volta para "Pending", as assinaturas são removidas e é preciso reenviar para nova assinatura.

**P:** Por que o responsável não consegue assinar?
**R:** Pode ser que a ordem tenha sido cancelada, que precise ser reenviada depois de uma edição, ou que o link seja antigo. Reenvie a ordem para que um novo link seja gerado.

**P:** Como faço para o PDF não mostrar os preços?
**R:** Desligue a opção "Show service prices in PDF" antes de gerar ou enviar a ordem.

**P:** Como faço para não mostrar o nome do cliente?
**R:** Desligue "Show client name to recipient". O nome sai do PDF, do e-mail e da página de revisão.

**P:** Qual é a diferença entre cancelar e excluir?
**R:** Cancelar mantém a ordem na lista com o status "Canceled", e ela deixa de poder ser enviada ou assinada. Excluir remove a ordem de forma permanente.

**P:** Quem assina a parte da empresa?
**R:** A assinatura da empresa é aplicada automaticamente a partir do perfil da empresa.

**P:** Quantas imagens posso anexar?
**R:** Até 10 imagens por ordem, e até 20 gerentes de projeto.

**P:** Uma ordem criada a partir de uma proposta pode ser editada?
**R:** Sim, como qualquer outra ordem. Lembre-se de que a edição faz a ordem voltar para "Pending" e exige novo envio.
