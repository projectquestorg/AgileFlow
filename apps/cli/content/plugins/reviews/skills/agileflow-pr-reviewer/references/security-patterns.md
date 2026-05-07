# Security Patterns Reference

**Load this when:** reviewing code with security implications — auth changes, user input handling, database queries, file operations, cryptography, or external integrations.

---

## OWASP Top 10 (2021) — Review Checklist

### A01: Broken Access Control

The #1 most common vulnerability. Users can access resources or perform actions they shouldn't.

**Patterns to look for:**

```js
// BAD — IDOR: user can access any account by changing the ID
app.get("/api/orders/:orderId", async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  res.json(order); // No check that order belongs to req.user!
});

// GOOD — ownership check before returning data
app.get("/api/orders/:orderId", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order || order.userId !== req.user.id) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(order);
});
```

**What to check:**

- Every endpoint that returns or modifies user data checks ownership
- Admin endpoints have role-based access checks
- Resource IDs are not predictable/guessable (UUIDs, not auto-increment)
- Access checks are server-side, not just UI-hidden

---

### A02: Cryptographic Failures

Sensitive data exposed due to weak encryption, missing encryption, or improper key management.

**Patterns to look for:**

```python
# BAD — MD5 for password hashing (trivially crackable)
import hashlib
password_hash = hashlib.md5(password.encode()).hexdigest()

# GOOD — bcrypt with appropriate cost factor
import bcrypt
password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))

# BAD — SHA256 without salt (rainbow table vulnerable)
password_hash = hashlib.sha256(password.encode()).hexdigest()
```

```js
// BAD — token generated with Math.random() (predictable)
const token = Math.random().toString(36).slice(2);

// GOOD — cryptographically secure token
const token = crypto.randomBytes(32).toString("hex");
```

**What to check:**

- Passwords use bcrypt, argon2, or scrypt (never MD5, SHA1, SHA256 alone)
- Session tokens use `crypto.randomBytes` or equivalent
- Sensitive data (PII, payment info) encrypted at rest in database
- TLS enforced — no HTTP fallback for sensitive operations
- API keys / secrets not hardcoded in source code (use env vars)
- JWT `alg: none` not accepted

---

### A03: Injection

User input flows into interpreters (SQL, shell, HTML, LDAP) without sanitisation.

**SQL Injection:**

```js
// BAD — raw string interpolation
const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
// Payload: ' OR '1'='1 — dumps all users

// GOOD — parameterised query
const user = await db.query("SELECT * FROM users WHERE email = $1", [email]);
```

```python
# BAD
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# GOOD
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

**Command Injection:**

```js
// BAD — user input in shell command
const { execSync } = require("child_process");
execSync(`convert ${req.body.filename} output.jpg`);
// Payload: "file.jpg && rm -rf /"

// GOOD — use a library instead of shell, or validate input strictly
const sharp = require("sharp");
await sharp(sanitisedFilePath).toFile("output.jpg");
```

**Path Traversal:**

```js
// BAD — allows ../../../etc/passwd
const filePath = path.join("/uploads", req.params.filename);

// GOOD — resolve and check it stays inside the intended directory
const filePath = path.resolve("/uploads", req.params.filename);
if (!filePath.startsWith(path.resolve("/uploads"))) {
  return res.status(400).json({ error: "Invalid path" });
}
```

---

### A04: Insecure Design

Architectural flaws in security model. These can't be fixed by patching code — they require design changes.

**Red flags to raise:**

- Passwords or tokens sent as URL query parameters (appear in server logs)
- Email-based "magic link" login with no expiry
- Password reset that reveals whether an email is registered (email enumeration)
- Rate limiting absent on authentication endpoints (brute-force vulnerable)
- File uploads with no type validation or virus scanning

---

### A05: Security Misconfiguration

**Patterns to check:**

- `DEBUG=true` or equivalent in production code
- Error responses include stack traces or internal paths
- Default credentials in database or admin panel setup
- CORS configured as `Access-Control-Allow-Origin: *` on authenticated endpoints
- HTTP security headers missing (CSP, X-Frame-Options, X-Content-Type-Options)
- Directory listing enabled on static file server

---

### A06: Vulnerable and Outdated Components

Not a code review finding, but flag if you see:

- `require('crypto-js')` for password hashing (use Node's built-in `crypto` or `bcrypt`)
- Old `jsonwebtoken` patterns without algorithm validation
- Direct eval of JSON from external sources
- Known-vulnerable package versions (check with `npm audit` / `pip-audit`)

---

### A07: Identification and Authentication Failures

```js
// BAD — brute-force vulnerable login with no rate limiting
app.post("/login", async (req, res) => {
  const user = await User.findByEmail(req.body.email);
  if (user && user.password === req.body.password) {
    // also: plaintext comparison!
    req.session.userId = user.id;
    res.json({ success: true });
  }
});

