---
title: Contas a pagar (Accounts Payable)
module: financials
routes: [/accounts-payable]
---

# Contas a pagar (Accounts Payable)

## Para que serve

A tela "Accounts Payable" (PT: "Contas a pagar") é uma lista simples das contas que sua empresa precisa pagar: aluguel, seguros, assinaturas de software, fornecedores e outras despesas. Com ela você:

- cadastra cada conta com nome, descrição e valor em dólar;
- marca uma conta como paga ou como não paga, sem apagar o histórico;
- vê um resumo do total, do que ainda falta pagar, do que já foi pago e da maior conta;
- exporta as contas selecionadas em PDF ou Excel.

As contas a pagar não se ligam automaticamente a projetos, faturas ou ao QuickBooks. São um controle separado das faturas a receber.

## Onde encontrar

- Menu lateral: item "Accounts Payable" (ícone de carteira), perto dos itens "Contracts" e "Invoice".
- Rota: `/accounts-payable`. Título da página: "Accounts Payable" (PT: "Contas a pagar").
- Quem vê: o item aparece no menu somente para usuários com o cargo (office) **Owner**, **Administrator** ou **Master**. Usuários de outros cargos não veem o item no menu.

## O que aparece na tela

### Cabeçalho

- Título "Accounts Payable" (PT: "Contas a pagar") e subtítulo "Track your bills and payments in one clear view." (PT: "Acompanhe suas contas e pagamentos em uma visão simples.").
- Botão "Export bills" (PT: "Exportar contas"), que abre as opções "Export PDF" (PT: "Exportar PDF") e "Export Excel" (PT: "Exportar Excel").
- Botão "Add bill" (PT: "Adicionar conta").

### Cards de resumo

- "Total bills" (PT: "Total das contas"): soma de todas as contas cadastradas, com a quantidade de contas abaixo.
- "To pay" (PT: "A pagar"): soma das contas ainda não pagas.
- "Already paid" (PT: "Já pagas"): soma das contas pagas.
- "Largest bill" (PT: "Maior conta"): valor da maior conta e o nome dela.

Os cards mostram o total de todas as contas, mesmo quando você usa a busca ou o filtro de status na lista.

### Gráficos

- "Bill breakdown" (PT: "Distribuição das contas"): gráfico de pizza, com uma fatia por conta, e a legenda com o nome, o valor e o percentual de cada uma. A dica é "Each slice represents one bill." (PT: "Cada fatia representa uma conta.").
- "Payment progress" (PT: "Progresso dos pagamentos"): percentual do total já pago, com a barra de progresso, mostrando o valor pago ("Already paid") e o valor a pagar ("To pay"). A frase de apoio é "How much of the total has been paid" (PT: "Quanto do valor total já foi pago").

### Lista "Your bills" (PT: "Suas contas")

- Campo de busca "Search bills..." (PT: "Buscar contas..."). A busca procura no nome e na descrição.
- Filtro de status, com as opções "All statuses" (PT: "Todos os status"), "To pay" (PT: "A pagar") e "Paid" (PT: "Paga").
- Tabela com as colunas:
  - "Bill name" (PT: "Nome da conta"): nome em destaque, com a descrição abaixo.
  - "Amount" (PT: "Valor"): valor em dólar.
  - "Status": etiqueta "To pay" (amarela) ou "Paid" (verde). Clicar na etiqueta marca ou desmarca como paga.
  - "Actions" (PT: "Ações"): menu com três pontinhos.
- Quando não há contas: "No bills found." e a dica "Try another search or add a bill.".

Itens do menu de ações de cada conta:

- "Edit" (PT: "Editar"): abre a janela de edição.
- "Mark as paid" (PT: "Marcar como paga") ou "Mark as unpaid" (PT: "Marcar como não paga").
- "Delete" (PT: "Excluir").

### Janela de cadastro e edição

- Título "Add bill" (PT: "Adicionar conta") ou "Edit bill" (PT: "Editar conta").
- "Bill name" (PT: "Nome da conta") *, obrigatório. Exemplo no campo: "e.g. Office rent".
- "Description" (PT: "Descrição"), opcional. Texto: "Optional details about this bill".
- "Amount (USD)" *, obrigatório. Campo com o símbolo "$" e o exemplo "0.00".
- Botões "Cancel" e "Save bill", ou "Save changes" na edição.

### Janela de exclusão

- Título "Delete this bill?".
- Texto: "This bill will be removed from the list. You cannot undo this action."
- Botões "Cancel" e "Delete bill".

### Exportação

- Ao escolher "Export PDF" ou "Export Excel", a lista entra em modo de seleção, com todas as contas visíveis já marcadas. Use a caixa "Select all visible bills" (PT: "Selecionar todas as contas visíveis") ou as caixas de cada linha para ajustar.
- O botão de confirmação mostra "Export PDF (n)" ou "Export Excel (n)", onde n é a quantidade marcada.
- Mensagens: "Bills exported successfully." (PT: "Contas exportadas com sucesso.") ou "Could not export bills. Please try again.".

## Como fazer

### Como cadastrar uma conta

1. Clique em "Add bill".
2. Digite o "Bill name". Ele é obrigatório e pode ter até 100 caracteres.
3. Se quiser, preencha a "Description" (até 500 caracteres).
4. Digite o valor em "Amount (USD)". Use números, com até dois decimais. O valor precisa ser maior que zero.
5. Clique em "Save bill".

