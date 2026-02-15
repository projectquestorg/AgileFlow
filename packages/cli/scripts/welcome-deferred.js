#!/usr/bin/env node

/**
 * welcome-deferred.js - Background post-table operations for SessionStart
 *
 * Spawned by agileflow-welcome.js after the table is displayed.
 * Runs with stdio: 'ignore' (detached background process).
 *
 * Handles non-blocking housekeeping tasks:
 * - npm update check (with cache write to session-state.json)
 * - Session health check
 * - Duplicate Claude process detection
 * - Story claiming cleanup
 * - File tracking cleanup
 * - Epic completion check
 * - Ideation sync
 * - Scheduled automations
 *
 * All session-state.json changes are consolidated into a single write
 * at the end to avoid race conditions with the main welcome script.
 *
 * Warnings are saved to session-state.json under `deferred_warnings`
 * and displayed on the NEXT session start.
 */

const fs = require('fs');
const path = require('path');

// Parse args: node welcome-deferred.js <rootDir> [--version=X.Y.Z] [--skip-update] [--just-updated]
const rootDir = process.argv[2];
if (!rootDir || !fs.existsSync(rootDir)) {
  process.exit(0);
}

const flags = {};
for (const arg of process.argv.slice(3)) {
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0) {
      flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      flags[arg.slice(2)] = true;
    }
  }
}

// Shared utilities
const { getStatusPath, getSessionStatePath, getMetadataPath } = require('../lib/paths');
const { tryOptional } = require('../lib/errors');
const { spawnBackground } = require('../lib/process-executor');
const { readJSONCached } = require('../lib/file-cache');

// Collected warnings to save for next session display
const warnings = [];

// Collected session-state.json mutations (applied in single write at end)
const stateMutations = {};

function addWarning(type, lines) {
  warnings.push({ type, lines, at: new Date().toISOString() });
}

function safeReadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

// 30-second safety timeout to prevent zombie processes
const TIMEOUT_MS = 30000;
const timeoutId = setTimeout(() => {
  process.exit(0);
}, TIMEOUT_MS);

