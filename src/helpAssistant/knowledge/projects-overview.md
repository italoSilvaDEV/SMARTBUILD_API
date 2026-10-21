---
title: Projetos (lista de projetos)
module: projects
routes: [/seller/projects, /projects]
---

# Projetos (lista de projetos)

## Para que serve

A tela "Projects" (em português, "Projetos") é a lista de todos os projetos da sua empresa. Cada linha representa um projeto (um contrato com um cliente), com número, cliente, endereço, valor, vendedor, gerente de projeto e status.

Daqui você consegue:

- criar um novo projeto ("New project");
- filtrar a lista por período e por status;
- pesquisar projetos pelo texto digitado;
- mudar o status de um projeto diretamente pelo menu da linha;
- exportar os projetos selecionados em PDF ou Excel;
- ver uma visão financeira com saldo de lucro e margem de cada projeto;
- excluir um projeto;
- abrir a página de detalhes de um projeto, clicando na linha.

## Onde encontrar

- Menu lateral: grupo "Workflow", item "Projects" (em português, "Projetos").
- Endereço principal da lista: `/seller/projects`.
- Existe também um endereço mais antigo, `/projects`, que mostra a mesma lista. Ele não tem link no menu, então o uso normal é pelo item "Projects".
- Quem vê: é preciso ter a permissão **"Projects"**. Sem ela, o item não aparece no menu e a tela não abre.

### Quais projetos cada usuário enxerga

- Usuários com acesso total a projetos veem **todos** os projetos da empresa.
- Os demais usuários veem apenas os projetos em que são o **vendedor** ("seller") ou o **gerente de projeto** ("Project Manager").
- Essa diferença é definida no cadastro do usuário, no campo "Project Visibility", com as opções "All Active Projects" (todos os projetos ativos) e "Only Assigned Projects" (somente os projetos atribuídos ao usuário). Ao cadastrar um usuário do escritório de dono ("Owner"), a opção "All Active Projects" é aplicada automaticamente.

## O que aparece na tela

### Cabeçalho

- Título "Projects" (Projetos), com o texto de apoio "Monitor your projects, progress, and completion" (Monitore seus projetos, progresso e conclusão).
- Gráficos de vendas acima da tabela. Eles acompanham os filtros escolhidos.

### Barra de ferramentas

- Campo de busca "Search projects..." (Pesquisar projetos...).
- Chave "Financial View" (Visão Financeira), que troca a tabela padrão pela tabela financeira.
- Botão "Export Financial" (Exportação Financeira), que abre as opções "Export PDF" (Exportar PDF) e "Export Excel" (Exportar Excel).
- Botão "New project" (Novo projeto), no canto direito. Ele leva ao início do fluxo de criação (veja o arquivo de criação de projetos).

### Filtros

- **Period** (Período): "This Year" (Este ano), "This Quarter" (Este Trimestre), "Last 3 Months" (Últimos 3 meses), "Last Month" (Mês Passado), "This Month" (Este mês), "Last 30 Days" (Últimos 30 dias) e "All Period" (Todo o período). Também existe um seletor de intervalo de datas personalizado.
- **Status**: lista de seleção múltipla com os quatro status da lista: "Pre-Start" (Pré-início), "In Progress" (Em andamento), "Final walkthrough" (Vistoria final) e "Finished" (Finalizado).
- **Clear All** (Limpar tudo): volta o período para "All Period" e restaura os quatro status padrão.
- Ao abrir a tela pela primeira vez, o período é "All Period" e os status marcados são Pre-Start, In Progress, Final walkthrough e Finished.
- Os filtros escolhidos ficam guardados no navegador, então continuam válidos na próxima vez que você abrir a lista naquele computador.

### Tabela padrão

Colunas, na ordem em que aparecem:

- **Number** (Número): número do contrato do projeto, com a data de criação embaixo.
- **Client/Address** (Cliente/Endereço): miniatura da foto de capa do projeto, nome do cliente e endereço. Quando não há endereço, aparece "No address".
- **Price** (Preço): valor do projeto.
- **Seller** (Vendedor): nome do vendedor. Some em telas pequenas.
- **PM**: nome do gerente de projeto, ou "-" quando não há. Some em telas menores.
- **Status**: etiqueta colorida com o status atual.
- Última coluna: botão de três pontos ("Project options" – opções do projeto) e botão de lixeira ("Delete project" – excluir projeto).

