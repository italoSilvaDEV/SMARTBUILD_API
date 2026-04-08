import { WorkerLocationPing } from "@prisma/client";

const MAPBOX_MATCHING_API_BASE = "https://api.mapbox.com/matching/v5";
const MAPBOX_MATCHING_MAX_COORDINATES = 100;
const MAPBOX_MATCHING_OVERLAP = 1;
const MAPBOX_MATCHING_DEFAULT_PROFILE = "mapbox/driving";
const MAPBOX_MATCHING_DEFAULT_RADIUS_METERS = 15;
const MAPBOX_MATCHING_MIN_RADIUS_METERS = 5;
const MAPBOX_MATCHING_MAX_RADIUS_METERS = 50;
const MAPBOX_MATCHING_TIMEOUT_MS = 8000;
const MAPBOX_MATCHING_GET_URL_SOFT_LIMIT = 7800;
const MAPBOX_MATCHING_RADIUS_RETRY_STEPS = [15, 35, 50];
const MAPBOX_MATCHING_TARGET_SAMPLE_SECONDS = 5;
const MAPBOX_DIRECTIONS_API_BASE = "https://api.mapbox.com/directions/v5";
const MAPBOX_DIRECTIONS_MAX_COORDINATES = 25;
const MAPBOX_DIRECTIONS_TARGET_SAMPLE_SECONDS = 5 * 60;
const MAPBOX_DIRECTIONS_MIN_STEP_DISTANCE_METERS = 40;
const MAPBOX_STOP_CLUSTER_RADIUS_METERS = 60;
const MAPBOX_STOP_CLUSTER_MIN_DURATION_MS = 60 * 1000;
const MAPBOX_DISPLAY_GAP_THRESHOLD_MS = 60 * 60 * 1000;

export type ReplaySegmentBreakReason =
  | "attendance-change"
  | "time-gap"
  | "distance-gap"
  | "time-and-distance-gap";

export interface ReplayTrackPoint {
  id: string;
  lat: number;
  lng: number;
  timestamp: string;
  presence: "inside-site" | "outside-site";
  accuracyMeters?: number | null;
}

export interface ReplaySegmentInput {
  attendanceId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  breakReason?: ReplaySegmentBreakReason | null;
  trackPoints: ReplayTrackPoint[];
}

export interface ReplayTracePoint {
  rawPointId: string;
  lat: number;
  lng: number;
  timestamp: string;
  matched: boolean;
  name?: string | null;
}

export interface ReplayMatchedSegment {
  attendanceId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  breakReason?: ReplaySegmentBreakReason | null;
  source: "mapbox" | "raw";
  rawTrackPoints: ReplayTrackPoint[];
  matchedTracePoints: ReplayTracePoint[];
  routeGeometry: number[][];
  mapboxChunks?: MapboxApiChunkPayload[];
}

export interface ReplayMatchingResult {
  rawTrackPoints: ReplayTrackPoint[];
  matchedGeometry: number[][][];
  displayGeometry: number[][];
  displayGeometrySegments: number[][][];
  displayGaps: ReplayDisplayGap[];
  matchedSegments: ReplayMatchedSegment[];
  tracepoints: ReplayTracePoint[];
  matchingMeta: {
    provider: "mapbox";
    profile: string;
    chunkCount: number;
    fallbackUsed: boolean;
    fallbackReasons: string[];
    pointsUsedCount: number;
    discardedPointCount: number;
    matchedPointCount: number;
  };
  summary: {
    rawPointCount: number;
    pointsUsedCount: number;
    discardedPointCount: number;
    matchedPointCount: number;
    rawDistanceMeters: number;
    matchedDistanceMeters: number;
  };
}

export interface ReplayDisplayGap {
  coordinate: number[];
  startedAt: string;
  resumedAt: string;
  durationMinutes: number;
}

interface PreparedReplayPoint extends ReplayTrackPoint {
  sourceIndex: number;
}

interface MapboxChunkResult {
  routeGeometry: number[][];
  matchedTracePoints: ReplayTracePoint[];
  matchedPointCount: number;
  discardedPointCount: number;
  chunkCount: number;
  originalPayload: MapboxApiChunkPayload;
}

