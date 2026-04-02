// src/controllers/quickbooks/util/http/qboGraphQL.ts
import axios, { AxiosError, AxiosInstance } from 'axios';

type Tokens = { access: string; refresh: string; realmId: string };
type TokenProvider = () => Promise<Tokens>;
type TokenSaver = (t: { access: string; refresh?: string; expiresAt?: Date }) => Promise<void>;
type RefreshFn = (refreshToken: string) => Promise<
  | { ok: true; access: string; refresh?: string; expiresAt?: Date }
  | { ok: false; error: string }
>;

type QboGraphQLClientOptions = {
  getTokens: TokenProvider;
  saveTokens: TokenSaver;
  refreshTokens: RefreshFn;
  timeoutMs?: number;
  maxRetries?: number;
  baseURL?: string;
};

/**
 * Creates a QuickBooks GraphQL client with built-in:
 * - Authentication and auto token refresh
 * - Rate limiting with retry on 429/503
 * - Proper GraphQL request formatting
 */
export function makeQboGraphQLClient(opts: QboGraphQLClientOptions): AxiosInstance {
  const {
    getTokens,
    saveTokens,
    refreshTokens,
    timeoutMs = 30_000,
    maxRetries = 3,
    baseURL = 'https://qb.api.intuit.com/graphql',
  } = opts;

  const api = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Prevent concurrent refresh attempts
  let refreshingPromise: Promise<void> | null = null;

  // Track refresh and retry attempts per request config
  const didRefresh = new WeakSet<object>();
  const retryCount = new WeakMap<object, number>();

  // REQUEST interceptor: inject Authorization and companyId query param
  api.interceptors.request.use(async (cfg) => {
    const { access, realmId } = await getTokens();
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${access}`;

    const original = cfg.url ?? '';
    const [pathPart, queryPart] = original.split('?');
    const search = new URLSearchParams(queryPart ?? '');

    // Add companyId as query parameter (required for GraphQL)
    search.set('companyId', realmId);

    cfg.url = pathPart + (search.toString() ? `?${search.toString()}` : '');
    return cfg;
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function computeDelay(err: AxiosError, attempt: number) {
    const ra = err.response?.headers?.['retry-after'];
    let base = 0;
    if (ra) {
      const n = Number(ra);
      if (!Number.isNaN(n)) base = n * 1000;
      else {
        const t = new Date(ra).getTime() - Date.now();
        if (t > 0) base = t;
      }
    }
    const backoff = 250 * Math.pow(2, attempt);
    return Math.min(30_000, base + backoff);
  }

  // RESPONSE interceptor: handle token refresh and rate limiting
  api.interceptors.response.use(
    (res) => res,
    async (err: AxiosError) => {
      const status = err.response?.status;
      const cfg = err.config;

      if (!cfg || !cfg.method) throw err;

      // 1) 401 -> attempt token refresh ONCE per config
      if (status === 401 && !didRefresh.has(cfg)) {
        didRefresh.add(cfg);

        if (!refreshingPromise) {
          refreshingPromise = (async () => {
            const { refresh } = await getTokens();
            const r = await refreshTokens(refresh);
            if (!r.ok) {
              refreshingPromise = null;
              throw new Error(`Token refresh failed: ${r.error}`);
            }
            await saveTokens({ access: r.access, refresh: r.refresh, expiresAt: r.expiresAt });
            refreshingPromise = null;
          })();
        }

        await refreshingPromise;
        return api.request(cfg);
      }

      // 2) 429/503 -> Retry-After + exponential backoff, up to maxRetries
      if (status === 429 || status === 503) {
        const current = retryCount.get(cfg) ?? 0;
        if (current < maxRetries) {
          const delay = computeDelay(err, current);
          retryCount.set(cfg, current + 1);
          await sleep(delay);
          return api.request(cfg);
        }
      }

      throw err;
    }
  );

  return api;
}
