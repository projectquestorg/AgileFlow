#!/usr/bin/env node
/**
 * query-codebase.js
 *
 * Query engine for programmatic codebase searches.
 * Part of the RLM-inspired Codebase Query Interface (EP-0021).
 *
 * Uses indexing and programmatic search instead of loading full context,
 * following RLM principles: virtualize documents and query programmatically.
 *
 * Usage:
 *   node query-codebase.js --build-index         # Build/rebuild index
 *   node query-codebase.js --query="auth files"  # Search by pattern/keyword
 *   node query-codebase.js --deps="src/api.js"   # Show dependencies
 *   node query-codebase.js --content="validate"  # Search file content
 *   node query-codebase.js --tag="api"           # Search by tag
 *   node query-codebase.js --export="login"      # Find export locations
 *
 * Options:
 *   --project=<path>   Project root (default: cwd)
 *   --budget=<chars>   Token budget for output (default: 15000)
 *   --json             Output as JSON
 *   --verbose          Show debug info
 *
 * Exit codes:
 *   0 = Success
 *   1 = Error
 *   2 = No results
 */

const fs = require('fs');
const path = require('path');
const {
  buildIndex,
  updateIndex,
  getIndex,
  queryFiles,
  queryByTag,
  queryByExport,
  getDependencies,
} = require('../lib/codebase-indexer');

// Default configuration
const DEFAULT_BUDGET = 15000;

// Parse command line arguments
function parseArgs(argv) {
  const args = {
    buildIndex: false,
    query: null,
    deps: null,
    content: null,
    tag: null,
    export: null,
    project: process.cwd(),
    budget: DEFAULT_BUDGET,
    json: false,
    verbose: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--build-index') {
      args.buildIndex = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg.startsWith('--query=')) {
      args.query = arg.slice(8);
    } else if (arg.startsWith('--deps=')) {
      args.deps = arg.slice(7);
    } else if (arg.startsWith('--content=')) {
      args.content = arg.slice(10);
    } else if (arg.startsWith('--tag=')) {
      args.tag = arg.slice(6);
    } else if (arg.startsWith('--export=')) {
      args.export = arg.slice(9);
    } else if (arg.startsWith('--project=')) {
      args.project = arg.slice(10);
    } else if (arg.startsWith('--budget=')) {
      args.budget = parseInt(arg.slice(9), 10) || DEFAULT_BUDGET;
    }
  }

  return args;
}

// Search file content using grep-style regex
function queryContent(projectRoot, pattern, budget) {
  const results = [];
  let totalChars = 0;

  // Get list of files to search
  const indexResult = getIndex(projectRoot);
  if (!indexResult.ok) {
    return { ok: false, error: indexResult.error };
  }

  const regex = new RegExp(pattern, 'gi');
  const files = Object.keys(indexResult.data.files);

  for (const relativePath of files) {
    const fullPath = path.join(projectRoot, relativePath);
    const fileType = indexResult.data.files[relativePath].type;

    // Only search code files
    if (!['javascript', 'typescript', 'javascript-react', 'typescript-react'].includes(fileType)) {
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const matches = [];

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          // Include context (2 lines before/after)
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length - 1, i + 2);
          const context = lines.slice(start, end + 1).map((line, idx) => ({
            lineNumber: start + idx + 1,
            content: line,
            isMatch: start + idx === i,
          }));
          matches.push({ line: i + 1, context });
        }
        regex.lastIndex = 0; // Reset regex state
      }

      if (matches.length > 0) {
        const result = { file: relativePath, matches };
        const resultChars = JSON.stringify(result).length;

        if (totalChars + resultChars > budget) {
          results.push({
            file: '...',
            matches: [{ line: 0, context: [{ lineNumber: 0, content: `[Truncated: budget exceeded]`, isMatch: false }] }],
          });
          break;
        }

        results.push(result);
        totalChars += resultChars;
      }
    } catch (err) {
      // Skip unreadable files
    }
  }

  return { ok: true, data: results };
}

// Format output for human readability
function formatResults(results, type) {
  const lines = [];

  switch (type) {
    case 'files':
      lines.push(`Found ${results.length} file(s):`);
      for (const file of results) {
        lines.push(`  ${file}`);
      }
      break;

    case 'content':
      lines.push(`Found matches in ${results.length} file(s):`);
      for (const result of results) {
        lines.push(`\n${result.file}:`);
        for (const match of result.matches) {
          for (const ctx of match.context) {
            const marker = ctx.isMatch ? '>' : ' ';
            lines.push(`${marker} ${ctx.lineNumber}: ${ctx.content}`);
          }
          lines.push('  ---');
        }
      }
      break;

    case 'deps':
      lines.push('Dependencies:');
      if (results.imports.length > 0) {
        lines.push('\nImports:');
        for (const imp of results.imports) {
          lines.push(`  ${imp}`);
        }
      }
      if (results.importedBy.length > 0) {
        lines.push('\nImported by:');
        for (const dep of results.importedBy) {
          lines.push(`  ${dep}`);
        }
      }
      break;

    case 'index':
      lines.push('Index Statistics:');
      lines.push(`  Total files: ${results.stats.total_files}`);
      lines.push(`  Indexed files: ${results.stats.indexed_files}`);
      lines.push(`  Build time: ${results.stats.build_time_ms}ms`);
      lines.push(`  Tags: ${Object.keys(results.tags).length}`);
      lines.push(`  Exports tracked: ${Object.keys(results.symbols.exports).length}`);
      break;

    default:
      lines.push(JSON.stringify(results, null, 2));
  }

  return lines.join('\n');
}

