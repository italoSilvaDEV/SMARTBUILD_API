/**
 * Compactação da resposta de uma tool antes de devolvê-la ao modelo.
 * Em vez de cortar o JSON no meio, reduz as listas longas (mantendo totais e
 * demais campos) e registra em `_omittedRows` quantas linhas ficaram de fora.
 */

const DEFAULT_MAX_CHARS = 14000;
const ROW_LIMITS = [60, 40, 25, 15, 8, 4];
const MAX_DEPTH = 5;

function jsonSize(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

function capArrays(value: unknown, limit: number, omitted: Record<string, number>, path: string, depth: number): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const kept = value.length > limit ? value.slice(0, limit) : value;
    if (value.length > limit) omitted[path || "root"] = value.length - limit;
    return kept.map((item) => capArrays(item, limit, omitted, `${path}[]`, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    result[key] = capArrays(field, limit, omitted, path ? `${path}.${key}` : key, depth + 1);
  }
  return result;
}

export function compactForModel(output: unknown, maxChars = DEFAULT_MAX_CHARS): unknown {
  if (jsonSize(output) <= maxChars) return output;

  for (const limit of ROW_LIMITS) {
    const omitted: Record<string, number> = {};
    const capped = capArrays(output, limit, omitted, "", 0);
    const withNote =
      capped && typeof capped === "object" && !Array.isArray(capped)
        ? { ...(capped as Record<string, unknown>), _omittedRows: omitted }
        : { data: capped, _omittedRows: omitted };
    if (jsonSize(withNote) <= maxChars) return withNote;
  }

  return { truncated: true, partialJson: JSON.stringify(output ?? null).slice(0, maxChars) };
}
