---
title: Criar novo projeto (New project)
module: projects
routes: [/seller/new-project/type-project, /seller/new-project/client-data, /seller/new-project/services/:id, /seller/new-project/smart-builder/:id, /seller/new-project/services-summary/:id]
---

# Criar novo projeto (New project)

## Para que serve

Este fluxo cria um novo projeto para um cliente. Ao final, o sistema grava:

- o projeto, com um número sequencial de contrato e o status inicial "Pre-Start" (Pré-início);
- o orçamento inicial do projeto, com os serviços escolhidos e o PDF gerado;
- a localização da obra, com o raio de atuação;
- opcionalmente, o envio do orçamento por e-mail ao cliente.

Existem duas formas de montar o projeto: **Manual Builder** (você escolhe os serviços um a um) e **Smart AI Builder** (você descreve o projeto e a inteligência artificial sugere os serviços e valores).

## Onde encontrar

- Pela lista de projetos: botão "New project" (Novo projeto), no canto superior direito da tela "Projects" (veja o arquivo de lista de projetos).
- Endereço de entrada: `/seller/new-project/type-project`.
- Quem vê: é preciso ter a permissão **"Projects"**. Sem ela, o fluxo não abre.

O fluxo tem quatro etapas: escolher o tipo de construtor, escolher o cliente e a localização, montar os serviços (manual ou com IA) e revisar/criar o projeto.

## O que aparece na tela

### Etapa 1: escolha do tipo

- Título "Create New Project" (Criar Novo Projeto) e texto "Select how you want to create your estimate and let us guide you through the perfect workflow." (Selecione como você quer criar seu orçamento e deixe-nos guiar você pelo fluxo de trabalho ideal).
- Dois cartões grandes:
  - **Manual Builder** (Builder Manual), com a etiqueta "Most Popular" (Mais Popular). Descrição: "Create estimates step-by-step with full control over every detail and customization." (Crie orçamentos passo a passo com controle total sobre cada detalhe e personalização.)
  - **Smart AI Builder**, com a etiqueta "New" (Novo). Descrição: "Let AI create intelligent estimates based on your project description with smart recommendations." (Deixe a IA criar orçamentos inteligentes com base na descrição do seu projeto e com recomendações otimizadas.)
- Em cada cartão, o texto "Select this option" (Selecionar esta opção).

Ao escolher um dos cartões, qualquer rascunho anterior do fluxo é apagado.

### Etapa 2: cliente e localização

- Título "Create New Project" e, em seguida, a seção "Select Client" (Selecionar cliente), com o texto "Choose an existing client or create a new one" (Escolha um cliente existente ou crie um novo).
- Campo **Client** (Cliente): caixa de seleção com busca ("Search client..." – Pesquisar cliente...). O texto inicial é "Select a client..." (Selecione um cliente...).
- Botão **New Client** (Novo cliente): abre uma janela para cadastrar um cliente novo, junto com o contexto de trabalho dele.
- Depois de escolher o cliente, aparece um cartão com os dados dele.
- **Work Context** (Contexto de Trabalho): quando o cliente tem contextos de trabalho cadastrados, você escolhe qual usar. O texto de ajuda é "Select the work context to use its contact information in this project." (Selecione o contexto de trabalho para usar suas informações de contato neste projeto.) Se o cliente não tiver nenhum, aparece "No work context found." (Nenhum contexto de trabalho encontrado.)
- Seção **Property location** (Localização do imóvel), marcada com asterisco. Texto: "Use the search field by address and/or drag the pin to the exact location of the property" (Use o campo de busca pelo endereço e/ou arraste o alfinete até o local exato da propriedade).
  - Campo "Enter an address" (Digite um endereço) para buscar o endereço.
  - Mapa onde você pode arrastar o alfinete para a posição exata.
  - Controle "Adjust the radius" (Ajustar o raio), que define o raio de atuação da obra.
  - Quando a localização é definida, aparece a etiqueta verde "Location Selected" (Local selecionado) com o endereço.
- Botão **Next** (Próximo), no final da página. Ele fica cinza e desabilitado enquanto faltar o cliente ou a localização.

### Etapa 3A: serviços (Manual Builder)

- Título "Services" (Serviços), com a busca "Search Categories and Services" (Buscar Categorias e Serviços).
- Lista de categorias do catálogo. Ao clicar numa categoria, abre-se a lista de subcategorias e, em seguida, a lista de serviços para adicionar ao orçamento.
- Botão **Custom service** (Serviço personalizado): adiciona um item que não existe no catálogo, preenchido por você.
- Carrinho de serviços: mostra os itens já escolhidos.
- Botão **To complete** (Para completar): só aparece quando há pelo menos um serviço no carrinho. Leva para a etapa de revisão.
- Se não houver categorias, aparece "No categories found." (Nenhuma categoria encontrada.)

