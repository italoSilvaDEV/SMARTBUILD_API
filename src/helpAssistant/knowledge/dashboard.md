---
title: Painel (Dashboard)
module: general
routes: [/home]
---

# Painel (Dashboard)

## Para que serve

O "Dashboard" é a tela inicial do SmartBuild. Ela mostra um resumo do negócio em números e gráficos: orçamentos, projetos, clientes, funcionários, faturas, fluxo de caixa e despesas. Tudo pode ser filtrado por um período de tempo escolhido pelo usuário.

Existem duas versões da mesma tela:

- **Painel completo:** para quem tem a permissão "Dashboard". Mostra oito indicadores, cinco gráficos de projetos, orçamentos, despesas, faturas, fluxo de caixa e vendas.
- **Painel simplificado:** para quem tem a permissão "Dashboard Simple". Mostra quatro indicadores focados em orçamentos e os gráficos de orçamentos e faturas.

Se o usuário tiver as duas permissões, vê sempre o painel completo.

## Onde encontrar

- **Menu:** "Platform" (Plataforma) > "Dashboard" (Painel). É o primeiro item do menu.
- **Quem vê:** usuários com a permissão "Dashboard" ou "Dashboard Simple". Quem não tem nenhuma das duas não vê o item e, se abrir a tela diretamente, vê a mensagem "Access restricted".
- **Tela inicial:** depois do login, a empresa cai na primeira tela liberada para o usuário. Se o usuário tem qualquer uma das permissões de painel, essa tela é o Dashboard.

## O que aparece na tela

**Cabeçalho**

- Título "Dashboard" (em português: "Painel"), com o subtítulo "Monitor your business performance and key metrics" ("Acompanhe o desempenho da sua empresa e os principais indicadores").
- Seletor de período no canto superior direito, com o texto "Select period" (em português: "Selecionar período"). As opções são:
  - "This Year" (Este Ano);
  - "This Quarter" (Este Trimestre);
  - "Last 3 Months" (Últimos 3 Meses);
  - "Last Month" (Mês Passado);
  - "This Month" (Este Mês);
  - "Last 30 Days" (Últimos 30 Dias);
  - "All Period" (Todo o Período).
- Ao abrir a tela, o período selecionado é "All Period".

**Indicadores do painel completo (cartões no topo)**

Cada cartão mostra um número e pode ser clicado:

| Cartão (inglês / português) | O que mostra | Ao clicar, abre |
|---|---|---|
| "Estimates" / Orçamentos | Quantidade de orçamentos | Orçamentos |
| "Projects" / Projetos | Quantidade de projetos | Projetos |
| "Customers" / Clientes | Quantidade de clientes da empresa | Clientes |
| "Employees" / Funcionários | Quantidade de funcionários ativos | Gerenciamento de usuários |
| "In Progress Projects" / Projetos em Andamento | Projetos com status "In Progress" | Projetos, já filtrados por esse status |
| "Pre-Start Projects" / Projetos Pré-Início | Projetos com status "Pre-Start" | Projetos, já filtrados por esse status |
| "Finished Projects" / Projetos Finalizados | Projetos com status "Finished" | Projetos, já filtrados por esse status |
| "Jobs Schedule" / Agenda de Trabalhos | Projetos com data de início e prazo preenchidos e ainda não finalizados | Agenda de trabalhos |

**Gráficos do painel completo**

- **"Projects Overview" (Visão Geral dos Projetos):** distribuição dos projetos por status. Os rótulos são "Pre-Start" (Pré-Início), "In Progress" (Em Andamento), "Final Walkthrough" (Vistoria Final) e "Finished" (Finalizado).
- **"Estimates Status" (Status dos Orçamentos):** três partes, "Pending" (Pendente), "Accepted" (Aceito) e "Denied" (Recusado).
- **"Expenses Breakdown" (Detalhamento das Despesas):** três categorias, "Material cost" (Custo de materiais), "Employee cost" (Custo de funcionários) e "Subcontractor cost" (Custo de subcontratados). O total aparece junto do gráfico.
- **"Invoices Overview" (Visão Geral das Faturas):** "Paid" (Pago), "Not due yet" (Não vencido) e "Overdue" (Atrasado). Esse gráfico tem seletor próprio de período, com "This Week" (Esta Semana), "This Month" (Este Mês) e "Last Month" (Mês Passado).
- **"Cash Flow" (Fluxo de Caixa):** entradas e despesas por mês, com o saldo do período (entradas menos despesas).
- **"Sales Performance" (Desempenho de Vendas):** valor de faturas pagas por mês.

