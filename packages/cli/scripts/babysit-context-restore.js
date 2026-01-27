#!/usr/bin/env node
/**
 * babysit-context-restore.js - UserPromptSubmit hook
 *
 * Backup mechanism to restore babysit context after plan mode clears context.
 * When user selects "Clear context and bypass permissions" after ExitPlanMode,
 * this hook fires on the next user prompt and reminds Claude of babysit rules.
 *
 * The primary mechanism is embedding rules in the plan file (Rule #6).
 * This hook is a backup for edge cases where plan file approach might miss.
 *
 * Usage: Called automatically as UserPromptSubmit hook
 */

const fs = require('fs');
const path = require('path');

// Find session-state.json - try multiple locations
function findSessionState() {
  const locations = [
    'docs/09-agents/session-state.json',
    path.join(process.env.CLAUDE_PROJECT_DIR || '.', 'docs/09-agents/session-state.json'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }
  return null;
}

function main() {
  const sessionStatePath = findSessionState();
  if (!sessionStatePath) return;

  try {
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));

    // Check if restoration is pending
    if (!state.babysit_pending_restore) return;

    // Output restoration context
    console.log('');
    console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  \x1b[1m\x1b[33m/babysit CONTEXT RESTORED\x1b[0m                                   \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  /agileflow:babysit was active before context clear.         \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  These rules are MANDATORY:                                  \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                              \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  1. ALWAYS end responses with AskUserQuestion tool           \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  2. Use EnterPlanMode before non-trivial tasks               \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  3. Delegate complex work to domain experts                  \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  4. Track progress with TodoWrite for 3+ step tasks          \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                              \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  For full context: /agileflow:babysit                        \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');

    // Clear the flag (one-time restoration)
    state.babysit_pending_restore = false;
    state.babysit_restored_at = new Date().toISOString();
    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    // Silently fail - don't break user's workflow
  }
}

main();
