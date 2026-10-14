import { decodeProtectedHeader, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/** The three OAuth protected resources. A token for one is never accepted at another. */
export type ResourceKind = 'mcp' | 'cli' | 'local-control';

export const DEFAULT_SCOPES = ['user:org:read', 'agileflow:read'] as const;
export const OPTIONAL_SCOPES = [
  'agileflow:notes:write',
  'agileflow:work:write',
  'agileflow:runs:write',
  'agileflow:controls:request',
] as const;
export const LOCAL_SCOPES = ['agileflow:local:observe', 'agileflow:local:apply'] as const;

/** Scopes each resource may advertise. */
export const RESOURCE_SCOPES: Record<ResourceKind, readonly string[]> = {
  mcp: [...DEFAULT_SCOPES, ...OPTIONAL_SCOPES],
  cli: [...DEFAULT_SCOPES, ...OPTIONAL_SCOPES],
  'local-control': ['user:org:read', ...LOCAL_SCOPES],
};

export interface AuthConfig {
  /** Exact issuer of the trusted Clerk instance (e.g. https://clerk.example.com). */
  issuer: string;
  /** Keys of the trusted instance only; never derived from an unverified token. */
  keys: JWTVerifyGetKey;
  /** Canonical resource URIs; each is the exact required `aud`. */
  resources: Record<ResourceKind, string>;
  /** Origins allowed as `azp` on dashboard session tokens. */
  sessionAuthorizedParties: string[];
  clockToleranceSec?: number;
  algorithms?: string[];
  /**
   * `exact` (default, the spec): `aud` must be present and contain the canonical resource.
   * `exact-or-client-bound`: for identity providers that omit `aud` on public-client tokens (Clerk,
   * measured 2026-10-13): a present `aud` must still match exactly; an absent `aud` is accepted only
   * with `audienceBound: false`, and the caller MUST then prove the endpoint by client binding.
   */
  audience?: 'exact' | 'exact-or-client-bound';
}

/** An organization-bound OAuth access token, verified for one resource. */
export interface TokenPrincipal {
  kind: 'token';
  issuer: string;
  userId: string;
  orgId: string;
  clientId: string;
  resource: ResourceKind;
  resourceUri: string;
  scopes: ReadonlySet<string>;
  /** false only in `exact-or-client-bound` mode when the token had no `aud`: the endpoint must be proven by client binding. */
  audienceBound: boolean;
}

/** A verified Clerk dashboard session with an active organization. */
export interface SessionPrincipal {
  kind: 'session';
  issuer: string;
  userId: string;
  sessionId: string;
  /** Null when the session has no active organization (onboarding only). */
  orgId: string | null;
  orgRole: 'admin' | 'member' | null;
}

export type Principal = TokenPrincipal | SessionPrincipal;

/** Authentication failed: maps to HTTP 401 with a Bearer challenge. Messages never include the token. */
export class AuthError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const AT_JWT_TYPES = new Set(['at+jwt', 'application/at+jwt']);

function baseOptions(config: AuthConfig) {
  return {
    issuer: config.issuer,
    clockTolerance: config.clockToleranceSec ?? 30,
    algorithms: config.algorithms ?? ['RS256', 'ES256'],
    requiredClaims: ['exp', 'iat', 'sub'],
  };
}

function header(token: string) {
  try {
    return decodeProtectedHeader(token);
  } catch {
    throw new AuthError('malformed', 'The access token is malformed.');
  }
}

async function verify(token: string, config: AuthConfig, audience?: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, config.keys, { ...baseOptions(config), ...(audience ? { audience } : {}) });
    return payload;
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'invalid';
    // jose error messages can echo claim values but never the token itself.
    throw new AuthError(code, `The access token was rejected (${code}).`);
  }
}

/** Space-delimited `scope` (RFC 9068) or array `scp`; both normalized. */
export function normalizeScopes(payload: JWTPayload): Set<string> {
  const out = new Set<string>();
  const raw = payload.scope ?? payload.scp;
  if (typeof raw === 'string') for (const s of raw.split(/\s+/)) if (s) out.add(s);
  if (Array.isArray(raw)) for (const s of raw) if (typeof s === 'string' && s) out.add(s);
  return out;
}