**Conteúdo do painel simplificado**

- Quatro cartões: "Estimates" (Orçamentos), "Customers" (Clientes), "Estimate Pending" (Orçamento Pendente) e "Estimate Accepted" (Orçamento Aceito). Os dois últimos abrem a lista de orçamentos.
- Gráfico "Estimates Status" (Status dos Orçamentos), igual ao do painel completo.
- Gráfico "Invoices Overview" (Visão Geral das Faturas), igual ao do painel completo.
- Seção de gráficos de vendas de orçamentos, que segue o mesmo seletor de período.

**Estados da tela**

- Enquanto os dados carregam, aparece uma tela de espera com formas cinzas.
- Se a busca falhar, aparece o título "Error loading dashboard data" (Erro ao carregar os dados do painel), com a mensagem do erro e um botão de sair. Esse botão aparece com o rótulo "logout" no texto atual, porque a chave de tradução não está cadastrada.
- Se a empresa usa o modo multiempresa e nenhuma empresa está selecionada, aparece a mensagem "Company ID is required when multi-company mode is enabled" (O ID da empresa é obrigatório quando o modo multiempresa está ativo). Para resolver, troque de empresa pelo menu do usuário.

## Como fazer

### Como trocar o período

1. Clique no seletor "Select period" no canto superior direito.
2. Escolha a opção desejada, por exemplo "This Month".
3. Aguarde: a tela recarrega todos os cartões e gráficos do painel com o novo período.

O gráfico "Invoices Overview" tem seletor próprio. Trocar o período do painel não altera esse gráfico, e vice-versa.

### Como abrir uma lista a partir de um indicador

1. Clique no cartão desejado, por exemplo "In Progress Projects".
2. A tela de destino abre. No caso de projetos por status, a lista já vem filtrada por esse status.

### Como voltar para o painel

1. Clique em "Dashboard" (Painel) no início do menu lateral.

## Status e ciclo de vida

Os números do painel são calculados a partir dos status dos registros:

- **Status de projeto:** "Pre-Start", "In Progress", "Final walkthrough" e "Finished". Projetos com outros status não entram nos cartões de projetos.
- **Status de orçamento:**
  - pendente: entra em "Pending" (Pendente);
  - aprovado: entra em "Accepted" (Aceito);
  - cancelado: entra em "Denied" (Recusado).
- **Status de fatura:**
  - "paid": entra em "Paid" (Pago) e nas vendas e no fluxo de caixa;
  - sem pagamento com vencimento passado: entra em "Overdue" (Atrasado);
  - sem pagamento com vencimento futuro (ou sem vencimento): entra em "Not due yet" (Não vencido).

## Regras de negócio

- **Período:** a maioria dos cartões considera a data de criação do registro (projeto, orçamento, funcionário ou fatura) dentro do período escolhido. Com "All Period", nenhuma data é considerada.
- **Clientes:** o cartão "Customers" mostra o total de clientes da empresa. Ele não é afetado pelo período.
- **Funcionários:** o cartão "Employees" conta funcionários ativos (não desativados) com o perfil Worker. Com um período diferente de "All Period", conta somente os funcionários cadastrados dentro desse período.
- **Projetos:** os cartões de projetos contam os projetos criados no período, com os status indicados acima.
- **Agenda de Trabalhos:** conta os projetos que têm data de início e prazo preenchidos e que ainda não estão com status "Finished".
- **Orçamentos nos gráficos e cartões:** só entram orçamentos cujo projeto está com status "Pending" ou "Accepted". Orçamentos de projetos já em andamento ou finalizados não aparecem nessas contagens.
- **Vendas (Sales Performance):** soma o valor das faturas pagas, agrupado pelo mês em que a fatura foi criada. A data considerada é a de criação da fatura, não a data do pagamento.
- **Fluxo de caixa (Cash Flow):** entradas são as faturas pagas, agrupadas pelo mês de criação. Despesas são os custos lançados nos projetos, agrupados pelo mês de lançamento. O total do gráfico é entradas menos despesas.
- **Despesas (Expenses Breakdown):**
  - "Material cost": soma dos custos de materiais lançados nos projetos;
  - "Employee cost": soma do custo de mão de obra dos funcionários, calculado a partir das horas trabalhadas e do valor por hora ou valor fixo;
  - "Subcontractor cost": soma do custo das horas e valores de subcontratados nos projetos.
