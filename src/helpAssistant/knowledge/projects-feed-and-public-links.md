---
title: Feed do projeto e links públicos do projeto
module: projects
routes: [/seller/project/details/:id, /public/feed/:token, /public/feed/multi/:token]
---

# Feed do projeto e links públicos do projeto

## Para que serve

O **feed do projeto** é o diário de obra de um projeto específico: os funcionários publicam textos, fotos e áudios transcritos sobre o que está acontecendo em cada serviço. Quem tem acesso ao projeto acompanha essas atualizações, curte, comenta e pode criar publicações próprias.

O **link público** permite mostrar essas atualizações ao cliente, sem ele precisar de login. Existem dois tipos: o link de **um projeto** (descrito aqui) e o link de **vários projetos** de um mesmo cliente, criado pela tela de relatórios.

## Onde encontrar

- Feed do projeto: na página de detalhes do projeto (veja o arquivo de detalhes do projeto), na aba **"Reports"** (em português, "Relatórios"). Endereço: `/seller/project/details/:id`, com a aba selecionada.
- Quem vê: quem tem a permissão **"Projects"**.
- Páginas públicas (sem login): `/public/feed/:token` para um projeto e `/public/feed/multi/:token` para vários projetos. Quem tem o endereço consegue abri-las.

## O que aparece na tela

### Aba Reports (feed do projeto)

- Título **"Project Feed"** (Feed dos Projetos), com o texto **"All employee updates for this project"** (Todas as atualizações dos funcionários deste projeto).
- Botões:
  - **"Create Post"** (Criar publicação): abre a janela para uma nova publicação.
  - **"Share Link"** (Compartilhar link): gera ou mostra o link público do projeto.
  - **"Refresh"** (Atualizar): recarrega as publicações.
- Lista de publicações, da mais recente para a mais antiga. Cada publicação mostra:
  - nome e foto de quem publicou;
  - data, com as palavras "Today" (Hoje) e "Yesterday" (Ontem) quando for o caso;
  - o nome do serviço ao qual a publicação se refere, em destaque;
  - o texto da publicação;
  - as fotos (ao clicar, a foto abre ampliada);
  - o botão de curtir, com a quantidade de curtidas;
  - o botão de comentários, com a quantidade de comentários;
  - o link **"View Project"** (Ver projeto) e, quando permitido, a opção de excluir.
- Se não houver publicações, aparece **"No posts yet"** (Nenhuma publicação ainda), com o texto "When employees start posting updates, they will appear here." (Quando os funcionários publicarem atualizações, elas aparecerão aqui.)

### Janela de comentários

- Título com a quantidade, por exemplo "Comments (3)" (Comentários (3)).
- Lista de comentários com nome, foto e data do autor.
- Se não houver comentários: "No comments yet" (Nenhum comentário ainda).
- Em cada comentário seu aparece a opção "Delete comment" (Excluir comentário).

### Janela "Create Post" (Criar publicação)

- Título "Create Post", com o texto "Share an update about this project" (Compartilhe uma atualização sobre este projeto).
- **Service** (Serviço): obrigatório. Lista os serviços do projeto. Se o projeto não tiver serviços, aparece "No services available for this project" (Nenhum serviço disponível para este projeto).
- **Description (optional)** (Descrição, opcional): caixa de texto com a dica "What's happening on this project? Or record/upload audio to transcribe..." (O que está acontecendo neste projeto? Você também pode gravar ou enviar um áudio para transcrever...). Mostra a contagem de caracteres.
- **Enhance with AI** (Aprimorar com IA): reescreve o texto digitado para ficar mais claro.
- **Record** (Gravar) / **Stop** (Parar): grava um áudio que é transcrito para o texto.
- **Upload Audio** (Enviar áudio): envia um arquivo de áudio para transcrição.
- **Photos (optional, max 10)** (Fotos, opcional, máximo 10): área "Click to upload photos" (Clique para enviar fotos). Mostra "N / 10 photos selected" (N / 10 fotos selecionadas).

### Janela "Public Link" (Link público)

- Título "Public Link" (Link público), com o texto "Share this link with your client to track project progress" (Compartilhe este link com seu cliente para acompanhar o andamento do projeto).
- O endereço do link, com o botão **"Copy"** (Copiar). Depois de copiado, aparece "Copied" (Copiado).
- Situação: **"Active"** (Ativo) ou **"Inactive"** (Inativo).
- **Expires** (Expira em): data de validade, ou **"Never"** (Nunca), se não houver validade.
- **Accesses** (Acessos): quantas vezes o link foi aberto.
- **Last Access** (Último acesso): data do último acesso.
- Botões **"Preview"** (Visualizar), que abre a página pública, e **"Deactivate"** (Desativar).

