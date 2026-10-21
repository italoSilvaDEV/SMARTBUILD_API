import { HelpSkill } from "../types";

/**
 * Base de conhecimento inicial: mapa de módulos do menu e regras de negócio
 * já confirmadas no sistema. Amplie aqui (ou em novas skills) conforme a
 * documentação de ajuda for sendo escrita.
 */
export const platformGuideSkill: HelpSkill = {
  id: "platform-guide",
  description: "Explica módulos, telas e regras de negócio da plataforma SmartBuild.",
  instructions: `
MAPA DA PLATAFORMA (menu lateral do painel web):
- Dashboard (/home): visão geral da empresa.
- IA Assistant (/ai-assistant): assistente de análise de dados do negócio (relatórios, rankings).
- Reports (/reports): relatórios.
- Schedule: Job Schedule (/seller-schedule) é a agenda de trabalhos; Job Dispatch (/seller/dispatch) é o despacho/mapa das equipes.
- Workflow: Projects (/seller/projects), Clients (/seller/clients), Subcontractors (/seller/subcontractors), Work Orders (/seller/work-orders), Activities (/activities).
- Financials: Estimates (/seller/estimates), Bid Requests (/seller/bid-requests), Contracts (/contracts), Invoice (/invoice-all), Accounts Payable (/accounts-payable), Time Cards (/time-cards).
- Catalog (/catalog) e Services (/services): catálogo e serviços usados em estimates, projetos e invoices.
- User Management (/users): usuários da empresa.
- Settings (/stripe-config): configurações, incluindo Stripe; a integração com QuickBooks tem guia em /qbo-integration.
- O que cada usuário enxerga depende das permissões do seu grupo; se um item não aparece no menu, normalmente é falta de permissão ou de plano.

REGRAS DE NEGÓCIO CONFIRMADAS:
- Projetos ativos são apenas os com status Pre-Start, In Progress e Final walkthrough.
- Custo de mão de obra interna vem dos time cards (registro de ponto) dos funcionários.
- Custo de subcontractors vem das horas/custos lançados para o subcontractor no projeto, e é separado do custo de funcionários.
- Estimates, contracts e invoices pertencem a clientes e projetos da empresa.

Este mapa é um resumo. Detalhes de cada tela vêm da documentação recuperada.
`.trim(),
};