Clicar em qualquer parte da linha abre a página de detalhes do projeto. Ao passar o mouse sobre uma linha, aparece um pequeno painel com indicadores do projeto.

A tabela mostra 10 projetos por página, com botões de página anterior e próxima. Clicar no cabeçalho de uma coluna ordena a lista por aquela coluna.

### Visão financeira

Ao ativar "Financial View", a tabela passa a mostrar estas colunas:

- **#** (número do projeto, com caixa de seleção durante a exportação);
- **Project / Client** (Projeto/Cliente);
- **Estimate** (Orçamento): valor do projeto;
- **Employee** (Funcionário): custo de horas dos funcionários;
- **Subcon.** (Subcontratados): custo de subcontratados;
- **Material** (Materiais): custo de materiais;
- **Seller** e **PM**;
- **Status**;
- **Profit Balance** (Saldo de lucro);
- **Profit Margin** (Margem de Lucro);
- **Actions** (Ações).

No rodapé aparece a linha "Totals" (Totais), com a soma das colunas dos projetos exibidos, e o título "Current Projects Balance" (Saldo de projetos atuais).

Como os valores são calculados:

- Orçamento = valor do projeto.
- Saldo de lucro = Orçamento − (custo de funcionários + custo de subcontratados) − custo de materiais.
- Margem de lucro = Saldo de lucro ÷ Orçamento × 100.
- Saldo e margem negativos aparecem em vermelho; positivos, em verde.

## Status e ciclo de vida

Os status exibidos na lista são estes:

| Status (como aparece) | Português | Significado |
|---|---|---|
| Pre-Start | Pré-início | Projeto criado, ainda não começou. É o status inicial de todo projeto criado pelo fluxo "New project". |
| In Progress | Em andamento | Obra em execução. |
| Final walkthrough | Vistoria final | Obra concluída, em fase de vistoria final. |
| Finished | Finalizado | Projeto encerrado. |

Pontos importantes:

- Os três primeiros (Pre-Start, In Progress e Final walkthrough) são os **projetos ativos** do sistema. "Finished" não entra nessa categoria, mesmo aparecendo no filtro padrão da lista.
- **Canceled** (Cancelado) aparece em projetos que foram cancelados na integração com QuickBooks. Esse status não está disponível no menu "Change Status" da lista.
- Projetos antigos ou importados podem ter outros status de orçamento, como "Pending" (Pendente), "Accepted" (Aceito) ou "Denied" (Negado). Eles não aparecem no filtro padrão.

### Como mudar o status de um projeto

1. Na linha do projeto, clique no botão de três pontos ("Project options").
2. Escolha "Change Status" (Alterar status). Aparecem os quatro status da lista.
3. Clique no status desejado.

O projeto muda de status na hora e o sistema registra a data da mudança. Se o novo status não estiver marcado nos filtros da lista, o projeto some da lista atual.

## Como fazer

### Como criar um projeto

1. Clique em "New project" (Novo projeto).
2. Siga o fluxo descrito no arquivo de criação de projetos ("Create New Project").

### Como pesquisar ou filtrar

1. Digite no campo "Search projects..." para filtrar pelo texto.
2. Escolha o período no filtro "Period" (Período), se quiser limitar por data.
3. Marque ou desmarque os status no filtro "Status".
4. Para voltar ao padrão, clique em "Clear All" (Limpar tudo).

### Como exportar projetos em PDF ou Excel

1. Clique em "Export Financial" (Exportação Financeira).
2. Escolha "Export PDF" ou "Export Excel".
3. A lista entra no modo de seleção, com todos os projetos já marcados. Desmarque os que não quer exportar.
4. Clique no botão de exportação, que mostra quantos projetos estão selecionados (por exemplo, "Export PDF (5)").
5. Se nenhum projeto estiver selecionado, aparece a mensagem "Please select at least one project to export" (Selecione pelo menos um projeto para exportar).

Para cancelar, clique em "Cancel" (Cancelar). Ao terminar, a exportação mostra uma mensagem de sucesso e a lista volta ao modo normal. O arquivo sai com a visão da tabela atual: quando a visão financeira está ativa, o relatório inclui as colunas financeiras.

### Como excluir um projeto

1. Na linha do projeto, clique na lixeira ("Delete project").
2. Na janela "Confirm Deletion" (Confirmar exclusão), leia o aviso "Warning: This action cannot be undone!" (Aviso: esta ação não pode ser desfeita!).
3. Clique em "Delete Permanently" para confirmar, ou em "Cancel" (Cancelar) para desistir.

