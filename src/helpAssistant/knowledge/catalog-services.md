---
title: Catálogo (galerias de fotos) e Serviços (serviços e materiais)
module: estimates
routes: [/catalog, /services, /category/:id]
---

# Catálogo (galerias de fotos) e Serviços (serviços e materiais)

## Para que serve

Esta base cobre duas áreas diferentes do sistema, que têm nomes parecidos:

- **Catalog** (Catálogo): reúne galerias de fotos da empresa, cada uma com uma imagem de capa e uma galeria de imagens. Use para organizar fotos de trabalhos já realizados, ou de produtos e acabamentos, que sua equipe quer mostrar.
- **Services** (Serviços): é a lista de serviços e materiais que a empresa oferece, organizada em categorias, subcategorias e itens com preço. Essa lista alimenta a criação de orçamentos e a IA de orçamentos.

## Onde encontrar

### Catálogo de fotos

- Menu lateral, grupo "Management" (Gestão), item "Catalog". Para ver essa tela é preciso a permissão **"Catalog"**.
- Para vendedores, o menu lateral tem um item "Catalog" que abre um painel com as mesmas galerias, com busca e navegação por páginas. Esse painel não tem endereço próprio.

### Serviços e materiais

- Menu lateral, grupo "Management" (Gestão), item "Services". Para ver essa tela é preciso a permissão **"Services"**.
- Dentro da lista de serviços, ao clicar em uma categoria, abre-se a página da categoria, que exige a mesma permissão.

## O que aparece na tela

### Catálogo: lista de galerias

- Campo de busca "Search Catalogs" (pesquisar catálogos).
- Botão "New Catalog" (novo catálogo), com ícone de mais.
- Grade de cards, um por galeria. Cada card mostra a imagem de capa, o nome do catálogo e um ícone de lixeira para excluir.
- Se não houver galerias, aparece a mensagem "No catalogs found. Add a new catalog to get started.".

### Catálogo: janela de criação ("Create Catalog")

- Dicas de criação: usar uma imagem de capa clara e de boa qualidade, adicionar várias imagens para mostrar o trabalho e escolher um nome descritivo.
- Seção "Catalog details" (detalhes do catálogo):
  - Capa: área para escolher o arquivo da imagem de capa. A tela aceita JPG, PNG ou GIF.
  - "Catalog Name" (nome do catálogo), com o campo "Enter catalog name".
  - "Gallery Images" (imagens da galeria): área "Click to add gallery images" (clique para adicionar imagens da galeria), com a indicação "JPG, PNG or GIF files accepted" e a contagem de imagens, por exemplo "3 images".
- Botões "Cancel" e "Create Catalog".

### Catálogo: janela de detalhes da galeria

- Ao clicar em um card, abre-se a galeria com o nome do catálogo, a data de criação ("Created:") e a quantidade de imagens ("Images:").
- As imagens da galeria aparecem como miniaturas. Ao clicar em uma miniatura, ela abre em tela cheia, com setas para ir para a anterior ou a próxima e a opção "Open original" (abrir original).
- Se a galeria não tiver imagens, aparece "No gallery images available".
- No canto superior da janela há um ícone de lápis para editar o catálogo.

### Catálogo: janela de edição ("Edit Catalog")

- Mesmas seções da criação, com as dicas:
  - "Change the catalog cover by clicking on the image" (trocar a capa clicando na imagem).
  - "Add or remove images from the gallery section" (adicionar ou remover imagens da galeria).
  - "Removed images will be permanently deleted" (imagens removidas são apagadas de forma definitiva).
- Botão "Update Catalog" (atualizar catálogo).

### Serviços: lista de categorias

- Título da área com duas abas: "Services" (serviços, para a categoria de serviços) e "Materials" (materiais). Cada aba mostra a quantidade de categorias.
- Campo de busca "Search" e botão "New" (novo), que abre a janela "Create category".
- Tabela com as colunas "Image" (imagem), "Name" (nome), "Status" e "Actions" (ações).
- Cada linha mostra o nome da categoria, com o subtítulo "Service Category" (categoria de serviço) ou "Material Category" (categoria de material), e o status "Enabled" (ativa) ou "Disabled" (desativada).
- Clicar na linha abre a página da categoria.
- Se não houver itens, aparece "No services found" ou "No materials found", com a dica "Try adjusting your search or create a new category".

### Serviços: janela "Create category"

- Título: "Create category", com a descrição "Add a new category to organize your items.".
- Campo "Category type" (tipo de categoria): "Services" ou "Materials". A dica diz "Choose what this category will be for.".
- Campo "Category name" (nome da categoria), com o placeholder "Enter category name...". A dica diz "Enter a clear and descriptive name.".
- Campo opcional "Category image (Optional)": clique para escolher a imagem. Formatos aceitos: JPEG, PNG e GIF, com tamanho máximo de 5 MB.

