---
title: Break Policies (Políticas de intervalo)
module: operations
routes: [/stripe-config]
---

# Break Policies (Políticas de intervalo)

## Para que serve

As políticas de intervalo definem quanto tempo de pausa é descontado automaticamente das horas trabalhadas de cada funcionário. Em vez de o funcionário registrar cada pausa, você cria uma regra, por exemplo "após 4 horas, descontar 30 minutos", e atribui essa regra aos funcionários.

Além das políticas, a tela tem a configuração de "Paid short gap" (em português: "Intervalo curto remunerado"), que decide se pausas curtas entre registros de ponto contam como tempo pago.

As regras definidas aqui alimentam as horas e o valor mostrados em "Time Cards" (Cartões de ponto).

## Onde encontrar

- Abra a tela de configurações da empresa (item de configurações no menu, com acesso pela permissão **"Settings"**).
- Dentro dela, abra a aba **"Company"** (em português: "Empresa"). A seção "Break policies" (em português: "Políticas de intervalo") fica nessa aba.
- Quem vê: usuários com a permissão "Settings".
- Quem altera: criar, editar, arquivar, restaurar, definir ou remover o padrão da empresa e atribuir políticas exige ser **proprietário ("Owner") ou administrador ("Administrator")** da empresa. Para os demais, o sistema recusa a alteração com a mensagem de acesso de administrador.
- A atribuição de uma política a um funcionário é feita no cadastro dele (veja "Relação com outros módulos").

## O que aparece na tela

- Título "Break policies" (em português: "Políticas de intervalo"), com a descrição "Create reusable automatic deduction rules and assign one policy per employee." (em português: "Crie regras reutilizáveis de desconto automático e vincule uma política por funcionário.").
- Seção **"General break settings"** (em português: "Configurações gerais de intervalo"):
  - "Paid short gap" (em português: "Intervalo curto remunerado"): "Keep gaps of up to 20 minutes between time entries as paid time." (em português: "Mantenha como tempo remunerado os intervalos de até 20 minutos entre registros de ponto.").
  - Selo "Company-wide setting" (em português: "Configuração geral da empresa"). A configuração vale para todos os funcionários atuais e para os novos.
  - Botão "Save" (em português: "Salvar") para gravar essa configuração.
- Seção **"Automatic deduction policies"** (em português: "Políticas de desconto automático"), com o botão "New policy" (em português: "Nova política").
  - Abas "Active" (em português: "Ativas") e "Archived" (em português: "Arquivadas"), com a contagem de cada uma.
  - Cada política aparece como um cartão com o nome, o selo "Company default" (em português: "Padrão da empresa") quando for o padrão, a contagem "N assigned employees" (em português: "N funcionários vinculados") e os botões "Make default" (em português: "Definir padrão") ou "Remove default" (em português: "Remover padrão"), além de "Edit" (em português: "Editar") e "Archive" (em português: "Arquivar"). Políticas arquivadas mostram "Restore" (em português: "Restaurar").
- Janela de criação e edição: "Create break policy" (em português: "Criar política de intervalo") ou "Edit break policy" (em português: "Editar política de intervalo"), com os campos:
  - "Policy name" (em português: "Nome da política"), com o exemplo "Example: Field team lunch" (em português: "Ex.: Equipe de campo").
  - "Apply deductions on" (em português: "Aplicar desconto em"), com os dias da semana "Mon" a "Sun" (em português: "Seg" a "Dom").
  - "Deduction rules" (em português: "Regras de desconto"), com as linhas "After hours worked" (em português: "Após horas trabalhadas") e "Deduct minutes" (em português: "Descontar minutos"), o botão "Add rule" (em português: "Adicionar regra") e a remoção de cada linha.
  - "Current result" (em português: "Total") mostrando, para cada limite, o total acumulado de desconto.
  - "Use as company default" (em português: "Usar como padrão da empresa"), com o texto "New employees will receive this policy. Existing employees stay unchanged." (em português: "Novos funcionários receberão esta política. Os atuais não mudam.").
- Janela "Set company default" (em português: "Definir padrão da empresa"), com "Effective from" (em português: "Vigência a partir de") e a opção "Apply to all existing employees" (em português: "Aplicar a todos os funcionários atuais"). O botão de confirmação é "Set default" (em português: "Definir padrão").
- Janela "Remove company default?" (em português: "Remover o padrão da empresa?"), com o botão "Remove default" (em português: "Remover padrão").

