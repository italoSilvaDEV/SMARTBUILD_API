import type { AssistantMessageRow, AssistantToolData, ExecutedTool } from "./types";

function extractProjectIdFromOutput(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  if (typeof output.projectId === "string" && output.projectId) return output.projectId;
  if (typeof output.id === "string" && output.location) return output.id;
  if (Array.isArray(output.items)) {
    for (const item of output.items) {
      if (item && typeof item.projectId === "string" && item.projectId) {
        return item.projectId;
      }
    }
  }
  return null;
}

function extractSubcontractorIdFromOutput(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  if (typeof output.subcontractorId === "string" && output.subcontractorId) return output.subcontractorId;
  if (output.subcontractor && typeof output.subcontractor.id === "string" && output.subcontractor.id) {
    return output.subcontractor.id;
  }
  if (Array.isArray(output.items)) {
    for (const item of output.items) {
      if (item && typeof item.subcontractorId === "string" && item.subcontractorId) {
        return item.subcontractorId;
      }
      if (item?.subcontractor && typeof item.subcontractor.id === "string" && item.subcontractor.id) {
        return item.subcontractor.id;
      }
    }
  }
  return null;
}

export function getRecentProjectIdFromHistory(history: AssistantMessageRow[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const toolData = message.toolData as AssistantToolData;
    const executedTools = Array.isArray(toolData?.executedTools) ? toolData.executedTools : [];

    for (let toolIndex = executedTools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const projectId = extractProjectIdFromOutput(executedTools[toolIndex]?.output);
      if (projectId) return projectId;
    }
  }

  return null;
}

export function getRecentSubcontractorIdFromHistory(history: AssistantMessageRow[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const toolData = message.toolData as AssistantToolData;
    const executedTools = Array.isArray(toolData?.executedTools) ? toolData.executedTools : [];

    for (let toolIndex = executedTools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const subcontractorId = extractSubcontractorIdFromOutput(executedTools[toolIndex]?.output);
      if (subcontractorId) return subcontractorId;
    }
  }

  return null;
}

export function getRecentToolOutput(history: AssistantMessageRow[], toolName: string): any | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const toolData = message.toolData as AssistantToolData;
    const executedTools = Array.isArray(toolData?.executedTools) ? toolData.executedTools : [];

    for (let toolIndex = executedTools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      if (executedTools[toolIndex]?.tool === toolName) {
        return executedTools[toolIndex]?.output || null;
      }
    }
  }

  return null;
}

export function getRecentResponseIdFromHistory(history: AssistantMessageRow[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role !== "assistant") continue;
    const toolData = message.toolData as AssistantToolData;
    if (typeof toolData?.responseId === "string" && toolData.responseId) {
      return toolData.responseId;
    }
  }

  return null;
}

function toPlannerContext(tool: ExecutedTool) {
  const output: any = tool.output || {};
  const input = tool.input || {};

  return {
    tool: tool.tool,
    input: {
      period: input.period || null,
      date: input.date || null,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      limit: input.limit || null,
      projectId: input.projectId || null,
      workerName: input.workerName || null,
      subcontractorId: input.subcontractorId || null,
    },
    output: {
      periodLabel: output.periodLabel || null,
      dateRangeLabel: output.dateRangeLabel || null,
      total: output.total || output.totalEntries || output.totalWorkers || output.totalProjects || null,
    },
  };
}

export function getRecentToolContexts(history: AssistantMessageRow[], limit = 3) {
  const contexts: ReturnType<typeof toPlannerContext>[] = [];

  for (let index = history.length - 1; index >= 0 && contexts.length < limit; index -= 1) {
    const message = history[index];
    const toolData = message.toolData as AssistantToolData;
    const executedTools = Array.isArray(toolData?.executedTools) ? toolData.executedTools : [];

    for (let toolIndex = executedTools.length - 1; toolIndex >= 0 && contexts.length < limit; toolIndex -= 1) {
      const tool = executedTools[toolIndex];
      if (!tool?.tool) continue;
      contexts.push(toPlannerContext(tool));
    }
  }

  return contexts;
}
