---
title: Job Schedule (Agenda de trabalhos)
module: operations
routes: [/seller-schedule, /seller/seller-schedule]
---

# Job Schedule (Agenda de trabalhos)

## Para que serve

A tela "Job Schedule" é a agenda de trabalhos da empresa. Nela você vê, em formato de calendário, os projetos e serviços que têm data de início e prazo (deadline), cria novos agendamentos, edita a equipe e as datas, envia lembretes e avisa o cliente e a equipe por e-mail quando um agendamento é criado ou alterado.

O mesmo conjunto de agendamentos também aparece na tela "Job Dispatch" (despacho). A agenda é o lugar de planejar as datas; o despacho é o lugar de acompanhar o dia a dia da equipe.

## Onde encontrar

- Menu lateral: grupo "Schedule", item "Job Schedule".
- Também existe um item "Agenda" > "Seller Schedule" em outro menu de navegação do sistema, que abre a mesma tela. Esse caminho não verifica a permissão "Job Schedule".
- Quem vê: usuários que têm a permissão **"Job Schedule"**. Sem essa permissão, a tela não aparece no menu e a página exibe a mensagem de acesso negado do sistema.

## O que aparece na tela

- Título da página: "Job Schedule", com a descrição "Manage and view all scheduled jobs across your projects" (em português: "Gerencie e visualize todos os trabalhos agendados nos seus projetos").
- Campo de busca no canto superior direito, com o texto "Search jobs, clients, locations..." (em português: "Buscar trabalhos, clientes, locais..."). A busca filtra pelo nome do trabalho, nome do cliente, local do projeto e número do contrato.
- Botão "New" (em português: "Novo"), que abre o formulário de novo agendamento.
- Calendário com os agendamentos. Cada dia mostra os trabalhos daquela data. Quando há muitos trabalhos no mesmo dia, aparece o indicador "+N more" (em português: "mais").
- Botão "Today" (em português: "Hoje") para voltar ao dia atual e botão "New Schedule" (em português: "Novo agendamento").
- Quando um dia não tem trabalhos, aparece "No scheduled jobs for this date" (em português: "Nenhum trabalho agendado para esta data").
- Cada cartão de trabalho mostra o nome do projeto, o cliente, "Start:" (em português: "Início:"), "Deadline:" (em português: "Prazo:") e "Responsibles:" (em português: "Responsáveis:"), com as iniciais ou fotos dos responsáveis.
- Cada cartão tem as ações "Send Reminder" (em português: "Enviar lembrete"), "Edit" (em português: "Editar") e "Delete" (em português: "Excluir").

## Como fazer

### Como criar um agendamento

1. Clique em "New" (ou em "New Schedule"). Se você clicar diretamente em um dia do calendário, a data de início já vem preenchida com esse dia.
2. Na primeira etapa, "Select Project" (em português: "Selecionar projeto"), busque o projeto pelo cliente, contrato ou local ("Search by client, contract or location...") e clique nele. Os dados do projeto (cliente, contrato) aparecem ao lado.
3. Clique em "Next" (em português: "Avançar").
4. Na etapa "Schedule Details" (em português: "Detalhes do agendamento"), preencha:
   - "Start Date" (em português: "Data de início"), obrigatório.
   - "Deadline" (em português: "Prazo"), obrigatório. O calendário não deixa escolher uma data anterior à data de início.
   - "Recipient Emails" (destinatários), campo marcado como obrigatório para o envio de e-mail.
   - "Notes to customer (Optional)" (em português: "Notas para o cliente (opcional)"), uma observação que vai no e-mail.
   - "Attachments (Max 25MB)" (em português: "Anexos (máximo 25MB)"), arquivos que acompanham o e-mail. Se o total passar de 25 MB, o sistema mostra "Total file size exceeds 25MB limit" (em português: o tamanho total dos arquivos excede o limite de 25 MB).
