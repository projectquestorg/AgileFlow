# Deploying app.agileflow.projectquestorg.com (Clerk + Convex + Vercel)

| Piece | Runs on | What it does |
|---|---|---|
| Backend | Convex (`apps/cloud/convex`) | Database, all domain logic, HTTP actions for `/mcp`, `/cli`, `/local-control`, `/api`, `/webhooks/clerk`, `/.well-known/*`, crons |
| Dashboard | Vercel, static only (`scripts/vercel-build.mjs`) | Serves the React app and proxies the service paths to Convex, so everything shares `https://app.agileflow.projectquestorg.com` |
| Identity | Clerk (`clerk.agileflow.projectquestorg.com`) | Sign-in, Organizations, OAuth for agents, the CLI, and the companion |

## 1. Convex

```bash
cd apps/cloud
npx convex dev      # once: sign in and create the project (writes .env.local)
npx convex deploy   # production
```

Set these in the Convex dashboard (Settings > Environment Variables) for production:

| Variable | Value |
|---|---|
| `AGILEFLOW_PUBLIC_URL` | `https://app.agileflow.projectquestorg.com` |
| `CLERK_ISSUER` | `https://clerk.agileflow.projectquestorg.com` |
| `CLERK_SECRET_KEY` | Clerk > API keys |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API` | Clerk (dashboard sign-in) |
| `CLERK_WEBHOOK_SECRET` | the Clerk webhook endpoint |
| `AGILEFLOW_CURSOR_SECRET` | 32+ random bytes |
| `AGILEFLOW_CLI_CLIENT_ID`, `AGILEFLOW_COMPANION_CLIENT_ID` | Clerk OAuth application client IDs |

Never set `AGILEFLOW_DEV_AUTH` in production.

## 2. Clerk

Follow `STAGE0.md` section 1:
- Organizations
- OAuth applications for the CLI and the companion
- dynamic client registration for MCP clients
- the custom scopes
- a webhook to `https://app.agileflow.projectquestorg.com/webhooks/clerk`

## 3. Vercel (dashboard project)

- **Build:** root directory is the repository root, build command `node apps/cloud/scripts/vercel-build.mjs`, framework preset Other.
- **Environment:**
  - `CONVEX_SITE_URL=https://<deployment>.convex.site` (Convex dashboard > Settings > URL & Deploy Key, "HTTP Actions URL")
  - `CLERK_FRONTEND_API=clerk.agileflow.projectquestorg.com`
- **Domain:** add `app.agileflow.projectquestorg.com` to this project.

## 4. Verify

- **Production:** run `apps/cloud/scripts/stage0.ts` with `AGILEFLOW_SERVICE=https://app.agileflow.projectquestorg.com` and real tokens (see `STAGE0.md`).
- **Development deployment:** with `AGILEFLOW_DEV_AUTH=1` and keys from `scripts/convex-dev-keys.mjs`, `scripts/convex-e2e.mjs` runs 25 end-to-end checks: dashboard, a real MCP SDK client, scopes, token rejection, CLI, import/export, companion, and change feed. On 2026-10-13 all 25 passed against a local Convex backend.

## Local development

```bash
cd apps/cloud && CONVEX_AGENT_MODE=anonymous npx convex dev   # local backend on 127.0.0.1:3210/3211, no account
AGILEFLOW_API_URL=http://127.0.0.1:3211 npm run dev -w apps/cloud/dashboard
```
