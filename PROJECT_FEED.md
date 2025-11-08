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

Cria um post no feed do projeto.

**✨ Flexibilidade:** O parâmetro `:id` aceita tanto `projectId` quanto `serviceProjectId`!
- Se passar o ID do projeto → deve enviar `serviceProjectId` no body
- Se passar o ID do serviço → usa automaticamente esse serviço

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
serviceProjectId: string (opcional se :id for serviceProjectId) - ID do serviço
text: string (opcional) - Texto do post
photos: File[] (opcional, máx 10) - Fotos do post
```

**Nota:** É obrigatório enviar pelo menos `text` OU `photos`.

#### Exemplo de Request (cURL)

**Usando projectId (precisa especificar o serviço):**
```bash
curl -X POST 'http://localhost:3000/projects/project-abc-123/feed' \
  -H 'Authorization: Bearer seu-token' \
  -F 'userId=user-123' \
  -F 'serviceProjectId=service-xyz-789' \
  -F 'text=Progresso do dia - instalação elétrica concluída' \
  -F 'photos=@foto1.jpg' \
  -F 'photos=@foto2.jpg'
```

**Usando serviceProjectId direto na URL (mais simples!):**
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
      "name": "Instalação Elétrica",
      "projectId": "project-456"
    }
  }
}
```

#### Erros Possíveis
- **400** - userId é obrigatório
- **400** - É necessário enviar texto ou fotos
- **400** - O serviço especificado não pertence a este projeto
- **404** - Serviço não encontrado. Especifique um serviceProjectId válido
- **404** - Usuário não encontrado

---

### 2. Listar Feed do Projeto

**GET** `/projects/:projectId/feed`

Lista todos os posts do feed do projeto (agregado de todos os serviços).

**✨ Novo:** Agora inclui **endereço, filtros, ordenação e paginação melhorada**!

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros

**Paginação:**
- `limit` (Query, opcional) - Limite de posts (padrão: 50)
- `offset` (Query, opcional) - Offset para paginação (padrão: 0)

**Filtros:**
- `serviceProjectId` (Query, opcional) - Filtrar por serviço específico
- `startDate` (Query, opcional) - Data inicial (ISO 8601: `2024-11-01T00:00:00Z`)
- `endDate` (Query, opcional) - Data final (ISO 8601: `2024-11-30T23:59:59Z`)
- `hasPhotos` (Query, opcional) - `true` (apenas com fotos) | `false` (apenas sem fotos)
- `authorId` (Query, opcional) - Filtrar por autor específico

**Ordenação:**
- `sortBy` (Query, opcional) - `date` (padrão) | `photos` (por quantidade de fotos)
- `order` (Query, opcional) - `desc` (padrão) | `asc`

#### Exemplo de Request

**Simples:**
```bash
curl -X GET 'http://localhost:3000/projects/abc-123/feed?limit=20&offset=0' \
  -H 'Authorization: Bearer seu-token'
```

