---
title: Criar e editar orçamentos (manual e SmartBuilder AI)
module: estimates
routes: [/seller/new-estimate/type-estimate, /seller/new-estimate/client-data, /seller/new-estimate/services/:id, /seller/new-estimate/smart-builder/:id, /seller/new-estimate/services-summary/:id, /seller/estimates]
---

# Criar e editar orçamentos (manual e SmartBuilder AI)

## Para que serve

Esta base explica como criar um orçamento do zero e como editar um orçamento que já existe. Existem dois jeitos de criar:

- **Manual Builder** (Construtor manual): você escolhe o cliente, o local da obra e os serviços, um a um.
- **Smart AI Builder** (Construtor com IA): você descreve o projeto em texto, por voz ou enviando arquivos, e a IA sugere a lista de serviços e os valores. Depois você revisa e segue para o mesmo resumo final do modo manual.

Os dois caminhos terminam na mesma tela de resumo, onde você revisa o PDF, confere os valores e salva ou cria e envia o orçamento.

## Onde encontrar

- Na tela de Orçamentos (menu "Estimates"), clique no botão "New estimate" (em português, "Novo orçamento").
- Também é possível criar um orçamento a partir da aba "Estimate" dentro do detalhe de um projeto. Lá, o botão "New Estimate" abre uma escolha entre construção manual e com IA.
- Quem pode criar: é preciso ter a permissão **"Estimates"**. Sem ela, as telas de criação não abrem.

## O que aparece na tela

### Passo 1: escolha do tipo

- Título: "Create New Estimate".
- Dois cards:
  - "Manual Builder", com o selo "Most Popular". Descrição: criar o orçamento passo a passo, com controle total sobre cada detalhe.
  - "Smart AI Builder", com o selo "New". Descrição: a IA cria um orçamento inteligente com base na descrição do projeto, com recomendações.
- Em cada card aparece o texto "Select this option".

### Passo 2: dados do cliente

- Título: "Create New Estimate".
- Seção "Select Client": escolha um cliente existente com o campo "Search client...", ou clique em "New Client" para cadastrar um cliente novo na mesma tela.
- Quando o cliente tem contextos de trabalho (work contexts), aparece uma lista para escolher em qual contexto o orçamento será feito. Ao escolher, o nome, e-mail e telefone do contexto são usados no orçamento.
- Depois de escolher o cliente, aparece um bloco "Selected Client" com nome, e-mail, telefone e endereço do escritório.
- Seção "Property location" (local da obra): um mapa para marcar o local da obra. Quando o local é escolhido, aparece o aviso "Location Selected".
- Botão "Next" (próximo), que só fica ativo quando há cliente e local escolhidos.

### Passo 3A (manual): serviços

- Filtro de tipo: "Filter by type", com as opções de serviços e de materiais.
- Campo de busca "Search services...".
- Cada serviço aparece como um card, que pode ser adicionado ao orçamento.
- Botão "Custom service" (serviço personalizado): abre um formulário para um item que não está no catálogo, com nome, descrição e preço por unidade. O valor total do item é calculado na hora ("Total Value").
- Botão "To complete" (concluir): leva ao resumo final.
- Os serviços do carrinho aparecem em "Selected Services" (serviços selecionados), com a quantidade de itens.

### Passo 3B (SmartBuilder): conversa com a IA

- Área de conversa com a IA e um campo de texto com o placeholder "Describe your project, drag a file, or use the buttons...".
- Botões para anexar um documento, uma imagem, ou gravar um áudio. Enquanto grava, aparece "Recording... Click to stop", e depois "Transcribing audio...".
- Você também pode arrastar arquivos para a área da conversa.
- Tipos de arquivo aceitos: imagens, PDF, Word (.doc e .docx), Excel, CSV e TXT. Outros tipos mostram o aviso "Please upload images, PDF, Word or Excel files".
- Enquanto a IA trabalha, aparecem mensagens de progresso sobre a análise do projeto, a busca de serviços, o cálculo de custos, a geração das descrições e a finalização do orçamento.
- Quando a IA termina, abre-se a janela "Generated Estimate", com:
  - "Project Summary" (resumo do projeto): total de serviços e custo total estimado.
  - "Service Details" (detalhes dos serviços), com nome, quantidade e valor de cada item.
  - Botão "Close" (fechar), que apenas fecha a janela.
  - Botão "Review & Finalize Estimate" (revisar e finalizar orçamento), que aplica os serviços gerados ao orçamento e leva ao resumo final.
- Cada serviço gerado pode ser editado antes de finalizar, pelo mesmo formulário de serviço do modo manual.

### Passo 4: resumo e revisão final

