---
title: Ordens de alteração (Change Orders)
module: projects
routes: [/seller/project/details/:id, /changeorder-response/:changeOrderId]
---

# Ordens de alteração (Change Orders)

## Para que serve

Uma **Ordem de Alteração** (Change Order) é um pedido formal para adicionar trabalhos extras a um projeto que já tem orçamento. Ela lista os serviços adicionais, o valor total e a qual orçamento pertence. Depois que o cliente aprova (assinando) ou que a empresa registra a aprovação manual, os serviços são incorporados ao orçamento do projeto.

Use a ordem de alteração quando o cliente pedir algo que não estava no escopo original. Assim, o aceite fica registrado, com número, valor e assinatura.

## Onde encontrar

- Dentro da página de detalhes de um projeto (veja o arquivo de detalhes do projeto), na aba **"Change Orders"** (em português, "Ordens de Alteração").
- Endereço da página do projeto: `/seller/project/details/:id`. A aba fica entre "Invoice" e "Services".
- Também é possível chegar à aba pelo botão **"New change order"** (Nova Ordem de Alteração), na aba "Services" de um projeto.
- Quem vê: quem tem acesso à página do projeto, ou seja, a permissão **"Projects"**.
- O cliente não precisa de login para aprovar. Ele acessa a página de aprovação por um link enviado por e-mail (descrita abaixo).

## O que aparece na tela

### Aba Change Orders

- Botão **"Create Change Order"** (Criar Ordem de Alteração). Ele fica desabilitado enquanto o projeto ou a lista está carregando.
- Campo de busca **"Search by number or estimate..."** (Pesquisar por número ou orçamento...).
- Tabela com estas colunas:
  - **Number** (Número): número sequencial da ordem, por exemplo "#3".
  - **Estimate** (Orçamento): orçamento ao qual a ordem está ligada.
  - **Services** (Serviços): quantidade de itens.
  - **Created** (Criado): data de criação.
  - **Total**: valor total da ordem.
  - **Status**: etiqueta de status (veja a seção de status abaixo).
  - **Client Signature** (Assinatura do Cliente): situação da assinatura.
  - Coluna de ações, com um menu de três pontos.
- Ao clicar nos títulos das colunas, a lista é ordenada.
- Mensagens de lista vazia: "No change orders yet" (Ainda não há pedidos de alteração), com o texto "Create your first change order to track additional work" (Crie sua primeira Ordem de Alteração para acompanhar trabalhos adicionais). Se a busca não encontrar nada: "No change orders match your search." (Nenhum pedido de alteração corresponde à sua pesquisa.)

### Etiquetas de status

- **Pending** (Pendente): ainda não aprovada.
- **Approved** (Aprovado): aprovada pelo cliente ou pela empresa.
- **Canceled** (Cancelado): cancelada.

### Coluna "Client Signature" (Assinatura do Cliente)

- Traço "—": a ordem ainda está pendente.
- Etiqueta **Pending** (Pendente): a ordem foi aprovada, mas ainda exige assinatura do cliente.
- Etiqueta **Signed** (Assinado): a assinatura do cliente (ou a aprovação manual) foi registrada.

### Menu de ações (três pontos)

- **Edit** (Editar): disponível só para ordens pendentes. Abre a edição da ordem.
- **Manual Approval** (Aprovação manual): disponível para ordens pendentes e para ordens aprovadas que ainda aguardam assinatura.
- **Remove Client Signature** (Remover assinatura do cliente): disponível para ordens aprovadas com assinatura já registrada.
- **Download PDF** (Baixar PDF): baixa o PDF da ordem.
- **Send Email** (Enviar e-mail): abre a janela de envio ao cliente.
- **Delete** (Excluir): disponível para ordens pendentes e canceladas.

## Como fazer

### Como criar uma ordem de alteração

1. Abra o projeto e vá para a aba "Change Orders". Clique em "Create Change Order" (ou em "New change order", na aba Services).
2. **Selecionar o orçamento**: escolha em qual orçamento a ordem vai se basear. Podem ser orçamentos **pendentes ou aprovados**. Se não houver nenhum, aparece "No pending or approved estimates found for this project." (Nenhum orçamento pendente ou aprovado encontrado para este projeto.). Nesse caso, crie ou aprove um orçamento na aba "Estimates" (Orçamentos) antes.
3. **Montar os serviços**: a janela "New Change Order" (Nova Ordem de Alteração) mostra "Services & Items" (Serviços e itens) e o total. Clique em **"Add Service"** (Adicionar serviço) e escolha:
   - "Existing Service" (Serviço Existente): um serviço do catálogo;
   - "Custom Service" (Serviço personalizado): um serviço digitado por você.
