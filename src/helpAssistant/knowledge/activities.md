---
title: Activities (Atividades)
module: operations
routes: [/activities]
---

# Activities (Atividades)

## Para que serve

A tela "Activities" mostra, em tempo quase real, quem da equipe está trabalhando agora e quem já encerrou o expediente no dia de hoje. Ela resume quantas pessoas estão "In" (em português: "Entrada", em serviço) e "Out" (em português: "Saída", encerraram), em quantos projetos há trabalho em andamento e há quanto tempo, em média, as pessoas ativas estão online.

É uma visão do dia, para acompanhar a operação. Para o histórico e o valor das horas, use "Time Cards" (Cartões de ponto).

## Onde encontrar

- Menu lateral: grupo "Workflow", item "Activities" (em português: "Atividades").
- Quem vê: usuários com a permissão **"Activities"**. Sem ela, a tela não aparece no menu e a página não abre.

## O que aparece na tela

A página tem duas abas, no topo:

- **"Activities"** (em português: "Atividades"): a aba aberta por padrão.
- **"Map (Beta)"** (em português: "Mapa (beta)"): mostra o mesmo mapa de localização da equipe da tela "Job Dispatch" (Despacho). Veja a tela "Job Dispatch" para a descrição do mapa.

### Cards de resumo (aba "Activities")

Quatro cards no topo:

- **"In"** (em português: "Entrada"): número de pessoas com entrada registrada e sem saída, ou seja, em serviço agora.
- **"Out"** (em português: "Saída"): número de pessoas que já registraram saída no dia.
- **"Projects in working"** (em português: "Projetos em andamento"): número de projetos com trabalho em andamento.
- **"Average Time Online"** (em português: "Tempo médio on-line"): média de tempo desde a entrada das pessoas que estão em serviço. Aparece no formato "Xh Ym" (por exemplo, "3h 25m"). Quando ninguém está em serviço, aparece "0h".

### Tabela de atividades

As colunas da tabela são:

- **"Name"** (em português: "Nome"): nome do funcionário.
- **"Services"** (em português: "Serviços"): serviço em que ele está registrado.
- **"Client"** (em português: "Cliente"): cliente do projeto.
- **"Status"** (em português: "Status"): "In" em verde (em serviço) ou "Out" em vermelho (encerrou).

Em telas pequenas, cada atividade aparece como um cartão, com as linhas "Service" (em português: "Serviço"), "Client" (em português: "Cliente") e "Time" (em português: "Hora"). A hora mostra a saída, quando houver, ou a entrada.

As pessoas com status "In" aparecem sempre primeiro na lista.

## Como fazer

### Como acompanhar a equipe em tempo real

1. Abra "Activities" pelo menu. A lista é carregada com os dados do dia.
2. A lista se atualiza sozinha a cada 30 segundos, enquanto a aba estiver visível e você estiver na primeira página da lista.
3. Role a lista até o fim para carregar mais atividades. Novas páginas são acrescentadas automaticamente.

### Como ver a localização da equipe

1. Clique na aba "Map (Beta)".
2. Use o mapa para ver onde cada pessoa está. Para os detalhes do mapa, veja a tela "Job Dispatch".

## Status e ciclo de vida

Cada atividade tem um de dois status:

- **In** (em português: "Entrada"): a pessoa registrou entrada e ainda não registrou saída. Fica sempre visível na lista, mesmo que a entrada tenha sido em um dia anterior.
- **Out** (em português: "Saída"): a pessoa registrou saída. Só aparece na lista se a saída (ou a entrada, quando não há saída) for do dia de hoje.

Os cards de "In" e "Out" são recalculados a cada atualização da lista.

## Regras de negócio

- **Dia de referência:** o "dia de hoje" usado pela tela é o dia no fuso horário de Nova York (America/New_York), e não o fuso da sua máquina. Por isso, em horários próximos à virada do dia, uma atividade pode aparecer como do dia anterior ou do dia seguinte em relação ao seu relógio local.
- **Quem aparece:** toda pessoa com entrada e sem saída aparece, independentemente da data. As demais aparecem apenas se o registro for do dia de hoje.
- **Média de tempo online:** é a média, em minutos, do tempo decorrido desde a entrada de cada pessoa com status "In". Não considera pausas.
- **Atualização:** a atualização automática roda a cada 30 segundos, somente na primeira página e somente com a aba visível no navegador.
- **Os valores não são de folha de pagamento.** Esta tela não calcula horas pagas nem valores. Para isso, use "Time Cards".

## Relação com outros módulos

- **Time Cards (Cartões de ponto):** são os registros de entrada e saída que alimentam esta tela. O fechamento de horas, pausas e valores é feito lá.
- **Job Dispatch (Despacho):** o mapa desta tela é o mesmo do despacho, e o painel de equipe do despacho mostra quem está no local no momento.
- **Projects (Projetos):** o projeto e o serviço de cada atividade vêm do cadastro de projetos.
- **Clients (Clientes):** o nome do cliente exibido em cada atividade vem do cadastro de clientes.

## Dúvidas frequentes

**P:** Um funcionário que entrou ontem continua aparecendo como "In". Por quê?
**R:** Porque ele ainda não registrou saída. Enquanto a saída não for registrada, a pessoa continua aparecendo como em serviço.

**P:** Uma pessoa que já saiu não aparece na lista. Por quê?
**R:** Só aparecem as saídas do dia de hoje. Para ver o histórico de dias anteriores, use "Time Cards".

**P:** Por que os horários parecem diferentes do meu relógio?
**R:** A tela usa o dia de referência de Nova York para decidir o que é "hoje". Os horários exibidos seguem o registro salvo no sistema.

**P:** A lista não está atualizando. O que fazer?
**R:** A atualização acontece a cada 30 segundos, somente com a aba visível e na primeira página. Mantenha a aba aberta e em primeiro plano, ou recarregue a página.

**P:** Como vejo onde a equipe está?
**R:** Clique na aba "Map (Beta)". O mapa mostra a localização da equipe.

**P:** Por que o tempo médio online mostra "0h"?
**R:** Porque não há nenhuma pessoa com status "In" no momento.

**P:** Não consigo abrir a tela Activities. Por quê?
**R:** A tela é restrita a quem tem a permissão "Activities". Peça ao administrador para liberá-la.
