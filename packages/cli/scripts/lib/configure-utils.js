/**
 * configure-utils.js - File and logging utilities for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = (msg, color = '') => console.log(`${color}${msg}${c.reset}`);
const success = msg => log(`✅ ${msg}`, c.green);
const warn = msg => log(`⚠️  ${msg}`, c.yellow);
const error = msg => log(`❌ ${msg}`, c.red);
const info = msg => log(`ℹ️  ${msg}`, c.dim);
const header = msg => log(`\n${msg}`, c.bold + c.cyan);

// ============================================================================
// FILE UTILITIES
// ============================================================================

const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readJSON = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const writeJSON = (filePath, data) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
};

const copyTemplate = (templateName, destPath) => {
  const sources = [
    path.join(process.cwd(), '.agileflow', 'templates', templateName),
    path.join(__dirname, '..', templateName),
    path.join(__dirname, '..', '..', 'templates', templateName),
  ];
  for (const src of sources) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, destPath);
      try {
        fs.chmodSync(destPath, '755');
      } catch {}
      return true;
    }
  }
  return false;
};

// ============================================================================
// GITIGNORE
// ============================================================================

function updateGitignore() {
  const entries = [
    '.claude/settings.local.json',
    '.claude/activity.log',
    '.claude/context.log',
    '.claude/hook.log',
    '.claude/prompt-log.txt',
    '.claude/session.log',
  ];

  let content = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
  let added = false;

  entries.forEach(entry => {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      added = true;
    }
  });

  if (added) {
    fs.writeFileSync('.gitignore', content.trimEnd() + '\n');
  }
}

module.exports = {
  // Colors
  c,
  // Logging
  log,
  success,
  warn,
  error,
  info,
  header,
  // File utilities
  ensureDir,
  readJSON,
  writeJSON,
  copyTemplate,
  updateGitignore,
};