### Página pública do projeto

- Cabeçalho com o nome do cliente e o endereço da obra.
- Botões de atualizar e **Print** (Imprimir). Imprimir usa a impressão do navegador, com um layout próprio para papel.
- Contador de atualizações (por exemplo, "3 Updates").
- Lista de atualizações, com texto, fotos, data, nome do autor, quantidade de curtidas e de comentários. Os comentários podem ser abertos para leitura.
- Quando o autor não é identificado, aparece "Team Member" (Membro da equipe).
- Se não houver atualizações: "No Updates Yet" (Nenhuma atualização ainda), com "Check back soon for project updates!" (Volte em breve para conferir as atualizações do projeto!).
- Rodapé: "Powered by SmartBuild" (Desenvolvido por SmartBuild).
- Nessa página o cliente só lê. Não é possível curtir nem comentar.

### Página pública de vários projetos

- Título "Project Updates" (Atualizações dos projetos).
- Mostra quantos projetos estão incluídos ("Projects Included", Projetos incluídos) e quantas atualizações existem, reunindo as publicações de todos esses projetos.
- Mesmos botões de atualizar e imprimir, e a mesma mensagem quando não há atualizações.

### Mensagem de link inválido

Quando o link não existe, expirou ou foi desativado, a página mostra: "This link is invalid, expired, or has been deactivated." (Este link é inválido, expirou ou foi desativado.)

## Como fazer

### Como publicar uma atualização no feed

1. Abra o projeto e vá para a aba "Reports".
2. Clique em "Create Post".
3. Escolha o **Service** (serviço) ao qual a atualização se refere.
4. Escreva o texto, grave ou envie um áudio para transcrever, ou use "Enhance with AI" para melhorar o texto.
5. Se quiser, anexe fotos (até 10).
6. Confirme. A publicação aparece no feed.

Para publicar, é preciso ter **texto ou fotos** (ou os dois). Só foto também é aceito.

### Como gravar um áudio para a publicação

1. Clique em "Record" (Gravar) e fale. A tela mostra "Recording... Click Stop when finished" (Gravando... Clique em Parar ao terminar).
2. Clique em "Stop" (Parar). O áudio é transcrito e o texto entra na caixa de descrição.
3. Você também pode clicar em "Upload Audio" (Enviar áudio) e escolher um arquivo.

### Como curtir ou comentar uma publicação

- Clique no ícone de curtir para curtir. Clique de novo para remover a curtida.
- Clique no botão de comentários para abrir a lista e escrever um comentário.
- Quem publicou recebe uma notificação quando alguém curte ou comenta.

### Como excluir uma publicação

1. No cartão da publicação, abra o menu de três pontos.
2. Clique em "Delete Post" (Excluir publicação) e confirme. A mensagem é "Are you sure you want to delete this post? This action cannot be undone." (Tem certeza de que deseja excluir esta publicação? Esta ação não pode ser desfeita.)

Somente o **autor** da publicação e os perfis **Administrator** e **Owner** veem essa opção.

### Como compartilhar o link do projeto com o cliente

1. Na aba "Reports", clique em "Share Link" (Compartilhar link).
2. Na janela "Public Link", clique em "Copy" (Copiar) e envie o endereço ao cliente.
3. Para conferir o que o cliente vê, clique em "Preview" (Visualizar).

O link criado vale por **30 dias**. Se o projeto já tiver um link ativo, o mesmo link é mostrado, e não um novo.

### Como desativar o link

1. Na janela "Public Link", clique em "Deactivate" (Desativar).
2. Confirme a mensagem "Are you sure you want to deactivate this public link? Clients will no longer be able to access it." (Tem certeza de que deseja desativar este link público? Os clientes não poderão mais acessá-lo.)

Depois de desativado, o cliente não consegue mais abrir a página. Para liberar o acesso de novo, clique em "Share Link" para gerar um novo link.

## Status e ciclo de vida

