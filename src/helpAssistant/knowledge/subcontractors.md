---
title: Subcontratados
module: people
routes: [/seller/subcontractors, /seller/subcontractors/:subcontractorId, /seller/subcontractors/:subcontractorId/files, /subcontractor-invite]
---

# Subcontratados

## Para que serve

A tela "Subcontractors" é o cadastro de subcontratados da sua empresa: as pessoas ou empresas terceirizadas que executam serviços nos seus projetos. A partir dela você cadastra, edita e exclui subcontratados, acompanha quanto já foi lançado como custo para cada um, exporta relatórios, guarda arquivos e pastas de cada subcontratado e pode convidar representantes do subcontratado para acessar o SmartBuild.

Os custos dos subcontratados são lançados nos projetos (na aba de custos de subcontratado do projeto). Esta tela mostra o resultado desses lançamentos.

## Onde encontrar

- Menu lateral: grupo "Workflow", item "Subcontractors".
- Lista: `/seller/subcontractors`.
- Detalhes de um subcontratado: `/seller/subcontractors/:subcontractorId` (aberto ao clicar na linha da lista).
- Arquivos e pastas de um subcontratado: `/seller/subcontractors/:subcontractorId/files` (ícone de pasta na linha da lista, ou botão "Files" na página de detalhes).
- Convite de representante: página pública aberta pelo link enviado por e-mail (ver "Como convidar um representante do subcontratado").
- Quem vê: é preciso ter a permissão **"Subcontractors"** para abrir a lista, os detalhes e os arquivos. Para gerenciar o acesso ao app (convites e revogações), é preciso ser administrador/owner da empresa ou ter, ao mesmo tempo, as permissões "Subcontractors" e "User Management".

## O que aparece na tela

### Lista de subcontratados

- Título: "Subcontractors".
- Cards de totais no topo:
  - "Total": quantidade de subcontratados cadastrados.
  - "New this month": subcontratados cadastrados no mês corrente.
- Campo de busca com o placeholder "Search subcontractors...".
- Botões no topo:
  - "Manage categories" (gestão das categorias usadas nas solicitações de orçamento, ver "Relação com outros módulos").
  - "New Subcontractor".
  - Botão de exportação, com as opções "Subcontractors" (Export PDF / Export Excel) e "Services" (Export PDF / Export Excel).
  - Uma opção de visualização com o rótulo "Subcontractor Cost" (ativa/desativa a visão de custos por serviço).
- Tabela, visão padrão, com as colunas:
  - "Subcontractor" (nome em destaque, com o e-mail abaixo). Ordenável.
  - "Phone".
  - "Projects" (quantidade de projetos em que o subcontratado tem lançamentos). Ordenável.
  - "Cost" (total de custo lançado para o subcontratado). Ordenável.
  - "Actions": ícone de pasta ("Files"), ícone de edição e ícone de exclusão.
- Ao clicar em uma linha, abre-se a página de detalhes do subcontratado.
- Quando a lista está vazia aparece "No subcontractors found" com a orientação "Add a new subcontractor to get started".
- Visão "Subcontractor cost" (por serviço): a tabela muda para as colunas "Start Date", "End Date", "Subcontractor", "Work Location", "Payment Date" e "Price", agrupadas por serviço. Cada grupo mostra o total com o rótulo "Total for N entry · [serviço]". Se não houver lançamentos, aparece "No service cost entries", com a explicação de que as entradas aparecem quando os subcontratados têm horas trabalhadas vinculadas a serviços.

### Página de detalhes do subcontratado

- Cabeçalho com o nome, o botão "Edit", o botão "Files" e o botão de exportação "Export".
- Dados de contato do subcontratado (nome, e-mail, telefone e endereço).
- Indicadores:
  - "Total Projects".
  - "Total Paid" (soma dos custos lançados para este subcontratado, como explicado em "Regras de negócio").
- Seção de acesso ao app, com o título "App access" (ver "Acesso ao app para representantes").
- Lista de projetos em que o subcontratado trabalhou. Cada projeto mostra a data de criação ("Creation Date"), o valor do projeto ("Value"), o custo do subcontratado no projeto (com a quantidade de lançamentos, por exemplo "2 entries") e o percentual que esse custo representa do valor do projeto ("Subcontractor Cost: X%").
- Filtro "Search projects..." e opções de exportação de projetos em PDF ou Excel. Ao exportar, a tela pede para selecionar ao menos um projeto ("Please select at least one project to export").
- Se o subcontratado não trabalhou em nenhum projeto, aparece "No projects found" com a mensagem "This subcontractor hasn't worked on any projects yet.". Se um projeto não tiver lançamentos, aparece "No cost entries for this project.".

