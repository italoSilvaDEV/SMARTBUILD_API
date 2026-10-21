---
title: Solicitações de proposta (Bid Requests)
module: people
routes: [/seller/bid-requests, /seller/bid-requests/new, /seller/bid-requests/:bidRequestId, /bid-request-response/:publicToken]
---

# Solicitações de proposta (Bid Requests)

## Para que serve

A tela "Bid Requests" serve para pedir orçamentos (propostas) de subcontratados para um projeto. Você descreve o escopo, lista os serviços ou itens que quer que sejam orçados, escolhe os subcontratados convidados e define um prazo de resposta. Cada subcontratado recebe um link seguro, por e-mail, para enviar a proposta com os seus preços. Quando você compara as propostas e escolhe uma, o sistema cria automaticamente uma Ordem de Serviço (Work Order) para o subcontratado vencedor.

## Onde encontrar

- Menu lateral: grupo "Financials", item "Bid Requests". Também aparece no menu "Bid Requests" da área de cadastro.
- Lista: `/seller/bid-requests`.
- Nova solicitação: `/seller/bid-requests/new` (botão "New Bid Request").
- Detalhes de uma solicitação: `/seller/bid-requests/:bidRequestId` (clique na linha da lista).
- Página do subcontratado (pública, pelo link enviado por e-mail): `/bid-request-response/:publicToken`. O subcontratado não precisa estar logado no SmartBuild para responder.
- Quem vê: a tela de solicitações não tem uma permissão específica no menu. Quem usa a tela de Bid Requests é o usuário logado da empresa, e a empresa só enxerga as solicitações da própria empresa.

## O que aparece na tela

### Lista de solicitações

- Título "Bid Requests" e subtítulo "Request, compare, and award subcontractor bids for your projects.".
- Botão "New Bid Request".
- Quatro cards de resumo: "Pending", "Finalized", "Canceled" (quantidade de solicitações em cada status) e "Responses Received" (quantidade de propostas recebidas no total).
- Campo de busca "Search bid requests..." (busca por número BR-, nome do projeto e título) e filtro de status "All statuses".
- Tabela com as colunas "Request", "Title", "Status", "Deadline", "Subcontractors" (ou "Responses") e "Address", com o botão "View details" em cada linha.
- Quando não há solicitações: "No bid requests found.".

### Tela de nova solicitação ("New Bid Request")

Subtítulo: "Create the request and invite subcontractors from a single form.". Seções:

- **Request details** ("Choose the project and define the scope of the request."): "Project" (campo "Select a project..."), "Request title" (exemplo: "Cabinetry & millwork"), "Scope of work" e "Response deadline".
- **Services & Items** ("Add the services or items the subcontractors should price."): lista de "Service / Item" com "Qty" (quantidade), "Suggested value" e o total "Total suggested budget". Botões "Add new line" e "Search service or item".
- **Select subcontractors** ("Recipient groups", "Without category", "Manage categories"): escolha dos subcontratados que vão receber a solicitação. Você pode organizá-los em grupos por categoria.
- **Photos, files & message** ("Add supporting documents, links, and the invitation message."): "Photos and documents" (até 20 arquivos), "External folder link" e "Message to subcontractors (optional)".
- Rodapé: "Required fields are marked with an asterisk.", o botão "Save" (salva sem enviar) e o botão "Create & Send" (cria e envia os e-mails).

### Tela de detalhes da solicitação

- Título "BID REQUEST BR-[número]" e o status ("Pending", "Finalized" ou "Canceled").
- Indicadores: "Responses received" (exemplo: "2 of 5"), "Response rate" (percentual de respostas) e "Suggested budget" (orçamento sugerido).
- Botões de ação no topo (ver "Status e ciclo de vida" e "Como fazer"): "Send / Remind", "Invite subcontractors", "Cancel Bid Request" e "Reopen Bid Request".
- Seção "Recipients" (destinatários): cada subcontratado com o status da resposta, o horário de envio ("Sent [data]") e, quando houver, a proposta enviada.
- Seção de propostas ("Subcontractor proposals" / "Proposal breakdown"): as propostas com "Proposal total", "Subtotal", "Qty", "Unit price" e a diferença em relação ao "Suggested budget" ("Budget difference"). Ordenação "Sort by lowest price" / "Sort by highest price". Destaque para "Lowest proposal".
- Atividades da solicitação ("Submission timeline"): linha do tempo com o envio, as respostas e a seleção.

### Página do subcontratado (resposta)

- Título "Bid Request BR-[número]" com o nome do projeto e a "Response deadline".
- Descrição "Review the requested services, enter your prices, or add services required by your budget.".
- Lista de serviços solicitados, com campos "Your unit price" e "Qty", e o botão "Add service" para incluir serviços extras, com o nome e a descrição. Campo "Notes" (opcional) para esclarecimentos, exclusões e prazos.
- Total ("Proposal total") e o botão "Submit proposal" ("Sending your proposal" enquanto envia).

