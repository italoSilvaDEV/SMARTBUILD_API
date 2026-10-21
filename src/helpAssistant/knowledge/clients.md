---
title: Clientes
module: people
routes: [/seller/clients, /seller/clients/:clientId, /clients]
---

# Clientes

## Para que serve

A tela "Clients" reúne todos os clientes da sua empresa. Cada cliente pode ter um ou mais **contextos de trabalho** (work contexts), que são as "pessoas ou empresas" para as quais os projetos são executados. A partir da lista você consegue cadastrar, editar, mesclar e excluir clientes, e abrir a página de detalhes de cada um para ver projetos, orçamentos e faturas agrupados por contexto.

## Onde encontrar

- Menu lateral: grupo "Workflow", item "Clients".
- Rota principal da lista: `/seller/clients`. A página de detalhes de um cliente fica em `/seller/clients/:clientId` (é aberta ao clicar em uma linha da lista).
- Também existe um acesso antigo a esta mesma lista em `/clients`, protegido pela permissão "Projects".
- Quem vê: é preciso ter a permissão **"Clients"** para abrir a lista e a página de detalhes. Sem ela, a tela não aparece no menu e o sistema não permite o acesso.

## O que aparece na tela

### Lista de clientes

- Título da página: "Clients".
- Dois cards no topo:
  - "Total Clients": quantidade total de clientes da empresa.
  - "New This Month": quantidade de clientes cadastrados no mês corrente.
- Campo de busca com o placeholder "Search clients...". A busca procura pelo nome e pelo e-mail do cliente.
- Botões no topo da lista:
  - "Merge Clients" (desabilitado quando há menos de 2 clientes na lista).
  - "New Client".
- Tabela com as colunas:
  - "Client" (nome em destaque, com o e-mail abaixo).
  - "Phone".
  - "Projects" (quantidade de projetos do cliente).
  - "Total Revenue".
  - "Paid".
  - "Not Due Yet".
  - "Overdue".
  - "Actions" (ícones de visualizar, editar e excluir).
- As colunas "Client", "Projects", "Total Revenue", "Paid", "Not Due Yet" e "Overdue" podem ser ordenadas clicando no título.
- Ao clicar em uma linha, abre-se a página de detalhes do cliente.
- Quando não há resultados, aparece "No clients found" com a orientação "Add a new client to get started".
- A lista é paginada com 20 linhas por página.

### Como o valor de cada coluna financeira é calculado

- "Total Revenue": soma dos valores dos projetos do cliente. Quando o projeto tem serviços lançados, o valor é a soma de horas × preço de cada serviço; quando não tem serviços, usa-se o preço do próprio projeto.
- "Paid": soma das faturas (invoices) do cliente com status pago.
- "Overdue": soma das faturas não pagas cuja data de vencimento já passou.
- "Not Due Yet": soma das faturas não pagas cujo vencimento ainda não chegou (ou que não têm data de vencimento).

### Página de detalhes do cliente

- Cabeçalho com o nome do cliente, o botão "Edit" e três indicadores: "Work Contexts", "Total Projects" e "Total Revenue".
- Filtro de período com o rótulo "Period" e as opções "This Year", "This Quarter", "Last 3 Months", "Last Month", "This Month", "Last 30 Days" e "All Period". O padrão ao abrir a página é "This Year".
- Três painéis de resumo financeiro:
  - "Projects" (com o subtítulo "By status"), com gráfico de projetos por status.
  - "Estimates" (subtítulo "Status").
  - "Invoices" (subtítulo "Overview"), com os totais "Paid" e "Overdue".
- Seção "Work Contexts", com o botão "Add Work Context". Cada contexto aparece como um cartão, que pode ser expandido para mostrar a lista de projetos vinculados. Cada cartão mostra o nome (ou "Unnamed Context" se não tiver nome), o tipo ("Company" ou "Personal"), a quantidade de projetos ("1 project" / "N projects") e, quando inativo, o selo "Inactive".
- Dentro de um contexto expandido, a tabela de projetos mostra as colunas "Contract #", "Location", "Status" e "Value". Se não houver projetos, aparece "No projects found for this work context.".
- Em cada contexto há ícones para editar e excluir.
- Se o cliente não tiver nenhum contexto de trabalho, aparece "No work contexts yet" com o botão "Create Work Context".

