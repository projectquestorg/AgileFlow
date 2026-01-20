#!/usr/bin/env npx ts-node

/**
 * Auto-translate documentation using Lingva (free, no signup)
 *
 * Usage:
 *   npx ts-node scripts/translate-docs.ts           # Translate all docs
 *   npx ts-node scripts/translate-docs.ts es        # Translate to Spanish only
 *   npx ts-node scripts/translate-docs.ts --dry-run # Preview without writing
 */

import * as fs from "fs"
import * as path from "path"
import { glob } from "glob"

// Lingva instances (free Google Translate proxies)
// Test with: curl "https://lingva.lunar.icu/api/v1/en/es/hello"
const LINGVA_INSTANCES = [
  "https://lingva.lunar.icu",
  "https://lingva.thedaviddelta.com",
  "https://translate.projectsegfau.lt",
]

// Target languages (must match lib/source.ts)
const LANGUAGES: Record<string, string> = {
  es: "Spanish",
  zh: "Chinese",
  ar: "Arabic",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  he: "Hebrew",
}

// Delay between requests to avoid rate limiting
const DELAY_MS = 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function translateText(
  text: string,
  targetLang: string,
  instanceIndex = 0
): Promise<string> {
  if (instanceIndex >= LINGVA_INSTANCES.length) {
    throw new Error("All translation instances failed")
  }

  const instance = LINGVA_INSTANCES[instanceIndex]
  const url = `${instance}/api/v1/en/${targetLang}/${encodeURIComponent(text)}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    if (!data.translation) {
      throw new Error("No translation in response")
    }
    return data.translation
  } catch (error) {
    // Try next instance
    if (instanceIndex < LINGVA_INSTANCES.length - 1) {
      console.log(`  Instance ${instanceIndex + 1} failed, trying next...`)
      await sleep(500)
      return translateText(text, targetLang, instanceIndex + 1)
    }
    throw error
  }
}

// Placeholder map for preserving untranslatable content
const placeholders: Map<string, string> = new Map()
let placeholderIndex = 0

function createPlaceholder(content: string): string {
  const id = `__NOTRANSLATE_${placeholderIndex++}__`
  placeholders.set(id, content)
  return id
}

function restorePlaceholders(text: string): string {
  let result = text
  for (const [id, original] of placeholders) {
    result = result.replace(new RegExp(id, "g"), original)
  }
  return result
}

function extractTranslatableContent(mdx: string): {
  frontmatter: string
  sections: { type: "code" | "text"; content: string }[]
} {
  // Reset placeholders for each file
  placeholders.clear()
  placeholderIndex = 0

  // Extract frontmatter
  const frontmatterMatch = mdx.match(/^---\n([\s\S]*?)\n---/)
  const frontmatter = frontmatterMatch ? frontmatterMatch[0] : ""
  let content = frontmatter ? mdx.slice(frontmatter.length) : mdx

  // Step 1: Replace code blocks with placeholders
  content = content.replace(/```[\s\S]*?```/g, (match) => createPlaceholder(match))

  // Step 2: Replace inline code with placeholders
  content = content.replace(/`[^`\n]+`/g, (match) => createPlaceholder(match))

  // Step 3: Replace JSX components with placeholders (handles nested)
  // Match opening tags, closing tags, and self-closing tags
  content = content.replace(/<[A-Z][a-zA-Z]*[^>]*\/?>/g, (match) => createPlaceholder(match))
  content = content.replace(/<\/[A-Z][a-zA-Z]*>/g, (match) => createPlaceholder(match))

  // Step 4: Replace markdown links/images URLs (keep link text translatable)
  content = content.replace(/\]\([^)]+\)/g, (match) => createPlaceholder(match))

  // Step 5: Replace import statements
  content = content.replace(/^import\s+.*$/gm, (match) => createPlaceholder(match))

  // Now split remaining content into sections
  const sections: { type: "code" | "text"; content: string }[] = []

  // Check if there's any text content left
  if (content.trim()) {
    sections.push({ type: "text", content })
  }

  return { frontmatter, sections }
}

