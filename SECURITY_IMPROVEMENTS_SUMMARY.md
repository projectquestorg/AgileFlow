# AgileFlow Documentation Security - 5 Key Improvements (Summary)

## Overview
Analysis of Fumadocs-based Next.js documentation site (114 MDX files, 32K+ lines) identified 5 security improvements to prevent injection attacks, dependency vulnerabilities, and configuration leaks.

---

## IDEA 1: Add Content Security Policy (CSP) Headers

**Category**: Security | **Impact**: High | **Effort**: 2-4 Hours

**Files**: `next.config.mjs`, `app/layout.tsx`, + NEW `middleware.ts`

**Problem**: No CSP headers; inline theme script (line 72-85 layout.tsx) could be intercepted. Allows inline scripts by default.

**Solution**:
1. Create middleware to inject CSP headers with nonce-based inline scripts
2. Restrict script sources to whitelist (analytics only)
3. Restrict img sources to 3 approved CDNs (GitHub, Unsplash, Vercel)
4. Add report-uri endpoint for CSP violations

**CSP Policy**:
```
script-src 'self' 'nonce-{random}' https://analytics.vercel.com;
img-src 'self' https://avatars.githubusercontent.com https://images.unsplash.com https://avatar.vercel.sh;
default-src 'self';
```

**Outcome**: Prevents XSS injection via compromised external resources; cryptographic nonce allows inline theme preload script.

---

## IDEA 2: Implement XSS Prevention for MDX Code Examples

**Category**: Security | **Impact**: High | **Effort**: 1-2 Days

**Files**: `lib/llm.ts`, `mdx-components.tsx`, `components/code-viewer.tsx`, `content/docs/**/*.mdx`

**Problem**:
- `llm.ts` reads source files and injects into MDX without sanitization (line 22-28)
- If malicious code committed or user-supplied, executes as-is
- Code examples show fake API keys ("OPENAI_API_KEY") with no encoding

**Solution**:
1. HTML entity encode all code blocks (prevent `<script>` from executing)
2. Validate ComponentPreview names against whitelist (prevent directory traversal)
3. Implement Markdown HTML sanitizer to strip dangerous tags
4. Add pre-commit hook to scan for suspicious patterns

**Example Fix**:
```typescript
import DOMPurify from 'isomorphic-dompurify'
const sanitized = DOMPurify.sanitize(sourceCode, { ALLOWED_TAGS: [] })
```

**Outcome**: Code examples cannot execute arbitrary JavaScript; malicious payloads are displayed as text.

---

## IDEA 3: Harden Remote Image Validation & Add Subresource Integrity (SRI)

**Category**: Security | **Impact**: Medium | **Effort**: 4-6 Hours

**Files**: `next.config.mjs` (lines 12-27), `app/layout.tsx`, + NEW `lib/security.ts`

**Problem**:
- Accepts images from 3 external domains with no integrity verification
- CDN compromise = malicious content injection
- Vercel analytics script has no hash verification
- No image size limits = potential DoS

**Solution**:
1. Generate SRI hashes for external scripts (analytics)
2. Add image size validation (5MB limit)
3. Implement request timeout (3s max) to prevent hanging
4. Create allowlist configuration for approved external domains

**Example SRI**:
```tsx
<script
  src="https://cdn.vercel-analytics.com/v1/script.js"
  integrity="sha384-xxxxx..."
  crossOrigin="anonymous"
/>
```

**Outcome**: Downloaded resources verified to match expected hash; compromised CDN attacks detected.

---

## IDEA 4: Resolve Dependency Vulnerability & Add Automated Scanning

**Category**: Security | **Impact**: Medium | **Effort**: 2-3 Hours

**Files**: `package.json`, + NEW `.github/workflows/security-scan.yml`

**Problem**:
- `jsdiff <8.0.3` has DoS vulnerability (ReDoS in `parsePatch`/`applyPatch`)
- Current audit: 1 low-severity vulnerability
- No automated scanning in CI pipeline

**Solution**:
1. Upgrade `diff` to >=8.0.3 (verify no breaking changes in build)
2. Implement GitHub Actions workflow for `npm audit --production`
3. Configure Dependabot for automated PRs
4. Set SLA: critical=1 day, high=1 week remediation

**GitHub Actions**:
```yaml
- run: npm audit --audit-level=high
```

**Outcome**: Active vulnerability fixed; future vulnerabilities detected before release.

---

## IDEA 5: Secure Environment Configuration & Disable Debug Info Leaks

**Category**: Security | **Impact**: Medium | **Effort**: 3-4 Hours

**Files**: `next.config.mjs`, `.env.example`, `app/layout.tsx`, + NEW `lib/env.ts`

**Problem**:
- `typescript.ignoreBuildErrors: true` (line 7) suppresses type safety - hides injection vulnerabilities
- `NEXT_PUBLIC_APP_URL` hardcoded to localhost in dev, production value not validated
- Debug information could leak in error pages
- Sensitive headers (Server-Timing, X-Powered-By) exposed

**Solution**:
1. Implement environment variable validation with Zod schema
2. Validate critical variables on startup (fail fast)
3. Disable debug indicators only in production
4. Add middleware to strip sensitive headers
5. Create audit log of environment variables at startup

**Env Schema**:
```typescript
const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://agileflow.dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
})
```

**Outcome**: Invalid configurations caught before deployment; information disclosure reduced.

---

## Quick Reference Table

| Idea | Category | Impact | Effort | Files | Key Benefit |
|------|----------|--------|--------|-------|------------|
| #1: CSP Headers | Injection Prevention | High | 2-4h | middleware.ts, next.config.mjs | Prevents XSS via script injection |
| #2: XSS Prevention | Output Encoding | High | 1-2d | lib/llm.ts, mdx-components.tsx | Code examples cannot execute JS |
| #3: SRI & Images | Integrity Verification | Medium | 4-6h | next.config.mjs, lib/security.ts | CDN compromise detection |
| #4: Dependency Scan | Vulnerability Management | Medium | 2-3h | package.json, .github/workflows/ | Active CVE remediation |
| #5: Env Hardening | Misconfiguration Prevention | Medium | 3-4h | lib/env.ts, app/layout.tsx | Invalid configs caught early |

---

## Implementation Priority Timeline

**Week 1 (Critical)**:
- Idea #1: Add CSP Headers
- Idea #2: XSS Prevention for MDX
- Idea #4: Fix jsdiff vulnerability immediately

**Week 2 (High)**:
- Idea #3: SRI for external resources
- Idea #5: Environment validation

---

## Compliance & Standards

- **OWASP Top 10**: Addresses A1 (Injection), A5 (Misconfiguration), A6 (Vulnerable Components), A8 (Integrity)
- **Best Practice**: Defense-in-depth approach for public documentation site
- **Framework**: Next.js 15.5.9 security features used for CSP, middleware, environment handling

---

## Current State (Baseline)

- Risk Level: MEDIUM
- Vulnerabilities: 1 low (jsdiff DoS)
- CSP: NOT CONFIGURED
- XSS Protection: BASIC (React escaping only)
- Dependency Scanning: MANUAL (npm audit)
- Environment Validation: NONE

---

**Document Generated**: 2026-01-19
**Analyzer**: AG-SECURITY Specialist
**Recommendation**: Implement all 5 improvements before next major release