## Status e ciclo de vida

O cliente não tem um campo de status como "ativo/inativo" na tela. Os estados relevantes são:

- **Cliente ativo**: cadastrado e listado normalmente na tela de Clientes.
- **Cliente excluído**: removido definitivamente do sistema (ver "Como excluir um cliente").
- **Cliente mesclado**: o cliente de origem da mesclagem também é removido definitivamente, e tudo que era dele passa para o cliente de destino (ver "Como mesclar clientes").

Contextos de trabalho podem estar **ativos** ou **inativos**. Um contexto inativo é indicado pelo selo "Inactive" na página de detalhes.

## Como fazer

### Como cadastrar um novo cliente

1. Na tela Clients, clique em "New Client".
2. Abre-se a janela "Create New Client".
3. Preencha a seção "Client Information":
   - "Name" (obrigatório). Texto de apoio: "Enter client name...".
   - "Email" (obrigatório). Texto de apoio: "Enter email address...".
   - "Phone" (opcional).
   - "Date of Birth" (opcional), escolhido em "Select date of birth".
4. Preencha a seção "Work Context Information", que cria o primeiro contexto de trabalho do cliente:
   - "Context Type" (obrigatório): escolha "Personal" ou "Company".
   - "Name" (quando o tipo é Personal) ou "Company Name" (quando o tipo é Company). Obrigatório.
   - "Email" (obrigatório).
   - "Phone" (opcional).
   - "Office Address" (opcional).
   - Há o botão "Copy Client Data", que copia nome, e-mail e telefone da seção do cliente para o contexto de trabalho.
5. Clique em "Create Client". Enquanto salva, o botão mostra "Creating...".
6. Ao concluir, a janela fecha e a lista é atualizada.

Observações:
- Campos obrigatórios sem preenchimento mostram mensagens como "Name is required", "Email is required", "Enter a valid email" e "Type is required".
- Não é possível cadastrar dois clientes com o mesmo e-mail na mesma empresa. Nesse caso aparece a mensagem "Client with email [e-mail] already exists for this company!".

### Como editar um cliente

1. Na lista, clique no ícone de lápis na linha do cliente, ou clique em "Edit" na página de detalhes.
2. Na janela "Update Client", altere "Name", "Email", "Phone" ou "Date of Birth".
3. Clique em "Update Client". Enquanto salva, o botão mostra "Saving...".

Observação: se o e-mail for alterado para um que já existe em outro cliente da mesma empresa, o sistema não salva e mostra a mensagem de e-mail já existente.

### Como criar um contexto de trabalho

Um contexto de trabalho representa uma pessoa ou empresa diferente vinculada ao mesmo cliente (por exemplo, o dono de uma propriedade e a administradora que gerencia o imóvel).

1. Abra a página de detalhes do cliente.
2. Clique em "Add Work Context" (ou em "Create Work Context", se o cliente ainda não tiver contextos).
3. Na janela "Create Work Context", preencha:
   - "Context Type" com "Personal" ou "Company".
   - "Name" ou "Company Name".
   - "Email" (obrigatório).
   - "Phone" e "Office Address" (opcionais).
4. Na seção "Select Projects to Associate", marque os projetos do cliente que devem ficar neste contexto. Use "Select All" ou "Deselect All" para marcar ou desmarcar todos.
5. Clique em "Create Work Context". Se o cliente não tiver projetos disponíveis, aparece um aviso informando que todos os projetos já estão em outros contextos e que o contexto pode ser criado e os projetos vinculados depois.

### Como editar um contexto de trabalho

1. Na página de detalhes do cliente, clique no ícone de edição do contexto.
2. Na janela "Edit Work Context", altere os dados e/ou a seleção de projetos.
3. Clique em "Update Work Context".

### Como excluir um contexto de trabalho

1. Na página de detalhes do cliente, clique no ícone de lixeira do contexto.
2. Confirme em "Delete Work Context". A mensagem diz: "Are you sure you want to delete [nome]? If this work context has linked projects, you will need to move them to another work context later."
3. Ao confirmar, os projetos que estavam nesse contexto ficam sem contexto, ou seja, precisam ser vinculados a outro contexto depois.

