// Build app.agileflow.projectquestorg.com for Vercel (Build Output API v3).
// Vercel serves only the static dashboard; every service path is proxied to the
// Convex deployment's HTTP actions (CONVEX_SITE_URL, e.g. https://<name>.convex.site),
// so the dashboard, /mcp, /cli, /local-control, and webhooks share one origin.
//   CONVEX_SITE_URL=https://<name>.convex.site node apps/cloud/scripts/vercel-build.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cloud = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(cloud, '../..');
// Vercel reads Build Output API files from <project root directory>/.vercel/output. The
// agileflow-dashboard project's Root Directory is the repository root, so write there.
const out = path.join(process.env.AGILEFLOW_OUTPUT_ROOT ?? repo, '.vercel/output');

const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(site) && !/^https:\/\/[a-z0-9.-]+$/.test(site)) {
  throw new Error('Set CONVEX_SITE_URL to the Convex deployment HTTP actions URL (https://<name>.convex.site).');
}
const clerkHost = process.env.CLERK_FRONTEND_API ?? 'clerk.agileflow.projectquestorg.com';
if (!/^[a-z0-9.-]+$/i.test(clerkHost)) throw new Error(`Invalid CLERK_FRONTEND_API: ${clerkHost}`);

execFileSync('npm', ['run', 'build', '-w', 'apps/cloud/dashboard'], { cwd: repo, stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(cloud, 'src/dashboard/public'), path.join(out, 'static'), { recursive: true });

const csp = [
  "default-src 'self'",
  `script-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://${clerkHost}`,
  `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://${clerkHost}`,
  "img-src 'self' data: https://img.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

const config = {
  version: 3,
  routes: [
    // Service paths: proxied to Convex HTTP actions (path and query preserved).
    { src: '^/(mcp|healthz)$', dest: `${site}/$1` },
    { src: '^/(api|cli|local-control|webhooks)/(.*)$', dest: `${site}/$1/$2` },
    { src: '^/\\.well-known/(.*)$', dest: `${site}/.well-known/$1` },
    // Dashboard: strict CSP; HTML never cached, hashed assets immutable.
    { src: '^/(index\\.html)?$', headers: { ...security, 'Content-Security-Policy': csp, 'Cache-Control': 'no-cache' }, continue: true },
    { src: '^/assets/(.*)$', headers: { ...security, 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
  ],
};
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log(`vercel output: static dashboard; service paths -> ${site}`);