**Com Filtros:**
```bash
# Posts com fotos da última semana
curl -X GET 'http://localhost:3000/projects/abc-123/feed?hasPhotos=true&startDate=2024-11-01T00:00:00Z&sortBy=photos&order=desc' \
  -H 'Authorization: Bearer seu-token'

# Posts de um funcionário específico
curl -X GET 'http://localhost:3000/projects/abc-123/feed?authorId=user-123' \
  -H 'Authorization: Bearer seu-token'

# Posts de um serviço específico
curl -X GET 'http://localhost:3000/projects/abc-123/feed?serviceProjectId=service-456' \
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
        "location": {
          "address": "Rua Exemplo, 123 - Cidade, Estado",
          "coordinates": {
            "lat": -23.550520,
            "lng": -46.633308
          }
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
          "name": "Pintura",
          "projectId": "project-123"
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
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0,
      "currentPage": 1,
      "totalPages": 1,
      "hasMore": false,
      "nextOffset": null
    },
    "filters": {
      "serviceProjectId": null,
      "startDate": null,
      "endDate": null,
      "hasPhotos": null,
      "authorId": null,
      "sortBy": "date",
      "order": "desc"
    }
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

### 5. Editar Post do Feed

**PUT** `/feed/:postId`

Edita o texto de um post do feed.

#### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

#### Parâmetros
- `postId` (URL) - ID do post (activity)

#### Body (JSON)
```json
{
  "text": "Texto atualizado do post"
}
```

#### Exemplo de Request
```bash
curl -X PUT 'http://localhost:3000/feed/activity-123' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{"text": "Texto corrigido do post"}'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "id": "activity-123",
    "text": "Texto corrigido do post",
    "date_creation": "2024-11-04T10:30:00.000Z",
    "date_update": "2024-11-04T11:45:00.000Z",
    "author": {
      "id": "user-123",
      "name": "João Silva",
      "avatar": "https://presigned-url..."
    }
  }
}
```

#### Erros Possíveis
- **400** - Texto é obrigatório
- **404** - Post não encontrado

---

### 6. Deletar Foto Individual

**DELETE** `/feed/photos/:photoId`

Deleta uma foto específica sem deletar o post inteiro.

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros
- `photoId` (URL) - ID da foto

#### Exemplo de Request
```bash
curl -X DELETE 'http://localhost:3000/feed/photos/photo-123' \
  -H 'Authorization: Bearer seu-token'
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "message": "Foto deletada com sucesso",
  "activityId": "activity-123"
}
```

**Nota:** O campo `activityId` permite que o frontend atualize o post automaticamente.

#### Erros Possíveis
- **400** - Esta foto não pertence ao feed
- **404** - Foto não encontrada

---

### 7. Listar Feed de um Funcionário (Todos os Projetos)

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
          "name": "Pintura",
          "projectId": "project-123"
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
      "overview": {
        "totalPosts": 25,
        "totalPhotos": 48,
        "postsWithPhotos": 20,
        "postsWithoutPhotos": 5,
        "averagePhotosPerPost": 1.92
      },
      "temporal": {
        "postsThisWeek": 5,
        "postsThisMonth": 20,
        "averagePostsPerDay": 0.67
      },
      "projects": {
        "projectsCount": 3,
        "mostActiveProject": {
          "projectId": "project-abc",
          "client": {
            "id": "client-1",
            "name": "Cliente A"
          },
          "postsCount": 15,
          "photosCount": 30
        },
        "allProjects": [
          {
            "projectId": "project-abc",
            "client": {
              "id": "client-1",
              "name": "Cliente A"
            },
            "postsCount": 15,
            "photosCount": 30
          },
          {
            "projectId": "project-xyz",
            "client": {
              "id": "client-2",
              "name": "Cliente B"
            },
            "postsCount": 10,
            "photosCount": 18
          }
        ]
      },
      "topPosts": {
        "byPhotos": [
          {
            "id": "post-1",
            "text": "Finalização completa",
            "photosCount": 8,
            "date_creation": "2024-11-03T14:20:00.000Z",
            "project": { ... }
          }
        ]
      }
    }
  }
}
```

#### Características Especiais
- ✅ Agrega posts de **TODOS os projetos** do funcionário
- ✅ Inclui informações do **projeto e cliente** em cada post
- ✅ **Estatísticas detalhadas**:
  - Visão geral (posts, fotos, médias)
  - Temporal (esta semana, este mês, média diária)
  - Por projeto (mais ativo, distribuição)
  - Top posts (por quantidade de fotos)
- ✅ Ordenado por data (mais recente primeiro)

---

## Fluxo de Uso

### Para Funcionários

1. **Criar Post no Feed** a qualquer momento
   ```
   POST /projects/:serviceProjectId/feed
   ```
   
   Ou especificando o serviço:
   ```
   POST /projects/:projectId/feed
   Body: { serviceProjectId: "...", ... }
   ```

2. **Continuar criando posts** conforme necessário

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

1. ✅ Funcionário **não precisa estar em ponto** para criar post
2. ✅ É obrigatório especificar o serviço (serviceProjectId)
3. ✅ É obrigatório enviar texto OU fotos (ou ambos)
4. ✅ Máximo de 10 fotos por post
5. ✅ Fotos são automaticamente vinculadas ao serviço especificado

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
// Editar post
const editPost = async (postId, newText) => {
  const response = await fetch(
    `${API_URL}/feed/${postId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: newText })
    }
  );
  return response.json();
};

// Deletar foto individual
const deletePhoto = async (photoId) => {
  const response = await fetch(
    `${API_URL}/feed/photos/${photoId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    }
  );
  return response.json();
};