### Página de arquivos do subcontratado

- Título: "Files", com a descrição "Manage files and folders for this subcontractor".
- Botão "New Folder" (cria uma pasta) e botão "New File" (com as opções "Text File" e "Upload File").
- Seção "Folders", com as pastas criadas, e a seção de arquivos soltos (sem pasta).
- Ao abrir uma pasta, o título passa a ser o nome da pasta, com a descrição "Files inside folder". O botão passa a ser "Add File". Se estiver vazia: "No files in this folder" com "Add files to get started".
- Se não houver nada: "No files or folders" com "Start by creating a folder or adding files".

## Status e ciclo de vida

O cadastro do subcontratado não tem status. O que muda ao longo do tempo:

- **Cadastrado**: aparece na lista e pode receber lançamentos de custo nos projetos.
- **Com lançamentos**: não pode ser excluído enquanto houver horas/custos lançados para ele. Para excluir, primeiro remova esses lançamentos.
- **Excluído**: removido da lista. Não é possível excluir um subcontratado que já tenha vínculos em outros registros (ver "Regras de negócio").

Acesso ao app dos representantes (cada um tem seu próprio estado):

- **Convite pendente**: convite enviado, ainda não aceito. Vale por 7 dias. Após esse prazo, o status mostra "Expired" e o link deixa de funcionar.
- **Convite aceito**: a pessoa aceitou o convite e criou/confirmou a senha. Ele aparece como "Accepted".
- **Ativo** ("Active"): a pessoa tem acesso ao app como representante deste subcontratado.
- **Revogado** ("Revoked"): o acesso foi retirado. A conta e o histórico são preservados.
- **Conta desativada** ("Account disabled"): mostrado no lugar do status quando a conta da pessoa está desativada.

Estados de envio do convite: "Sent", "Delivery pending" e "Delivery failed".

## Regras de negócio

### Cadastro e edição

- Para cadastrar, são obrigatórios **Name** e **Email**. O e-mail precisa estar em formato válido ("Invalid email").
- **Phone** e **Address** são opcionais.
- Não é possível ter dois subcontratados com o mesmo e-mail na mesma empresa. A mensagem é "A subcontractor with this email already exists in your company!".
- Ao criar, aparece "Subcontractor created successfully!". Ao editar, "Subcontractor updated successfully!".

### Exclusão

- O sistema pede confirmação com a pergunta "Are you sure you want to delete [nome]? This action cannot be undone."
- Não é possível excluir um subcontratado que tenha horas/custos lançados ("Cannot delete subcontractor with existing work entries. Please remove all work entries first.").
- Se o subcontratado tiver outros vínculos no sistema, a exclusão é bloqueada com a mensagem "Cannot delete a subcontractor with linked records. Revoke app access instead to preserve history." Nesse caso, a orientação é revogar o acesso ao app em vez de excluir.

### Custos (Total Paid e Cost)

- O valor de "Cost" na lista e "Total Paid" na página de detalhes são a soma dos custos lançados para o subcontratado nos projetos.
- Cada lançamento usa o preço fixo, quando o tipo de preço é fixo, ou o valor por hora, quando o tipo é por hora.
- "Total Paid" soma os lançamentos; a tela não distingue, nesse total, lançamentos já pagos dos ainda não pagos.
- "Projects" conta os projetos distintos em que o subcontratado tem lançamentos.
- O percentual "Subcontractor Cost" de cada projeto é o custo do subcontratado naquele projeto dividido pelo valor do projeto. Se o valor do projeto for zero, o percentual aparece como 0.0%.

### Exportação

- A exportação da lista pode gerar um relatório dos subcontratados selecionados (nome, e-mail, telefone, projetos e custo total) ou um relatório com os serviços e custos de cada um.
- Para exportar, clique no botão de exportação, escolha o tipo ("Subcontractors" ou "Services") e o formato (PDF ou Excel). A tela entra no modo de seleção; marque os subcontratados e clique novamente no formato escolhido.
- Se nenhum subcontratado estiver selecionado, aparece "Select at least one subcontractor to export.".
- Mensagens de sucesso: "PDF exported successfully." ou "Excel exported successfully.".

### Arquivos e pastas

