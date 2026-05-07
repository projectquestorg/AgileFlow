# Workflow: Security Review

**Triggers:** user asks for a security review, change touches auth/login/permissions/file-upload/payments/database queries, or a P0 security finding was flagged in a standard review

**Goal:** Systematic, OWASP-anchored security review of the changed code, producing a prioritised list of vulnerabilities with concrete fixes.

---

## When to run a full security review

Run this workflow (instead of the standard review) when:

- Change touches authentication or session management
- Change adds or modifies API endpoints that handle user data
- Change adds file upload, import, or download functionality
- Change modifies database queries or ORM calls
- Change handles payments, billing, or financial data
- Change adds cryptographic operations (hashing, signing, encryption)
- Change modifies CORS, security headers, or cookie settings
- Change introduces a third-party integration with data exchange

---

## Inputs needed

| Input                 | Required  | How to get it                                               |
| --------------------- | --------- | ----------------------------------------------------------- |
| Changed files         | Yes       | Paste or file paths                                         |
| What the change does  | Yes       | PR description or ask                                       |
| Framework / language  | Yes       | Detect from code                                            |
| Auth mechanism in use | Preferred | Ask: "How does this app handle auth? JWT, sessions, OAuth?" |

---

## Steps

### Step 1: Identify the attack surface

Map what user-controlled input enters the system in this change:

- HTTP request body, query params, headers
- File uploads
- URLs fetched by the server
- Database record fields updated by the user
- External webhook payloads

For each input, trace where it goes:

- Into a SQL query?
- Into a shell command?
- Into an HTML response?
- Into a file path?
- Into a redirect URL?

### Step 2: Run the OWASP Top 10 checklist

Work through each category from `references/security-patterns.md` that is relevant to this change:

| Category                      | Check if change touches...                                 |
| ----------------------------- | ---------------------------------------------------------- |
| A01 Broken Access Control     | Endpoints returning or modifying user-specific resources   |
| A02 Cryptographic Failures    | Password storage, tokens, encryption                       |
| A03 Injection                 | Database queries, shell commands, HTML output, URL parsing |
| A04 Insecure Design           | Auth flows, rate limiting, account recovery                |
| A05 Security Misconfiguration | CORS, headers, debug settings                              |
| A07 Auth Failures             | Login, logout, session management, JWTs                    |
| A08 Integrity Failures        | Deserialisation, file processing                           |
| A09 Logging Failures          | What gets logged — is sensitive data included?             |
| A10 SSRF                      | Server fetching user-provided URLs                         |

### Step 3: Check for mass assignment

For any endpoint that takes a request body and uses it to create or update a database record:

1. What fields does the model have?
2. What fields are in the request body?
3. Are there fields in the model that should NEVER be user-settable (isAdmin, role, balance, ownerId)?
4. Is the code whitelisting only the intended fields?

### Step 4: Check for information disclosure

- Do error messages reveal internal paths, table names, or stack traces?
- Do 404 and 401 responses behave identically for "not found" vs "not authorised" (to prevent enumeration)?
- Is debug mode or verbose error mode enabled in any code path?

### Step 5: Verify dependency security

If the change adds or updates packages:

- Note the packages added
- Flag any known-vulnerable packages (CVE lookup if possible)
- Check that crypto-related packages are well-maintained

### Step 6: Check the test coverage for security paths

Security paths that MUST have explicit tests:

- Authenticated endpoint with no token → 401
- Authenticated endpoint with another user's resource ID → 403 or 404
- Input with SQL injection payload → not executed as SQL
- File upload with wrong MIME type → rejected

If any of these are missing, add them as P2 findings.

### Step 7: Produce findings

Use the same format as the standard review, but add the OWASP category reference:

```
[P0] SECURITY (A03 - Injection) — SQL Injection in user search endpoint
  File: src/api/users.js, line 34
  Issue: User-provided 'search' query param concatenated into SQL:
         `SELECT * FROM users WHERE name LIKE '%${search}%'`
         An attacker can inject: "'; DROP TABLE users; --"
  Fix: Use parameterised query: db.query("SELECT * FROM users WHERE name LIKE $1", [`%${search}%`])
  Test: Add test: POST /api/users/search with payload "'; SELECT 1 --" should return 400 or safe empty result

[P0] SECURITY (A01 - Broken Access Control) — Missing ownership check on GET /api/documents/:id
  File: src/api/documents.js, line 18
  Issue: Any authenticated user can fetch any document by guessing its ID
  Fix: Add check: if (doc.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
  Test: Add test: authenticated request for another user's document should return 403
```

### Step 8: Summary and recommendation

```
─────────────────────────────────────
SECURITY REVIEW SUMMARY
─────────────────────────────────────
Attack surface reviewed:
  - {N} API endpoints
  - {M} database operations
  - {K} user-input paths

OWASP categories checked: A01, A02, A03, A07 (others N/A for this change)

Vulnerabilities found:
  P0: {N} — must fix before merge
  P1: {N} — strong recommendation to fix
  P2: {N} — missing security tests

VERDICT: {APPROVE | REQUEST CHANGES}
─────────────────────────────────────
```

---

## Threat modelling quick questions

If the security review is for a new feature (not a bugfix), run through these:

1. **Who is the adversary?** Unauthenticated users? Authenticated users acting maliciously? Internal bad actors?
2. **What is the most valuable asset?** User PII? Financial data? Admin capabilities?
3. **What is the worst-case scenario if this code has a vulnerability?**
4. **What would a malicious user try first?**

Use these to prioritise which attack vectors to investigate most thoroughly.

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present findings as a numbered list and ask:

```
Security review complete. {N} findings.

1. Fix all P0 vulnerabilities now — I'll write the corrected code
2. Explain how to exploit finding #1 (for understanding, not exploitation)
3. Write the missing security tests
4. Proceed to standard review after security fixes

Reply with a number.
```