## Status e ciclo de vida

### Status da solicitação

- **Pending** ("Pending"): aberta para respostas. Pode ser enviada, convidada, cancelada e ter propostas aprovadas.
- **Finalized** ("Finalized"): encerrada. Acontece quando (a) uma proposta é aprovada, ou (b) o prazo de resposta passa sem que nenhuma proposta seja aprovada. Nesse caso, a página do subcontratado mostra "Response period finalized".
- **Canceled** ("Canceled"): cancelada manualmente. Não aceita mais propostas.

### Status de cada subcontratado (destinatário)

- **Awaiting** (Aguardando): ainda não respondeu. Mostrado como "Awaiting" (em português, "Aguardando").
- **Proposal received** ("Proposal received", em português "Proposta recebida"): enviou a proposta.
- **Approved** ("Approved", "Aprovado"): a proposta dele foi escolhida. Uma Ordem de Serviço foi criada para ele.
- **Not selected** ("Not selected", "Não selecionado"): outra proposta foi escolhida.
- **Finalized** ("Finalized", "Finalizado"): o prazo passou sem resposta. Aparece como "Expired" internamente, mas é exibido como "Finalized" para o usuário.

### Status de envio

Cada destinatário também tem o estado de envio do e-mail: "Not sent" (Não enviado), "Sent [data]" (Enviado em [data]) ou "Send failed" (Falha no envio).

## Regras de negócio

### Criação

- Para criar, são obrigatórios: projeto, título, escopo ("Scope of work"), prazo de resposta, pelo menos um serviço com nome e pelo menos um subcontratado. Sem eles, o botão "Create & Send" fica desabilitado.
- Ao escolher o projeto, os serviços do projeto são copiados para a lista de itens, com a quantidade e o valor sugerido. Você pode alterar, remover ou adicionar itens.
- Limites: até 250 itens por solicitação, até 100 subcontratados por solicitação e até 20 anexos (fotos e documentos).
- Cada serviço precisa ter nome ("Every service must have a name.").
- O prazo de resposta é uma data. Ela vale até o fim do dia escolhido (23:59).
- Ao salvar com "Save", a solicitação é criada como "Pending", mas não é enviada aos subcontratados. Ao escolher "Create & Send", ela é criada e os e-mails são enviados imediatamente.
- O número BR- é gerado automaticamente em sequência, para cada empresa.

### Envio e lembretes

- O e-mail enviado tem o assunto "Bid Request #[número] from [nome da empresa]" e inclui o nome do projeto, o prazo e o botão para responder pelo link seguro. A mensagem opcional informada pelo usuário aparece no e-mail.
- Cada subcontratado recebe um link próprio e seguro.
- "Send / Remind" reenvia o e-mail para os subcontratados escolhidos. Ele permite escrever um lembrete ("Add a reminder or instructions for the selected subcontractors...").
- Se o envio falhar para todos os destinatários, o sistema informa que a solicitação não pôde ser enviada. Se só alguns falharem, os que deram erro ficam com "Send failed" e podem ser reenviados depois.
- Uma solicitação só pode ser enviada enquanto está "Pending". Se o prazo já passou, ela é finalizada automaticamente, e o envio é recusado com a mensagem de prazo vencido.

### Convites depois da criação

- Em "Invite subcontractors" você adiciona mais subcontratados à solicitação. Há a opção "Send invitation now" (marcada por padrão, pode ser desmarcada para enviar depois) e uma mensagem opcional.
- Subcontratados já adicionados aparecem como "Already added" e não podem ser escolhidos de novo.
- Também é possível criar um subcontratado novo nesse momento ("New subcontractor").

### Resposta do subcontratado

- A página de resposta mostra os serviços solicitados. O subcontratado informa o preço unitário de cada um e pode adicionar serviços extras ("Add service").
- Cada item precisa ter nome, e o preço não pode ser negativo. A resposta aceita até 250 itens.
- Ao enviar, o sistema registra a proposta com o total, as notas e a data do envio. Se o subcontratado enviar de novo enquanto a solicitação estiver aberta, a nova versão substitui a anterior.
- A resposta não é aceita quando a solicitação está encerrada, cancelada ou quando o prazo passou. Nesses casos aparece "This bid request is closed." ou "The response deadline has passed and this Bid Request is no longer accepting new proposals or updates.".
- Depois que o subcontratado é aprovado ou não selecionado, a página mostra "Proposal approved" ou "Not selected", e não permite mais enviar.

### Propostas recebidas fora do SmartBuild

