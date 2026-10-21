---
title: Orçamentos (Estimates) - lista e visão geral
module: estimates
routes: [/seller/estimates]
---

# Orçamentos (Estimates) - lista e visão geral

## Para que serve

A tela "Estimates" (em português, "Orçamentos") reúne os orçamentos enviados aos clientes da sua empresa. A partir dela você acompanha quais orçamentos estão pendentes de decisão do cliente, quais foram aprovados e quais foram cancelados. Também é daqui que você cria um novo orçamento, envia um orçamento por e-mail, converte um orçamento em projeto, cancela, exclui e exporta orçamentos em PDF ou Excel.

Cada orçamento pertence a um projeto. Por isso, a lista mostra apenas os orçamentos ligados a projetos que estão com status "Pending" (Pendente) ou "Accepted" (Aceito). Orçamentos autônomos (marcados como avulsos) não aparecem nesta lista.

## Onde encontrar

- Menu lateral, grupo de financeiro, item "Estimates". Para o perfil de vendedor, o item aparece como "Estimates" logo abaixo de "Agenda".
- Endereço da tela: a lista fica dentro da área de vendas do vendedor, com o título "Estimates".
- Quem vê: é preciso ter a permissão **"Estimates"**. Sem ela, a tela não abre e o item não é exibido no menu.
- Visibilidade por vendedor: se o usuário tiver a permissão para editar todos os orçamentos, vê os orçamentos de toda a empresa. Se não tiver, vê somente os orçamentos dos projetos em que ele é o vendedor responsável.

## O que aparece na tela

### Cabeçalho

- Título: "Estimates" (em português, "Orçamentos").
- Subtítulo: "Monitor your estimates, approvals, and pending decisions".

### Barra de filtros

- **Period** (Período): lista com as opções "This Year", "This Quarter", "Last 3 Months", "Last Month", "This Month", "Last 30 Days" e "All Period". O padrão é "All Period".
- Intervalo de datas personalizado: você pode escolher uma data inicial e uma final. Ao escolher um intervalo, ele substitui o período.
- **Status**: caixa com três opções marcáveis: "Approved", "Pending" e "Canceled". Há o botão "Reset Status" para voltar ao padrão e o botão "CLEAR ALL" para limpar todos os filtros.
- Os filtros ficam salvos no navegador e são lembrados na próxima vez que você abrir a tela.

### Gráficos

- Acima da tabela aparecem gráficos de resumo dos orçamentos. Eles respondem aos mesmos filtros de período, status e datas da tela.

### Barra de ações

- Campo de busca com o placeholder "Search estimates by number or client name...". A busca procura pelo número do orçamento ou pelo nome do cliente.
- Botão "Export Estimates" (em português, "Exportar orçamentos"), com as opções "Export PDF" e "Export Excel".
- Botão "New estimate" (em português, "Novo orçamento"), no canto superior direito da barra.

### Tabela

- Colunas: número do orçamento, cliente, valor, status e uma coluna de ações (ícone de três pontos).
- As colunas Number (número), Client (cliente), Price (valor) e Status (status) podem ser ordenadas ao clicar no cabeçalho.
- Em cada linha aparecem o número do orçamento, o nome do cliente, o local do projeto (ou o texto de endereço não informado, quando o local não existe), o valor e o badge de status.
- O valor exibido é o valor final do orçamento. Quando há desconto, o valor já sai com o desconto aplicado.
- Se nenhum orçamento combinar com os filtros, a tabela mostra uma mensagem de resultado vazio com um atalho para criar um novo orçamento.

### Badges de status

- "Pending" (em português, "Pendente"): âmbar, com ícone de ampulheta.
- "Approved" ("Aprovado"): verde, com ícone de confirmação.
- "Rejected" ("Rejeitado"): vermelho.
- "Canceled" ("Cancelado"): cinza.

## Como fazer

### Como criar um orçamento novo

1. Clique em "New estimate" na barra de ações.
2. A tela abre no passo de escolha do tipo de construção do orçamento. Veja o passo a passo completo na base "Criar e editar orçamentos".

### Como abrir e editar um orçamento

1. Clique em qualquer linha da tabela.
2. Abre-se a janela de edição do orçamento, com a pré-visualização do PDF e as áreas editáveis (serviços, carta de introdução, termos, desconto, e-mails adicionais, data de criação, local e cliente).
3. Faça as alterações e clique em "Save Changes" para salvar, ou em "Save And Send" para salvar e abrir o envio por e-mail.
4. Para descartar as alterações feitas, clique em "Discard Changes". Para fechar sem salvar, clique em "Close".
5. O botão de salvar só fica habilitado quando há alterações não salvas.

