# AgileFlow Documentation Site Security Improvements

**Analysis Date**: January 19, 2026
**Scope**: Fumadocs-based Next.js documentation site (`/home/coder/AgileFlow/apps/docs`)
**Analyzed By**: AG-SECURITY Specialist

---

## Executive Summary

The AgileFlow documentation site (114 MDX files, 32K+ lines) serves as the public-facing reference for the AgileFlow project. Security analysis identified 5 key improvement areas spanning Content Security Policy (CSP), XSS prevention, external resource validation, dependency vulnerability remediation, and environment configuration hardening.

**Current Risk Level**: LOW (updated January 20, 2026)
- ✅ All dependency vulnerabilities remediated (jsdiff, xml2js)
- ✅ Dependabot configured for automated security PRs
- ✅ npm audit integrated into CI pipeline
- No hardcoded secrets found (compliant)
- CSP headers not configured (allows inline scripts)
- Minimal input validation on remote image sources
- Theme localStorage used with dangerouslySetInnerHTML

---

## Vulnerability Remediation SLA

| Severity | Response Time | Resolution Time | Escalation |
|----------|---------------|-----------------|------------|
| **Critical** | 4 hours | 24 hours | Immediate hotfix, notify maintainers |
| **High** | 24 hours | 7 days | Prioritize in current sprint |
| **Moderate** | 7 days | 30 days | Include in next release cycle |
| **Low** | 30 days | 90 days | Address during routine maintenance |

### Remediation Process
1. **Detection**: Automated via npm audit in CI + Dependabot alerts
2. **Triage**: Assess severity and exploitability in context
3. **Fix**: Apply override, update dependency, or apply patch
4. **Verify**: Run `npm audit` to confirm zero vulnerabilities
5. **Deploy**: Merge fix and monitor for regressions

### Current Status (as of January 20, 2026)
- **npm audit**: 0 vulnerabilities
- **Dependabot**: Configured for weekly scans
- **CI Security Job**: Active and required for merge

---

## IMPROVEMENT IDEA #1

**Title**: Add Content Security Policy (CSP) Headers
**Category**: Security
**Impact**: High
**Effort**: 2-4 Hours

### Files Affected
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` (add headers configuration)
- `/home/coder/AgileFlow/apps/docs/app/layout.tsx` (update inline script strategy)
- **New file**: `/home/coder/AgileFlow/apps/docs/middleware.ts` (CSP header injection)

### Why This Matters
Current inline script (line 72-85 of layout.tsx) violates strict CSP but is necessary for theme preloading. CSP headers prevent injection attacks by restricting script sources to whitelist. Next.js 15.5+ supports `headers()` function and middleware for CSP injection.

### Approach
1. Create Next.js middleware that injects CSP headers for all responses
2. Implement nonce-based CSP for inline scripts (cryptographic random token per request)
3. Restrict external resources to allow-listed domains (GitHub avatars, Unsplash, Vercel CDN only)
4. Add CSP report-uri endpoint to log violations (helpful for incident detection)

### Implementation Checklist
- [ ] Create `middleware.ts` with CSP header generation function
- [ ] Generate cryptographic nonce for each request using `crypto.randomUUID()`
- [ ] Update inline script tag to use nonce attribute
- [ ] Configure `next.config.mjs` with remotePatterns for allowed external resources
- [ ] Add CSP report-only mode initially to avoid breaking changes
- [ ] Document CSP policy in security guide for contributors
- [ ] Test with CSP violation tools (CSP Evaluator, Observatory)

### CSP Policy Structure (Recommended)
```
default-src 'self';
script-src 'self' 'nonce-{random}' https://analytics.vercel.com;
style-src 'self' 'unsafe-inline';
img-src 'self' https://avatars.githubusercontent.com https://images.unsplash.com https://avatar.vercel.sh;
font-src 'self';
connect-src 'self' https://analytics.vercel.com;
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
```

---

## IMPROVEMENT IDEA #2

**Title**: Implement XSS Prevention for MDX Code Examples
**Category**: Security
**Impact**: High
**Effort**: 1-2 Days

### Files Affected
- `/home/coder/AgileFlow/apps/docs/lib/llm.ts` (add sanitization)
- `/home/coder/AgileFlow/apps/docs/mdx-components.tsx` (add output encoding)
- `/home/coder/AgileFlow/apps/docs/components/code-viewer.tsx` (sanitize displayed code)
- `/home/coder/AgileFlow/apps/docs/content/docs/**/*.mdx` (code block validation)

### Why This Matters
MDX files contain 114 documentation files with code examples. The `llm.ts` file reads source files and injects them into MDX (line 22-28). If malicious code is committed or user-supplied code is ever processed, it could execute as-is. Additionally, code viewer components display user-like input (API keys in examples like line in code-viewer.tsx showing "OPENAI_API_KEY").

### Approach
1. Add HTML entity encoding for all code displayed in browser (prevent script tags from executing)
2. Validate component preview names against a whitelist (prevent directory traversal)
3. Implement Markdown sanitizer to strip potentially dangerous HTML from MDX
4. Add pre-commit hook to scan code examples for suspicious patterns
5. Rate limit code snippet requests if ever exposed via API

### Implementation Checklist
- [ ] Install `sanitize-html` or `isomorphic-sanitize` for HTML encoding
- [ ] Create `sanitizeCodeBlock()` function that escapes HTML entities
- [ ] Add whitelist validation in `processMdxForLLMs()` function
- [ ] Update MDX code block rendering to use sanitized output
- [ ] Add `.pre-commit` hook to scan code examples
- [ ] Create security test for ComponentPreview with malicious names
- [ ] Document safe code example patterns

### Example Sanitization
```typescript
// BEFORE (vulnerable): code could contain unescaped < > & " '
const source = fs.readFileSync(src, "utf8")