### Etapa 3B: descrição com IA (Smart AI Builder)

- A tela abre com uma mensagem de boas-vindas do assistente, que cita o cliente e a localização escolhidos.
- Caixa de texto com o convite "Describe your project, drag a file, or use the buttons..." (Descreva seu projeto, arraste um arquivo ou use os botões...).
- Botões para anexar arquivos e para gravar áudio.
- Área de arrastar e soltar arquivos: "Drop your file here" (Solte seu arquivo aqui).
- Enquanto a IA trabalha, aparece "AI Assistant is working..." (Assistente de IA está funcionando...).
- Quando a IA termina, aparece o botão **View Estimate (N items)** (Ver orçamento (N itens)).
- A janela **Generated Estimate** (Orçamento gerado) mostra o resumo do projeto ("Project Summary" – Resumo do projeto), o total de serviços, o custo total estimado e a lista de serviços com quantidade e preço. Os botões são **Close** (Fechar) e **Review & Finalize Estimate** (Revisar e finalizar orçamento).
- Cada serviço gerado pode ser editado antes de finalizar.

### Etapa 4: revisão e criação (Project Sections)

- Título "Project Sections" (Seções do Projeto), com o texto "Toggle sections on/off and expand to edit details" (Ative/desative seções e expanda para editar detalhes).
- Seções do orçamento que você pode ligar, desligar e editar: capa, carta de apresentação, itens do orçamento, termos e condições, anexos de imagem e modelo do PDF.
- Na seção de anexos de imagem há o botão "Attach Image" (Anexar imagem).
- Botões no topo da página:
  - **Save** (Salvar): cria o projeto e volta para a lista de projetos.
  - **Create & Send** (Criar e enviar): cria o projeto, gera o PDF do orçamento e abre a janela de envio por e-mail ao cliente.
- Durante a criação, aparecem mensagens de progresso como "Creating project...", "Generating PDF..." e "Uploading files...".

## Como fazer

### Como criar um projeto pelo Manual Builder

1. Na lista de projetos, clique em "New project".
2. Escolha o cartão "Manual Builder" e clique em "Select this option".
3. Em "Client", escolha o cliente. Se ele não existir, clique em "New Client" e preencha o cadastro.
4. Se o cliente tiver contextos de trabalho, escolha o que deve ser usado.
5. Localize a obra: digite o endereço no campo de busca, ajuste o alfinete no mapa e defina o raio.
6. Clique em "Next" (Próximo).
7. Na tela "Services", clique nas categorias e adicione os serviços. Use "Custom service" para itens fora do catálogo.
8. Quando terminar, clique em "To complete" (Para completar).
9. Revise as seções do orçamento e clique em "Save" ou em "Create & Send".

### Como criar um projeto pelo Smart AI Builder

1. Na lista de projetos, clique em "New project".
2. Escolha o cartão "Smart AI Builder" e clique em "Select this option".
3. Escolha o cliente, o contexto de trabalho e a localização, e clique em "Next".
4. Descreva o projeto no campo de texto. Você também pode anexar arquivos ou gravar um áudio.
5. Clique para enviar. Quando a IA terminar, clique em "View Estimate" para conferir os serviços.
6. Se quiser, edite os serviços gerados.
7. Clique em "Review & Finalize Estimate" (Revisar e finalizar orçamento). Você vai para a etapa de revisão.
8. Clique em "Save" ou em "Create & Send".

### Como anexar arquivos ao pedido da IA

- Tipos aceitos: imagens (JPEG, PNG, GIF, WEBP), PDF, Word (DOC, DOCX), Excel (XLS, XLSX), CSV e TXT.
- Tamanho máximo: 20 MB para documentos (PDF, Word, Excel, CSV, TXT) e 10 MB para imagens.
- Se o arquivo for de outro tipo ou maior que o limite, aparece um aviso e ele não é enviado.

### Como gravar um áudio para a IA

1. Clique no botão de gravação. A tela mostra "Recording... Click to stop" (Gravando... Clique para parar).
2. Clique de novo para parar. O áudio é transcrito e o texto entra na caixa de descrição.
3. Se o microfone não estiver liberado no navegador, aparece um aviso pedindo para verificar as permissões.

### Como cadastrar um cliente novo durante o fluxo

1. Na etapa de cliente, clique em "New Client".
2. Preencha os dados do cliente e do contexto de trabalho e salve.
3. O cliente recém-criado é selecionado automaticamente.

## Status e ciclo de vida

