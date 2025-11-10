# 🔄 Refatoração Completa - Files e Pastes com ProjectId

## 📋 Resumo das Mudanças

### ✅ O que foi alterado:

Os arquivos e pastas agora estão **vinculados a projetos específicos** ao invés de toda a empresa. Isso garante que os arquivos ficam isolados por projeto.

---

## 🗄️ Mudanças no Schema (Prisma)

### ProjectFiles
- ✅ **Mantido**: `companyId` (vínculo com empresa)
- ✅ **Adicionado**: `projectId` (vínculo com projeto)
- ✅ **Relação**: `project Project @relation(fields: [projectId], references: [id])`

### ProjectPastes
- ✅ **Mantido**: `companyId` (vínculo com empresa)
- ✅ **Adicionado**: `projectId` (vínculo com projeto)
- ✅ **Relação**: `project Project @relation(fields: [projectId], references: [id])`

### Project
- ✅ **Adicionado**: `projectFiles ProjectFiles[]`
- ✅ **Adicionado**: `projectPastes ProjectPastes[]`

---

## 🎯 Controllers Refatorados

### 📁 Files Controllers

#### ✅ **CreateFileController**
**Mudanças:**
- Agora exige `projectId` E `companyId` no body
- Valida se o projeto existe
- Cria arquivo vinculado ao projeto

**Request Body:**
```typescript
{
  file: File,
  userId: string,
  projectId: string,     // ✨ OBRIGATÓRIO
  companyId: string,     // ✨ OBRIGATÓRIO
  name?: string,
  description?: string,
  pasteId?: string
}
```

---

#### ✅ **GetFilesController**
**Mudanças:**
- ❌ ~~Antes: `GET /files/:companyId/:userId`~~
- ✅ **Agora: `GET /files/:projectId/:userId`**
- Busca **todos os arquivos do projeto** (não mais da empresa)

**Params:**
```typescript
{
  projectId: string,  // ✨ Mudou de companyId
  userId: string
}
```

---

#### ✅ **GetFileController**
**Mudanças:**
- ❌ ~~Antes: `GET /file/get/:id/:userId/:companyId`~~
- ✅ **Agora: `GET /file/get/:id/:userId/:projectId`**
- Busca arquivo específico do projeto

**Params:**
```typescript
{
  id: string,
  userId: string,
  projectId: string  // ✨ Mudou de companyId
}
```

---

#### ✅ **GetFilesByPasteController**
**Mudanças:**
- ❌ ~~Antes: `GET /files/paste/:pasteId/:userId/:companyId`~~
- ✅ **Agora: `GET /files/paste/:pasteId/:userId/:projectId`**
- Busca arquivos de uma pasta específica do projeto

**Params:**
```typescript
{
  pasteId: string,
  userId: string,
  projectId: string  // ✨ Mudou de companyId
}
```

---

### 📂 Pastes Controllers

#### ✅ **CreatePasteController**
**Mudanças:**
- Agora exige `projectId` E `companyId` no body
- Valida se o projeto existe
- Cria pasta vinculada ao projeto

**Request Body:**
```typescript
{
  name: string,
  userId: string,
  projectId: string,     // ✨ OBRIGATÓRIO
  companyId: string      // ✨ OBRIGATÓRIO
}
```

---

#### ✅ **GetPastesController**
**Mudanças:**
- ❌ ~~Antes: `GET /pastes/:companyId`~~
- ✅ **Agora: `GET /pastes/project/:projectId`**
- Busca **todas as pastas do projeto** (não mais da empresa)

**Params:**
```typescript
{
  projectId: string  // ✨ Mudou de companyId
}
```

---

## 🛣️ Rotas Atualizadas

### Files Routes (`src/routes/fileRoutes.ts`)

| Método | Rota Antiga | Rota Nova | Descrição |
|--------|-------------|-----------|-----------|
| POST | `/file` | `/file` | Criar arquivo (body com projectId + companyId) |
| GET | `/files/:companyId/:userId` | **`/files/:projectId/:userId`** | 🔄 Buscar arquivos do projeto |
| GET | `/file/get/:id/:userId/:companyId` | **`/file/get/:id/:userId/:projectId`** | 🔄 Buscar arquivo específico |
| GET | `/files/paste/:pasteId/:userId/:companyId` | **`/files/paste/:pasteId/:userId/:projectId`** | 🔄 Arquivos por pasta |
| PUT | `/file` | `/file` | Atualizar arquivo |
| DELETE | `/file/:id` | `/file/:id` | Deletar arquivo |

### Pastes Routes (`src/routes/pasteRoutes.ts`)

| Método | Rota Antiga | Rota Nova | Descrição |
|--------|-------------|-----------|-----------|
| POST | `/pastes` | `/pastes` | Criar pasta (body com projectId + companyId) |
| GET | `/pastes/:companyId` | **`/pastes/project/:projectId`** | 🔄 Buscar pastas do projeto |
| GET | `/pastes/:id` | `/pastes/:id` | Buscar pasta específica |
| PUT | `/pastes/rename` | `/pastes/rename` | Renomear pasta |
| DELETE | `/pastes/:id` | `/pastes/:id` | Deletar pasta |

---

## 📦 Frontend - Interfaces TypeScript

### Arquivos Criados:
- ✅ `src/types/files-pastes.types.ts` - Todas as interfaces
- ✅ `src/services/filesAndPastesService.ts` - Funções com axios
- ✅ `src/services/types.ts` - Re-export dos types
- ✅ `src/services/index.ts` - Export principal

