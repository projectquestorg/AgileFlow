import { createRemoteJWKSet } from 'jose';
import type { AuthConfig, ResourceKind } from './auth/verify';

export interface ServiceConfig {
  publicUrl: string;
  auth: AuthConfig;
  /** OAuth authorization server advertised in protected-resource metadata. */
  authorizationServer: string;
  clerk: { publishableKey?: string; secretKey?: string; webhookSecret?: string; frontendApi?: string };
  cursorSecret: string;
  devAuth: boolean;
  /** First-party OAuth client IDs for the connected CLI and the companion. */
  cliClientId: string;
  companionClientId: string;
  allowedOrigins: string[];
}

export function resourcesFor(publicUrl: string): Record<ResourceKind, string> {
  const base = publicUrl.replace(/\/+$/, '');
  return { mcp: `${base}/mcp`, cli: `${base}/cli`, 'local-control': `${base}/local-control` };
}

/**
 * Production configuration from the environment. Every value that defines a
 * trust boundary (issuer, keys, audiences) is explicit; nothing is inferred
 * from request headers.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Omit<ServiceConfig, 'auth'> & { auth: Omit<AuthConfig, 'keys'> & { keys?: AuthConfig['keys'] } } {
  const publicUrl = (env.AGILEFLOW_PUBLIC_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
  const devAuth = env.AGILEFLOW_DEV_AUTH === '1';
  const issuer = devAuth ? `${publicUrl}/dev` : required(env, 'CLERK_ISSUER');
  const cursorSecret = env.AGILEFLOW_CURSOR_SECRET ?? (devAuth ? 'dev-cursor-secret' : required(env, 'AGILEFLOW_CURSOR_SECRET'));
  const jwksUrl = env.CLERK_JWKS_URL ?? `${issuer}/.well-known/jwks.json`;
  return {
    publicUrl,
    devAuth,
    authorizationServer: issuer,
    cursorSecret,
    clerk: { publishableKey: env.CLERK_PUBLISHABLE_KEY, secretKey: env.CLERK_SECRET_KEY, webhookSecret: env.CLERK_WEBHOOK_SECRET, frontendApi: env.CLERK_FRONTEND_API },
    cliClientId: env.AGILEFLOW_CLI_CLIENT_ID ?? 'agileflow-cli',
    companionClientId: env.AGILEFLOW_COMPANION_CLIENT_ID ?? 'agileflow-companion',
    allowedOrigins: [publicUrl, ...(env.AGILEFLOW_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])],
    auth: {
      issuer,
      // Keys come only from the configured instance, never from a token's claims.
      keys: devAuth ? undefined : createRemoteJWKSet(new URL(jwksUrl)),
      resources: resourcesFor(publicUrl),
      sessionAuthorizedParties: [publicUrl, ...(env.AGILEFLOW_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])],
    },
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} is required (or set AGILEFLOW_DEV_AUTH=1 for local development).`);
  return v;
}
