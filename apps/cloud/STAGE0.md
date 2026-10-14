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
- CLI token: `agileflow cloud login --service <url>`, or `python3 -I apps/cloud/scripts/stage0-pkce.py login [--no-browser]` (stdlib only; 127.0.0.1 loopback receiver; `--no-browser` prints the authorization URL instead of opening it; token file `AGILEFLOW_PROBE_TOKEN_FILE`, default `~/.af-probe/prod-cli-token.json`, mode 600; absolute deadline `AGILEFLOW_PROBE_LOGIN_TIMEOUT`, default 900 s; a callback with the wrong state is refused and the login keeps waiting; never prints tokens or codes). Then run `stage0-pkce.py test` for read and rejection checks (the context must be bound to the token's organization) and `stage0-pkce.py refresh` for rotation plus an `invalid_grant` check on a bogus refresh token. Both are read-only and exit nonzero if any check fails.
- MCP read token: a client's consent (Claude Code or Codex through DCR). MCP write token (grants mode): the same kind of connection after the owner grants `notes:write` in the dashboard. The write check adds a note to `STAGE0_PROJECT_ID`, so use a test project.

### Receipts

- 2026-10-13, production `https://app.agileflow.projectquestorg.com` (Convex `calm-marten-391` and Vercel `dpl_AqZ6DWU4PLWr7i6WMLMbDq9pKspv`, both from `cb6e03c4`), no tokens: all discovery and anonymous-rejection checks passed. `capabilitySource` is `grants`, dev auth off, issuer `https://clerk.agileflow.projectquestorg.com`, S256, anonymous `/mcp`, `/cli` and `/local-control` 401, garbage token 401, `/dev/session` 404. Independent checks from a Mac matched, plus an unsigned webhook POST returned 400.
- 2026-10-13, development deployment with a real Clerk development CLI token: CLI token accepted at `/cli`; refused at `/mcp` and `/local-control` with 403 `CLIENT_NOT_ALLOWED`; `stage0-pkce.py refresh` rotated the refresh token; a fake refresh token got 400 `invalid_grant`. The revised helper (SHA-256 `b96aae65eb8f4f9b64a8864f916c02179f403bbfd82acfa3f5e57d9b06aeef39`) passed `test` and `refresh` (exit 0, context bound to the token's organization); a forged token made `test` exit 1; a `login --no-browser` dry run refused two wrong-state callbacks with 400 while still waiting, then hit its deadline, exited 1 and saved no token file. Grant probe (owner dashboard grants only): with `work:write` alone a story was created and notes/runs were denied `CAPABILITY_REQUIRED`; after revoking every grant a create was denied `CAPABILITY_REQUIRED`. The owner then restored the four grants and cancelled the probe story in the dashboard.
- 2026-10-13, production, owner on a Mac with a real account (runtime still `cb6e03c4`): Google sign-in through Clerk production succeeded (Google app unpublished, owner as test user; publishing waits on branding, privacy and terms URLs). The owner is dashboard admin of organization Project Quest (`org_3KeWV9eMpZWQTkq5pQVEVblf3Dt`). `stage0-pkce.py` at `e3f5cf2e` (hash verified) completed an S256 PKCE `login`; the token is `at+jwt` with the exact `/cli` audience and the organization. `/cli` context GET and POST returned 200 bound to the organization; missing and garbage tokens 401; the CLI token at `/mcp` and `/local-control` 401 (exact `aud` check); `refresh` rotated the refresh token, a fake refresh token got 400 `invalid_grant`, and the repeated checks passed. Clerk webhooks reached production Convex (read-only inspection of `webhookReceipts`): `user.created`, `organizationMembership.created` and `organization.created` at 19:08 UTC, all `processed`; the workspace mirror is `Project Quest` (active) and the owner's membership is `admin` (active).
- 2026-10-13, production, owner's independent Mac run: `stage0-pkce.py` at `e3f5cf2e` `test` exit 0 (Project Quest org match, `at+jwt`, `aud` `/cli`); `stage0.ts` under Node 24 with the real CLI token: 13 pass, 0 fail, 4 skipped (MCP read, MCP write, manual lifecycle, companion); `refresh` rotated and passed. The Svix delivery log shows the membership-created attempt answered HTTP 200 `processed`. MCP dynamic client registration at `/oauth/register` succeeded (public client, `token_endpoint_auth_method` `none`, PKCE S256, loopback callback, `org:read offline_access`).
- 2026-10-13, production dashboard `6e22319b` (Vercel `agileflow-dashboard-57fbgjtvo`; Convex and Clerk unchanged), owner in Safari: Clerk production Paths saved and confirmed after reload (sign-in `https://app.agileflow.projectquestorg.com/sign-in`, sign-up `/sign-up`, signing out `/sign-in`; OAuth consent stays on the Account Portal; consent is off only for the first-party CLI and Companion applications). `/sign-in` and `/sign-up` return 200. Sign-out returned at once to the AgileFlow sign-in page, with no reload or stuck loading screen. A real S256 PKCE CLI login from the Mac went Clerk authorize -> AgileFlow `/sign-in` -> Google account chooser (existing owner) -> `127.0.0.1` callback; the code exchange succeeded and the token file is mode 600. `stage0-pkce.py` at `e3f5cf2e` `test` exit 0: `at+jwt`, exact `aud` `https://app.agileflow.projectquestorg.com/cli`, `org_3KeWV9eMpZWQTkq5pQVEVblf3Dt`, context GET and POST 200 with Project Quest org match, anonymous and garbage tokens 401, the CLI token at `/mcp` and `/local-control` 401. No codes or tokens were printed. Google sign-in is limited to the owner's test access: publishing the Google app waits on real privacy and terms URLs, so public sign-up through Google is not available.
- **Pending (real production tokens):** MCP consent (waits on the owner's action-time approval), then MCP read and grant-denied write through Claude Code, Codex and the MCP SDK client; companion enrollment.

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
