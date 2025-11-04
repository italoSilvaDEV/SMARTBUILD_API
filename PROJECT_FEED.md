# Project Feed - Documentação

## Visão Geral

O **Project Feed** é uma funcionalidade que permite aos funcionários publicarem posts (texto e fotos) relacionados aos projetos enquanto estão em ponto. Os posts são automaticamente vinculados ao serviço em que o funcionário está trabalhando.

## Como Funciona

### Conceito

1. **Quando o funcionário está em ponto** (check-in ativo em um serviço), ele pode criar posts no feed
2. Os posts são salvos usando as tabelas existentes:
   - **Activities** - para salvar texto, autor e data
   - **GalleryAfter** - para salvar fotos (com marcador `title: "FEED_POST"`)
3. O feed do projeto agrega todos os posts de todos os serviços do projeto

### Sem Migrações

Esta implementação **NÃO requer migrações** pois reutiliza tabelas existentes:
- ✅ `Activities` (já existente)
- ✅ `GalleryAfter` (já existente)
- ✅ `UserAttendance` (já existente)
- ✅ `UserServiceProject` (já existente)

## Endpoints

### 💡 Flexibilidade do Endpoint de Criar Post

O endpoint de criar post foi projetado para ser **super flexível**:

```
POST /projects/:id/feed
```

O parâmetro `:id` aceita **DOIS tipos de identificadores**:

| Cenário | ID usado | Resultado |
|---------|----------|-----------|
| **Tela do Projeto** | `projectId` | ✅ Funciona direto |
| **Tela do Serviço** | `serviceProjectId` | ✅ Sistema encontra o projeto automaticamente |

**Por que isso é útil?**
- Frontend pode chamar o mesmo endpoint de qualquer tela
- Não precisa buscar o projectId quando está na tela do serviço
- Menos requisições HTTP necessárias

---

### 1. Criar Post no Feed

**POST** `/projects/:id/feed`

Cria um post no feed do projeto. O funcionário deve estar em ponto ativo.

**✨ Flexibilidade:** O parâmetro `:id` aceita tanto `projectId` quanto `serviceProjectId`!
- Se passar o ID do projeto → funciona direto
- Se passar o ID do serviço → o sistema encontra o projeto automaticamente

#### Headers
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

#### Parâmetros
- `id` (URL) - ID do projeto **OU** ID do serviço

#### Body (multipart/form-data)
```
userId: string (obrigatório) - ID do funcionário
text: string (opcional) - Texto do post
photos: File[] (opcional, máx 10) - Fotos do post
```

**Nota:** É obrigatório enviar pelo menos `text` OU `photos`.

#### Exemplo de Request (cURL)

**Usando projectId:**
```bash
curl -X POST 'http://localhost:3000/projects/project-abc-123/feed' \
  -H 'Authorization: Bearer seu-token' \
  -F 'userId=user-123' \
  -F 'text=Progresso do dia - instalação elétrica concluída' \
  -F 'photos=@foto1.jpg' \
  -F 'photos=@foto2.jpg'
```

**Usando serviceProjectId (também funciona!):**
```bash
curl -X POST 'http://localhost:3000/projects/service-xyz-789/feed' \
  -H 'Authorization: Bearer seu-token' \
  -F 'userId=user-123' \
  -F 'text=Progresso do dia - instalação elétrica concluída' \
  -F 'photos=@foto1.jpg' \
  -F 'photos=@foto2.jpg'
```

#### Resposta de Sucesso (201)
```json
{
  "success": true,
  "data": {
    "activity": {
      "id": "activity-123",
      "text": "Progresso do dia - instalação elétrica concluída",
      "date_creation": "2024-11-04T10:30:00.000Z",
      "author": {
        "id": "user-123",
        "name": "João Silva",
        "avatar": "https://presigned-url..."
      }
    },
    "photos": [
      {
        "id": "photo-1",
        "url": "https://presigned-url...",
        "date_creation": "2024-11-04T10:30:00.000Z"
      },
      {
        "id": "photo-2",
        "url": "https://presigned-url...",
        "date_creation": "2024-11-04T10:30:00.000Z"
      }
    ],
    "serviceProject": {
      "id": "service-123",
      "name": "Instalação Elétrica"
    }
  }
}
```

#### Erros Possíveis
- **400** - userId é obrigatório
- **400** - É necessário enviar texto ou fotos
- **400** - Você precisa estar em ponto para criar um post no feed
- **400** - O seu ponto ativo não está vinculado a este projeto
- **404** - Projeto ou serviço não encontrado
- **404** - Usuário não encontrado

---

### 2. Listar Feed do Projeto

**GET** `/projects/:projectId/feed`

Lista todos os posts do feed do projeto (agregado de todos os serviços).

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros
- `projectId` (URL) - ID do projeto
- `limit` (Query, opcional) - Limite de posts (padrão: 50)
- `offset` (Query, opcional) - Offset para paginação (padrão: 0)

#### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/projects/abc-123/feed?limit=20&offset=0' \
  -H 'Authorization: Bearer seu-token'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "type": "post",
        "id": "activity-123",
        "text": "Progresso do dia - instalação elétrica concluída",
        "date_creation": "2024-11-04T10:30:00.000Z",
        "author": {
          "id": "user-123",
          "name": "João Silva",
          "avatar": "https://presigned-url..."
        },
        "serviceProject": {
          "id": "service-123",
          "name": "Instalação Elétrica"
        },
        "photos": [
          {
            "id": "photo-1",
            "url": "https://presigned-url...",
            "date_creation": "2024-11-04T10:30:00.000Z"
          }
        ]
      },
      {
        "type": "photo_only",
        "id": "photo-2",
        "text": null,
        "date_creation": "2024-11-04T09:15:00.000Z",
        "author": null,
        "serviceProject": {
          "id": "service-456",
          "name": "Pintura"
        },
        "photos": [
          {
            "id": "photo-2",
            "url": "https://presigned-url...",
            "date_creation": "2024-11-04T09:15:00.000Z"
          }
        ]
      }
    ],
    "total": 15,
    "limit": 20,
    "offset": 0
  }
}
```

#### Tipos de Posts
- **`post`** - Post com texto (pode ter fotos associadas)
- **`photo_only`** - Apenas foto, sem texto

---

### 3. Deletar Post do Feed

**DELETE** `/feed/:postId`

Deleta um post ou foto do feed.

#### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

#### Parâmetros
- `postId` (URL) - ID do post ou foto

#### Body (JSON)
```json
{
  "type": "activity" // ou "photo"
}
```

#### Exemplo de Request
```bash
curl -X DELETE 'http://localhost:3000/feed/activity-123' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{"type": "activity"}'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "message": "Post deletado com sucesso"
}
```

---

### 4. Listar Feed de um Serviço Específico

**GET** `/services/:serviceProjectId/feed`

Lista posts de um serviço específico.

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros
- `serviceProjectId` (URL) - ID do serviço

#### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/services/service-123/feed' \
  -H 'Authorization: Bearer seu-token'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "total": 5,
    "serviceProject": {
      "id": "service-123",
      "name": "Instalação Elétrica",
      "projectId": "project-123"
    }
  }
}
```

---

### 5. Listar Feed de um Funcionário (Todos os Projetos)

**GET** `/users/:userId/feed`

Lista todos os posts de um funcionário específico, agregando TODOS os projetos em que ele já trabalhou.

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros
- `userId` (URL) - ID do funcionário
- `limit` (Query, opcional) - Limite de posts (padrão: 50)
- `offset` (Query, opcional) - Offset para paginação (padrão: 0)

#### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/users/user-123/feed?limit=20&offset=0' \
  -H 'Authorization: Bearer seu-token'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "name": "João Silva",
      "avatar": "https://presigned-url...",
      "profession": "Eletricista"
    },
    "posts": [
      {
        "type": "post",
        "id": "activity-123",
        "text": "Instalação elétrica concluída",
        "date_creation": "2024-11-04T10:30:00.000Z",
        "serviceProject": {
          "id": "service-123",
          "name": "Elétrica"
        },
        "project": {
          "id": "project-abc",
          "status": "Em Andamento",
          "client": {
            "id": "client-1",
            "name": "Cliente A"
          }
        },
        "photos": [...]
      },
      {
        "type": "post",
        "id": "activity-456",
        "text": "Pintura finalizada",
        "date_creation": "2024-11-03T14:20:00.000Z",
        "serviceProject": {
          "id": "service-789",
          "name": "Pintura"
        },
        "project": {
          "id": "project-xyz",
          "status": "Concluído",
          "client": {
            "id": "client-2",
            "name": "Cliente B"
          }
        },
        "photos": [...]
      }
    ],
    "total": 25,
    "limit": 20,
    "offset": 0,
    "statistics": {
      "totalPosts": 25,
      "totalPhotos": 48,
      "projectsCount": 3,
      "projects": [
        {
          "projectId": "project-abc",
          "client": {
            "id": "client-1",
            "name": "Cliente A"
          },
          "postsCount": 15
        },
        {
          "projectId": "project-xyz",
          "client": {
            "id": "client-2",
            "name": "Cliente B"
          },
          "postsCount": 10
        }
      ]
    }
  }
}
```

#### Características Especiais
- ✅ Agrega posts de **TODOS os projetos** do funcionário
- ✅ Inclui informações do **projeto e cliente** em cada post
- ✅ Retorna **estatísticas** (total de posts, fotos, projetos)
- ✅ Mostra **distribuição de posts por projeto**
- ✅ Ordenado por data (mais recente primeiro)

---

## Fluxo de Uso

### Para Funcionários

1. **Fazer Check-in** em um serviço do projeto
   ```
   POST /check-in
   ```

2. **Criar Post no Feed** enquanto estiver trabalhando
   ```
   POST /projects/:projectId/feed
   ```

3. **Continuar trabalhando** e criando posts conforme necessário

4. **Fazer Check-out** ao final do dia
   ```
   POST /check-out/:id
   ```

### Para Gestores/Visualização

1. **Ver Feed do Projeto** completo
   ```
   GET /projects/:projectId/feed
   ```

2. **Ver Feed de um Serviço** específico
   ```
   GET /services/:serviceProjectId/feed
   ```

3. **Ver Feed de um Funcionário** (todos os projetos)
   ```
   GET /users/:userId/feed
   ```

---

## Regras de Negócio

### Validações

1. ✅ Funcionário **deve estar em ponto ativo** para criar post
2. ✅ O ponto ativo deve estar vinculado ao projeto correto
3. ✅ É obrigatório enviar texto OU fotos (ou ambos)
4. ✅ Máximo de 10 fotos por post
5. ✅ Fotos são automaticamente vinculadas ao serviço em que o funcionário está trabalhando

### Agrupamento Inteligente

O sistema agrupa automaticamente fotos e texto que foram criados próximos temporalmente (dentro de 5 minutos) no mesmo post.

### Compatibilidade

- ✅ **Não quebra funcionalidades existentes** - usa tabelas já existentes
- ✅ **GalleryBefore e GalleryAfter continuam funcionando** normalmente
- ✅ Posts do feed são marcados com `title: "FEED_POST"` na GalleryAfter
- ✅ Activities normais continuam funcionando independentemente

---

## Estrutura de Dados

### Como os Dados são Salvos

#### Post com Texto
```
Activities {
  id: uuid
  text: "Texto do post"
  authorId: "user-id"
  serviceProjectId: "service-id"
  date_creation: timestamp
}
```

#### Fotos do Post
```
GalleryAfter {
  id: uuid
  url: "s3-file-name"
  title: "FEED_POST" // ← Marcador de feed
  description: "Texto do post (opcional)"
  serviceProjectId: "service-id"
  date_creation: timestamp
}
```

---

## Exemplo de Integração Frontend

### React/React Native

```javascript
// Criar post no feed (flexível - aceita projectId OU serviceProjectId)
const createFeedPost = async (id, userId, text, photos) => {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('text', text);
  
  photos.forEach(photo => {
    formData.append('photos', photo);
  });

  const response = await fetch(
    `${API_URL}/projects/${id}/feed`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    }
  );

  return response.json();
};

// Exemplo 1: Criando post na tela do PROJETO
const handlePostFromProjectScreen = async () => {
  await createFeedPost(
    currentProject.id,  // ← projectId
    currentUser.id,
    'Progresso do dia!',
    selectedPhotos
  );
};

// Exemplo 2: Criando post na tela do SERVIÇO
const handlePostFromServiceScreen = async () => {
  await createFeedPost(
    currentService.id,  // ← serviceProjectId (também funciona!)
    currentUser.id,
    'Serviço concluído!',
    selectedPhotos
  );
};

// Listar feed
const getFeed = async (projectId, limit = 50, offset = 0) => {
  const response = await fetch(
    `${API_URL}/projects/${projectId}/feed?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    }
  );

  return response.json();
};
```

---

## Notas Técnicas

### Upload de Fotos
- Fotos são temporariamente salvas em `./public/tmp/feed`
- Em seguida são enviadas para S3
- URLs são pré-assinadas (presigned) para acesso seguro

### Paginação
- Padrão: 50 posts por página
- Use `limit` e `offset` para paginação

### Performance
- Posts são ordenados por data (mais recentes primeiro)
- Fotos e avatares usam presigned URLs do S3
- Agrupamento de fotos é feito em memória (otimizado para até 1000 posts)

### Segurança
- Todas as rotas requerem autenticação (`checkToken`)
- Validação de usuário e projeto em todas as operações
- Verificação de ponto ativo antes de criar post

---

## Troubleshooting

### "Você precisa estar em ponto para criar um post no feed"
**Causa:** Funcionário não está com check-in ativo
**Solução:** Fazer check-in em um serviço antes de criar o post

### "O seu ponto ativo não está vinculado a este projeto"
**Causa:** Funcionário está em ponto em um projeto diferente
**Solução:** Verificar se o projectId está correto ou fazer check-in no serviço correto

### Fotos não aparecem no feed
**Causa:** Erro no upload para S3 ou permissões
**Solução:** Verificar logs do servidor e configurações do S3

---

## Próximas Melhorias Sugeridas

- [ ] Adicionar reações/likes aos posts
- [ ] Adicionar comentários nos posts
- [ ] Notificações push quando há novo post
- [ ] Filtros por data, autor ou serviço
- [ ] Export do feed em PDF
- [ ] Análise de produtividade baseada nos posts

---

**Desenvolvido sem migrações - Reutilizando estrutura existente** ✅

