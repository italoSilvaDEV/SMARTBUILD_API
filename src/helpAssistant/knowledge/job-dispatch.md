---
title: Job Dispatch (Despacho de trabalhos)
module: operations
routes: [/seller/dispatch]
---

# Job Dispatch (Despacho de trabalhos)

## Para que serve

A tela "Job Dispatch" é o centro de operação do dia a dia. Ela mostra quem da equipe está no local e quem está fora, quais trabalhos têm data mas ainda não têm responsável, quais serviços ainda não foram agendados e quais tarefas estão abertas, atrasadas ou sem responsável. Também mostra a localização da equipe em um mapa.

Enquanto a agenda ("Job Schedule") serve para planejar as datas, o despacho serve para acompanhar a execução e para despachar a equipe.

## Onde encontrar

- Menu lateral: grupo "Schedule", item "Job Dispatch".
- Também existe um item "Agenda" > "Job Dispatch" em outro menu de navegação do sistema.
- Quem vê: usuários que têm a permissão **"Job Dispatch"**. Sem essa permissão, a tela não aparece no menu e a página não abre.

## O que aparece na tela

- Título da página: "Job Dispatch".
- Quatro abas, nesta ordem:
  - "Dispatch Board" (em português: "Painel de despacho"). É a aba aberta por padrão.
  - "Calendar" (em português: "Calendário").
  - "Map (Beta)" (em português: "Mapa (beta)").
  - "Tasks" (em português: "Tarefas").
- Na aba "Dispatch Board", abaixo das abas, aparecem as visões "Day", "Week" e "Month" (em português: "Dia", "Semana" e "Mês") e o botão "Create Job" (em português: "Criar trabalho").

### Aba "Dispatch Board"

- Painel "Live Workforce" (em português: "Equipe em tempo real"): mostra o número de pessoas ativas, quantas estão "On Site" (em português: "No local") e quantas estão "Off Site" (em português: "Fora do local"). Abaixo, até cinco funcionários, com o serviço, o local, a hora de entrada ("Check-in") e a última atualização. Quando não há ninguém ativo, aparece "No active workers right now." (em português: "Nenhum funcionário ativo no momento").
- Painel "Schedule Focus" (em português: "Foco da agenda"): trabalhos que "Due Today" (em português: "Vence hoje"), "Overdue" (em português: "Atrasado"), "Starts Today" (em português: "Começa hoje") e "Unassigned" (em português: "Não atribuído"), que são trabalhos com data mas sem responsável.
- Painel "Task Focus" (em português: "Foco das tarefas"): tarefas com prazo hoje, atrasadas e "Without Assignee" (em português: "Sem responsável").
- Painel de trabalhos sem data, chamado "Unassigned Jobs" (em português: "Trabalhos não atribuídos"), com a busca "Search services or location..." (em português: "Buscar serviços ou local...").
- Atalhos "Open Dispatch", "Open Map" e "Open Tasks" (em português: "Abrir despacho", "Abrir mapa" e "Abrir tarefas") levam às outras abas.

### Aba "Calendar"

- Calendário de trabalhos com as visões Day, Week e Month, o botão "Today" (em português: "Hoje") e o botão "Create Job".
- Cartões de resumo: "Dispatched" (em português: "Despachados"), "Unassigned Jobs", "En Route" (em português: "A caminho"), "Open check-ins on site" (em português: "Check-ins abertos no local"), "Open check-ins off site" (em português: "Check-ins abertos fora do local") e "Services without schedule dates" (em português: "Serviços sem datas de agenda"). O período dos cartões segue a visão escolhida: "Current day", "Current week" ou "Current month".

### Aba "Map (Beta)"

- Mapa com a localização dos funcionários. A coluna lateral lista "Team locations" (em português: "Localizações da equipe"), com a opção "Refresh team locations" (em português: "Atualizar localizações da equipe") e a opção "Collapse team locations" (em português: "Recolher localizações da equipe").
- Indicadores e rótulos: "GPS live" (em português: "GPS ao vivo"), "without current GPS" (em português: "sem GPS atual") e "Last known location" (em português: "Última localização conhecida"). Quando não há registros para a data, aparece "No attendance or GPS locations were recorded for this date." (em português: "Nenhum registro de ponto ou GPS foi feito nesta data").
- Ao clicar em um funcionário, abre-se uma gaveta com os detalhes dele.