- Para quem respondeu por outro canal (e-mail, telefone, papel), é possível registrar a proposta em "Record proposal" (ou "Enter proposal") no destinatário que ainda está "Awaiting" ou "Finalized". Ela aparece como "Admin entered" (preenchida pelo administrador).
- Também é possível importar um orçamento em PDF ou DOCX (até 100 MB) com "Upload estimate with AI". A IA lê o documento e prepara o subcontratado, os itens, as quantidades e os preços para revisão. Você sempre revisa antes de salvar. Se a leitura falhar, é possível continuar com a entrada manual ("Enter manually").
- Proposta de subcontratado aprovado não pode ser substituída.
- Não é possível registrar proposta em solicitação cancelada ou já encerrada por aprovação.

### Aprovação de uma proposta

- Só é possível aprovar uma proposta enviada ("Proposal received") em solicitação "Pending" ou em solicitação "Finalized" pelo prazo, desde que ainda não tenha proposta aprovada.
- Ao aprovar ("Approve & Create Work Order"), o sistema:
  1. cria uma Ordem de Serviço (Work Order) em status pendente, atribuída ao subcontratado escolhido, com os serviços da proposta e o título e escopo da solicitação;
  2. marca a proposta escolhida como "Approved" e as demais como "Not selected";
  3. finaliza a solicitação.
- Aviso exibido antes de confirmar: "Other proposals will be marked as not selected. This action creates a new Work Order from the submitted services."
- Depois da aprovação, o botão "View Work Order" leva à Ordem de Serviço criada.

### Cancelamento

- Só é possível cancelar uma solicitação "Pending". O aviso é: "Subcontractors will no longer be able to submit proposals.".
- Após cancelar, a solicitação fica "Canceled" e não pode ser reaberta.

### Prazo e reabertura

- Solicitações "Pending" mostram os botões de envio e cancelamento.
- Depois que a solicitação deixa de estar "Pending" (finalizada), o botão "Reopen Bid Request" permite escolher um novo prazo futuro ("Save deadline"). Subcontratados sem resposta voltam a poder enviar proposta.
- Não é possível reabrir:
  - solicitação cancelada ("Canceled Bid Requests cannot be reopened. Create a new request.");
  - solicitação que já tem proposta aprovada e Ordem de Serviço ("A proposal was awarded and a Work Order was created. Create a new Bid Request instead.");
  - solicitação finalizada por outro motivo, quando o prazo ainda não passou.
- Ao reabrir, é possível avisar os subcontratados sem resposta ("Notify unanswered subcontractors"), com o link já existente e o novo prazo. Se algum e-mail falhar, o prazo é salvo mesmo assim, e a tela informa quantos e-mails não saíram.
- Propostas já recebidas não são alteradas ao reabrir.

### Categorias de destinatários

- Os subcontratados podem ser agrupados por categoria ("Recipient groups"). A categoria de cada um pode ser definida ou trocada com "Set category" / "Change category".
- O botão "Manage categories" permite criar, renomear, arquivar e restaurar categorias. Categorias arquivadas não podem ser escolhidas em novas solicitações.
- Subcontratados também podem ser colocados em "Without category".

## Como fazer

### Como criar uma solicitação de proposta

1. Acesse "Bid Requests" no menu e clique em "New Bid Request".
2. Em "Request details", escolha o projeto em "Select a project...". Os serviços do projeto são copiados para a lista.
3. Preencha "Request title" e "Scope of work". Defina o "Response deadline".
4. Em "Services & Items", revise os itens: ajuste o nome, a quantidade e o "Suggested value". Use "Add new line" para incluir mais itens e o ícone de remoção para tirar algum.
5. Em "Select subcontractors", escolha quem vai receber. Você pode usar "Add subcontractor" para cadastrar um novo.
6. Se quiser, anexe fotos e documentos (até 20), informe um link de pasta externa e escreva a mensagem para os subcontratados.
7. Clique em "Save" para guardar sem enviar, ou em "Create & Send" para enviar agora.

### Como acompanhar e comparar as propostas

1. Na lista, clique em "View details" ou na linha da solicitação.
2. Veja o indicador de respostas e a tabela de destinatários com os status.
3. Compare as propostas pelo total e pela diferença em relação ao orçamento sugerido. Use a ordenação por preço, se quiser.

### Como enviar lembretes

1. Na página de detalhes, clique em "Send / Remind".
2. Escolha os destinatários (por exemplo, só os que ainda não responderam).
3. Escreva um lembrete, se quiser, e confirme. Os e-mails serão enviados.

### Como convidar mais subcontratados

1. Na página de detalhes, clique em "Invite subcontractors".
2. Pesquise por nome ou e-mail e marque os subcontratados.
3. Deixe marcado "Send invitation now" para enviar agora, ou desmarque para enviar depois.
4. Clique em "Add & send" (ou "Add subcontractors", se não for enviar agora).

### Como registrar uma proposta recebida fora do sistema

