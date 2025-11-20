# API - App Nativo dos Funcionários (v2.0)

## 📱 Visão Geral

Esta documentação descreve todas as endpoints necessárias para o **App Nativo dos Funcionários v2.0**, permitindo que funcionários visualizem e gerenciem seus projetos e serviços atribuídos.

---

## 🔐 Autenticação

Todas as rotas (exceto as públicas) requerem autenticação via token Bearer:

```
Authorization: Bearer {token}
```

---

## 📋 Índice

1. [Listar Serviços do Funcionário](#1-listar-serviços-do-funcionário)
2. [Listar Serviços com Detalhes](#2-listar-serviços-com-detalhes)
3. [Detalhes de um Serviço Específico](#3-detalhes-de-um-serviço-específico)
4. [Listar Projetos do Funcionário](#4-listar-projetos-do-funcionário)
5. [Detalhes de um Projeto](#5-detalhes-de-um-projeto)
6. [Listar Serviços de um Projeto](#6-listar-serviços-de-um-projeto)
7. [Feed do Projeto](#7-feed-do-projeto)
8. [Feed de um Serviço](#8-feed-de-um-serviço)
9. [Criar Post no Feed](#9-criar-post-no-feed)
10. [Calendário de Serviços](#10-calendário-de-serviços)
11. [✨ Listar Projetos Disponíveis para Check-In](#11-listar-projetos-disponíveis-para-check-in) ⭐ NOVO
12. [✨ Check-In Simplificado](#12-check-in-simplificado) ⭐ NOVO

---

## 1. Listar Serviços do Funcionário

**POST** `/user_service_project/search/:id`

Lista todos os serviços atribuídos a um funcionário, com opção de busca por nome.

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

### Parâmetros
- `id` (URL) - ID do funcionário

### Body (JSON)
```json
{
  "search": "instalação" // (opcional) - Termo de busca
}
```

### Exemplo de Request
```bash
# Listar todos os serviços
curl -X POST 'http://localhost:3000/user_service_project/search/user-123' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{}'

# Buscar serviços por nome
curl -X POST 'http://localhost:3000/user_service_project/search/user-123' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{"search": "elétrica"}'
```

### Resposta de Sucesso (200)
```json
[
  {
    "id_userServiceProject": "usp-uuid-1",
    "name_service": "Instalação Elétrica",
    "address_client": "Rua Exemplo, 123 - São Paulo, SP",
    "selected": false,
    "project_status": "In Progress",
    "service_status": "Scheduled"
  },
  {
    "id_userServiceProject": "usp-uuid-2",
    "name_service": "Pintura Externa",
    "address_client": "Av. Principal, 456 - Rio de Janeiro, RJ",
    "selected": false,
    "project_status": "Pre-Start",
    "service_status": "In Progress"
  }
]
```

### Características
- ✅ Filtra automaticamente serviços cancelados
- ✅ Filtra projetos cancelados, rejeitados ou declinados
- ✅ Ordenado por data de atribuição (mais recente primeiro)
- ✅ Busca case-insensitive

### Erros Possíveis
- **500** - Error when searching for user service projects

---

## 2. Listar Serviços com Detalhes

**POST** `/services_with_details/:id`

Lista serviços do funcionário com informações detalhadas (horas trabalhadas, etapas, status, etc).

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

### Parâmetros
- `id` (URL) - ID do funcionário

### Body (JSON)
```json
{
  "search": "instalação" // (opcional) - Termo de busca
}
```

### Exemplo de Request
```bash
curl -X POST 'http://localhost:3000/services_with_details/user-123' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{"search": ""}'
```

### Resposta de Sucesso (200)
```json
[
  {
    "id": "usp-uuid-1",
    "service_project_id": "service-uuid-1",
    "name": "Instalação Elétrica",
    "address": "Rua Exemplo, 123 - São Paulo, SP",
    "startDate": "01/11/2024",
    "daysLeft": "15 dias",
    "workedHours": "24.5",
    "stages": "3/5",
    "status": "In Progress"
  },
  {
    "id": "usp-uuid-2",
    "service_project_id": "service-uuid-2",
    "name": "Pintura Externa",
    "address": "Av. Principal, 456 - Rio de Janeiro, RJ",
    "startDate": "05/11/2024",
    "daysLeft": "10 dias",
    "workedHours": "12.0",
    "stages": "2/4",
    "status": "Scheduled"
  }
]
```

### Campos da Resposta
- `id`: ID do UserServiceProject
- `service_project_id`: ID do serviço
- `name`: Nome do serviço
- `address`: Endereço do cliente/projeto
- `startDate`: Data de início formatada (pt-BR)
- `daysLeft`: Dias restantes até o prazo
- `workedHours`: Total de horas trabalhadas (formato decimal)
- `stages`: Etapas completas / Total de etapas
- `status`: Status do serviço

### Erros Possíveis
- **500** - Error when fetching service details

---

## 3. Detalhes de um Serviço Específico

**GET** `/services/details-geral/:id`

Retorna informações completas de um serviço específico, incluindo fotos, atividades, etapas, etc.

### Headers
```
Authorization: Bearer {token}
```

### Parâmetros
- `id` (URL) - ID do ServiceProject

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/services/details-geral/service-uuid-123' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
{
  "projectId": "project-uuid-123",
  "description": "Instalação completa do sistema elétrico",
  "status": "In Progress",
  "address": "Rua Exemplo, 123 - São Paulo, SP",
  "start_date": "01/11/2024",
  "daysLeft": "15 dias",
  "workedHours": "24.5",
  "stages": "3/5",
  "photos": [
    {
      "id": "photo-uuid-1",
      "uri": "https://presigned-url...",
      "date_creation": "2024-11-05T10:30:00.000Z"
    }
  ],
  "activities": [
    {
      "id": "activity-uuid-1",
      "text": "Instalação dos disjuntores concluída",
      "date_creation": "2024-11-05T10:30:00.000Z",
      "authorId": "user-uuid-123"
    }
  ]
}
```

### Campos da Resposta
- `projectId`: ID do projeto relacionado
- `description`: Descrição do serviço
- `status`: Status atual do serviço
- `address`: Endereço do projeto/cliente
- `start_date`: Data de início formatada
- `daysLeft`: Dias restantes até o prazo
- `workedHours`: Total de horas trabalhadas
- `stages`: Progresso das etapas
- `photos`: Array de fotos do serviço (com URLs pré-assinadas)
- `activities`: Array de atividades relacionadas

### Erros Possíveis
- **404** - ServiceProject not found
- **500** - Error when fetching ServiceProject details

---

## 4. Listar Projetos do Funcionário

**POST** `/service-project/scheduleById`

Lista os projetos/serviços do funcionário no formato de calendário (agenda).

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

### Body (JSON)
```json
{
  "user_id": "user-uuid-123"
}
```

### Exemplo de Request
```bash
curl -X POST 'http://localhost:3000/service-project/scheduleById' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "user-uuid-123"}'
```

### Resposta de Sucesso (200)
```json
[
  {
    "id": "project-uuid-1",
    "service": "Instalação Elétrica",
    "initial": "2024-11-01",
    "end": "2024-11-15",
    "description": "Rua Exemplo, 123 - São Paulo, SP"
  },
  {
    "id": "project-uuid-2",
    "service": "Pintura Externa",
    "initial": "2024-11-05",
    "end": "2024-11-20",
    "description": "Av. Principal, 456 - Rio de Janeiro, RJ"
  }
]
```

### Campos da Resposta
- `id`: ID do projeto
- `service`: Nome do serviço
- `initial`: Data de início (YYYY-MM-DD)
- `end`: Data de término (YYYY-MM-DD)
- `description`: Endereço do projeto

### Características
- ✅ Retorna apenas serviços com datas de início e fim definidas
- ✅ Ideal para exibição em calendário/agenda

### Erros Possíveis
- **400** - User ID is required
- **404** - No service projects found for this user
- **500** - Internal server error

---

## 5. Detalhes de um Projeto

**GET** `/project/find/:id`

Retorna informações completas de um projeto específico.

### Headers
```
Authorization: Bearer {token}
```

### Parâmetros
- `id` (URL) - ID do projeto

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/project/find/project-uuid-123' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
{
  "id": "project-uuid-123",
  "contract_number": "CONTRACT-2024-001",
  "status_project": "In Progress",
  "price": 50000.00,
  "start_date": "2024-11-01",
  "deadline": "2024-12-15",
  "location": "Rua Exemplo, 123 - São Paulo, SP",
  "client": {
    "id": "client-uuid-123",
    "name": "Cliente ABC Ltda",
    "email": "contato@clienteabc.com",
    "phone": "+55 11 99999-9999"
  },
  "serviceProject": [
    {
      "id": "service-uuid-1",
      "name": "Instalação Elétrica",
      "status": "In Progress"
    }
  ],
  "_count": {
    "serviceProject": 3,
    "workedHours": 5
  }
}
```

### Campos da Resposta
- `id`: ID do projeto
- `contract_number`: Número do contrato
- `status_project`: Status do projeto
- `price`: Valor do projeto
- `start_date`: Data de início
- `deadline`: Prazo final
- `location`: Localização/endereço
- `client`: Informações do cliente
- `serviceProject`: Array de serviços do projeto
- `_count`: Contadores (serviços, horas trabalhadas)

### Erros Possíveis
- **404** - Project not found
- **500** - Internal server error

---

## 6. Listar Serviços de um Projeto

**GET** `/project/services-project/:id`

Lista todos os serviços de um projeto específico, incluindo fotos, etapas, atividades e funcionários atribuídos.

### Headers
```
Authorization: Bearer {token}
```

### Parâmetros
- `id` (URL) - ID do projeto

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/project/services-project/project-uuid-123' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
[
  {
    "id": "service-uuid-1",
    "name": "Instalação Elétrica",
    "description": "Instalação completa do sistema elétrico",
    "status": "In Progress",
    "start_date": "2024-11-01",
    "deadline": "2024-11-15",
    "photos": [
      {
        "id": "photo-uuid-1",
        "uri": "https://presigned-url...",
        "date_creation": "2024-11-05T10:30:00.000Z"
      }
    ],
    "stages": [
      {
        "id": "stage-uuid-1",
        "name": "Instalação dos disjuntores",
        "check": true
      }
    ],
    "Activities": [
      {
        "id": "activity-uuid-1",
        "text": "Instalação dos disjuntores concluída",
        "date_creation": "2024-11-05T10:30:00.000Z"
      }
    ],
    "UserServiceProject": [
      {
        "id": "usp-uuid-1",
        "user": {
          "id": "user-uuid-123",
          "name": "João Silva",
          "avatar": "https://presigned-url..."
        }
      }
    ]
  }
]
```

### Campos da Resposta
- `id`: ID do serviço
- `name`: Nome do serviço
- `description`: Descrição
- `status`: Status do serviço
- `start_date`: Data de início
- `deadline`: Prazo final
- `photos`: Array de fotos (com URLs pré-assinadas)
- `stages`: Array de etapas
- `Activities`: Array de atividades
- `UserServiceProject`: Array de funcionários atribuídos (com avatares pré-assinados)

### Erros Possíveis
- **404** - Project not found
- **500** - Internal server error

---

## 7. Feed do Projeto

**GET** `/projects/:projectId/feed`

Lista todos os posts do feed de um projeto (agregado de todos os serviços).

### Headers
```
Authorization: Bearer {token}
```

### Query Parameters
- `limit` (opcional) - Limite de posts (padrão: 50)
- `offset` (opcional) - Offset para paginação (padrão: 0)
- `serviceProjectId` (opcional) - Filtrar por serviço específico
- `startDate` (opcional) - Data inicial (ISO 8601)
- `endDate` (opcional) - Data final (ISO 8601)
- `hasPhotos` (opcional) - `true` | `false`
- `authorId` (opcional) - Filtrar por autor
- `sortBy` (opcional) - `date` | `photos` (padrão: `date`)
- `order` (opcional) - `desc` | `asc` (padrão: `desc`)

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/projects/project-uuid-123/feed?limit=20&offset=0' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "type": "post",
        "id": "activity-uuid-1",
        "text": "Instalação elétrica concluída com sucesso!",
        "date_creation": "2024-11-05T10:30:00.000Z",
        "author": {
          "id": "user-uuid-123",
          "name": "João Silva",
          "avatar": "https://presigned-url..."
        },
        "serviceProject": {
          "id": "service-uuid-1",
          "name": "Instalação Elétrica",
          "projectId": "project-uuid-123"
        },
        "location": {
          "address": "Rua Exemplo, 123 - São Paulo, SP",
          "coordinates": {
            "lat": -23.550520,
            "lng": -46.633308
          }
        },
        "photos": [
          {
            "id": "photo-uuid-1",
            "url": "https://presigned-url...",
            "date_creation": "2024-11-05T10:30:00.000Z"
          }
        ],
        "likesCount": 5,
        "commentsCount": 2
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
    }
  }
}
```

**📖 Documentação completa:** Ver `PROJECT_FEED.md` seção "2. Listar Feed do Projeto"

---

## 8. Feed de um Serviço

**GET** `/services/:serviceProjectId/feed`

Lista posts do feed de um serviço específico.

### Headers
```
Authorization: Bearer {token}
```

### Parâmetros
- `serviceProjectId` (URL) - ID do serviço

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/services/service-uuid-123/feed' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "total": 5,
    "serviceProject": {
      "id": "service-uuid-123",
      "name": "Instalação Elétrica",
      "projectId": "project-uuid-123"
    }
  }
}
```

**📖 Documentação completa:** Ver `PROJECT_FEED.md` seção "4. Listar Feed de um Serviço Específico"

---

## 9. Criar Post no Feed

**POST** `/projects/:id/feed`

Cria um post no feed do projeto. O parâmetro `:id` aceita tanto `projectId` quanto `serviceProjectId`.

### Headers
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

### Parâmetros
- `id` (URL) - ID do projeto **OU** ID do serviço

### Body (Form-Data)
```
userId: string (obrigatório)
serviceProjectId: string (opcional se :id for serviceProjectId)
text: string (opcional)
photos: File[] (opcional, máx 10)
```

### Exemplo de Request
```bash
# Usando serviceProjectId direto (mais simples)
curl -X POST 'http://localhost:3000/projects/service-uuid-123/feed' \
  -H 'Authorization: Bearer seu-token' \
  -F 'userId=user-uuid-123' \
  -F 'text=Progresso do dia - instalação elétrica concluída' \
  -F 'photos=@foto1.jpg' \
  -F 'photos=@foto2.jpg'
```

### Resposta de Sucesso (201)
```json
{
  "success": true,
  "data": {
    "activity": {
      "id": "activity-uuid-1",
      "text": "Progresso do dia - instalação elétrica concluída",
      "date_creation": "2024-11-05T10:30:00.000Z",
      "author": {
        "id": "user-uuid-123",
        "name": "João Silva",
        "avatar": "https://presigned-url..."
      }
    },
    "photos": [
      {
        "id": "photo-uuid-1",
        "url": "https://presigned-url...",
        "date_creation": "2024-11-05T10:30:00.000Z"
      }
    ],
    "serviceProject": {
      "id": "service-uuid-123",
      "name": "Instalação Elétrica",
      "projectId": "project-uuid-123"
    }
  }
}
```

**📖 Documentação completa:** Ver `PROJECT_FEED.md` seção "1. Criar Post no Feed"

---

## 10. Calendário de Serviços

**GET** `/service-project/schedule/worker/:id`

Retorna os serviços do funcionário no formato de calendário (para exibição em agenda).

### Headers
```
Authorization: Bearer {token}
```

### Parâmetros
- `id` (URL) - ID do funcionário (worker)

### Exemplo de Request
```bash
curl -X GET 'http://localhost:3000/service-project/schedule/worker/user-uuid-123' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
[
  {
    "title": "Instalação Elétrica",
    "start": "2024-11-01T00:00:00.000Z",
    "end": "2024-11-15T23:59:59.000Z",
    "description": "Rua Exemplo, 123 - São Paulo, SP"
  },
  {
    "title": "Pintura Externa",
    "start": "2024-11-05T00:00:00.000Z",
    "end": "2024-11-20T23:59:59.000Z",
    "description": "Av. Principal, 456 - Rio de Janeiro, RJ"
  }
]
```

### Campos da Resposta
- `title`: Nome do serviço
- `start`: Data/hora de início (ISO 8601)
- `end`: Data/hora de término (ISO 8601)
- `description`: Endereço do projeto

### Características
- ✅ Formato ideal para bibliotecas de calendário (FullCalendar, React Big Calendar, etc)
- ✅ Filtra apenas eventos com datas válidas
- ✅ Retorna apenas serviços do funcionário especificado

### Erros Possíveis
- **400** - Worker user ID is required
- **400** - The id entered must be that of a worker
- **500** - Internal server error

---

## 📱 Fluxo Recomendado para o App

### Tela 1: Lista de Projetos/Serviços

```javascript
// 1. Carregar lista inicial (serviços atribuídos)
const loadServices = async () => {
  const response = await fetch('/services_with_details/user-123', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ search: '' })
  });
  
  const services = await response.json();
  // Exibir cards com: nome, endereço, status, progresso
};

// 2. Buscar serviços atribuídos
const searchServices = async (searchTerm) => {
  const response = await fetch('/user_service_project/search/user-123', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ search: searchTerm })
  });
  
  const results = await response.json();
  // Atualizar lista
};
```

### Tela 1.1: Lista de TODOS os Projetos para Check-In (NOVO)

```javascript
// Carregar TODOS os projetos disponíveis para check-in
const loadAvailableProjects = async (userId, companyId = null, search = '') => {
  const params = new URLSearchParams({
    userId: userId
  });
  
  if (companyId) params.append('companyId', companyId);
  if (search) params.append('search', search);
  
  const response = await fetch(`/available-projects-for-checkin?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const { services } = await response.json();
  // Exibir lista com todos os projetos em andamento
  // Mostrar badge "Já atribuído" se isAssigned === true
};

// Realizar check-in em qualquer projeto
const checkInToService = async (userId, serviceProjectId, location = null) => {
  const response = await fetch('/check-in-by-service', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      service_project_id: serviceProjectId,
      address: location?.address || null,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null
    })
  });
  
  const result = await response.json();
  if (result.success) {
    // Check-in realizado com sucesso
    // UserServiceProject foi criado automaticamente
    showSuccessMessage('Check-in realizado!');
  }
};
```

### Tela 2: Detalhes do Serviço

```javascript
// Ao clicar em um serviço
const loadServiceDetails = async (serviceId) => {
  const response = await fetch(`/services/details-geral/${serviceId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const details = await response.json();
  // Exibir: descrição, status, endereço, fotos, atividades, progresso
};
```

### Tela 3: Feed do Serviço

```javascript
// Carregar feed do serviço
const loadServiceFeed = async (serviceId) => {
  const response = await fetch(`/services/${serviceId}/feed`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const { data } = await response.json();
  // Exibir posts com fotos, texto, autor, data
};
```

### Tela 4: Criar Post

```javascript
// Criar novo post no feed
const createPost = async (serviceId, text, photos) => {
  const formData = new FormData();
  formData.append('userId', currentUser.id);
  formData.append('text', text);
  
  photos.forEach(photo => {
    formData.append('photos', photo);
  });

  const response = await fetch(`/projects/${serviceId}/feed`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  const result = await response.json();
  // Atualizar feed
};
```

### Tela 5: Calendário

```javascript
// Carregar agenda do funcionário
const loadCalendar = async (userId) => {
  const response = await fetch(`/service-project/schedule/worker/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const events = await response.json();
  // Exibir em calendário (FullCalendar, React Big Calendar, etc)
};
```

---

## 11. ✨ Listar Projetos Disponíveis para Check-In

**GET** `/available-projects-for-checkin`

Lista **TODOS os projetos/serviços em andamento** disponíveis para check-in, **sem necessidade de estar previamente atribuído**. Ideal para permitir que funcionários escolham em qual projeto bater o ponto.

### Headers
```
Authorization: Bearer {token}
```

### Query Parameters
- `userId` (obrigatório) - ID do funcionário
- `companyId` (opcional) - ID da empresa (filtra por empresa)
- `search` (opcional) - Termo de busca por nome do serviço

### Exemplo de Request
```bash
# Listar todos os projetos disponíveis
curl -X GET 'http://localhost:3000/available-projects-for-checkin?userId=user-123' \
  -H 'Authorization: Bearer seu-token'

# Filtrar por empresa e buscar
curl -X GET 'http://localhost:3000/available-projects-for-checkin?userId=user-123&companyId=company-456&search=elétrica' \
  -H 'Authorization: Bearer seu-token'
```

### Resposta de Sucesso (200)
```json
{
  "services": [
    {
      "id": "service-uuid-1",
      "name": "Instalação Elétrica",
      "description": "Instalação completa do sistema elétrico",
      "status": "In Progress",
      "start_date": "2024-11-01",
      "deadline": "2024-11-15",
      "project": {
        "id": "project-uuid-1",
        "contract_number": "CONTRACT-2024-001",
        "status_project": "In Progress",
        "location": "Rua Exemplo, 123 - São Paulo, SP",
        "coordinates": {
          "lat": "-23.550520",
          "lng": "-46.633308"
        },
        "client": {
          "id": "client-uuid-1",
          "name": "Cliente ABC Ltda"
        }
      },
      "isAssigned": false,
      "userServiceProjectId": null
    },
    {
      "id": "service-uuid-2",
      "name": "Pintura Externa",
      "description": "Pintura completa da fachada",
      "status": "Scheduled",
      "start_date": "2024-11-05",
      "deadline": "2024-11-20",
      "project": {
        "id": "project-uuid-2",
        "contract_number": "CONTRACT-2024-002",
        "status_project": "Pre-Start",
        "location": "Av. Principal, 456 - Rio de Janeiro, RJ",
        "coordinates": {
          "lat": "-22.906847",
          "lng": "-43.172896"
        },
        "client": {
          "id": "client-uuid-2",
          "name": "Cliente XYZ S.A."
        }
      },
      "isAssigned": true,
      "userServiceProjectId": "usp-uuid-123"
    }
  ],
  "total": 2
}
```

### Campos da Resposta
- `id`: ID do serviço (ServiceProject)
- `name`: Nome do serviço
- `description`: Descrição do serviço
- `status`: Status do serviço
- `start_date`: Data de início
- `deadline`: Prazo final
- `project`: Informações do projeto
  - `id`: ID do projeto
  - `contract_number`: Número do contrato
  - `status_project`: Status do projeto
  - `location`: Endereço do projeto
  - `coordinates`: Coordenadas GPS (lat, lng)
  - `client`: Informações do cliente
- `isAssigned`: Indica se o funcionário já está atribuído a este serviço
- `userServiceProjectId`: ID do UserServiceProject (se já estiver atribuído, senão `null`)

### Características
- ✅ **Não requer atribuição prévia** - Lista TODOS os projetos em andamento
- ✅ **Filtra apenas projetos com status:** `In Progress` e `Final walkthrough`
- ✅ Filtra automaticamente projetos cancelados, rejeitados ou declinados
- ✅ Filtra serviços cancelados
- ✅ Indica se o funcionário já está atribuído (`isAssigned`)
- ✅ Suporta busca por nome do serviço
- ✅ Filtra por empresa (opcional)
- ✅ Ordenado por data de criação (mais recente primeiro)

### Erros Possíveis
- **400** - User ID is required
- **404** - User not found
- **500** - Error while fetching available projects

---

## 12. ✨ Check-In Simplificado

**POST** `/check-in-by-service`

Realiza check-in em um serviço **sem necessidade de estar previamente atribuído**. O sistema cria automaticamente o `UserServiceProject` se não existir.

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

### Body (JSON)
```json
{
  "user_id": "user-uuid-123",
  "service_project_id": "service-uuid-456",
  "address": "Rua Exemplo, 123 - São Paulo, SP",
  "latitude": -23.550520,
  "longitude": -46.633308
}
```

### Campos
- `user_id` (obrigatório) - ID do funcionário
- `service_project_id` (obrigatório) - ID do serviço (ServiceProject)
- `address` (opcional) - Endereço do check-in
- `latitude` (opcional) - Latitude GPS
- `longitude` (opcional) - Longitude GPS

**Nota:** Se `address`, `latitude` ou `longitude` não forem fornecidos, o sistema usa as coordenadas do projeto.

### Exemplo de Request
```bash
curl -X POST 'http://localhost:3000/check-in-by-service' \
  -H 'Authorization: Bearer seu-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user-uuid-123",
    "service_project_id": "service-uuid-456",
    "address": "Rua Exemplo, 123",
    "latitude": -23.550520,
    "longitude": -46.633308
  }'
```

### Resposta de Sucesso (201)
```json
{
  "success": true,
  "data": {
    "id": "attendance-uuid-1",
    "user_id": "user-uuid-123",
    "user_service_project_id": "usp-uuid-789",
    "check_in_time": "2024-11-05T10:30:00.000Z",
    "check_in_address": "Rua Exemplo, 123 - São Paulo, SP",
    "check_in_latitude": -23.550520,
    "check_in_longitude": -46.633308,
    "check_out_time": null,
    "isOvertime": false,
    "UserServiceProject": {
      "id": "usp-uuid-789",
      "service_project": {
        "id": "service-uuid-456",
        "name": "Instalação Elétrica",
        "Project": {
          "id": "project-uuid-1",
          "contract_number": "CONTRACT-2024-001",
          "location": "Rua Exemplo, 123 - São Paulo, SP"
        }
      }
    }
  },
  "message": "Check-in realizado com sucesso. UserServiceProject criado automaticamente."
}
```

### Comportamento
1. ✅ Valida se o usuário existe
2. ✅ Valida se o serviço existe e está ativo
3. ✅ Valida se o projeto não está cancelado/rejeitado
4. ✅ **Cria automaticamente o `UserServiceProject` se não existir**
5. ✅ Atualiza o status do serviço para "In Progress" se necessário
6. ✅ Verifica se não há check-in aberto para o mesmo serviço
7. ✅ Cria o registro de check-in

### Erros Possíveis
- **400** - user_id and service_project_id are required
- **400** - User not found
- **404** - Service project not found
- **400** - Cannot check in to a canceled or rejected project
- **400** - Cannot check in to a canceled service
- **400** - There is already an open attendance for this service
- **500** - Error while checking in

### Diferenças do Check-In Tradicional

| Característica | Check-In Tradicional | Check-In Simplificado |
|----------------|---------------------|----------------------|
| **Endpoint** | `POST /check-in` | `POST /check-in-by-service` |
| **Parâmetro** | `user_service_project_id` | `service_project_id` |
| **Requer atribuição?** | ✅ Sim (deve existir UserServiceProject) | ❌ Não (cria automaticamente) |
| **Uso recomendado** | Quando já está atribuído | Quando quer escolher qualquer projeto |

---

## 🔄 Relacionamento entre Endpoints

```
Funcionário (user-123)
  │
  ├─→ POST /user_service_project/search/:id
  │   └─→ Lista serviços (resumo)
  │
  ├─→ POST /services_with_details/:id
  │   └─→ Lista serviços (detalhado)
  │
  ├─→ GET /services/details-geral/:id
  │   └─→ Detalhes completos de UM serviço
  │       │
  │       ├─→ GET /services/:id/feed
  │       │   └─→ Feed do serviço
  │       │
  │       └─→ GET /project/services-project/:projectId
  │           └─→ Todos os serviços do projeto
  │
  └─→ GET /service-project/schedule/worker/:id
      └─→ Calendário/agenda
```

---

## ⚠️ Notas Importantes

### ✨ Check-In sem Atribuição Prévia

**Novo recurso disponível!** Agora os funcionários podem:

1. **Ver TODOS os projetos em andamento** usando `GET /available-projects-for-checkin`
2. **Fazer check-in em qualquer projeto** usando `POST /check-in-by-service`
3. **Não precisam mais estar previamente atribuídos** - o sistema cria automaticamente o `UserServiceProject`

**Fluxo recomendado:**
```
1. Funcionário abre app → Tela de Check-In
2. Sistema lista TODOS os projetos disponíveis (GET /available-projects-for-checkin)
3. Funcionário escolhe o projeto
4. Sistema faz check-in (POST /check-in-by-service)
5. UserServiceProject é criado automaticamente se não existir
```

**Vantagens:**
- ✅ Mais flexibilidade para funcionários
- ✅ Não precisa que admin atribua previamente
- ✅ Funcionários podem trabalhar em projetos conforme necessário
- ✅ Mantém compatibilidade com sistema antigo (check-in tradicional ainda funciona)

### URLs Pré-assinadas (Presigned URLs)
- Fotos e avatares retornam URLs pré-assinadas do S3
- URLs expiram após um período (geralmente 1 hora)
- Recarregue os dados se as imagens não aparecerem

### Filtros Automáticos
- Serviços cancelados são automaticamente filtrados
- Projetos cancelados/rejeitados/declinados são filtrados
- Apenas serviços ativos são retornados

### Paginação
- Endpoints de feed suportam paginação via `limit` e `offset`
- Padrão: 50 itens por página
- Use `hasMore` para verificar se há mais páginas

### Status de Serviços
- `Scheduled`: Agendado (ainda não iniciado)
- `In Progress`: Em andamento
- `Completed`: Concluído
- `Canceled`: Cancelado (filtrado automaticamente)

### Status de Projetos
- `Pre-Start`: Pré-início
- `In Progress`: Em andamento
- `Final walkthrough`: Vistoria final
- `Finished`: Finalizado
- `Canceled`: Cancelado (filtrado automaticamente)

---

## 🐛 Troubleshooting

### "No service projects found for this user"
**Causa:** Funcionário não tem serviços atribuídos ou todos foram cancelados  
**Solução:** Verificar se o funcionário está atribuído a algum serviço ativo

### Fotos não aparecem
**Causa:** URL pré-assinada expirou  
**Solução:** Recarregar os dados para obter novas URLs

### Erro 404 ao buscar serviço
**Causa:** ID do serviço incorreto ou serviço foi deletado  
**Solução:** Verificar se o ID está correto e se o serviço existe

---

## 📚 Documentação Relacionada

- **Feed Completo:** Ver `PROJECT_FEED.md` para documentação completa do sistema de feed
- **Autenticação:** Ver documentação de autenticação da API
- **Upload de Fotos:** Ver documentação de upload de arquivos

---

**Última atualização:** Novembro 2024  
**Versão da API:** 2.0



