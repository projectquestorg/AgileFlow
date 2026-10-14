export const TOKEN_KEY = 'af.token';
export const IDENT_KEY = 'af.identity';
export const RETURN_KEY = 'af.return';
export const EXPIRED_KEY = 'af.expired';

/** Clerk Frontend API host from discovery; set at boot. */
let frontendApi: string | null = null;
export function setClerkFrontendApi(host: string | null) {
  frontendApi = host;
}

const CONTINUE_KEY = 'af.continue';
const CONTINUE_TTL_MS = 15 * 60 * 1000;

/**
 * Move Clerk's `redirect_url` (for example a CLI OAuth authorize request) off the address
 * before Clerk loads, so Clerk does not act on it while signed out; keep it for this tab.
 */
export function captureContinueUrl() {
  const [hashPath, hashQuery] = location.hash.split('?');
  const search = new URLSearchParams(location.search);
  const inHash = new URLSearchParams(hashQuery ?? '');
  const raw = search.get('redirect_url') ?? inHash.get('redirect_url');
  if (!raw) return;
  sessionStorage.setItem(CONTINUE_KEY, JSON.stringify({ url: raw, at: Date.now() }));
  search.delete('redirect_url');
  inHash.delete('redirect_url');
  const q = search.toString();
  const hq = inHash.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${hashPath}${hq ? `?${hq}` : ''}`);
}

/**
 * Where to continue after sign-in, if Clerk asked for it. Only the Clerk Frontend API is
 * allowed (in-app returns use RETURN_KEY); entries expire after 15 minutes.
 */
export function externalContinueUrl(): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CONTINUE_KEY) || 'null') as { url: string; at: number } | null;
    if (!v || Date.now() - v.at > CONTINUE_TTL_MS) return null;
    const u = new URL(v.url);
    if (u.protocol === 'https:' && frontendApi && u.host === frontendApi) return u.href;
  } catch {
    /* ignore malformed */
  }
  return null;
}

/** Continue the pending external request once; returns false when there is none. */
export function continueExternal(): boolean {
  const url = externalContinueUrl();
  sessionStorage.removeItem(CONTINUE_KEY);
  if (!url) return false;
  // Development instances carry the session in the URL (a no-op in production).
  const clerk = (window as { Clerk?: { buildUrlWithAuth?: (u: string) => string } }).Clerk;
  location.assign(clerk?.buildUrlWithAuth?.(url) ?? url);
  return true;
}
