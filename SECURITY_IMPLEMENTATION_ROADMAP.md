# AgileFlow Documentation Security - Implementation Roadmap

**Created**: 2026-01-19
**Status**: READY FOR IMPLEMENTATION
**Owner**: AG-SECURITY Specialist
**Stakeholders**: Frontend Team, DevOps, Project Lead

---

## Executive Summary

5 security improvements identified for the Fumadocs-based documentation site. Total effort: 5.5-10 days. Can be parallelized. Critical path: Weeks 1-2. All improvements map to OWASP Top 10 mitigations.

---

## Week 1: Critical Path (Inject Prevention)

### Day 1: Setup & Planning

**Tasks**:
1. Read this roadmap with team
2. Create GitHub issues for each improvement
3. Assign developers:
   - Developer A: Ideas #1 & #5 (CSP + Env)
   - Developer B: Idea #2 (XSS Prevention)
   - Developer C: Idea #4 (Dependencies)
   - Developer D: Idea #3 (SRI, parallel after Day 2)
4. Setup test environment: `npm run dev --turbopack`
5. Create feature branches: `feat/security-csp`, `feat/security-xss`, etc.

**Definition of Done**:
- GitHub issues created with acceptance criteria
- Branches created
- Testing strategy documented

---

## Week 1: IDEA #4 (Fix Dependencies) - HIGHEST PRIORITY

**Timeline**: Day 1-2 (Immediate)
**Owner**: Developer C
**Effort**: 2-3 hours

### Step 1: Analyze Current Vulnerability (30 min)

```bash
cd /home/coder/AgileFlow/apps/docs

# Check exact vulnerability
npm audit

# Determine if direct or transitive
npm ls diff

# If transitive, find parent:
npm ls | grep -A 5 diff
```

### Step 2: Attempt Upgrade (1 hour)

```bash
# Check latest version
npm view diff versions --json | tail -5

# Try upgrade
npm install diff@latest

# Check for breaking changes
npm run build

# Test in browser
npm run dev
# Navigate to code viewer components
```

### Step 3: Verify No Regressions (30 min)

```bash
# Run tests
npm run typecheck
npm run lint

# Specific test: code viewer with syntax highlighting
# File: /home/coder/AgileFlow/apps/docs/components/code-viewer.tsx
# Verify highlighting still works after diff upgrade
```

### Step 4: Commit & Document (30 min)

```bash
git add package.json package-lock.yaml
git commit -m "fix(security): upgrade diff to resolve ReDoS vulnerability"
git push origin feat/security-deps
```

**Acceptance Criteria**:
- [ ] jsdiff upgraded to >=8.0.3
- [ ] npm audit shows 0 vulnerabilities
- [ ] `npm run build` succeeds
- [ ] Code viewer still highlights syntax correctly
- [ ] Commit message references CVE

---

## Week 1: IDEA #1 (CSP Headers) - HIGH PRIORITY

**Timeline**: Day 1-2 (2-4 hours)
**Owner**: Developer A
**Effort**: 2-4 hours
**Complexity**: Medium (middleware + nonce generation)

### Step 1: Create Middleware (1 hour)

**File**: `/home/coder/AgileFlow/apps/docs/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateNonce } from '@/lib/security'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const nonce = generateNonce()

  // CSP Header with nonce for inline scripts
  response.headers.set(
    'Content-Security-Policy',
    `
      default-src 'self';
      script-src 'self' 'nonce-${nonce}' https://analytics.vercel.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' https://avatars.githubusercontent.com https://images.unsplash.com https://avatar.vercel.sh;
      font-src 'self';
      connect-src 'self' https://analytics.vercel.com;
      frame-ancestors 'none';
      form-action 'self';
      base-uri 'self';
    `.replace(/\s+/g, ' ').trim()
  )

  // Store nonce in response header for use in layout
  response.headers.set('X-Nonce', nonce)

  // Additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Step 2: Create Security Helper (30 min)

**File**: `/home/coder/AgileFlow/apps/docs/lib/security.ts`

```typescript
import crypto from 'crypto'

export function generateNonce(): string {
  return crypto.randomUUID()
}

export function getCurrentNonce(): string {
  // In Server Component:
  // import { headers } from 'next/headers'
  // const headersList = await headers()
  // return headersList.get('X-Nonce') || ''
  return ''
}
```

### Step 3: Update Layout to Use Nonce (1 hour)

**File**: `/home/coder/AgileFlow/apps/docs/app/layout.tsx` (lines 72-85)

**Current**:
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `...`
  }}
/>
```

