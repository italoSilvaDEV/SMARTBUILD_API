// src/controllers/quickbooks/util/http/qbohttp.ts
import axios, { AxiosError, AxiosInstance } from 'axios';

type Tokens = { access: string; refresh: string; realmId: string };
type TokenProvider = () => Promise<Tokens>;
type TokenSaver = (t: { access: string; refresh?: string; expiresAt?: Date }) => Promise<void>;
type RefreshFn = (refreshToken: string) => Promise<
  | { ok: true; access: string; refresh?: string; expiresAt?: Date }
  | { ok: false; error: string }
>;

type QboClientOptions = {
  getTokens: TokenProvider;
  saveTokens: TokenSaver;
  refreshTokens: RefreshFn;
  timeoutMs?: number;
  maxRetries?: number; // para 429/503
  baseURL?: string;
};

export function makeQboClient(opts: QboClientOptions): AxiosInstance {
  const {
    getTokens,
    saveTokens,
    refreshTokens,
    timeoutMs = 30_000,
    maxRetries = 3,
    baseURL = 'https://quickbooks.api.intuit.com/v3/company',
  } = opts;

  const api = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { Accept: 'application/json' },
  });

  // Evita tempestade de refresh: apenas 1 refresh por vez
  let refreshingPromise: Promise<void> | null = null;

  // Em vez de mexer no tipo do Axios, guardamos estado paralelo:
  const didRefresh = new WeakSet<object>();              // marca configs que já refrescaram
  const retryCount = new WeakMap<object, number>();      // conta retries por config

  // REQUEST: injeta Authorization e minorversion=75 e prefixa realmId se necessário
  api.interceptors.request.use(async (cfg) => {
    const { access, realmId } = await getTokens();
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${access}`;

    const original = cfg.url ?? '';
    const [pathPart, queryPart] = original.split('?');
    const search = new URLSearchParams(queryPart ?? '');
    search.set('minorversion', '75');

    // prefixa /{realmId} se ainda não houver
    const pathStartsWithRealm = pathPart.startsWith(`/${realmId}/`);
    const pathToUse = pathStartsWithRealm ? pathPart : `/${realmId}${pathPart}`;

    cfg.url = `${pathToUse}?${search.toString()}`;
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
    const backoff = 250 * Math.pow(2, attempt); // 250ms, 500ms, 1s...
    return Math.min(30_000, base + backoff);
  }

  // RESPONSE: auto-refresh (401) + retry/backoff (429/503)
  api.interceptors.response.use(
    (res) => res,
    async (err: AxiosError) => {
      const status = err.response?.status;
      const cfg = err.config;

      if (!cfg || !cfg.method) throw err;

      // 1) 401 -> tenta refresh UMA vez por config
      if (status === 401 && !didRefresh.has(cfg)) {
        didRefresh.add(cfg);

        if (!refreshingPromise) {
          refreshingPromise = (async () => {
            const { refresh } = await getTokens();
            const r = await refreshTokens(refresh);
            if (!r.ok) {
              refreshingPromise = null;
              throw new Error(`Refresh failed: ${r.error}`);
            }
            await saveTokens({ access: r.access, refresh: r.refresh, expiresAt: r.expiresAt });
            refreshingPromise = null;
          })();
        }

        await refreshingPromise;
        return api.request(cfg);
      }

      // 2) 429/503 -> Retry-After + backoff, até maxRetries
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
