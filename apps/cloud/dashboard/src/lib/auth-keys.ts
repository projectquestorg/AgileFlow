export const TOKEN_KEY = 'af.token';
export const IDENT_KEY = 'af.identity';
export const RETURN_KEY = 'af.return';
export const EXPIRED_KEY = 'af.expired';

/** Clerk Frontend API host from discovery; set at boot. */
let frontendApi: string | null = null;
export function setClerkFrontendApi(host: string | null) {
  frontendApi = host;
}

/**
 * Where Clerk asked to continue after sign-in (for example an OAuth authorize
 * request from the CLI). Only this origin or the Clerk Frontend API is allowed.
 */
export function externalContinueUrl(): string | null {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? location.search);
  const raw = q.get('redirect_url');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.origin === location.origin) return null; // In-app returns use RETURN_KEY.
    if (u.protocol === 'https:' && frontendApi && u.host === frontendApi) return u.href;
  } catch {
    /* ignore malformed */
  }
  return null;
}