## Como fazer

### Como criar uma política de intervalo

1. Clique em "New policy" (em português: "Nova política").
2. Dê um nome à política em "Policy name".
3. Marque os dias da semana em que o desconto vale em "Apply deductions on". Pelo menos um dia precisa estar marcado.
4. Em "Deduction rules", preencha cada regra: a partir de quantas horas trabalhadas ("After hours worked") e quantos minutos descontar ("Deduct minutes"). Clique em "Add rule" para acrescentar outra regra. Por exemplo: após 4 horas, descontar 30 minutos; após 6 horas, descontar mais 30 minutos.
5. Confira o "Current result" para ver o total acumulado em cada limite.
6. Se quiser que a política seja a padrão para novos funcionários, marque "Use as company default".
7. Clique em "Save" (em português: "Salvar"). O sistema informa "Break policy saved." (em português: "Política de intervalo salva.").

### Como definir a política padrão da empresa

1. No cartão da política, clique em "Make default" (em português: "Definir padrão").
2. Escolha a data de "Effective from" (em português: "Vigência a partir de"). Não é possível escolher uma data passada.
3. Marque "Apply to all existing employees" se quiser que os funcionários atuais também passem a usar a política a partir dessa data.
4. Clique em "Set default" (em português: "Definir padrão").

Se marcou a opção de aplicar aos atuais, o sistema informa quantos funcionários foram afetados. Caso contrário, informa que a política vale apenas para os novos funcionários e que os vínculos existentes foram preservados.

### Como remover o padrão da empresa

1. No cartão da política padrão, clique em "Remove default" (em português: "Remover padrão").
2. Confirme em "Remove default". Os novos funcionários deixam de receber essa política automaticamente. Os funcionários já vinculados continuam com a política deles.

### Como editar uma política

1. Clique no ícone de edição do cartão ("Edit").
2. Altere o nome, os dias ou as regras e clique em "Save".

Políticas arquivadas não podem ser editadas. Para alterá-las, restaure a política primeiro.

### Como arquivar e restaurar uma política

1. Para arquivar, clique no ícone "Archive" (em português: "Arquivar") do cartão. A política sai da aba "Active" e vai para "Archived".
2. Para restaurar, abra a aba "Archived" e clique em "Restore" (em português: "Restaurar").

A política padrão não pode ser arquivada. Antes, defina outra política como padrão. Ao arquivar, os vínculos existentes são preservados.

### Como ativar ou desativar o intervalo curto remunerado

1. Na seção "General break settings", ative ou desative "Paid short gap".
2. Clique em "Save". O sistema informa "Paid short gap setting saved." (em português: "Configuração de intervalo curto remunerado salva.").

### Como atribuir uma política a um funcionário

1. Abra o cadastro do funcionário (novo ou existente) na tela de gerenciamento de usuários.
2. No campo "Break policy" (em português: "Política de intervalo"), escolha uma das opções:
   - "Current individual rule (after 4 hours)" (em português: "Regra individual atual (após 4 horas)"): mantém a regra individual do funcionário, que desconta o valor de "Break (minutes)" (em português: "Intervalo (minutos)") depois de 4 horas trabalhadas.
   - "Company default" (em português: "Padrão da empresa"): usa a política padrão da empresa, com os dias e limites dela.
   - Uma política específica, da lista de políticas ativas.
3. Salve o cadastro.

Para quem registra as pausas manualmente, escolha "Break Mode" (em português: "Modo de intervalo") como "Manual Break" (em português: "Intervalo manual"). Nesse caso, o funcionário inicia e encerra as pausas pelo aplicativo, e o desconto segue as regras do modo manual (veja abaixo).

## Status e ciclo de vida

- **Ativa:** aparece na aba "Active" e pode ser atribuída a funcionários e definida como padrão.
- **Arquivada:** aparece na aba "Archived". Não pode ser editada nem atribuída a novos funcionários. Quem já tinha a política continua com ela até que seja trocada.
- **Padrão da empresa:** uma única política por vez. Novos funcionários recebem a política padrão automaticamente.

