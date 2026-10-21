---
title: Time Cards (Cartões de ponto)
module: operations
routes: [/time-cards, /time-cards/details/:id]
---

# Time Cards (Cartões de ponto)

## Para que serve

A tela "Time Cards" mostra as horas trabalhadas pelos funcionários da empresa em um período: entradas e saídas, pausas, horas normais, horas extras e o valor a pagar. A partir dela você exporta o relatório em PDF ou Excel, registra entrada e saída manualmente e analisa os pedidos de correção ou de lançamento que os funcionários enviam.

Esta tela é a base para a folha de pagamento. Os números dependem das regras de pausa (veja "Break Policies") e do valor por hora cadastrado para cada funcionário.

## Onde encontrar

- Menu lateral: grupo "Financials", item "Time Cards" (em português: "Cartões de ponto").
- Quem vê: usuários com a permissão **"Time Cards"**. Dentro da tela, cada aba exige uma permissão extra:
  - Aba "Employees" (em português: "Funcionários"): apenas a permissão "Time Cards".
  - Aba "Projects" (em português: "Projetos"): permissão **"Time Cards - Projects"**.
  - Aba "Payroll" (em português: "Folha de Ponto"): permissão **"Time Cards - Payroll"**.
  - Aba "Requests" (em português: "Solicitações"): permissão **"Time Cards - Requests"**.
- A página de detalhes de um funcionário abre ao clicar no nome dele na aba "Employees".

## O que aparece na tela

- Título "Time Cards" (em português: "Cartões de ponto") com o subtítulo "Track and manage employee work hours and project time" (em português: "Acompanhe e gerencie as horas de trabalho dos funcionários e o tempo do projeto").
- Seletor de período (date range), no canto superior direito. Ao abrir a tela, o período inicial é a semana atual, de domingo a sábado.
- Botões, nas abas Employees, Projects e Payroll:
  - "Manual Clock In/Out" (em português: "Entrada/Saída Manual").
  - "Export PDF" (em português: "Exportar PDF").
  - "Export Excel" (em português: "Export Excel"). Durante a geração aparece "Generating PDF..." (em português: "Gerando PDF...") ou "Generating Excel..." (em português: "Gerando Excel...").

### Aba "Employees" (em português: "Funcionários")

Cartões de resumo: "Total Hours" (em português: "Total de Horas"), "Regular Hours" (em português: "Horas Normais") e "Overtime Hours (x1.5)" (em português: "Horas Extras (x1.5)"). Abaixo, a tabela de funcionários com as colunas:

- "Name" (em português: "Nome").
- "Regular Hours" (em português: "Horas Normais").
- "Overtime Hours (x1.5)" (em português: "Horas Extras (x1.5)").
- "Total Break" (em português: "Pausa Total").
- "Total Hours" (em português: "Total de Horas").
- "Value" (em português: "Valor").

Ao clicar em um funcionário, a página de detalhes mostra os lançamentos dele no período, com as colunas "Address" (em português: "Endereço"), "Date" (em português: "Data"), "In/Out" (em português: "Entrada/Saída") e "Total" (em português: "Total"), além das ações do lançamento.

### Aba "Projects" (em português: "Projetos")

Lista o tempo e o custo por projeto no período, com os cards "Services" (em português: "Serviços"), "Projects" (em português: "Projetos") e "Workers" (em português: "Funcionários"). Mostra o total de horas e o custo de cada projeto.

### Aba "Payroll" (em português: "Folha de Ponto")

Resumo por funcionário para fechamento de folha. Mostra as horas normais, as horas extras e o total de cada pessoa, com o valor calculado. Ao expandir um funcionário, aparecem os lançamentos com as colunas "Project" (em português: "Projeto"), "Date" (em português: "Data"), "In/Out" (em português: "Entrada/Saída"), "Break" (em português: "Pausa") e "Total". Quando um funcionário não tem horas extras no período, a tabela mostra "Not overtime" (em português: "Sem horas extras").

### Aba "Requests" (em português: "Solicitações")

Lista os pedidos de edição de cartão de ponto enviados pelos funcionários.

- Filtros de status: "All" (em português: "Todos"), "Pending" (em português: "Pendente"), "Approved" (em português: "Aprovado") e "Denied" (em português: "Negado").
- Filtros de tipo: "All request types" (em português: "Todos os tipos"), "Corrections" (em português: "Correções") e "Missing entries" (em português: "Entradas ausentes").
- Colunas: "Employee" (em português: "Funcionário"), "Request Type" (em português: "Tipo de solicitação"), "Work Date" (em português: "Data de trabalho"), "Original Times" (em português: "Horários originais"), "Requested Times" (em português: "Horários solicitados"), "Reason" (em português: "Motivo"), "Status" (em português: "Status"), "Reviewed By" (em português: "Revisado por") e "Action" (em português: "Ação").
- Botão "Refresh" (em português: "Atualizar") para recarregar a lista.
- Se não houver pedidos, aparece "No time card edit requests found." (em português: "Nenhuma solicitação de edição de cartão de ponto encontrada").