interface ChunkFailure {
  status?: number;
  code?: string;
  message?: string;
}

interface MapboxApiMatching {
  confidence?: number;
  distance?: number;
  duration?: number;
  weight?: number;
  weight_name?: string;
  geometry?: {
    coordinates?: number[][];
    type?: string;
  };
  legs?: any[];
  linear_references?: string[];
  [key: string]: any;
}

interface MapboxApiTracePoint {
  alternatives_count?: number;
  waypoint_index?: number | null;
  matchings_index?: number;
  distance?: number;
  name?: string;
  location?: [number, number];
  [key: string]: any;
}

interface MapboxApiChunkPayload {
  code: string;
  matchings: MapboxApiMatching[];
  tracepoints: Array<MapboxApiTracePoint | null>;
  request: {
    method: "GET" | "POST";
    coordinatesCount: number;
  };
}

interface DirectionsApiRoute {
  geometry?: {
    coordinates?: number[][];
    type?: string;
  } | string;
}

function isFiniteCoordinate(value: number) {
  return Number.isFinite(value);
}

function isValidPoint(point: ReplayTrackPoint) {
  return isFiniteCoordinate(point.lat) && isFiniteCoordinate(point.lng);
}

function toUnixSeconds(timestamp: string) {
  return Math.max(0, Math.round(new Date(timestamp).getTime() / 1000));
}

function clampRadius(accuracyMeters?: number | null) {
  if (!Number.isFinite(accuracyMeters)) {
    return MAPBOX_MATCHING_DEFAULT_RADIUS_METERS;
  }

  return Math.min(
    MAPBOX_MATCHING_MAX_RADIUS_METERS,
    Math.max(MAPBOX_MATCHING_MIN_RADIUS_METERS, Math.round(Number(accuracyMeters)))
  );
}

function dedupeConsecutivePoints(points: ReplayTrackPoint[]) {
  const prepared: PreparedReplayPoint[] = [];
  let discardedPointCount = 0;

  points.forEach((point, index) => {
    if (!isValidPoint(point)) {
      discardedPointCount += 1;
      return;
    }

    const previous = prepared[prepared.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) {
      discardedPointCount += 1;
      return;
    }

    prepared.push({
      ...point,
      sourceIndex: index,
    });
  });

  return {
    points: prepared,
    discardedPointCount,
  };
}

function downsamplePreparedPoints(
  points: PreparedReplayPoint[],
  targetSampleSeconds = MAPBOX_MATCHING_TARGET_SAMPLE_SECONDS
) {
  if (points.length <= 2) {
    return {
      points,
      discardedPointCount: 0,
    };
  }

  const sampled: PreparedReplayPoint[] = [points[0]];
  let discardedPointCount = 0;
  let lastKeptTimestamp = new Date(points[0].timestamp).getTime();

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const currentTimestamp = new Date(point.timestamp).getTime();

    if (!Number.isFinite(currentTimestamp)) {
      discardedPointCount += 1;
      continue;
    }

    if (currentTimestamp - lastKeptTimestamp < targetSampleSeconds * 1000) {
      discardedPointCount += 1;
      continue;
    }

    sampled.push(point);
    lastKeptTimestamp = currentTimestamp;
  }

  sampled.push(points[points.length - 1]);

  return {
    points: sampled,
    discardedPointCount,
  };
}

function thinSpatialNoise(
  points: PreparedReplayPoint[],
  minimumStepDistanceMeters = MAPBOX_DIRECTIONS_MIN_STEP_DISTANCE_METERS
) {
  if (points.length <= 2) {
    return {
      points,
      discardedPointCount: 0,
    };
  }

  const filtered: PreparedReplayPoint[] = [points[0]];
  let discardedPointCount = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const previousKept = filtered[filtered.length - 1];
    const distanceFromPreviousKept = getDistanceMeters(
      previousKept.lat,
      previousKept.lng,
      point.lat,
      point.lng
    );

    if (distanceFromPreviousKept < minimumStepDistanceMeters) {
      discardedPointCount += 1;
      continue;
    }

    filtered.push(point);
  }

  const lastPoint = points[points.length - 1];
  const previousKept = filtered[filtered.length - 1];
  if (!previousKept || previousKept.id !== lastPoint.id) {
    filtered.push(lastPoint);
  }

  return {
    points: filtered,
    discardedPointCount,
  };
}

