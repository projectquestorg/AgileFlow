#!/usr/bin/env node
/**
 * agileflow-configure.js - Comprehensive configuration management
 *
 * Features:
 *   - DETECT: Show current configuration status
 *   - MIGRATE: Fix old/invalid formats automatically
 *   - ENABLE: Turn on features
 *   - DISABLE: Turn off features
 *   - PROFILES: Quick presets (full, basic, minimal, none)
 *   - RECONFIGURE: Change settings (archival days, etc.)
 *
 * Usage:
 *   node .agileflow/scripts/agileflow-configure.js [options]
 *
 * Options:
 *   --profile=full|basic|minimal|none   Apply a preset
 *   --enable=<features>                 Enable specific features
 *   --disable=<features>                Disable specific features
 *   --archival-days=<N>                 Set archival threshold
 *   --migrate                           Fix old formats without changing features
 *   --validate                          Check for issues
 *   --detect                            Show current status
 *   --help                              Show help
 *
 * Features: sessionstart, precompact, ralphloop, selfimprove, archival, statusline, autoupdate, damagecontrol, askuserquestion
 */

const fs = require('fs');
const path = require('path');
const { isValidProfileName, isValidFeatureName, parseIntBounded } = require('../lib/validate');

// Import extracted modules
const { c, log, success, header } = require('./lib/configure-utils');
const { detectConfig, printStatus } = require('./lib/configure-detect');
const {
  PROFILES,
  enableFeature,
  disableFeature,
  applyProfile,
  setStatuslineComponents,
  listStatuslineComponents,
  migrateSettings,
  upgradeFeatures,
} = require('./lib/configure-features');
const { listScripts, showVersionInfo, repairScripts } = require('./lib/configure-repair');

// ============================================================================
// VERSION
// ============================================================================