Cada funcionário tem um histórico de políticas, com a data em que cada uma começou a valer. Quando uma política muda, a nova vale a partir da data de vigência, e o registro anterior fica guardado. Mudanças nunca alteram cartões de ponto de datas anteriores.

## Regras de negócio

### Regras de uma política

- Uma política tem de 1 a 12 regras.
- Cada regra tem um limite de horas trabalhadas, de 1 minuto a 24 horas, e um desconto, de 1 minuto a 12 horas.
- Os limites não podem se repetir dentro da mesma política.
- A soma de todos os descontos da política não pode passar de 24 horas.
- O nome da política tem no máximo 120 caracteres.
- É preciso marcar pelo menos um dia da semana.

### Como o desconto é aplicado

- O desconto é **cumulativo**: quando o funcionário atinge mais de um limite no mesmo dia, cada desconto atingido é somado aos anteriores. Exemplo: com as regras "após 4 horas, 30 minutos" e "após 6 horas, mais 30 minutos", um dia de 6 horas ou mais tem 60 minutos de desconto.
- O desconto só vale nos dias da semana marcados na política. Em um dia não marcado, o desconto é zero.
- O desconto nunca passa do tempo trabalhado no dia.
- Se o funcionário não tiver uma política atribuída, o sistema usa a regra individual dele: quando trabalha 4 horas ou mais, desconta o valor de "Break (minutes)".

### Modo manual (pausas registradas pelo funcionário)

- Cada pausa registrada no aplicativo é contada separadamente.
- As duas primeiras pausas de menos de 15 minutos em um mesmo dia não são descontadas.
- Pausas de 15 minutos ou mais, e pausas além das duas primeiras, são descontadas pelo tempo total.

### Intervalo curto remunerado

- Se houver um intervalo de até 20 minutos entre o fim de um registro de ponto e o início do seguinte, no mesmo dia, esse tempo é contado como horas pagas.
- A configuração vale para toda a empresa. Ela pode ser desligada para um funcionário específico, pelas configurações individuais dele.

### Vigência e histórico

- A data de vigência não pode ser uma data passada.
- Mudanças só valem a partir da data de vigência e nunca reescrevem cartões de ponto anteriores.
- Ao remover o padrão, os funcionários já vinculados continuam com a política deles.

## Relação com outros módulos

- **Time Cards (Cartões de ponto):** as horas e a coluna "Break" (em português: "Pausa") dos cartões de ponto vêm desta regra. O valor a pagar também depende das horas líquidas depois do desconto.
- **User Management (Gerenciamento de usuários):** é onde se atribui a política a cada funcionário, define-se o "Break Mode" (automático ou manual) e os minutos de intervalo individuais.
- **Activities e Job Dispatch (Atividades e Despacho):** mostram quem está trabalhando; o desconto de pausa só aparece nos cartões de ponto.

## Dúvidas frequentes

**P:** Preciso registrar a pausa de almoço do funcionário?
**R:** Não, se ele estiver no modo automático. O desconto é feito pela política atribuída a ele. No modo manual, o funcionário registra as pausas pelo aplicativo.

**P:** Quantas regras posso criar em uma política?
**R:** Até 12 regras por política, sem limites repetidos.

**P:** Por que a pausa não foi descontada em um dia?
**R:** Provavelmente o dia não está marcado em "Apply deductions on", ou o funcionário não atingiu o primeiro limite de horas trabalhadas.

**P:** Ao mudar a política, os cartões antigos mudam?
**R:** Não. A mudança vale a partir da data de vigência, e os cartões anteriores permanecem como estavam.

**P:** Posso arquivar a política padrão?
**R:** Não. Primeiro defina outra política como padrão. Depois você pode arquivar a antiga.

**P:** O que acontece com os funcionários quando arquivo uma política?
**R:** Os vínculos existentes são preservados. Quem já tinha a política continua com ela, mas ela não pode ser atribuída a novos funcionários enquanto estiver arquivada.

**P:** Por que não consigo criar ou editar políticas?
**R:** Essas ações são exclusivas de proprietários e administradores da empresa.

**P:** Um intervalo de 10 minutos conta como pago?
**R:** Se a configuração "Paid short gap" estiver ativa e o intervalo ficar entre dois registros de ponto do mesmo dia, de até 20 minutos, sim. No modo manual, pausas de menos de 15 minutos também podem ficar sem desconto, até duas por dia.
