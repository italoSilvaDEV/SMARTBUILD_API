import {
  applyTrackingConfigPatch,
  applyTrackingEmergencyEnvironmentOverrides,
  getTrackingConfig,
  normalizePersistedTrackingConfigPatch,
  normalizeTrackingConfigPatch,
  TrackingConfigValidationError,
} from "../../src/config/trackingConfig";

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
    process.env.TRACKING_AUTO_MIN_SEND_INTERVAL_MS = "300000";
    process.env.TRACKING_MANUAL_MIN_SEND_INTERVAL_MS = "300000";
    process.env.TRACKING_OUTSIDE_DISTANCE_METERS = "25";
    process.env.TRACKING_INSIDE_MIN_DISTANCE_METERS = "500";
    process.env.TRACKING_QUEUE_LIMIT = "999999";
    process.env.TRACKING_SOCKET_REFRESH_THROTTLE_MS = "500";
    process.env.TRACKING_CONFIG_TTL_MS = "999999999";

    expect(getTrackingConfig()).toEqual(
      expect.objectContaining({
        enabled: false,
        legacyTimelineWrite: true,
        keepaliveMs: 30_000,
        autoMinSendIntervalMs: 30_000,
        manualMinSendIntervalMs: 30_000,
        outsideDistanceMeters: 25,
        insideMinDistanceMeters: 25,
        queueLimit: 2_000,
        socketRefreshThrottleMs: 1_000,
        configTtlMs: 86_400_000,
      })
    );
  });

  it("validates admin input, rejects unknown fields and clamps every saved number", () => {
    expect(
      normalizeTrackingConfigPatch({
        enabled: false,
        keepaliveMs: 1,
        outsideDistanceMeters: 99_999,
        queueLimit: 42.7,
      })
    ).toEqual({
      enabled: false,
      keepaliveMs: 30_000,
      outsideDistanceMeters: 2_000,
      queueLimit: 50,
    });
    expect(() => normalizeTrackingConfigPatch({ enabled: "false" })).toThrow(
      TrackingConfigValidationError
    );
    expect(() => normalizeTrackingConfigPatch({ futureField: true })).toThrow(
      /Unknown tracking config fields/
    );
    expect(() => normalizeTrackingConfigPatch({ protocolVersion: 3 })).toThrow(
      /protocolVersion must be 2/
    );
  });

  it("keeps persisted corruption from escaping and applies partial inheritance safely", () => {
    const base = getTrackingConfig();
    const persisted = normalizePersistedTrackingConfigPatch({
      enabled: false,
      queueLimit: "not-a-number",
      unknown: true,
    });
    expect(persisted).toEqual({ enabled: false });
    const inherited = applyTrackingConfigPatch(base, persisted);
    expect(
      applyTrackingConfigPatch(inherited, {
        keepaliveMs: 30_000,
        autoMinSendIntervalMs: 300_000,
        manualMinSendIntervalMs: 300_000,
        outsideDistanceMeters: 25,
        insideMinDistanceMeters: 500,
      })
    ).toEqual(
      expect.objectContaining({
        enabled: false,
        outsideDistanceMeters: 25,
        insideMinDistanceMeters: 25,
        autoMinSendIntervalMs: 30_000,
        manualMinSendIntervalMs: 30_000,
      })
    );
  });

  it("keeps the environment rollback safe even when a database value says otherwise", () => {
    process.env.TRACKING_V2_ENABLED = "false";
    process.env.TRACKING_LEGACY_TIMELINE_WRITE = "true";
    const effective = applyTrackingEmergencyEnvironmentOverrides({
      ...getTrackingConfig(),
      enabled: true,
      legacyTimelineWrite: false,
    });
    expect(effective.enabled).toBe(false);
    expect(effective.legacyTimelineWrite).toBe(true);
  });
});
