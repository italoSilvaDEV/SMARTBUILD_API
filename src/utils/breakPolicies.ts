export type BreakPolicyMode = "legacy" | "company" | "specific";

export interface BreakPolicyRule {
  afterMinutes: number;
  deductMinutes: number;
}

export interface BreakPolicySnapshot {
  effectiveFrom: string;
  effectiveTo: string | null;
  mode: BreakPolicyMode;
  policyId: string | null;
  policyName: string;
  rules: BreakPolicyRule[];
  weekdays: number[];
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function toEffectiveDate(value?: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_EFFECTIVE_DATE");
  parsed.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsed.getTime() < today.getTime()) throw new Error("PAST_EFFECTIVE_DATE");
  return parsed.toISOString();
}

export function normalizeBreakPolicyRules(value: unknown): BreakPolicyRule[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    throw new Error("INVALID_BREAK_POLICY_RULES");
  }

  const rules = value.map((raw: any) => ({
    afterMinutes: Math.round(Number(raw?.afterMinutes)),
    deductMinutes: Math.round(Number(raw?.deductMinutes)),
  }));

  if (rules.some((rule) =>
    !Number.isFinite(rule.afterMinutes) ||
    !Number.isFinite(rule.deductMinutes) ||
    rule.afterMinutes < 1 ||
    rule.afterMinutes > 24 * 60 ||
    rule.deductMinutes < 1 ||
    rule.deductMinutes > 12 * 60
  )) {
    throw new Error("INVALID_BREAK_POLICY_RULES");
  }

  rules.sort((a, b) => a.afterMinutes - b.afterMinutes);
  if (new Set(rules.map((rule) => rule.afterMinutes)).size !== rules.length) {
    throw new Error("DUPLICATE_BREAK_POLICY_THRESHOLD");
  }

  if (rules.reduce((total, rule) => total + rule.deductMinutes, 0) > 24 * 60) {
    throw new Error("INVALID_BREAK_POLICY_RULES");
  }

  return rules;
}

export function normalizeBreakPolicyWeekdays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("INVALID_BREAK_POLICY_WEEKDAYS");
  }

  const weekdays = [...new Set(value.map((day) => Number(day)))].sort((a, b) => a - b);
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("INVALID_BREAK_POLICY_WEEKDAYS");
  }
  return weekdays;
}

export function parseBreakPolicyHistory(value: unknown): BreakPolicySnapshot[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry: any) => entry && typeof entry === "object")
    .map((entry: any) => ({
      effectiveFrom: String(entry.effectiveFrom || ""),
      effectiveTo: entry.effectiveTo ? String(entry.effectiveTo) : null,
      mode: ["legacy", "company", "specific"].includes(entry.mode)
        ? entry.mode as BreakPolicyMode
        : "legacy",
      policyId: entry.policyId ? String(entry.policyId) : null,
      policyName: String(entry.policyName || "Break policy"),
      rules: Array.isArray(entry.rules) ? entry.rules.map((rule: any) => ({
        afterMinutes: Number(rule.afterMinutes) || 0,
        deductMinutes: Number(rule.deductMinutes) || 0,
      })) : [],
      weekdays: Array.isArray(entry.weekdays)
        ? entry.weekdays.map(Number).filter((day: number) => day >= 0 && day <= 6)
        : ALL_WEEKDAYS,
    }))
    .filter((entry) => !Number.isNaN(new Date(entry.effectiveFrom).getTime()))
    .sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
}

export function buildPolicySnapshot(
  policy: { id: string; name: string; rules: unknown; weekdays: unknown },
  mode: Exclude<BreakPolicyMode, "legacy">,
  effectiveFrom: string
): BreakPolicySnapshot {
  return {
    effectiveFrom,
    effectiveTo: null,
    mode,
    policyId: policy.id,
    policyName: policy.name,
    rules: normalizeBreakPolicyRules(policy.rules),
    weekdays: normalizeBreakPolicyWeekdays(policy.weekdays),
  };
}

export function buildLegacySnapshot(defaultBreakMinutes: unknown, effectiveFrom: string): BreakPolicySnapshot {
  const deductMinutes = Math.max(0, Math.round(Number(defaultBreakMinutes) || 0));
  return {
    effectiveFrom,
    effectiveTo: null,
    mode: "legacy",
    policyId: null,
    policyName: "Current individual rule",
    rules: deductMinutes > 0 ? [{ afterMinutes: 4 * 60, deductMinutes }] : [],
    weekdays: ALL_WEEKDAYS,
  };
}

export function appendBreakPolicyHistory(
  currentValue: unknown,
  nextSnapshot: BreakPolicySnapshot
): BreakPolicySnapshot[] {
  const nextStart = new Date(nextSnapshot.effectiveFrom).getTime();
  const retained = parseBreakPolicyHistory(currentValue)
    .filter((entry) => new Date(entry.effectiveFrom).getTime() < nextStart)
    .map((entry) => {
      const end = entry.effectiveTo ? new Date(entry.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
      return end > nextStart ? { ...entry, effectiveTo: nextSnapshot.effectiveFrom } : entry;
    });

  return [...retained, nextSnapshot];
}

export function getBreakPolicySnapshotForDate(value: unknown, date: Date) {
  const timestamp = date.getTime();
  const matches = parseBreakPolicyHistory(value)
    .filter((entry) => {
      const start = new Date(entry.effectiveFrom).getTime();
      const end = entry.effectiveTo ? new Date(entry.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
      return start <= timestamp && timestamp < end;
    });
  return matches[matches.length - 1];
}