async function translateFrontmatter(
  frontmatter: string,
  targetLang: string
): Promise<string> {
  // Extract title and description for translation
  const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\n/)
  const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\n/)

  let result = frontmatter

  if (titleMatch) {
    const translatedTitle = await translateText(titleMatch[1], targetLang)
    await sleep(DELAY_MS)
    result = result.replace(titleMatch[1], translatedTitle)
  }

  if (descMatch) {
    const translatedDesc = await translateText(descMatch[1], targetLang)
    await sleep(DELAY_MS)
    result = result.replace(descMatch[1], translatedDesc)
  }

  return result
}

async function translateMdxFile(
  filePath: string,
  targetLang: string,
  dryRun: boolean
): Promise<void> {
  const content = fs.readFileSync(filePath, "utf-8")
  const { frontmatter, sections } = extractTranslatableContent(content)

  // Translate frontmatter
  const translatedFrontmatter = await translateFrontmatter(frontmatter, targetLang)

  // Translate text sections
  const translatedSections: string[] = []
  for (const section of sections) {
    if (section.type === "code") {
      translatedSections.push(section.content)
    } else {
      // Split long text into chunks (Lingva has limits)
      const chunks = section.content.match(/[\s\S]{1,1000}/g) || []
      const translatedChunks: string[] = []

      for (const chunk of chunks) {
        if (chunk.trim()) {
          try {
            const translated = await translateText(chunk, targetLang)
            translatedChunks.push(translated)
            await sleep(DELAY_MS)
          } catch (error) {
            console.error(`  Warning: Failed to translate chunk, keeping original`)
            translatedChunks.push(chunk)
          }
        } else {
          translatedChunks.push(chunk)
        }
      }
      translatedSections.push(translatedChunks.join(""))
    }
  }

  // Restore placeholders (JSX components, code blocks, etc.)
  const translatedContent = restorePlaceholders(
    translatedFrontmatter + translatedSections.join("")
  )

  // Determine output path
  const relativePath = path.relative(
    path.join(process.cwd(), "content/docs"),
    filePath
  )
  const outputPath = path.join(
    process.cwd(),
    "content/docs",
    targetLang,
    relativePath
  )

  if (dryRun) {
    console.log(`  Would write: ${outputPath}`)
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, translatedContent)
    console.log(`  Written: ${outputPath}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")

  // Separate languages from file paths
  const nonFlags = args.filter((a) => !a.startsWith("--"))
  const langs = nonFlags.filter((a) => a in LANGUAGES)
  const specificFiles = nonFlags.filter((a) => a.endsWith(".mdx"))

  const langsToTranslate = langs.length > 0 ? langs : Object.keys(LANGUAGES)

  if (langsToTranslate.length === 0) {
    console.log("Available languages:", Object.keys(LANGUAGES).join(", "))
    process.exit(1)
  }

  // Use specific files if provided, otherwise find all English MDX files
  let mdxFiles: string[]
  if (specificFiles.length > 0) {
    // Normalize paths (remove apps/docs/ prefix if present)
    mdxFiles = specificFiles.map((f) => f.replace(/^apps\/docs\//, ""))
    console.log(`Translating ${mdxFiles.length} specific files`)
  } else {
    mdxFiles = await glob("content/docs/**/*.mdx", {
      ignore: Object.keys(LANGUAGES).map((l) => `content/docs/${l}/**`),
    })
    console.log(`Found ${mdxFiles.length} files to translate`)
  }

  console.log(`Target languages: ${langsToTranslate.join(", ")}`)
  console.log(`Dry run: ${dryRun}\n`)

  for (const lang of langsToTranslate) {
    console.log(`\nTranslating to ${LANGUAGES[lang]} (${lang})...`)

    for (const file of mdxFiles) {
      console.log(`  Processing: ${file}`)
      try {
        await translateMdxFile(file, lang, dryRun)
      } catch (error) {
        console.error(`  Error translating ${file}:`, error)
      }
    }
  }

  console.log("\nDone!")
}

main().catch(console.error)