## Como fazer

### Como exportar o relatório

1. Escolha o período no seletor de datas.
2. Na aba "Employees", "Projects" ou "Payroll", clique em "Export PDF" ou "Export Excel".
3. Aguarde a mensagem de geração. Se algo falhar, aparece "Erro ao gerar PDF. Tente novamente." (em português: "Erro ao gerar PDF. Tente novamente.") ou a versão equivalente para Excel.

O relatório usa o período e os filtros que estiverem na tela naquele momento.

### Como registrar entrada e saída manualmente

1. Clique em "Manual Clock In/Out" (em português: "Entrada/Saída Manual").
2. Preencha os dados do lançamento na janela que abrir e salve.
3. Depois de salvar, o lançamento passa a fazer parte dos cálculos do período.

### Como analisar um pedido de correção ou de lançamento ausente

1. Abra a aba "Requests" e use os filtros de status e tipo. Para ver só o que precisa de decisão, escolha "Pending".
2. Clique em "Review" (em português: "Revisão") ou "View" (em português: "Ver") na linha do pedido. Abre-se a janela "Review Time Card Request" (em português: "Revisar solicitação de cartão de ponto").
3. Confira os horários originais e os horários solicitados, o motivo ("Reason") e a nota do funcionário ("Employee Note", em português: "Nota do Funcionário"), se houver.
4. Escolha a decisão: "Approve" (em português: "Aprovar") ou "Deny" (em português: "Negar").
5. Se aprovar, confira ou ajuste os horários aprovados em "Approved Clock In" (em português: "Entrada de relógio aprovada") e "Approved Clock Out" (em português: "Saída aprovada"). A pré-visualização mostra "Approved Times (Preview)" (em português: "Horários aprovados (prévia)").
6. Escreva, se quiser, a nota do gerente em "Manager Notes" (em português: "Notas do Gerente"). Essa nota fica no histórico do pedido.
7. Desenhe a assinatura do gerente em "Manager Signature" (em português: "Assinatura do Gerente"). Ela é obrigatória para aprovar e para negar. O sistema não aceita assinatura digitada como texto, apenas desenhada.
8. Clique em "Submit Decision" (em português: "Enviar decisão").
9. Depois da decisão, o sistema gera um PDF do pedido. Use "Download PDF" (em português: "Baixar PDF") para baixá-lo.

Mensagens de sucesso: "Request approved and attendance created." (em português: "Solicitação aprovada e lançamento criado") para um lançamento ausente, "Request approved and attendance updated." (em português: "Solicitação aprovada e lançamento atualizado") para uma correção, e "Request denied." (em português: "Solicitação negada").

## Status e ciclo de vida

Um pedido de edição de cartão de ponto tem três status:

- **Pending** (em português: "Pendente"): enviado pelo funcionário, aguardando revisão. Enquanto estiver pendente, o funcionário não pode enviar outro pedido para o mesmo cartão.
- **Approved** (em português: "Aprovado"): o gerente aprovou. O lançamento é criado (no caso de entrada ausente) ou atualizado (no caso de correção) com os horários aprovados. A decisão não pode ser alterada depois.
- **Denied** (em português: "Negado"): o gerente negou. O lançamento original continua como estava.

Somente pedidos pendentes podem ser revistos. Se alguém tentar revisar um pedido que já foi decidido, o sistema recusa a ação.

Os tipos de pedido são:

- **Correction** (em português: "Correção"): pede a alteração de horários de um lançamento que já existe.
- **Missing entry** (em português: "Entrada ausente"): pede o lançamento de um período de trabalho que não foi registrado, informando projeto ou serviço, entrada e saída.

## Regras de negócio

### Como as horas são calculadas

- **Horas do dia:** é o tempo entre a entrada e a saída, descontadas as pausas e somados os intervalos curtos remunerados (veja abaixo).
- **Horas normais e extras do dia:** o sistema separa as horas que caem dentro do horário de expediente cadastrado para o funcionário daquelas que caem fora dele. Essa separação aparece nos detalhes, mas o valor a pagar depende da regra de horas extras descrita a seguir.
- **Intervalos curtos remunerados:** se houver uma pausa de até 20 minutos entre duas entradas consecutivas do mesmo dia, esse tempo conta como hora paga. A configuração é da empresa (veja "Break Policies") e pode ser desligada para um funcionário específico.
- **Pausas:** o desconto de pausa depende do modo de registro do funcionário (veja "Break Policies"). No modo automático, o desconto segue a política de pausa atribuída ao funcionário. No modo manual, o desconto vem das pausas que ele registrou.

### Como as horas extras são calculadas

