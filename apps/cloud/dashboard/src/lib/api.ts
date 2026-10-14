// API client. Every request carries an explicit bearer token for this tab; cookies are never sent.

export interface ApiWarning {
  code: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  details: Record<string, any>;
  constructor(status: number, err?: { code?: string; message?: string; retryable?: boolean; [k: string]: any } | null) {
    super(err?.message || `Request failed (HTTP ${status}).`);
    this.status = status;
    this.code = err?.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'UPSTREAM_UNAVAILABLE');
    this.retryable = !!err?.retryable || status >= 500 || status === 0;
    this.details = err || {};
  }
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;
let unauthorizedHandler: () => void = () => {};

export function setTokenProvider(fn: TokenProvider) {
  tokenProvider = fn;
}
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

export const enc = encodeURIComponent;
export const newRequestId = () => crypto.randomUUID();

export interface Envelope<T = any> {
  ok: boolean;
  data: T;
  warnings?: ApiWarning[];
  [k: string]: any;
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<Envelope<T>> {
  const token = await tokenProvider();
  if (!token) {
    unauthorizedHandler();
    throw new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
  }
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'The service could not be reached. Check your connection and retry.', retryable: true });
  }
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) {
    unauthorizedHandler();
    throw new ApiError(401, json.error);
  }
  if (!res.ok || json.ok === false) throw new ApiError(res.status, typeof json.error === 'string' ? { message: json.error } : json.error);
  return json;
}

/** GET/mutation helpers that return `data`. */
export const get = async <T = any>(path: string): Promise<T> => (await api<T>('GET', path)).data;
export const send = async <T = any>(method: string, path: string, body?: unknown): Promise<T> => (await api<T>(method, path, body ?? {})).data;

/** Call an agent tool with the human session. Returns the full envelope ({data, warnings, ...}). */
export const tool = <T = any>(pid: string, name: string, args: Record<string, unknown> = {}) => api<T>('POST', `/api/projects/${enc(pid)}/tools/${name}`, args);

/** Follow nextCursor until hasMore is false (or the page cap is hit). */
export async function allPages<T = any>(pid: string, name: string, args: Record<string, unknown>, maxPages = 50): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const r = (await tool(pid, name, { ...args, ...(cursor ? { cursor } : {}), limit: 200 })).data;
    items.push(...r.items);
    if (!r.hasMore) return { items, complete: true };
    cursor = r.nextCursor;
  }
  return { items, complete: false };
}

/** Read a complete body, following content.contentCursor; restart if it changes mid-read. */
export async function fullContent(fetchPage: (cursor?: string) => Promise<Envelope>): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const first = (await fetchPage(undefined)).data;
      let body: string = first.content.body;
      let page = first.content;
      while (!page.complete && page.contentCursor) {
        page = (await fetchPage(page.contentCursor)).data.content;
        body += page.body;
      }
      return { ...first, content: { ...first.content, body, complete: true } };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') continue;
      throw err;
    }
  }
  throw new ApiError(409, { code: 'VERSION_CONFLICT', message: 'The content kept changing while loading. Try again.' });
}

export interface Discovery {
  service: string;
  resources: Record<string, string>;
  clients: { cli: string; companion: string };
  defaultScopes: Record<string, string[]>;
  dashboard: { devAuth: boolean; clerkPublishableKey: string | null; clerkFrontendApi: string | null };
  tools: Array<{ name: string; readOnly: boolean }>;
  minimumVersions: Record<string, string>;
}

let wellKnown: Promise<Discovery> | null = null;
export function discovery(): Promise<Discovery> {
  if (!wellKnown) {
    wellKnown = fetch('/.well-known/agileflow.json', { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    wellKnown.catch(() => (wellKnown = null));
  }
  return wellKnown;
}