### Serviços: página da categoria

- Título com o nome da categoria e o selo "On" (ligada) ou "Off" (desligada), com o interruptor "Status" ao lado.
- Seção "Subcategories" (subcategorias), com o botão "Add Subcategory". Quando não há subcategorias, aparece "No subcategories yet" com o botão "Create Subcategory".
- Cada subcategoria aparece como um bloco recolhível. Ao abrir, aparece uma tabela com as colunas "Service Name" (nome do serviço), "Type" (tipo), "Price" (preço) e "Actions" (ações). Se não houver serviços, aparece "No services found for this subcategory.".
- Em cada subcategoria há o botão "Add Service" (adicionar serviço), e em cada subcategoria há também as ações de editar e excluir.

### Serviços: janela "Add New Service" / "Edit Service"

- Seção "Service Description": campo "Description" com o placeholder "Enter service description (optional)".
- Seção "Service Configuration":
  - "Service Name *" (obrigatório), com o placeholder "Enter service name".
  - "Service Type" (tipo de serviço): "Measurement" (medição) ou "Product" (produto).
  - "Price Type" (tipo de preço): "Fixed" (fixo) ou "Variable" (variável).
  - Se o preço for fixo, aparece um único campo de preço.
  - Se o preço for variável, aparecem os campos "Minimum Price" (preço mínimo) e "Maximum Price" (preço máximo).
- Dicas: "Use descriptive names that clients will understand", "For variable prices, be sure to set both minimum and maximum" e "Fixed prices are simpler but less flexible".

## Como fazer

### Como criar uma galeria no catálogo

1. Abra "Catalog" no menu de gestão.
2. Clique em "New Catalog".
3. Escolha a imagem de capa. Use JPG, PNG ou GIF.
4. Digite o nome do catálogo em "Enter catalog name".
5. Se quiser, clique em "Click to add gallery images" e escolha as imagens da galeria.
6. Clique em "Create Catalog".
7. Quando a galeria for criada, aparece "Catalog created and images uploaded successfully".

### Como editar uma galeria

1. Clique no card do catálogo para abrir a galeria.
2. Clique no ícone de lápis.
3. Para trocar a capa, clique na imagem de capa e escolha outra.
4. Para adicionar fotos, use a área de galeria. Para remover, use a ação de remoção na miniatura.
5. Clique em "Update Catalog". Aparece "Catalog updated and images uploaded successfully".

### Como excluir uma galeria

1. No card do catálogo, clique no ícone de lixeira.
2. A galeria é excluída imediatamente, sem janela de confirmação, junto com todas as imagens dela.
3. Aparece a mensagem "Catalog deleted successfully". Se houver erro, aparece "Error deleting catalog. Please try again.".

### Como ver o catálogo como vendedor

1. No menu lateral, clique em "Catalog".
2. O painel mostra as galerias. Use a busca para localizar uma galeria pelo nome.
3. Clique em uma galeria para ver as imagens.

### Como criar uma categoria de serviços ou materiais

1. Abra "Services" no menu de gestão.
2. Clique em "New".
3. Escolha o tipo: "Services" ou "Materials".
4. Digite o nome da categoria.
5. Se quiser, escolha uma imagem (JPEG, PNG ou GIF, até 5 MB).
6. Confirme. Se houver erro, a mensagem aparece na própria janela, por exemplo "Failed to create. Please try again.".

### Como ativar ou desativar uma categoria

1. Abra a categoria na lista de serviços.
2. Use o interruptor "Status" no topo da página.
3. O selo muda para "On" ou "Off".

### Como criar uma subcategoria

1. Abra a categoria.
2. Clique em "Add Subcategory" (ou em "Create Subcategory", se a categoria estiver vazia).
3. Digite o nome e confirme.

### Como excluir uma subcategoria

1. Na página da categoria, use a ação de excluir da subcategoria.
2. Leia a janela "Confirm Deletion": "Are you sure you want to delete {nome}? This action cannot be undone and will remove all associated services."
3. Confirme em "Delete". Todos os serviços da subcategoria são removidos junto.

### Como adicionar um serviço

1. Abra a categoria e localize a subcategoria desejada.
2. Clique em "Add Service" dentro da subcategoria.
3. Preencha o nome do serviço, o tipo ("Measurement" ou "Product"), o tipo de preço e os valores.
4. Se quiser, escreva uma descrição.
5. Confirme. Se houver erro, aparece "Failed to save service. Please try again.".