### Como ver o orçamento (ícone de três pontos)

1. Clique no ícone de três pontos da linha.
2. Escolha "View Estimate" (em português, "Ver orçamento") para abrir a visualização do documento do orçamento.
3. Escolha "Timeline" (em português, "Linha do tempo") para abrir o painel lateral com o histórico de eventos do orçamento, como envios, aprovações, recusas e cancelamentos.

### Como enviar um orçamento por e-mail

1. No menu de três pontos da linha, abra "Send By Email" (em português, "Enviar por e-mail").
2. Preencha os destinatários, o texto do e-mail e os anexos, se quiser. O passo a passo completo está na base "Enviar e aprovar orçamentos com o cliente".
3. Esta opção fica desabilitada para orçamentos cancelados.

### Como converter um orçamento em projeto

1. No menu de três pontos da linha, passe o mouse sobre "Convert" (em português, "Converter"). Abre-se um submenu.
2. Escolha "Convert to Project" (em português, "Converter para projeto").
3. Na janela "Confirm Conversion" (Confirmar conversão), leia o aviso "Warning: This action cannot be undone!" e confirme.
4. Após a conversão, o orçamento deixa a lista, porque o projeto deixa de estar com status Pendente ou Aceito. O projeto passa a aparecer na tela de Projetos.
5. A opção "Convert to Project" fica desabilitada para orçamentos cancelados.

O submenu "Convert" também tem a opção "Convert to Invoice" (em português, "Converter em fatura"), que cria uma fatura a partir do orçamento. Ela é tratada no módulo de faturas.

### Como cancelar um orçamento

1. No menu de três pontos da linha, escolha "Cancel" (em português, "Cancelar"). A opção só aparece para orçamentos que ainda não estão cancelados.
2. Na janela "Cancel Estimate", leia a mensagem "Are you sure you want to cancel Estimate {número}? This action cannot be undone." e clique em "Yes, cancel it" (sim, cancelar) ou em "No, keep it" (não, manter).
3. Depois de cancelado, o orçamento recebe o status "Canceled" e um registro "Canceled" na linha do tempo.

### Como excluir um orçamento

1. No menu de três pontos da linha, escolha "Delete" (em português, "Excluir"). A opção só aparece para orçamentos que não estão aprovados.
2. Confirme na janela de confirmação. A exclusão não pode ser desfeita.
3. Um orçamento aprovado não pode ser excluído. Nesse caso, use a opção de cancelamento.

### Como exportar orçamentos

1. Clique em "Export Estimates" e escolha "Export PDF" ou "Export Excel".
2. Ao entrar no modo de exportação, todos os orçamentos visíveis na lista ficam selecionados. Você pode desmarcar os que não quer exportar clicando nas caixas de cada linha.
3. Clique no botão de exportação com a quantidade selecionada, por exemplo "Export PDF (5)".
4. Se nenhum orçamento estiver selecionado, aparece a mensagem "Please select at least one estimate to export".
5. Para sair do modo de exportação sem exportar, clique em "Cancel".

## Status e ciclo de vida

Os status de um orçamento são estes:

- **Pending (Pendente)**: orçamento criado e ainda sem resposta do cliente. É o status inicial de todo orçamento novo.
- **Approved (Aprovado)**: o orçamento foi aceito. Isso acontece quando o cliente aceita e assina pelo link, quando o vendedor faz uma aprovação manual, ou quando o orçamento é convertido em projeto.
  - Atenção: ao converter um orçamento pendente em projeto, ele passa a "Approved", mas continua exigindo a assinatura do cliente. Nesse caso a tabela mostra o aviso "Pending Client Signature" (em português, "assinatura do cliente pendente"), e o cliente ainda pode aceitar e assinar pelo link.
- **Rejected (Rejeitado)**: o cliente recusou o orçamento pelo link de resposta.
- **Canceled (Cancelado)**: o orçamento foi cancelado pelo vendedor. O cancelamento pode ter um motivo opcional.

Transições principais:

- Pendente para Aprovado: aceite e assinatura do cliente, aprovação manual ou conversão em projeto.
- Pendente para Rejeitado: recusa do cliente.
- Pendente, Aprovado ou Rejeitado para Cancelado: cancelamento pelo vendedor.
- Cancelado para Pendente: restauração, feita na aba "Estimate" do projeto com a opção "Restore to Pending" (em português, "Restaurar para Pendente"). Essa opção não aparece no menu da lista.

## Regras de negócio