// Truncate output to budget
function truncateOutput(output, budget) {
  if (output.length <= budget) {
    return output;
  }

  const truncated = output.slice(0, budget - 50);
  const lastNewline = truncated.lastIndexOf('\n');
  return truncated.slice(0, lastNewline) + '\n\n... [Truncated: output exceeded budget]';
}

// Main execution
async function main() {
  const args = parseArgs(process.argv);

  if (args.verbose) {
    console.error('Args:', JSON.stringify(args, null, 2));
  }

  // Check project exists
  if (!fs.existsSync(args.project)) {
    console.error(`Error: Project not found: ${args.project}`);
    process.exit(1);
  }

  let result;
  let outputType;

  try {
    // Handle --build-index
    if (args.buildIndex) {
      if (args.verbose) console.error('Building index...');
      result = buildIndex(args.project);
      outputType = 'index';

      if (!result.ok) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      const output = args.json
        ? JSON.stringify(result.data, null, 2)
        : formatResults(result.data, outputType);
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // Handle --query (glob pattern search)
    if (args.query) {
      if (args.verbose) console.error(`Querying: ${args.query}`);

      // First try to get/update index
      const indexResult = updateIndex(args.project);
      if (!indexResult.ok) {
        console.error(`Error: ${indexResult.error}`);
        process.exit(1);
      }

      // Interpret query
      const query = args.query.toLowerCase();
      let files = [];

      // If query looks like a glob, use it directly
      if (query.includes('*') || query.includes('/')) {
        files = queryFiles(indexResult.data, args.query);
      } else {
        // Otherwise, search multiple ways:
        // 1. Files containing query in name
        files = queryFiles(indexResult.data, `**/*${args.query}*`);

        // 2. Files with matching tag
        const tagFiles = queryByTag(indexResult.data, query);
        files = [...new Set([...files, ...tagFiles])];

        // 3. Files exporting symbol
        const exportFiles = queryByExport(indexResult.data, args.query);
        files = [...new Set([...files, ...exportFiles])];
      }

      if (files.length === 0) {
        console.error(`No files found matching: ${args.query}`);
        process.exit(2);
      }

      const output = args.json
        ? JSON.stringify(files, null, 2)
        : formatResults(files, 'files');
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // Handle --content (grep-style search)
    if (args.content) {
      if (args.verbose) console.error(`Searching content: ${args.content}`);

      result = queryContent(args.project, args.content, args.budget);

      if (!result.ok) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (result.data.length === 0) {
        console.error(`No content matches for: ${args.content}`);
        process.exit(2);
      }

      const output = args.json
        ? JSON.stringify(result.data, null, 2)
        : formatResults(result.data, 'content');
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // Handle --tag
    if (args.tag) {
      if (args.verbose) console.error(`Searching tag: ${args.tag}`);

      const indexResult = getIndex(args.project);
      if (!indexResult.ok) {
        console.error(`Error: ${indexResult.error}`);
        process.exit(1);
      }

      const files = queryByTag(indexResult.data, args.tag);

      if (files.length === 0) {
        console.error(`No files with tag: ${args.tag}`);
        process.exit(2);
      }

      const output = args.json
        ? JSON.stringify(files, null, 2)
        : formatResults(files, 'files');
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // Handle --export
    if (args.export) {
      if (args.verbose) console.error(`Searching export: ${args.export}`);

      const indexResult = getIndex(args.project);
      if (!indexResult.ok) {
        console.error(`Error: ${indexResult.error}`);
        process.exit(1);
      }

      const files = queryByExport(indexResult.data, args.export);

      if (files.length === 0) {
        console.error(`No files export: ${args.export}`);
        process.exit(2);
      }

      const output = args.json
        ? JSON.stringify(files, null, 2)
        : formatResults(files, 'files');
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // Handle --deps
    if (args.deps) {
      if (args.verbose) console.error(`Getting dependencies: ${args.deps}`);

      const indexResult = getIndex(args.project);
      if (!indexResult.ok) {
        console.error(`Error: ${indexResult.error}`);
        process.exit(1);
      }

      const deps = getDependencies(indexResult.data, args.deps);

      if (deps.imports.length === 0 && deps.importedBy.length === 0) {
        console.error(`No dependencies found for: ${args.deps}`);
        process.exit(2);
      }

      const output = args.json
        ? JSON.stringify(deps, null, 2)
        : formatResults(deps, 'deps');
      console.log(truncateOutput(output, args.budget));
      process.exit(0);
    }

    // No action specified - show help
    console.log(`Usage: node query-codebase.js <command>

Commands:
  --build-index         Build/rebuild codebase index
  --query="<pattern>"   Search files by pattern or keyword
  --content="<regex>"   Search file content (grep-style)
  --tag="<tag>"         Find files by tag (api, ui, auth, etc.)
  --export="<name>"     Find files exporting a symbol
  --deps="<file>"       Show file dependencies

Options:
  --project=<path>      Project root (default: cwd)
  --budget=<chars>      Output budget in characters (default: 15000)
  --json                Output as JSON
  --verbose             Show debug info

Exit codes:
  0 = Success
  1 = Error
  2 = No results
`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