4. Para cada item, é possível alterar quantidade e preço, ou remover o item (a remoção pede confirmação com "Are you sure you want to remove this service?").
5. Clique em **"Preview"** (Visualizar) se quiser conferir o documento antes de salvar.
6. Clique em **"Save"** (Salvar) para criar a ordem, ou em **"Create & Send"** (Criar e enviar) para criar e já abrir a janela de envio ao cliente.

Pelo menos um serviço é obrigatório. Sem ele, aparece "Please add at least one service" (Adicione pelo menos um serviço).

### Como enviar a ordem ao cliente por e-mail

1. Na aba "Change Orders", clique nos três pontos da ordem e escolha **"Send Email"** (ou use "Create & Send" ao criar).
2. Na janela "Send Change Order" (Enviar pedido de alteração), informe o **"Recipient Email"** (E-mail do destinatário). Ele é obrigatório. Por padrão, o e-mail do cliente do projeto é sugerido.
3. Opcionalmente, informe o **"Client name (optional)"** (Nome do cliente), que aparece no e-mail.
4. Se quiser, anexe até 10 arquivos (imagens ou PDF).
5. Confira a seção "Email Preview" (Visualização de e-mail) e a lista "What will be sent?" (O que será enviado?).
6. Clique em "Send Email" (Enviar e-mail).

O e-mail tem o assunto **"Change Order Request: Additional items for Project #N"**, traz o número da ordem, o orçamento e o valor adicional, e inclui o PDF da ordem em anexo. O botão do e-mail é **"View Change Order"** (Ver ordem de alteração), que abre a página de aprovação do cliente. Enviar o e-mail **não muda** o status da ordem.

### Como o cliente aprova (página de aprovação)

1. O cliente abre o link recebido por e-mail. A página é a da ordem de alteração, sem login.
2. A página mostra o documento com número, orçamento, cliente, supervisor, projeto, tabela de serviços ("Services" e "Amount") e o "TOTAL".
3. Se a ordem estiver pendente, aparece o botão **"Accept & Sign"**. Ao clicar, abre a janela **"Sign Change Order"** (Assinar ordem de alteração), com uma área para desenhar a assinatura.
4. Depois de assinar e confirmar, a página mostra a mensagem: "Thank you for accepting the change order! The services will be added to your project." (Obrigado por aceitar a ordem de alteração! Os serviços serão adicionados ao seu projeto.)
5. Em caso de falha, aparece "Error saving signature. Please try again." (Erro ao salvar a assinatura. Tente novamente.)
6. O botão **"Download"** baixa o PDF em qualquer situação. Se o PDF não estiver disponível, aparece "PDF not available for this change order".

Depois de aprovada e assinada, a página mostra uma marca d'água "APPROVED" (Aprovado). Se a ordem estiver cancelada, mostra "CANCELED" (Cancelado). Nessa página não há botão para recusar a ordem.

### Como fazer a aprovação manual (sem o cliente assinar pelo sistema)

Use quando o cliente já aprovou por outro meio, como papel ou mensagem.

1. Na aba "Change Orders", clique nos três pontos da ordem e escolha **"Manual Approval"** (Aprovação manual).
2. Na janela, informe o **"Client name (optional)"**, que será usado na assinatura do PDF (limite de 50 caracteres). Se ficar em branco, o sistema usa o nome do cliente do projeto ou do contexto de trabalho.
3. Clique em **"Apply manual approval"**. A ordem é aprovada e a assinatura é aplicada ao PDF, sem enviar nada ao cliente.

### Como remover a assinatura do cliente

1. Nos três pontos da ordem aprovada e assinada, escolha **"Remove Client Signature"**.
2. Confirme. A área de assinatura é limpa e a ordem volta a exigir nova assinatura, do cliente ou por aprovação manual.
3. Aparece a mensagem "Client signature removed. Change order now requires a new signature." (Assinatura do cliente removida. A Ordem de Alteração agora requer uma nova assinatura.)

### Como editar ou excluir uma ordem

- **Editar**: somente com a ordem pendente. Use o item "Edit" do menu.
- **Excluir**: somente com a ordem pendente ou cancelada. Use o item "Delete". Ordens aprovadas não podem ser excluídas.

## Status e ciclo de vida

| Situação | Status | Assinatura |
|---|---|---|
| Recém-criada, aguardando cliente | Pending | — |
| Aprovada pelo cliente (assinou na página) | Approved | Signed |
| Aprovada manualmente pela empresa | Approved | Signed |
| Assinatura removida | Approved | Pending (aguarda nova assinatura) |
| Cancelada | Canceled | — |

