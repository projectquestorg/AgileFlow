import type { MetadataRoute } from "next"

import { source } from "@/lib/source"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://agileflow.dev"

/**
 * Dynamic sitemap generation for SEO.
 * Generates sitemap entries for all MDX documentation pages.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get all documentation pages from Fumadocs source
  const pages = source.getPages()

  // Static pages that aren't from MDX
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blocks`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/charts`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/themes`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/colors`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ]

  // Documentation pages from MDX files
  const docPages: MetadataRoute.Sitemap = pages.map((page) => {
    // Determine priority based on page depth
    const depth = page.url.split("/").filter(Boolean).length
    const priority = Math.max(0.5, 1.0 - depth * 0.1)

    return {
      url: `${BASE_URL}${page.url}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority,
    }
  })

  return [...staticPages, ...docPages]
}