### Como editar ou excluir um serviço

- Para editar, use o ícone de lápis na linha do serviço e altere os campos desejados.
- Para excluir, use o ícone de lixeira na linha do serviço. A exclusão acontece na hora, sem janela de confirmação.

## Status e ciclo de vida

- **Galeria de catálogo**: não tem status. Existe enquanto não for excluída.
- **Categoria**: pode estar "Enabled" (ativa) ou "Disabled" (desativada). O status é trocado pelo interruptor da página da categoria.
- **Subcategoria e serviço**: não têm status próprio. Existem até serem excluídos.

## Regras de negócio

### Catálogo

- O nome do catálogo é obrigatório. Sem nome, aparece "Catalog name is required".
- A imagem de capa é obrigatória na criação. Sem ela, a galeria não é criada.
- Não é possível ter dois catálogos com o mesmo nome na mesma empresa. Nesse caso, aparece "Catalog already exists!".
- Formatos aceitos para as imagens: JPEG, PNG e GIF. Outros tipos mostram o aviso "Invalid file type. Only JPEG, PNG, and GIF are allowed.".
- Ao excluir uma galeria, as imagens dela também são excluídas.

### Categorias, subcategorias e serviços

- O nome da categoria é obrigatório ("Category name is required.").
- Não é possível criar duas categorias com o mesmo nome. Nesse caso, aparece "This category has already been registered!".
- Não é possível criar duas subcategorias com o mesmo nome na mesma categoria. Nesse caso, aparece "This sub-category has already been registered in this category!".
- A imagem da categoria aceita apenas JPEG, PNG e GIF, com até 5 MB.
- Nome do serviço é obrigatório ("Service name is required").
- Serviço com preço fixo exige o valor do preço. Sem ele, aparece "Fixed price is required".
- Serviço com preço variável exige o preço mínimo e o preço máximo, e o máximo precisa ser maior que o mínimo ("The maximum price must be greater than the minimum price").
- Excluir uma subcategoria remove os serviços dela. Excluir um serviço remove o item da lista, sem janela de confirmação.

### Relação com orçamentos

- Os serviços cadastrados aqui são os que aparecem para escolha na criação de orçamentos, nas abas de serviços e materiais.
- Os preços cadastrados também são usados pela IA de orçamentos como base de valor, quando existem.

## Relação com outros módulos

- **Orçamentos**: ao criar um orçamento manual, o vendedor escolhe os serviços e materiais desta lista. A IA de orçamentos também consulta esta lista para sugerir itens e preços. Veja a base "Criar e editar orçamentos".
- **Configurações da empresa**: as imagens de capa e as galerias pertencem à empresa e aparecem apenas para a equipe da própria empresa.
- **Projetos**: os serviços de um orçamento aprovado passam a fazer parte do projeto.

## Dúvidas frequentes

**P:** Preciso de permissão para ver o catálogo e os serviços?
**R:** Sim. O catálogo exige a permissão "Catalog" e a lista de serviços exige a permissão "Services". Sem elas, os itens do menu não aparecem.

**P:** Qual a diferença entre catálogo e serviços?
**R:** O catálogo é um conjunto de galerias de fotos para mostrar trabalhos e produtos. A lista de serviços é o cadastro de itens com preço, usado para montar orçamentos.

**P:** Posso criar um catálogo sem imagem de capa?
**R:** Não. A imagem de capa é obrigatória. Você pode adicionar as imagens da galeria depois, na edição.

**P:** Excluí uma galeria sem querer. Consigo recuperar?
**R:** Não. A exclusão é imediata e remove a galeria e as imagens dela. Não há janela de confirmação, então confira antes de clicar na lixeira.

**P:** Por que não consigo cadastrar outro catálogo com o mesmo nome?
**R:** A empresa já tem um catálogo com esse nome. Escolha um nome diferente.

**P:** Como faço um serviço com faixa de preço?
**R:** Ao cadastrar o serviço, escolha o tipo de preço "Variable" e informe o preço mínimo e o preço máximo. O máximo precisa ser maior que o mínimo.

**P:** Excluí uma subcategoria e os serviços sumiram. É normal?
**R:** Sim. A janela de confirmação avisa que os serviços da subcategoria também serão removidos. Essa ação não pode ser desfeita.

**P:** O que acontece quando desativo uma categoria?
**R:** A categoria fica marcada como "Disabled" (desativada) e continua na lista, com o selo "Off". Reative pelo interruptor "Status" quando quiser usá-la novamente.

**P:** Quais formatos de imagem posso usar nas categorias?
**R:** JPEG, PNG e GIF, com até 5 MB.