- Tipos aceitos para upload: imagens e documentos ("Images and documents only (no videos)"). Os formatos aceitos pelo seletor são imagens, PDF, Word (doc/docx), Excel (xls/xlsx), CSV e TXT.
- Vídeos não são aceitos: "Video files are not allowed. Please upload images or documents only.".
- Um arquivo de texto ("Text File") precisa de nome e de conteúdo. Se faltar, aparece "Content is required." ou "File name is required".
- Uma pasta precisa de nome ("Please enter a folder name").
- Ao excluir uma pasta, todos os arquivos dentro dela também são excluídos. O aviso é "Warning: All files inside this folder will also be deleted.".
- Arquivos soltos (sem pasta) aparecem separados das pastas.

### Acesso ao app para representantes

- Quem pode gerenciar: administrador/owner da empresa, ou quem tem as permissões "Subcontractors" e "User Management" ao mesmo tempo. Quem não tem permissão vê a mensagem "Only company administrators or roles with Subcontractors and User Management permissions can manage app access.".
- Para convidar, informe o nome do representante ("Representative name") e o e-mail de acesso ("Login email") e clique em "Send invitation". A mensagem de sucesso é "Invitation sent.".
- O convite é enviado por e-mail e vale por 7 dias. Um mesmo convite só pode ser reenviado depois de cerca de 1 minuto. Se houver muitas tentativas seguidas, aparece "Please wait before trying again.".
- Não é possível convidar uma pessoa que já tenha acesso ativo a este subcontratado ("This person already has access to this subcontractor.").
- Para reenviar, clique em "Resend invitation" (disponível para convites que ainda não foram aceitos). Para cancelar um convite pendente, clique em "Cancel invitation" e confirme. O link do convite deixa de funcionar.
- Para retirar o acesso de um representante, clique em "Revoke access" e confirme. A pergunta de confirmação diz que a conta e o histórico serão preservados.
- O representante que aceita o convite cria uma senha com pelo menos 12 caracteres (máximo de 72). Se já tiver uma conta de subcontratado, usa a senha dessa conta. A senha e a confirmação precisam ser iguais ("The passwords do not match.").
- Ao aceitar, aparece "Invitation accepted" com a confirmação do acesso.
- Um convite inválido, expirado ou cancelado mostra: "This invitation is invalid, expired or canceled. Ask the company for a new invitation.".

## Como fazer

### Como cadastrar um subcontratado

1. Na tela Subcontractors, clique em "New Subcontractor".
2. Preencha "Name" (obrigatório), "Email" (obrigatório) e, se quiser, "Phone" e "Address".
3. Clique em "Save". Enquanto salva, o botão mostra "Saving...".
4. Ao concluir, aparece "Subcontractor created successfully!" e a lista é atualizada.

### Como editar um subcontratado

1. Na lista, clique no ícone de lápis na linha do subcontratado (ou clique em "Edit" na página de detalhes).
2. Altere os campos na janela "Edit Subcontractor".
3. Clique em "Save".

### Como excluir um subcontratado

1. Na lista, clique no ícone de lixeira na linha do subcontratado.
2. Confirme na janela "Delete Subcontractor". Se houver lançamentos de custo, a exclusão não será concluída; remova primeiro os lançamentos (na aba de custos do projeto) e tente de novo.
3. Se aparecer a mensagem de vínculos, use a revogação do acesso ao app, em vez da exclusão.

### Como ver os projetos e custos de um subcontratado

1. Na lista, clique na linha do subcontratado.
2. Veja os indicadores "Total Projects" e "Total Paid".
3. Na lista de projetos, veja o custo e o percentual de cada projeto. Clique em um projeto para abri-lo ("View in project").

### Como exportar a lista de subcontratados

1. Clique no botão de exportação e escolha "Subcontractors" ou "Services" e o formato (PDF ou Excel).
2. Marque os subcontratados que quer exportar.
3. Clique de novo no mesmo formato para gerar o arquivo.
4. Use "Cancel" para sair do modo de seleção.

### Como exportar os projetos de um subcontratado

1. Na página de detalhes, clique em "Export" e escolha PDF ou Excel.
2. Marque os projetos (ou use "Select all projects").
3. Clique de novo no mesmo formato para gerar o arquivo.

### Como criar uma pasta e adicionar arquivos

