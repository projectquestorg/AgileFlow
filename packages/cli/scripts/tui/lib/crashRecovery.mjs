/**
 * Crash Recovery - Session state persistence and recovery
 *
 * Persists ralph-loop state to enable recovery after crashes.
 * Stores checkpoints on each iteration and prompts for recovery
 * when incomplete state is detected.
 */

import fs from 'fs';
import path from 'path';

// Get project root - fallback to process.cwd()
function getProjectRoot() {
  return process.cwd();
}

// Safe JSON read
function safeReadJSON(filePath, opts = {}) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message, data: opts.defaultValue };
  }
}

// Safe JSON write
function safeWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { ok: true };
}

/**
 * Get checkpoint file path
 */
function getCheckpointPath(sessionId = 'default') {
  const rootDir = getProjectRoot();
  return path.join(rootDir, '.agileflow', 'sessions', `${sessionId}.checkpoint`);
}

/**
 * Get session state path
 */
function getSessionStatePath() {
  const rootDir = getProjectRoot();
  return path.join(rootDir, 'docs', '09-agents', 'session-state.json');
}

/**
 * Create checkpoint
 * Called after each iteration to persist state
 */
function createCheckpoint(sessionId = 'default', loopState = null) {
  const checkpointPath = getCheckpointPath(sessionId);

  // Get current loop state if not provided
  if (!loopState) {
    const statePath = getSessionStatePath();
    const result = safeReadJSON(statePath, { defaultValue: {} });
    loopState = result.ok ? result.data.ralph_loop : null;
  }

  if (!loopState || !loopState.enabled) {
    return { ok: false, error: 'No active loop state to checkpoint' };
  }

  const checkpoint = {
    version: 1,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    loop_state: {
      epic: loopState.epic,
      current_story: loopState.current_story,
      iteration: loopState.iteration || 0,
      max_iterations: loopState.max_iterations || 20,
      visual_mode: loopState.visual_mode || false,
      coverage_mode: loopState.coverage_mode || false,
      coverage_threshold: loopState.coverage_threshold || 80,
      coverage_current: loopState.coverage_current || 0,
      started_at: loopState.started_at,
      conditions: loopState.conditions || [],
    },
    recovery_info: {
      can_resume: true,
      last_checkpoint: new Date().toISOString(),
    },
  };

  const result = safeWriteJSON(checkpointPath, checkpoint);

  return {
    ok: result.ok,
    checkpoint,
    path: checkpointPath,
  };
}

/**
 * Load checkpoint
 */
function loadCheckpoint(sessionId = 'default') {
  const checkpointPath = getCheckpointPath(sessionId);

  if (!fs.existsSync(checkpointPath)) {
    return { ok: false, exists: false, error: 'No checkpoint found' };
  }

  const result = safeReadJSON(checkpointPath, { defaultValue: null });

  if (!result.ok || !result.data) {
    return { ok: false, exists: true, error: 'Failed to read checkpoint' };
  }

  return {
    ok: true,
    exists: true,
    checkpoint: result.data,
  };
}

/**
 * Check if recovery is needed
 * Detects incomplete loop state from crash
 */
