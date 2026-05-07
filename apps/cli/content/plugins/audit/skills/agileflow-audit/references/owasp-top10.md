# OWASP Top 10 Reference

**Load this when:** running a security audit, reviewing auth/authz code, or
assessing injection risks. Maps each category to what to look for in code.

## A01 — Broken Access Control

Most common. Look for:

- Missing authorization checks before data access
- IDOR: `GET /api/orders/:id` without verifying ownership
- Privilege escalation: user can call admin endpoints
- CORS misconfiguration allowing untrusted origins
- Path traversal: `../` in file paths

**Code signals:** `req.params.id` used directly in DB query without ownership check,
`role === 'admin'` checked client-side only, wildcard CORS `*` on authenticated routes.

## A02 — Cryptographic Failures

Look for:

- Passwords hashed with MD5, SHA-1, or unsalted SHA-256
- Sensitive data in URLs, logs, or error messages
- HTTP instead of HTTPS for sensitive data
- Weak or hardcoded encryption keys
- JWT with `alg: none` or weak secrets

**Code signals:** `crypto.createHash('md5')`, `console.log(user)`, `Math.random()` for tokens.

## A03 — Injection

Look for:

- SQL: string concatenation in queries instead of parameterized statements
- NoSQL: `$where`, `$regex` with user input
- Command injection: `exec()`, `spawn()` with user-controlled strings
- Template injection: user input rendered in template engines
- LDAP/XPath injection in directory queries

**Code signals:** `db.query("SELECT * FROM users WHERE id = " + req.params.id)`,
`exec(userInput)`, `res.render(userInput)`.

## A04 — Insecure Design

Look for:

- Missing rate limiting on auth endpoints
- No account lockout after failed logins
- Password reset tokens that don't expire
- Business logic that can be abused (negative quantities, free upgrades)
- Lack of fraud detection on financial operations

## A05 — Security Misconfiguration

Look for:

- Default credentials not changed
- Stack traces exposed in production errors
- Directory listing enabled
- Unnecessary features/ports/services enabled
- Missing security headers (CSP, HSTS, X-Frame-Options)
- Debug mode in production (`DEBUG=true`, `NODE_ENV=development`)

## A06 — Vulnerable Components

Look for:

- Dependencies with known CVEs (`npm audit`, `snyk`)
- Outdated packages (especially auth libraries, crypto, XML parsers)
- Unpinned versions (`^`, `~` prefixes hide breaking security patches)
- Unused dependencies (larger attack surface)

## A07 — Auth & Session Failures

Look for:

- Session tokens in URLs
- Sessions not invalidated on logout
- Weak session token generation (`Math.random()`)
- Missing MFA on sensitive operations
- JWT tokens without expiration
- Refresh tokens with no rotation

## A08 — Software & Data Integrity Failures

Look for:

- Dependencies loaded from untrusted CDNs without SRI hashes
- Auto-update mechanisms without signature verification
- Deserializing untrusted data (pickle, Java serialization, JSON with `__proto__`)
- CI/CD pipelines that can be hijacked via dependency confusion

## A09 — Logging & Monitoring Failures

Look for:

- No logging of auth failures, access control violations
- Logs that contain passwords, tokens, or PII
- No alerting on suspicious patterns
- Logs that can be tampered with
- No audit trail for sensitive operations

## A10 — Server-Side Request Forgery (SSRF)

Look for:

- User-controlled URLs fetched server-side (`axios.get(req.body.url)`)
- No allowlist for outbound requests
- Cloud metadata endpoints reachable (`169.254.169.254`)
- Webhooks that accept arbitrary URLs without validation

## Severity mapping

| CVSS Score | Severity | Action                               |
| ---------- | -------- | ------------------------------------ |
| 9.0–10.0   | Critical | Fix before any commit                |
| 7.0–8.9    | High     | Fix this sprint                      |
| 4.0–6.9    | Medium   | Fix next sprint                      |
| 0.1–3.9    | Low      | Track and fix when touching the area |