// Criar post no feed
const createFeedPost = async (userId, serviceProjectId, text, photos) => {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('serviceProjectId', serviceProjectId);
  formData.append('text', text);
  
  photos.forEach(photo => {
    formData.append('photos', photo);
  });

  const response = await fetch(
    `${API_URL}/projects/${serviceProjectId}/feed`,
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

// Exemplo 1: Criando post na tela do PROJETO (precisa passar o serviço)
const handlePostFromProjectScreen = async (selectedServiceId) => {
  await createFeedPost(
    currentUser.id,
    selectedServiceId,  // ← serviceProjectId selecionado
    'Progresso do dia!',
    selectedPhotos
  );
};

// Exemplo 2: Criando post na tela do SERVIÇO (mais simples)
const handlePostFromServiceScreen = async () => {
  await createFeedPost(
    currentUser.id,
    currentService.id,  // ← serviceProjectId
    'Serviço concluído!',
    selectedPhotos
  );
};

// Listar feed com filtros
const getFeed = async (projectId, options = {}) => {
  const {
    limit = 50,
    offset = 0,
    serviceProjectId,
    startDate,
    endDate,
    hasPhotos,
    authorId,
    sortBy = 'date',
    order = 'desc'
  } = options;

  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    sortBy,
    order
  });

  if (serviceProjectId) params.append('serviceProjectId', serviceProjectId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (hasPhotos !== undefined) params.append('hasPhotos', hasPhotos.toString());
  if (authorId) params.append('authorId', authorId);

  const response = await fetch(
    `${API_URL}/projects/${projectId}/feed?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    }
  );

  return response.json();
};

// Exemplos de uso
await getFeed('project-123', { hasPhotos: true, sortBy: 'photos' });
await getFeed('project-123', { authorId: 'user-456', limit: 10 });
await getFeed('project-123', { startDate: '2024-11-01T00:00:00Z' });
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
- Validação de usuário, serviço e projeto em todas as operações
- Validação que o serviço pertence ao projeto correto

---

## Troubleshooting

### "Serviço não encontrado. Especifique um serviceProjectId válido"
**Causa:** O serviceProjectId fornecido não existe ou está incorreto
**Solução:** Verificar se o ID do serviço está correto

### "O serviço especificado não pertence a este projeto"
**Causa:** Tentando vincular um post a um serviço que não faz parte do projeto
**Solução:** Verificar se o serviceProjectId corresponde a um serviço desse projeto

### Fotos não aparecem no feed
**Causa:** Erro no upload para S3 ou permissões
**Solução:** Verificar logs do servidor e configurações do S3

---

## 🎯 FUNCIONALIDADES SOCIAIS (Implementado)

### ✅ Sistema de Comentários

#### **POST /feed/:postId/comments**
Criar comentário em um post

**Request Body:**
```json
{
  "text": "Ótimo trabalho!",
  "userId": "uuid-do-usuario"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "text": "Ótimo trabalho!",
    "date_creation": "2024-11-04T10:30:00Z",
    "author": {
      "id": "user-uuid",
      "name": "João Silva",
      "avatar": "https://presigned-url..."
    }
  }
}
```

**Notificação:** ✉️ O autor do post recebe notificação

---

#### **GET /feed/:postId/comments**
Listar comentários de um post

**Response (200):**
```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "id": "comment-uuid",
        "text": "Ótimo trabalho!",
        "date_creation": "2024-11-04T10:30:00Z",
        "date_update": "2024-11-04T10:30:00Z",
        "author": {
          "id": "user-uuid",
          "name": "João Silva",
          "avatar": "https://presigned-url..."
        }
      }
    ],
    "total": 5
  }
}
```

---

#### **DELETE /feed/comments/:commentId**
Deletar comentário (somente o autor)

**Request Body:**
```json
{
  "userId": "uuid-do-autor"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Comentário deletado com sucesso"
}
```

---

### ❤️ Sistema de Likes

#### **POST /feed/:postId/like**
Dar like em um post

**Request Body:**
```json
{
  "userId": "uuid-do-usuario"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "likeId": "like-uuid",
    "totalLikes": 12
  }
}
```

**Notificação:** ✉️ O autor do post recebe notificação

---

#### **DELETE /feed/:postId/like**
Remover like de um post

**Request Body:**
```json
{
  "userId": "uuid-do-usuario"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Like removido com sucesso",
  "data": {
    "totalLikes": 11
  }
}
```

---

#### **GET /feed/:postId/likes**
Listar usuários que curtiram o post

**Response (200):**
```json
{
  "success": true,
  "data": {
    "likes": [
      {
        "id": "like-uuid",
        "date_creation": "2024-11-04T10:30:00Z",
        "user": {
          "id": "user-uuid",
          "name": "Maria Santos",
          "avatar": "https://presigned-url..."
        }
      }
    ],
    "total": 12
  }
}
```

---

### 🔔 Sistema de Notificações

#### **GET /users/:userId/notifications**
Listar notificações do usuário

**Query Parameters:**
- `unreadOnly` (opcional): "true" | "false" (padrão: "false")
- `limit` (opcional): número (padrão: 50)
- `offset` (opcional): número (padrão: 0)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif-uuid",
        "type": "comment",
        "message": "João Silva comentou no seu post",
        "isRead": false,
        "relatedLink": "/feed/post-uuid",
        "date_creation": "2024-11-04T10:30:00Z",
        "actor": {
          "id": "user-uuid",
          "name": "João Silva",
          "avatar": "https://presigned-url..."
        },
        "activity": {
          "id": "post-uuid",
          "text": "Acabamos a instalação elétrica"
        }
      }
    ],
    "total": 10,
    "unreadCount": 3
  }
}
```

