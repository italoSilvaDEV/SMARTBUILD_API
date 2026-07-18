export type TrackingConfig = {
  protocolVersion: 2;
  enabled: boolean;
  legacyTimelineWrite: boolean;
  keepaliveMs: number;
  autoMinSendIntervalMs: number;
  manualMinSendIntervalMs: number;
  outsideDistanceMeters: number;
  insideMinDistanceMeters: number;
  foregroundMinIntervalMs: number;
  foregroundMinDistanceMeters: number;
  queueLimit: number;
  socketRefreshThrottleMs: number;
  configTtlMs: number;
};

export type TrackingConfigPatch = Partial<Omit<TrackingConfig, "protocolVersion">>;

export type TrackingNumericConstraint = {
  min: number;
  max: number;
};

export const TRACKING_CONFIG_CONSTRAINTS = {
  keepaliveMs: { min: 30_000, max: 900_000 },
  autoMinSendIntervalMs: { min: 15_000, max: 300_000 },
  manualMinSendIntervalMs: { min: 15_000, max: 300_000 },
  outsideDistanceMeters: { min: 25, max: 2_000 },
  insideMinDistanceMeters: { min: 5, max: 500 },
  foregroundMinIntervalMs: { min: 15_000, max: 900_000 },
  foregroundMinDistanceMeters: { min: 10, max: 2_000 },
  queueLimit: { min: 50, max: 2_000 },
  socketRefreshThrottleMs: { min: 1_000, max: 30_000 },
  configTtlMs: { min: 60_000, max: 86_400_000 },
} as const satisfies Record<string, TrackingNumericConstraint>;

const TRACKING_BOOLEAN_KEYS = ["enabled", "legacyTimelineWrite"] as const;
const TRACKING_NUMERIC_KEYS = Object.keys(
  TRACKING_CONFIG_CONSTRAINTS
) as Array<keyof typeof TRACKING_CONFIG_CONSTRAINTS>;
const TRACKING_INPUT_KEYS = new Set<string>([
  "protocolVersion",
  ...TRACKING_BOOLEAN_KEYS,
  ...TRACKING_NUMERIC_KEYS,
]);

export class TrackingConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackingConfigValidationError";
  }
}

const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  protocolVersion: 2,
  enabled: true,
  legacyTimelineWrite: false,
  keepaliveMs: 120_000,
  autoMinSendIntervalMs: 60_000,
  manualMinSendIntervalMs: 30_000,
  outsideDistanceMeters: 200,
  insideMinDistanceMeters: 10,
  foregroundMinIntervalMs: 60_000,
  foregroundMinDistanceMeters: 100,
  queueLimit: 480,
  socketRefreshThrottleMs: 5_000,
  configTtlMs: 900_000,
};

function readBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function readBoundedNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampNumber(value: number, constraint: TrackingNumericConstraint) {
  return Math.min(constraint.max, Math.max(constraint.min, Math.round(value)));
}

function normalizeTrackingConfigPatchInternal(
  input: unknown,
  options: { strict: boolean; rejectUnknown: boolean; allowEmpty: boolean }
): TrackingConfigPatch {
  if (!isPlainRecord(input)) {
    if (options.strict) throw new TrackingConfigValidationError("config must be an object");
    return {};
  }

  if (options.rejectUnknown) {
    const unknownKeys = Object.keys(input).filter((key) => !TRACKING_INPUT_KEYS.has(key));
    if (unknownKeys.length) {
      throw new TrackingConfigValidationError(
        `Unknown tracking config fields: ${unknownKeys.join(", ")}`
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "protocolVersion")) {
    const protocolVersion = Number(input.protocolVersion);
    if (protocolVersion !== 2 && options.strict) {
      throw new TrackingConfigValidationError("protocolVersion must be 2");
    }
  }

  const patch: TrackingConfigPatch = {};
  for (const key of TRACKING_BOOLEAN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (typeof value !== "boolean") {
      if (options.strict) {
        throw new TrackingConfigValidationError(`${key} must be a boolean`);
      }
      continue;
    }
    patch[key] = value;
  }

  for (const key of TRACKING_NUMERIC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      if (options.strict) {
        throw new TrackingConfigValidationError(`${key} must be a finite number`);
      }
      continue;
    }
    patch[key] = clampNumber(value, TRACKING_CONFIG_CONSTRAINTS[key]);
  }

  if (!options.allowEmpty && Object.keys(patch).length === 0) {
    throw new TrackingConfigValidationError("config must include at least one editable field");
  }

  return patch;
}

export function normalizeTrackingConfigPatch(input: unknown): TrackingConfigPatch {
  return normalizeTrackingConfigPatchInternal(input, {
    strict: true,
    rejectUnknown: true,
    allowEmpty: false,
  });
}

export function normalizePersistedTrackingConfigPatch(input: unknown): TrackingConfigPatch {
  return normalizeTrackingConfigPatchInternal(input, {
    strict: false,
    rejectUnknown: false,
    allowEmpty: true,
  });
}