A janela informa que serão apagados permanentemente: serviços relacionados, custos e despesas, cronograma e atividades, fotos e documentos, e o histórico de alterações.

### Como abrir os detalhes de um projeto

1. Clique em qualquer parte da linha do projeto.
2. A página de detalhes abre. Veja o arquivo de detalhes do projeto.

## Regras de negócio

- **Número do projeto**: ao criar um projeto, o número recebe o próximo número livre da empresa, considerando tanto os números de orçamentos quanto os de projetos já existentes.
- **Valor exibido**: a coluna "Price" mostra o valor do projeto. Na visão financeira, esse valor aparece como "Estimate".
- **Exclusão**: é definitiva e não há lixeira de recuperação. Ao excluir, o sistema também remove os registros ligados ao projeto, como orçamentos, faturas, ordens de serviço, pedidos de orçamento (bid requests), serviços, custos e horas trabalhadas.
- **Acesso**: a visibilidade da lista segue a regra de "Project Visibility" descrita acima.
- **Integração com QuickBooks**: projetos importados do QuickBooks recebem status automaticamente. Quando o cliente ou projeto está inativo no QuickBooks, o projeto entra como "Canceled". Projetos importados sem status recebem "Pre-Start".
- **Atualização automática**: ao mudar o status pelo menu ou excluir um projeto, a lista é atualizada na hora, sem precisar recarregar a página.

## Relação com outros módulos

- **Clients (Clientes)**: nome, e-mail e endereço do cliente aparecem na linha do projeto. Alterar o cliente é feito pela página de detalhes.
- **Estimates (Orçamentos)**: todo projeto nasce de um orçamento aprovado. O valor do projeto é o valor desse orçamento.
- **Project details (Detalhes do projeto)**: a página de detalhes concentra abas com serviços, tarefas, arquivos, feed, faturas, ordens de alteração e custos.
- **Time cards e Job Schedule**: as horas trabalhadas alimentam o custo de funcionários exibido na visão financeira.
- **Subcontractors (Subcontratados)**: o custo de subcontratados vem dos lançamentos feitos na página do projeto.
- **Invoices (Faturas)**: o saldo a receber é calculado a partir das faturas do projeto.
- **QuickBooks**: a integração pode criar ou atualizar projetos e definir o status deles.

## Dúvidas frequentes

**P:** Por que eu não vejo alguns projetos da minha empresa?
**R:** Usuários sem acesso total a projetos veem apenas os projetos em que são vendedor ou gerente de projeto. Peça ao administrador para verificar a opção "Project Visibility" no seu cadastro.

**P:** O que significa o projeto ficar com o status "Canceled"?
**R:** Normalmente, o projeto foi marcado como inativo no QuickBooks e foi importado com esse status. Esse status não aparece no menu "Change Status" da lista, então a alteração precisa ser feita na origem.

**P:** Por que um projeto "Finished" aparece na lista e outro não?
**R:** Por padrão, a lista mostra os status Pre-Start, In Progress, Final walkthrough e Finished. Se o projeto estiver com um status antigo, como "Pending" ou "Denied", ele só aparece quando você marcar esse status no filtro.

**P:** Posso desfazer uma exclusão de projeto?
**R:** Não. A exclusão é definitiva e remove também orçamentos, faturas, serviços, custos e horas ligados ao projeto. Confirme antes de excluir.

**P:** Como vejo só o lucro de cada projeto?
**R:** Ative a chave "Financial View" (Visão Financeira). As colunas "Profit Balance" e "Profit Margin" mostram o saldo e a margem de cada projeto.

**P:** Por que o campo "Seller" ou "PM" não aparece na tela?
**R:** Essas colunas são ocultadas automaticamente em telas menores, para caber a tabela. Gire o celular ou use um computador para vê-las.

**P:** Ao exportar, o arquivo inclui todos os projetos da empresa?
**R:** Não. A exportação inclui somente os projetos marcados na seleção, e a seleção considera os filtros atuais da lista.

**P:** Como mudo o status de vários projetos de uma vez?
**R:** A lista permite mudar o status de um projeto por vez, pelo menu de três pontos da linha.

**P:** O que é o botão "Clear All"?
**R:** Ele limpa os filtros: o período volta para "All Period" e os status voltam para o padrão de quatro status (Pre-Start, In Progress, Final walkthrough e Finished).