- Título da janela: "ESTIMATE PROJECT".
- Pré-visualização do PDF do orçamento, aberta pelo botão "View Preview" (ver pré-visualização).
- Seções editáveis, que aparecem como blocos no editor:
  - Capa do orçamento ("Estimate Cover"), com o estilo visual do PDF ("PDF Template") e a cor de destaque ("Accent color").
  - Carta de introdução.
  - Serviços e valores ("Scope & Values"), com subtotal, desconto e total.
  - Termos e condições.
  - Local do projeto.
  - Anexos de imagens ("Image Attachments") e de PDFs ("PDF Attachments").
  - E-mails adicionais ("Additional Email Recipients").
  - Data de criação personalizada ("Custom Creation Date"), se quiser usar outra data que não a de hoje.
- Desconto: o desconto pode ser em valor fixo ou em percentual.
- Rodapé com os botões:
  - "Save" (salvar): salva o orçamento como pendente e volta para a lista de orçamentos.
  - "Create & Send" (criar e enviar): cria o orçamento, gera o PDF e abre a janela de envio por e-mail. Veja a base "Enviar e aprovar orçamentos com o cliente".

## Como fazer

### Como criar um orçamento manual

1. Na lista de orçamentos, clique em "New estimate".
2. Escolha o card "Manual Builder".
3. Escolha o cliente, ou cadastre um novo com "New Client". Em seguida marque o local da obra no mapa.
4. Clique em "Next".
5. Adicione os serviços da lista ou crie serviços personalizados com "Custom service". Use "To complete" quando terminar.
6. No resumo, revise a capa, a carta, os serviços, o desconto, os termos e os anexos.
7. Clique em "Save" para deixar o orçamento pendente e voltar à lista, ou em "Create & Send" para criar e enviar em seguida.

### Como criar um orçamento com o SmartBuilder AI

1. Na lista de orçamentos, clique em "New estimate" e escolha o card "Smart AI Builder".
2. Escolha o cliente e marque o local da obra. Clique em "Next".
3. Descreva o projeto no campo de texto. Você pode também anexar documentos e imagens, ou gravar um áudio.
4. Envie a mensagem. Aguarde a IA concluir a análise.
5. Leia o resumo "Generated estimate". Se quiser ajustes, responda na conversa, por exemplo pedindo para mudar um valor ou incluir um serviço.
6. Quando estiver satisfeito, clique em "Review & Finalize Estimate".
7. No resumo final, revise e clique em "Save" ou "Create & Send".

### Como usar um documento como base no SmartBuilder

1. Anexe o documento com a lista de serviços ou o escopo do trabalho.
2. Escreva na mensagem o que a IA deve fazer com ele, por exemplo copiar os itens do documento.
3. Quando o documento já tem uma lista de serviços, a IA tende a copiar os itens do documento sem expandir o escopo, a menos que você peça.

### Como editar um orçamento já criado

1. Na lista de orçamentos, clique na linha do orçamento.
2. Faça as alterações. Você pode mudar serviços (adicionar, editar ou remover), descrição, termos, desconto, e-mails adicionais, data, local e dados do cliente.
3. Para remover um serviço, confirme na janela "Confirm Service Removal" (confirmar remoção do serviço). Essa ação não pode ser desfeita.
4. Clique em "Save Changes" para salvar, ou em "Save And Send" para salvar e enviar por e-mail.

### Como editar pela aba de Estimate do projeto

1. Abra o projeto e vá até a aba "Estimate".
2. Clique em "Edit Estimate" (editar orçamento) no menu de ações do orçamento.
3. As alterações são salvas e o PDF é gerado de novo. Enquanto isso, a linha mostra "Updating PDF" (atualizando PDF).

### Como alterar o número do orçamento

- Antes de salvar ou criar, o sistema confere se o número ainda está livre.
- Se o número já tiver sido usado, aparece a janela "Estimate Number Updated" (número do orçamento atualizado), com o novo número sugerido e a pergunta "Would you like to continue with this new number?".
- Clique em "Continue" para usar o novo número.

### Como criar um orçamento a partir de um projeto

1. Na aba "Estimate" do projeto, clique em "New Estimate".
2. Escolha entre construção manual e com IA, na janela de escolha.
3. A partir daqui o caminho é o mesmo dos passos acima, com o cliente e o projeto já definidos.

## Status e ciclo de vida

- Todo orçamento criado começa como **Pending** (pendente), salvo ou criado.
- Depois de criado, o orçamento segue o ciclo descrito na base "Orçamentos (Estimates) - lista e visão geral": pode ser aprovado, recusado, cancelado ou convertido em projeto.
- Editar um orçamento não muda o status por si só. Porém, editar um orçamento **aprovado** pode exigir nova assinatura (veja as regras abaixo).

## Regras de negócio

