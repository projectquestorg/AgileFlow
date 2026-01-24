#!/usr/bin/env node
/**
 * document-repl.js
 *
 * REPL (Read-Evaluate-Print-Loop) engine for document virtualization.
 * Part of the RLM Document Analysis System (EP-0027).
 *
 * Virtualizes documents as searchable objects WITHOUT loading full content into LLM context.
 * Supports programmatic operations: read, slice, regex, pattern match, keyword search.
 *
 * Usage:
 *   node document-repl.js --load="path/to/document.pdf"    # Load document
 *   node document-repl.js --info                           # Show document info
 *   node document-repl.js --search="keyword"               # Keyword search
 *   node document-repl.js --regex="pattern"                # Regex search
 *   node document-repl.js --slice="100-200"                # Get lines 100-200
 *   node document-repl.js --section="Article 7"            # Find section by heading
 *   node document-repl.js --toc                            # Extract table of contents
 *
 * Options:
 *   --context=<lines>   Context lines around matches (default: 2)
 *   --budget=<chars>    Character budget for output (default: 15000)
 *   --json              Output as JSON
 *   --verbose           Show debug info
 *
 * Supported formats:
 *   .txt, .md  - Direct text processing
 *   .pdf       - Via pdf-parse library
 *   .docx      - Via mammoth library
 *
 * Exit codes:
 *   0 = Success
 *   1 = Error
 *   2 = No results
 *
 * RLM Principles Applied:
 *   - Document virtualized outside LLM context
 *   - Programmatic search instead of semantic similarity (RAG)
 *   - Only relevant chunks returned to caller
 *   - Supports recursive handoff to sub-agents
 */

const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_BUDGET = 15000;
const DEFAULT_CONTEXT_LINES = 2;

// State - virtualized document
let documentState = {
  loaded: false,
  path: null,
  format: null,
  text: null,
  lines: [],
  charCount: 0,
  lineCount: 0,
  headings: [],
  sections: {},
};

// Parse command line arguments
function parseArgs(argv) {
  const args = {
    load: null,
    info: false,
    search: null,
    regex: null,
    slice: null,
    section: null,
    toc: false,
    context: DEFAULT_CONTEXT_LINES,
    budget: DEFAULT_BUDGET,
    json: false,
    verbose: false,
    help: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--info') {
      args.info = true;
    } else if (arg === '--toc') {
      args.toc = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--load=')) {
      args.load = arg.slice(7);
    } else if (arg.startsWith('--search=')) {
      args.search = arg.slice(9);
    } else if (arg.startsWith('--regex=')) {
      args.regex = arg.slice(8);
    } else if (arg.startsWith('--slice=')) {
      args.slice = arg.slice(8);
    } else if (arg.startsWith('--section=')) {
      args.section = arg.slice(10);
    } else if (arg.startsWith('--context=')) {
      args.context = parseInt(arg.slice(10), 10) || DEFAULT_CONTEXT_LINES;
    } else if (arg.startsWith('--budget=')) {
      args.budget = parseInt(arg.slice(9), 10) || DEFAULT_BUDGET;
    }
  }

  return args;
}

// Detect document format from extension
function detectFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.txt':
      return 'text';
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.doc':
      return 'doc-legacy';
    default:
      return 'unknown';
  }
}

// Load text-based documents (txt, md)
function loadTextDocument(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text;
}

// Load PDF document (requires pdf-parse)
async function loadPdfDocument(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'pdf-parse not installed. Run: npm install pdf-parse\n' +
          'Or use --format=text to treat as plain text.'
      );
    }
    throw err;
  }
}

// Load DOCX document (requires mammoth)
async function loadDocxDocument(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'mammoth not installed. Run: npm install mammoth\n' +
          'Or use --format=text to treat as plain text.'
      );
    }
    throw err;
  }
}

// Extract headings from text (markdown style and document patterns)
function extractHeadings(text, format) {
  const headings = [];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    // Markdown headings: # Heading
    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      headings.push({
        level: mdMatch[1].length,
        text: mdMatch[2].trim(),
        line: index + 1,
      });
      return;
    }

    // Legal document patterns: Article X, Section X, PART X
    const legalMatch = line.match(
      /^(Article|Section|ARTICLE|SECTION|Part|PART|Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)[.:]\s*(.*)$/i
    );
    if (legalMatch) {
      headings.push({
        level: legalMatch[1].toLowerCase() === 'article' ? 1 : 2,
        text: line.trim(),
        line: index + 1,
      });
      return;
    }

    // All-caps lines (often section headers in legal docs)
    if (
      line.length > 5 &&
      line.length < 100 &&
      line === line.toUpperCase() &&
      /^[A-Z\s\d.,;:()-]+$/.test(line)
    ) {
      headings.push({
        level: 2,
        text: line.trim(),
        line: index + 1,
      });
    }
  });

  return headings;
}

