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

export function getTrackingConfig(): TrackingConfig {
  return {
    protocolVersion: 2,
    enabled: readBoolean("TRACKING_V2_ENABLED", DEFAULT_TRACKING_CONFIG.enabled),
    legacyTimelineWrite: readBoolean(
      "TRACKING_LEGACY_TIMELINE_WRITE",
      DEFAULT_TRACKING_CONFIG.legacyTimelineWrite
    ),
    keepaliveMs: readBoundedNumber(
      "TRACKING_KEEPALIVE_MS",
      DEFAULT_TRACKING_CONFIG.keepaliveMs,
      30_000,
      900_000
    ),
    autoMinSendIntervalMs: readBoundedNumber(
      "TRACKING_AUTO_MIN_SEND_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.autoMinSendIntervalMs,
      15_000,
      300_000
    ),
    manualMinSendIntervalMs: readBoundedNumber(
      "TRACKING_MANUAL_MIN_SEND_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.manualMinSendIntervalMs,
      15_000,
      300_000
    ),
    outsideDistanceMeters: readBoundedNumber(
      "TRACKING_OUTSIDE_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.outsideDistanceMeters,
      25,
      2_000
    ),
    insideMinDistanceMeters: readBoundedNumber(
      "TRACKING_INSIDE_MIN_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.insideMinDistanceMeters,
      5,
      500
    ),
    foregroundMinIntervalMs: readBoundedNumber(
      "TRACKING_FOREGROUND_MIN_INTERVAL_MS",
      DEFAULT_TRACKING_CONFIG.foregroundMinIntervalMs,
      15_000,
      900_000
    ),
    foregroundMinDistanceMeters: readBoundedNumber(
      "TRACKING_FOREGROUND_MIN_DISTANCE_METERS",
      DEFAULT_TRACKING_CONFIG.foregroundMinDistanceMeters,
      10,
      2_000
    ),
    queueLimit: readBoundedNumber(
      "TRACKING_QUEUE_LIMIT",
      DEFAULT_TRACKING_CONFIG.queueLimit,
      50,
      2_000
    ),
    socketRefreshThrottleMs: readBoundedNumber(
      "TRACKING_SOCKET_REFRESH_THROTTLE_MS",
      DEFAULT_TRACKING_CONFIG.socketRefreshThrottleMs,
      1_000,
      30_000
    ),
    configTtlMs: readBoundedNumber(
      "TRACKING_CONFIG_TTL_MS",
      DEFAULT_TRACKING_CONFIG.configTtlMs,
      60_000,
      86_400_000
    ),
  };
}

export { DEFAULT_TRACKING_CONFIG };