**Updated**:
```tsx
// At top of file (Server Component)
import { headers } from 'next/headers'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const headersList = await headers()
  const nonce = headersList.get('X-Nonce') || ''

  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <script
          nonce={nonce}  // Add nonce attribute
          dangerouslySetInnerHTML={{
            __html: `...`
          }}
        />
        {/* rest of head */}
      </head>
      {/* rest of body */}
    </html>
  )
}
```

### Step 4: Test & Verify (1.5 hours)

```bash
# Start dev server
npm run dev

# Test CSP headers with curl
curl -I http://localhost:3002 | grep Content-Security-Policy

# Verify nonce is random (should differ each request)
curl -I http://localhost:3002 | grep X-Nonce
curl -I http://localhost:3002 | grep X-Nonce

# Test theme functionality still works
# Open browser: localhost:3002
# Toggle dark/light theme
# Check browser console for no CSP violations

# Use CSP Evaluator
# https://csp-evaluator.withgoogle.com/
# Paste CSP header, verify no issues

# Test with security headers checker
curl https://localhost:3002 | grep -i "Strict-Transport"
```

### Step 5: Create Test File (30 min)

**File**: `/home/coder/AgileFlow/apps/docs/__tests__/security-csp.test.ts`

```typescript
import { middleware } from '@/middleware'
import { NextRequest, NextResponse } from 'next/server'

describe('CSP Headers', () => {
  it('should include CSP header with nonce', async () => {
    const request = new NextRequest(new URL('http://localhost:3002'))
    const response = await middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain('script-src')
    expect(csp).toContain("'nonce-")
    expect(csp).toContain('https://analytics.vercel.com')
  })

  it('should not allow inline scripts without nonce', async () => {
    const request = new NextRequest(new URL('http://localhost:3002'))
    const response = await middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).not.toContain("'unsafe-inline'")
  })

  it('should restrict img-src to approved domains', async () => {
    const request = new NextRequest(new URL('http://localhost:3002'))
    const response = await middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain('avatars.githubusercontent.com')
    expect(csp).toContain('images.unsplash.com')
    expect(csp).toContain('avatar.vercel.sh')
  })
})
```

**Acceptance Criteria**:
- [ ] Middleware created and exports correctly
- [ ] CSP header present on all responses
- [ ] Nonce generated and unique per request
- [ ] Theme script uses nonce attribute
- [ ] Theme preload functionality works
- [ ] CSP Evaluator shows no violations
- [ ] Security tests pass
- [ ] No console errors in browser

---

## Week 1: IDEA #2 (XSS Prevention) - HIGH PRIORITY

**Timeline**: Day 2-4 (1-2 days)
**Owner**: Developer B
**Effort**: 1-2 days
**Complexity**: High (sanitization + validation + testing)

### Step 1: Install Sanitization Library (15 min)

```bash
npm install isomorphic-dompurify
npm install --save-dev @types/dompurify
```

### Step 2: Create Sanitization Helper (45 min)

**File**: `/home/coder/AgileFlow/apps/docs/lib/sanitize.ts`

```typescript
import DOMPurify from 'isomorphic-dompurify'

interface SanitizeOptions {
  allowHtml?: boolean
  maxLength?: number
}

export function sanitizeCodeBlock(
  code: string,
  options: SanitizeOptions = {}
): string {
  const { allowHtml = false, maxLength = 50000 } = options

  // Check length
  if (code.length > maxLength) {
    console.warn(`Code block exceeds max length: ${code.length}`)
    return code.substring(0, maxLength) + '\n... [truncated]'
  }

  // If allowing HTML, sanitize; otherwise, escape HTML entities
  if (allowHtml) {
    return DOMPurify.sanitize(code, {
      ALLOWED_TAGS: ['code', 'pre', 'span', 'br'],
      ALLOWED_ATTR: ['class', 'data-language'],
    })
  }

  // Escape HTML entities for display as text
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export function validateComponentPreviewName(name: string): boolean {
  // Whitelist: alphanumeric, dash, underscore only
  // Prevent directory traversal: ../ ../
  const whitelistRegex = /^[a-zA-Z0-9_-]+$/
  const hasDirTraversal = name.includes('..') || name.includes('/')

  return whitelistRegex.test(name) && !hasDirTraversal
}
```

