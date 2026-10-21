---
title: Visão geral da plataforma SmartBuild
module: general
routes: [/home, /reports, /chat, /ai-assistant, /login, /company-selection, /subscription-plans, /subscription-expired]
---

# Visão geral da plataforma SmartBuild

## Para que serve

O SmartBuild é um sistema web para empresas de construção (contractors). Ele reúne, em um só lugar, o dia a dia do negócio:

- cadastro de clientes e de subcontratados;
- orçamentos ("Estimates"), propostas de subcontratados ("Bid Requests") e contratos;
- projetos, com serviços, agenda de trabalhos e despacho de equipe;
- registro de horas dos funcionários em campo ("Time Cards") e atividades;
- faturas, pagamentos online e contas a pagar;
- relatórios, feed de publicações das obras, chat interno e um assistente de IA para consultar os dados da empresa.

Cada empresa tem uma assinatura (plano). O plano define quais áreas do sistema estão liberadas para a empresa, e o perfil de cada usuário define o que ele pode fazer dentro dessas áreas.

## Onde encontrar

- **Menu lateral (esquerda):** a lista principal de telas, agrupada em "Platform", "Workflow", "Financials" e "Management". Em telas pequenas, o menu abre pelo botão de menu no topo. O menu pode ser recolhido (mostra só os ícones).
- **Barra superior:** trilha de navegação (breadcrumb), ícone de chat com contador de mensagens não lidas (aparece só com a permissão "Chat") e sino de notificações (aparece só com a permissão "Notifications").
- **Menu do usuário (rodapé do menu lateral, no nome e foto):** "Account", "Management", "Settings", "Switch Company" (só aparece quando o usuário tem acesso a mais de uma empresa), "Languages" e "Log out".

Observação: os itens "Management" e "Settings" do menu do usuário aparecem na lista, mas não executam nenhuma ação no código atual.

## Perfis de usuário

Cada usuário pertence a uma empresa e tem um perfil ("office"). Os perfis que aparecem no sistema são:

- **Owner (Proprietário):** dono da conta da empresa. Recebe todas as permissões liberadas pelo plano da empresa. É quem contrata e gerencia a assinatura. Vê o item "Accounts Payable". Pode criar grupos de chat e editar grupos existentes.
- **Administrator (Administrador):** recebe todas as permissões liberadas pelo plano, igual ao Owner. Também vê "Accounts Payable" e pode criar e editar grupos de chat.
- **Worker (Funcionário de campo):** trabalha na obra. O registro de presença (check-in e check-out) é feito pelo aplicativo móvel. Se o usuário tiver o perfil Worker na empresa escolhida, a tela "Mobile Access Required" orienta a usar o aplicativo em vez de abrir o sistema pelo navegador. Para os demais itens, o que aparece depende das permissões do perfil.
- **Seller (Vendedor) e perfis personalizados:** veem apenas o que o perfil e o plano permitirem (ver a seção "Por que um item do menu não aparece").
- **Subcontratado:** entra por um convite específico e tem acesso restrito. Há um documento próprio para esse acesso.
- **Master:** equipe interna do SmartBuild, que administra planos, campanhas, grupos de permissões e assinatura de todas as empresas. Clientes da plataforma não usam esse perfil.

## Mapa completo do menu

Regra geral de exibição:

- Um item **sem permissão exigida** aparece para todos os usuários da empresa.
- Um item **com permissão exigida** aparece só se o usuário tiver ao menos uma das permissões listadas.
- Um grupo ("Schedule", "Workflow", "Financials") some quando nenhum de seus itens está visível.
- Um item pode ter regra por perfil em vez de permissão (caso de "Accounts Payable").

Os nomes abaixo são os da interface em inglês, com o equivalente em português entre parênteses (rótulos do idioma português).

**Grupo "Platform" (Plataforma)**

| Item no menu | Permissão exigida | Quem vê |
|---|---|---|
| "Dashboard" (Painel) | "Dashboard" ou "Dashboard Simple" | Quem tem uma das duas. Veja o documento de Dashboard. |
| "Tutorial (Coming Soon)" | "Tutorial" | Aparece desabilitado (em breve). Não funciona nesta versão. |
| "IA Assistant (Beta)" (Assistente de IA, Beta) | nenhuma | Todos os usuários. |
| "Reports" (Relatórios) | "Reports" | Quem tem a permissão. |

**Grupo "Schedule" (Agenda)**