5. Em celular, para ver como o e-mail vai ficar, clique em "Preview" (em português: "Prévia"). Abre-se o "Email Preview" (em português: "Prévia do e-mail"), que pode ser fechado com "Close Preview". Em telas maiores, a prévia aparece ao lado do formulário.
6. Escolha uma das opções para salvar:
   - "Save" (em português: "Salvar"): cria o agendamento sem enviar e-mail.
   - "Save and Send" (em português: "Salvar e enviar"): cria o agendamento e envia o e-mail de notificação.
7. Use "Back" (em português: "Voltar") para voltar à escolha do projeto, ou "Cancel" (em português: "Cancelar") para fechar sem salvar.

Ao concluir, aparece a mensagem "Project scheduled successfully!" (em português: "Projeto agendado com sucesso!"). Se algo falhar, aparece "Failed to create schedule" (em português: "Falha ao criar o agendamento").

### Como editar um agendamento

1. Clique em "Edit" (em português: "Editar") no cartão do trabalho. Abre-se a janela de edição do agendamento do projeto.
2. Ajuste "Start Date" (em português: "Data de início") e "Deadline" (em português: "Prazo"), que são obrigatórios. Nessa janela também é possível alterar "Recipient Emails" (destinatários), "Notes to customer (Optional)" (em português: "Notas para o cliente (opcional)") e os anexos.
3. Escolha "Save" (em português: "Salvar"), que grava sem enviar e-mail, ou "Save and Send" (em português: "Salvar e enviar"), que grava e envia o e-mail de atualização. Os dois botões só ficam habilitados quando há alguma alteração.
4. Ao salvar, o sistema informa "Project schedule updated successfully!" (em português: "Agenda do projeto atualizada com sucesso!").

A escolha de equipe (funcionários e subcontratados), o aprimoramento de descrição com IA e a opção "Notify Client" não aparecem nessa janela. Eles ficam na edição do serviço, usada no despacho e na aba de agenda do projeto.

### Como enviar um lembrete

1. Clique em "Send Reminder" (em português: "Enviar lembrete") no cartão do trabalho.
2. Informe os e-mails dos destinatários. É preciso ter pelo menos um e-mail válido.
3. Opcionalmente, escreva uma nota para o cliente e anexe arquivos (até 25 MB no total).
4. Veja a prévia do e-mail, se quiser, e confirme o envio.

O sistema informa "Reminder emails sent successfully!" (em português: "E-mails de lembrete enviados com sucesso!"). O e-mail traz os detalhes da atribuição, o local e um link para abrir o projeto no mapa.

### Como excluir um agendamento

1. Clique em "Delete" (em português: "Excluir") no cartão do trabalho.
2. Confirme na janela de confirmação. O texto da confirmação é "Are you sure you want to delete this project schedule?" (em português: tem certeza de que deseja excluir a agenda deste projeto?).
3. O sistema informa "Project schedule deleted successfully!" (em português: "Agenda do projeto excluída com sucesso!").

Excluir a agenda remove apenas as datas de início e prazo do projeto. O projeto e os serviços continuam cadastrados (veja a seção de regras de negócio).

### Como marcar um trabalho como concluído

A ação "Mark as Completed" (em português: "Marcar como concluído") não fica nesta tela. Ela está na aba de agenda da página de detalhes do projeto. Depois de confirmada, o sistema informa "Job marked as completed successfully!" (em português: "Trabalho marcado como concluído com sucesso!").

## Status e ciclo de vida

Um trabalho na agenda pode estar em um destes estados. Eles não são um campo com nome na tela; são deduzidos das datas e da marcação de conclusão:

- **Sem data (não agendado):** o serviço não tem data de início nem prazo. Ele não aparece no calendário, mas aparece como "Unassigned" (em português: "Não atribuído") na tela de despacho.
- **Agendado:** o serviço tem data de início e prazo. Aparece no calendário, no dia da data de início, com os responsáveis.
- **Concluído:** o serviço foi marcado como concluído. No calendário, o nome aparece riscado e o cartão fica levemente apagado.

