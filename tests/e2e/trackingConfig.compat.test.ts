import { getTrackingConfig } from "../../src/config/trackingConfig";

const TRACKING_ENV_KEYS = [
  "TRACKING_V2_ENABLED",
  "TRACKING_LEGACY_TIMELINE_WRITE",
  "TRACKING_KEEPALIVE_MS",
  "TRACKING_AUTO_MIN_SEND_INTERVAL_MS",
  "TRACKING_MANUAL_MIN_SEND_INTERVAL_MS",
  "TRACKING_OUTSIDE_DISTANCE_METERS",
  "TRACKING_INSIDE_MIN_DISTANCE_METERS",
  "TRACKING_FOREGROUND_MIN_INTERVAL_MS",
  "TRACKING_FOREGROUND_MIN_DISTANCE_METERS",
  "TRACKING_QUEUE_LIMIT",
  "TRACKING_SOCKET_REFRESH_THROTTLE_MS",
  "TRACKING_CONFIG_TTL_MS",
] as const;

describe("Tracking 2.0 remote config", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    for (const key of TRACKING_ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it("returns conservative defaults compatible with legacy clients", () => {
    expect(getTrackingConfig()).toEqual({
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
    });
  });

  it("supports the rollback flags and clamps unsafe numeric values", () => {
    process.env.TRACKING_V2_ENABLED = "false";
    process.env.TRACKING_LEGACY_TIMELINE_WRITE = "true";
    process.env.TRACKING_KEEPALIVE_MS = "1";
    process.env.TRACKING_QUEUE_LIMIT = "999999";
    process.env.TRACKING_SOCKET_REFRESH_THROTTLE_MS = "500";
    process.env.TRACKING_CONFIG_TTL_MS = "999999999";

    expect(getTrackingConfig()).toEqual(
      expect.objectContaining({
        enabled: false,
        legacyTimelineWrite: true,
        keepaliveMs: 30_000,
        queueLimit: 2_000,
        socketRefreshThrottleMs: 1_000,
        configTtlMs: 86_400_000,
      })
    );
  });
});
