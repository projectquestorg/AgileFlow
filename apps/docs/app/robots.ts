import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://agileflow.dev"

/**
 * Robots.txt configuration for search engine crawlers.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/", // API routes
          "/_next/", // Next.js internals
          "/view/", // Component preview pages (duplicate content)
        ],
      },
      {
        // Block AI crawlers that don't respect content licensing
        userAgent: ["GPTBot", "ChatGPT-User", "CCBot", "anthropic-ai"],
        disallow: ["/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
