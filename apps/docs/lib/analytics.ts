/**
 * Analytics Event Tracking
 *
 * This module provides type-safe event tracking for the AgileFlow documentation site.
 * It integrates with Plausible Analytics for privacy-friendly tracking.
 *
 * @see https://plausible.io/docs/custom-event-goals
 */

// Event categories for documentation site
export type AnalyticsEvent =
  | { name: "search"; props: { query: string; results_count: number } }
  | { name: "copy_code"; props: { component: string; language?: string } }
  | { name: "copy_command"; props: { command: string } }
  | { name: "navigation"; props: { from: string; to: string } }
  | { name: "theme_change"; props: { theme: "light" | "dark" | "system" } }
  | { name: "external_link"; props: { url: string; text?: string } }
  | { name: "tutorial_start"; props: { tutorial: string } }
  | { name: "tutorial_complete"; props: { tutorial: string; duration_ms: number } }
  | { name: "tutorial_step"; props: { tutorial: string; step: number; total: number } }
  | { name: "feedback"; props: { helpful: boolean; page: string } }
  | { name: "error"; props: { message: string; page: string } }

/**
 * Track an analytics event.
 * Events are sent to Plausible if configured, and logged in development.
 *
 * @example
 * trackEvent({ name: "search", props: { query: "sidebar", results_count: 5 } })
 * trackEvent({ name: "copy_code", props: { component: "Button" } })
 */
export function trackEvent<T extends AnalyticsEvent>(event: T): void {
  // Log in development for debugging
  if (process.env.NODE_ENV === "development") {
    console.log("[Analytics]", event.name, event.props)
  }

  // Send to Plausible if available
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(event.name, { props: event.props })
  }
}

/**
 * Track a page view (useful for SPA-style navigation).
 * Plausible tracks page views automatically, but this can be used for manual tracking.
 */
export function trackPageView(url?: string): void {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible("pageview", { u: url ?? window.location.href })
  }
}

// TypeScript declaration for Plausible global
declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, unknown>; u?: string }
    ) => void
  }
}

/**
 * Analytics Event Schema Documentation
 *
 * | Event Name         | Props                                    | Description                       |
 * |--------------------|------------------------------------------|-----------------------------------|
 * | search             | query, results_count                     | User searches documentation       |
 * | copy_code          | component, language?                     | User copies code block            |
 * | copy_command       | command                                  | User copies CLI command           |
 * | navigation         | from, to                                 | User navigates between pages      |
 * | theme_change       | theme                                    | User changes color theme          |
 * | external_link      | url, text?                               | User clicks external link         |
 * | tutorial_start     | tutorial                                 | User starts a tutorial            |
 * | tutorial_complete  | tutorial, duration_ms                    | User completes a tutorial         |
 * | tutorial_step      | tutorial, step, total                    | User advances in tutorial         |
 * | feedback           | helpful, page                            | User submits feedback             |
 * | error              | message, page                            | Error occurs on page              |
 */