// Build section map from headings
function buildSectionMap(lines, headings) {
  const sections = {};

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const startLine = heading.line;

    // Find end line: next heading at same or higher level (lower number)
    let endLine = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= heading.level) {
        endLine = headings[j].line - 1;
        break;
      }
    }

    const sectionText = lines.slice(startLine - 1, endLine).join('\n');

    // Use heading text as key (normalized)
    const key = heading.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    sections[key] = {
      heading: heading.text,
      level: heading.level,
      startLine,
      endLine,
      text: sectionText,
      charCount: sectionText.length,
    };
  }

  return sections;
}

// Load and virtualize document
async function loadDocument(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const format = detectFormat(filePath);
  let text;

  switch (format) {
    case 'text':
    case 'markdown':
      text = loadTextDocument(filePath);
      break;
    case 'pdf':
      text = await loadPdfDocument(filePath);
      break;
    case 'docx':
      text = await loadDocxDocument(filePath);
      break;
    case 'doc-legacy':
      throw new Error('Legacy .doc format not supported. Please convert to .docx or .pdf');
    default:
      // Try loading as text
      text = loadTextDocument(filePath);
  }

  const lines = text.split('\n');
  const headings = extractHeadings(text, format);
  const sections = buildSectionMap(lines, headings);

  documentState = {
    loaded: true,
    path: filePath,
    format,
    text,
    lines,
    charCount: text.length,
    lineCount: lines.length,
    headings,
    sections,
  };

  return documentState;
}

// Get document info
function getDocumentInfo() {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  return {
    path: documentState.path,
    format: documentState.format,
    charCount: documentState.charCount,
    lineCount: documentState.lineCount,
    headingCount: documentState.headings.length,
    sectionCount: Object.keys(documentState.sections).length,
    estimatedTokens: Math.ceil(documentState.charCount / 4), // ~4 chars per token
    complexity: assessComplexity(),
  };
}

// Assess document complexity (RLM concept: complexity affects context rot)
function assessComplexity() {
  if (!documentState.loaded) return 'unknown';

  const { charCount, headings, sections } = documentState;

  // Cross-reference density: headings per 10k chars
  const crossRefDensity = (headings.length / charCount) * 10000;

  // Internal references: count "see section", "as defined in", etc.
  const refPatterns =
    /(?:see|refer to|as defined in|pursuant to|in accordance with)\s+(?:section|article|clause|paragraph)/gi;
  const refMatches = documentState.text.match(refPatterns) || [];
  const refDensity = (refMatches.length / charCount) * 10000;

  // Determine complexity level
  if (charCount < 10000 && crossRefDensity < 1) {
    return 'low'; // Simple document
  } else if (charCount < 50000 && crossRefDensity < 3 && refDensity < 1) {
    return 'medium'; // Moderate complexity
  } else {
    return 'high'; // High complexity - needs RLM approach
  }
}

// Keyword search with context
function searchKeyword(keyword, contextLines, budget) {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  const results = [];
  const regex = new RegExp(escapeRegex(keyword), 'gi');
  const { lines } = documentState;
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      const startLine = Math.max(0, i - contextLines);
      const endLine = Math.min(lines.length - 1, i + contextLines);
      const contextText = lines.slice(startLine, endLine + 1).join('\n');

      // Check budget
      if (charCount + contextText.length > budget) {
        results.push({
          truncated: true,
          message: `Budget exceeded. Showing ${results.length} of potential matches.`,
        });
        break;
      }

      results.push({
        line: i + 1,
        match: lines[i],
        context: contextText,
        contextRange: { start: startLine + 1, end: endLine + 1 },
      });

      charCount += contextText.length;
    }
  }

  return {
    query: keyword,
    matchCount: results.filter(r => !r.truncated).length,
    results,
  };
}