**Tipos de notificação:**
- `comment`: Alguém comentou no seu post
- `like`: Alguém curtiu seu post
- `mention`: Alguém te mencionou (futuro)

---

#### **PATCH /notifications/:notificationId/read**
Marcar notificação como lida

**Response (200):**
```json
{
  "success": true,
  "message": "Notificação marcada como lida"
}
```

---

#### **PATCH /users/:userId/notifications/read-all**
Marcar todas notificações como lidas

**Response (200):**
```json
{
  "success": true,
  "message": "Todas notificações marcadas como lidas"
}
```

---

## 📊 Contadores Adicionados aos Posts

Todos os endpoints que retornam posts (`GET /projects/:projectId/feed`, `GET /services/:serviceProjectId/feed`, `GET /users/:userId/feed`) agora incluem:

```json
{
  "id": "post-uuid",
  "text": "Acabamos a instalação elétrica!",
  "photos": [...],
  "author": {...},
  "likesCount": 12,      // ✨ NOVO
  "commentsCount": 5,    // ✨ NOVO
  "date_creation": "..."
}
```

---

## 🎨 Exemplo de Integração no Frontend

### Exibir post com interações

```jsx
function FeedPost({ post }) {
  return (
    <div className="feed-post">
      <div className="post-header">
        <img src={post.author.avatar} />
        <span>{post.author.name}</span>
      </div>
      
      <div className="post-content">
        <p>{post.text}</p>
        {post.photos.map(photo => (
          <img key={photo.id} src={photo.url} />
        ))}
      </div>
      
      <div className="post-actions">
        <button onClick={() => likePost(post.id)}>
          ❤️ {post.likesCount}
        </button>
        <button onClick={() => showComments(post.id)}>
          💬 {post.commentsCount}
        </button>
      </div>
    </div>
  );
}
```

### Sistema de comentários

```javascript
// Criar comentário
async function addComment(postId, text) {
  const response = await fetch(`/feed/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      text: text,
      userId: currentUser.id
    })
  });
  
  const data = await response.json();
  // Atualiza UI com o novo comentário
  updateCommentsList(data.data);
}