async function main() {
  const sessionStatePath = getSessionStatePath(rootDir);
  const version = flags['version'] || 'unknown';

  // === npm UPDATE CHECK (with cache) ===
  if (!flags['skip-update']) {
    try {
      const checkUpdate = tryOptional(() => require('./check-update.js'), 'check-update');
      if (checkUpdate) {
        const freshUpdateInfo = await checkUpdate.checkForUpdates();

        // Stage update cache for consolidated write
        stateMutations.update_cache = {
          checked_at: new Date().toISOString(),
          result: {
            available: freshUpdateInfo.updateAvailable || false,
            installed: freshUpdateInfo.installed,
            latest: freshUpdateInfo.latest,
            autoUpdate: freshUpdateInfo.autoUpdate || false,
            justUpdated: freshUpdateInfo.justUpdated || false,
            previousVersion: freshUpdateInfo.previousVersion,
          },
        };

        // If update available, save warning for next session
        if (freshUpdateInfo.updateAvailable && freshUpdateInfo.latest) {
          addWarning('update_available', [
            `Update available: v${version} -> v${freshUpdateInfo.latest}`,
            `Run: npx agileflow update`,
          ]);

          // Spawn auto-update if enabled
          if (freshUpdateInfo.autoUpdate) {
            stateMutations.pending_update = {
              from: version,
              to: freshUpdateInfo.latest,
              started_at: new Date().toISOString(),
            };
            spawnBackground('npx', ['agileflow@latest', 'update', '--force'], { cwd: rootDir });
          }
        }

        // Mark version as seen
        if (freshUpdateInfo.justUpdated || flags['just-updated']) {
          checkUpdate.markVersionSeen(freshUpdateInfo.installed || version);
        }
      }
    } catch (e) {
      // Update check failed, non-critical
    }
  } else if (flags['just-updated']) {
    // Even when skipping update check, mark version as seen
    try {
      const checkUpdate = tryOptional(() => require('./check-update.js'), 'check-update');
      if (checkUpdate) {
        checkUpdate.markVersionSeen(version);
      }
    } catch (e) {}
  }

  // === SESSION HEALTH WARNINGS ===
  try {
    let sessionManager;
    try {
      sessionManager = require('./session-manager.js');
    } catch (e) {}

    const health = sessionManager ? sessionManager.getSessionsHealth({ staleDays: 7 }) : null;

    if (health) {
      const healthLines = [];

      if (health.uncommitted.length > 0) {
        healthLines.push(`${health.uncommitted.length} session(s) have uncommitted changes`);
        health.uncommitted.slice(0, 3).forEach(sess => {
          const name = sess.nickname ? `"${sess.nickname}"` : `Session ${sess.id}`;
          healthLines.push(`  ${name}: ${sess.changeCount} file(s)`);
        });
      }

      if (health.stale.length > 0) {
        healthLines.push(`${health.stale.length} session(s) inactive for 7+ days`);
      }

      if (health.orphanedRegistry.length > 0) {
        healthLines.push(`${health.orphanedRegistry.length} session(s) have missing directories`);
      }

      if (healthLines.length > 0) {
        addWarning('session_health', healthLines);
      }
    }
  } catch (e) {}

  // === DUPLICATE CLAUDE PROCESS DETECTION ===
  try {
    const processCleanup = tryOptional(
      () => require('./lib/process-cleanup.js'),
      'process-cleanup'
    );
    if (processCleanup) {
      const cache = { metadata: readJSONCached(getMetadataPath(rootDir)) };
      const autoKillConfigured = cache.metadata?.features?.processCleanup?.autoKill === true;
      const autoKill = autoKillConfigured && process.env.AGILEFLOW_PROCESS_CLEANUP_AUTOKILL === '1';

      const cleanupResult = processCleanup.cleanupDuplicateProcesses({
        rootDir,
        autoKill,
        dryRun: false,
      });

      if (cleanupResult.duplicates > 0) {
        const lines = [];
        if (cleanupResult.killed.length > 0) {
          lines.push(`Cleaned ${cleanupResult.killed.length} duplicate Claude process(es)`);
        } else {
          lines.push(`${cleanupResult.duplicates} other Claude process(es) in same directory`);
        }
        addWarning('process_cleanup', lines);
      }
    }
  } catch (e) {}

  // === STORY CLAIMING CLEANUP ===
  try {
    const storyClaiming = tryOptional(() => require('./lib/story-claiming.js'), 'story-claiming');
    if (storyClaiming) {
      storyClaiming.cleanupStaleClaims({ rootDir });

      const othersResult = storyClaiming.getStoriesClaimedByOthers({ rootDir });
      if (othersResult.ok && othersResult.stories && othersResult.stories.length > 0) {
        const lines = [`${othersResult.stories.length} story(ies) claimed by other sessions`];
        othersResult.stories.slice(0, 3).forEach(s => {
          lines.push(`  ${s.storyId}: claimed by session ${s.sessionId}`);
        });
        addWarning('story_claiming', lines);
      }
    }
  } catch (e) {}

  // === FILE TRACKING CLEANUP ===
  try {
    const fileTracking = tryOptional(() => require('./lib/file-tracking.js'), 'file-tracking');
    if (fileTracking) {
      fileTracking.cleanupStaleTouches({ rootDir });

      const overlapsResult = fileTracking.getMyFileOverlaps({ rootDir });
      if (overlapsResult.ok && overlapsResult.overlaps && overlapsResult.overlaps.length > 0) {
        const lines = [`${overlapsResult.overlaps.length} file(s) being edited by other sessions`];
        addWarning('file_tracking', lines);
      }
    }
  } catch (e) {}

  // === EPIC COMPLETION CHECK ===
  try {
    const storyStateMachine = tryOptional(
      () => require('./lib/story-state-machine.js'),
      'story-state-machine'
    );
    if (storyStateMachine) {
      const statusPath = getStatusPath(rootDir);
      if (fs.existsSync(statusPath)) {
        const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        const incompleteEpics = storyStateMachine.findIncompleteEpics(statusData);

        if (incompleteEpics.length > 0) {
          let autoCompleted = 0;
          const completedLines = [];
          for (const { epicId, completed, total } of incompleteEpics) {
            const result = storyStateMachine.autoCompleteEpic(statusData, epicId);
            if (result.updated) {
              autoCompleted++;
              completedLines.push(`Auto-completed ${epicId} (${completed}/${total} stories done)`);
            }
          }
          if (autoCompleted > 0) {
            fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2) + '\n');
            addWarning('epic_completion', completedLines);
          }
        }
      }
    }
  } catch (e) {}

  // === IDEATION SYNC ===
  try {
    const syncIdeationStatus = tryOptional(
      () => require('./lib/sync-ideation-status.js'),
      'sync-ideation-status'
    );
    if (syncIdeationStatus) {
      const syncResult = syncIdeationStatus.syncImplementedIdeas(rootDir);
      if (syncResult.ok && syncResult.updated > 0) {
        addWarning('ideation_sync', [`Synced ${syncResult.updated} idea(s) as implemented`]);
      }
    }
  } catch (e) {}

  // === SCHEDULED AUTOMATIONS ===
  try {
    const automationRegistry = tryOptional(
      () => require('./lib/automation-registry.js'),
      'automation-registry'
    );
    const automationRunner = tryOptional(
      () => require('./lib/automation-runner.js'),
      'automation-runner'
    );

    if (automationRegistry && automationRunner) {
      automationRegistry.getAutomationRegistry({ rootDir });
      const runner = automationRunner.getAutomationRunner({ rootDir });
      const dueStatus = runner.getDueStatus();

      if (dueStatus.due > 0) {
        const lines = [`${dueStatus.due} automation(s) due to run`];
        dueStatus.dueAutomations.slice(0, 3).forEach(auto => {
          lines.push(`  ${auto.name}`);
        });

        // Spawn automation runner in background
        const runnerScriptPath = path.join(__dirname, 'automation-run-due.js');
        if (fs.existsSync(runnerScriptPath)) {
          spawnBackground('node', [runnerScriptPath], { cwd: rootDir });
          lines.push('Running in background...');
        }

        addWarning('automations', lines);
      }
    }
  } catch (e) {}

  // === SINGLE CONSOLIDATED WRITE TO SESSION STATE ===
  // Read once, apply all mutations, write once. Avoids race conditions.
  try {
    const state = safeReadJSON(sessionStatePath) || {};

    // Apply staged mutations
    for (const [key, value] of Object.entries(stateMutations)) {
      state[key] = value;
    }

    // Save collected warnings
    if (warnings.length > 0) {
      state.deferred_warnings = warnings;
    }

    const dir = path.dirname(sessionStatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    // Write failed, warnings will be lost for this session
  }

  clearTimeout(timeoutId);
}

main().catch(() => {
  clearTimeout(timeoutId);
  process.exit(0);
});