### Interfaces Atualizadas:

```typescript
// Files
export interface CreateFileRequest {
  name?: string;
  description?: string;
  pasteId?: string;
  userId: string;
  projectId: string;    // ✨ OBRIGATÓRIO
  companyId: string;    // ✨ OBRIGATÓRIO
}

export interface GetFilesParams {
  projectId: string;    // ✨ Mudou de companyId
  userId: string;
}

export interface GetFileParams {
  id: string;
  userId: string;
  projectId: string;    // ✨ Mudou de companyId
}

export interface GetFilesByPasteParams {
  pasteId: string;
  userId: string;
  projectId: string;    // ✨ Mudou de companyId
}

// Pastes
export interface CreatePasteRequest {
  name: string;
  userId: string;
  projectId: string;    // ✨ OBRIGATÓRIO
  companyId: string;    // ✨ OBRIGATÓRIO
}

export interface GetPastesParams {
  projectId: string;    // ✨ Mudou de companyId
}
```

---

## 🚀 Exemplos de Uso no Frontend

### Upload de Arquivo

```typescript
import { createFile } from "@/services";

const uploadFile = async (file: File, projectId: string, companyId: string) => {
  const response = await createFile(file, {
    userId: "user-id",
    projectId: projectId,      // ✨ OBRIGATÓRIO
    companyId: companyId,      // ✨ OBRIGATÓRIO
    name: "Meu arquivo.pdf",
    description: "Descrição"
  });
};
```

---

### Buscar Arquivos do Projeto

```typescript
import { getFiles } from "@/services";

const loadProjectFiles = async (projectId: string, userId: string) => {
  const response = await getFiles({
    projectId: projectId,  // ✨ Agora usa projectId
    userId: userId
  });
  
  console.log(response.data); // Arquivos do projeto
};
```

---

### Criar Pasta no Projeto

```typescript
import { createPaste } from "@/services";

const createProjectFolder = async (projectId: string, companyId: string) => {
  const response = await createPaste({
    name: "Documentos do Projeto",
    userId: "user-id",
    projectId: projectId,     // ✨ OBRIGATÓRIO
    companyId: companyId      // ✨ OBRIGATÓRIO
  });
};
```

---

### Buscar Pastas do Projeto

```typescript
import { getPastes } from "@/services";

const loadProjectFolders = async (projectId: string) => {
  const response = await getPastes({
    projectId: projectId  // ✨ Agora usa projectId
  });
  
  console.log(response.data); // Pastas do projeto
};
```

---

## ⚠️ IMPORTANTE - Migração do Banco de Dados

Após fazer as mudanças no schema, você precisa:

### 1. Criar a Migration

```bash
npx prisma migrate dev --name add_projectId_to_files_and_pastes
```

### 2. Gerar o Prisma Client

```bash
npx prisma generate
```

### 3. (Opcional) Migrar Dados Existentes

Se você já tem dados no banco, precisa associar os arquivos e pastas existentes a projetos:

```sql
-- Exemplo: associar arquivos ao projeto da empresa
UPDATE project_files 
SET projectId = (
  SELECT id FROM project 
  WHERE project.company_id = project_files.companyId 
  LIMIT 1
)
WHERE projectId IS NULL;

-- Mesmo para pastas
UPDATE project_pastes 
SET projectId = (
  SELECT id FROM project 
  WHERE project.company_id = project_pastes.companyId 
  LIMIT 1
)
WHERE projectId IS NULL;
```

---

## ✅ Checklist de Implementação

### Backend
- [x] Atualizar schema Prisma (ProjectFiles e ProjectPastes)
- [x] Adicionar relação no modelo Project
- [ ] Criar migration (`npx prisma migrate dev`)
- [ ] Gerar Prisma Client (`npx prisma generate`)
- [x] Refatorar CreateFileController
- [x] Refatorar GetFilesController
- [x] Refatorar GetFileController
- [x] Refatorar GetFilesByPasteController
- [x] Refatorar CreatePasteController
- [x] Refatorar GetPastesController
- [x] Atualizar rotas de files
- [x] Atualizar rotas de pastes
- [ ] (Opcional) Migrar dados existentes

### Frontend
- [x] Criar/Atualizar interfaces TypeScript
- [x] Criar funções de serviço com axios
- [ ] Atualizar componentes para enviar projectId
- [ ] Atualizar chamadas de API com novo projectId
- [ ] Testar upload de arquivos
- [ ] Testar listagem de arquivos por projeto
- [ ] Testar criação de pastas
- [ ] Testar listagem de pastas por projeto

---

## 📊 Benefícios da Refatoração

1. **🔒 Isolamento**: Arquivos e pastas isolados por projeto
2. **🎯 Organização**: Melhor organização dos arquivos
3. **🚀 Performance**: Queries mais eficientes (busca por projeto específico)
4. **🔐 Segurança**: Usuários só veem arquivos do projeto que têm acesso
5. **📈 Escalabilidade**: Sistema preparado para crescimento

---

## 🎉 Status da Refatoração

- ✅ Schema atualizado
- ✅ Controllers refatorados
- ✅ Rotas atualizadas
- ✅ Interfaces TypeScript criadas
- ✅ Funções de serviço com axios
- ⏳ Migration pendente (executar `npx prisma migrate dev`)
- ⏳ Prisma Client pendente (executar `npx prisma generate`)

**Pronto para migração do banco de dados e testes! 🚀**


