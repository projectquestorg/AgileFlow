"use client"

import Script from "next/script"

/**
 * Plausible Analytics Component
 *
 * Privacy-friendly analytics with custom event support.
 * Configure by setting NEXT_PUBLIC_PLAUSIBLE_DOMAIN in your environment.
 *
 * @see https://plausible.io/docs/plausible-script
 */
export function PlausibleAnalytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN

  // Skip if no domain configured
  if (!domain) {
    return null
  }

  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  )
}
