#!/usr/bin/env node

/**
 * Count Synchronization Script
 *
 * Automatically updates all hardcoded component counts across documentation.
 * Run this script after adding/removing commands, agents, or skills.
 *
 * Usage:
 *   node scripts/sync-counts.js          # Update all counts
 *   node scripts/sync-counts.js --check  # Verify counts are correct (for CI)
 *   node scripts/sync-counts.js --dry-run # Show what would be changed
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLI_ROOT = path.join(ROOT, 'packages/cli');

// Use shared counter module (single source of truth)
const { getSourceCounts } = require(path.join(CLI_ROOT, 'scripts/lib/counter'));

// =============================================================================
// Files to Update
// =============================================================================

const FILES_TO_UPDATE = [
  // README badges (skills are now "dynamic", not counted)
  {
    file: 'README.md',
    patterns: [
      { regex: /badge\/commands-\d+-blue/g, replacement: (c) => `badge/commands-${c.commands}-blue` },
      { regex: /badge\/agents%2Fexperts-\d+-orange/g, replacement: (c) => `badge/agents%2Fexperts-${c.agents}-orange` },
      // Skills badge uses "dynamic" - no sync needed
    ]
  },
  // README table
  {
    file: 'README.md',
    patterns: [
      { regex: /\| \d+ \| Slash commands for agile workflows/g, replacement: (c) => `| ${c.commands} | Slash commands for agile workflows` },
      { regex: /\| \d+ \| Specialized agents with/g, replacement: (c) => `| ${c.agents} | Specialized agents with` },
      // Skills table row uses "Dynamic" - no sync needed
    ]
  },
  // README reference links
  {
    file: 'README.md',
    patterns: [
      { regex: /All \d+ slash commands/g, replacement: (c) => `All ${c.commands} slash commands` },
      { regex: /\d+ specialized agents with self-improving/g, replacement: (c) => `${c.agents} specialized agents with self-improving` },
      // Skills reference uses "Dynamic skill generator" - no sync needed
    ]
  },
  // docs/04-architecture/README.md
  {
    file: 'docs/04-architecture/README.md',
    patterns: [
      { regex: /All \d+ slash commands/g, replacement: (c) => `All ${c.commands} slash commands` },
      { regex: /All \d+ specialized agents/g, replacement: (c) => `All ${c.agents} specialized agents` },
      { regex: /Agent\s+→\s+\d+ Domain Experts/g, replacement: (c) => `Agent           →  ${c.agents} Domain Experts` },
      { regex: /\*\*Commands\*\*: \d+ slash commands/g, replacement: (c) => `**Commands**: ${c.commands} slash commands` },
      { regex: /\*\*Agents\*\*: \d+ domain-specialized/g, replacement: (c) => `**Agents**: ${c.agents} domain-specialized` },
      // Skills use "Dynamic generation" - no sync needed
    ]
  },
  // docs/04-architecture/commands.md
  {
    file: 'docs/04-architecture/commands.md',
    patterns: [
      { regex: /\*\*\d+ slash commands\*\*/g, replacement: (c) => `**${c.commands} slash commands**` },
      { regex: /\d+ specialized agents/g, replacement: (c) => `${c.agents} specialized agents` },
    ]
  },
  // docs/04-architecture/subagents.md
  {
    file: 'docs/04-architecture/subagents.md',
    patterns: [
      { regex: /\*\*\d+ specialized subagents\*\*/g, replacement: (c) => `**${c.agents} specialized subagents**` },
      { regex: /All \d+ Specialized Agents/g, replacement: (c) => `All ${c.agents} Specialized Agents` },
      { regex: /\d+ slash commands/g, replacement: (c) => `${c.commands} slash commands` },
    ]
  },
  // docs/04-architecture/skills.md (skills are now dynamic, not counted)
  {
    file: 'docs/04-architecture/skills.md',
    patterns: [
      { regex: /\d+ slash commands/g, replacement: (c) => `${c.commands} slash commands` },
      { regex: /\d+ specialized agents/g, replacement: (c) => `${c.agents} specialized agents` },
    ]
  },
  // CLAUDE.md (skills are now dynamic, not counted)
  {
    file: 'CLAUDE.md',
    patterns: [
      { regex: /# \d+ slash commands/g, replacement: (c) => `# ${c.commands} slash commands` },
      { regex: /# \d+\+ agents/g, replacement: (c) => `# ${c.agents}+ agents` },
      { regex: /- \d+ slash commands/g, replacement: (c) => `- ${c.commands} slash commands` },
      { regex: /- \d+\+ specialized agents/g, replacement: (c) => `- ${c.agents}+ specialized agents` },
      // Skills are now dynamic - no count to sync
    ]
  },
  // apps/docs/content/docs/index.mdx
  {
    file: 'apps/docs/content/docs/index.mdx',
    patterns: [
      { regex: /### \d+ Slash Commands/g, replacement: (c) => `### ${c.commands} Slash Commands` },
      { regex: /### \d+ Specialized Agents/g, replacement: (c) => `### ${c.agents} Specialized Agents` },
    ]
  },
  // apps/docs/content/docs/agents/index.mdx
  {
    file: 'apps/docs/content/docs/agents/index.mdx',
    patterns: [
      { regex: /description: \d+ specialized AI agents/g, replacement: (c) => `description: ${c.agents} specialized AI agents` },
      { regex: /\*\*\d+ specialized agents\*\*/g, replacement: (c) => `**${c.agents} specialized agents**` },
    ]
  },
  // apps/docs/content/docs/commands/index.mdx
  {
    file: 'apps/docs/content/docs/commands/index.mdx',
    patterns: [
      { regex: /all \d+ AgileFlow slash commands/g, replacement: (c) => `all ${c.commands} AgileFlow slash commands` },
      { regex: /\*\*\d+ slash commands\*\*/g, replacement: (c) => `**${c.commands} slash commands**` },
    ]
  },
  // apps/website/lib/landing-content.ts
  {
    file: 'apps/website/lib/landing-content.ts',
    patterns: [
      { regex: /'\d+ slash commands'/g, replacement: (c) => `'${c.commands} slash commands'` },
      { regex: /'\d+ specialized agents'/g, replacement: (c) => `'${c.agents} specialized agents'` },
    ]
  },
];

// =============================================================================
// Translated Docs Auto-Discovery
// =============================================================================

/**
 * Generic patterns that match count references across all translated .mdx files.
 *
 * IMPORTANT: Patterns must only replace NUMBERS, never surrounding text.
 * This prevents accidentally converting translated words back to English
 * (e.g., "124 comandos" must NOT become "124 commands").
 *
 * Strategy: Use callback replacers that substitute only the \d+ portion.
 * Thresholds prevent matching small subset counts (e.g., "9 configuration agents").
 */

// Only replace if the number is >= threshold (avoids matching subset counts)
const AGENT_THRESHOLD = 50;   // Total agent count has never been below 50
const COMMAND_THRESHOLD = 70;  // Total command count has never been below 70

const TRANSLATED_DOCS_PATTERNS = [
  // === AGENT COUNT PATTERNS (only replace if n >= AGENT_THRESHOLD) ===

  // **N specialized agents** (English string kept across all translations)
  { regex: /\*\*(\d+) specialized agents\*\*/g, replacement: (c) => (_, n) =>
    parseInt(n) >= AGENT_THRESHOLD ? `**${c.agents} specialized agents**` : `**${n} specialized agents**` },
  // "N specialized agents" (JSX comment attributes in installation pages)
  { regex: /"(\d+) specialized agents"/g, replacement: (c) => (_, n) =>
    parseInt(n) >= AGENT_THRESHOLD ? `"${c.agents} specialized agents"` : `"${n} specialized agents"` },
  // Agents: N specialized agents (context docs)
  { regex: /((?:\*\*)?Agents(?:\*\*)?: )(\d+)( specialized agents)/g, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= AGENT_THRESHOLD ? `${pre}${c.agents}${post}` : `${pre}${n}${post}` },
  // "the N specialized agents" / "les N agents spécialisés" etc.
  { regex: /((?:the|les|los|os|die) )(\d+)( (?:specialized agents|agents? sp))/gi, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= AGENT_THRESHOLD ? `${pre}${c.agents}${post}` : `${pre}${n}${post}` },
  // "### N Agents Spécialisés" (French heading)
  { regex: /(### )(\d+)( Agents? Sp)/g, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= AGENT_THRESHOLD ? `${pre}${c.agents}${post}` : `${pre}${n}${post}` },

  // === COMMAND COUNT PATTERNS (only replace if n >= COMMAND_THRESHOLD) ===

  // **N slash commands** (English string kept across all translations)
  { regex: /\*\*(\d+) slash commands\*\*/g, replacement: (c) => (_, n) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `**${c.commands} slash commands**` : `**${n} slash commands**` },
  // "N slash commands" (JSX comment attributes)
  { regex: /"(\d+) slash commands"/g, replacement: (c) => (_, n) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `"${c.commands} slash commands"` : `"${n} slash commands"` },
  // "CLI package with N commands"
  { regex: /(CLI package with )(\d+)( commands)/g, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${pre}${c.commands}${post}` : `${pre}${n}${post}` },
  // "all/alle/aller/les/los/os N commands/commandes/Befehle/comandos" (all languages)
  { regex: /((?:all|alle[rn]?|les|los|os|tous les|todas? (?:las|os)) )(\d+)( (?:slash )?(?:commands|commandes|Befehle|comandos))/gi, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${pre}${c.commands}${post}` : `${pre}${n}${post}` },
  // "plus de N commandes" / "mehr als N Befehle" / "más de N comandos" (approximations)
  { regex: /((?:plus de|mehr als|más de|mais de) )(\d+)( (?:commandes|Befehle|comandos|commands))/gi, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${pre}${c.commands}${post}` : `${pre}${n}${post}` },
  // "N Befehle" standalone (German, with optional prefix)
  { regex: /((?:über )?)(\d+)( (?:AgileFlow-Slash-)?Befehle)/g, replacement: (c) => (_, pre, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${pre}${c.commands}${post}` : `${pre}${n}${post}` },
  // Spanish description frontmatter: "N comandos de barra"
  { regex: /(\d+)( comandos de barra)/gi, replacement: (c) => (_, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${c.commands}${post}` : `${n}${post}` },
  // Portuguese description frontmatter: "N comandos de barra"
  { regex: /(\d+)( comandos de barra)/gi, replacement: (c) => (_, n, post) =>
    parseInt(n) >= COMMAND_THRESHOLD ? `${c.commands}${post}` : `${n}${post}` },

  // === COMBINED PATTERNS (N commands + N agents in same sentence) ===

  // "has N commands and N agents" / "tiene N comandos y N agentes" etc.
  // Only replace numbers, preserve all surrounding text
  { regex: /(\d+)( (?:commands?|commandes?|comandos?|Befehle) (?:and|et|und|y|e) )(\d+)( (?:agents?|agentes?|Agenten))/g,
    replacement: (c) => (_, cmd, mid, agt, post) => {
      const newCmd = parseInt(cmd) >= COMMAND_THRESHOLD ? c.commands : cmd;
      const newAgt = parseInt(agt) >= AGENT_THRESHOLD ? c.agents : agt;
      return `${newCmd}${mid}${newAgt}${post}`;
    }},
];

/**
 * Discover translated .mdx files and apply generic count patterns.
 * Scans apps/docs/content/docs/ for .mdx files with language suffixes.
 */
function getTranslatedFiles() {
  const docsDir = path.join(ROOT, 'apps/docs/content/docs');
  if (!fs.existsSync(docsDir)) return [];

  const files = [];
  const LANG_SUFFIXES = ['.ar.mdx', '.de.mdx', '.es.mdx', '.fr.mdx', '.pt.mdx'];
  // Also include base .mdx files in directories that have translations
  const DIRS_WITH_COUNTS = ['agents', 'commands', 'features', 'installation'];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.mdx')) {
        const relDir = path.relative(docsDir, dir);
        const topDir = relDir.split(path.sep)[0];
        // Include files in count-relevant directories
        if (DIRS_WITH_COUNTS.includes(topDir)) {
          // Include translated files and base files like getting-started.mdx, index.mdx
          if (LANG_SUFFIXES.some(s => entry.name.endsWith(s)) ||
              ['getting-started.mdx', 'index.mdx', 'smart-detect.mdx', 'compact-context.mdx',
               'context.mdx'].includes(entry.name)) {
            files.push(path.relative(ROOT, fullPath));
          }
        }
        // Also include root-level translated docs
        if (relDir === '.' && LANG_SUFFIXES.some(s => entry.name.endsWith(s))) {
          files.push(path.relative(ROOT, fullPath));
        }
      }
    }
  }

  walk(docsDir);
  return files;
}

// =============================================================================
// Main Logic
// =============================================================================

function syncCounts(options = {}) {
  const { check = false, dryRun = false } = options;

  // Get current counts from shared counter module
  const counts = getSourceCounts(CLI_ROOT);

  console.log('📊 Current counts:');
  console.log(`   Commands: ${counts.commands}`);
  console.log(`   Agents:   ${counts.agents}`);
  console.log(`   Skills:   ${counts.skills}`);
  console.log('');

  let hasChanges = false;
  let errors = [];

  // Phase 1: Explicit file patterns (README, CLAUDE.md, etc.)
  for (const config of FILES_TO_UPDATE) {
    const filePath = path.join(ROOT, config.file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${config.file} (not found)`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    for (const pattern of config.patterns) {
      const newValue = pattern.replacement(counts);
      content = content.replace(pattern.regex, newValue);
    }

    if (content !== originalContent) {
      hasChanges = true;

      if (check) {
        errors.push(config.file);
        console.log(`❌ ${config.file} - counts are out of sync`);
      } else if (dryRun) {
        console.log(`📝 Would update: ${config.file}`);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated: ${config.file}`);
      }
    } else {
      console.log(`✓  ${config.file} - already up to date`);
    }
  }

  // Phase 2: Auto-discovered translated docs
  const translatedFiles = getTranslatedFiles();
  if (translatedFiles.length > 0) {
    console.log('');
    console.log(`🌐 Scanning ${translatedFiles.length} translated docs...`);
    let translatedUpdated = 0;

    for (const relFile of translatedFiles) {
      const filePath = path.join(ROOT, relFile);
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;

      for (const pattern of TRANSLATED_DOCS_PATTERNS) {
        const replacer = pattern.replacement(counts);
        if (typeof replacer === 'function') {
          // Replacer is a function that takes the match - use it as callback
          content = content.replace(pattern.regex, replacer);
        } else {
          content = content.replace(pattern.regex, replacer);
        }
      }

      if (content !== originalContent) {
        translatedUpdated++;
        hasChanges = true;

        if (check) {
          errors.push(relFile);
          console.log(`   ❌ ${relFile}`);
        } else if (dryRun) {
          console.log(`   📝 Would update: ${relFile}`);
        } else {
          fs.writeFileSync(filePath, content, 'utf8');
          console.log(`   ✅ ${relFile}`);
        }
      }
    }

    if (translatedUpdated === 0) {
      console.log('   ✓  All translated docs up to date');
    } else {
      console.log(`   Updated ${translatedUpdated} translated file(s)`);
    }
  }

  console.log('');

  if (check) {
    if (errors.length > 0) {
      console.log('❌ Count verification failed!');
      console.log('   Run `node scripts/sync-counts.js` to fix.');
      process.exit(1);
    } else {
      console.log('✅ All counts are in sync!');
    }
  } else if (dryRun) {
    if (hasChanges) {
      console.log('ℹ️  Run without --dry-run to apply changes.');
    } else {
      console.log('✅ No changes needed.');
    }
  } else {
    if (hasChanges) {
      console.log('✅ Counts synchronized successfully!');
    } else {
      console.log('✅ All counts were already correct.');
    }
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

const args = process.argv.slice(2);
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/sync-counts.js [options]

Options:
  --check     Verify counts are correct (exit 1 if not)
  --dry-run   Show what would be changed without writing
  --help, -h  Show this help message

Examples:
  node scripts/sync-counts.js           # Update all counts
  node scripts/sync-counts.js --check   # CI verification
  node scripts/sync-counts.js --dry-run # Preview changes
`);
  process.exit(0);
}

syncCounts({ check, dryRun });