| Item no menu | Permissão exigida | Quem vê |
|---|---|---|
| "Job Schedule" (Agenda de trabalhos) | "Job Schedule" | Quem tem a permissão. |
| "Job Dispatch" (Despacho de trabalhos) | "Job Dispatch" | Quem tem a permissão. |

**Grupo "Workflow" (Fluxo de trabalho)**

| Item no menu | Permissão exigida | Quem vê |
|---|---|---|
| "Projects" (Projetos) | "Projects" | Quem tem a permissão. |
| "Clients" (Clientes) | "Clients" | Quem tem a permissão. |
| "Subcontractors" (Subcontratados) | "Subcontractors" | Quem tem a permissão. |
| "Work Orders" (Ordens de serviço) | nenhuma | Todos os usuários. |
| "Activities" (Atividades) | "Activities" | Quem tem a permissão. |

**Grupo "Financials" (Financeiro)**

| Item no menu | Permissão exigida | Quem vê |
|---|---|---|
| "Estimates" (Orçamentos) | "Estimates" | Quem tem a permissão. |
| "Bid Requests" (Solicitações de proposta) | nenhuma | Todos os usuários. |
| "Contracts" (Contratos) | "Contracts" | Quem tem a permissão. |
| "Invoice" (Faturas) | "Invoice" | Quem tem a permissão. |
| "Accounts Payable" (Contas a pagar) | nenhuma; regra por perfil | Somente Owner, Administrator e Master. |
| "Time Cards" (Cartões de ponto) | "Time Cards" | Quem tem a permissão. |

**Grupo "Management" (Gerenciamento)**

| Item no menu | Permissão exigida | Quem vê |
|---|---|---|
| "Catalog" (Catálogo) | "Catalog" | Quem tem a permissão. |
| "Services" (Serviços) | "Services" | Quem tem a permissão. |
| "User Management" (Gerenciamento de usuários) | "User Management" | Quem tem a permissão. |
| "Settings" (Configurações) | "Settings" | Quem tem a permissão. A tela reúne a configuração de pagamentos online (Stripe) e o guia de integração com o QuickBooks. |

Telas que existem fora do menu e são acessadas por links de outras telas: chat interno (ícone da barra superior, permissão "Chat"), notificações, páginas públicas que o cliente abre por link (orçamento, contrato, ordem de serviço, fatura e pagamento) e o aplicativo do funcionário.

## Por que um item do menu não aparece

A permissão de cada usuário sai da combinação de três coisas:

1. **Plano da empresa.** Cada plano tem um grupo de permissões. As permissões desse grupo são as que a empresa pode usar. Se o plano não inclui a área, nenhum usuário da empresa a verá.
2. **Perfil do usuário.**
   - Owner e Administrator recebem todas as permissões do plano.
   - Os demais perfis (Worker, Seller e personalizados) podem ter uma lista própria de permissões. Quando a lista existe, o usuário fica só com as permissões que estão nela **e** no plano. Quando não existe lista própria, ele recebe todas as permissões do plano.
3. **Regras específicas de item.** Hoje, a única regra desse tipo é o item "Accounts Payable", restrito a Owner, Administrator e Master.

Checklist quando "algo sumiu" do menu:

- Verifique se o plano da empresa inclui a área. Se não incluir, a equipe do SmartBuild precisa ajustar o plano.
- Verifique o perfil do usuário. Se for Worker, Seller ou perfil personalizado, a permissão pode não estar no perfil.
- Verifique se o item é "Accounts Payable". Ele só aparece para Owner, Administrator e Master.
- Se a assinatura estiver expirada ou com pagamento recusado, o sistema leva o usuário para a tela de assinatura expirada antes de mostrar o menu (ver o documento de conta, planos e acesso).

Se o usuário digitar diretamente o endereço de uma tela para a qual não tem permissão, aparece a tela "Access restricted", com a frase "You don't have permission to view this page." e o botão "Go back". Esse texto aparece só em inglês.

## Fluxo principal de ponta a ponta

Este é o caminho típico de uma obra dentro do sistema. Cada etapa tem detalhes no documento do módulo correspondente.

