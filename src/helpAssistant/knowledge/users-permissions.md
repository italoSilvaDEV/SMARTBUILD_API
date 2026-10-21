---
title: Gestão de usuários e cargos (User Management)
module: people
routes: [/users, /user/:id]
---

# Gestão de usuários e cargos (User Management)

## Para que serve

A tela "User Management" é onde você gerencia os funcionários da sua empresa: cadastra novos usuários, edita seus dados de trabalho (cargo, valor por hora ou por dia, local, visibilidade de projetos), reenvia senha, desativa ou exclui usuários. Também é onde você define os cargos ("Offices" ou "Positions"), que determinam as permissões de acesso de cada funcionário ao sistema, e onde controla a quantidade de usuários extras do plano.

## Onde encontrar

- Menu lateral: grupo "Management", item "User Management".
- Lista de usuários e cargos: `/users`.
- Detalhes de um usuário: `/user/:id` (clique na linha do usuário na lista).
- Quem vê: é preciso ter a permissão **"User Management"**. Sem ela, o item não aparece no menu e a tela não abre.
- Cargos de sistema ("Owner", "Administrator", "Worker", "General Manager" e "Master") não podem ter o nome alterado. Só as permissões podem ser editadas.

## O que aparece na tela

### Cabeçalho e abas

- Título "User Management", com o subtítulo "Manage your employees, positions, and permissions".
- Abas:
  - "Active Employees" (funcionários ativos).
  - "Inactive Employees" (funcionários desativados).
  - "Extra Employees" (usuários extras pagos, com um contador ao lado do nome quando há algum).
  - "Offices" (cargos, que aparecem como "Positions" na interface).
- Campo de busca "Search Users" (na aba de usuários) e "Search Offices" (na aba de cargos).
- Botões conforme a aba:
  - Em funcionários: "Add Extra Users", "New User".
  - Em usuários extras: "Reduce Extras".
  - Em cargos: "New Office".

### Lista de funcionários

- Colunas, com ordenação:
  - "Employee" (nome e e-mail).
  - "Position" (cargo).
  - "Location" (local, cidade e estado).
  - "Hourly Rate" (valor por hora ou por dia, conforme o tipo de pagamento).
  - "Actions" (menu da linha).
- No menu da linha, "Edit User / Time Card" abre a edição, e "Delete User" aparece somente para usuários que não têm cargo de administrador.
- Quando não há resultados: "No employees found.".

### Lista de cargos ("Offices")

- Mostra cada cargo com a quantidade de permissões selecionadas, por exemplo "3 permissions".
- Ao abrir um cargo, aparece a janela "Edit Position".
- Quando um cargo não tem permissões configuradas: "No permissions are configured for this position.".
- Quando não há cargos: "No offices found.".

### Janela de cadastro de usuário ("Add User" / "Edit User")

Campos principais:

- **Full Name** ("Name is required").
- **Email Address** ("Email is required", "Enter a valid email"). O sistema verifica se o e-mail já existe na empresa ("This email is already registered in your company").
- **Phone Number** ("Phone is required", com validação de acordo com o país escolhido).
- **Position / Role** (cargo, "Select a position", obrigatório: "Office is required").
- **Profession** (opcional).
- **Location (City, State)** ("City and State are required").
- **Photo** (JPG, PNG ou GIF; recomendado 400x400 px), com o botão "Update photo".
- **Payment Type**: "Hourly" (com "Hourly Rate") ou "Daily" (com "Daily Rate").
- **Break Mode** (política de intervalo): "Automatic Break" (o tempo de intervalo é descontado automaticamente dos cartões de ponto) ou "Manual Break" (o funcionário inicia e encerra o intervalo pelo aplicativo).
- **Project Visibility** ("Select visibility"): "All Active Projects" (vê todos os projetos ativos) ou "Only Assigned Projects" (vê apenas os projetos atribuídos a ele).
- **Password Configuration**: "Auto" (uma senha é gerada e enviada por e-mail ao usuário) ou "Manual" (você define a senha; mínimo de 6 caracteres; "Confirm Password" deve ser igual).
- Permissões de edição específicas: "Control project editing access", "Control estimate editing access" e "Control invoice editing access" (com os rótulos "Project Access", "Estimate Access" e "Invoice Access").
- Botões: "Cancel" e "Create User" (ou "Save Changes", na edição).

### Detalhes do usuário ("User Details")

- Nome, e-mail, telefone, cargo, local e valor por hora ou por dia.
- Status: "Active" ou "Inactive".
- Botões "Edit User" e "Resend Password".
- Lista de tarefas atribuídas ("Tasks", com "No tasks") e serviços vinculados ("Linked services", "No linked services").

### Janela de cargo ("Edit Position")