1. Na página de arquivos do subcontratado, clique em "New Folder" e informe o nome. Clique em "Create Folder".
2. Para adicionar um arquivo, abra a pasta (ou fique na raiz) e clique em "New File" (ou "Add File", dentro de uma pasta).
3. Escolha "Upload File" e selecione o arquivo (imagens ou documentos). Dê um nome e uma descrição, se quiser.
4. Para criar um arquivo de texto, escolha "Text File", informe o nome e escreva o conteúdo. Clique em "Create Text File".
5. Em cada arquivo, abra as opções do cartão e escolha "View", "Download", "Edit" ou "Delete".

### Como renomear ou excluir uma pasta

1. Na página de arquivos, abra as opções da pasta e escolha "Rename" ou "Delete".
2. Ao excluir, confirme. Lembre-se de que todos os arquivos dentro dela serão excluídos.

### Como convidar um representante do subcontratado

1. Abra a página de detalhes do subcontratado.
2. Na seção "App access", preencha "Representative name" e "Login email".
3. Clique em "Send invitation".
4. A pessoa recebe o e-mail com o link. Ao abrir o link, ela informa a senha (ou a senha da conta de subcontratado que já tem) e clica em "Accept invitation".
5. Acompanhe o status na mesma seção ("Pending", "Accepted", "Active", "Expired").

### Como revogar o acesso de um representante

1. Na seção "App access" da página de detalhes, clique em "Revoke access" ao lado da pessoa.
2. Confirme em "Revoke access". Para cancelar sem alterar nada, clique em "Keep access".

## Relação com outros módulos

- **Projects**: os custos dos subcontratados são lançados nos projetos. Os valores de "Cost", "Total Paid", "Projects" e o percentual por projeto vêm desses lançamentos.
- **Bid Requests** (Solicitações de orçamento): os subcontratados são convidados para as solicitações. As categorias gerenciadas em "Manage categories" são usadas para escolher os destinatários das solicitações.
- **Work Orders** (Ordens de trabalho): ordens de trabalho são enviadas a subcontratados; o cadastro é o mesmo.
- **User Management** e permissões: controlam quem pode gerenciar o acesso ao app dos representantes (ver "Regras de negócio").
- **Clients**: não há ligação direta entre cadastro de cliente e subcontratado.

## Dúvidas frequentes

**P:** Por que não consigo excluir um subcontratado?
**R:** Porque ele tem horas ou custos lançados em projetos. Remova esses lançamentos e tente de novo. Se ele já estiver vinculado a outros registros, a exclusão é bloqueada para preservar o histórico: nesse caso, revogue o acesso ao app em vez de excluir.

**P:** O que é "Total Paid" na página do subcontratado?
**R:** É a soma dos custos lançados para ele nos projetos. A tela não separa lançamentos pagos de não pagos nesse total.

**P:** Como o percentual do projeto é calculado?
**R:** Divide-se o custo do subcontratado naquele projeto pelo valor do projeto e multiplica-se por 100. Se o valor do projeto for zero, o percentual aparece como 0.0%.

**P:** Onde lanço um custo para o subcontratado?
**R:** Nos projetos, na aba de custos de subcontratado. Esta tela mostra o resultado desses lançamentos.

**P:** O convite do representante expirou. O que faço?
**R:** Os convites valem por 7 dias. Na seção "App access", use "Resend invitation" para enviar um novo convite à mesma pessoa. Se o status mostrar "Delivery failed", confira o e-mail e reenvie.

**P:** Posso enviar um convite para alguém que já tem acesso?
**R:** Não. Se a pessoa já tem acesso ativo a este subcontratado, o sistema informa que ela já tem acesso.

**P:** Quem pode gerenciar o acesso ao app?
**R:** Administradores/owner da empresa, ou usuários que tenham as permissões "Subcontractors" e "User Management" ao mesmo tempo.

**P:** Posso enviar vídeos na pasta de arquivos do subcontratado?
**R:** Não. São aceitos apenas imagens e documentos.

**P:** Ao excluir uma pasta, os arquivos somem?
**R:** Sim. Excluir a pasta apaga também os arquivos que estão dentro dela. Os arquivos soltos (fora de pastas) não são afetados.

**P:** Por que o e-mail do subcontratado não pode ser usado de novo?
**R:** Cada e-mail só pode existir uma vez por empresa. Edite o cadastro existente em vez de criar outro.

**P:** O que acontece quando revogo o acesso de um representante?
**R:** Ele perde o acesso ao app como representante deste subcontratado. A conta e o histórico são preservados.
