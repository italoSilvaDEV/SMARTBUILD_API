---
title: Por onde começar na plataforma (guia de início e pré-requisitos)
module: general
routes: [/home, /seller/clients, /catalog, /services, /seller/estimates, /seller/projects, /invoice-all, /users, /stripe-config]
---

# Por onde começar na plataforma

## Para que serve

Este guia ajuda o usuário que não sabe por onde começar. A melhor porta de entrada depende do que a pessoa quer resolver e de como ela trabalha hoje. Não existe um único começo certo: não recomende sempre "Estimates". Entenda o objetivo, escolha o ponto de partida que mais destrava esse objetivo e indique apenas o próximo passo.

## Antes de tudo (vale para todos)

- Cada tela depende da permissão do módulo, que vem do plano da empresa e do perfil do usuário. Se algo não aparece no menu, veja "Por que um item do menu não aparece" na visão geral da plataforma.
- Depois do primeiro login, o sistema exige a configuração inicial da empresa (telefone, e-mail, endereço e os dois textos usados nos contratos).
- Os dados completos da empresa (nome, endereço, e-mail, telefone, localização e raio de atuação) são exigidos para salvar orçamento e criar projeto.
- A equipe usa perfis (cargos) para definir permissões. Os cargos precisam existir antes dos usuários, e o número de usuários é limitado pelo plano.

## Como escolher o ponto de partida pelo objetivo

**"Quero organizar meus clientes e propostas" (começo comercial)**
1. Comece por **Workflow > Clients**: o cliente é a base de orçamento, projeto, fatura e contrato. Precisa de e-mail válido e ao menos um contexto de trabalho.
2. Próximo passo: cadastre os serviços que você vende em **Management > Catalog / Services**, para reaproveitar nos orçamentos. O catálogo não é obrigatório, mas deixa o orçamento manual mais rápido e serve de base de preços para a IA.
3. Depois: **Financials > Estimates** para o primeiro orçamento (exige cliente, local marcado no mapa e pelo menos um serviço).

**"Quero acompanhar obras e equipe" (começo operacional)**
1. Comece por **Workflow > Clients** e depois **Workflow > Projects**: o projeto exige cliente, localização e pelo menos um serviço, e é nele que ficam serviços, agenda, relatórios e ordens de serviço.
2. Próximo passo: **Schedule > Job Schedule** para datar os serviços (projeto com serviço, data de início e prazo).
3. Depois: **Schedule > Job Dispatch** para acompanhar a equipe no dia a dia. Ele depende das datas definidas na agenda e de funcionários usando o aplicativo para mostrar "On Site" e "Off Site".

**"Quero cobrar mais rápido e receber online" (começo financeiro)**
1. Comece em **Management > Settings**: pagamento online exige o Stripe conectado, e faturas do tipo QuickBooks exigem o QuickBooks conectado. Faturas do tipo "Other" não exigem integração, mas só aceitam um pagamento, sempre pelo total.
2. Próximo passo: cadastre o cliente em **Workflow > Clients** (e-mail válido).
3. Depois: **Financials > Invoice**, com pelo menos um serviço e data de vencimento.

**"Quero controlar as horas dos funcionários"**
1. Comece em **Management > User Management**: cadastre os cargos e os funcionários com valor por hora ou por dia e horário de expediente.
2. Próximo passo: configure a política de pausas em **Management > Settings** (só Owner ou Administrator criam) e atribua a cada funcionário.
3. Depois: acompanhe em **Financials > Time Cards**. Os registros de ponto vêm do aplicativo do funcionário.

**"Quero trabalhar com subcontratados"**
1. Comece em **Workflow > Subcontractors**: cadastro com nome e e-mail.
2. Próximo passo: **Financials > Bid Requests** para pedir propostas de um projeto (os serviços são copiados do projeto) e aprovar uma, o que cria a ordem de serviço.
3. Depois: **Workflow > Work Orders** para ordens diretas, com responsável, datas e itens.

**"Quero enviar contratos para assinar"**
1. Comece em **Workflow > Clients** e depois **Financials > Contracts**: aceita PDF, precisa de campos de assinatura da empresa e do cliente. O texto de apresentação e os termos vêm de **Management > Settings** (Policies & Terms).
2. O contrato é independente das faturas e dos orçamentos.

**"Quero ver como está meu negócio"**
- **Platform > Dashboard** e **Platform > Reports** mostram os números e o feed das obras, mas dependem de ter orçamentos, projetos e faturas cadastrados. Por isso, quem está começando do zero deve primeiro cadastrar dados.

**Se a pessoa ainda estiver confusa:** faça uma pergunta curta sobre o tipo de serviço dela e o que mais dói hoje (vender, executar, cobrar ou controlar horas) e escolha um dos caminhos acima.

## Ordem típica do fluxo completo

Clientes, Catálogo/Serviços, Orçamentos, Projetos, Contratos, Faturas, Agenda, Despacho, Cartões de ponto. Subcontratados, Bid Requests, Work Orders e Change Orders entram quando há subcontratação ou mudança de escopo. Um projeto precisa de pelo menos um orçamento pendente ou aprovado para ter Change Orders. Contas a pagar (só Owner, Administrator e Master) é independente dos demais módulos.

## Pré-requisitos por módulo

- **Clientes:** e-mail válido e ao menos um contexto de trabalho. Antes de orçamento, projeto, fatura e contrato.
- **Catálogo e Serviços:** cadastrados antes do orçamento manual, pois os serviços escolhidos vêm do catálogo.
- **Orçamentos:** cliente, local marcado no mapa, pelo menos um serviço e e-mail do cliente para o envio. Para converter em projeto, o orçamento precisa estar pendente.
- **Projetos:** cliente, localização e pelo menos um serviço. Os serviços do projeto alimentam agenda, solicitações de proposta e ordens de alteração.
- **Contratos:** cliente, pelo menos um PDF e campos de assinatura.
- **Faturas:** cliente com e-mail válido, pelo menos um serviço e data de vencimento. Tipo Stripe exige Stripe conectada; tipo QuickBooks exige QuickBooks conectado.
- **Agenda:** projeto com serviço, data de início e prazo; e-mail do destinatário para enviar.
- **Despacho:** datas da agenda e projeto com localização; funcionários com o aplicativo para o status no local.
- **Cartões de ponto:** funcionário com valor por hora ou dia e horário de expediente, política de pausa atribuída e, se houver hora extra, "Over Time" ligado.
- **Subcontratados e Bid Requests:** subcontratado cadastrado e projeto com serviços. Aprovar uma proposta cria a ordem de serviço.
- **Work Orders:** projeto, responsável, título, datas e pelo menos um item.
- **Settings:** a aba "Email Reminders" exige a permissão própria.

## Dúvidas frequentes

**P:** Por onde eu começo?
**R:** Depende do que você quer resolver. Para vender, comece por Clients e Catalog. Para executar obras, por Clients e Projects. Para cobrar, por Settings (Stripe) e Invoice. Para horas de equipe, por User Management e Time Cards.

**P:** Preciso configurar o Stripe ou o QuickBooks para começar?
**R:** Só se for cobrar online (Stripe) ou trabalhar com faturas do QuickBooks. Orçamentos, projetos, agenda e faturas do tipo "Other" funcionam sem integração.

**P:** Preciso cadastrar o catálogo antes do primeiro orçamento?
**R:** Não é obrigatório, mas para o orçamento manual os serviços escolhidos vêm do catálogo, então cadastrar antes economiza tempo.