function getVersion() {
  // Try agileflow-metadata.json first
  try {
    const metaPath = path.join(process.cwd(), 'docs/00-meta/agileflow-metadata.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.version) return meta.version;
    }
  } catch {}

  // Try .agileflow/package.json
  try {
    const pkgPath = path.join(process.cwd(), '.agileflow/package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  // Fallback to script's own package.json
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  return 'unknown';
}

const VERSION = getVersion();

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(actions) {
  header('Configuration Complete!');

  if (actions.enabled?.length > 0) {
    log('\nEnabled:', c.green);
    actions.enabled.forEach(f => log(`   ${f}`, c.green));
  }

  if (actions.disabled?.length > 0) {
    log('\nDisabled:', c.dim);
    actions.disabled.forEach(f => log(`   ${f}`, c.dim));
  }

  if (actions.migrated) {
    log('\nMigrated: Fixed format issues', c.yellow);
  }

  log('\n' + '='.repeat(55), c.red);
  log(' RESTART CLAUDE CODE NOW!', c.red + c.bold);
  log('   Quit completely, wait 5 seconds, restart', c.red);
  log('='.repeat(55), c.red);
}

// ============================================================================
// HELP
// ============================================================================

function printHelp() {
  log(`
${c.bold}AgileFlow Configure${c.reset} - Manage AgileFlow features

${c.cyan}Usage:${c.reset}
  node .agileflow/scripts/agileflow-configure.js [options]

${c.cyan}Profiles:${c.reset}
  --profile=full      All features (hooks, Stop hooks, archival, statusline)
  --profile=basic     SessionStart + PreCompact + archival (no Stop hooks)
  --profile=minimal   SessionStart + archival only
  --profile=none      Disable all AgileFlow features

${c.cyan}Feature Control:${c.reset}
  --enable=<list>     Enable features (comma-separated)
  --disable=<list>    Disable features (comma-separated)

  Features: sessionstart, precompact, ralphloop, selfimprove, archival, statusline, damagecontrol, askuserquestion

${c.cyan}Statusline Components:${c.reset}
  --show=<list>       Show statusline components (comma-separated)
  --hide=<list>       Hide statusline components (comma-separated)
  --components        List statusline component status

  Components: agileflow, model, story, epic, wip, context, cost, git

${c.cyan}Settings:${c.reset}
  --archival-days=N   Set archival threshold (default: 30)

${c.cyan}Maintenance:${c.reset}
  --migrate           Fix old/invalid formats
  --upgrade           Re-deploy all enabled features with latest scripts
  --validate          Check for issues (same as --detect)
  --detect            Show current configuration

${c.cyan}Repair & Diagnostics:${c.reset}
  --repair              Check for and restore missing scripts
  --repair=<feature>    Repair scripts for a specific feature
  --version             Show installed vs latest version info
  --list-scripts        List all scripts with their status

${c.cyan}Examples:${c.reset}
  # Quick setup with all features
  node .agileflow/scripts/agileflow-configure.js --profile=full

  # Enable specific features
  node .agileflow/scripts/agileflow-configure.js --enable=sessionstart,precompact,archival

  # Disable a feature
  node .agileflow/scripts/agileflow-configure.js --disable=statusline

  # Show only agileflow branding and context in statusline
  node .agileflow/scripts/agileflow-configure.js --hide=model,story,epic,wip,cost,git

  # Fix format issues
  node .agileflow/scripts/agileflow-configure.js --migrate

  # Check current status
  node .agileflow/scripts/agileflow-configure.js --detect
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let profile = null;
  let enable = [];
  let disable = [];
  let show = [];
  let hide = [];
  let archivalDays = 30;
  let migrate = false;
  let detect = false;
  let upgrade = false;
  let components = false;
  let help = false;
  let repair = false;
  let repairFeature = null;
  let showVersion = false;
  let listScriptsMode = false;

  args.forEach(arg => {
    if (arg.startsWith('--profile=')) profile = arg.split('=')[1];
    else if (arg.startsWith('--enable='))
      enable = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--disable='))
      disable = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--show='))
      show = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--hide='))
      hide = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--archival-days='))
      archivalDays = parseIntBounded(arg.split('=')[1], 30, 1, 365);
    else if (arg === '--migrate') migrate = true;
    else if (arg === '--detect' || arg === '--validate') detect = true;
    else if (arg === '--upgrade') upgrade = true;
    else if (arg === '--components') components = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--repair') repair = true;
    else if (arg.startsWith('--repair=')) {
      repair = true;
      repairFeature = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--version' || arg === '-v') showVersion = true;
    else if (arg === '--list-scripts' || arg === '--scripts') listScriptsMode = true;
  });

  // Help mode
  if (help) {
    printHelp();
    return;
  }

  // List scripts mode
  if (listScriptsMode) {
    listScripts();
    return;
  }

  // Version info mode
  if (showVersion) {
    showVersionInfo(VERSION);
    return;
  }

  // Repair mode
  if (repair) {
    const needsRestart = repairScripts(repairFeature);
    if (needsRestart) {
      log('\n' + '='.repeat(55), c.red);
      log(' RESTART CLAUDE CODE NOW!', c.red + c.bold);
      log('   Quit completely, wait 5 seconds, restart', c.red);
      log('='.repeat(55), c.red);
    }
    return;
  }

  // Components list mode
  if (components && show.length === 0 && hide.length === 0) {
    listStatuslineComponents();
    return;
  }

  // Component toggle mode
  if (show.length > 0 || hide.length > 0) {
    setStatuslineComponents(show, hide);
    listStatuslineComponents();
    return;
  }

  // Always detect first
  const status = detectConfig(VERSION);
  const { hasIssues, hasOutdated } = printStatus(status);

  // Detect only mode
  if (detect && !migrate && !upgrade && !profile && enable.length === 0 && disable.length === 0) {
    return;
  }

  // Upgrade mode
  if (upgrade) {
    upgradeFeatures(status, VERSION);
    return;
  }

  // Migrate mode
  if (migrate) {
    migrateSettings();
    return;
  }

  // Auto-migrate if issues detected
  if (hasIssues && (profile || enable.length > 0)) {
    log('\n  Auto-migrating invalid formats...', c.yellow);
    migrateSettings();
  }

  const actions = { enabled: [], disabled: [], migrated: hasIssues };

  // Apply profile
  if (profile) {
    applyProfile(profile, { archivalDays }, VERSION);
    const p = PROFILES[profile];
    actions.enabled = p.enable || [];
    actions.disabled = p.disable || [];
  }

  // Enable specific features
  enable.forEach(f => {
    if (enableFeature(f, { archivalDays }, VERSION)) {
      actions.enabled.push(f);
    }
  });

  // Disable specific features
  disable.forEach(f => {
    if (disableFeature(f, VERSION)) {
      actions.disabled.push(f);
    }
  });

  // Print summary if anything changed
  if (actions.enabled.length > 0 || actions.disabled.length > 0) {
    printSummary(actions);
  } else if (!detect) {
    log('\nNo changes made. Use --help for usage.', c.dim);
  }
}

main();
