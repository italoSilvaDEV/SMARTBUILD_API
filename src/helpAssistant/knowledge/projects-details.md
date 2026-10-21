---
title: Detalhes do projeto
module: projects
routes: [/seller/project/details/:id, /project/details/:id, /seller/details/:idproject/:idservice]
---

# Detalhes do projeto

## Para que serve

A página de detalhes reúne tudo o que é controlado sobre um projeto específico: resumo financeiro, dados do cliente e da obra, serviços executados, tarefas da equipe, arquivos, feed de atualizações, faturas, ordens de alteração, custos de materiais, horas de funcionários, custos de subcontratados e cronograma.

Você chega a ela clicando em uma linha da lista de projetos (veja o arquivo de lista de projetos).

## Onde encontrar

- Pela lista: "Projects" (Projetos) no menu "Workflow" e, em seguida, clique na linha do projeto.
- Endereço: `/seller/project/details/:id`, onde `:id` é o projeto. Há também um endereço antigo, `/project/details/:id`, que abre a mesma página.
- Quem vê: é preciso ter a permissão **"Projects"**.
- Algumas abas exigem permissões extras (veja a seção de abas abaixo): "Schedule" (Cronograma) e "Tasks" (Tarefas). Se você não tiver a permissão, a aba não aparece.

## O que aparece na tela

### Cabeçalho do projeto

- Foto de capa do projeto (ou um espaço vazio com "Add Cover" – Adicionar capa). Você pode trocar ou remover a capa. Ao remover, o sistema pede confirmação com "Do you want to remove the cover photo?" (Quer remover a foto da capa?).
- Nome do cliente em destaque.
- Etiqueta com o status atual do projeto (Pre-Start, In Progress, Final walkthrough ou Finished). A mudança de status é feita pela lista de projetos.
- Botão de três pontos (sem texto) com as ações:
  - "Adjust Duration" (Ajustar duração): altera a data de início e o prazo final da obra.
  - "Add Project Manager" (Adicionar gerente de projeto): define o gerente de projeto.
  - "Change Seller" (Alterar vendedor): troca o vendedor responsável.
  - "Edit Client" (Editar cliente): aparece somente quando a aba "Details" está aberta.

### Abas

As abas aparecem nesta ordem:

| Aba (como aparece) | Português | O que mostra |
|---|---|---|
| Details | Detalhes | Resumo financeiro, dados do cliente, dados do projeto e localização. |
| Schedule | Cronograma | Calendário de serviços e trabalhos do projeto. Exige a permissão de aba "Schedule". |
| Tasks | Tarefas | Tarefas da equipe ligadas ao projeto. Exige a permissão de aba "Tasks". |
| Reports | Relatórios | Feed do projeto, com as atualizações dos funcionários. Veja o arquivo de feed. |
| Estimates | Orçamentos | Orçamentos do projeto. Veja o arquivo de orçamentos. |
| Work Orders | Ordens de Serviço | Ordens de serviço do projeto. Veja o arquivo de ordens de serviço. |
| Invoice | Fatura | Faturas do projeto. |
| Change Orders | Ordens de Alteração | Pedidos de alteração do escopo. Veja o arquivo de ordens de alteração. |
| Services | Serviços | Serviços executados no projeto. |
| Cost of materials | Custo de materiais | Materiais comprados para o projeto. |
| Employee Cost | Custo do Funcionário | Horas trabalhadas pelos funcionários no projeto. |
| Subcontractor Cost | Custo de Subcontratados | Pagamentos a subcontratados. |
| Files | Arquivos | Pastas, arquivos e notas de texto do projeto. |

## Aba Details (Detalhes)

### Cartões de resumo

- **Total**: valor total do contrato acordado com o cliente.
- **Cost of materials** (Custo de materiais): soma dos custos de materiais do projeto.
- **Labor Cost** (Custo de mão de obra): soma de Employee Cost e Subcontractor Cost.
- **Employee Cost** (Custo do Funcionário) e **Subcontractor Cost** (Custo do Subcontratado): detalhamento do custo de mão de obra.
- **Profit** (Lucro): Total − custo de funcionários − custo de subcontratados − custo de materiais.

### Análise de lucro ("Project Profit & Loss")

O cartão mostra o lucro como porcentagem do total e uma avaliação:

- Abaixo de 15%: "Poor performance - improvement needed" (Baixo desempenho - melhoria necessária).
- De 15% a menos de 25%: "Acceptable performance" (Desempenho aceitável).
- De 25% a menos de 35%: "Good performance" (Bom desempenho).
- 35% ou mais: "Excellent performance" (Excelente desempenho).