function orgIdOf(payload: JWTPayload): string | null {
  if (typeof payload.org_id === 'string' && payload.org_id) return payload.org_id;
  const o = payload.o as { id?: unknown } | undefined;
  if (o && typeof o.id === 'string' && o.id) return o.id;
  return null;
}

/**
 * Verify an OAuth access token for `resource`: signature under the trusted
 * keys, `at+jwt` type, exact issuer, `aud` containing the exact canonical
 * resource, valid times, subject, client, organization. Missing organization
 * fails closed; nothing falls back to a browser or tool-argument organization.
 */
export async function verifyAccessToken(token: string, resource: ResourceKind, config: AuthConfig): Promise<TokenPrincipal> {
  const typ = header(token).typ?.toLowerCase();
  if (!typ || !AT_JWT_TYPES.has(typ)) throw new AuthError('token_type', 'Only OAuth access tokens (at+jwt) are accepted here.');
  const resourceUri = config.resources[resource];
  let audienceBound = true;
  let payload: JWTPayload;
  if (config.audience === 'exact-or-client-bound') {
    // Verify signature, issuer, and times first; then apply the audience rule explicitly.
    payload = await verify(token, config);
    if (payload.aud === undefined) audienceBound = false;
    else {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(resourceUri)) throw new AuthError('ERR_JWT_CLAIM_VALIDATION_FAILED', 'The access token was rejected (audience).');
    }
  } else {
    payload = await verify(token, config, resourceUri);
  }
  if (payload.sid !== undefined) throw new AuthError('token_type', 'Session tokens are not accepted here.');
  const clientId = payload.client_id ?? payload.azp;
  if (typeof clientId !== 'string' || !clientId) throw new AuthError('client', 'The access token names no client.');
  const orgId = orgIdOf(payload);
  if (!orgId) throw new AuthError('organization', 'The access token is not bound to an organization.');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthError('subject', 'The access token names no user.');
  return {
    kind: 'token',
    issuer: config.issuer,
    userId: payload.sub,
    orgId,
    clientId,
    resource,
    resourceUri,
    scopes: normalizeScopes(payload),
    audienceBound,
  };
}

/** Clerk session token (v1 `org_id`/`org_role` or v2 `o.id`/`o.rol`). */
export async function verifySessionToken(token: string, config: AuthConfig): Promise<SessionPrincipal> {
  const typ = header(token).typ?.toLowerCase();
  if (typ && AT_JWT_TYPES.has(typ)) throw new AuthError('token_type', 'OAuth access tokens cannot open a dashboard session.');
  const payload = await verify(token, config);
  if (typeof payload.sid !== 'string' || !payload.sid) throw new AuthError('token_type', 'Not a session token.');
  if (typeof payload.azp === 'string' && !config.sessionAuthorizedParties.includes(payload.azp)) {
    throw new AuthError('azp', 'The session was issued for another origin.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthError('subject', 'The session names no user.');
  const orgId = orgIdOf(payload);
  const o = payload.o as { rol?: unknown } | undefined;
  const rawRole = (typeof payload.org_role === 'string' ? payload.org_role : typeof o?.rol === 'string' ? o.rol : null) as string | null;
  const orgRole = rawRole === null ? null : rawRole.replace(/^org:/, '') === 'admin' ? 'admin' : 'member';
  return { kind: 'session', issuer: config.issuer, userId: payload.sub, sessionId: payload.sid, orgId, orgRole: orgId ? orgRole : null };
}

/** Pull a bearer credential. `present` distinguishes "no header" from "an empty or malformed one". */
export function bearerFrom(authorization: string | undefined | null): { present: boolean; token: string | null } {
  if (authorization === undefined || authorization === null) return { present: false, token: null };
  const m = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)\s*$/.exec(authorization);
  return { present: true, token: m ? m[1]! : null };
}