## Regras de negócio

- **Datas obrigatórias:** para criar um agendamento é preciso escolher o projeto, a data de início e o prazo. O botão "Next" só fica habilitado com o projeto escolhido. Os botões "Save" e "Save and Send" só ficam habilitados com a data de início e o prazo.
- **Prazo não pode ser antes do início:** o calendário bloqueia datas anteriores à data de início.
- **Salvar sem enviar:** "Save" cria o agendamento e não envia nenhum e-mail.
- **Salvar e enviar:** "Save and Send" cria o agendamento e envia o e-mail de notificação. Os destinatários são os e-mails digitados, separados por vírgula. Se o campo de destinatários ficar vazio, o e-mail é enviado para o e-mail do cliente cadastrado no projeto.
- **Anexos:** o total dos arquivos anexados é limitado a 25 MB.
- **Lembrete:** exige pelo menos um e-mail válido. Se nenhum destinatário for informado, o sistema retorna "Recipient emails (to) are required" (os e-mails dos destinatários são obrigatórios).
- **Excluir agendamento:** remove a data de início e o prazo do projeto. A ação não envia e-mails.
- **Marcar como concluído:** registra o serviço como concluído. A ação não envia e-mail.
- **Busca:** filtra os trabalhos pelo nome, cliente, local e número do contrato, sem diferenciar maiúsculas de minúsculas.

## Relação com outros módulos

- **Projects (Projetos):** a agenda usa os projetos e serviços cadastrados. A aba de agenda da página de detalhes do projeto é onde também se marca um trabalho como concluído.
- **Job Dispatch (Despacho):** mostra os mesmos agendamentos em visões de dia, semana e mês. Serviços sem data aparecem no painel de não atribuídos do despacho, com o botão "Dispatch Now" (em português: "Despachar agora").
- **Subcontractors (Subcontratados):** podem ser escolhidos como responsáveis na edição do agendamento e recebem os e-mails de atribuição.
- **Time Cards (Ponto):** as horas dos funcionários são registradas no ponto no dia em que trabalharam, independentemente da agenda.
- **Clients (Clientes):** o e-mail e o nome do cliente cadastrados são usados quando nenhum destinatário é informado no envio do agendamento.

## Dúvidas frequentes

**P:** Preciso enviar o e-mail sempre que criar um agendamento?
**R:** Não. Use "Save" para criar sem enviar. Use "Save and Send" quando quiser que o cliente ou a equipe seja avisada.

**P:** Quem recebe o e-mail se eu não digitar nenhum destinatário?
**R:** O e-mail vai para o endereço do cliente cadastrado no projeto, quando ele existe.

**P:** Posso anexar fotos e plantas ao agendamento?
**R:** Sim, em "Attachments (Max 25MB)". O limite é de 25 MB somados todos os arquivos.

**P:** Como mudo a data de um trabalho que já está agendado?
**R:** Clique em "Edit" no cartão do trabalho, ajuste as datas e salve. Para avisar por e-mail, use "Save and Send" e informe os destinatários.

**P:** O que acontece se eu excluir um agendamento?
**R:** As datas de início e prazo do projeto são removidas. O projeto e os serviços continuam cadastrados. O sistema pede confirmação antes de excluir.

**P:** Por que um trabalho aparece riscado?
**R:** Ele foi marcado como concluído. A marcação é feita na página de detalhes do projeto, na aba de agenda.

**P:** Um lembrete não foi enviado. O que verificar?
**R:** Confirme se há pelo menos um e-mail válido no campo de destinatários. Se o sistema mostrar "Failed to send notification email", tente novamente ou verifique o e-mail do destinatário.

**P:** Não consigo ver a agenda. Por quê?
**R:** A tela só aparece para quem tem a permissão "Job Schedule". Peça ao administrador da empresa para liberá-la no seu cargo.
