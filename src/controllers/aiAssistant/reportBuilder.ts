import { buildClientReport } from "./reports/clients";
import { buildCompanyReport } from "./reports/company";
import { buildInvoiceReport } from "./reports/invoices";
import { buildProjectReport } from "./reports/projects";
import { buildSubcontractorReport } from "./reports/subcontractors";
import { buildTimecardReport } from "./reports/timecards";
import type { AssistantReport, ExecutedTool } from "./types";

const REPORT_BUILDERS = [
  buildProjectReport,
  buildClientReport,
  buildInvoiceReport,
  buildTimecardReport,
  buildSubcontractorReport,
  buildCompanyReport,
] as const;

export function buildReportFromTool(tool: ExecutedTool): AssistantReport | null {
  if (!tool) return null;

  for (const build of REPORT_BUILDERS) {
    const report = build(tool);
    if (report) return report;
  }

  return null;
}
