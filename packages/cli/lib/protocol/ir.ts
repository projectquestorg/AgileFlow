/**
 * Intermediate Representation (IR) Types
 *
 * This module defines the unified message format that all CLI drivers
 * translate their native formats into. The dashboard consumes IR messages
 * regardless of which CLI provider is being used.
 */

// ============================================================================
// IR Message Types
// ============================================================================

/**
 * All possible IR message kinds
 */
export type IRKind =
  | 'init' // Session initialization complete
  | 'text' // Text content (non-streaming)
  | 'text_delta' // Streaming text delta
  | 'tool_start' // Tool execution started
  | 'tool_result' // Tool execution completed
  | 'file_op' // File operation (read/write/edit)
  | 'shell' // Shell command execution
  | 'task' // Task management (create/update/list)
  | 'session' // Session state change
  | 'status' // Status update (stories, epics)
  | 'git' // Git operation
  | 'terminal' // Terminal output
  | 'notification' // Notification
  | 'error' // Error occurred
  | 'done'; // Response complete

/**
 * Source CLI provider identifier
 */
export type IRSource = 'claude' | 'codex' | 'gemini';

/**
 * Envelope wrapping all IR messages
 */
export interface IREnvelope<T = unknown> {
  kind: IRKind;
  ts: number; // Unix timestamp (Date.now())
  seq: number; // Monotonic sequence number per session
  sessionId: string; // Session identifier
  source: IRSource; // Which CLI produced this
  payload: T;
}

// ============================================================================
// IR Payload Types
// ============================================================================

/**
 * Session initialization payload
 */
export interface IRInit {
  provider: IRSource;
  version: string;
  capabilities: string[];
  maxContext: number;
}

/**
 * Text content payload
 */
export interface IRText {
  text: string;
  role: 'assistant' | 'system';
}

/**
 * Streaming text delta payload
 */
export interface IRTextDelta {
  text: string;
  done: boolean;
}

/**
 * Tool execution started payload
 */
export interface IRToolStart {
  id: string;
  name: string; // Normalized tool name (e.g., "file_read")
  nativeName: string; // Original CLI tool name (e.g., "Read")
  input: Record<string, unknown>;
}

/**
 * Tool execution result payload
 */
export interface IRToolResult {
  id: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * File operation payload
 */
export interface IRFileOp {
  action: 'read' | 'write' | 'edit';
  path: string;
  content?: string;
  diff?: {
    before: string;
    after: string;
    hunks?: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      content: string;
    }>;
  };
  language?: string;
}

/**
 * Shell command payload
 */
export interface IRShell {
  command: string;
  output: string;
  exitCode: number;
  cwd?: string;
  durationMs?: number;
}

/**
 * Task operation payload
 */
export interface IRTask {
  action: 'create' | 'update' | 'delete' | 'list';
  task?: {
    id: string;
    subject: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
  };
  tasks?: Array<{
    id: string;
    subject: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
}

/**
 * Session state change payload
 */
export interface IRSession {
  state: 'connected' | 'thinking' | 'idle' | 'error' | 'disconnected';
  message?: string;
}

/**
 * Git operation payload
 */
export interface IRGit {
  action: 'status' | 'commit' | 'push' | 'stage' | 'unstage' | 'diff';
  branch?: string;
  staged?: Array<{ path: string; status: string; additions?: number; deletions?: number }>;
  unstaged?: Array<{ path: string; status: string; additions?: number; deletions?: number }>;
  commitHash?: string;
  diff?: string;
}

/**
 * Terminal output payload
 */
export interface IRTerminal {
  terminalId: string;
  data: string;
  type: 'stdout' | 'stderr' | 'exit';
  exitCode?: number;
}

/**
 * Notification payload
 */
export interface IRNotification {
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

/**
 * Error payload
 */
export interface IRError {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

let _seq = 0;

/**
 * Create an IR envelope with auto-incrementing sequence number
 */
export function createIREnvelope<T>(
  kind: IRKind,
  sessionId: string,
  source: IRSource,
  payload: T
): IREnvelope<T> {
  return {
    kind,
    ts: Date.now(),
    seq: ++_seq,
    sessionId,
    source,
    payload,
  };
}

/**
 * Reset sequence counter (for testing)
 */
export function resetIRSequence(): void {
  _seq = 0;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isIRTextDelta(env: IREnvelope): env is IREnvelope<IRTextDelta> {
  return env.kind === 'text_delta';
}

export function isIRToolStart(env: IREnvelope): env is IREnvelope<IRToolStart> {
  return env.kind === 'tool_start';
}

export function isIRToolResult(env: IREnvelope): env is IREnvelope<IRToolResult> {
  return env.kind === 'tool_result';
}

export function isIRFileOp(env: IREnvelope): env is IREnvelope<IRFileOp> {
  return env.kind === 'file_op';
}

export function isIRShell(env: IREnvelope): env is IREnvelope<IRShell> {
  return env.kind === 'shell';
}

export function isIRTask(env: IREnvelope): env is IREnvelope<IRTask> {
  return env.kind === 'task';
}

export function isIRSession(env: IREnvelope): env is IREnvelope<IRSession> {
  return env.kind === 'session';
}

export function isIRGit(env: IREnvelope): env is IREnvelope<IRGit> {
  return env.kind === 'git';
}

export function isIRError(env: IREnvelope): env is IREnvelope<IRError> {
  return env.kind === 'error';
}
