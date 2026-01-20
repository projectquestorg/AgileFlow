import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Content Security Policy Middleware
 *
 * Implements security headers including CSP with nonce-based script security.
 * The nonce is generated per-request and passed to the layout via headers.
 */
export function middleware(request: NextRequest) {
  // Generate a cryptographic nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")

  // Build CSP directives
  const cspDirectives = [
    // Default: only allow same-origin
    "default-src 'self'",

    // Scripts: self + nonce for inline scripts + Vercel Analytics
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://va.vercel-scripts.com`,

    // Styles: self + unsafe-inline (required for Tailwind/CSS-in-JS)
    "style-src 'self' 'unsafe-inline'",

    // Images: self + whitelisted domains
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://images.unsplash.com https://avatar.vercel.sh",

    // Fonts: self + common font CDNs
    "font-src 'self' data:",

    // Connect: self + Vercel Analytics + API routes
    "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",

    // Frame: deny all framing (clickjacking protection)
    "frame-ancestors 'none'",

    // Form actions: self only
    "form-action 'self'",

    // Base URI: self only
    "base-uri 'self'",

    // Object: none (blocks plugins like Flash)
    "object-src 'none'",

    // Upgrade insecure requests in production
    ...(process.env.NODE_ENV === "production"
      ? ["upgrade-insecure-requests"]
      : []),
  ]

  const cspHeader = cspDirectives.join("; ")

  // Clone the request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)

  // Create response with security headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Set Content Security Policy
  response.headers.set("Content-Security-Policy", cspHeader)

  // Additional security headers
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  )

  // Remove server identification headers (security hardening)
  // These headers can leak server information to attackers
  const sensitiveHeaders = ["X-Powered-By", "Server", "Server-Timing"]
  for (const header of sensitiveHeaders) {
    response.headers.delete(header)
  }

  return response
}

// Apply middleware to all routes except static files
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