### Step 3: Update llm.ts (1 hour)

**File**: `/home/coder/AgileFlow/apps/docs/lib/llm.ts`

**Current Code** (lines 6-34):
```typescript
export function processMdxForLLMs(content: string, style: Style["name"]) {
  const componentPreviewRegex =
    /<ComponentPreview[\s\S]*?name="([^"]+)"[\s\S]*?\/>/g

  return content.replace(componentPreviewRegex, (match, name) => {
    try {
      const component = Index[style]?.[name]
      if (!component?.files) {
        return match
      }

      const src = component.files[0]?.path
      if (!src) {
        return match
      }

      let source = fs.readFileSync(src, "utf8")
      source = source.replaceAll(`@/registry/new-york-v4/`, "@/components/")
      source = source.replaceAll("export default", "export")

      return `\`\`\`tsx
${source}
\`\`\``
    } catch (error) {
      console.error(`Error processing ComponentPreview ${name}:`, error)
      return match
    }
  })
}
```

**Updated Code**:
```typescript
import { sanitizeCodeBlock, validateComponentPreviewName } from './sanitize'

export function processMdxForLLMs(content: string, style: Style["name"]) {
  const componentPreviewRegex =
    /<ComponentPreview[\s\S]*?name="([^"]+)"[\s\S]*?\/>/g

  return content.replace(componentPreviewRegex, (match, name) => {
    try {
      // VALIDATION: Check for directory traversal attacks
      if (!validateComponentPreviewName(name)) {
        console.warn(`Invalid ComponentPreview name: ${name}`)
        return match
      }

      const component = Index[style]?.[name]
      if (!component?.files) {
        return match
      }

      const src = component.files[0]?.path
      if (!src) {
        return match
      }

      let source = fs.readFileSync(src, "utf8")
      source = source.replaceAll(`@/registry/new-york-v4/`, "@/components/")
      source = source.replaceAll("export default", "export")

      // SANITIZATION: Escape HTML entities in code blocks
      const sanitized = sanitizeCodeBlock(source)

      return `\`\`\`tsx
${sanitized}
\`\`\``
    } catch (error) {
      console.error(`Error processing ComponentPreview ${name}:`, error)
      return match
    }
  })
}
```

### Step 4: Update MDX Code Components (45 min)

**File**: `/home/coder/AgileFlow/apps/docs/mdx-components.tsx` (update code/pre handlers)

Add to existing mdxComponents:

```typescript
code: ({ className, children, ...props }: React.ComponentProps<"code">) => {
  // Ensure code is properly escaped
  const content = String(children)
  const sanitized = sanitizeCodeBlock(content)

  return (
    <code className={cn("font-mono text-sm", className)} {...props}>
      {sanitized}
    </code>
  )
},

pre: ({ className, ...props }: React.ComponentProps<"pre">) => {
  // Parent container for code blocks
  return (
    <pre className={cn("overflow-x-auto rounded-lg bg-slate-900 p-4", className)} {...props} />
  )
},
```

### Step 5: Create Tests (45 min)

**File**: `/home/coder/AgileFlow/apps/docs/__tests__/security-xss.test.ts`

```typescript
import {
  sanitizeCodeBlock,
  validateComponentPreviewName,
} from '@/lib/sanitize'

describe('XSS Prevention', () => {
  describe('sanitizeCodeBlock', () => {
    it('should escape HTML entities', () => {
      const malicious = '<script>alert("XSS")</script>'
      const result = sanitizeCodeBlock(malicious)
      expect(result).toContain('&lt;script&gt;')
      expect(result).not.toContain('<script>')
    })

    it('should escape dangerous HTML', () => {
      const dangerous = '<img src=x onerror="alert(1)">'
      const result = sanitizeCodeBlock(dangerous)
      expect(result).toContain('&lt;img')
      expect(result).not.toContain('onerror')
    })

    it('should handle long code blocks', () => {
      const longCode = 'const x = 1;\n'.repeat(10000)
      const result = sanitizeCodeBlock(longCode, { maxLength: 100 })
      expect(result.length).toBeLessThanOrEqual(100 + 20) // 20 for truncation msg
    })
  })

  describe('validateComponentPreviewName', () => {
    it('should allow valid names', () => {
      expect(validateComponentPreviewName('Button')).toBe(true)
      expect(validateComponentPreviewName('button-primary')).toBe(true)
      expect(validateComponentPreviewName('button_v2')).toBe(true)
    })

    it('should reject directory traversal', () => {
      expect(validateComponentPreviewName('../../../etc/passwd')).toBe(false)
      expect(validateComponentPreviewName('..\\button')).toBe(false)
      expect(validateComponentPreviewName('folder/button')).toBe(false)
    })

    it('should reject special characters', () => {
      expect(validateComponentPreviewName('button<script>')).toBe(false)
      expect(validateComponentPreviewName('button;alert(1)')).toBe(false)
      expect(validateComponentPreviewName('button&test')).toBe(false)
    })
  })
})
```

### Step 6: Manual Testing (30 min)

```bash
# Start dev server
npm run dev