Mensagem: "Bill saved successfully." Se não for possível salvar: "Could not save the bill. Please try again.".

### Como editar uma conta

1. Na linha da conta, abra o menu de ações e escolha "Edit".
2. Altere os dados e clique em "Save changes".

Mensagem: "Bill saved successfully.".

### Como marcar uma conta como paga

1. Clique na etiqueta de status da conta ("To pay"), ou abra o menu de ações e escolha "Mark as paid".
2. Para desfazer, clique na etiqueta "Paid" ou escolha "Mark as unpaid".

Mensagem: "Payment status updated.". Se não for possível salvar, aparece "Could not update payment status. Please try again.". Ao marcar como paga, a data do pagamento é registrada como o momento do clique.

### Como excluir uma conta

1. Na linha da conta, abra o menu de ações e escolha "Delete".
2. Confirme em "Delete bill".

Mensagem: "Bill deleted.". A exclusão é definitiva.

### Como buscar e filtrar

1. Digite no campo "Search bills..." para procurar por nome ou descrição.
2. Use o filtro de status para mostrar só "To pay" ou só "Paid".

Os filtros mudam apenas a lista. Os cards e os gráficos continuam mostrando o total geral.

### Como exportar contas

1. Clique em "Export bills" e escolha "Export PDF" ou "Export Excel".
2. Marque ou desmarque as contas que quer incluir. Por padrão, todas as contas visíveis (após busca e filtro) já vêm marcadas.
3. Clique no botão de exportação com a quantidade de contas.
4. Para sair sem exportar, clique em "Cancel".

## Status e ciclo de vida

Cada conta tem apenas dois status:

- **To pay** (PT: "A pagar"): conta cadastrada e ainda não paga. É o status de toda conta nova.
- **Paid** (PT: "Paga"): conta marcada como paga. Ao marcar, o sistema guarda a data e a hora em que foi paga.

Você pode alternar entre os dois quantas vezes quiser. Não há outros estados nem aprovação. Uma conta paga continua editável e pode ser excluída.

## Regras de negócio

### Validações do cadastro

- Nome: obrigatório, de 1 a 100 caracteres. Mensagens: "Enter a bill name." e "Use 100 characters or fewer.".
- Descrição: opcional, até 500 caracteres. Mensagem: "Use 500 characters or fewer.".
- Valor: obrigatório, em dólar, com até dois decimais, maior que zero e no máximo 9.999.999.999.999,99. Mensagens: "Enter an amount greater than zero with up to two decimal places." e "The maximum amount is $9,999,999,999,999.99.".
- Se o valor ou o nome forem inválidos, a janela não é enviada e os erros aparecem abaixo de cada campo.

### Cálculos dos cards e do gráfico

- "Total bills" é a soma de todas as contas da empresa.
- "To pay" é a soma das contas com status "To pay". "Already paid" é a soma das contas pagas.
- O progresso dos pagamentos é o valor pago dividido pelo total, arredondado para o percentual inteiro.
- "Largest bill" é a conta de maior valor.

### Quem pode o quê

- A restrição de acesso por cargo (Owner, Administrator ou Master) é aplicada no menu lateral.
- Todas as contas são da empresa do usuário logado. Não há contas individuais por usuário.

### Empresa selecionada

- Se a conta do usuário não tiver uma empresa selecionada, a tela mostra "No company is selected for this account." e não permite cadastrar contas.

### Exportação

- O PDF traz o nome e o logo da empresa. O Excel traz a lista das contas selecionadas.

## Relação com outros módulos

- **Faturas (Invoices)**: as contas a pagar são separadas das faturas a receber. Não há vínculo automático.
- **QuickBooks e Stripe**: esta tela não envia nem recebe dados dessas integrações.
- **Projetos e clientes**: não há vínculo com projetos nem com clientes. Use a descrição para anotar a referência, se precisar.

## Dúvidas frequentes

**P:** Por que não vejo o item "Accounts Payable" no menu?
**R:** O item só aparece para usuários com o cargo Owner, Administrator ou Master. Peça ao administrador da conta para verificar o seu cargo.

**P:** Posso cadastrar um valor com centavos?
**R:** Sim, com até dois decimais. Por exemplo, 1250.50. O valor precisa ser maior que zero.

**P:** Marquei uma conta como paga por engano. Como desfaço?
**R:** Clique na etiqueta "Paid" da conta, ou escolha "Mark as unpaid" no menu de ações. A conta volta para "To pay".

**P:** Excluí uma conta sem querer. Dá para recuperar?
**R:** Não. A exclusão é definitiva e não há como desfazer. Cadastre a conta de novo, se necessário.

**P:** Os totais mudam quando eu filtro a lista?
**R:** Não. A lista muda com a busca e o filtro, mas os cards de resumo e o gráfico mostram sempre o total geral de todas as contas.

**P:** Como exporto só algumas contas?
**R:** Clique em "Export bills", escolha o formato e desmarque as contas que não quer incluir antes de confirmar.

**P:** Por que o botão de exportar está desabilitado?
**R:** Ele fica indisponível quando a lista ainda está carregando, quando não há contas visíveis ou quando nenhuma conta está marcada.