- **Cliente obrigatório**: sem cliente escolhido, aparece "Please select a client".
- **Local obrigatório**: o local da obra precisa estar marcado no mapa. Sem ele, aparece "Please select a location on the map".
- **Pelo menos um serviço**: sem serviços no orçamento, o resumo mostra "No Project Data Found" e a opção de começar de novo. Ao tentar salvar sem serviços, aparece "Please add at least one service to create an estimate.".
- **E-mail do cliente válido**: o e-mail do cliente precisa ser válido para salvar ou criar.
- **Dados da empresa completos**: antes de salvar, o sistema confere os dados da empresa que aparecem no PDF: nome, endereço, e-mail, telefone, local, latitude, longitude e raio de atendimento. Se faltar algum, aparece "Missing required company information" com a lista dos campos faltantes, seguida de "Please update your company details.". Corrija os dados nas configurações da empresa.
- **Desconto**: o valor do desconto é validado com o subtotal. Se o desconto não for aceito, a mensagem de erro indica o motivo.
- **Serviços personalizados**: o nome é obrigatório. Os valores são calculados pela quantidade e pelo preço por unidade.
- **Valores da IA**: a IA usa os serviços do catálogo da empresa como base de preço quando eles existem. Quando ajuda, ela também pode consultar valores de mercado nos Estados Unidos, em uma única pesquisa por pedido. Ela não altera impostos, descontos, status, assinaturas, faturas, clientes, pagamentos, agendas ou PDFs.
- **Validação da IA**: se o orçamento gerado não passar na validação, aparece a mensagem "The generated estimate could not be validated. Please try again with a more specific instruction." Nesse caso, refaça o pedido com mais detalhes.
- **Assinatura ao editar um orçamento aprovado**: se você alterar serviços, descrição, termos ou local de um orçamento já aprovado, a assinatura do cliente é removida do PDF e o orçamento volta a exigir uma nova assinatura. Se você só alterar outros campos, a assinatura do cliente é mantida no novo PDF.
- **Salvar versus criar**: "Save" só salva e volta para a lista. "Create & Send" cria o orçamento, gera o PDF e abre o envio por e-mail.
- **Enquanto salva**: enquanto o orçamento está sendo salvo ou criado, os botões ficam desabilitados.

## Relação com outros módulos

- **Clientes**: a escolha do cliente e do contexto de trabalho vem do cadastro de clientes. Um novo cliente criado aqui fica disponível no cadastro.
- **Catálogo e serviços**: os serviços do modo manual e os preços usados pela IA vêm do catálogo de serviços e materiais da empresa. Veja a base "Catálogo e serviços".
- **Projetos**: o orçamento fica ligado a um projeto. Ao criar a partir de um projeto, o orçamento é associado a ele.
- **Envio e aprovação**: depois de criado, o orçamento pode ser enviado ao cliente. Veja a base "Enviar e aprovar orçamentos com o cliente".
- **Configurações da empresa**: nome, endereço, contatos, logotipo e cor de destaque da empresa aparecem no PDF do orçamento.

## Dúvidas frequentes

**P:** Qual a diferença entre o Manual Builder e o Smart AI Builder?
**R:** No manual, você monta a lista de serviços um a um. Na IA, você descreve o projeto e a IA sugere os serviços e valores, que você revisa antes de seguir para o resumo final.

**P:** A IA escolheu preços que eu não quero. Posso mudar?
**R:** Sim. Responda na conversa pedindo a alteração, ou revise e edite cada serviço gerado antes de clicar em "Review & Finalize Estimate". Depois você ainda pode editar no resumo final.

**P:** Por que apareceu "Estimate Number Updated"?
**R:** O número que estava reservado para o orçamento já foi usado. O sistema sugere o próximo número disponível. Clique em "Continue" para aceitar.

**P:** Posso criar um orçamento sem cliente?
**R:** Não. O cliente e o local da obra são obrigatórios para avançar.

**P:** Salvei e o orçamento não foi enviado ao cliente. É normal?
**R:** Sim. "Save" só salva o orçamento como pendente. Para enviar, abra o orçamento na lista e escolha "Send By Email", ou use "Create & Send" na criação.

**P:** Editei um orçamento aprovado e agora ele pede assinatura de novo. Por quê?
**R:** Alterações em serviços, descrição, termos ou local removem a assinatura do cliente, porque o conteúdo que ele aprovou mudou. Peça ao cliente para assinar de novo pelo link, ou faça a aprovação manual.

**P:** Ao salvar apareceu "Missing required company information". O que fazer?
**R:** Complete os dados da empresa indicados na mensagem (nome, endereço, e-mail, telefone, local e raio de atendimento) nas configurações da empresa e tente novamente.

**P:** Posso anexar fotos e PDFs ao orçamento?
**R:** Sim. Na seção de anexos do resumo você adiciona imagens e PDFs, que são incluídos no orçamento.
