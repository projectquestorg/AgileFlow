import { clerkMembershipSource, DevDirectory, type MembershipSource } from './auth/membership';
import type { AuthConfig } from './auth/verify';
import { configFromEnv, resourcesFor } from './config';
import { migrate } from './db/migrate';
import { openPostgres } from './db/pg';
import type { Db } from './db/sql';
import { DevIssuer } from './dev/issuer';
import { devOAuthRoutes } from './dev/oauth';
import { Services } from './domain/services';
import { createApp } from './http/app';

export interface Service {
  app: ReturnType<typeof createApp>;
  services: Services;
  db: Db;
  dev?: { issuer: DevIssuer; directory: DevDirectory };
}

/** Production/dev service from the environment. */
export async function serviceFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Service> {
  const cfg = configFromEnv(env);
  // PGlite is loaded only without DATABASE_URL (local runs); serverless bundles never need it.
  const db = env.DATABASE_URL ? await openPostgres(env.DATABASE_URL) : await (await import('./db/pglite')).openPglite(env.AGILEFLOW_PGLITE_DIR);
  await migrate(db);
  if (cfg.devAuth) return devService({ db, publicUrl: cfg.publicUrl, cursorSecret: cfg.cursorSecret, webhookSecret: cfg.clerk.webhookSecret });
  if (!cfg.clerk.secretKey) throw new Error('CLERK_SECRET_KEY is required to verify organization membership.');
  const membership: MembershipSource = clerkMembershipSource(cfg.clerk.secretKey, env.CLERK_API_URL);
  const services = new Services({ db, membership, cursorSecret: cfg.cursorSecret });
  const app = createApp({ ...cfg, services, auth: cfg.auth as AuthConfig, cronSecret: env.CRON_SECRET });
  return { app, services, db };
}

/** Development/test service: in-process Postgres and the dev OAuth issuer. */
export async function devService(o: { db?: Db; publicUrl?: string; cursorSecret?: string; webhookSecret?: string; now?: () => Date } = {}): Promise<Service & { dev: { issuer: DevIssuer; directory: DevDirectory } }> {
  const publicUrl = (o.publicUrl ?? 'http://localhost:8787').replace(/\/+$/, '');
  const db = o.db ?? (await (await import('./db/pglite')).openPglite());
  await migrate(db);
  const issuer = await DevIssuer.create(`${publicUrl}/dev`);
  const directory = new DevDirectory();
  const resources = resourcesFor(publicUrl);
  const services = new Services({ db, membership: directory, cursorSecret: o.cursorSecret ?? 'dev-cursor-secret', now: o.now });
  const auth: AuthConfig = { issuer: issuer.issuer, keys: issuer.keys, resources, sessionAuthorizedParties: [publicUrl] };
  const app = createApp({
    services,
    auth,
    publicUrl,
    authorizationServer: issuer.issuer,
    allowedOrigins: [publicUrl],
    devAuth: true,
    clerk: { webhookSecret: o.webhookSecret },
    cliClientId: 'agileflow-cli',
    companionClientId: 'agileflow-companion',
    devRoutes: devOAuthRoutes(issuer, directory, resources, publicUrl),
  });
  return { app, services, db, dev: { issuer, directory } };
}