### Aba "Tasks"

- Visões "Kanban" e "List" (em português: "Kanban" e "Lista").
- Colunas do kanban: "Open" (em português: "Aberta"), "In Progress" (em português: "Em andamento"), "Completed" (em português: "Concluída") e "Canceled" (em português: "Cancelada").
- Filtros: campo de busca "Search tasks or project..." (em português: "Buscar tarefas ou projeto..."), filtro de status e filtro de projeto.
- Botão "Create task" (em português: "Criar tarefa").

## Como fazer

### Como criar um trabalho pelo despacho

1. Clique em "Create Job" (em português: "Criar trabalho"), em qualquer aba que tenha o botão.
2. Escolha um ou mais projetos em "Select projects" (em português: "Selecionar projetos"). Use a busca "Search by name or contract..." (em português: "Buscar por nome ou contrato...") para localizar o projeto. Só aparecem projetos compatíveis; se não houver nenhum, aparece "No compatible projects found." (em português: "Nenhum projeto compatível encontrado").
3. Clique em "Continue" (em português: "Continuar").
4. Para cada projeto escolhido, escolha um serviço. A etapa exige que cada projeto selecionado tenha um serviço definido. Se o serviço necessário não existir, use "Custom Service" (em português: "Serviço personalizado").
5. Confirme com "Create Job" (em português: "Criar trabalho"). Os trabalhos criados aparecem nas visões de despacho e de agenda.

Se o projeto não tiver localização cadastrada, o sistema mostra o aviso "Project location not informed" (em português: "Localização do projeto não informada").

### Como despachar um serviço não atribuído

1. No painel "Unassigned Jobs" (ou em "Services without schedule dates" no calendário), encontre o serviço. Ele aparece quando o serviço não tem data de início nem prazo.
2. Clique em "Dispatch Now" (em português: "Despachar agora").
3. A tela de edição do agendamento do serviço abre. Defina a equipe, a data de início e o prazo, e salve. Veja a tela "Job Schedule" para os detalhes de edição.
4. Depois de salvo, o serviço sai da lista de não atribuídos.

Se nenhum serviço estiver sem data, a lista mostra "No unassigned services found." (em português: "Nenhum serviço não atribuído encontrado").

### Como criar uma tarefa

1. Abra a aba "Tasks" e clique em "Create task" (em português: "Criar tarefa").
2. Preencha o título, o projeto, a prioridade e, se quiser, os responsáveis ("Assignee", em português: "Responsável") e a data de vencimento ("Due Date", em português: "Data de vencimento").
3. Salve. A tarefa entra na coluna "Open" do kanban.

### Como alterar o status de uma tarefa

1. Abra a tarefa (pelo cartão do kanban ou pela linha da lista).
2. Escolha o novo status na lista de status. As opções são "Open", "In Progress", "Completed" e "Canceled".
3. Salve. A tarefa passa para a coluna correspondente.

## Status e ciclo de vida

**Tarefas** têm quatro status:

- "Open" (em português: "Aberta"): tarefa criada e ainda não iniciada. É o status inicial de toda tarefa nova.
- "In Progress" (em português: "Em andamento"): alguém começou a executar.
- "Completed" (em português: "Concluída"): tarefa finalizada.
- "Canceled" (em português: "Cancelada"): tarefa cancelada e que não precisa mais ser executada.

Tarefas têm prioridade "Low" (em português: "Baixa"), "Medium" (em português: "Média"), "High" (em português: "Alta") ou "Urgent" (em português: "Urgente").

**Trabalhos (serviços) no despacho** aparecem como "Unassigned" enquanto não têm data. Depois de agendados, os cartões nas abas "Dispatch Board" e "Calendar" mostram uma etiqueta de status calculada automaticamente pelo sistema (não é escolhida pelo usuário):

