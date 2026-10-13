# Stage 0: real-world interoperability gate

The development issuer (`AGILEFLOW_DEV_AUTH=1`) runs the same verification code as production, but it is not evidence that Clerk is compatible. This gate needs a real Clerk development instance and a person at a browser.

## 0. Domains

| Host | Serves |
|---|---|
| `agileflow.projectquestorg.com` | Marketing site (apps/website) |
| `app.agileflow.projectquestorg.com` | This service: dashboard, `/mcp`, `/cli`, `/local-control`, `/webhooks/clerk`, `/.well-known/*` (`AGILEFLOW_PUBLIC_URL`) |
| `clerk.agileflow.projectquestorg.com` | Clerk Frontend API (production custom domain, CNAME from the Clerk dashboard; `CLERK_ISSUER` / `CLERK_FRONTEND_API`) |

The OAuth audiences are therefore `https://app.agileflow.projectquestorg.com/mcp`, `/cli` and `/local-control`. The plugin, the CLI default (`agileflow cloud login` with no `--service`), and the Codex/Cursor snippets already point at this origin.

## 1. Configure Clerk

1. Create a Clerk application and enable **Organizations** (membership required).
2. **OAuth applications:** create first-party public clients (PKCE) for the CLI and for the companion. Allow loopback redirect URIs (`http://127.0.0.1/*`). Enable dynamic client registration or CIMD for MCP clients.
3. **Custom scopes:** `agileflow:read`, `agileflow:notes:write`, `agileflow:work:write`, `agileflow:runs:write`, `agileflow:controls:request`, `agileflow:local:observe`, `agileflow:local:apply`. Access tokens must be JWT (`at+jwt`) and include `org_id`.
4. **Webhook:** point it at `<service>/webhooks/clerk` with membership, organization and user events.
5. Fill in `apps/cloud/.env` from `.env.example`, then run `docker compose -f apps/cloud/docker-compose.yml up --build`.

## 2. Run the harness

```bash
AGILEFLOW_SERVICE=<url> STAGE0_MCP_READ_TOKEN=... STAGE0_MCP_WRITE_TOKEN=... \
STAGE0_CLI_TOKEN=... STAGE0_PROJECT_ID=... npx tsx apps/cloud/scripts/stage0.ts > stage0-results.json
```

Get the tokens through real flows:
- `agileflow cloud login --service <url>` for the CLI token. Add `--scope agileflow:work:write` for writes.
- The MCP read and write tokens come from a client's consent, or from a manual authorization-code request against Clerk.

Checked against the dev server on 2026-10-13: the discovery and anonymous-rejection checks passed; the real-token checks were skipped.

## 3. Client matrix

Run on 2026-10-13 against a local service with the development authorization server (`AGILEFLOW_DEV_AUTH=1`), not Clerk. These results show client-side OAuth and MCP behavior; repeat them against Clerk.

| Client | Version | Registration | Consent | Default scopes | Write step-up | Refresh | Tool calls | Error display | Result |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code | 2.1.296 | DCR (automatic) | S256 PKCE, `resource` sent, loopback callback | Requested every advertised scope until metadata was fixed to list only the minimum; now `user:org:read agileflow:read` | 403 `insufficient_scope` shown as "run /mcp to re-authenticate"; re-auth requested exactly `+agileflow:notes:write`; retried note succeeded | not exercised | 22 tools listed with read-only annotations; context, work_get, note_add | Clear, no retry loop | pass (dev issuer) |
| Codex | 0.160.0 | DCR (automatic) | S256 PKCE, `resource` sent, loopback callback | As requested with `--scopes` | 403 `insufficient_scope` reported as "Insufficient scope" | Refreshes on expiry and stores the new token (debug log); call after 60 s token expiry succeeded | context, work_get, note_add | Raw transport error text | pass (dev issuer) |
| Cursor | | | | | | | | | not run (not installed here) |
| agileflow CLI | 5.0.0-alpha.1 | first-party | tested in `apps/cli/test/integration/cloud.test.ts` | minimum | `--scope` | yes (test) | yes | yes | pass (dev issuer) |
| Companion (Linux x64) | 5.0.0-alpha.1 | first-party | tested in the CLI integration test | observe; apply opt-in | n/a | yes | n/a | n/a | pass (dev issuer); macOS not run |

Findings from these runs:
- **Fixed:** Claude Code requests every scope in `scopes_supported`. The `/mcp` and `/cli` metadata now list only the default scopes (optional scopes appear under `agileflow_optional_scopes`), and write access comes through the step-up challenge.
- **Fixed:** Codex tries RFC 8414 path-inserted discovery first. The dev server now serves `/.well-known/oauth-authorization-server/dev`. Clerk issuers have no path, so production is unaffected.
- **Client behavior, not a service bug:** Codex refreshes any token with less than about 15 seconds left. Lifetimes at or below that cause a refresh loop. Clerk access tokens last far longer.

If a gate fails, change the adapter or narrow the supported set. Never weaken the audience or organization checks.
