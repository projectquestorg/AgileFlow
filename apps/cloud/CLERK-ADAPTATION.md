# Clerk compatibility: replacing custom OAuth scopes (proposal for review)

Status: proposed, not implemented. Measured against the AgileFlow dev instance `ins_3KcehNRJDu4Syu1jIJ40X6rAsY5` on 2026-10-13.

## What Clerk returned

| Attempt | Exact provider response |
|---|---|
| `default_scopes` contains `agileflow:read` | `agileflow:read does not match the allowed values for parameter default_scopes. Allowed values: email, openid, private_metadata, profile, public_metadata or user:org:read` |
| `dynamic_client_allowed_scopes` contains `agileflow:read` | `agileflow:read does not match the allowed values for parameter dynamic_client_allowed_scopes. Allowed values: email, offline_access, openid, private_metadata, profile, public_metadata or user:org:read` |
| OAuth application `scopes` = `user:org:read agileflow:read` | `user:org:read agileflow:read offline_access does not match the allowed values for parameter scopes. Allowed values: email, offline_access, openid, private_metadata, profile, public_metadata or user:org:read` |
| `audience_uri` on a public (PKCE) application | `Audience uri is invalid. Only confidential OAuth applications can have an audience URI.` |
| Device code with the CLI application | `The requested OAuth 2.0 Client does not have the 'urn:ietf:params:oauth:grant-type:device_code' grant.` (needs `device_authorization_grant_enabled`) |

Consequences:
- **Scopes:** a Clerk-issued token can never carry `agileflow:*` scopes, so the spec's scope ceiling can't come from the token.
- **Audience:** public clients (CLI, companion, every MCP client) can't have a fixed `aud`. Whether `aud` reflects the RFC 8707 `resource` parameter is measured by the pending consent probe.

## Proposed replacement: AgileFlow-held capability grants

The authority rule stays an intersection: user permission ∩ granted capability ∩ project access ∩ connection policy. Only the place where capabilities are granted moves, from Clerk consent to AgileFlow.

1. **Token minimum stays strict.** The checks are unchanged:
   - signature under the configured instance's keys only
   - exact issuer
   - access-token type (`at+jwt`)
   - valid time claims
   - `sub` and `client_id` present
   - `org_id` present (missing org still fails closed)
   
   The required Clerk scope is `user:org:read`; `offline_access` is optional, for refresh.
2. **Capabilities are stored on the access connection.** The connection is the verified `(issuer, sub, org_id, client_id, resource)` tuple. Every new connection starts with `read` only. This matches the spec's default "user:org:read + agileflow:read".
3. **Write capabilities are granted only by a person in the dashboard**, per connection (Connections page: notes, work, runs, control requests), and never by the agent. Each grant is recorded with who granted it and when, and can be revoked at any time. A grant never exceeds the user's own project role.
4. **Missing capability response.** HTTP 403 with a JSON error `CAPABILITY_REQUIRED` naming the capability, plus a dashboard link `https://app.agileflow.projectquestorg.com/#/connections/<connectionId>?grant=<capability>`.
   - It does **not** send `WWW-Authenticate: insufficient_scope`. Clients would re-authorize asking for a scope Clerk can't issue, then loop.
   - This deviates from the spec's HTTP-challenge rule, deliberately. The MCP tool result carries the same structured error.
5. **Audience binding.** Strict whichever way the probe comes out:
   - **If Clerk puts the requested `resource` in `aud`:** keep today's exact-audience check per endpoint (`/mcp`, `/cli`, `/local-control`). No change.
   - **If it doesn't:** require `aud` (or `client_id`) to identify a client registered for that endpoint:
     - the AgileFlow CLI client ID is accepted only at `/cli`
     - the Companion client ID only at `/local-control`
     - dynamically registered clients (checked via the Clerk Backend API, `dynamically_registered: true`, result cached for 10 minutes) only at `/mcp`
     
     A token for one endpoint still can't be used at another, and unknown clients are rejected.
6. **Plugin and skills.** The step-up text changes from "reconnect with scope X" to "ask the user to grant X to this connection in the dashboard". Skill evals keep the "does not loop" rule.

What stays exactly as specified:
- organization binding from the verified token only
- project grants
- connection disable and restrict
- the connected-client pause
- idempotency, versions and approvals
- no admin rights for token clients

## Optional: device-code sign-in (separate approval)

Setting `device_authorization_grant_enabled: true` on the AgileFlow CLI application allows sign-in from SSH sessions without a callback.

- **Trade-off:** device flow has no PKCE (RFC 8628). Its protection is the short-lived code approved on Clerk's own page, so phishing resistance depends on the user checking the code.
- **Recommendation:** enable it for the CLI application only, never for the companion or dynamically registered clients. Show the code and the verification URL together.
- **Not applied** yet; it changes the CLI application's grants.