# Open browser: localhost:3002/commands/first-command (or any MDX page)
# Open DevTools Console - verify no CSP violations
# Test code blocks render correctly
# Test dark/light theme still works

# Try to trigger XSS (should be escaped):
# Manually add <script> to MDX test file
# Verify script does NOT execute
```

**Acceptance Criteria**:
- [ ] isomorphic-dompurify installed
- [ ] sanitizeCodeBlock() escapes HTML entities
- [ ] validateComponentPreviewName() prevents traversal
- [ ] llm.ts uses sanitization
- [ ] mdx-components code/pre handlers use sanitization
- [ ] All XSS tests pass
- [ ] Code blocks render correctly in browser
- [ ] No console warnings

---

## Week 2: IDEA #3 (SRI & Images) - MEDIUM PRIORITY

**Timeline**: Day 5-7 (4-6 hours)
**Owner**: Developer D (after Day 2)
**Effort**: 4-6 hours
**Complexity**: Medium (hash generation + validation)

### Step 1: Generate SRI Hashes (1 hour)

```bash
# For Vercel Analytics
curl -s https://cdn.vercel-analytics.com/v1/script.js | \
  openssl dgst -sha384 -binary | openssl enc -base64

# Output: sha384-XXXXX (copy this)

# Store in environment
echo "NEXT_PUBLIC_ANALYTICS_SRI=sha384-XXXXX" >> .env.local
```

### Step 2: Create SRI Helper (30 min)

**File**: `/home/coder/AgileFlow/apps/docs/lib/security.ts` (add to existing)

```typescript
export const EXTERNAL_RESOURCES = {
  analytics: {
    src: 'https://cdn.vercel-analytics.com/v1/script.js',
    integrity: process.env.NEXT_PUBLIC_ANALYTICS_SRI || '',
    crossOrigin: 'anonymous' as const,
  },
} as const

export function validateImageSize(
  size: number,
  maxSizeMb: number = 5
): boolean {
  return size <= maxSizeMb * 1024 * 1024
}

export function validateImageUrl(url: string): boolean {
  const allowedDomains = [
    'avatars.githubusercontent.com',
    'images.unsplash.com',
    'avatar.vercel.sh',
  ]

  try {
    const urlObj = new URL(url)
    return (
      allowedDomains.some(domain =>
        urlObj.hostname.includes(domain)
      ) && urlObj.protocol === 'https:'
    )
  } catch {
    return false
  }
}
```

### Step 3: Update Analytics Component (30 min)

**File**: `/home/coder/AgileFlow/apps/docs/components/analytics.tsx` (or where analytics is loaded)

```typescript
import { EXTERNAL_RESOURCES } from '@/lib/security'

export function Analytics() {
  return (
    <>
      <script
        async
        src={EXTERNAL_RESOURCES.analytics.src}
        integrity={EXTERNAL_RESOURCES.analytics.integrity}
        crossOrigin={EXTERNAL_RESOURCES.analytics.crossOrigin}
      />
    </>
  )
}
```

### Step 4: Add Image Validation (1 hour)

**File**: `/home/coder/AgileFlow/apps/docs/components/secure-image.tsx` (NEW)

```typescript
import Image from 'next/image'
import { validateImageUrl, validateImageSize } from '@/lib/security'

interface SecureImageProps
  extends React.ComponentProps<typeof Image> {
  src: string
  alt: string
}