### Recebido, restante e faturas

- **Received** (Recebido): soma das faturas pagas. Para faturas parcialmente pagas vindas do QuickBooks, soma o que já foi aplicado como pagamento.
- **Remaining** (Restante): valor do projeto menos o recebido. Nunca fica negativo.
- **Outstanding Invoices** (Faturas pendentes): quantidade de faturas do projeto, com as pagas indicadas.

### Dados do cliente, do projeto e da obra

- **Client Information** (Informações do cliente): nome, e-mail e telefone do cliente. Use "Edit Client" para alterar.
- **Project Information** (Informações do Projeto): número do contrato, status, vendedor ("Edit seller") e gerente de projeto ("Edit project manager").
- **Localização da obra** ("Location of the work"): endereço, com o botão "Open in Mapbox" (Abrir no Mapbox) e a opção "Editar Localização" para alterar o endereço e o raio.
- Botão **Export PDF** (Exportar PDF): gera um PDF com os detalhes do projeto. Enquanto isso, aparece "Generating PDF..." (Gerando PDF...). Se falhar, aparece uma mensagem de erro.

## Aba Services (Serviços)

- Tabela com as colunas **Service** (Serviço), **Status**, **Responsible** (Responsável), **Start Date** (Data de início), **Deadline** (Prazo), **Stages** (Etapas, com o total de etapas concluídas) e um botão de olho para abrir o serviço.
- Busca: "Search service" (Pesquisar serviço).
- Filtro de status: "All" (Todos), "Not Started" (Não iniciado), "Scheduled" (Programado), "In Progress" (Em andamento) e "Completed" (Concluído).
- Clicar no status de um serviço abre a lista para trocar o status, com as opções "Not Started", "Scheduled", "In Progress", "Final walkthrough" e "Finished".
- As datas de início e prazo de cada serviço são editadas em pequenas janelas que abrem ao clicar na data.
- Botão **New change order** (Nova Ordem de Alteração): leva para a aba "Change Orders".
- Página do serviço (ao clicar no olho): abas "General" (Geral), "Gallery" (Galeria), "History" (Histórico) e "Costs" (Custos).

## Aba Tasks (Tarefas)

- Busca "Search tasks..." (Pesquisar tarefas...) e filtro "All Status" (Todos os status), com as opções "Open" (Abrir), "In Progress" (Em andamento), "Completed" (Concluído) e "Canceled" (Cancelado).
- Botão **New Task** (Nova tarefa).
- Cada cartão mostra o título, a quantidade de arquivos e de comentários, e um menu com "Edit Task" (Editar tarefa), "Mark as In Progress" (Marcar como em andamento), "Mark as Completed" (Marcar como concluído) e "Delete Task" (Excluir tarefa).
- Campos do formulário: "Task title" (Título da tarefa) – obrigatório; "Assignee" (Responsável), com "Unassigned" (Não atribuído); "Due Date" (Data de vencimento); "Priority" (Prioridade: Low/Baixo, Medium/Médio, High/Alto, Urgent/Urgente); "Status"; "Service Project" (Projeto de serviço), com "No service" (Sem serviço); "Description" (Descrição); "Attachments" (Anexos), com "Add File" (Adicionar arquivo); e "Comments" (Comentários).
- Botão de salvar: "CREATE TASK" (Criar tarefa) ou "SAVE CHANGES" (Salvar alterações).
- Ao excluir, o sistema pede confirmação: "Are you sure you want to delete this task?" (Tem certeza de que deseja excluir esta tarefa?).

## Aba Files (Arquivos)

- Organização em pastas ("Folders") e arquivos. A partir da raiz, você cria pastas com "New Folder" (Nova pasta) e arquivos com "New File" (Novo arquivo).
- Em "New File" há duas opções: "Upload File" (Carregar arquivo) e criar um arquivo de texto ("Create Text File").
- Tipos aceitos para envio: imagens, PDF, Word (DOC/DOCX), Excel (XLS/XLSX), CSV e TXT. **Vídeos não são aceitos.**
- Arquivos de texto precisam de nome e de conteúdo.
- Pastas precisam de nome. Ao excluir uma pasta, o sistema avisa que todos os arquivos dentro dela serão apagados.
- Ações em cada arquivo: abrir/visualizar, baixar ("Download"), editar, renomear e excluir.

## Aba Invoice (Fatura)

