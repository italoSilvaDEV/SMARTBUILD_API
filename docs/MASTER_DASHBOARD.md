# Master Dashboard - Endpoints

## Visão Geral
A conta **master** acompanha todas as empresas clientes (Company) da Smartbuild. As rotas abaixo já existem e retornam os dados que alimentam o dashboard inicial (cards, gráficos e detalhes por cliente).

### Autenticação
Use `Authorization: Bearer {token}` em todas as chamadas.

## Endpoints

### 1) GET `/master-dashboard`
Retorna os dados agregados para o dashboard master.

**Query params**
- `year` (opcional): ano usado para o gráfico de crescimento cumulativo. Padrão: ano corrente.

**Cards**
- `clients`: total de empresas.
- `freeClients`: empresas com assinatura ativa de plano `FREE`.
- `paidClients`: empresas com assinatura ativa de plano pago (qualquer `validityType` diferente de `FREE`).
- `activeClients`: empresas cujo admin acessou há menos de 1 mês (`last_acess`).
- `inactiveClients`: empresas sem admin ativo nos últimos 30 dias (ou sem registro de acesso).
- `activeProjects`: projetos em `Accepted | Pre-Start | In Progress | Final walkthrough`.
- `activePlans`: quantidade de planos com pelo menos uma assinatura ativa.
- `permissionsGroups`: total de grupos de permissão cadastrados.

**Gráficos e listas**
- `cumulativeCustomers`: crescimento mensal cumulativo de empresas no ano solicitado.
- `recentClients`: últimos 5 admins criados, com nome, avatar (URL assinada), empresa e contagem de projetos.
- `plansDistribution`: distribuição das assinaturas ativas por plano (nome, contagem e percentual).

**Exemplo de resposta (resumo)**
```json
{
  "clients": 120,
  "freeClients": 35,
  "paidClients": 85,
  "activeClients": 90,
  "inactiveClients": 30,
  "activeProjects": 42,
  "activePlans": 3,
  "permissionsGroups": 5,
  "cumulativeCustomers": [
    { "month": "Jan", "total": 50 },
    { "month": "Fev", "total": 55 }
  ],
  "recentClients": [
    { "id": "user-1", "name": "João", "companyName": "ACME", "projectsCount": 3, "avatar": "https://..." }
  ],
  "plansDistribution": [
    { "name": "Free", "count": 35, "percentage": 29 },
    { "name": "Mensal", "count": 70, "percentage": 58 }
  ]
}
```

### 2) GET `/client/details/:companyId`
Retorna detalhes de uma empresa específica para o painel master.

**Parâmetros**
- `companyId` (URL): ID da Company.

**Campos principais**
- `company`: `id`, `name`, `avatar` (URL assinada).
- `clientDetails`: dados de contato do admin (nome, email, telefone, cidade/estado).
- `usersData`: total de usuários da empresa por função (`admin`, `worker`, `seller`, `total`).
- `overview`: totais de projetos e invoices.
- `currentPlan`: nome, preço, tipo (`validityType`), `startDate`, `endDate` da assinatura ativa.

**Exemplo de resposta (resumo)**
```json
{
  "company": { "id": "comp-1", "name": "ACME", "avatar": "https://..." },
  "clientDetails": { "name": "João", "email": "joao@email.com" },
  "usersData": { "admin": 1, "worker": 8, "seller": 2, "total": 11 },
  "overview": { "totalProjects": 14, "totalInvoices": 52 },
  "currentPlan": { "name": "Mensal", "price": 99, "type": "MONTHLY" }
}
```