export function SecureImage({ src, ...props }: SecureImageProps) {
  // Validate URL
  if (!validateImageUrl(src)) {
    console.warn(`Image blocked: ${src} is not from approved domain`)
    return <div className="bg-gray-200 p-4">Image not available</div>
  }

  return (
    <Image
      {...props}
      src={src}
      onError={() => {
        console.warn(`Failed to load image: ${src}`)
      }}
    />
  )
}
```

### Step 5: Update next.config.mjs (30 min)

```javascript
const nextConfig = {
  // ... existing config

  headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Require-SRI-For',
            value: 'script',
          },
        ],
      },
    ]
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'avatar.vercel.sh',
      },
    ],
  },

  // ... rest of config
}
```

### Step 6: Testing (1.5 hours)

```bash
# Build and test
npm run build

# Start production server
npm run start

# Verify SRI hashes in response
curl -I http://localhost:3001 | grep -i "require-sri"

# Test image loading
# Verify images load from approved domains only
# Check DevTools Network tab: images have correct URL

# Test with CSP policy including require-sri-for
```

**Acceptance Criteria**:
- [ ] SRI hash generated and stored
- [ ] Analytics script includes integrity attribute
- [ ] Require-SRI-For header present
- [ ] Image validation function working
- [ ] Only approved image domains load
- [ ] Build succeeds
- [ ] Images load in production

---

## Week 2: IDEA #5 (Environment Hardening) - MEDIUM PRIORITY

**Timeline**: Day 5-6 (3-4 hours)
**Owner**: Developer A
**Effort**: 3-4 hours
**Complexity**: Medium (Zod schema + middleware)

### Step 1: Install Zod (15 min)

```bash
npm install zod
```

### Step 2: Create Environment Schema (45 min)

**File**: `/home/coder/AgileFlow/apps/docs/lib/env.ts` (NEW)

```typescript
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('https://agileflow.dev'),

  NEXT_PUBLIC_V0_URL: z
    .string()
    .url('NEXT_PUBLIC_V0_URL must be a valid URL')
    .default('https://v0.dev'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  NEXT_PUBLIC_ANALYTICS_SRI: z.string().optional(),
})

export type Environment = z.infer<typeof envSchema>

let cachedEnv: Environment

