import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' };

/** Serves the dashboard single-page app with a strict Content Security Policy. */
export function dashboardRoutes(publicUrl: string, clerkFrontendApi?: string): Hono {
  // A Clerk production instance serves from its own subdomain (e.g. clerk.agileflow.projectquestorg.com).
  const clerk = clerkFrontendApi && /^[a-z0-9.-]+$/i.test(clerkFrontendApi) ? ` https://${clerkFrontendApi}` : '';
  const app = new Hono();
  app.get('/*', (c) => {
    const rel = c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\/+/, '');
    const file = path.join(DIR, rel);
    if (!file.startsWith(DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return c.notFound();
    c.header('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com${clerk}`,
        `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com${clerk}`,
        "img-src 'self' data: https://img.clerk.com",
        "style-src 'self' 'unsafe-inline'",
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    c.header('Cache-Control', 'no-cache');
    return c.body(fs.readFileSync(file));
  });
  void publicUrl;
  return app;
}