// AFTER (safe): HTML entities encoded
import DOMPurify from 'isomorphic-dompurify'
const source = fs.readFileSync(src, "utf8")
const sanitized = DOMPurify.sanitize(source, { ALLOWED_TAGS: [] })
```

---

## IMPROVEMENT IDEA #3

**Title**: Harden Remote Image Validation & Implement Subresource Integrity
**Category**: Security
**Impact**: Medium
**Effort**: 4-6 Hours

### Files Affected
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` (lines 12-27, remotePatterns configuration)
- `/home/coder/AgileFlow/apps/docs/app/layout.tsx` (add SRI for external scripts)
- `/home/coder/AgileFlow/apps/docs/components/` (image components with validation)
- **New file**: `/home/coder/AgileFlow/apps/docs/lib/security.ts` (SRI helpers)

### Why This Matters
Currently accepts images from 3 external domains (GitHub avatars, Unsplash, Vercel). While HTTPS ensures transport security, an attacker could:
1. Compromise CDN and inject malicious content
2. Inject malicious Vercel analytics script (no integrity check)
3. Serve malicious avatars if GitHub CDN compromised

Subresource Integrity (SRI) hashes verify downloaded resources haven't been modified.

### Approach
1. Generate SRI hashes for all external scripts (analytics)
2. Add domain-level constraints (org-restricted paths for GitHub)
3. Implement image size validation to prevent DoS
4. Add request timeout to prevent hanging requests
5. Create security audit log for all external resource loads
6. Document approved external domains in ADR

### Implementation Checklist
- [ ] Generate SRI hash for `@vercel/analytics` script
- [ ] Update `analytics.tsx` to include integrity attribute
- [ ] Add maximum image size validation (e.g., 5MB limit)
- [ ] Create `validateRemoteImage()` function with timeout (3s max)
- [ ] Add CSP `require-sri-for script;` to enforce SRI checking
- [ ] Create allowlist configuration file for approved domains
- [ ] Add monitoring/logging for external resource failures
- [ ] Write integration test for image validation

### Example SRI Implementation
```typescript
// In analytics.tsx
<script
  src="https://cdn.vercel-analytics.com/v1/script.js"
  integrity="sha384-xxxxx..." // Generate with: `echo -n "$(curl -s url)" | openssl dgst -sha384 -binary | openssl enc -base64`
  crossOrigin="anonymous"
/>
```

---

## IMPROVEMENT IDEA #4

**Title**: Resolve Dependency Vulnerability & Implement Automated Scanning
**Category**: Security
**Impact**: Medium
**Effort**: 2-3 Hours

