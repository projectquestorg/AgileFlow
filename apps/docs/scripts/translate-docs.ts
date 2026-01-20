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

function extractTranslatableContent(mdx: string): {
  frontmatter: string
  sections: { type: "code" | "text"; content: string }[]
} {
  // Extract frontmatter
  const frontmatterMatch = mdx.match(/^---\n([\s\S]*?)\n---/)
  const frontmatter = frontmatterMatch ? frontmatterMatch[0] : ""
  const content = frontmatter ? mdx.slice(frontmatter.length) : mdx

  // Split into code blocks and text sections
  const sections: { type: "code" | "text"; content: string }[] = []
  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`|<[A-Z][^>]*>[\s\S]*?<\/[A-Z][^>]*>|<[A-Z][^>]*\/>)/g

  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index)
      if (text.trim()) {
        sections.push({ type: "text", content: text })
      }
    }
    // Add code block (don't translate)
    sections.push({ type: "code", content: match[0] })
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) {
      sections.push({ type: "text", content: text })
    }
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

  const translatedContent = translatedFrontmatter + translatedSections.join("")

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
  const targetLangs = args.filter((a) => !a.startsWith("--"))

  const langsToTranslate =
    targetLangs.length > 0
      ? targetLangs.filter((l) => l in LANGUAGES)
      : Object.keys(LANGUAGES)

  if (langsToTranslate.length === 0) {
    console.log("Available languages:", Object.keys(LANGUAGES).join(", "))
    process.exit(1)
  }

  // Find all English MDX files (not already in a language folder)
  const mdxFiles = await glob("content/docs/**/*.mdx", {
    ignore: Object.keys(LANGUAGES).map((l) => `content/docs/${l}/**`),
  })

  console.log(`Found ${mdxFiles.length} files to translate`)
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
