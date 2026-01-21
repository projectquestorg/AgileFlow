#!/usr/bin/env npx ts-node

/**
 * Auto-translate documentation using Lingva (free, no signup)
 *
 * NEW APPROACH: AST-based extraction
 * - Parses MDX structure line by line
 * - Only extracts translatable text (prose, headings, list items)
 * - Preserves all MDX/JSX structure exactly
 * - Translates text segments individually
 *
 * Usage:
 *   npx tsx scripts/translate-docs.ts           # Translate all docs
 *   npx tsx scripts/translate-docs.ts es        # Translate to Spanish only
 *   npx tsx scripts/translate-docs.ts --dry-run # Preview without writing
 */

import * as fs from "fs"
import * as path from "path"
import { glob } from "glob"

// Lingva instances (free Google Translate proxies)
const LINGVA_INSTANCES = [
  "https://lingva.lunar.icu",
  "https://lingva.thedaviddelta.com",
  "https://translate.projectsegfau.lt",
]

// Target languages (must match lib/languages.ts)
const LANGUAGES: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ar: "Arabic",
}

const DELAY_MS = 1500 // Increased delay for reliability

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================================
// Translation API
// ============================================================

async function translateText(
  text: string,
  targetLang: string,
  instanceIndex = 0
): Promise<string> {
  if (!text.trim()) return text

  // Skip if text is too short or only whitespace/punctuation
  if (text.trim().length < 2) return text

  if (instanceIndex >= LINGVA_INSTANCES.length) {
    console.error(`  ⚠️ All instances failed for: "${text.slice(0, 50)}..."`)
    return text // Return original on failure
  }

  const instance = LINGVA_INSTANCES[instanceIndex]
  const url = `${instance}/api/v1/en/${targetLang}/${encodeURIComponent(text)}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    if (!data.translation) {
      throw new Error("No translation in response")
    }
    return data.translation
  } catch (error) {
    if (instanceIndex < LINGVA_INSTANCES.length - 1) {
      await sleep(500)
      return translateText(text, targetLang, instanceIndex + 1)
    }
    return text // Return original on complete failure
  }
}

// ============================================================
// MDX Line Classification
// ============================================================

interface LineInfo {
  original: string
  type:
    | "frontmatter-boundary" // ---
    | "frontmatter-title"    // title: ...
    | "frontmatter-desc"     // description: ...
    | "frontmatter-other"    // other frontmatter lines
    | "code-fence"           // ``` or ```lang
    | "code-content"         // inside code block
    | "jsx-component"        // <Component ...> or </Component>
    | "import"               // import ...
    | "heading"              // # Heading
    | "list-item"            // - item or * item or 1. item
    | "table-row"            // | col | col |
    | "blockquote"           // > quote
    | "link-reference"       // [text]: url
    | "empty"                // blank line
    | "paragraph"            // regular text
  translatable?: string      // the part to translate
  prefix?: string            // non-translatable prefix
  suffix?: string            // non-translatable suffix
}

function classifyLine(line: string, inCodeBlock: boolean, inFrontmatter: boolean): LineInfo {
  const trimmed = line.trim()

  // Empty line
  if (!trimmed) {
    return { original: line, type: "empty" }
  }

  // Code fence
  if (trimmed.startsWith("```")) {
    return { original: line, type: "code-fence" }
  }

  // Inside code block
  if (inCodeBlock) {
    return { original: line, type: "code-content" }
  }

  // Frontmatter boundary
  if (trimmed === "---") {
    return { original: line, type: "frontmatter-boundary" }
  }

  // Inside frontmatter
  if (inFrontmatter) {
    const titleMatch = line.match(/^(title:\s*["']?)(.+?)(["']?\s*)$/)
    if (titleMatch) {
      return {
        original: line,
        type: "frontmatter-title",
        prefix: titleMatch[1],
        translatable: titleMatch[2],
        suffix: titleMatch[3],
      }
    }

    const descMatch = line.match(/^(description:\s*["']?)(.+?)(["']?\s*)$/)
    if (descMatch) {
      return {
        original: line,
        type: "frontmatter-desc",
        prefix: descMatch[1],
        translatable: descMatch[2],
        suffix: descMatch[3],
      }
    }

    return { original: line, type: "frontmatter-other" }
  }

  // Import statement
  if (trimmed.startsWith("import ")) {
    return { original: line, type: "import" }
  }

  // JSX component (starts with < and capital letter, or closing tag)
  if (/^<[A-Z]/.test(trimmed) || /^<\/[A-Z]/.test(trimmed)) {
    return { original: line, type: "jsx-component" }
  }

  // Heading - translate the text after #
  const headingMatch = line.match(/^(#{1,6}\s+)(.+)$/)
  if (headingMatch) {
    return {
      original: line,
      type: "heading",
      prefix: headingMatch[1],
      translatable: headingMatch[2],
    }
  }

  // List item - translate the text after marker
  const listMatch = line.match(/^(\s*[-*+]|\s*\d+\.)\s+(.+)$/)
  if (listMatch) {
    return {
      original: line,
      type: "list-item",
      prefix: listMatch[1] + " ",
      translatable: listMatch[2],
    }
  }

  // Table row - don't translate (usually code/data)
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return { original: line, type: "table-row" }
  }

  // Blockquote - translate the text after >
  const blockquoteMatch = line.match(/^(>\s*)(.+)$/)
  if (blockquoteMatch) {
    return {
      original: line,
      type: "blockquote",
      prefix: blockquoteMatch[1],
      translatable: blockquoteMatch[2],
    }
  }

  // Link reference
  if (/^\[.+\]:\s/.test(trimmed)) {
    return { original: line, type: "link-reference" }
  }

  // Regular paragraph - translate it
  // But first, check if it contains JSX mixed in (like `text <Component> text`)
  if (/<[A-Z]/.test(line)) {
    // Mixed JSX - don't translate to avoid breaking structure
    return { original: line, type: "jsx-component" }
  }

  return {
    original: line,
    type: "paragraph",
    translatable: line,
  }
}

// ============================================================
// Text Processing (preserve inline code/links)
// ============================================================

interface TextSegment {
  type: "text" | "code" | "link" | "bold" | "italic" | "special"
  content: string
}

function tokenizeText(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let remaining = text

  // Regex patterns for markdown inline elements
  const patterns = [
    { type: "code" as const, regex: /`[^`]+`/ },
    { type: "link" as const, regex: /\[([^\]]+)\]\([^)]+\)/ },
    { type: "bold" as const, regex: /\*\*[^*]+\*\*/ },
    { type: "italic" as const, regex: /(?<!\*)\*[^*]+\*(?!\*)/ },
    { type: "special" as const, regex: /\{\{[^}]+\}\}/ }, // Template variables
  ]

  while (remaining.length > 0) {
    // Find the earliest match
    let earliest: { index: number; length: number; type: TextSegment["type"]; match: string } | null = null

    for (const { type, regex } of patterns) {
      const match = remaining.match(regex)
      if (match && match.index !== undefined) {
        if (!earliest || match.index < earliest.index) {
          earliest = {
            index: match.index,
            length: match[0].length,
            type,
            match: match[0],
          }
        }
      }
    }

    if (earliest && earliest.index > 0) {
      // Text before the match
      segments.push({ type: "text", content: remaining.slice(0, earliest.index) })
    }

    if (earliest) {
      segments.push({ type: earliest.type, content: earliest.match })
      remaining = remaining.slice(earliest.index + earliest.length)
    } else {
      // No more matches, rest is text
      if (remaining) {
        segments.push({ type: "text", content: remaining })
      }
      break
    }
  }

  return segments
}

async function translateWithPreservation(
  text: string,
  targetLang: string
): Promise<string> {
  const segments = tokenizeText(text)
  const result: string[] = []

  for (const segment of segments) {
    if (segment.type === "text" && segment.content.trim()) {
      // Preserve leading/trailing whitespace
      const leadingSpace = segment.content.match(/^\s*/)?.[0] || ""
      const trailingSpace = segment.content.match(/\s*$/)?.[0] || ""
      const trimmed = segment.content.trim()

      const translated = await translateText(trimmed, targetLang)
      result.push(leadingSpace + translated + trailingSpace)
      await sleep(200) // Small delay between segments
    } else if (segment.type === "link") {
      // For links, translate only the display text
      const linkMatch = segment.content.match(/\[([^\]]+)\](\([^)]+\))/)
      if (linkMatch) {
        const translatedText = await translateText(linkMatch[1], targetLang)
        await sleep(200)
        result.push(`[${translatedText}]${linkMatch[2]}`)
      } else {
        result.push(segment.content)
      }
    } else {
      // Keep code, bold markers, etc. as-is
      result.push(segment.content)
    }
  }

  return result.join("")
}

// ============================================================
// Main Translation Logic
// ============================================================

async function translateMdxFile(
  filePath: string,
  targetLang: string,
  dryRun: boolean
): Promise<void> {
  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.split("\n")

  let inCodeBlock = false
  let inFrontmatter = false
  let frontmatterCount = 0

  const translatedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track frontmatter boundaries
    if (line.trim() === "---") {
      frontmatterCount++
      inFrontmatter = frontmatterCount === 1
      if (frontmatterCount === 2) {
        inFrontmatter = false
      }
    }

    // Track code blocks
    if (line.trim().startsWith("```") && !inFrontmatter) {
      inCodeBlock = !inCodeBlock
    }

    const lineInfo = classifyLine(line, inCodeBlock, inFrontmatter)

    // Translate if needed
    if (lineInfo.translatable) {
      try {
        const translated = await translateWithPreservation(
          lineInfo.translatable,
          targetLang
        )
        await sleep(DELAY_MS)

        // Reconstruct line
        const newLine =
          (lineInfo.prefix || "") + translated + (lineInfo.suffix || "")
        translatedLines.push(newLine)
      } catch (error) {
        // On error, keep original
        translatedLines.push(line)
      }
    } else {
      // Keep line as-is
      translatedLines.push(line)
    }
  }

  const translatedContent = translatedLines.join("\n")

  // Determine output path
  const ext = path.extname(filePath)
  const baseName = filePath.slice(0, -ext.length)
  const outputPath = `${baseName}.${targetLang}${ext}`

  if (dryRun) {
    console.log(`  Would write: ${outputPath}`)
  } else {
    fs.writeFileSync(outputPath, translatedContent)
    console.log(`  ✓ Written: ${outputPath}`)
  }
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")

  const nonFlags = args.filter((a) => !a.startsWith("--"))
  const langs = nonFlags.filter((a) => a in LANGUAGES)
  const specificFiles = nonFlags.filter((a) => a.endsWith(".mdx"))

  const langsToTranslate = langs.length > 0 ? langs : Object.keys(LANGUAGES)

  if (langsToTranslate.length === 0) {
    console.log("Available languages:", Object.keys(LANGUAGES).join(", "))
    process.exit(1)
  }

  // Find files to translate
  let mdxFiles: string[]
  if (specificFiles.length > 0) {
    mdxFiles = specificFiles.map((f) => f.replace(/^apps\/docs\//, ""))
    console.log(`Translating ${mdxFiles.length} specific file(s)`)
  } else {
    mdxFiles = await glob("content/docs/**/*.mdx", {
      ignore: Object.keys(LANGUAGES).map((l) => `content/docs/**/*.${l}.mdx`),
    })
    console.log(`Found ${mdxFiles.length} files to translate`)
  }

  console.log(`Target languages: ${langsToTranslate.join(", ")}`)
  console.log(`Dry run: ${dryRun}\n`)

  for (const lang of langsToTranslate) {
    console.log(`\n🌐 Translating to ${LANGUAGES[lang]} (${lang})...`)

    for (const file of mdxFiles) {
      console.log(`  📄 ${file}`)
      try {
        await translateMdxFile(file, lang, dryRun)
      } catch (error) {
        console.error(`  ❌ Error:`, error)
      }
    }
  }

  console.log("\n✅ Done!")
}

main().catch(console.error)