// Carregar comentários
async function loadComments(postId) {
  const response = await fetch(`/feed/${postId}/comments`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  renderComments(data.data.comments);
}
```

### Sistema de likes

```javascript
// Dar/remover like (toggle)
async function toggleLike(postId, hasLiked) {
  const method = hasLiked ? 'DELETE' : 'POST';
  
  const response = await fetch(`/feed/${postId}/like`, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ userId: currentUser.id })
  });
  
  const data = await response.json();
  // Atualiza contador de likes
  updateLikesCount(postId, data.data.totalLikes);
}
```

### Sistema de notificações

```javascript
// Carregar notificações não lidas
async function loadNotifications() {
  const response = await fetch(
    `/users/${currentUser.id}/notifications?unreadOnly=true`, 
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  const data = await response.json();
  
  // Exibe badge com contador
  updateNotificationBadge(data.data.unreadCount);
  
  // Renderiza lista de notificações
  renderNotifications(data.data.notifications);
}

// Marcar como lida ao clicar
async function markAsRead(notificationId) {
  await fetch(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Remove da lista ou marca visualmente
  updateNotificationUI(notificationId);
}

// Polling periódico para novas notificações
setInterval(loadNotifications, 30000); // A cada 30 segundos
```

---

## 📋 RECURSOS AVANÇADOS (Futuro)

- [ ] Menções a outros usuários (@usuario)
- [ ] Hashtags e categorização
- [ ] Export do feed em PDF
- [ ] Análise de produtividade baseada nos posts
- [ ] Notificações em tempo real (WebSocket)
- [ ] Reações diversas (👍👏🔥 etc)
- [ ] Editar comentários
- [ ] Responder comentários (threads)

---

## 🗄️ Estrutura do Banco de Dados

### Novas Tabelas (Migration incluída)

```sql
-- Comentários
feed_comment (
  id, text, activityId, authorId, 
  date_creation, date_update
)

-- Likes
feed_like (
  id, activityId, userId, date_creation
  UNIQUE(activityId, userId) -- 1 like por usuário
)

-- Notificações
feed_notification (
  id, type, message, isRead, relatedLink,
  userId, actorId, activityId, date_creation
)
```

**Migration:** `20251104144400_add_feed_comments_likes_notifications`

---

## 🐛 BUGS CORRIGIDOS

### ✅ Bug #1: Campo `author` ausente em `GET /users/:userId/feed` (04/11/2025)

**Problema:** Posts retornavam `author: null`, impedindo edição/deleção

**Correção aplicada:**
- Adicionado `include: { author }` na query de activities
- Adicionado campo `author` com `id`, `name`, `avatar` na resposta
- Menu de editar/deletar agora funciona corretamente

**Status:** ✅ RESOLVIDO

---

### ✅ Bug #2: Campo `location` ausente em `GET /users/:userId/feed` (04/11/2025)

**Problema:** Posts não exibiam localização do projeto

**Correção aplicada:**
- Adicionado `location`, `lat`, `log` no select do Project
- Adicionado campo `location` com endereço e coordenadas na resposta
- Localização agora é exibida corretamente nos cards

**Status:** ✅ RESOLVIDO

---

### ✅ Bug #3: Campo `projectId` ausente em `serviceProject` (04/11/2025)

**Problema:** Objeto `serviceProject` não incluía o campo `projectId`, impedindo navegação para o projeto

**Resposta anterior (incorreta):**
```json
{
  "serviceProject": {
    "id": "63450e2a-8310-49ed-8776-a19054297ddb",
    "name": "TIJOLO"
  }
}
```

**Resposta corrigida:**
```json
{
  "serviceProject": {
    "id": "63450e2a-8310-49ed-8776-a19054297ddb",
    "name": "TIJOLO",
    "projectId": "xxx-xxx-xxx"
  }
}
```

**Correção aplicada:**
- ✅ Adicionado campo `projectId` em `serviceProject` em **todos os endpoints**:
  - `POST /projects/:id/feed` (createPost)
  - `GET /projects/:projectId/feed` (getFeed)
  - `GET /services/:serviceProjectId/feed` (getServiceFeed)
  - `GET /users/:userId/feed` (getUserFeed)

**Impacto:**
- ✅ Botão "View Project" agora aparece e funciona
- ✅ Frontend pode navegar do post para o projeto
- ✅ Consistência em todas as respostas da API

**Status:** ✅ RESOLVIDO

---

## 🤖 INTEGRAÇÃO COM OPENAI (Whisper + GPT)

### 📋 Configuração

**Variável de Ambiente:**
```bash
OPENAI_KEY="sk-proj-your-key-here"
```

**Pacote Instalado:**
```bash
npm install openai
```

---

### 🎤 1. TRANSCREVER ÁUDIO (Whisper)

**Endpoint:** `POST /ai/transcribe`

**Descrição:** Transcreve áudio em texto usando o modelo Whisper da OpenAI.

**Headers:**
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**Body (Form-Data):**
- `audio` (file) - Arquivo de áudio

**Formatos Suportados:**
- `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`
- Tamanho máximo: **25MB**

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "text": "Hoje realizamos a concretagem da fundação do bloco A. Foram utilizados 15 metros cúbicos de concreto usinado.",
    "language": "pt",
    "duration": null,
    "model": "gpt-4o-mini-transcribe"
  }
}
```

**Erros:**

| Status | Error | Descrição |
|--------|-------|-----------|
| 400 | Nenhum arquivo de áudio fornecido | Campo `audio` não foi enviado |
| 400 | Formato de áudio não suportado | Formato do arquivo inválido |
| 400 | Arquivo muito grande | Arquivo excede 25MB |
| 500 | Erro ao transcrever áudio | Erro na API da OpenAI |

**Exemplo (JavaScript):**
```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');

const response = await fetch('/ai/transcribe', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { data } = await response.json();
console.log('Texto transcrito:', data.text);
```

---

### ✨ 2. MELHORAR DESCRIÇÃO (GPT)

**Endpoint:** `POST /ai/enhance-description`

**Descrição:** Melhora, traduz e formata texto usando GPT-4o. **SEMPRE retorna em INGLÊS**, independente do idioma falado, quebrando barreiras linguísticas.

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "text": "fiz a concretagem hj, usamo uns 15 metro cubico de concreto mais ou menos"
}
```

**Validações:**
- Campo `text` obrigatório (string)
- Texto não pode estar vazio
- Máximo 5000 caracteres

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "original": "fiz a concretagem hj, usamo uns 15 metro cubico de concreto mais ou menos",
    "enhanced": "• Completed concrete pouring as planned\n• Placed approximately 15 cubic meters of ready-mix concrete\n• Applied mechanical vibration for proper consolidation\n• Crew equipped with appropriate PPE\n• Followed technical standards and safety procedures\n• Initiated concrete curing process",
    "model": "gpt-4o-mini",
    "tokensUsed": 95
  }
}
```

**Comportamento do GPT:**
- 🌍 **Aceita QUALQUER idioma** (Português, Espanhol, Inglês, etc)
- 🇺🇸 **Sempre responde em INGLÊS** (padrão universal)
- 📋 **Formato em BULLET POINTS** para melhor legibilidade
- ✅ Traduz e corrige simultaneamente
- ✅ Organiza informações em pontos claros e escaneáveis
- ✅ Mantém detalhes técnicos (quantidades, materiais, locais)
- ✅ Linguagem profissional e concisa
- ✅ Terminologia técnica em inglês
- ❌ NÃO inventa informações
- ❌ NÃO remove informações importantes

**Erros:**

| Status | Error | Descrição |
|--------|-------|-----------|
| 400 | Campo "text" é obrigatório | Campo `text` não foi enviado |
| 400 | Texto não pode estar vazio | String vazia |
| 400 | Texto muito longo | Mais de 5000 caracteres |
| 500 | Erro ao melhorar descrição | Erro na API da OpenAI |

**Exemplo (JavaScript):**
```javascript
const response = await fetch('/ai/enhance-description', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: userInput
  })
});

const { data } = await response.json();
console.log('Original:', data.original);
console.log('Melhorado:', data.enhanced);
```

---

### 🎤✨ 3. TRANSCREVER E MELHORAR (Combinado)

**Endpoint:** `POST /ai/transcribe-and-enhance`

**Descrição:** Transcreve áudio E melhora o texto em uma única chamada (mais eficiente).

**Headers:**
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**Body (Form-Data):**
- `audio` (file) - Arquivo de áudio

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transcribed": "fiz a concretagem hj, usamo uns 15 metro cubico de concreto mais ou menos",
    "enhanced": "• Completed concrete pouring as planned\n• Placed approximately 15 cubic meters of ready-mix concrete\n• Applied mechanical vibration for proper consolidation\n• Crew equipped with appropriate PPE\n• Followed technical standards and safety procedures\n• Initiated concrete curing process",
    "models": {
      "transcription": "whisper-1",
      "enhancement": "gpt-4o-mini"
    },
    "tokensUsed": 95
  }
}
```

**Vantagens:**
- ⚡ Mais rápido (1 requisição ao invés de 2)
- 💰 Mais eficiente em tokens
- 🎯 Ideal para fluxo completo: gravação → transcrição → formatação

**Exemplo (JavaScript):**
```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');