// GOOD — rate limited, constant-time comparison, bcrypt
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.post("/login", loginLimiter, async (req, res) => {
  const user = await User.findByEmail(req.body.email);
  const match =
    user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!match) return res.status(401).json({ error: "Invalid credentials" });
  req.session.userId = user.id;
  res.json({ success: true });
});
```

**What to check:**

- Rate limiting on login, password reset, and email verification endpoints
- Account lockout after N failed attempts (or CAPTCHA)
- Session tokens regenerated after privilege escalation (login, role change)
- Sessions invalidated on logout (server-side session store, not just clearing the cookie)
- JWT expiry enforced — `exp` claim checked

---

### A08: Software and Data Integrity Failures

- Deserialisation of untrusted data (pickle in Python, Java ObjectInputStream)
- CI/CD pipelines that pull dependencies without checksum verification
- Auto-update mechanisms that don't verify signatures

---

### A09: Security Logging and Monitoring Failures

**What to check:**

- Failed login attempts logged (email, IP, timestamp — NOT the attempted password)
- Admin actions logged (who did what, when)
- Logs don't contain sensitive data (passwords, full credit card numbers, session tokens)
- Errors logged with enough context to investigate (request ID, user ID if available)

---

### A10: Server-Side Request Forgery (SSRF)

Relevant when the application fetches URLs provided by the user.

```js
// BAD — user can point the server to internal services
app.post("/fetch-preview", async (req, res) => {
  const html = await fetch(req.body.url).then((r) => r.text());
  res.json({ html });
  // Payload: http://169.254.169.254/latest/meta-data/ (AWS metadata endpoint)
});

// GOOD — validate URL is on an allowlist of external domains
const ALLOWED_HOSTS = ["example.com", "another-trusted.com"];
const url = new URL(req.body.url);
if (!ALLOWED_HOSTS.includes(url.hostname)) {
  return res.status(400).json({ error: "URL not allowed" });
}
```

---

## Mass Assignment

**Web frameworks that auto-bind request body to model fields:**

```js
// BAD — user can set any field, including isAdmin
const user = new User(req.body);
await user.save();

// GOOD — whitelist only the fields you intend to update
const { name, email } = req.body;
const user = new User({ name, email });
await user.save();
```

```python
# BAD — Flask-SQLAlchemy mass assignment
user = User(**request.json)

# GOOD
user = User(
    name=request.json['name'],
    email=request.json['email'],
)
```

---

## JWT-specific issues

```js
// BAD — algorithm confusion attack: accept 'none' or HS256 when expecting RS256
jwt.verify(token, publicKey); // default options accept alg: none

// GOOD — explicitly specify allowed algorithms
jwt.verify(token, publicKey, { algorithms: ["RS256"] });

// BAD — not checking expiry
const decoded = jwt.decode(token); // decode does NOT verify signature or expiry

// GOOD — always verify, never just decode in auth paths
const decoded = jwt.verify(token, secret);
```

---

## File upload security

```js
// BAD — no type checking, stores user filename directly
app.post("/upload", upload.single("file"), (req, res) => {
  fs.renameSync(req.file.path, `/uploads/${req.file.originalname}`);
});

// GOOD — validate MIME type, generate safe filename
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
  return res.status(400).json({ error: "File type not allowed" });
}
const safeFilename = `${crypto.randomUUID()}${path.extname(req.file.originalname)}`;
fs.renameSync(req.file.path, `/uploads/${safeFilename}`);
```

---

## Severity mapping for review findings

| Finding                        | OWASP category | Severity                   |
| ------------------------------ | -------------- | -------------------------- |
| SQL injection                  | A03            | P0 — block merge           |
| Auth bypass                    | A07            | P0 — block merge           |
| IDOR (missing ownership check) | A01            | P0 — block merge           |
| Hardcoded secret               | A02            | P0 — block merge           |
| Plaintext password storage     | A02            | P0 — block merge           |
| Missing rate limiting on login | A07            | P1                         |
| XSS (unescaped output)         | A03            | P0–P1 depending on context |
| Missing CSRF                   | A01            | P1                         |
| Sensitive data in logs         | A09            | P1                         |
| No JWT algorithm restriction   | A02            | P1                         |
| Missing security headers       | A05            | P2                         |
| Mass assignment                | A08            | P0–P1 depending on fields  |