- "Position Name" (nome do cargo).
- "Position Permissions" e "Select Permissions", com a contagem "N permission(s) selected".
- "Grant All Permissions" (marca todas as permissões de uma vez).
- "Access Level Configuration" (configuração de nível de acesso).
- Botão "Save Position". O cargo também pode ser criado com "Add New Position".

### Usuários extras ("Add Extra Users" / "Reduce Extras")

- Janela "Add Extra Users": mostra quantos usuários você tem ("You currently have [N] users"), o limite do plano ("Plan limit"), a quantidade de usuários extras ("Extra users"), o valor do plano base ("Base plan"), o valor dos extras e o total mensal ("Monthly total"). A cobrança aparece na próxima fatura ("The charge will be reflected on your next invoice").
- Janela "Reduce Extra Users": mostra as vagas não utilizadas ("Unused seats"). Você pode reduzir sem afetar ninguém até esse número. Acima disso, é preciso escolher os usuários extras que serão desativados.

## Status e ciclo de vida

- **Ativo** ("Active"): pode entrar no sistema e usar as permissões do cargo. Ocupa uma vaga do plano.
- **Inativo** ("Inactive"): desativado. Não entra no sistema, mas o cadastro, o histórico e os registros são mantidos. Desativar libera a vaga.
- **Excluído** ("Delete User"): removido do sistema. Não é possível excluir usuários com cargo de administrador. A ação não pode ser desfeita.
- **Usuário extra**: funcionário que ocupa uma vaga paga além do limite do plano. Pode ser desativado para liberar a vaga.

Cargo: um cargo pode ser editado (permissões), ou excluído se não tiver usuários vinculados. Cargos de sistema não podem ser excluídos.

## Regras de negócio

### Cadastro

- Para criar um usuário, são obrigatórios nome, e-mail, cargo, cidade e estado e telefone.
- O e-mail não pode repetir um já cadastrado na empresa.
- Se a senha for automática, o sistema gera uma senha e a envia por e-mail ao usuário. Se a senha for manual, ela deve ter pelo menos 6 caracteres e ser confirmada.
- Não é possível criar um usuário quando a empresa já atingiu o número máximo de funcionários ativos do plano (incluindo os extras). A mensagem informa o limite.
- Um usuário novo começa com o tipo de pagamento "Hourly" por padrão.

### Ativação e desativação

- Desativar um funcionário libera a vaga no plano.
- Reativar um funcionário desativado exige uma vaga livre. Se o plano estiver cheio, aparece a mensagem: "Cannot enable user: company has reached the maximum number of active employees allowed ([limite]). Disable another user or purchase more seats." (para usuários do plano base).
- Para reativar um usuário extra, é preciso ter uma vaga extra livre. Caso contrário: "Cannot enable user: no available extra employee seats. Please purchase more seats or disable other extra paid users first.".

### Exclusão

- O botão "Delete User" não aparece para usuários com cargo de administrador.
- A confirmação diz: "Are you sure you want to delete this user? This action cannot be undone."
- Para afastar um funcionário sem perder o histórico, prefira desativá-lo.

### Cargos (permissões)

- As permissões de acesso de cada funcionário vêm do cargo dele. Alterar as permissões de um cargo afeta todos os usuários que têm esse cargo.
- Não é possível excluir um cargo que tenha usuários vinculados. A mensagem informa quantos usuários estão vinculados.
- Não é possível excluir os cargos de sistema: "Worker", "Administrator", "Owner", "Master" e "General Manager".
- Os nomes de cargos não podem repetir dentro da mesma empresa ("Office with this name already exists for this company").
- Proprietários ("Owner") têm acesso total a todos os registros e a todos os projetos ativos, independentemente do cargo.

### Visibilidade de projetos

- "All Active Projects": o funcionário vê todos os projetos ativos da empresa.
- "Only Assigned Projects": o funcionário vê apenas os projetos em que foi incluído.

### Usuários extras (cobrança)

- Adicionar usuários extras é uma cobrança recorrente: o valor é somado à mensalidade e aparece na próxima fatura. A opção "Add Extra Users" fica desabilitada se não houver assinatura ativa.
- Ao confirmar a compra, a tela mostra "Congratulations! You have purchased [N] extra user(s). The charge will be reflected on your next invoice." (ou a mensagem equivalente para uma vaga).
- Reduzir os extras:
  - Até o número de vagas não utilizadas, a redução é imediata e não afeta usuários.
  - Acima disso, é preciso escolher o mesmo número de usuários extras ativos para desativar.
- A alteração aparece na próxima fatura ("This change will be reflected on your next invoice.").

### Senha

- "Resend Password" gera e envia uma nova senha ao usuário, ou usa a senha definida manualmente pelo administrador. Use isso quando o funcionário esquecer a senha.


## Como fazer

### Como cadastrar um novo usuário

