# Security Policy - AgileFlow Documentation Site

This document describes the security measures implemented for the AgileFlow documentation site.

## Content Security Policy (CSP)

The site implements a strict Content Security Policy via `middleware.ts` to protect against XSS and other injection attacks.

### CSP Directives

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Default fallback - only same-origin |
| `script-src` | `'self' 'nonce-{random}' 'strict-dynamic' https://va.vercel-scripts.com` | Scripts with nonce + Vercel Analytics |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind CSS requires inline styles |
| `img-src` | `'self' data: blob: https://avatars.githubusercontent.com https://images.unsplash.com https://avatar.vercel.sh` | Whitelisted image sources |
| `font-src` | `'self' data:` | Self-hosted fonts only |
| `connect-src` | `'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com` | API + Analytics |
| `frame-ancestors` | `'none'` | Prevent clickjacking |
| `form-action` | `'self'` | Forms submit to same origin only |
| `base-uri` | `'self'` | Prevent base tag injection |
| `object-src` | `'none'` | Block plugins (Flash, etc.) |

### Nonce-Based Script Security

Inline scripts use a cryptographic nonce generated per-request:

1. `middleware.ts` generates a random nonce via `crypto.randomUUID()`
2. The nonce is passed to the layout via the `x-nonce` header
3. `layout.tsx` reads the nonce and applies it to inline `<script>` tags
4. CSP only allows scripts with matching nonce to execute

### How to Add New Inline Scripts

If you need to add a new inline script:

```tsx
// In a server component
import { headers } from "next/headers"

async function MyComponent() {
  const headersList = await headers()
  const nonce = headersList.get("x-nonce") ?? undefined

  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: `console.log('This script has a nonce!')`
      }}
    />
  )
}
```

### Adding New External Script Sources

To allow scripts from a new domain, update `middleware.ts`:

```typescript
// In cspDirectives array
`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://va.vercel-scripts.com https://new-domain.com`,
```

## Additional Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking (legacy) |
| `X-XSS-Protection` | `1; mode=block` | Enable XSS filter (legacy browsers) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disable sensitive APIs |

## Remote Image Sources

Allowed image sources are configured in `next.config.mjs`:

- `avatars.githubusercontent.com` - GitHub user avatars
- `images.unsplash.com` - Unsplash stock photos
- `avatar.vercel.sh` - Vercel avatar service

To add a new image source:

```javascript
// In next.config.mjs
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "new-domain.com",
    },
  ],
},
```

## Dependency Security

- **npm audit**: Integrated into CI pipeline (`.github/workflows/ci.yml`)
- **Dependabot**: Configured for weekly security scans (`.github/dependabot.yml`)
- **Remediation SLA**: See `SECURITY_IMPROVEMENTS.md` for response time requirements

## Testing CSP

### Browser DevTools

1. Open the site in Chrome/Firefox
2. Open DevTools → Console
3. CSP violations will appear as errors with the blocked resource

### Online Tools

- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - Google's CSP analysis tool
- [Mozilla Observatory](https://observatory.mozilla.org/) - Security header scanner

### Local Testing

```bash
# Start the dev server
npm run dev

# Check response headers
curl -I http://localhost:3000 | grep -i "content-security-policy"
```

## Reporting Security Issues

If you discover a security vulnerability, please email security@agileflow.dev or open a private security advisory on GitHub.

---

**Last Updated**: January 20, 2026
**Implemented in**: US-0151 (EP-0024)