Observação: o último contexto de trabalho de um cliente não pode ser excluído. O ícone fica desabilitado e a mensagem é "Cannot delete the last work context. Every client must have at least one work context."

### Como excluir um cliente

1. Na lista, clique no ícone de lixeira na linha do cliente (ou o botão de exclusão, na página de detalhes do cliente).
2. Abre-se a janela "Confirm Deletion" com o aviso "Warning: This action cannot be undone!".
3. A janela lista o que será apagado definitivamente:
   - todos os projetos e dados associados;
   - orçamentos e propostas;
   - faturas e registros de pagamento;
   - projetos de serviço e atividades;
   - custos e despesas;
   - registros de agenda e presença;
   - fotos e documentos;
   - histórico de alterações e linhas do tempo;
   - contextos de trabalho;
   - dados da integração com QuickBooks.
4. Para confirmar, clique em "Delete Permanently". Enquanto apaga, o botão mostra "Deleting...". Se falhar, aparece "Failed to delete client. Please try again.".

Atenção: a exclusão é definitiva e não pode ser desfeita.

### Como mesclar clientes

Use a mesclagem quando o mesmo cliente foi cadastrado duas vezes e você quer juntar os dados em um único cadastro.

1. Na lista de clientes, clique em "Merge Clients". Precisa haver pelo menos 2 clientes na lista.
2. Na janela "Merge Clients", escolha em "Merge transactions from" o cliente de origem (o que será removido), usando "Select the source client...".
3. Escolha em "Into" o cliente de destino (o que vai ficar), usando "Select the target client...".
4. O sistema mostra a prévia de cada cliente, com a seção "Data to be transferred" (projetos, faturas e orçamentos).
5. Se houver avisos, eles aparecem antes de confirmar (veja "Regras de negócio", abaixo).
6. Clique em "Merge Clients" para executar. Não há uma segunda confirmação depois desse clique.
7. Ao concluir, a janela mostra "Merge completed successfully!" com o resumo "Projects Transferred" e "Work Contexts Transferred". Clique em "Finish" para fechar e atualizar a lista.

Atenção: o aviso "WARNING: This action is irreversible!" aparece na janela. Antes de mesclar, confira qual é o cliente de origem e qual é o de destino. Também é recomendado salvar endereços, telefones e outros dados do cliente de origem, pois ele deixa de existir.

### Como ver os detalhes de um cliente

1. Na lista, clique na linha do cliente ou no ícone de olho ("View client details").
2. Na página de detalhes, use o filtro "Period" para mudar o intervalo dos números e dos gráficos.
3. Expanda ou recolha cada contexto de trabalho para ver seus projetos.

## Regras de negócio

- **Nome e e-mail** são obrigatórios para cadastrar e editar um cliente.
- **E-mail único por empresa**: não podem existir dois clientes com o mesmo e-mail na mesma empresa.
- **Um contexto de trabalho por tipo**: o tipo do contexto deve ser "Company" ou "Personal".
- **Pelo menos um contexto**: todo cliente precisa ter ao menos um contexto de trabalho. O último contexto não pode ser excluído.
- **Projetos e contextos**: ao excluir um contexto, seus projetos são desvinculados (ficam sem contexto), mas continuam existindo.
- **Exclusão do cliente**: apaga em cascata projetos, orçamentos, faturas, registros de serviço, atividades, custos, presença, fotos, documentos e histórico, além dos contextos de trabalho.
- **Mesclagem**:
  - Só é possível mesclar dois clientes diferentes e da mesma empresa.
  - Todos os projetos e contextos de trabalho do cliente de origem são transferidos para o cliente de destino.
  - Os registros de integração com QuickBooks do cliente de origem também são transferidos, mas marcados como mesclados.
  - Depois da mesclagem, o cliente de origem é removido definitivamente.
  - Um registro de histórico da mesclagem é guardado.
  - A mesclagem é feita somente dentro do SmartBuild. Nada é alterado no QuickBooks.
