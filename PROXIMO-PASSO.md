# 🎯 Próximos Passos - Refatoração Files e Pastes

## ⚡ Ações Necessárias AGORA

### 1️⃣ Migrar o Banco de Dados

Execute estes comandos **na ordem**:

```bash
# 1. Criar a migration
npx prisma migrate dev --name add_projectId_to_files_and_pastes

# 2. Gerar o Prisma Client
npx prisma generate
```

**O que isso faz:**
- Adiciona a coluna `projectId` nas tabelas `project_files` e `project_pastes`
- Cria a relação entre files/pastes e projects
- Atualiza o Prisma Client com os novos campos

---

### 2️⃣ (SE VOCÊ JÁ TEM DADOS) Migrar Dados Existentes

Se você já tem arquivos e pastas no banco, precisa associá-los a projetos:

**Opção A: Script SQL Manual**

```sql
-- Associar cada arquivo ao primeiro projeto da sua empresa
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

**Opção B: Script Node.js** (mais seguro)

Crie `scripts/migrateProjectFiles.ts`:

```typescript
import { prisma } from "../src/utils/prisma";

async function migrateFiles() {
  // Buscar todos os arquivos sem projectId
  const files = await prisma.projectFiles.findMany({
    where: { projectId: null },
    include: { company: true }
  });

  console.log(`Encontrados ${files.length} arquivos para migrar`);

  for (const file of files) {
    // Buscar primeiro projeto da empresa
    const project = await prisma.project.findFirst({
      where: { company_id: file.companyId }
    });

    if (project) {
      await prisma.projectFiles.update({
        where: { id: file.id },
        data: { projectId: project.id }
      });
      console.log(`✅ Arquivo ${file.id} migrado para projeto ${project.id}`);
    } else {
      console.warn(`⚠️ Arquivo ${file.id} sem projeto para empresa ${file.companyId}`);
    }
  }

  // Mesmo para pastas
  const pastes = await prisma.projectPastes.findMany({
    where: { projectId: null },
    include: { company: true }
  });

  console.log(`Encontradas ${pastes.length} pastas para migrar`);

  for (const paste of pastes) {
    const project = await prisma.project.findFirst({
      where: { company_id: paste.companyId }
    });

    if (project) {
      await prisma.projectPastes.update({
        where: { id: paste.id },
        data: { projectId: project.id }
      });
      console.log(`✅ Pasta ${paste.id} migrada para projeto ${project.id}`);
    }
  }

  console.log("✅ Migração concluída!");
}

migrateFiles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Execute:
```bash
npx ts-node scripts/migrateProjectFiles.ts
```

---

### 3️⃣ Testar as Rotas

Use o Postman/Insomnia/Thunder Client para testar:

#### ✅ Criar Arquivo

```http
POST /file
Content-Type: multipart/form-data
Authorization: Bearer {token}

file: [arquivo]
userId: "user-id"
projectId: "project-id"      ← OBRIGATÓRIO
companyId: "company-id"      ← OBRIGATÓRIO
name: "Documento.pdf"
description: "Teste"
```

#### ✅ Buscar Arquivos do Projeto

```http
GET /files/{projectId}/{userId}
Authorization: Bearer {token}
```

#### ✅ Criar Pasta

```http
POST /pastes
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "Documentos",
  "userId": "user-id",
  "projectId": "project-id",    ← OBRIGATÓRIO
  "companyId": "company-id"     ← OBRIGATÓRIO
}
```

#### ✅ Buscar Pastas do Projeto

```http
GET /pastes/project/{projectId}
Authorization: Bearer {token}
```

---

## 📋 Resumo das Mudanças

### O que mudou nas ROTAS:

| Antiga | Nova | Mudança |
|--------|------|---------|
| `GET /files/:companyId/:userId` | `GET /files/:projectId/:userId` | 🔄 companyId → projectId |
| `GET /file/get/:id/:userId/:companyId` | `GET /file/get/:id/:userId/:projectId` | 🔄 companyId → projectId |
| `GET /files/paste/:pasteId/:userId/:companyId` | `GET /files/paste/:pasteId/:userId/:projectId` | 🔄 companyId → projectId |
| `GET /pastes/:companyId` | `GET /pastes/project/:projectId` | 🔄 companyId → projectId |

### O que mudou nos CONTROLLERS:

**CreateFileController / CreatePasteController:**
- Agora exigem `projectId` E `companyId` no body
- Validam se o projeto existe

**GetFilesController / GetPastesController:**
- Agora buscam por `projectId` ao invés de `companyId`
- Retornam apenas dados do projeto específico

---

## 🔧 Atualizações no Frontend

### 1. Copiar Arquivos

Copie para o seu projeto frontend:
```
src/types/files-pastes.types.ts
src/services/filesAndPastesService.ts
src/services/types.ts
src/services/index.ts
```

### 2. Ajustar Import do API Server

No `filesAndPastesService.ts` linha 7, ajuste:
```typescript
import apiArpPro from "../apiServer";
// Ajuste para o caminho correto no seu projeto
```

### 3. Atualizar Componentes

Onde você tinha:
```typescript
// ❌ ANTES
await createFile(file, {
  userId,
  companyId
});
```

Mude para:
```typescript
// ✅ AGORA
await createFile(file, {
  userId,
  projectId,    // ← Adicionar
  companyId
});
```

---

## ✅ Checklist Final

- [ ] Executar `npx prisma migrate dev`
- [ ] Executar `npx prisma generate`
- [ ] (Se tem dados) Migrar arquivos/pastas existentes
- [ ] Testar criação de arquivo (POST /file)
- [ ] Testar busca de arquivos (GET /files/:projectId/:userId)
- [ ] Testar criação de pasta (POST /pastes)
- [ ] Testar busca de pastas (GET /pastes/project/:projectId)
- [ ] Atualizar frontend com novo projectId
- [ ] Testar integração completa

---

## 🆘 Problemas Comuns

### Erro: "projectId does not exist in type..."

**Causa**: Prisma Client não foi regenerado

**Solução**:
```bash
npx prisma generate
```

---

### Erro: "Project not found"

**Causa**: projectId inválido ou projeto não existe

**Solução**: Verifique se o projectId está correto e se o projeto existe no banco

---

### Erro: "Cannot add foreign key constraint"

**Causa**: Arquivos/pastas existentes sem projectId válido

**Solução**: Execute o script de migração de dados antes

---

## 📞 Documentação Completa

Consulte `REFATORACAO-COMPLETA.md` para detalhes completos de todas as mudanças.

---

**🎉 Após seguir estes passos, sua refatoração estará completa e funcionando!**



