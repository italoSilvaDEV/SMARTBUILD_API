import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { projectIdFilter } from "../projectScope";
import { AUTO_REPORT_KEY, HelpReport, HelpSkill, HelpTool } from "../types";

/**
 * Gastos com material de todos os projetos (e a lista itemizada), sem precisar abrir projeto por projeto.
 * Segue a regra do sistema: valor da linha = preço x quantidade; lançamento "Credit" abate o total.
 */

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const round2 = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "");
const MAX_ROWS = 30000;

function parseDay(value: unknown, endOfDay = false): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(`${raw.slice(0, 10)}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const materialsSpending: HelpTool = {
  name: "materials_spending",
  description:
    "Gastos com MATERIAL de todos os projetos de uma vez: total gasto, total por projeto, total por material e a lista de itens (material, quantidade, valor, projeto, data). Filtros: projectId (um projeto), status (status do projeto), material (parte do nome), from/to (data do lançamento, YYYY-MM-DD). Use para 'relatório de gastos com material', 'lista de material', 'quanto gastei com X'.",
  readOnly: true,
  requiredPermissions: ["Projects", "Invoice"],
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      status: { type: "array", items: { type: "string" }, description: 'Status do projeto, ex.: ["In Progress"]. Sem status = todos os projetos.' },
      material: { type: "string" },
      from: { type: "string", description: "YYYY-MM-DD" },
      to: { type: "string", description: "YYYY-MM-DD" },
      itemLimit: { type: "number", description: "Itens listados (padrão 40, máx. 200). Os totais sempre consideram todos." },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const statuses = (Array.isArray(args.status) ? args.status : []).map(String).filter(Boolean);
    const material = text(args.material);
    const from = parseDay(args.from);
    const to = parseDay(args.to, true);
    const projectId = text(args.projectId);
    const itemLimit = Math.min(Math.max(Number(args.itemLimit) || 40, 1), 200);

    const projectWhere: Prisma.ProjectWhereInput = {
      company_id: companyId,
      ...projectIdFilter(ctx),
      ...(projectId ? { id: projectId } : {}),
      ...(statuses.length ? { status_project: { in: statuses } } : {}),
    };
    const where: Prisma.CostProjectWhereInput = {
      ServiceProject: { is: { Project: { is: projectWhere } } },
      ...(material ? { material_name: { contains: material } } : {}),
      ...(from || to ? { cost_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const rows = await prisma.costProject.findMany({
      where,
      take: MAX_ROWS,
      orderBy: [{ cost_date: "desc" }, { date_creation: "desc" }],
      select: {
        material_name: true,
        price: true,
        amout: true,
        cost_date: true,
        transaction_type: true,
        ServiceProject: { select: { name: true, Project: { select: { id: true, location: true, status_project: true, client: { select: { name: true } } } } } },
      },
    });

    const lineTotal = (row: (typeof rows)[number]) => {
      const total = Number(row.price) * Number(row.amout || 0);
      return row.transaction_type === "Credit" ? -total : total;
    };

    const byProject = new Map<string, { project: string; client: string | null; status: string; total: number; items: number }>();
    const byMaterial = new Map<string, { material: string; quantity: number; total: number; lines: number }>();
    let grand = 0;
    for (const row of rows) {
      const total = lineTotal(row);
      grand += total;
      const project = row.ServiceProject?.Project;
      if (project) {
        const entry = byProject.get(project.id) ?? { project: project.location ?? project.id, client: project.client?.name ?? null, status: project.status_project, total: 0, items: 0 };
        entry.total += total;
        entry.items += 1;
        byProject.set(project.id, entry);
      }
      const key = row.material_name.trim().toLowerCase();
      const mat = byMaterial.get(key) ?? { material: row.material_name.trim(), quantity: 0, total: 0, lines: 0 };
      mat.quantity += row.transaction_type === "Credit" ? -Number(row.amout || 0) : Number(row.amout || 0);
      mat.total += total;
      mat.lines += 1;
      byMaterial.set(key, mat);
    }

    const projects = [...byProject.values()].sort((a, b) => b.total - a.total);
    const materials = [...byMaterial.values()].sort((a, b) => b.total - a.total);
    const items = rows.slice(0, itemLimit).map((row) => ({
      date: row.cost_date ? row.cost_date.toISOString().slice(0, 10) : null,
      material: row.material_name,
      quantity: row.transaction_type === "Credit" ? -Number(row.amout || 0) : Number(row.amout || 0),
      unitPriceUsd: usd(Number(row.price)),
      totalUsd: usd(lineTotal(row)),
      type: row.transaction_type ?? null,
      project: row.ServiceProject?.Project?.location ?? null,
      service: row.ServiceProject?.name ?? null,
    }));

    if (!rows.length) return { error: "no material costs found for this filter", totalUsd: usd(0) };

    const sections: HelpReport[] = [
      {
        title: "Material Spending Summary",
        description: [from && `from ${from.toISOString().slice(0, 10)}`, to && `to ${to.toISOString().slice(0, 10)}`, statuses.length && statuses.join(", "), material && `material: ${material}`].filter(Boolean).join(" · ") || "All projects, all dates",
        metrics: [
          { label: "Total spent on materials", value: usd(round2(grand)), tone: "warning" },
          { label: "Projects", value: String(projects.length) },
          { label: "Material lines", value: String(rows.length) },
          { label: "Distinct materials", value: String(materials.length) },
        ],
        chartMode: "bar",
        chartData: projects.slice(0, 8).map((p) => ({ label: p.project.slice(0, 28), value: round2(p.total) })),
        table: {
          columns: [
            { key: "project", label: "Project" },
            { key: "client", label: "Client" },
            { key: "status", label: "Status" },
            { key: "items", label: "Lines" },
            { key: "totalUsd", label: "Material cost" },
          ],
          rows: projects.map((p) => ({ project: p.project, client: p.client, status: p.status, items: p.items, totalUsd: usd(round2(p.total)) })),
        },
      },
      {
        title: "By Material",
        table: {
          columns: [
            { key: "material", label: "Material" },
            { key: "quantity", label: "Quantity" },
            { key: "lines", label: "Lines" },
            { key: "totalUsd", label: "Total" },
          ],
          rows: materials.slice(0, 200).map((m) => ({ material: m.material, quantity: m.quantity, lines: m.lines, totalUsd: usd(round2(m.total)) })),
        },
      },
      {
        title: "Material List",
        description: rows.length > items.length ? `Latest ${items.length} of ${rows.length} lines` : undefined,
        table: {
          columns: [
            { key: "date", label: "Date" },
            { key: "material", label: "Material" },
            { key: "quantity", label: "Qty" },
            { key: "unitPriceUsd", label: "Unit price" },
            { key: "totalUsd", label: "Total" },
            { key: "project", label: "Project" },
            { key: "service", label: "Service" },
          ],
          rows: items.map((i) => ({ date: i.date, material: i.material, quantity: i.quantity, unitPriceUsd: i.unitPriceUsd, totalUsd: i.totalUsd, project: i.project, service: i.service })),
        },
      },
    ];

    return {
      [AUTO_REPORT_KEY]: { title: "Material Spending Report", description: "Total, by project, by material and item list", sections } satisfies HelpReport,
      output: {
        totalUsd: usd(round2(grand)),
        lines: rows.length,
        truncated: rows.length >= MAX_ROWS,
        rule: "valor da linha = preço x quantidade; lançamentos Credit abatem o total",
        byProject: projects.slice(0, 40).map((p) => ({ project: p.project, client: p.client, status: p.status, totalUsd: usd(round2(p.total)) })),
        byMaterial: materials.slice(0, 40).map((m) => ({ material: m.material, quantity: m.quantity, totalUsd: usd(round2(m.total)) })),
        items,
      },
    };
  },
};

export const materialsSkill: HelpSkill = {
  id: "materials-data",
  description: "Gastos com material de todos os projetos e lista itemizada.",
  instructions: `
Para "gastos com material", "lista de material", "quanto gastei em material (de X / este mês)", use materials_spending uma única vez; ele já cobre TODOS os projetos. Nunca peça ao usuário para abrir projeto por projeto. O relatório (total, por projeto, por material e lista de itens) é anexado automaticamente com botões Excel e PDF; responda com o total e os maiores gastos. Sem filtro de período ou status, considere todos os projetos e todas as datas e diga isso.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [materialsSpending],
};