1. Na página de detalhes, clique em "Enter proposal" ou "Record proposal" no destinatário que ainda não respondeu.
2. Preencha os itens com os preços recebidos. Se tiver o orçamento em PDF ou DOCX, use "Upload estimate with AI" e revise o resultado.
3. Clique em "Save external proposal". A proposta aparece como "Admin entered".

### Como aprovar uma proposta

1. Na página de detalhes, abra a proposta do subcontratado escolhido (ela precisa estar com o status "Proposal received").
2. Confira o total e os itens.
3. Clique em "Approve & Create Work Order" e confirme em "Approve proposal?".
4. Depois, use "View Work Order" para abrir a Ordem de Serviço criada.

### Como cancelar uma solicitação

1. Na página de detalhes (solicitação "Pending"), clique em "Cancel Bid Request".
2. Confirme em "Cancel Bid Request?". Para desistir, clique em "Keep Bid Request".

### Como reabrir uma solicitação com prazo vencido

1. Na página de detalhes, clique em "Reopen Bid Request".
2. Escolha um novo prazo futuro e, se quiser, um motivo.
3. Marque "Notify unanswered subcontractors" se quiser avisá-los, e clique em "Save deadline".

### Como responder a uma solicitação (subcontratado)

1. Abra o link recebido por e-mail. Não é preciso fazer login no SmartBuild.
2. Confira os serviços solicitados e informe o seu preço unitário em cada um.
3. Se precisar, use "Add service" para incluir serviços extras.
4. Escreva as observações (exclusões, prazos, condições), se houver.
5. Clique em "Submit proposal". Depois do envio, aparece a confirmação "Your proposal was submitted".

## Relação com outros módulos

- **Projects**: a solicitação está ligada a um projeto. Os serviços do projeto são usados como ponto de partida dos itens.
- **Work Orders** (Ordens de Serviço): a aprovação de uma proposta cria uma Ordem de Serviço para o subcontratado. Essa ordem segue o fluxo da tela de Work Orders.
- **Subcontractors**: os destinatários são os subcontratados cadastrados. Categorias de destinatários são gerenciadas a partir daqui e também na tela de Subcontratados.
- **Estimates** (Orçamentos): solicitações de proposta são pedidos de preço a subcontratados, diferentes dos orçamentos enviados ao cliente.

## Dúvidas frequentes

**P:** Qual é a diferença entre "Save" e "Create & Send"?
**R:** "Save" cria a solicitação sem enviar e-mails. Você pode convidar e enviar depois. "Create & Send" cria e envia os e-mails na hora.

**P:** O subcontratado precisa ter conta no SmartBuild para responder?
**R:** Não. Ele responde pelo link seguro recebido por e-mail.

**P:** Por que o botão "Create & Send" está desabilitado?
**R:** Falta algum campo obrigatório: projeto, título, escopo, prazo, pelo menos um serviço com nome ou pelo menos um subcontratado.

**P:** O prazo de resposta é até que horas?
**R:** Até as 23:59 do dia escolhido.

**P:** O que acontece quando o prazo passa?
**R:** A solicitação é finalizada automaticamente, e os subcontratados que não responderam ficam como "Finalized". Não é possível enviar propostas depois disso, a menos que você reabra a solicitação com um novo prazo.

**P:** Ao aprovar uma proposta, o que é criado?
**R:** Uma Ordem de Serviço em status pendente, atribuída ao subcontratado, com os serviços da proposta. As outras propostas são marcadas como "Not selected".

**P:** Posso aprovar uma proposta depois que a solicitação foi cancelada?
**R:** Não. Solicitações canceladas não aceitam aprovação.

**P:** Posso mudar uma proposta depois de aprovada?
**R:** Não. Proposta aprovada não pode ser substituída. Se for preciso ajustar, faça isso na Ordem de Serviço criada.

**P:** O subcontratado pode mudar a proposta depois de enviada?
**R:** Enquanto a solicitação estiver aberta e ele ainda não tiver sido aprovado ou recusado, pode enviar uma nova versão, que substitui a anterior.

**P:** Posso registrar uma proposta que recebi por telefone ou e-mail?
**R:** Sim. Use "Enter proposal" ou "Record proposal" no destinatário. Ela aparece como "Admin entered".

**P:** Posso usar um PDF de orçamento que o subcontratado enviou?
**R:** Sim. Use "Upload estimate with AI" com um PDF ou DOCX de até 100 MB. Revise os dados extraídos antes de salvar.

**P:** Quantos arquivos posso anexar?
**R:** Até 20 arquivos (fotos e documentos) por solicitação.

**P:** Por que não consigo reabrir uma solicitação?
**R:** Ela pode estar cancelada, já ter uma proposta aprovada ou ter sido finalizada por outro motivo. A tela informa o motivo exato.