### Files Affected
- `/home/coder/AgileFlow/apps/docs/package.json` (update `diff` dependency)
- `/home/coder/AgileFlow/apps/docs/.npmrc` (or root `.npmrc`)
- **New files**:
  - `/home/coder/AgileFlow/.github/workflows/security-scan.yml`
  - `/home/coder/AgileFlow/apps/docs/.snyk.json` (optional)

### Why This Matters
Current audit report shows 1 low-severity vulnerability:
- `jsdiff <8.0.3` has Denial of Service (DoS) vulnerability (CVSS TBD)
- Transitive dependency likely (check: `npm ls diff`)
- Can cause ReDoS (regular expression denial of service) in `parsePatch`/`applyPatch`

### Approach
1. Upgrade `diff` to >=8.0.3 (check for breaking changes first)
2. Run `npm ci` and test build to ensure no regressions
3. Implement automated dependency scanning in GitHub Actions
4. Create SLA for vulnerability remediation (critical: 1 day, high: 1 week)
5. Add pre-commit checks to audit before push

### Implementation Checklist
- [ ] Run `npm outdated` to check if diff can upgrade
- [ ] If direct dep: `npm install --save diff@^8.0.3`
- [ ] If transitive: find parent and open issue/PR upstream
- [ ] Run `npm run build` to verify no breaking changes
- [ ] Test `@/components/code-viewer.tsx` (likely uses diff for code highlighting)
- [ ] Create GitHub Actions workflow for `npm audit --production`
- [ ] Add Dependabot configuration (GitHub native)
- [ ] Configure critical/high vulnerability alerts to block merges
- [ ] Document vulnerability response SLA

### GitHub Actions Workflow Structure
```yaml
name: Security - Dependency Scan
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm audit --audit-level=high
```

---

## IMPROVEMENT IDEA #5

**Title**: Secure Environment Configuration & Disable Debug Info Leaks
**Category**: Security
**Impact**: Medium
**Effort**: 3-4 Hours

### Files Affected
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` (lines 6-8, debug settings)
- `/home/coder/AgileFlow/apps/docs/.env.example` (environment template)
- `/home/coder/AgileFlow/apps/docs/app/layout.tsx` (remove development artifacts)
- `/home/coder/AgileFlow/apps/docs/components/tailwind-indicator.tsx` (if exists)
- **New file**: `/home/coder/AgileFlow/apps/docs/lib/env.ts` (validated env schema)

### Why This Matters
Current configuration exposes several security considerations:
1. `typescript.ignoreBuildErrors: true` (line 7) suppresses type safety - could hide injection vulnerabilities
2. `devIndicators: false` good but Tailwind indicator component may remain in build
3. `NEXT_PUBLIC_APP_URL` hardcoded to `http://localhost:3002` in dev, but production value not enforced
4. Debug information could leak in error responses if not stripped in production

### Approach
1. Implement environment validation schema using Zod
2. Disable debug indicators only in production
3. Strip sourcemaps in production build
4. Implement strict environment variable checks on startup
5. Add middleware to remove Server-Timing and X-Powered-By headers
6. Create environment audit log showing which env vars are used at startup

### Implementation Checklist
- [ ] Create `lib/env.ts` with Zod schema for all env vars
- [ ] Validate env on app startup (in root layout)
- [ ] Update `next.config.mjs`: `typescript: { ignoreBuildErrors: process.env.NODE_ENV === 'development' }`
- [ ] Add production build check: `sourceMapDebug: false` if available in Next.js
- [ ] Create middleware to strip sensitive headers (Server-Timing, X-Powered-By, X-AspNet-Version)
- [ ] Add environment audit: log which NEXT_PUBLIC_* vars are defined at startup
- [ ] Update `.env.example` with all required vars (NEXT_PUBLIC_APP_URL, etc.)
- [ ] Create `.env.production` template with production URLs
- [ ] Add pre-deploy validation script
- [ ] Test error pages in production mode

### Environment Validation Schema (Zod)
```typescript
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://agileflow.dev'),
  NEXT_PUBLIC_V0_URL: z.string().url().default('https://v0.dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
})

export const env = envSchema.parse(process.env)
```

---

## Cross-Cutting Recommendations

### 1. Create Security Documentation
- **File**: `/home/coder/AgileFlow/docs/02-practices/security-guidelines.md`
- **Content**:
  - CSP policy overview
  - XSS prevention patterns for MDX
  - External resource approval process
  - Environment configuration checklist