Passagem de estados:

1. **Pendente → Aprovada**: quando o cliente assina ou a empresa faz a aprovação manual. Nesse momento os serviços são incorporados ao orçamento.
2. **Aprovada e assinada → Aprovada aguardando assinatura**: quando a assinatura é removida.
3. **Aprovada aguardando assinatura → Aprovada e assinada**: quando o cliente assina ou a aprovação manual é feita.
4. Ordens pendentes ou aprovadas não voltam a ser pendentes. Ordens canceladas podem ser excluídas.

## Regras de negócio

- **Número**: cada ordem recebe o próximo número livre, considerando as ordens já existentes do orçamento e do projeto. Por isso, os números são sequenciais dentro do projeto.
- **Total**: é a soma dos serviços listados na ordem.
- **Supervisor**: a ordem fica registrada em nome do usuário que a criou. Se o sistema não encontrar esse usuário, a criação falha com "Supervisor information not found" (Informações do supervisor não encontradas).
- **Efeito da aprovação** (pelo cliente ou manual): os serviços da ordem são adicionados ao final da lista de serviços do orçamento, na ordem em que foram cadastrados. O orçamento é marcado para ter o PDF atualizado.
- **Aviso à empresa**: quando o cliente assina pela página, a empresa recebe um e-mail com o assunto "APPROVED: Change Order #N added +valor to Estimate" (aprovada, com o valor adicionado ao orçamento).
- **Remoção de assinatura**: só troca o documento e a exigência de nova assinatura. Os serviços que já entraram no orçamento **não são removidos automaticamente**. Ajuste-os manualmente se for necessário.
- **Envio por e-mail**: não altera o status nem a assinatura da ordem.
- **Edição e exclusão**: a edição vale só para ordens pendentes. A exclusão vale para pendentes e canceladas.
- **Pesquisa e ordenação**: a busca considera o número da ordem e o orçamento.

## Relação com outros módulos

- **Estimates (Orçamentos)**: toda ordem de alteração pertence a um orçamento pendente ou aprovado. Ao ser aprovada, ela acrescenta serviços a esse orçamento.
- **Project details (Detalhes do projeto)**: a aba "Change Orders" faz parte da página do projeto. A aba "Services" tem um atalho para criar uma nova ordem.
- **Invoices (Faturas)**: o valor aprovado na ordem passa a fazer parte do escopo do projeto. A cobrança é feita pelo módulo de faturas.
- **E-mail**: o envio usa o e-mail do cliente e o link de aprovação.

## Dúvidas frequentes

**P:** Por que não consigo criar uma ordem de alteração?
**R:** Verifique se o projeto tem pelo menos um orçamento pendente ou aprovado. Se não tiver, crie ou aprove um orçamento na aba "Estimates" primeiro.

**P:** O cliente pode recusar a ordem pela página de aprovação?
**R:** Não há botão de recusa nessa página. O cliente pode apenas aceitar e assinar, ou baixar o PDF.

**P:** Enviei a ordem por e-mail, mas ela continua "Pending". Está certo?
**R:** Sim. Enviar o e-mail não aprova a ordem. A aprovação acontece quando o cliente assina na página ou quando você faz a aprovação manual.

**P:** O cliente aprovou por telefone. Como registro isso?
**R:** Use "Manual Approval" (Aprovação manual) nos três pontos da ordem. Informe o nome do cliente, se quiser, e confirme.

**P:** Removi a assinatura por engano. Como volto atrás?
**R:** A ordem volta a aguardar assinatura. O cliente pode assinar de novo pela página de aprovação, ou você pode fazer a aprovação manual.

**P:** Os serviços sumiram do orçamento depois que removi a assinatura. Por quê?
**R:** Eles não sumiram: a remoção da assinatura não desfaz a incorporação dos serviços ao orçamento. Se precisar, ajuste os serviços no orçamento manualmente.

**P:** Posso editar uma ordem já aprovada?
**R:** Não. A edição só é permitida para ordens pendentes. Para corrigir uma ordem aprovada, você precisa ajustar o orçamento ou criar outra ordem.

**P:** Por que não consigo excluir uma ordem?
**R:** Só é possível excluir ordens pendentes ou canceladas. Ordens aprovadas não podem ser excluídas.

**P:** Quem recebe o aviso quando o cliente aprova?
**R:** A empresa recebe um e-mail de aprovação, com o número da ordem e o valor adicionado ao orçamento.