1. **Cliente.** O cadastro fica em "Clients" (Workflow). Os clientes também aparecem no Dashboard como "Customers" (Clientes).
2. **Orçamento.** Em "Estimates" (Financials), a empresa monta o orçamento para o cliente. O cliente recebe um link público para responder ao orçamento (aceitar ou recusar).
3. **Conversão em projeto.** Um orçamento pode ser convertido em projeto pela ação correspondente na lista de orçamentos.
4. **Contrato.** Em "Contracts" (Financials), o contrato é preparado e enviado ao cliente. O cliente assina por uma página pública.
5. **Projeto.** Em "Projects" (Workflow), o projeto tem serviços e status ("Pre-Start", "In Progress", "Final walkthrough" e "Finished"). O status é o que controla as contagens do Dashboard.
6. **Agenda e despacho.** Em "Job Schedule" e "Job Dispatch" (Schedule), a equipe é programada e despachada para os trabalhos.
7. **Campo.** O funcionário registra presença pelo aplicativo móvel. O feed de publicações da obra (fotos e textos) aparece em "Reports".
8. **Cartões de ponto.** Em "Time Cards" (Financials), as horas trabalhadas são conferidas e fechadas. Esses valores alimentam os custos de mão de obra do Dashboard.
9. **Fatura.** Em "Invoice" (Financials), a fatura é emitida para o cliente. Faturas podem ter status "paid", com vencimento, e entram nas contagens de vencidas e a vencer.
10. **Pagamento.** O cliente abre a fatura por link público e paga online, pela página de pagamento.

Contas a pagar (Owner, Administrator e Master) e a configuração de pagamentos (Settings) ficam fora do fluxo do cliente, mas afetam o caixa mostrado no Dashboard.

## Telas transversais

- **Painel (Dashboard):** resumo do negócio por período. Há uma versão completa e uma versão simples. Veja o documento "Dashboard".
- **Relatórios (Reports):** feed de publicações das obras, com filtros e compartilhamento por link. Veja o documento "Reports".
- **Chat interno:** conversas entre membros da equipe, com grupos e anexos. Veja o documento "Chat interno".
- **Assistente de IA (Beta):** perguntas em linguagem natural sobre projetos, clientes, faturas e relatórios. Veja o documento "Assistente de IA".
- **Conta, planos e acesso:** entrada no sistema, troca de empresa, idioma, planos e assinatura. Veja o documento "Conta, planos e acesso".
- **Notificações:** sino na barra superior, com aviso de novidades e atualizações de tarefas. Só aparece com a permissão "Notifications".

## Relação com outros módulos

- O menu depende das permissões que vêm do plano da empresa e do perfil do usuário.
- O Dashboard lê dados de orçamentos, projetos, faturas, clientes, funcionários e cartões de ponto.
- Relatórios lê as publicações feitas nos projetos e permite criar links públicos com vários projetos.
- O chat e as notificações avisam o usuário em tempo real quando chega mensagem nova.
- O assistente de IA responde com base nos dados já cadastrados nos módulos.

## Dúvidas frequentes

**P:** Por que eu não vejo "Projects" no menu?
**R:** Seu plano ou seu perfil não tem a permissão "Projects". Peça ao Owner ou ao Administrator da empresa para verificar seu perfil. Se o plano não inclui a área, é preciso ajustar a assinatura.

**P:** Eu sou Owner, por que vejo itens que outros usuários não veem?
**R:** Owner recebe todas as permissões liberadas pelo plano, e também vê "Accounts Payable". Os demais perfis só veem o que o perfil e o plano liberam juntos.

**P:** O que é o ícone de chat no topo?
**R:** É o acesso ao chat interno da equipe. Ele só aparece para quem tem a permissão "Chat". O número em amarelo indica mensagens não lidas.

**P:** Por que o item "Tutorial (Coming Soon)" aparece sem funcionar?
**R:** O item está marcado como "em breve". Ele aparece para quem tem a permissão "Tutorial", mas está desabilitado.

**P:** Eu acesso o sistema pelo navegador e sou Worker. Por que aparece a tela "Mobile Access Required"?
**R:** Trabalhadores de campo usam o aplicativo móvel para registrar presença e acompanhar projetos. A tela do navegador orienta a baixar o aplicativo para iOS. A versão para Android ainda não está disponível.

**P:** Eu troquei de idioma e ele voltou para inglês em outro computador. Por quê?
**R:** O idioma é salvo no navegador, não na conta. Escolha o idioma de novo no menu do usuário, em "Languages", em cada computador ou navegador que usar.

**P:** Quem pode criar um grupo de chat?
**R:** Owner e Administrator. Os demais usuários podem participar dos grupos e conversar, mas não criam nem editam grupos.

**P:** Quem administra os planos e as permissões?
**R:** A equipe do SmartBuild (perfil Master). O cliente não altera planos nem grupos de permissões pelo sistema; quando precisar mudar o plano, fale com o suporte.
