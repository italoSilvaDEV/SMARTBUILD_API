import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { HelpSkill, HelpTool } from "../types";

/**
 * Contagens e listas de projetos e estimates com filtro exato de status.
 *
 * Substituem list_projects e estimate_summary do IA Assistant antigo:
 * lá o filtro "In Progress" virava "todos os ativos" (e "Pre-Start" com
 * hífen não batia), a lista sem filtro contava só ativos e o resumo de
 * estimates considerava só projetos ativos e no máximo 30 registros.
 */

const ACTIVE_STATUSES = ["Pre-Start", "In Progress", "Final walkthrough"];
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (value: number) => USD.format(Math.round(value * 100) / 100);
const money = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

/** Casa o status pedido com os valores reais do banco, ignorando caixa, espaço e hífen. */
function normalizeStatus(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

async function resolveProjectStatuses(companyId: string, requested: unknown): Promise<string[] | null> {
  const list = (Array.isArray(requested) ? requested : requested ? [requested] : []).map(String).filter(Boolean);
  if (!list.length) return null;
  if (list.some((status) => normalizeStatus(status) === "active")) return ACTIVE_STATUSES;

  const existing = await prisma.project.findMany({
    where: { company_id: companyId },
    distinct: ["status_project"],
    select: { status_project: true },
  });
  const wanted = new Set(list.map(normalizeStatus));
  return existing.map((row) => row.status_project).filter((status) => wanted.has(normalizeStatus(status)));
}

const tools: HelpTool[] = [
  {
    name: "project_status_summary",
    description:
      "Contagem exata de projetos da empresa: total geral, total de ativos e quantidade por status (Pre-Start, In Progress, Final walkthrough, Finished, Pending, Accepted, Canceled...). Use para qualquer pergunta de 'quantos projetos'.",
    readOnly: true,
    requiredPermissions: ["Projects"],
    requiresFullProjectAccess: true,
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
      const rows = await prisma.project.groupBy({
        by: ["status_project"],
        where: { company_id: ctx.companyId! },
        _count: { _all: true },
      });
      const byStatus = Object.fromEntries(rows.map((row) => [row.status_project, row._count._all]));
      return {
        totalProjects: rows.reduce((acc, row) => acc + row._count._all, 0),
        activeProjects: rows.filter((row) => ACTIVE_STATUSES.includes(row.status_project)).reduce((acc, row) => acc + row._count._all, 0),
        activeRule: "ativos = Pre-Start, In Progress e Final walkthrough",
        byStatus,
      };
    },
  },
  {
    name: "list_projects",
    description:
      "Busca projetos por endereço, nome do cliente ou número do contrato, com filtro exato de status. Sem status, retorna projetos de todos os status. Retorna o total encontrado e os itens (com projectId para links).",
    readOnly: true,
    requiredPermissions: ["Projects"],
    requiresFullProjectAccess: true,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        status: { type: "array", items: { type: "string" }, description: 'Ex.: ["In Progress"] ou ["active"] para os três ativos.' },
        limit: { type: "number", description: "Padrão 20, máx. 100. O total sempre considera todos." },
      },
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const statuses = await resolveProjectStatuses(ctx.companyId!, args.status);
      const search = typeof args.search === "string" ? args.search.trim() : "";
      const contract = Number(search);
      const where: Prisma.ProjectWhereInput = {
        company_id: ctx.companyId!,
        ...(statuses ? { status_project: { in: statuses } } : {}),
        ...(search
          ? {
              OR: [
                { location: { contains: search } },
                { client: { name: { contains: search } } },
                ...(Number.isInteger(contract) ? [{ contract_number: contract }] : []),
              ],
            }
          : {}),
      };
      const [total, projects] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({
          where,
          take: limit,
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            contract_number: true,
            location: true,
            status_project: true,
            price: true,
            date_creation: true,
            client: { select: { id: true, name: true } },
          },
        }),
      ]);
      return {
        total,
        listed: projects.length,
        statusFilter: statuses ?? "todos",
        items: projects.map((project) => ({
          projectId: project.id,
          address: project.location,
          client: project.client?.name ?? null,
          clientId: project.client?.id ?? null,
          status: project.status_project,
          contractNumber: project.contract_number,
          priceUsd: usd(money(project.price)),
          createdAt: project.date_creation,
        })),
      };
    },
  },
  {
    name: "list_clients",
    description:
      "Clientes da empresa: total real de clientes cadastrados (ou que batem com a busca) e a lista dos mais recentes, com quantidade de projetos de cada um. Busca por nome, e-mail ou telefone.",
    readOnly: true,
    requiredPermissions: ["Clients"],
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number", description: "Quantos listar (padrão 15, máx. 100). O total sempre considera todos." },
      },
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 100);
      const search = typeof args.search === "string" ? args.search.trim() : "";
      const where: Prisma.ClientWhereInput = {
        company_id: ctx.companyId!,
        ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }] } : {}),
      };
      const [total, clients] = await Promise.all([
        prisma.client.count({ where }),
        prisma.client.findMany({
          where,
          take: limit,
          orderBy: { date_creation: "desc" },
          select: { id: true, name: true, email: true, phone: true, city_and_state: true, _count: { select: { projects: true } } },
        }),
      ]);
      return {
        totalClients: total,
        listed: clients.length,
        items: clients.map((client) => ({
          clientId: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          cityAndState: client.city_and_state,
          projectCount: client._count.projects,
        })),
      };
    },
  },
  {
    name: "estimate_summary",
    description:
      "Estimates (orçamentos) da empresa: contagem exata e valor total por status (pending, approved, rejected, canceled), opcionalmente por período de criação, e os mais recentes.",
    readOnly: true,
    requiredPermissions: ["Estimates"],
    parameters: {
      type: "object",
      properties: {
        status: { type: "array", items: { type: "string" }, description: "pending, approved, rejected ou canceled" },
        startDate: { type: "string", description: "YYYY-MM-DD (data de criação)" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "number", description: "Quantos recentes listar (padrão 10, máx. 30)." },
      },
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      const statuses = (Array.isArray(args.status) ? args.status : []).map((status) => String(status).toLowerCase()).filter(Boolean);
      const start = typeof args.startDate === "string" ? new Date(args.startDate) : null;
      const end = typeof args.endDate === "string" ? new Date(`${args.endDate}T23:59:59.999`) : null;
      const where: Prisma.EstimateWhereInput = {
        project: { company_id: ctx.companyId! },
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(start || end
          ? { date_creation: { ...(start && !Number.isNaN(start.getTime()) ? { gte: start } : {}), ...(end && !Number.isNaN(end.getTime()) ? { lte: end } : {}) } }
          : {}),
      };
      const [groups, recent] = await Promise.all([
        prisma.estimate.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { totalAmount: true } }),
        prisma.estimate.findMany({
          where,
          take: limit,
          orderBy: { date_creation: "desc" },
          select: {
            number: true,
            status: true,
            totalAmount: true,
            date_creation: true,
            project: { select: { id: true, location: true, client: { select: { name: true } } } },
          },
        }),
      ]);
      return {
        totalEstimates: groups.reduce((acc, group) => acc + group._count._all, 0),
        byStatus: Object.fromEntries(
          groups.map((group) => [group.status, { count: group._count._all, totalUsd: usd(money(group._sum.totalAmount)) }])
        ),
        recent: recent.map((estimate) => ({
          number: estimate.number,
          status: estimate.status,
          totalUsd: usd(money(estimate.totalAmount)),
          createdAt: estimate.date_creation,
          projectId: estimate.project.id,
          projectAddress: estimate.project.location,
          client: estimate.project.client?.name ?? null,
        })),
      };
    },
  },
];

export const projectsAndEstimatesSkill: HelpSkill = {
  id: "projects-and-estimates",
  description: "Contagens e buscas exatas de projetos e estimates da empresa.",
  instructions: `
- Para "quantos projetos", use project_status_summary e diferencie o total geral dos ativos (ex.: "440 projetos, 73 ativos").
- Para buscar projetos específicos, use list_projects; o campo total é a contagem real.
- Para "quantos clientes" ou buscar clientes, use list_clients (totalClients é a contagem real).
- Para estimates, use estimate_summary; status na tela: pending → Pending, approved → Approved, rejected → Rejected, canceled → Canceled.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools,
};