function collapseStationaryClusters(points: PreparedReplayPoint[]) {
  if (points.length <= 2) {
    return {
      points,
      discardedPointCount: 0,
    };
  }

  const collapsed: PreparedReplayPoint[] = [];
  let discardedPointCount = 0;
  let index = 0;

  while (index < points.length) {
    const clusterStart = points[index];
    const clusterPoints: PreparedReplayPoint[] = [clusterStart];
    let nextIndex = index + 1;
    let centroidLat = clusterStart.lat;
    let centroidLng = clusterStart.lng;

    while (nextIndex < points.length) {
      const candidate = points[nextIndex];
      const distanceFromCentroid = getDistanceMeters(
        centroidLat,
        centroidLng,
        candidate.lat,
        candidate.lng
      );

      if (distanceFromCentroid > MAPBOX_STOP_CLUSTER_RADIUS_METERS) {
        break;
      }

      clusterPoints.push(candidate);
      centroidLat =
        clusterPoints.reduce((sum, point) => sum + point.lat, 0) / clusterPoints.length;
      centroidLng =
        clusterPoints.reduce((sum, point) => sum + point.lng, 0) / clusterPoints.length;
      nextIndex += 1;
    }

    if (clusterPoints.length === 1) {
      collapsed.push(clusterStart);
      index = nextIndex;
      continue;
    }

    const clusterDurationMs =
      new Date(clusterPoints[clusterPoints.length - 1].timestamp).getTime() -
      new Date(clusterPoints[0].timestamp).getTime();

    if (clusterDurationMs >= MAPBOX_STOP_CLUSTER_MIN_DURATION_MS) {
      const lat =
        clusterPoints.reduce((sum, point) => sum + point.lat, 0) / clusterPoints.length;
      const lng =
        clusterPoints.reduce((sum, point) => sum + point.lng, 0) / clusterPoints.length;

      collapsed.push({
        ...clusterPoints[Math.floor(clusterPoints.length / 2)],
        lat,
        lng,
      });
      discardedPointCount += clusterPoints.length - 1;
    } else {
      collapsed.push(...clusterPoints);
    }

    index = nextIndex;
  }

  return {
    points: collapsed,
    discardedPointCount,
  };
}

function chunkPreparedPoints(points: PreparedReplayPoint[]) {
  if (points.length <= MAPBOX_MATCHING_MAX_COORDINATES) {
    return [points];
  }

  const chunks: PreparedReplayPoint[][] = [];
  let cursor = 0;

  while (cursor < points.length) {
    const end = Math.min(cursor + MAPBOX_MATCHING_MAX_COORDINATES, points.length);
    const chunk = points.slice(cursor, end);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
    if (end === points.length) break;
    cursor = end - MAPBOX_MATCHING_OVERLAP;
  }

  return chunks;
}

function chunkDirectionsPoints(points: PreparedReplayPoint[]) {
  if (points.length <= MAPBOX_DIRECTIONS_MAX_COORDINATES) {
    return [points];
  }

  const chunks: PreparedReplayPoint[][] = [];
  let cursor = 0;

  while (cursor < points.length) {
    const end = Math.min(cursor + MAPBOX_DIRECTIONS_MAX_COORDINATES, points.length);
    const chunk = points.slice(cursor, end);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
    if (end === points.length) break;
    cursor = end - 1;
  }

  return chunks;
}

function splitTrackPointsByTimeGap(
  points: ReplayTrackPoint[],
  thresholdMs = MAPBOX_DISPLAY_GAP_THRESHOLD_MS
) {
  const chunks: ReplayTrackPoint[][] = [];
  const gaps: ReplayDisplayGap[] = [];
  let currentChunk: ReplayTrackPoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previousPoint = currentChunk[currentChunk.length - 1];

    if (previousPoint) {
      const previousTimestamp = new Date(previousPoint.timestamp).getTime();
      const currentTimestamp = new Date(point.timestamp).getTime();
      const deltaMs = currentTimestamp - previousTimestamp;

      if (Number.isFinite(deltaMs) && deltaMs > thresholdMs) {
        chunks.push(currentChunk);
        gaps.push({
          coordinate: [previousPoint.lng, previousPoint.lat],
          startedAt: previousPoint.timestamp,
          resumedAt: point.timestamp,
          durationMinutes: Math.round(deltaMs / 60000),
        });
        currentChunk = [point];
        continue;
      }
    }

    currentChunk.push(point);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return {
    chunks,
    gaps,
  };
}

