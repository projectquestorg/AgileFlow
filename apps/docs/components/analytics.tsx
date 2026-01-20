"use client"

import { Analytics as VercelAnalytics } from "@vercel/analytics/react"

import { PlausibleAnalytics } from "@/components/plausible"

/**
 * Combined Analytics Component
 *
 * Includes:
 * - Vercel Analytics (automatic page views, web vitals)
 * - Plausible Analytics (privacy-friendly, custom events)
 *
 * Configure Plausible by setting NEXT_PUBLIC_PLAUSIBLE_DOMAIN
 */
export function Analytics() {
  return (
    <>
      <VercelAnalytics />
      <PlausibleAnalytics />
    </>
  )
}