- Lista as faturas do projeto, com busca "Search invoices by ID, client..." (Pesquisar faturas por ID, cliente...).
- Botões **Export PDF** (Exportar PDF) e **Export Excel** (Exportar Excel): exportam as faturas selecionadas. Sem seleção, aparece "Please select at least one invoice to export."
- Botão de nova fatura (com o ícone de +). Quando o projeto já está totalmente pago (saldo devedor zero), o botão fica desabilitado, com a indicação "Fully Paid" (Totalmente pago) e a mensagem "Project is fully paid - no balance due" (Projeto totalmente pago - sem saldo devido).
- O cadastro e o envio de faturas seguem as regras do módulo de faturas.

## Aba Change Orders (Ordens de Alteração)

Veja o arquivo de ordens de alteração, que descreve esta aba em detalhe.

## Aba Reports (Relatórios)

Mostra o feed do projeto, com as atualizações publicadas pelos funcionários. Veja o arquivo de feed do projeto, que também explica o link público para o cliente.

## Aba Cost of materials (Custo de materiais)

- Tabela com **Material name** (Nome do material), **Date created** (Data de criação), **Transaction type** (Tipo de transação), **For service** (Para o serviço), **Amount** (Quantidade), **Value** (Valor) e **Invoice** (Fatura, com o link "View Invoice").
- Totais em "Total of cost" (Custo total).
- Busca "Search material" (Pesquisar material).
- Botão **New cost** (Novo custo) para lançar um material. Cada linha tem as ações editar ("Edit") e excluir ("Delete").
- Exportar em PDF ou Excel. Sem registros, aparece "No data to export" (Nenhum dado para exportar).

## Aba Employee Cost (Custo do Funcionário)

- Mostra as horas trabalhadas pelos funcionários neste projeto. Cada linha tem **Name** (Nome), **Value hour** (Valor por hora), **Amount time** (Quantidade de tempo), **Overtime (x1.5)** (Hora extra) e **Total price** (Preço total).
- Filtro por período: "Start Date" (data inicial) e "End Date" (data final), com o botão "Filter" para aplicar e "Clear" para limpar.
- Total do custo: para lançamentos por hora, horas × valor por hora; para lançamentos de valor fixo, o valor informado.
- Botão **New cost** (Novo custo) para lançar um custo manualmente. Excluir pede confirmação e remove o lançamento de horas.
- Exportar em PDF ou Excel.

## Aba Subcontractor Cost (Custo de Subcontratados)

- Lista os pagamentos a subcontratados, com **Name** (Nome), **Item** (Artigo), **Payment Date** (Data de Pagamento) e **Price** (Preço), além do total.
- Filtro por período (data inicial e final) e busca.
- Botões **New cost** (Novo custo), editar e excluir, com confirmação antes de apagar.
- Exportar em PDF ou Excel.

## Aba Schedule (Cronograma)

- Calendário com os trabalhos agendados para o projeto e lista dos trabalhos do período.
- Botões para adicionar um agendamento ("Add new"), que pode ser um serviço do projeto ou um serviço personalizado, e para marcar um trabalho como concluído ("Mark as Completed").
- Esta aba usa as mesmas regras do módulo de cronograma (Job Schedule).

## Aba Estimates e Work Orders

- Essas duas abas exibem, dentro do projeto, as listas de orçamentos e de ordens de serviço. As regras de criação e envio estão nos módulos de orçamentos e de ordens de serviço.

## Status e ciclo de vida

- O status do projeto aparece no cabeçalho. Ele muda pela lista de projetos (menu "Change Status").
- Os serviços têm status próprio, alterado na aba Services: "Not Started", "Scheduled", "In Progress", "Final walkthrough" e "Finished".
- As tarefas têm status próprio: "Open", "In Progress", "Completed" e "Canceled".
- O status de uma ordem de alteração (pendente, aprovada ou cancelada) é tratado na aba Change Orders.

## Como fazer

### Como ajustar a duração do projeto

1. No cabeçalho, clique nos três pontos e escolha "Adjust Duration".
2. Informe a data de início e o prazo final.
3. Salve.

### Como trocar o vendedor ou o gerente de projeto

1. No cabeçalho, clique nos três pontos e escolha "Change Seller" ou "Add Project Manager".
2. Escolha o usuário e salve. Você também pode usar "Edit seller" e "Edit project manager" dentro do cartão de informações.

### Como atualizar o cliente

1. Abra a aba "Details".
2. Clique nos três pontos e escolha "Edit Client".
3. Altere os dados e salve.

### Como trocar a foto de capa

1. No cabeçalho, clique na área da foto ("Add Cover" ou a foto atual).
2. Escolha uma imagem. Para remover, confirme em "Do you want to remove the cover photo?".