- "Completed" (em português: "Concluído"): o agendamento foi marcado como concluído na agenda (veja a tela "Job Schedule").
- "Delayed" (em português: "Atrasado"): o horário de fim (ou o prazo) já passou e o trabalho não foi marcado como concluído.
- "In Progress" (em português: "Em andamento"): o horário atual está entre o início e o fim do agendamento.
- "Scheduled" (em português: "Agendado"): o agendamento ainda não começou.

Para tirar um trabalho de "Delayed", marque-o como concluído na agenda ou ajuste as datas.

O rótulo "On the Way" (em português: "A caminho") existe nas traduções da tela, mas o sistema não gera esse status hoje: os cartões usam apenas "Completed", "Delayed", "In Progress" e "Scheduled".

**Pessoas na equipe** aparecem como "On Site" (em português: "No local") ou "Off Site" (em português: "Fora do local"). Esse estado vem do último registro de localização enviado pelo aplicativo do funcionário, que indica se ele estava dentro do local do projeto.

## Regras de negócio

- **Trabalho não atribuído:** é um serviço de um projeto da empresa que não tem data de início nem prazo. Assim que recebe uma das datas, sai da lista.
- **Atrasado e vence hoje:** os painéis usam a data do prazo do trabalho ou da tarefa. "Overdue" (atrasado) é o prazo que já passou; "Due Today" (vence hoje) é o prazo do dia atual.
- **Painel de equipe:** mostra no máximo cinco funcionários de cada vez, com os que estão "Off Site" listados primeiro.
- **Criação de trabalho:** cada projeto escolhido precisa ter um serviço definido na etapa. Projetos sem localização cadastrada geram o aviso de localização não informada.
- **Mapa:** se o aplicativo do funcionário não enviou localização recente, ele aparece como "without current GPS" (sem GPS atual), com a última localização conhecida quando existir.

## Relação com outros módulos

- **Job Schedule (Agenda):** é a fonte das datas. Criar, editar e excluir agendamentos é feito lá. Os serviços sem data aparecem aqui como não atribuídos.
- **Projects (Projetos):** os projetos e serviços que podem ser despachados são os cadastrados nos projetos da empresa.
- **Time Cards (Ponto):** as horas registradas pelos funcionários são acompanhadas no ponto; o despacho mostra quem está no local no momento.
- **Activities (Atividades):** mostra quem está registrado como ativo no dia; o despacho acrescenta o planejamento e as tarefas.
- **Subcontractors (Subcontratados):** podem ser escolhidos como responsáveis pelos trabalhos.

## Dúvidas frequentes

**P:** Por que um serviço não aparece no calendário?
**R:** Porque ele ainda não tem data de início e prazo. Ele aparece em "Unassigned Jobs" no despacho, e você pode usar "Dispatch Now" para agendá-lo.

**P:** O que significa "Off Site" no painel de equipe?
**R:** Que a última localização recebida do funcionário está fora do raio do local do projeto. Para ver mais, abra a aba "Map (Beta)".

**P:** Um funcionário aparece como "without current GPS". O que fazer?
**R:** Peça que ele abra o aplicativo, confirme que a localização está ativada e que o aplicativo tem permissão para usá-la.

**P:** Posso criar um trabalho sem escolher um serviço?
**R:** Não. Cada projeto escolhido precisa de um serviço na etapa de criação. Se o serviço não existir, crie um "Custom Service".

**P:** Qual a diferença entre tarefa e trabalho?
**R:** Trabalho é o serviço agendado de um projeto, com data e equipe. Tarefa é uma atividade avulsa, com título, prioridade e responsável, que pode ser vinculada a um projeto.

**P:** Como vejo tarefas atrasadas?
**R:** Na aba "Tasks", use os filtros de status, ou veja o painel "Task Focus" no "Dispatch Board", que lista as tarefas com prazo vencido.

**P:** Posso mudar o status de uma tarefa para "Canceled"?
**R:** Sim. Abra a tarefa, escolha "Canceled" na lista de status e salve. A tarefa vai para a coluna "Canceled" do kanban.