function checkRecoveryNeeded(sessionId = 'default') {
  // Check for checkpoint file
  const checkpointResult = loadCheckpoint(sessionId);

  if (!checkpointResult.exists) {
    return { needed: false, reason: 'no_checkpoint' };
  }

  if (!checkpointResult.ok) {
    return { needed: false, reason: 'checkpoint_invalid' };
  }

  const checkpoint = checkpointResult.checkpoint;

  // Check if checkpoint is stale (older than 1 hour without update)
  const lastCheckpoint = new Date(
    checkpoint.recovery_info?.last_checkpoint || checkpoint.created_at
  );
  const now = new Date();
  const hoursSinceCheckpoint = (now - lastCheckpoint) / (1000 * 60 * 60);

  if (hoursSinceCheckpoint > 24) {
    return { needed: false, reason: 'checkpoint_expired', checkpoint };
  }

  // Check if loop was in progress
  const loopState = checkpoint.loop_state;
  if (!loopState || loopState.iteration === 0) {
    return { needed: false, reason: 'loop_not_started', checkpoint };
  }

  // Check current session state
  const statePath = getSessionStatePath();
  const stateResult = safeReadJSON(statePath, { defaultValue: {} });
  const currentState = stateResult.ok ? stateResult.data : {};

  // If loop is still enabled and matches checkpoint, no recovery needed
  if (currentState.ralph_loop && currentState.ralph_loop.enabled) {
    if (currentState.ralph_loop.iteration === loopState.iteration) {
      return { needed: false, reason: 'loop_still_active', checkpoint };
    }
  }

  // Loop was in progress but not active now - recovery needed
  return {
    needed: true,
    reason: 'incomplete_loop',
    checkpoint,
    recovery_options: {
      resume: {
        iteration: loopState.iteration,
        story: loopState.current_story,
        epic: loopState.epic,
      },
      fresh: {
        message: 'Start fresh from beginning of epic',
      },
    },
  };
}

/**
 * Resume from checkpoint
 */
function resumeFromCheckpoint(sessionId = 'default') {
  const checkpointResult = loadCheckpoint(sessionId);

  if (!checkpointResult.ok || !checkpointResult.checkpoint) {
    return { ok: false, error: 'No valid checkpoint to resume from' };
  }

  const checkpoint = checkpointResult.checkpoint;
  const loopState = checkpoint.loop_state;

  // Restore loop state to session state
  const statePath = getSessionStatePath();
  const stateResult = safeReadJSON(statePath, { defaultValue: {} });
  const state = stateResult.ok ? stateResult.data : {};

  state.ralph_loop = {
    enabled: true,
    epic: loopState.epic,
    current_story: loopState.current_story,
    iteration: loopState.iteration,
    max_iterations: loopState.max_iterations,
    visual_mode: loopState.visual_mode,
    coverage_mode: loopState.coverage_mode,
    coverage_threshold: loopState.coverage_threshold,
    coverage_current: loopState.coverage_current,
    conditions: loopState.conditions,
    started_at: loopState.started_at,
    resumed_at: new Date().toISOString(),
    resumed_from_checkpoint: true,
  };

  safeWriteJSON(statePath, state);

  return {
    ok: true,
    resumed: true,
    iteration: loopState.iteration,
    story: loopState.current_story,
    epic: loopState.epic,
  };
}

/**
 * Clear checkpoint (on clean completion)
 */
function clearCheckpoint(sessionId = 'default') {
  const checkpointPath = getCheckpointPath(sessionId);

  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    return { ok: true, cleared: true };
  }

  return { ok: true, cleared: false };
}

/**
 * Start fresh (clear checkpoint and any existing loop state)
 */
function startFresh(sessionId = 'default') {
  // Clear checkpoint
  clearCheckpoint(sessionId);

  // Clear loop state
  const statePath = getSessionStatePath();
  const stateResult = safeReadJSON(statePath, { defaultValue: {} });
  const state = stateResult.ok ? stateResult.data : {};

  if (state.ralph_loop) {
    delete state.ralph_loop;
    safeWriteJSON(statePath, state);
  }

  return { ok: true, cleared: true };
}

/**
 * Get recovery status summary
 */
function getRecoveryStatus(sessionId = 'default') {
  const recovery = checkRecoveryNeeded(sessionId);
  const checkpoint = loadCheckpoint(sessionId);

  return {
    recoveryNeeded: recovery.needed,
    reason: recovery.reason,
    hasCheckpoint: checkpoint.exists,
    checkpoint: checkpoint.checkpoint,
    options: recovery.recovery_options,
  };
}

export {
  getCheckpointPath,
  createCheckpoint,
  loadCheckpoint,
  checkRecoveryNeeded,
  resumeFromCheckpoint,
  clearCheckpoint,
  startFresh,
  getRecoveryStatus,
};
