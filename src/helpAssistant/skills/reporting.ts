import { HelpReport, HelpSkill } from "../types";

const MAX_ROWS = 200;
const MAX_CHART_POINTS = 60;

function sanitizeReport(raw: any): HelpReport | null {
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const chartMode = ["bar", "line", "pie"].includes(raw.chartMode) ? raw.chartMode : undefined;
  const columns = Array.isArray(raw.table?.columns)
    ? raw.table.columns.filter((column: any) => typeof column?.key === "string" && typeof column?.label === "string")
    : [];

  return {
    title: raw.title.trim(),
    description: typeof raw.description === "string" ? raw.description : undefined,
    chartMode,
    chartData: Array.isArray(raw.chartData) ? raw.chartData.slice(0, MAX_CHART_POINTS) : [],
    metrics: Array.isArray(raw.metrics)
      ? raw.metrics
          .filter((metric: any) => typeof metric?.label === "string")
          .map((metric: any) => ({ label: metric.label, value: String(metric.value ?? ""), tone: metric.tone }))
      : [],
    table: columns.length
      ? { columns, rows: Array.isArray(raw.table.rows) ? raw.table.rows.slice(0, MAX_ROWS) : [] }
      : null,
  };
}

/**
 * Permite ao modelo devolver um relatório estruturado (métricas, gráfico,
 * tabela) que o front renderiza e exporta em CSV/PDF. Não lê nem grava dados.
 */
export const reportingSkill: HelpSkill = {
  id: "reporting",
  description: "Monta relatórios visuais a partir dos dados já consultados.",
  instructions: `
Quando o usuário pedir relatório, tabela, gráfico, ranking ou exportação (PDF, CSV, Excel), consulte os dados e então chame render_report com o resultado.
- Use só números vindos das ferramentas de dados. Em chartData use os números brutos exatamente como vieram; na tabela e nas métricas use os textos "Usd" já formatados.
- chartData: lista de objetos com uma chave de rótulo ("label") e uma ou mais chaves numéricas.
- Depois de chamar render_report, responda com um resumo curto dos principais números. A tabela e o gráfico aparecem logo abaixo da sua resposta, com botões "Excel" e "PDF" para exportar; não pergunte se o usuário quer exportar.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [
    {
      name: "render_report",
      description: "Exibe ao usuário um relatório com métricas, gráfico e tabela. Use após consultar os dados.",
      readOnly: true,
      producesReport: true,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          chartMode: { type: "string", enum: ["bar", "line", "pie"] },
          chartData: { type: "array", items: { type: "object" } },
          metrics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                tone: { type: "string", enum: ["default", "warning", "success"] },
              },
              required: ["label", "value"],
            },
          },
          table: {
            type: "object",
            properties: {
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: { key: { type: "string" }, label: { type: "string" } },
                  required: ["key", "label"],
                },
              },
              rows: { type: "array", items: { type: "object" } },
            },
          },
        },
        required: ["title"],
      },
      async run(args) {
        const report = sanitizeReport(args);
        return report ? { report } : { error: "invalid report" };
      },
    },
  ],
};
