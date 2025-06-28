# Scripts de Backfill UserCompany

Este diretório contém scripts para migrar dados do relacionamento 1:N (User.company_id) para o novo relacionamento N:N através da tabela UserCompany.

## Arquivos

- `backfill-user-company.js` - Script principal para fazer o backfill dos dados
- `rollback-user-company.js` - Script para desfazer o backfill se necessário
- `validate-user-company.js` - Script para validar a integridade dos dados após o backfill
- `backfill-user-company.sql` - Script SQL alternativo para execução direta no banco

## Pré-requisitos

1. Certifique-se de que o Prisma Client está atualizado:
   ```bash
   npx prisma generate
   ```

2. Verifique se a tabela `user_company` foi criada corretamente:
   ```bash
   npx prisma db push
   ```

## Uso

### 1. Executar Backfill

```bash
# Executar o script de backfill
node scripts/backfill-user-company.js
```

O script irá:
- Buscar todos os usuários que têm `company_id` preenchido
- Verificar quais relações já existem na tabela `UserCompany`
- Criar registros na `UserCompany` para usuários que ainda não foram migrados
- Definir o papel padrão como "MEMBER"
- Mostrar estatísticas e exemplos dos dados migrados

### 2. Validar Resultados

```bash
# Executar validação completa
node scripts/validate-user-company.js
```

O script de validação irá verificar:
- Se todos os usuários com `company_id` têm registro na `UserCompany`
- Relações órfãs (usuários/empresas que não existem mais)
- Duplicatas na tabela `UserCompany`
- Integridade referencial
- Distribuição de papéis
- Estatísticas gerais
- Usuários com múltiplas empresas

### 3. Verificar Dados Manualmente

Após executar o backfill, você pode verificar os dados:

```sql
-- Contar total de relações
SELECT COUNT(*) FROM user_company;

-- Ver exemplos de dados
SELECT 
    uc.id,
    u.name as user_name,
    u.email as user_email,
    c.name as company_name,
    uc.role,
    uc.createdAt
FROM user_company uc
JOIN User u ON uc.userId = u.id
JOIN Company c ON uc.companyId = c.id
LIMIT 10;
```

### 4. Rollback (se necessário)

```bash
# Remover todos os registros da UserCompany
node scripts/rollback-user-company.js all

# Remover registros de usuários específicos
node scripts/rollback-user-company.js users <userId1> <userId2>

# Remover registros de empresas específicas
node scripts/rollback-user-company.js companies <companyId1> <companyId2>
```

### 5. Execução via SQL (alternativa)

Se preferir executar diretamente no banco:

```bash
# Conectar ao MySQL e executar
mysql -u username -p database_name < scripts/backfill-user-company.sql
```

## Fluxo Recomendado

1. **Backup do banco** (sempre antes de executar scripts de migração)
2. **Executar backfill**: `node scripts/backfill-user-company.js`
3. **Validar dados**: `node scripts/validate-user-company.js`
4. **Verificar manualmente** alguns registros no banco
5. **Testar aplicação** com os novos dados
6. **Rollback se necessário**: `node scripts/rollback-user-company.js all`

## Estrutura de Dados

### Antes (Relacionamento 1:N)
```javascript
// User model
{
  id: "user-uuid",
  name: "João Silva",
  email: "joao@email.com",
  company_id: "company-uuid", // Relacionamento 1:N
  // ... outros campos
}
```

### Depois (Relacionamento N:N)
```javascript
// UserCompany model (nova tabela)
{
  id: "usercompany-uuid",
  userId: "user-uuid",
  companyId: "company-uuid",
  role: "MEMBER", // ADMIN | MEMBER | GUEST
  createdAt: "2025-06-20T19:17:00Z"
}
```

## Papéis Disponíveis

- `ADMIN` - Administrador da empresa
- `MEMBER` - Membro padrão da empresa
- `GUEST` - Convidado com acesso limitado

## Segurança

- O script verifica duplicatas antes de inserir
- Usa transações para garantir consistência
- Mantém o relacionamento original intacto
- Permite rollback completo ou parcial
- Validação completa da integridade dos dados

## Logs

O script fornece logs detalhados incluindo:
- Número de usuários encontrados
- Relações já existentes
- Usuários migrados
- Estatísticas finais
- Exemplos de dados

## Troubleshooting

### Erro: "Table 'user_company' doesn't exist"
```bash
npx prisma migrate dev
npx prisma db push
```

### Erro: "Column 'role' doesn't exist"
Execute primeiro o script SQL para adicionar a coluna:
```sql
ALTER TABLE user_company ADD COLUMN role VARCHAR(10) DEFAULT 'MEMBER';
```

### Erro de permissão no MySQL
Certifique-se de que o usuário do banco tem permissões de INSERT/UPDATE na tabela user_company.

### Problemas de integridade encontrados na validação
Execute o script de rollback e verifique os dados originais antes de tentar novamente:
```bash
node scripts/rollback-user-company.js all
node scripts/validate-user-company.js
```

## Exemplo de Saída

### Backfill
```
🚀 Iniciando backfill UserCompany...
📊 Encontrados 25 usuários com empresa vinculada
📋 Relações existentes na UserCompany: 0
🔄 Usuários a serem migrados: 25
✅ Criados 25 registros na UserCompany

📈 Estatísticas finais:
- Total de relações UserCompany: 25
- Usuários únicos: 25
- Empresas únicas: 3

📝 Exemplos de dados migrados:
- João Silva (joao@email.com) → Empresa ABC [MEMBER]
- Maria Santos (maria@email.com) → Empresa XYZ [MEMBER]
- Pedro Costa (pedro@email.com) → Empresa ABC [MEMBER]

🎉 Backfill concluído com sucesso!
```

### Validação
```
🔍 Iniciando validação UserCompany...
📊 Usuários com company_id: 25
📊 Relações na UserCompany: 25
✅ Todos os usuários com company_id estão na UserCompany
✅ Nenhuma relação órfã encontrada na UserCompany
✅ Nenhuma duplicata encontrada na UserCompany
✅ Integridade referencial OK

📊 Distribuição de papéis:
  - MEMBER: 25 usuários

📈 Estatísticas gerais:
  - Usuários únicos: 25
  - Empresas únicas: 3
  - Total de relações: 25
  - Média de empresas por usuário: 1.00
  - Máximo de empresas por usuário: 1

👤 Nenhum usuário com múltiplas empresas encontrado

📋 Resumo da validação:
✅ Validação concluída com sucesso - Nenhum problema encontrado!

🎉 Validação concluída!