const response = await fetch('/ai/transcribe-and-enhance', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { data } = await response.json();
console.log('Transcrito:', data.transcribed);
console.log('Melhorado:', data.enhanced);

// Usar o texto melhorado no campo de descrição
postDescriptionField.value = data.enhanced;
```

---

## 📱 INTEGRAÇÃO FRONTEND - IA no Feed

### Fluxo Recomendado

**1. Botão de Microfone (Transcrição):**
```javascript
// Gravar áudio
const mediaRecorder = new MediaRecorder(stream);
const audioChunks = [];

mediaRecorder.ondataavailable = (event) => {
  audioChunks.push(event.data);
};

mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  
  // Transcrever
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  
  const response = await fetch('/ai/transcribe', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  
  const { data } = await response.json();
  
  // Preencher campo de texto
  document.getElementById('postDescription').value = data.text;
};

// Iniciar gravação
mediaRecorder.start();
```

**2. Botão de IA (Melhorar Texto):**
```javascript
async function enhanceDescription() {
  const textField = document.getElementById('postDescription');
  const originalText = textField.value;
  
  if (!originalText.trim()) {
    alert('Digite ou transcreva um texto primeiro');
    return;
  }
  
  // Mostrar loading
  const enhanceButton = document.getElementById('enhanceButton');
  enhanceButton.disabled = true;
  enhanceButton.innerHTML = '✨ Melhorando...';
  
  try {
    const response = await fetch('/ai/enhance-description', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: originalText })
    });
    
  const { data } = await response.json();
  
  // Atualizar campo com texto melhorado (já vem formatado em bullet points)
  textField.value = data.enhanced;
  
  // Feedback visual
  showSuccessMessage('Descrição melhorada e traduzida! 🌍✨');
    
  } catch (error) {
    console.error(error);
    showErrorMessage('Erro ao melhorar descrição');
  } finally {
    enhanceButton.disabled = false;
    enhanceButton.innerHTML = '✨ Melhorar com IA';
  }
}
```

**3. Fluxo Combinado (Recomendado):**
```javascript
// Um único botão que grava + transcreve + melhora
async function recordAndEnhance() {
  // 1. Gravar áudio
  const audioBlob = await recordAudio();
  
  // 2. Transcrever E melhorar
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  
  const response = await fetch('/ai/transcribe-and-enhance', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  
  const { data } = await response.json();
  
  // 3. Preencher campo com texto JÁ melhorado (em inglês e bullet points)
  document.getElementById('postDescription').value = data.enhanced;
  
  // Mostrar preview do original (opcional)
  showToast(`Transcrito: "${data.transcribed}"`);
}
```

---


## 🔒 SEGURANÇA

### API Key Management
**❌ NÃO FAZER:**
```javascript
// NUNCA expor a API key no frontend
const openai = new OpenAI({ apiKey: 'sk-proj-...' });
```

**✅ CORRETO:**
```javascript
// Backend faz proxy das requisições
// Frontend só chama /ai/transcribe e /ai/enhance-description
```

**Implementação Atual:**
- ✅ API key configurada no backend via variável de ambiente
- ✅ Endpoints protegidos com `checkToken` middleware
- ✅ Frontend não tem acesso direto à OpenAI

---

## 📊 MONITORAMENTO

### Logs do Console
```javascript
// Backend registra todas as chamadas
console.log('🎤 Transcrevendo áudio:', { size, format });
console.log('✅ Transcrição concluída:', { textLength, preview });
console.log('✨ Melhorando descrição:', { originalLength });
console.log('✅ Descrição melhorada:', { tokensUsed });
```

### Métricas Recomendadas
- Número de transcrições/dia
- Número de melhorias/dia
- Tokens utilizados/dia
- Tempo médio de resposta
- Taxa de erro

---

**Desenvolvido com migrações mínimas - Máxima reutilização de estrutura** ✅