function mergeCoordinates(current: number[][], incoming: number[][]) {
  if (incoming.length === 0) return current;
  if (current.length === 0) return incoming.slice();

  const merged = current.slice();
  incoming.forEach((coordinate) => {
    const previous = merged[merged.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
      return;
    }
    merged.push(coordinate);
  });
  return merged;
}

function decodePolyline(value: string, precision = 5) {
  const coordinates: number[][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < value.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = value.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < value.length);

    const latitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    lat += latitudeChange;

    shift = 0;
    result = 0;

    do {
      byte = value.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < value.length);

    const longitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    lng += longitudeChange;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const originLat = toRadians(lat1);
  const destinationLat = toRadians(lat2);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeTrackDistanceMeters(trackPoints: Array<{ lat: number; lng: number }>) {
  if (trackPoints.length < 2) return 0;

  let total = 0;
  for (let index = 0; index < trackPoints.length - 1; index += 1) {
    const current = trackPoints[index];
    const next = trackPoints[index + 1];
    total += getDistanceMeters(current.lat, current.lng, next.lat, next.lng);
  }

  return total;
}

function buildRawSegment(segment: ReplaySegmentInput, reason?: string): ReplayMatchedSegment {
  return {
    attendanceId: segment.attendanceId || null,
    checkInAt: segment.checkInAt || null,
    checkOutAt: segment.checkOutAt || null,
    breakReason: segment.breakReason || null,
    source: "raw",
    rawTrackPoints: segment.trackPoints,
    matchedTracePoints: segment.trackPoints.map((point) => ({
      rawPointId: point.id,
      lat: point.lat,
      lng: point.lng,
      timestamp: point.timestamp,
      matched: false,
      name: reason || null,
    })),
    routeGeometry: segment.trackPoints.map((point) => [point.lng, point.lat]),
  };
}

async function fetchMapboxChunk(
  token: string,
  profile: string,
  points: PreparedReplayPoint[]
): Promise<MapboxChunkResult | null> {
  const result = await fetchMapboxChunkDetailed(token, profile, points);
  return result.ok ? result.data : null;
}

async function fetchMapboxChunkDetailed(
  token: string,
  profile: string,
  points: PreparedReplayPoint[]
): Promise<
  | { ok: true; data: MapboxChunkResult }
  | { ok: false; failure: ChunkFailure }
> {
  if (points.length < 2) {
    return {
      ok: false,
      failure: {
        code: "InvalidInput",
        message: "At least two points are required",
      },
    };
  }

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(";");
  for (const radiusOverride of MAPBOX_MATCHING_RADIUS_RETRY_STEPS) {
    const params = new URLSearchParams({
      geometries: "geojson",
      overview: "full",
      tidy: "true",
      timestamps: points.map((point) => String(toUnixSeconds(point.timestamp))).join(";"),
      radiuses: points
        .map((point) => String(Math.max(clampRadius(point.accuracyMeters), radiusOverride)))
        .join(";"),
    });
    const getSearchParams = new URLSearchParams(params);
    getSearchParams.set("access_token", token);
    const getUrl = `${MAPBOX_MATCHING_API_BASE}/${profile}/${coordinates}.json?${getSearchParams.toString()}`;
    const usePost = getUrl.length > MAPBOX_MATCHING_GET_URL_SOFT_LIMIT;
    const requestMethod = usePost ? "POST" : "GET";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAPBOX_MATCHING_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const response = await fetch(
        usePost
          ? `${MAPBOX_MATCHING_API_BASE}/${profile}?access_token=${encodeURIComponent(token)}`
          : getUrl,
        usePost
          ? {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                coordinates,
                ...Object.fromEntries(params.entries()),
              }).toString(),
            }
          : {
              method: "GET",
              signal: controller.signal,
            }
      );
      const payload = await response.json();
      const latencyMs = Date.now() - startedAt;

      if (!response.ok || payload?.code === "NoMatch" || payload?.code === "NoSegment") {
        console.warn("[MapboxReplayMatchingService] chunk rejected", {
          profile,
          requestMethod,
          radiusOverride,
          latencyMs,
          status: response.status,
          code: payload?.code,
          message: payload?.message,
        });

        if (payload?.code === "NoSegment" && radiusOverride < MAPBOX_MATCHING_MAX_RADIUS_METERS) {
          continue;
        }

        return {
          ok: false,
          failure: {
            status: response.status,
            code: payload?.code,
            message: payload?.message,
          },
        };
      }

      const matchings = Array.isArray(payload?.matchings) ? payload.matchings : [];
      const routeGeometry = matchings.reduce((coordinatesAcc: number[][], matching: any) => {
        const chunkCoordinates = Array.isArray(matching?.geometry?.coordinates)
          ? matching.geometry.coordinates
          : typeof matching?.geometry === "string"
            ? decodePolyline(matching.geometry)
            : [];
        return mergeCoordinates(coordinatesAcc, chunkCoordinates);
      }, []);

      if (routeGeometry.length < 2) {
        console.warn("[MapboxReplayMatchingService] chunk missing route geometry", {
          profile,
          requestMethod,
          radiusOverride,
          latencyMs,
        });
        return {
          ok: false,
          failure: {
            status: response.status,
            code: "EmptyGeometry",
            message: "Missing route geometry",
          },
        };
      }

      const matchedTracePoints = points.map((point, index) => {
        const tracepoint = Array.isArray(payload?.tracepoints) ? payload.tracepoints[index] : null;
        const location = Array.isArray(tracepoint?.location) ? tracepoint.location : null;
        return {
          rawPointId: point.id,
          lat: location ? Number(location[1]) : point.lat,
          lng: location ? Number(location[0]) : point.lng,
          timestamp: point.timestamp,
          matched: Boolean(location),
          name: tracepoint?.name || null,
        } satisfies ReplayTracePoint;
      });

      return {
        ok: true,
        data: {
          routeGeometry,
          matchedTracePoints,
          matchedPointCount: matchedTracePoints.filter((point) => point.matched).length,
          discardedPointCount: matchedTracePoints.filter((point) => !point.matched).length,
          chunkCount: 1,
          originalPayload: {
            code: payload?.code || "Ok",
            matchings,
            tracepoints: Array.isArray(payload?.tracepoints) ? payload.tracepoints : [],
            request: {
              method: requestMethod,
              coordinatesCount: points.length,
            },
          },
        },
      };
    } catch (error) {
      console.warn("[MapboxReplayMatchingService] chunk request failed", {
        profile,
        requestMethod,
        radiusOverride,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        failure: {
          code: "RequestFailed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    failure: {
      code: "Unknown",
      message: "Chunk matching failed",
    },
  };
}

async function matchSegmentWithMapbox(
  token: string,
  profile: string,
  segment: ReplaySegmentInput
) {
  const prepared = dedupeConsecutivePoints(segment.trackPoints);
  const downsampled = downsamplePreparedPoints(prepared.points);
  const chunks = chunkPreparedPoints(downsampled.points);

  if (downsampled.points.length < 2 || chunks.length === 0) {
    return {
      segment: buildRawSegment(segment, "segment-too-short"),
      pointsUsedCount: downsampled.points.length,
      discardedPointCount: prepared.discardedPointCount + downsampled.discardedPointCount,
      matchedPointCount: 0,
      chunkCount: 0,
      usedFallback: true,
      fallbackReason: "segment-too-short",
    };
  }

  let routeGeometry: number[][] = [];
  let matchedTracePoints: ReplayTracePoint[] = [];
  let matchedPointCount = 0;
  let discardedPointCount = prepared.discardedPointCount;
  let chunkCount = 0;
  const mapboxChunks: MapboxApiChunkPayload[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkResult = await fetchMapboxChunkWithSplitting(token, profile, chunk);

    if (!chunkResult) {
      return {
        segment: buildRawSegment(segment, "mapbox-fallback"),
        pointsUsedCount: downsampled.points.length,
        discardedPointCount: prepared.discardedPointCount + downsampled.discardedPointCount,
        matchedPointCount: 0,
        chunkCount,
        usedFallback: true,
        fallbackReason: "mapbox-error",
      };
    }

    routeGeometry = mergeCoordinates(routeGeometry, chunkResult.routeGeometry);
    matchedPointCount += chunkResult.matchedPointCount;
    discardedPointCount += chunkResult.discardedPointCount;
    chunkCount += chunkResult.chunkCount;
    mapboxChunks.push(chunkResult.originalPayload);

    const chunkTracePoints =
      index === 0
        ? chunkResult.matchedTracePoints
        : chunkResult.matchedTracePoints.slice(MAPBOX_MATCHING_OVERLAP);
    matchedTracePoints = matchedTracePoints.concat(chunkTracePoints);
  }

  if (routeGeometry.length < 2) {
      return {
        segment: buildRawSegment(segment, "mapbox-empty-geometry"),
        pointsUsedCount: downsampled.points.length,
        discardedPointCount: prepared.discardedPointCount + downsampled.discardedPointCount,
        matchedPointCount: 0,
        chunkCount,
        usedFallback: true,
      fallbackReason: "empty-geometry",
    };
  }

  return {
    segment: {
      attendanceId: segment.attendanceId || null,
      checkInAt: segment.checkInAt || null,
      checkOutAt: segment.checkOutAt || null,
      breakReason: segment.breakReason || null,
      source: "mapbox" as const,
      rawTrackPoints: segment.trackPoints,
      matchedTracePoints,
      routeGeometry,
      mapboxChunks,
    },
    pointsUsedCount: downsampled.points.length,
    discardedPointCount: discardedPointCount + downsampled.discardedPointCount,
    matchedPointCount,
    chunkCount,
    usedFallback: false,
    fallbackReason: null,
  };
}

async function connectMatchedGeometrySegments(input: {
  matchedSegments: ReplayMatchedSegment[];
  token: string;
  profile: string;
}) {
  const mapboxSegments = input.matchedSegments
    .filter((segment) => segment.source === "mapbox" && segment.routeGeometry.length >= 2)
    .map((segment) => segment.routeGeometry.slice());

  if (mapboxSegments.length <= 1) {
    return mapboxSegments;
  }

  const connectedSegments: number[][][] = [mapboxSegments[0]];

  for (let index = 1; index < mapboxSegments.length; index += 1) {
    const currentSegment = mapboxSegments[index];
    const previousSegment = connectedSegments[connectedSegments.length - 1];
    const previousEnd = previousSegment[previousSegment.length - 1];
    const currentStart = currentSegment[0];

    const bridgeGeometry = await fetchDirectionsBridge(input.token, input.profile, previousEnd, currentStart);
    if (bridgeGeometry && bridgeGeometry.length >= 2) {
      const bridged = mergeCoordinates(previousSegment, bridgeGeometry);
      connectedSegments[connectedSegments.length - 1] = mergeCoordinates(bridged, currentSegment);
      continue;
    }

    connectedSegments.push(currentSegment);
  }

  return connectedSegments;
}

async function fetchMapboxChunkWithSplitting(
  token: string,
  profile: string,
  points: PreparedReplayPoint[]
): Promise<MapboxChunkResult | null> {
  const result = await fetchMapboxChunkDetailed(token, profile, points);
  if (result.ok) {
    return result.data;
  }

  const shouldSplit =
    points.length > 2 &&
    result.failure.code === "InvalidInput" &&
    result.failure.message?.includes("too far away from each other");

  if (!shouldSplit) {
    return null;
  }

  const midpoint = Math.ceil(points.length / 2);
  const leftPoints = points.slice(0, midpoint);
  const rightPoints = points.slice(Math.max(0, midpoint - 1));
  const leftResult = await fetchMapboxChunkWithSplitting(token, profile, leftPoints);
  const rightResult = await fetchMapboxChunkWithSplitting(token, profile, rightPoints);

  if (!leftResult || !rightResult) {
    return leftResult || rightResult || null;
  }

  return {
    routeGeometry: mergeCoordinates(leftResult.routeGeometry, rightResult.routeGeometry),
    matchedTracePoints: [
      ...leftResult.matchedTracePoints,
      ...rightResult.matchedTracePoints.slice(1),
    ],
    matchedPointCount: leftResult.matchedPointCount + rightResult.matchedPointCount,
    discardedPointCount: leftResult.discardedPointCount + rightResult.discardedPointCount,
    chunkCount: leftResult.chunkCount + rightResult.chunkCount,
    originalPayload: {
      code: "Ok",
      matchings: [...leftResult.originalPayload.matchings, ...rightResult.originalPayload.matchings],
      tracepoints: [...leftResult.originalPayload.tracepoints, ...rightResult.originalPayload.tracepoints.slice(1)],
      request: {
        method: leftResult.originalPayload.request.method,
        coordinatesCount: points.length,
      },
    },
  };
}

async function fetchDirectionsBridge(
  token: string,
  profile: string,
  start: number[],
  end: number[]
): Promise<number[][] | null> {
  const coordinates = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `${MAPBOX_DIRECTIONS_API_BASE}/${profile}/${coordinates}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      console.warn("[MapboxReplayMatchingService] directions bridge failed", {
        profile,
        status: response.status,
        code: payload?.code,
        message: payload?.message,
      });
      return null;
    }

    const route = Array.isArray(payload?.routes) ? (payload.routes[0] as DirectionsApiRoute | undefined) : undefined;
    const geometry = Array.isArray((route?.geometry as any)?.coordinates)
      ? ((route?.geometry as any).coordinates as number[][])
      : typeof route?.geometry === "string"
        ? decodePolyline(route.geometry)
        : [];

    return geometry.length >= 2 ? geometry : null;
  } catch (error) {
    console.warn("[MapboxReplayMatchingService] directions bridge request failed", {
      profile,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function buildDisplayGeometry(input: {
  token: string;
  profile: string;
  rawTrackPoints: ReplayTrackPoint[];
}): Promise<number[][]> {
  const prepared = dedupeConsecutivePoints(input.rawTrackPoints);
  const downsampled = downsamplePreparedPoints(
    prepared.points,
    MAPBOX_DIRECTIONS_TARGET_SAMPLE_SECONDS
  );
  const spatiallyFiltered = thinSpatialNoise(downsampled.points);
  const collapsedStops = collapseStationaryClusters(spatiallyFiltered.points);
  const chunks = chunkDirectionsPoints(collapsedStops.points);
  let displayGeometry: number[][] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const coordinates = chunk.map((point) => `${point.lng},${point.lat}`).join(";");
    const url = `${MAPBOX_DIRECTIONS_API_BASE}/${input.profile}/${coordinates}?geometries=geojson&overview=full&access_token=${encodeURIComponent(input.token)}`;

    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) {
        console.warn("[MapboxReplayMatchingService] directions display chunk failed", {
          profile: input.profile,
          chunkIndex: index,
          status: response.status,
          code: payload?.code,
          message: payload?.message,
          coordinatesCount: chunk.length,
        });
        continue;
      }

      const route = Array.isArray(payload?.routes)
        ? (payload.routes[0] as DirectionsApiRoute | undefined)
        : undefined;
      const geometry = Array.isArray((route?.geometry as any)?.coordinates)
        ? ((route?.geometry as any).coordinates as number[][])
        : typeof route?.geometry === "string"
          ? decodePolyline(route.geometry)
          : [];

      console.log("[MapboxReplayMatchingService] directions display chunk result", {
        profile: input.profile,
        chunkIndex: index,
        coordinatesCount: chunk.length,
        routesCount: Array.isArray(payload?.routes) ? payload.routes.length : 0,
        geometryPoints: geometry.length,
        firstCoordinate: geometry[0] || null,
        lastCoordinate: geometry[geometry.length - 1] || null,
      });

      if (geometry.length >= 2) {
        displayGeometry = mergeCoordinates(displayGeometry, geometry);
      }
    } catch (error) {
      console.warn("[MapboxReplayMatchingService] directions display chunk request failed", {
        profile: input.profile,
        chunkIndex: index,
        message: error instanceof Error ? error.message : String(error),
        coordinatesCount: chunk.length,
      });
      continue;
    }
  }

  return displayGeometry;
}

export async function buildReplayMatchingResult(input: {
  segments: ReplaySegmentInput[];
  profile?: string;
}): Promise<ReplayMatchingResult> {
  const profile = input.profile || process.env.MAPBOX_MAP_MATCHING_PROFILE || MAPBOX_MATCHING_DEFAULT_PROFILE;
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || "";
  const rawTrackPoints = input.segments.flatMap((segment) => segment.trackPoints);
  const displayGapResult = splitTrackPointsByTimeGap(rawTrackPoints);
  const fallbackReasons = new Set<string>();
  const matchedSegments: ReplayMatchedSegment[] = input.segments.map((segment) =>
    buildRawSegment(segment, token ? "directions-display-geometry" : "missing-mapbox-token")
  );
  const matchedGeometry: number[][][] = [];
  const displayGeometrySegments = token
    ? (
        await Promise.all(
          displayGapResult.chunks.map((trackPointChunk) =>
            buildDisplayGeometry({
              token,
              profile,
              rawTrackPoints: trackPointChunk,
            })
          )
        )
      ).filter((segment) => segment.length >= 2)
    : [];
  const displayGeometry = displayGeometrySegments.reduce(
    (coordinates, segment) => mergeCoordinates(coordinates, segment),
    [] as number[][]
  );
  const fallbackUsed = displayGeometrySegments.length === 0;
  if (!token) {
    fallbackReasons.add("missing-mapbox-token");
  } else if (fallbackUsed) {
    fallbackReasons.add("directions-empty-geometry");
  }
  const pointsUsedCount = rawTrackPoints.length;
  const discardedPointCount = 0;
  const matchedPointCount = 0;
  const chunkCount = Math.max(0, chunkDirectionsPoints(dedupeConsecutivePoints(rawTrackPoints).points).length);
  const tracepoints = matchedSegments.flatMap((segment) => segment.matchedTracePoints);
  const rawDistanceMeters = input.segments.reduce(
    (total, segment) => total + computeTrackDistanceMeters(segment.trackPoints),
    0
  );
  const matchedDistanceMeters = displayGeometrySegments.reduce(
    (total, segment) =>
      total +
      computeTrackDistanceMeters(
        segment.map((coordinate) => ({
          lng: coordinate[0],
          lat: coordinate[1],
        }))
      ),
    0
  );

  console.log("[MapboxReplayMatchingService] display geometry built", {
    profile,
    rawPointCount: rawTrackPoints.length,
    displayGeometryPoints: displayGeometry.length,
    displayGeometrySegments: displayGeometrySegments.length,
    displayGaps: displayGapResult.gaps.length,
    firstCoordinate: displayGeometry[0] || null,
    lastCoordinate: displayGeometry[displayGeometry.length - 1] || null,
    fallbackUsed,
    fallbackReasons: Array.from(fallbackReasons),
  });

  return {
    rawTrackPoints,
    matchedGeometry,
    displayGeometry,
    displayGeometrySegments,
    displayGaps: displayGapResult.gaps,
    matchedSegments,
    tracepoints,
    matchingMeta: {
      provider: "mapbox",
      profile,
      chunkCount,
      fallbackUsed,
      fallbackReasons: Array.from(fallbackReasons),
      pointsUsedCount,
      discardedPointCount,
      matchedPointCount,
    },
    summary: {
      rawPointCount: rawTrackPoints.length,
      pointsUsedCount,
      discardedPointCount,
      matchedPointCount,
      rawDistanceMeters,
      matchedDistanceMeters,
    },
  };
}

export function mapPingToReplayTrackPoint(ping: Pick<
  WorkerLocationPing,
  "id" | "latitude" | "longitude" | "recordedAt" | "isInsideSite" | "accuracyMeters"
>): ReplayTrackPoint {
  return {
    id: ping.id,
    lat: ping.latitude,
    lng: ping.longitude,
    timestamp: ping.recordedAt.toISOString(),
    presence: ping.isInsideSite ? "inside-site" : "outside-site",
    accuracyMeters: ping.accuracyMeters,
  };
}