### Como criar uma tarefa

1. Abra a aba "Tasks" e clique em "New Task".
2. Preencha o título e, se quiser, responsável, prazo, prioridade, status e serviço relacionado.
3. Clique em "CREATE TASK".

### Como lançar um custo de material

1. Abra a aba "Cost of materials" e clique em "New cost".
2. Preencha material, data, tipo, serviço relacionado, quantidade e valor, e salve.

### Como exportar os detalhes do projeto em PDF

1. Na aba "Details", clique em "Export PDF".
2. Aguarde a mensagem "Generating PDF...". Ao terminar, o PDF fica pronto para você.

## Regras de negócio

- **Lucro**: Total − custo de funcionários − custo de subcontratados − custo de materiais.
- **Margem e avaliação**: o percentual de lucro sobre o total define a avaliação mostrada na análise de lucro (faixas descritas acima).
- **Recebido e restante**: calculados a partir das faturas do projeto. Faturas pagas entram pelo valor total; faturas parcialmente pagas (QuickBooks) entram pelos pagamentos aplicados.
- **Saldo devedor**: começa com o valor do projeto e diminui conforme os pagamentos. Com saldo zero, o sistema não permite criar nova fatura.
- **Custo de funcionários**: vem das horas trabalhadas registradas no projeto. Lançamentos por hora multiplicam horas pelo valor da hora; lançamentos fixos usam o valor informado.
- **Exclusão de tarefas, arquivos, pastas, custos e horas**: sempre pedem confirmação. Tarefas e arquivos excluídos não voltam.
- **Permissões de aba**: sem a permissão "Schedule" ou "Tasks", essas abas somem e, se você estava nelas, a página volta para "Details".
- **Mudança de status**: feita somente pela lista de projetos.

## Relação com outros módulos

- **Projects list (Lista de projetos)**: origem da navegação e onde o status do projeto é alterado.
- **Clients (Clientes)**: dados do cliente exibidos e editados aqui.
- **Estimates (Orçamentos)** e **Work Orders (Ordens de serviço)**: exibidos como abas do projeto.
- **Change Orders (Ordens de alteração)**: aba própria, com aprovação pelo cliente.
- **Invoices (Faturas)**: alimentam os valores de recebido e restante.
- **Time cards e Job Schedule (Ponto e Cronograma)**: horas trabalhadas e agendamentos aparecem nas abas de custo e de cronograma.
- **Subcontractors (Subcontratados)**: pagamentos aparecem na aba Subcontractor Cost.
- **Feed (Relatórios)**: atualizações dos funcionários e link público para o cliente.

## Dúvidas frequentes

**P:** Por que não vejo a aba "Tasks" ou "Schedule"?
**R:** Essas abas exigem permissões específicas de aba. Peça ao administrador para liberá-las no seu cadastro.

**P:** Como mudo o status do projeto de "Pre-Start" para "In Progress"?
**R:** Pela lista de projetos, no menu de três pontos da linha, escolha "Change Status". O status não é alterado pela página de detalhes.

**P:** Por que o botão de nova fatura está desabilitado?
**R:** O projeto já está totalmente pago, ou seja, não há saldo devedor. Aparece a indicação "Fully Paid".

**P:** O valor de "Remaining" está zerado mesmo sem todas as faturas pagas. Por quê?
**R:** O restante é calculado com base no que já foi recebido. Verifique se as faturas do projeto estão marcadas como pagas, pois só pagamentos efetivamente registrados entram no cálculo.

**P:** Por que o lucro do projeto está baixo?
**R:** O lucro desconta funcionários, subcontratados e materiais do valor do projeto. Confira os lançamentos das abas Cost of materials, Employee Cost e Subcontractor Cost.

**P:** Posso anexar um vídeo em "Files"?
**R:** Não. Somente imagens e documentos (PDF, Word, Excel, CSV e TXT) são aceitos.

**P:** Ao filtrar serviços por "Completed", alguns serviços finalizados não aparecem. Por quê?
**R:** Ao concluir um serviço, o status usado é "Finished" (Finalizado), que não é encontrado pelo filtro "Completed". Use o filtro "All" para ver todos.

**P:** Excluí uma tarefa por engano. Consigo recuperar?
**R:** Não. A exclusão de tarefas é definitiva. Confirme antes de apagar.

**P:** Como ver todas as horas trabalhadas neste projeto?
**R:** Abra a aba "Employee Cost" e, se necessário, use o filtro de período para limitar as datas.