- **Avisos de QuickBooks na mesclagem**:
  - Se os dois clientes têm identificadores de QuickBooks diferentes, o aviso é de alta severidade: o vínculo com QuickBooks do cliente de origem será perdido.
  - Se só o cliente de origem tem vínculo com QuickBooks, o aviso informa que esse vínculo será perdido.
  - Se só o cliente de destino tem vínculo, nenhuma ação é necessária no QuickBooks.
  - Após a mesclagem, apenas o cliente de destino mantém o vínculo com QuickBooks.
- **Totais financeiros**: são calculados automaticamente a partir dos projetos e faturas (veja "O que aparece na tela").
- **Novos neste mês**: o card "New This Month" conta os clientes cadastrados desde o primeiro dia do mês corrente.

## Relação com outros módulos

- **Projects**: cada projeto pertence a um cliente e, opcionalmente, a um contexto de trabalho. Os projetos aparecem na página de detalhes do cliente.
- **Estimates** (Orçamentos): aparecem no resumo financeiro do cliente.
- **Invoice**: as faturas alimentam os valores "Paid", "Overdue" e "Not Due Yet".
- **Subcontractors** e **Work Orders**: são cadastros separados. Não dependem da tela de clientes.
- **QuickBooks**: a integração pode trazer clientes do QuickBooks e manter um vínculo com o cadastro do cliente. Esse vínculo é afetado pela mesclagem e pela exclusão.
- **Time Cards, Activities e Schedule**: registros de serviço e presença ligados aos projetos do cliente são apagados junto com o cliente.

## Dúvidas frequentes

**P:** Por que não consigo cadastrar um cliente com um e-mail que já usei?
**R:** Cada e-mail só pode existir uma vez por empresa. Se o cliente já existe, edite o cadastro dele em vez de criar outro. Se houver duplicidade, use "Merge Clients".

**P:** Posso desfazer a exclusão de um cliente?
**R:** Não. A exclusão de cliente é definitiva e remove também projetos, faturas, orçamentos e fotos. Antes de excluir, confirme que nada mais precisa desses dados.

**P:** Qual é a diferença entre cliente e contexto de trabalho?
**R:** O cliente é o cadastro principal. O contexto de trabalho é uma pessoa ou empresa vinculada a ele, com nome, e-mail e telefone próprios. Um mesmo cliente pode ter vários contextos, e cada projeto pode ser vinculado a um deles.

**P:** Por que o botão "Delete Work Context" está desabilitado?
**R:** Porque é o último contexto de trabalho do cliente. Todo cliente precisa ter pelo menos um. Crie outro contexto antes de excluir este.

**P:** O que acontece com os projetos se eu excluir um contexto de trabalho?
**R:** Os projetos continuam no sistema, mas ficam sem contexto. Você pode vinculá-los a outro contexto editando o contexto de destino e marcando os projetos.

**P:** Quando devo mesclar dois clientes?
**R:** Quando o mesmo cliente foi cadastrado mais de uma vez. A mesclagem move todos os projetos e contextos do cliente de origem para o de destino e remove o de origem.

**P:** A mesclagem altera algo no QuickBooks?
**R:** Não. A mesclagem é feita somente no SmartBuild. Mas o vínculo com QuickBooks do cliente de origem é perdido, e o aviso da janela indica quando isso acontece.

**P:** Por que o botão "Merge Clients" está desabilitado?
**R:** Porque a lista tem menos de dois clientes. Também é preciso escolher o cliente de origem e o de destino, e aguardar a validação.

**P:** Por que a coluna "Overdue" tem valor, mas eu acho que o cliente pagou?
**R:** O valor de "Paid" soma apenas faturas marcadas como pagas. Se a fatura não foi marcada como paga e a data de vencimento já passou, ela entra em "Overdue". Confira o status da fatura na tela de faturas.

**P:** Como filtrar os números da página de detalhes por período?
**R:** Use o campo "Period" no topo da página. As opções vão de "This Month" até "All Period". O padrão é "This Year".

**P:** Quem pode ver a tela de Clientes?
**R:** Usuários com a permissão "Clients". Usuários sem essa permissão não veem o item no menu e não conseguem abrir a lista ou os detalhes de um cliente.