export function getEnv(): Environment {
  if (cachedEnv) {
    return cachedEnv
  }

  try {
    cachedEnv = envSchema.parse(process.env)
    logEnvironmentAudit(cachedEnv)
    return cachedEnv
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Environment validation failed:')
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`)
      })
    }
    throw new Error('Failed to validate environment variables')
  }
}

function logEnvironmentAudit(env: Environment): void {
  const publicVars = Object.entries(env)
    .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
    .map(([key, value]) => `${key}=${value}`)

  console.log('[SECURITY] Environment loaded:', {
    env: env.NODE_ENV,
    publicVars,
  })
}
```

### Step 3: Update Root Layout (30 min)

**File**: `/home/coder/AgileFlow/apps/docs/app/layout.tsx`

Add at top:

```typescript
import { getEnv } from '@/lib/env'

// Call on app startup
const env = getEnv()

// Use in metadata:
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  // ... rest of metadata
}
```

### Step 4: Update next.config.mjs (30 min)

```javascript
const nextConfig = {
  // Only disable errors in development
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },

  // Disable source maps in production
  productionBrowserSourceMaps: false,

  // ... rest of config
}
```

### Step 5: Create Environment Template (30 min)

Update `/home/coder/AgileFlow/apps/docs/.env.example`:

```
# Environment Configuration
# This file template documents all required environment variables

# PUBLIC: Exposed to browser (prefix with NEXT_PUBLIC_)
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_V0_URL=https://v0.dev
NEXT_PUBLIC_ANALYTICS_SRI=sha384-xxxxx

# PRIVATE: Server-side only
NODE_ENV=development
```

### Step 6: Create Validation Tests (1 hour)

**File**: `/home/coder/AgileFlow/apps/docs/__tests__/security-env.test.ts`

```typescript
import { getEnv } from '@/lib/env'

describe('Environment Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should validate required URLs are valid', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://agileflow.dev'
    process.env.NEXT_PUBLIC_V0_URL = 'https://v0.dev'

    expect(() => getEnv()).not.toThrow()
  })

  it('should reject invalid URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not-a-url'

    expect(() => getEnv()).toThrow()
  })

  it('should validate NODE_ENV is valid enum', () => {
    process.env.NODE_ENV = 'invalid-env'

    expect(() => getEnv()).toThrow()
  })

  it('should use defaults for optional vars', () => {
    const env = getEnv()

    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://agileflow.dev')
    expect(env.NODE_ENV).toBe('development')
  })
})
```

**Acceptance Criteria**:
- [ ] Zod schema validates all env vars
- [ ] App fails fast if invalid env on startup
- [ ] getEnv() called in layout.tsx
- [ ] typings exported for use in components
- [ ] .env.example updated with all vars
- [ ] Environment validation tests pass
- [ ] Production build strips source maps

---

## Week 3: Security Audit & Release

### Day 8: Full Testing & Security Review

**Tasks**:
1. Run full security checklist
2. Test all 5 improvements together
3. Security code review with team
4. Performance testing (ensure no regressions)
5. Accessibility check (CSP shouldn't break a11y)

### Day 9: Documentation & Deployment

**Tasks**:
1. Create/update security documentation
2. Create architecture decision record (ADR)
3. Update CHANGELOG
4. Deploy to staging
5. Final security scan
6. Deploy to production

---

## Testing & Verification

### Before Merge (PR Checklist)

- [ ] Code review by another developer
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console warnings or errors
- [ ] Manual testing completed
- [ ] Performance impact assessed (< 50ms)

### Before Release

- [ ] `npm audit --production` passes
- [ ] CSP headers validated
- [ ] XSS payloads rejected
- [ ] SRI hashes verified
- [ ] Environment validation working
- [ ] Security tests passing
- [ ] Team security review complete
- [ ] Stakeholders approved

### Production Monitoring

Monitor these metrics post-release:
- CSP violation logs
- 404 errors (broken image domains)
- Performance (Core Web Vitals)
- Error rate
- Deployment time

---

## Risk Mitigation

### If CSP Breaks

1. Switch to report-only mode: `Content-Security-Policy-Report-Only`
2. Review violation logs
3. Add additional nonce to scripts
4. Update allowed domains

### If SRI Fails

1. Verify hash is correct
2. Check integrity attribute format
3. Ensure crossOrigin="anonymous" present
4. Test with different browsers

### If XSS Sanitization Too Aggressive

1. Whitelist specific HTML tags
2. Create exceptions for documentation
3. Use allowlist instead of denylist

---

## Rollback Plan

If critical issues arise:

```bash
# Revert commits
git revert <commit-sha>

# Redeploy previous version
npm run build
npm run start

# Investigation
git log --oneline -10
git diff main..feat/security-*
```

---

## Success Metrics

After implementing all 5 improvements:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| npm audit vulnerabilities | 1 low | 0 | 0 |
| CSP violations | N/A | 0 | 0 |
| XSS test payloads blocked | 0/10 | 10/10 | 100% |
| Environment validation | None | ✓ | ✓ |
| SRI hashes verified | 0/1 | 1/1 | 100% |
| Build time | 45s | 50s | <60s |
| Security score | 70/100 | 95/100 | >90 |

---

## Communication Plan

### Day 1: Kickoff
- Share this roadmap with team
- Discuss approach and timeline
- Assign developers
- Create GitHub issues

### Weekly: Status Updates
- Monday: Sprint planning
- Wednesday: Mid-week sync
- Friday: Demo + retrospective

### Upon Completion
- Technical blog post on security improvements
- Update SECURITY.md in repo
- Present to stakeholders

---

## Resources

**Documentation**:
- [Next.js Security Best Practices](https://nextjs.org/docs/basic-features/security)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Zod Documentation](https://zod.dev/)

**Tools**:
- CSP Evaluator: https://csp-evaluator.withgoogle.com/
- Security Headers: https://securityheaders.com/
- Observatory: https://observatory.mozilla.org/

**Related Files**:
- `/home/coder/AgileFlow/SECURITY_IMPROVEMENTS.md` - Full analysis
- `/home/coder/AgileFlow/SECURITY_IMPROVEMENTS_SUMMARY.md` - Executive summary
- `/home/coder/AgileFlow/SECURITY_IMPROVEMENTS_QUICK_REF.txt` - Quick reference

---

## Approval Sign-Off

- **Project Lead**: _______________  Date: ___
- **Security Owner**: AG-SECURITY  Date: 2026-01-19
- **Tech Lead**: _______________  Date: ___

---

**Document Status**: APPROVED FOR IMPLEMENTATION
**Next Step**: Create GitHub issues from this roadmap
**Review Date**: 2026-01-26 (after Week 1 completion)