- **Publicação**: fica visível no feed até ser excluída pelo autor (ou por Administrator/Owner).
- **Link público**: começa "Active" (Ativo). Fica "Inactive" (Inativo) quando é desativado manualmente. Depois da data de validade, a página pública deixa de abrir, mas o link continua exibido como "Active".
- **Validade**: o link criado pelo botão "Share Link" vale por 30 dias. Depois disso, a página pública mostra a mensagem de link inválido.
- **Acessos**: cada vez que a página pública é aberta, o contador de acessos aumenta e a data do último acesso é atualizada.

## Regras de negócio

- **Serviço obrigatório**: toda publicação precisa estar ligada a um serviço do projeto. Sem serviço, aparece "Please select a service" (Selecione um serviço).
- **Conteúdo obrigatório**: texto ou fotos. Sem nenhum dos dois, aparece "Please add text or photos (or both)" (Adicione um texto ou fotos, ou ambos).
- **Fotos**: até 10 por publicação, em JPEG, PNG ou WEBP, com até 10 MB cada. Acima disso aparecem os avisos "Maximum 10 photos allowed" (Máximo de 10 fotos permitido) ou "Some files are too large. Maximum size: 10MB per photo" (Alguns arquivos são muito grandes. Tamanho máximo: 10MB por foto).
- **Áudio**: formatos MP3, MP4, WAV ou WEBM, com até 25 MB. Para gravar, o navegador precisa da permissão do microfone. Se ela não estiver liberada, aparece um aviso.
- **Aprimorar com IA**: só funciona com texto digitado. Sem texto, aparece "Please enter some text first" (Digite algum texto primeiro).
- **Comentários**: só o autor do comentário pode excluí-lo.
- **Notificações**: quem publicou recebe aviso quando alguém curte ou comenta a publicação.
- **Link de projeto**: um projeto tem, no máximo, um link ativo por vez. Gerar de novo mostra o link ativo existente.
- **Visibilidade**: quem tem o link vê todas as publicações do projeto, incluindo comentários e contagens de curtidas. Trate o link como algo que você compartilha com quem deve ver a obra.
- **Erros da página pública**: link inexistente, expirado ou desativado mostra a mensagem de link inválido. Outros erros mostram "Unable to load project feed. Please try again later." (Não foi possível carregar o feed do projeto. Tente novamente mais tarde.)

## Relação com outros módulos

- **Project details (Detalhes do projeto)**: o feed fica na aba "Reports" da página do projeto.
- **Services (Serviços)**: cada publicação aponta para um serviço do projeto, e o nome do serviço aparece no cartão.
- **Equipe (funcionários)**: as publicações são feitas pelos funcionários; o autor aparece com nome e foto.
- **Reports (Relatórios)**: o link público de vários projetos é criado pela tela de relatórios, que reúne os projetos do cliente.
- **Change orders (Ordens de alteração)**: o cliente aprova essas ordens por uma página própria, separada do feed e dos links públicos.

## Dúvidas frequentes

**P:** Por que o botão "Create Post" não me deixa publicar?
**R:** Falta escolher o serviço, ou a publicação está sem texto e sem foto. Escolha o serviço e adicione pelo menos um texto ou uma foto.

**P:** Posso publicar um vídeo no feed?
**R:** Não. As fotos aceitas são JPEG, PNG e WEBP.

**P:** O cliente disse que não consegue abrir o link. O que houve?
**R:** Provavelmente o link foi desativado. Nesse caso, clique em "Share Link" para gerar um novo e envie o endereço atualizado. Se o link passou da validade de 30 dias, "Share Link" mostra o mesmo endereço, que continua sem abrir.

**P:** Como o cliente sabe que há novidades?
**R:** Ele precisa abrir o link. A página pública mostra as atualizações mais recentes e tem o botão de atualizar. Você pode reenviar o link por e-mail, se quiser.

**P:** Posso desfazer a desativação de um link?
**R:** Não pela janela do link. Clique em "Share Link" para criar um novo link. O endereço muda.

**P:** Excluí uma publicação por engano. Como recupero?
**R:** Não é possível recuperar. A exclusão é definitiva e apaga também as fotos da publicação.

**P:** Por que não consigo excluir a publicação de outro funcionário?
**R:** Só o autor da publicação e os perfis Administrator e Owner podem excluí-la.

**P:** Quem vê os comentários no link público?
**R:** Quem tiver o link pode ler os comentários e ver as contagens de curtidas, mas não pode comentar nem curtir pela página pública.

**P:** Quantas fotos posso colocar em uma publicação?
**R:** Até 10 fotos, de até 10 MB cada.