export function applyTrackingConfigPatch(
  base: TrackingConfig,
  patch: TrackingConfigPatch
): TrackingConfig {
  const merged: TrackingConfig = {
    ...base,
    ...patch,
    protocolVersion: 2,
  };

  // A denser threshold inside a site should never become less sensitive than
  // the outside threshold. This also keeps independently inherited overrides safe.
  merged.insideMinDistanceMeters = Math.min(
    merged.insideMinDistanceMeters,
    merged.outsideDistanceMeters
  );
  // Keepalive is the upper bound promised to the tracking watchdog. Movement
  // throttles cannot postpone a sample beyond it.
  merged.autoMinSendIntervalMs = Math.min(
    merged.autoMinSendIntervalMs,
    merged.keepaliveMs
  );
  merged.manualMinSendIntervalMs = Math.min(
    merged.manualMinSendIntervalMs,
    merged.keepaliveMs
  );

  return merged;
}

export function applyTrackingEmergencyEnvironmentOverrides(
  config: TrackingConfig
): TrackingConfig {
  const enabledOverride = process.env.TRACKING_V2_ENABLED?.trim().toLowerCase();
  const legacyOverride = process.env.TRACKING_LEGACY_TIMELINE_WRITE?.trim().toLowerCase();
  const forceDisabled = ["false", "0", "no", "off"].includes(enabledOverride || "");
  const forceLegacyWrite = ["true", "1", "yes", "on"].includes(legacyOverride || "");

  return {
    ...config,
    enabled: forceDisabled ? false : config.enabled,
    legacyTimelineWrite: forceLegacyWrite ? true : config.legacyTimelineWrite,
  };
}

export function getTrackingConfig(): TrackingConfig {
  const config: TrackingConfig = {
    protocolVersion: 2,
    enabled: readBoolean("TRACKING_V2_ENABLED", DEFAULT_TRACKING_CONFIG.enabled),
    legacyTimelineWrite: readBoolean(
      "TRACKING_LEGACY_TIMELINE_WRITE",
      DEFAULT_TRACKING_CONFIG.legacyTimelineWrite
    ),
    keepaliveMs: readBoundedNumber(
      "TRACKING_KEEPALIVE_MS",
      DEFAULT_TRACKING_CONFIG.keepaliveMs,
      TRACKING_CONFIG_CONSTRAINTS.keepaliveMs.min,
      TRACKING_CONFIG_CONSTRAINTS.keepaliveMs.max
    ),
    autoMinSendIntervalMs: readBoundedNumber(
      "TRACKING_AUTO_MIN_SEND_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.autoMinSendIntervalMs,
      TRACKING_CONFIG_CONSTRAINTS.autoMinSendIntervalMs.min,
      TRACKING_CONFIG_CONSTRAINTS.autoMinSendIntervalMs.max
    ),
    manualMinSendIntervalMs: readBoundedNumber(
      "TRACKING_MANUAL_MIN_SEND_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.manualMinSendIntervalMs,
      TRACKING_CONFIG_CONSTRAINTS.manualMinSendIntervalMs.min,
      TRACKING_CONFIG_CONSTRAINTS.manualMinSendIntervalMs.max
    ),
    outsideDistanceMeters: readBoundedNumber(
      "TRACKING_OUTSIDE_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.outsideDistanceMeters,
      TRACKING_CONFIG_CONSTRAINTS.outsideDistanceMeters.min,
      TRACKING_CONFIG_CONSTRAINTS.outsideDistanceMeters.max
    ),
    insideMinDistanceMeters: readBoundedNumber(
      "TRACKING_INSIDE_MIN_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.insideMinDistanceMeters,
      TRACKING_CONFIG_CONSTRAINTS.insideMinDistanceMeters.min,
      TRACKING_CONFIG_CONSTRAINTS.insideMinDistanceMeters.max
    ),
    foregroundMinIntervalMs: readBoundedNumber(
      "TRACKING_FOREGROUND_MIN_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.foregroundMinIntervalMs,
      TRACKING_CONFIG_CONSTRAINTS.foregroundMinIntervalMs.min,
      TRACKING_CONFIG_CONSTRAINTS.foregroundMinIntervalMs.max
    ),
    foregroundMinDistanceMeters: readBoundedNumber(
      "TRACKING_FOREGROUND_MIN_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.foregroundMinDistanceMeters,
      TRACKING_CONFIG_CONSTRAINTS.foregroundMinDistanceMeters.min,
      TRACKING_CONFIG_CONSTRAINTS.foregroundMinDistanceMeters.max
    ),
    queueLimit: readBoundedNumber(
      "TRACKING_QUEUE_LIMIT",
      DEFAULT_TRACKING_CONFIG.queueLimit,
      TRACKING_CONFIG_CONSTRAINTS.queueLimit.min,
      TRACKING_CONFIG_CONSTRAINTS.queueLimit.max
    ),
    socketRefreshThrottleMs: readBoundedNumber(
      "TRACKING_SOCKET_REFRESH_THROTTLE_MS",
      DEFAULT_TRACKING_CONFIG.socketRefreshThrottleMs,
      TRACKING_CONFIG_CONSTRAINTS.socketRefreshThrottleMs.min,
      TRACKING_CONFIG_CONSTRAINTS.socketRefreshThrottleMs.max
    ),
    configTtlMs: readBoundedNumber(
      "TRACKING_CONFIG_TTL_MS",
      DEFAULT_TRACKING_CONFIG.configTtlMs,
      TRACKING_CONFIG_CONSTRAINTS.configTtlMs.min,
      TRACKING_CONFIG_CONSTRAINTS.configTtlMs.max
    ),
  };

  return applyTrackingConfigPatch(config, {});
}

export { DEFAULT_TRACKING_CONFIG };