- **Quem vê o quê**: a lista respeita a permissão do usuário. Sem a permissão de editar todos os orçamentos, o vendedor vê apenas os orçamentos dos projetos em que é o responsável.
- **Filtro de status padrão**: a lista começa com os três status "Approved", "Pending" e "Canceled" marcados. Orçamentos com status "Rejected" não aparecem nesse conjunto de filtros. Se você desmarcar todos os status, a lista mostra todos os orçamentos, inclusive os recusados.
- **Exclusão**: não é permitido excluir orçamento aprovado. Ao excluir um orçamento que ainda não foi convertido em projeto, o projeto vinculado também é removido.
- **Cancelamento de orçamento aprovado**: o cancelamento remove a assinatura do cliente do PDF e desvincula os serviços do orçamento do projeto. Os serviços continuam no histórico do orçamento.
- **Conversão em projeto**: o projeto passa para o status "Pre-Start" (em português, "Pré-início") e o valor do projeto passa a ser o valor total do orçamento. Quando o projeto já tem número de contrato, o número do orçamento passa a usar esse número, com o sufixo "-01". Cada serviço do orçamento vira um item do projeto. Faturas e pagamentos ligados ao orçamento passam a ficar ligados ao projeto.
- **Cancelamento e conversão**: um orçamento cancelado não pode ser convertido em projeto.
- **Envio por e-mail**: não é possível enviar orçamentos cancelados.
- **Sincronização**: as mudanças de status são enviadas para a integração com o QuickBooks, quando a empresa usa essa integração.

## Relação com outros módulos

- **Projetos**: cada orçamento pertence a um projeto. Ao converter, o projeto muda de status e passa a aparecer na tela de Projetos. Dentro do detalhe do projeto existe uma aba "Estimate" que mostra os orçamentos desse projeto com as mesmas ações.
- **Faturas (Invoice)**: a opção "Convert to Invoice" cria uma fatura a partir do orçamento. Não é possível converter orçamento cancelado. Também não é possível converter quando o orçamento já está totalmente pago.
- **Catálogo e serviços**: os serviços do orçamento são escolhidos a partir do catálogo de serviços e materiais da empresa, ou criados como serviços personalizados.
- **Clientes**: o nome, e-mail e telefone do cliente são usados no orçamento e no envio por e-mail.
- **Contratos**: o número do contrato do projeto é usado para numerar o orçamento convertido.

## Dúvidas frequentes

**P:** Converti um orçamento em projeto e ele sumiu da lista. Onde ele está?
**R:** A lista mostra apenas orçamentos de projetos com status Pendente ou Aceito. Depois da conversão, o projeto fica como "Pre-Start", então o orçamento sai da lista. Procure o projeto na tela de Projetos.

**P:** Por que não consigo excluir um orçamento?
**R:** Orçamentos aprovados não podem ser excluídos. Nesse caso, a opção "Delete" nem aparece no menu. Se o orçamento não deve mais valer, use a opção "Cancel", que não remove o registro.

**P:** Como vejo os orçamentos cancelados?
**R:** Na barra de filtros, abra o filtro de status e marque "Canceled". Os cancelados aparecem com o badge cinza.

**P:** Um cliente recusou o orçamento. Onde ele aparece?
**R:** Orçamentos recusados ficam com o status "Rejected". Como os filtros de status da lista são "Approved", "Pending" e "Canceled", eles não aparecem com os filtros padrão. Para localizá-los, desmarque todos os status: a lista passa a mostrar todos os orçamentos.

**P:** Posso desfazer um cancelamento?
**R:** Sim, em parte. Na aba "Estimate" do projeto, use "Restore to Pending" para voltar o orçamento cancelado para Pendente. A opção não aparece no menu da lista.

**P:** Como exporto vários orçamentos de uma vez?
**R:** Clique em "Export Estimates", escolha PDF ou Excel, desmarque o que não quiser e clique no botão de exportação com a quantidade selecionada.

**P:** Vendedores veem orçamentos de outros vendedores?
**R:** Depende da permissão do usuário. Quem tem a permissão de editar todos os orçamentos vê todos. Os demais veem somente os orçamentos dos seus projetos.

**P:** Por que o botão "Convert to Project" está desabilitado?
**R:** Orçamentos cancelados não podem ser convertidos em projeto. Restaure o orçamento para Pendente antes, se precisar converter.

**P:** Converti o orçamento e ele ainda aparece como pendente de assinatura. Está certo?
**R:** Sim. A conversão marca o orçamento como Aprovado, mas ele continua exigindo a assinatura do cliente. A tabela mostra "Pending Client Signature" até a assinatura ser feita ou aplicada manualmente.