### 2. Create Security ADR (Architecture Decision Record)
- **File**: `/home/coder/AgileFlow/docs/03-decisions/ADR-0010-content-security-policy.md`
- **Content**: Decision to implement CSP with nonce-based inline scripts, rationale, alternatives considered

### 3. Update Pre-commit Hook
Add to `.husky/pre-commit`:
```bash
npm audit --production --audit-level=high
npm run lint -- --max-warnings=0
npm run typecheck
```

### 4. Create Security Test Suite
- **File**: `/home/coder/AgileFlow/apps/docs/__tests__/security.test.ts`
- **Tests**:
  - CSP header validation
  - XSS payload rejection in code examples
  - Environment variable presence
  - Remote image URL validation

### 5. Add Security Headers Middleware
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}
```

---

## Implementation Priority

| Priority | Idea | Rationale | Timeline |
|----------|------|-----------|----------|
| 1 (Critical) | #1: CSP Headers | Prevents injection attacks on 114 MDX files | Week 1 |
| 2 (High) | #2: XSS Prevention | Code examples are attack surface with llm.ts processing | Week 1-2 |
| 3 (High) | #4: Dependency Fix | Active vulnerability with DoS impact | Immediate |
| 4 (Medium) | #3: SRI & Images | CDN compromise protection | Week 2 |
| 5 (Medium) | #5: Env Hardening | Build-time security posture | Week 2 |

---

## Verification Checklist (Pre-Release)

Before each release, verify:

- [ ] `npm audit --production` passes (no high/critical vulnerabilities)
- [ ] CSP headers present and valid (test with CSP Evaluator)
- [ ] No inline scripts without nonce attribute
- [ ] All external images use allowed domains (verify remotePatterns)
- [ ] Environment variables validated on startup
- [ ] SRI hashes present on external scripts
- [ ] No dangerouslySetInnerHTML without sanitization
- [ ] Security headers middleware enabled
- [ ] Error pages don't leak system details
- [ ] Performance monitoring configured without exposing system info

---

## Related Files for Reference

**Current Configuration**:
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` - Build configuration
- `/home/coder/AgileFlow/apps/docs/app/layout.tsx` - Root layout with theme script
- `/home/coder/AgileFlow/apps/docs/package.json` - Dependencies (diff vulnerability)
- `/home/coder/AgileFlow/apps/docs/.env.example` - Environment template
- `/home/coder/AgileFlow/apps/docs/mdx-components.tsx` - MDX rendering
- `/home/coder/AgileFlow/apps/docs/lib/llm.ts` - LLM content processing

**Dependencies to Monitor**:
- `fumadocs-*` (13.0.2, 16.0.5) - MDX processing pipeline
- `next` (15.5.9) - Framework security updates
- `react` (19.2.3) - React XSS protections
- `diff` (<8.0.3) - **VULNERABLE** ReDoS in parsePatch

---

## OWASP Top 10 Alignment

| OWASP Risk | Mitigation | Status |
|-----------|-----------|--------|
| A1: Injection | XSS prevention (#2), CSP (#1) | IN PROGRESS |
| A3: Broken Auth | N/A (static site) | COMPLIANT |
| A4: Insecure Design | Env validation (#5) | PLANNED |
| A5: Security Misconfiguration | CSP (#1), Security Headers (#5) | PLANNED |
| A6: Vulnerable Components | Dependency scanning (#4) | IN PROGRESS |
| A7: Auth Bypass | N/A (static site) | COMPLIANT |
| A8: Data Integrity | SRI (#3) | PLANNED |
| A9: Logging Failures | Audit logging (#5) | PLANNED |
| A10: Request Forgery | N/A (no state-changing requests) | COMPLIANT |

---

## Notes

- All findings are RECOMMENDATIONS, not blockers
- Site is static with minimal attack surface (no user auth, database, or API)
- Public documentation site warrants defense-in-depth approach
- Review decisions in arch decision records (ADRs)
- This analysis was performed on v15.5.9 of Next.js; reassess on major version updates

---

**Document Status**: READY FOR REVIEW
**Reviewed By**: AG-SECURITY
**Last Updated**: 2026-01-19
