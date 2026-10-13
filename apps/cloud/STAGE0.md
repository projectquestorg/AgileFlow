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

Measured against Clerk on 2026-10-13 (details in `CLERK-ADAPTATION.md`):
- Clerk rejects custom scopes in OAuth app, default and dynamic-client scopes. The allowed set is `email`, `offline_access`, `openid`, `private_metadata`, `profile`, `public_metadata`, `user:org:read`.
- Public (PKCE) apps cannot set `audience_uri`, so their access tokens carry no `aud`. They are `at+jwt` with `org_id` and `client_id`.

The service therefore runs with `AGILEFLOW_CAPABILITY_SOURCE=grants`:
- Every client signs in with only `user:org:read offline_access`. A new connection is read-only, and its write capabilities (`notes:write`, `work:write`, `runs:write`, `controls:request`) are granted per connection by the organization owner in the dashboard; admins can only revoke.
- A token without `aud` is accepted only with client binding: the CLI client only at `/cli`, the companion only at `/local-control`, dynamically registered clients only at `/mcp`. A present `aud` must still match exactly.

Setup:
1. Enable **Organizations** (membership required), `aud_claim_enabled`, and dynamic client registration for MCP clients.
2. **OAuth applications:** public PKCE clients for the CLI and the companion, scopes `user:org:read offline_access`, loopback redirect `http://127.0.0.1/callback`. No device grant in production.
3. **Webhook:** `<service>/webhooks/clerk` with membership, organization and user events; the signing secret goes into the Convex environment as `CLERK_WEBHOOK_SECRET`.
4. Set the Convex environment (`CLERK_ISSUER`, `CLERK_FRONTEND_API`, client IDs, `AGILEFLOW_CAPABILITY_SOURCE=grants`; never `AGILEFLOW_DEV_AUTH` on a hosted deployment) and deploy.

## 2. Run the harness

```bash
AGILEFLOW_SERVICE=<url> STAGE0_MCP_READ_TOKEN=... STAGE0_MCP_WRITE_TOKEN=... \
STAGE0_CLI_TOKEN=... STAGE0_PROJECT_ID=... npx tsx apps/cloud/scripts/stage0.ts > stage0-results.json
```

Every token variable is optional; checks without one are recorded as skipped. The harness reads `capabilitySource` from discovery and expects specific rejections:

| Check | `scopes` mode | `grants` mode |
|---|---|---|
| Write without capability | HTTP 403, `insufficient_scope` challenge | HTTP 200 tool result, `isError`, `structuredContent.error.code` `CAPABILITY_REQUIRED` |
| CLI token at `/mcp` or `/local-control` | 401 (audience) | 403 `CLIENT_NOT_ALLOWED` (401 if the token carries an `aud`) |

Get the tokens through real flows:
- CLI token: `agileflow cloud login --service <url>`, or `python3 -I apps/cloud/scripts/stage0-pkce.py login` (stdlib only; 127.0.0.1 loopback receiver; token file `~/.af-probe/prod-cli-token.json`, mode 600; never prints tokens). Then run `stage0-pkce.py test` for read and rejection checks and `stage0-pkce.py refresh` for rotation. Both are read-only.
- MCP read token: a client's consent (Claude Code or Codex through DCR). MCP write token (grants mode): the same kind of connection after the owner grants `notes:write` in the dashboard. The write check adds a note to `STAGE0_PROJECT_ID`, so use a test project.

### Receipts

- 2026-10-13, production `https://app.agileflow.projectquestorg.com` (Convex `calm-marten-391` and Vercel `dpl_AqZ6DWU4PLWr7i6WMLMbDq9pKspv`, both from `cb6e03c4`), no tokens: all discovery and anonymous-rejection checks passed. `capabilitySource` is `grants`, dev auth off, issuer `https://clerk.agileflow.projectquestorg.com`, S256, anonymous `/mcp`, `/cli` and `/local-control` 401, garbage token 401, `/dev/session` 404. Independent checks from a Mac matched, plus an unsigned webhook POST returned 400.
- 2026-10-13, development deployment with a real Clerk development CLI token: CLI token accepted at `/cli`; refused at `/mcp` and `/local-control` with 403 `CLIENT_NOT_ALLOWED`; `stage0-pkce.py refresh` rotated the refresh token; a fake refresh token got 400 `invalid_grant`. Grant probe (owner dashboard grants only): with `work:write` alone a story was created and notes/runs were denied `CAPABILITY_REQUIRED`; after revoking every grant a create was denied `CAPABILITY_REQUIRED`. The owner then restored the four grants and cancelled the probe story in the dashboard.
- **Pending (real production tokens):** CLI sign-in, read, refresh and cross-endpoint rejection with `stage0-pkce.py`; MCP read and grant-denied write through Claude Code and Codex; companion enrollment. They wait on a production account in an organization. The `stage0-pkce.py login` step has not been run against any deployment yet; its token exchange mirrors `apps/cli/src/cloud/client.ts`.

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
