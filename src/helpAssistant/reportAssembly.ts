import { buildReportFromTool } from "../controllers/aiAssistant/reportBuilder";
import { HelpReport, HelpThreadContext } from "./types";

const REPORT_TITLES: Record<string, string> = { pt: "Relatório", en: "Report", es: "Informe" };
const MAX_COMBINED_SECTIONS = 4;

/** Relatório padrão de uma consulta (os mesmos construtores do assistente antigo). Nunca lança. */
export function buildAutoReport(toolName: string, input: Record<string, unknown>, output: unknown): HelpReport | null {
  try {
    const report = buildReportFromTool({ tool: toolName, input, output });
    if (!report || (!report.table?.rows?.length && !report.chartData?.length && !report.metrics?.length)) return null;
    return report as HelpReport;
  } catch (error) {
    console.error(`[HelpAssistant] report builder failed for ${toolName}:`, error);
    return null;
  }
}

/**
 * Escolhe o relatório final da resposta:
 * - relatório montado pelo modelo (render_report) vence;
 * - relatório completo (com seções) vence os automáticos;
 * - vários automáticos viram seções de um só relatório (busca mista).
 */
export function pickFinalReport(params: {
  custom: HelpReport | null;
  auto: HelpReport[];
  language: string;
}): HelpReport | null {
  const { custom, auto, language } = params;
  // Relatório completo (com seções) vence tudo, inclusive o montado pelo modelo.
  const full = [...auto].reverse().find((report) => report.sections?.length);
  if (full) return full;
  if (custom) return custom;
  if (!auto.length) return null;

  const unique = new Map<string, HelpReport>();
  for (const report of auto) unique.set(report.title, report);
  const reports = [...unique.values()];
  if (reports.length === 1) return reports[0];

  return {
    title: REPORT_TITLES[language] ?? REPORT_TITLES.en,
    description: reports.map((report) => report.title).join(" · "),
    sections: reports.slice(-MAX_COMBINED_SECTIONS),
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Projeto/subcontractor tocados por uma tool, para entender "esse projeto" nos próximos turnos. */
/** Tools que olham UM subcontractor; consultas que varrem vários não definem o foco. */
const SINGLE_SUBCONTRACTOR_TOOLS = new Set(["get_subcontractor_details", "subcontractor_projects", "subcontractor_full_report"]);

export function extractContext(args: Record<string, unknown>, output: any, toolName = ""): HelpThreadContext {
  const context: HelpThreadContext = {};

  const projectId = textOf(args.projectId) ?? textOf(output?.projectId);
  if (projectId) {
    context.projectId = projectId;
    context.projectLabel = textOf(output?.projectAddress) ?? textOf(output?.projectName);
  } else if (Array.isArray(output?.items) && output.items.length === 1 && textOf(output.items[0]?.projectAddress)) {
    const only = output.items[0];
    if (textOf(only.id) || textOf(only.projectId)) {
      context.projectId = textOf(only.projectId) ?? textOf(only.id);
      context.projectLabel = textOf(only.projectAddress);
    }
  }

  const subcontractorId = SINGLE_SUBCONTRACTOR_TOOLS.has(toolName) ? textOf(args.subcontractorId) ?? textOf(output?.subcontractor?.id) : undefined;
  if (subcontractorId) {
    context.subcontractorId = subcontractorId;
    context.subcontractorLabel = textOf(output?.subcontractor?.name) ?? textOf(args.subcontractorName);
  }

  return context;
}

/** Foco vindo da tela em que o usuário está (detalhe de projeto ou de subcontractor). */
export function contextFromRoute(route: string | null): HelpThreadContext {
  if (!route) return {};
  const project = route.match(/\/seller\/project\/details\/([0-9a-fA-F-]{36})/);
  if (project) return { projectId: project[1], projectLabel: "projeto aberto na tela do usuário" };
  const subcontractor = route.match(/\/seller\/subcontractors\/([0-9a-fA-F-]{36})/);
  if (subcontractor) return { subcontractorId: subcontractor[1], subcontractorLabel: "subcontractor aberto na tela do usuário" };
  return {};
}

export function describeContext(context: HelpThreadContext | null): string | null {
  if (!context) return null;
  const lines: string[] = [];
  if (context.projectId) {
    lines.push(`- Último projeto em foco: ${context.projectLabel ?? "(sem endereço)"} (projectId=${context.projectId})`);
  }
  if (context.subcontractorId) {
    lines.push(`- Último subcontractor em foco: ${context.subcontractorLabel ?? "(sem nome)"} (subcontractorId=${context.subcontractorId})`);
  }
  if (!lines.length) return null;
  return `CONTEXTO DA CONVERSA (use estes ids quando o usuário disser "esse projeto", "ele", "detalhe isso" ou fizer uma pergunta de projeto sem citar outro; se ele pedir algo da empresa toda, ignore o foco):\n${lines.join("\n")}`;
}
