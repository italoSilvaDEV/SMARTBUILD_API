# Implementação do Atalho para Timeline do Usuário

## Resumo
Foi implementado um atalho da tela de atividade para permitir que o usuário clique em um funcionário online e vá diretamente para a tela de timeline dele.

## Alterações Realizadas

### 1. Modificação na API de Atividade (TimeController.ts)

**Arquivo:** `src/controllers/projects/timeController.ts`

**Mudança:** Adicionado o campo `user_id` na resposta da API de atividade.

```typescript
// Antes (linha ~822):
const formattedResult = Array.from(latestEntriesMap.values()).map(entry => ({
    name: entry.name,
    serviceName: entry.serviceName,
    address: entry.address,
    check_in_time: entry.check_in_time,
    check_out_time: entry.check_out_time,
    status: entry.status
}));

// Depois:
const formattedResult = Array.from(latestEntriesMap.values()).map(entry => ({
    name: entry.name,
    serviceName: entry.serviceName,
    address: entry.address,
    check_in_time: entry.check_in_time,
    check_out_time: entry.check_out_time,
    status: entry.status,
    user_id: entry.userId  // ← Campo adicionado
}));
```

### 2. Novo Endpoint para Timeline por User ID

**Arquivo:** `src/controllers/User/TimeLineController.ts`

**Método Adicionado:** `handleTimeLineByUserId`

Este método permite buscar a timeline de um usuário usando apenas o `user_id`, sem precisar do `user_service_project_id`.

```typescript
handleTimeLineByUserId = async (req: Request, res: Response): Promise<Response> => {
    // Busca o UserServiceProject mais recente para o usuário
    // Reutiliza o método handleTimeLineByWorker existente
}
```

### 3. Novas Rotas Adicionadas

**Arquivo:** `src/routes/userAttendanceRoutes.ts`

```typescript
// Novas rotas para timeline por user_id
userAttendanceRoutes.get('/time-line/timeline/:user_id', checkToken, timeLineController.handleTimeLineByUserId);
userAttendanceRoutes.get('/time-line/timeline/:user_id/:date', checkToken, timeLineController.handleTimeLineByUserId);
```

## Como Usar

### 1. API de Atividade (Resposta Atualizada)

**Endpoint:** `GET /time-activies?id={company_id}&start_date={date}&deadline={date}&page={page}`

**Resposta Atualizada:**
```json
{
    "indicators": {
        "totalIn": 2,
        "totalOut": 2,
        "totalServices": 4,
        "totalProjects": 3
    },
    "workers": [
        {
            "name": "SmartBuild4U",
            "serviceName": "Serviço teste",
            "address": "Travessa São José, 5...",
            "check_in_time": "2025-05-25T22:08:22.007Z",
            "check_out_time": null,
            "status": "In",
            "user_id": "a226992b-9f73-4234-966d-a973597ea338"  // ← Novo campo
        }
    ],
    "totalPages": 1
}
```

### 2. Novo Endpoint de Timeline

**Endpoint:** `GET /time-line/timeline/{user_id}` ou `GET /time-line/timeline/{user_id}/{date}`

**Exemplo de uso:**
```
GET /time-line/timeline/a226992b-9f73-4234-966d-a973597ea338
GET /time-line/timeline/a226992b-9f73-4234-966d-a973597ea338/2025-05-25
```

**Resposta:** Mesma estrutura do endpoint `/time-line/by-worker/:user_service_project_id/:date`

## Implementação no Frontend

No frontend, agora é possível criar o atalho usando o `user_id` retornado pela API de atividade:

```javascript
// Na tela de atividade, ao clicar em um worker:
const worker = {
    name: "SmartBuild4U",
    user_id: "a226992b-9f73-4234-966d-a973597ea338",
    // ... outros campos
};

// Construir URL para timeline:
const timelineUrl = `/time-cards/timeline/${worker.user_id}?date=${currentDate}`;

// Navegar para a timeline
window.location.href = timelineUrl;
```

## Funcionamento Interno

1. O novo endpoint `handleTimeLineByUserId` busca o `UserServiceProject` mais recente para o usuário
2. Prioriza projetos ativos com attendance em aberto
3. Se não encontrar, busca o projeto mais recente do usuário
4. Redireciona internamente para o método `handleTimeLineByWorker` existente
5. Retorna a mesma estrutura de dados da timeline

## Benefícios

- ✅ Atalho direto da tela de atividade para timeline
- ✅ Não requer conhecimento do `user_service_project_id`
- ✅ Reutiliza código existente
- ✅ Mantém compatibilidade com endpoints existentes
- ✅ Busca automaticamente o projeto mais relevante para o usuário

## Testing

Para testar as mudanças:

1. **Teste da API de Atividade:**
   ```bash
   GET /time-activies?id=COMPANY_ID&start_date=2025-05-25&deadline=2025-05-25&page=1
   # Verificar se user_id está presente na resposta
   ```

2. **Teste do Novo Endpoint:**
   ```bash
   GET /time-line/timeline/USER_ID
   GET /time-line/timeline/USER_ID/2025-05-25
   # Verificar se retorna os dados da timeline corretamente
   ``` 