1. Acesse "User Management" no menu e confirme que está na aba "Active Employees".
2. Clique em "New User".
3. Preencha "Full Name", "Email Address", "Position / Role", "Location (City, State)" e "Phone Number".
4. Escolha o tipo de pagamento ("Hourly" ou "Daily") e informe o valor.
5. Escolha a política de intervalo, se quiser.
6. Em "Project Visibility", escolha "All Active Projects" ou "Only Assigned Projects".
7. Em "Password Configuration", escolha a senha automática (será enviada por e-mail) ou defina uma senha manual.
8. Clique em "Create User". A mensagem de sucesso é "User created successfully!".

### Como editar um usuário

1. Na lista, clique na linha do usuário, ou escolha "Edit User / Time Card" no menu da linha.
2. Altere os dados e clique em "Save Changes". A mensagem é "User updated successfully!".

### Como desativar ou reativar um usuário

1. Abra o usuário e altere o status, ou edite o usuário e marque como inativo.
2. Para reativar, confira se há vaga disponível no plano.

### Como excluir um usuário

1. Na lista, abra o menu da linha do usuário e escolha "Delete User".
2. Confirme em "Delete" na janela "Confirm Deletion". A ação não pode ser desfeita.

### Como reenviar a senha

1. Abra o usuário e clique em "Resend Password".
2. Confirme. Se quiser, defina uma senha nova antes de confirmar. O funcionário receberá a nova senha.

### Como criar ou editar um cargo

1. Na aba "Offices", clique em "New Office".
2. Informe o nome do cargo ("Position Name") e marque as permissões em "Select Permissions". Use "Grant All Permissions" para marcar tudo.
3. Clique em "Save Position".

### Como adicionar usuários extras

1. Na aba "Active Employees", clique em "Add Extra Users".
2. Escolha a quantidade. Confira o "Monthly total".
3. Clique em "Confirm". A cobrança entra na próxima fatura.

### Como reduzir usuários extras

1. Na aba "Extra Employees", clique em "Reduce Extras".
2. Escolha quantos extras quer remover. Se passar das vagas não utilizadas, selecione os usuários que serão desativados.
3. Confirme.

## Relação com outros módulos

- **Time Cards** (Cartões de ponto): a política de intervalo de cada usuário é descontada dos cartões de ponto concluídos, no modo automático.
- **Projects e Activities**: a visibilidade de projetos (todos ou só atribuídos) define quais projetos o funcionário pode ver.
- **Work Orders** (Ordens de serviço): funcionários podem ser responsáveis por uma ordem de serviço e assinam por meio do próprio acesso.
- **Subcontractors**: o acesso de representantes de subcontratados é gerenciado na tela de Subcontratados, não aqui.
- **Estimates e Invoices**: as permissões de edição de orçamentos e faturas ficam no cadastro do usuário ("Estimate Access" e "Invoice Access").
- **Subscription / Plano**: o número de vagas, os usuários extras e a cobrança dependem do plano contratado.

## Dúvidas frequentes

**P:** Por que não consigo criar mais usuários?
**R:** A empresa atingiu o limite de funcionários ativos do plano, incluindo os extras. Desative um usuário que não esteja mais em uso ou adicione usuários extras.

**P:** Desativar um usuário apaga o histórico dele?
**R:** Não. Ele fica como "Inactive", e o histórico e os registros são mantidos. Só é possível excluir de forma definitiva, e essa ação não pode ser desfeita.

**P:** Por que não aparece o botão "Delete User" para um dos usuários?
**R:** Usuários com cargo de administrador não podem ser excluídos.

**P:** O que acontece se eu alterar as permissões de um cargo?
**R:** A mudança vale para todos os usuários que têm esse cargo.

**P:** Posso excluir um cargo que tenha funcionários?
**R:** Não. Primeiro transfira os funcionários para outro cargo. Os cargos de sistema também não podem ser excluídos.

**P:** Qual é a diferença entre "All Active Projects" e "Only Assigned Projects"?
**R:** No primeiro, o funcionário enxerga todos os projetos ativos da empresa. No segundo, enxerga apenas os projetos em que foi incluído.

**P:** Como o funcionário recebe a senha?
**R:** Se você escolheu senha automática, o sistema gera uma senha e a envia por e-mail. Se escolheu senha manual, você mesmo a informa ao funcionário.

**P:** O funcionário esqueceu a senha. O que faço?
**R:** Abra o usuário e clique em "Resend Password".

**P:** Quando a cobrança dos usuários extras aparece?
**R:** Na próxima fatura. A tela mostra o total mensal antes de você confirmar a compra.

**P:** Preciso desativar alguém para reduzir os usuários extras?
**R:** Só se você quiser remover mais extras do que as vagas não utilizadas. Nesse caso, a tela pede que você escolha os usuários que serão desativados.

**P:** Quem pode gerenciar as permissões de acesso?
**R:** Quem tem a permissão "User Management".