// Regex search with context
function searchRegex(pattern, contextLines, budget) {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  let regex;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (err) {
    return { error: `Invalid regex: ${err.message}` };
  }

  const results = [];
  const { lines } = documentState;
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(regex);
    if (matches) {
      const startLine = Math.max(0, i - contextLines);
      const endLine = Math.min(lines.length - 1, i + contextLines);
      const contextText = lines.slice(startLine, endLine + 1).join('\n');

      if (charCount + contextText.length > budget) {
        results.push({
          truncated: true,
          message: `Budget exceeded. Showing ${results.length} of potential matches.`,
        });
        break;
      }

      results.push({
        line: i + 1,
        matches,
        context: contextText,
        contextRange: { start: startLine + 1, end: endLine + 1 },
      });

      charCount += contextText.length;
    }
  }

  return {
    pattern,
    matchCount: results.filter(r => !r.truncated).length,
    results,
  };
}

// Slice document by line range
function sliceDocument(rangeStr, budget) {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  const match = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return { error: 'Invalid range format. Use: start-end (e.g., 100-200)' };
  }

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (start < 1 || end < start || start > documentState.lineCount) {
    return {
      error: `Invalid range. Document has ${documentState.lineCount} lines.`,
    };
  }

  const slicedLines = documentState.lines.slice(start - 1, Math.min(end, documentState.lineCount));
  let text = slicedLines.join('\n');

  // Truncate if over budget
  const truncated = text.length > budget;
  if (truncated) {
    text = text.slice(0, budget) + '\n... [truncated]';
  }

  return {
    range: { start, end: Math.min(end, documentState.lineCount) },
    lineCount: slicedLines.length,
    charCount: text.length,
    truncated,
    text,
  };
}

// Find section by heading
function findSection(sectionQuery, budget) {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  // Normalize query
  const normalizedQuery = sectionQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  // Find best matching section
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, section] of Object.entries(documentState.sections)) {
    // Exact match
    if (key === normalizedQuery) {
      bestMatch = section;
      bestScore = 1;
      break;
    }

    // Partial match (contains query)
    if (key.includes(normalizedQuery) || normalizedQuery.includes(key)) {
      const score = normalizedQuery.length / key.length;
      if (score > bestScore) {
        bestMatch = section;
        bestScore = score;
      }
    }
  }

  if (!bestMatch) {
    // Return available sections as hint
    const availableSections = Object.values(documentState.sections)
      .slice(0, 10)
      .map(s => s.heading);
    return {
      error: `Section not found: "${sectionQuery}"`,
      hint: 'Available sections:',
      availableSections,
    };
  }

  // Truncate if over budget
  let text = bestMatch.text;
  const truncated = text.length > budget;
  if (truncated) {
    text = text.slice(0, budget) + '\n... [truncated]';
  }

  return {
    query: sectionQuery,
    found: bestMatch.heading,
    lineRange: { start: bestMatch.startLine, end: bestMatch.endLine },
    charCount: bestMatch.charCount,
    truncated,
    text,
  };
}

// Get table of contents
function getTableOfContents() {
  if (!documentState.loaded) {
    return { error: 'No document loaded' };
  }

  return {
    headingCount: documentState.headings.length,
    toc: documentState.headings.map(h => ({
      level: h.level,
      text: h.text,
      line: h.line,
    })),
  };
}

// Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Format output
function formatOutput(data, asJson) {
  if (asJson) {
    return JSON.stringify(data, null, 2);
  }

  // Human-readable formatting
  if (data.error) {
    let output = `Error: ${data.error}`;
    if (data.hint) {
      output += `\n\n${data.hint}`;
    }
    if (data.availableSections) {
      output += '\n' + data.availableSections.map(s => `  - ${s}`).join('\n');
    }
    return output;
  }

  // Document info
  if (data.path && data.format && data.charCount) {
    return [
      '📄 Document Info',
      `   Path: ${data.path}`,
      `   Format: ${data.format}`,
      `   Characters: ${data.charCount.toLocaleString()}`,
      `   Lines: ${data.lineCount.toLocaleString()}`,
      `   Headings: ${data.headingCount}`,
      `   Sections: ${data.sectionCount}`,
      `   Est. Tokens: ~${data.estimatedTokens.toLocaleString()}`,
      `   Complexity: ${data.complexity.toUpperCase()}`,
    ].join('\n');
  }

  // Search results
  if ((data.query || data.pattern) && data.results) {
    let output = `🔍 Search: "${data.query || data.pattern}"\n`;
    output += `   Matches: ${data.matchCount}\n\n`;

    for (const result of data.results) {
      if (result.truncated) {
        output += `\n⚠️  ${result.message}\n`;
        continue;
      }
      output += `--- Line ${result.line} (context: ${result.contextRange.start}-${result.contextRange.end}) ---\n`;
      output += result.context + '\n\n';
    }

    return output;
  }

  // Slice result
  if (data.range) {
    let output = `📑 Lines ${data.range.start}-${data.range.end} (${data.lineCount} lines, ${data.charCount} chars)\n`;
    if (data.truncated) {
      output += '⚠️  Output truncated due to budget\n';
    }
    output += '\n' + data.text;
    return output;
  }

  // Section result
  if (data.found) {
    let output = `📖 Section: "${data.found}"\n`;
    output += `   Lines: ${data.lineRange.start}-${data.lineRange.end}\n`;
    output += `   Characters: ${data.charCount}\n`;
    if (data.truncated) {
      output += '⚠️  Output truncated due to budget\n';
    }
    output += '\n' + data.text;
    return output;
  }

  // Table of contents
  if (data.toc) {
    let output = `📋 Table of Contents (${data.headingCount} headings)\n\n`;
    for (const heading of data.toc) {
      const indent = '  '.repeat(heading.level - 1);
      output += `${indent}${heading.text} (line ${heading.line})\n`;
    }
    return output;
  }

  // Fallback to JSON
  return JSON.stringify(data, null, 2);
}