- **Faturas (Invoices Overview):** considera todas as faturas da empresa criadas no período escolhido no próprio gráfico.
- **Atualização:** os números ficam guardados por cerca de 5 minutos. Se você acabou de lançar algo e não aparece no painel, espere alguns minutos ou troque o período para forçar a atualização.

## Relação com outros módulos

- **Orçamentos:** os cartões "Estimates", "Estimate Pending" e "Estimate Accepted" e o gráfico "Estimates Status" vêm dos orçamentos. Os cartões abrem a tela de orçamentos.
- **Projetos:** os cartões de projeto e a visão geral de projetos vêm da lista de projetos. Clicar nos cartões de status abre a lista de projetos já filtrada.
- **Clientes:** o cartão "Customers" vem do cadastro de clientes.
- **Funcionários e cartões de ponto:** o cartão "Employees" vem do cadastro de usuários. O custo de mão de obra em "Expenses Breakdown" vem das horas trabalhadas nos projetos.
- **Agenda:** o cartão "Jobs Schedule" abre a agenda de trabalhos.
- **Faturas:** os gráficos "Invoices Overview", "Sales Performance" e "Cash Flow" vêm das faturas e dos pagamentos.
- **Permissões:** os cartões que abrem outras telas só funcionam se o usuário tiver a permissão daquela tela. Por exemplo, "Customers" abre a lista de clientes, que exige a permissão "Projects". Sem ela, a tela de destino mostra "Access restricted".

## Dúvidas frequentes

**P:** Por que o número do cartão "Customers" não muda quando troco o período?
**R:** O total de clientes da empresa não depende de data. Ele mostra todos os clientes cadastrados.

**P:** Eu cadastrei um funcionário hoje, mas o cartão "Employees" não mostrou ele. Por quê?
**R:** Se o período escolhido for diferente de "All Period", o cartão conta só os funcionários cadastrados dentro do período. Escolha "All Period" para ver o total.

**P:** O orçamento que eu criei não aparece nos gráficos de orçamentos. Por quê?
**R:** Só entram nessas contagens os orçamentos de projetos com status "Pending" ou "Accepted". Verifique o status do projeto ligado ao orçamento.

**P:** Por que o gráfico de vendas não bate com o total de faturas emitidas?
**R:** "Sales Performance" considera apenas faturas com status "paid" e agrupa pelo mês de criação. Faturas em aberto ou canceladas não entram.

**P:** O que significa "Overdue" (Atrasado) em "Invoices Overview"?
**R:** É uma fatura que ainda não foi paga e cuja data de vencimento já passou.

**P:** Meu painel é diferente do painel de um colega. Por quê?
**R:** A versão do painel depende da permissão do usuário. Quem tem "Dashboard" vê o painel completo. Quem tem só "Dashboard Simple" vê a versão simplificada. Para mudar, peça ao Owner ou ao Administrator.

**P:** Eu troquei um lançamento de custo e o painel não mudou na hora. É erro?
**R:** Não necessariamente. Os números ficam guardados por cerca de 5 minutos. Espere e recarregue a página, ou troque o período para atualizar.

**P:** O painel mostra "Error loading dashboard data". O que faço?
**R:** Recarregue a página. Se o erro continuar, saia e entre de novo. Se o problema persistir, entre em contato com o suporte e informe a mensagem exibida na tela.

**P:** Por que o painel pede para trocar de empresa?
**R:** Sua conta tem acesso a mais de uma empresa e nenhuma está selecionada. Use "Switch Company" (Trocar empresa) no menu do usuário.