- A contagem de 40 horas é feita por semana, de segunda-feira a domingo.
- Quando as horas da semana passam de 40, o excedente só é tratado como hora extra se o lançamento estiver marcado como hora extra (campo de horas extras do registro). Essa marcação é feita no registro do ponto. Quando o lançamento não está marcado, o excedente continua sendo contado como hora normal, sem o acréscimo de 50%.
- A hora extra é paga com acréscimo de 50% sobre o valor da hora do funcionário (fator x1.5).

### Como o valor é calculado

- **Valor por hora:** é o valor cadastrado no perfil do funcionário.
- **Valor de um dia sem hora extra:** horas do dia multiplicadas pelo valor da hora.
- **Valor de um dia com hora extra:** as horas normais até 40 da semana multiplicadas pelo valor da hora, mais as horas extras multiplicadas pelo valor da hora e por 1,5.
- O valor total do período é a soma dos valores de cada dia.

### Pausas

Veja a tela "Break Policies" para as regras detalhadas de desconto automático e de pausas manuais.

### Pedidos de edição

- **Quem pode enviar:** o próprio funcionário, e somente para os seus cartões de ponto. O pedido precisa do motivo (de 1 a 5.000 caracteres), da assinatura do funcionário e dos horários solicitados.
- **Correções:** precisam estar ligadas a um lançamento existente. Não é possível enviar outro pedido enquanto houver um pedido pendente para o mesmo lançamento.
- **Entradas ausentes:** precisam de empresa, projeto ou serviço e de horário de saída. O funcionário precisa estar atribuído ao serviço naquele período, e o projeto ou serviço não pode estar cancelado, recusado ou rejeitado. Não é possível enviar dois pedidos pendentes iguais.
- **Horários válidos:** a entrada e a saída não podem estar mais de 5 minutos no futuro. A saída precisa ser posterior à entrada. Um lançamento fechado não pode durar mais de 24 horas.
- **Quem revisa:** usuários do escritório "Owner" podem revisar sempre. Os demais precisam ter a permissão "Time Cards - Requests". Usuários dos escritórios "Worker" e "Master" não revisam pedidos.
- **Conflitos:** ao aprovar, o sistema não permite que o novo horário se sobreponha a outro lançamento do mesmo funcionário. Nesse caso, a aprovação é recusada e é preciso ajustar o outro lançamento primeiro.
- **Entrada ausente aprovada:** precisa ter horário de saída. Sem ele, a aprovação é recusada.
- **Notificações:** ao enviar um pedido, o sistema avisa os usuários do escritório que podem revisá-lo.

## Relação com outros módulos

- **Break Policies (Políticas de pausa):** definem os descontos de pausa que entram nas horas do dia. Ficam na configuração da empresa.
- **Job Dispatch e Activities (Despacho e Atividades):** mostram quem está trabalhando no momento. Os lançamentos que você vê aqui são os mesmos registrados pelo ponto.
- **Job Schedule (Agenda):** a agenda diz onde o funcionário deveria estar. O ponto mostra o que ele efetivamente registrou.
- **User Management (Gerenciamento de usuários):** é onde se cadastra o valor por hora, o horário de expediente e as configurações individuais de ponto de cada funcionário, como a permissão de editar o próprio cartão.
- **Projects (Projetos):** os lançamentos são associados a projetos e serviços, e os relatórios por projeto usam essa ligação.

## Dúvidas frequentes

**P:** Por que o meu funcionário tem horas acima de 40 e não aparece nenhuma hora extra?
**R:** O excedente só vira hora extra quando o lançamento está marcado como hora extra. Sem essa marcação, as horas são contadas como normais e pagas pelo valor da hora, sem o acréscimo de 50%.

**P:** Como é calculado o valor da hora extra?
**R:** Pelo valor da hora do funcionário multiplicado por 1,5, aplicado somente às horas que passam de 40 na semana e estão marcadas como hora extra.

**P:** Um funcionário esqueceu de bater o ponto. O que ele faz?
**R:** Ele envia um pedido do tipo "Missing entry" a partir do aplicativo, com projeto ou serviço, entrada e saída. O gerente revisa na aba "Requests".

**P:** Posso aprovar um pedido sem assinatura?
**R:** Não. A assinatura do gerente é obrigatória, e precisa ser desenhada, para aprovar ou para negar.

**P:** Depois de aprovar um pedido, posso mudar o horário?
**R:** Não. A decisão não pode ser alterada depois de enviada. Se houver erro, o funcionário precisa enviar um novo pedido.

**P:** Por que não consigo revisar pedidos?
**R:** Sua conta precisa ser "Owner" ou ter a permissão "Time Cards - Requests". Usuários dos escritórios "Worker" e "Master" não revisam pedidos.

**P:** O relatório exportado sai com o período diferente do que estou vendo?
**R:** Não. O relatório usa o período e os filtros da tela no momento da exportação. Confira o seletor de datas antes de exportar.

**P:** Por que a aba "Payroll" não aparece para mim?
**R:** A aba exige a permissão "Time Cards - Payroll". Peça ao administrador para liberá-la.