// Print help
function printHelp() {
  console.log(`
document-repl.js - REPL engine for document virtualization (RLM pattern)

USAGE:
  node document-repl.js --load="path/to/doc" [operation] [options]

OPERATIONS:
  --info              Show document info (size, format, complexity)
  --search="keyword"  Keyword search with context
  --regex="pattern"   Regex search with context
  --slice="100-200"   Get lines 100-200
  --section="name"    Find section by heading
  --toc               Extract table of contents

OPTIONS:
  --context=<lines>   Context lines around matches (default: 2)
  --budget=<chars>    Character budget for output (default: 15000)
  --json              Output as JSON
  --verbose           Show debug info

SUPPORTED FORMATS:
  .txt, .md    Direct text processing (no dependencies)
  .pdf         Requires: npm install pdf-parse
  .docx        Requires: npm install mammoth

EXAMPLES:
  # Load and get info
  node document-repl.js --load="contract.pdf" --info

  # Search for keyword
  node document-repl.js --load="spec.md" --search="authentication"

  # Find specific section
  node document-repl.js --load="agreement.docx" --section="Article 7"

  # Get lines 500-600 with increased budget
  node document-repl.js --load="research.txt" --slice="500-600" --budget=20000

EXIT CODES:
  0 = Success
  1 = Error
  2 = No results
`);
}

// Main execution
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Must load document first
  if (!args.load) {
    console.error('Error: --load="path/to/document" is required');
    console.error('Run with --help for usage');
    process.exit(1);
  }

  try {
    // Load document
    if (args.verbose) {
      console.error(`Loading document: ${args.load}`);
    }

    await loadDocument(args.load);

    if (args.verbose) {
      console.error(`Loaded: ${documentState.charCount} chars, ${documentState.lineCount} lines`);
    }

    let result;

    // Execute operation
    if (args.info) {
      result = getDocumentInfo();
    } else if (args.toc) {
      result = getTableOfContents();
    } else if (args.search) {
      result = searchKeyword(args.search, args.context, args.budget);
    } else if (args.regex) {
      result = searchRegex(args.regex, args.context, args.budget);
    } else if (args.slice) {
      result = sliceDocument(args.slice, args.budget);
    } else if (args.section) {
      result = findSection(args.section, args.budget);
    } else {
      // Default: show info
      result = getDocumentInfo();
    }

    // Output result
    console.log(formatOutput(result, args.json));

    // Set exit code
    if (result.error) {
      process.exit(1);
    } else if (result.matchCount === 0 || (result.results && result.results.length === 0)) {
      process.exit(2);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run
main();

// Export for testing
module.exports = {
  parseArgs,
  detectFormat,
  loadDocument,
  getDocumentInfo,
  assessComplexity,
  searchKeyword,
  searchRegex,
  sliceDocument,
  findSection,
  getTableOfContents,
  extractHeadings,
  buildSectionMap,
  // State access for testing
  getState: () => documentState,
  resetState: () => {
    documentState = {
      loaded: false,
      path: null,
      format: null,
      text: null,
      lines: [],
      charCount: 0,
      lineCount: 0,
      headings: [],
      sections: {},
    };
  },
};