- Ao ser criado, o projeto entra com o status **Pre-Start** (Pré-início). Depois ele pode mudar pela lista de projetos (Em andamento, Vistoria final, Finalizado).
- O orçamento inicial é registrado como aprovado, pois faz parte do próprio projeto.
- Se o fluxo for interrompido antes de criar o projeto (por exemplo, fechando a página), nada é gravado.
- Se você abrir a etapa de revisão sem ter passado pelas etapas anteriores, aparece a tela "No Project Data Found" (Nenhum dado de projeto encontrado), com o botão "Start New Estimate" (Iniciar novo orçamento), que recomeça o fluxo.

## Regras de negócio

- **Campos obrigatórios na etapa de cliente**: escolher um cliente e definir a localização no mapa. Sem eles, o botão "Next" fica desabilitado. Os textos de erro são "Please select a client" (Selecione um cliente) e "Please select a location on the map" (Selecione uma localização no mapa).
- **Serviços**: é obrigatório ter pelo menos um serviço. Sem ele, aparece "Please add at least one service to create an estimate." (Adicione pelo menos um serviço para criar o orçamento.)
- **E-mail do cliente**: precisa ser válido. Caso contrário, aparece "Please provide a valid email address for the client." (Informe um e-mail válido para o cliente.)
- **Dados da empresa**: nome, endereço, e-mail e telefone da empresa precisam estar preenchidos, e a localização da obra precisa estar definida. Se faltar algo, aparece "Missing required company information" (Informações da empresa faltando), com a lista do que falta, seguida de "Please update your company details." (Atualize os dados da sua empresa.)
- **Número do projeto**: é o próximo número livre da empresa, considerando orçamentos e projetos já existentes. Esse número aparece na lista e na página de detalhes.
- **Preço**: o valor do projeto é a soma de cada serviço do orçamento, calculada como preço × quantidade (horas).
- **Envio por e-mail ("Create & Send")**: o PDF do orçamento é enviado ao cliente pela janela de envio. Ao enviar, aparece "Email sent successfully!" (E-mail enviado com sucesso!). Fechar a janela sem enviar não desfaz a criação do projeto.
- **Mensagens de sucesso e erro**: após criar, aparece "Project created successfully!" (Projeto criado com sucesso!). Se a criação falhar, aparece "Error creating estimate" (Erro ao criar orçamento) ou "Error saving project." (Erro ao salvar projeto).
- **Escrita e botões**: os botões "Save" e "Create & Send" aparecem em inglês em todos os idiomas da tela.

## Relação com outros módulos

- **Clients (Clientes)**: o cliente escolhido ou cadastrado aqui passa a aparecer na lista de clientes.
- **Work Contexts (Contextos de trabalho)**: o contexto escolhido fornece os dados de contato usados no projeto.
- **Services catalog (Catálogo de serviços)**: os serviços do modo manual vêm do catálogo da empresa.
- **Estimates (Orçamentos)**: o projeto nasce de um orçamento. O envio do PDF segue as regras da tela de orçamentos.
- **Projects list (Lista de projetos)**: depois de criado, o projeto aparece na lista (veja o arquivo de lista de projetos).
- **Project details (Detalhes do projeto)**: a partir do projeto criado, você ajusta contrato, serviços, tarefas, custos e faturas.

## Dúvidas frequentes

**P:** Por que o botão "Next" não libera?
**R:** Falta escolher o cliente ou marcar a localização da obra no mapa. Digite o endereço, arraste o alfinete até o local certo e confirme.

**P:** Não encontro o cliente que procuro. O que faço?
**R:** Use o campo de busca dentro do seletor de cliente. Se ele não existir, clique em "New Client" e cadastre-o na própria tela.

**P:** Qual a diferença entre "Save" e "Create & Send"?
**R:** Os dois criam o projeto. "Save" apenas grava e volta para a lista. "Create & Send" também gera o PDF e abre a janela para enviar o orçamento por e-mail ao cliente.

**P:** A IA criou serviços errados. Posso corrigir?
**R:** Sim. Antes de finalizar, abra "View Estimate" e edite cada serviço. Depois de criar o projeto, você também pode ajustar os serviços na página de detalhes.

**P:** Por que o sistema diz que faltam informações da empresa?
**R:** Os dados da empresa (nome, endereço, e-mail e telefone) precisam estar preenchidos no cadastro da sua empresa. Atualize esses dados e refaça a etapa de revisão.

**P:** Quais arquivos posso anexar para a IA?
**R:** Imagens, PDF, Word, Excel, CSV e TXT. Documentos podem ter até 20 MB e imagens até 10 MB.

**P:** Por que apareceu "No Project Data Found"?
**R:** O fluxo foi interrompido e os dados temporários não estão mais disponíveis. Clique em "Start New Estimate" para começar de novo.

**P:** O projeto criado já começa em qual status?
**R:** Em "Pre-Start" (Pré-início). Você muda o status depois, pela lista de projetos.

**P:** Posso criar o projeto sem enviar nada ao cliente?
**R:** Sim. Use "Save". O projeto é criado e nenhum e-mail é enviado.
