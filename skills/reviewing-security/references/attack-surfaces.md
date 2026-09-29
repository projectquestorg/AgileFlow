# Attack surfaces: what to check

Read only the sections that apply to the code in scope. Each item is a question to answer with evidence from the code, not a finding by itself.

## Authentication

- Is identity established before the action, on every route that needs it, including new routes added next to protected ones?
- Session and token handling: unpredictable tokens (a CSPRNG, enough bytes), expiry enforced on the server, revocation on logout and password change, no tokens in URLs or logs.
- Password handling: a slow salted hash (scrypt, bcrypt, argon2), constant-time comparison, rate limiting or lockout on login and reset.
- Anything that downgrades authentication: debug flags, "internal" headers trusted from the client, test bypasses left in, fallbacks when a secret is not configured.

## Authorization

- Object-level checks: does the handler confirm this actor may read or change this specific record (not only that they are signed in)? IDs in paths or bodies are attacker-chosen.
- Role checks on the server for every privileged action, not only in the UI; a new route wrapped without the role its siblings require.
- Mass assignment: request bodies copied into records, letting a user set `role`, `ownerId`, `price`, or `active`.

## Injection and unsafe parsing

- SQL and NoSQL: string-built queries, dynamic column or order-by names, operator objects in JSON bodies (`{"$gt": ""}`).
- Shell: user data in `exec`/`system`/backticks or `shell: true`; prefer argument arrays, and watch for option injection (`-` prefixed values).
- Paths: user data joined into file paths without resolving and checking the result stays in the intended directory; symlinks; archive extraction (zip slip).
- Templates and HTML: unescaped output, server-side template evaluation, `dangerouslySetInnerHTML` and equivalents.
- Deserialization: `eval`, `new Function`, YAML or pickle loaders that construct objects, prototype pollution through deep merges of JSON.
- Headers and redirects: CRLF in header values, open redirects built from query parameters.
- Outbound requests: URLs or hosts from users (SSRF to metadata endpoints, internal services, `file://`).

## Secrets

- Hard-coded credentials, keys committed to the repository, secrets in logs, error messages, responses, or client bundles.
- Secrets compared with `==` instead of a constant-time comparison.
- Missing-secret behavior: does the code fail closed when a secret is not configured?

## Integrity and crypto

- Webhook and message signatures: verified over the raw bytes, before parsing or acting, with a constant-time comparison, never optional; timestamps checked to limit replay.
- Randomness for security decisions from a CSPRNG, not `Math.random`.
- Homemade crypto, ECB mode, static IVs, truncated MACs.

## Resource abuse

- Unbounded input sizes (bodies, uploads, arrays, regexes vulnerable to catastrophic backtracking).
- Missing rate limits on authentication, password reset, invitations, and other costly or enumerable endpoints; rate-limit keys an attacker can rotate.

## Severity guide

- **Critical:** unauthenticated remote code execution, authentication bypass, or bulk access to other users' data or money.
- **High:** a signed-in user reaches other users' data or admin actions, reads secrets or arbitrary files, or forges payments.
- **Medium:** exploitable only with unusual preconditions or limited impact (single-record exposure, stored input shown only to the attacker).
- **Low:** defense-in-depth gaps with no demonstrated exploit path.
