/**
 * CLI Driver Interface
 *
 * This module defines the abstract interface that all CLI drivers must implement.
 * Each driver translates its native CLI protocol into the unified IR format.
 */

import { IREnvelope, IRSource } from './ir';

// ============================================================================
// Capability Types
// ============================================================================

/**
 * Named capabilities that drivers can support
 */
export type CapabilityName =
  | 'file.read'
  | 'file.write'
  | 'file.edit'
  | 'shell.exec'
  | 'web.search'
  | 'web.fetch'
  | 'session.resume'
  | 'session.fork' // Codex only
  | 'session.rollback' // Codex only
  | 'agent.spawn' // Claude only
  | 'todo.manage'
  | 'checkpoint' // Gemini only
  | 'conductor' // Gemini only
  | 'mcp.support'
  | 'image.vision';

/**
 * Capability descriptor
 */
export interface Capability {
  name: CapabilityName;
  available: boolean;
  viaMcp?: boolean; // True if available via MCP extension
  details?: string;
}

// ============================================================================
// Driver Configuration
// ============================================================================

/**
 * Configuration for starting a driver
 */
export interface DriverConfig {
  /** Working directory for the CLI */
  cwd: string;

  /** Environment variables to pass to CLI */
  env?: Record<string, string>;

  /** API key (if required) */
  apiKey?: string;

  /** Model to use (e.g., "claude-3-opus", "gpt-4", "gemini-pro") */
  model?: string;

  /** Maximum context tokens */
  maxTokens?: number;

  /** Additional CLI-specific options */
  options?: Record<string, unknown>;
}

/**
 * Driver status information
 */
export interface DriverStatus {
  state: 'starting' | 'ready' | 'busy' | 'error' | 'stopped';
  provider: IRSource;
  version?: string;
  model?: string;
  contextUsed?: number;
  contextMax?: number;
  error?: string;
  lastActivity?: number;
}

// ============================================================================
// CLI Commands (Dashboard -> Driver)
// ============================================================================

/**
 * Command types that can be sent to a driver
 */
export type CLICommandType = 'message' | 'cancel' | 'refresh' | 'git' | 'terminal' | 'image';

/**
 * Base command interface
 */
export interface CLICommandBase {
  type: CLICommandType;
  id?: string; // Optional correlation ID
}

/**
 * Send a message to the AI
 */
export interface CLIMessageCommand extends CLICommandBase {
  type: 'message';
  content: string;
  images?: Array<{
    base64: string;
    mimeType: string;
  }>;
}

/**
 * Cancel current operation
 */
export interface CLICancelCommand extends CLICommandBase {
  type: 'cancel';
}

/**
 * Request data refresh
 */
export interface CLIRefreshCommand extends CLICommandBase {
  type: 'refresh';
  what: 'tasks' | 'status' | 'files' | 'git' | 'automations' | 'inbox';
}

/**
 * Git operation
 */
export interface CLIGitCommand extends CLICommandBase {
  type: 'git';
  action: 'stage' | 'unstage' | 'revert' | 'commit' | 'push' | 'pr' | 'diff' | 'status';
  path?: string;
  message?: string;
  push?: boolean;
  title?: string;
  body?: string;
}

/**
 * Terminal operation
 */
export interface CLITerminalCommand extends CLICommandBase {
  type: 'terminal';
  action: 'spawn' | 'input' | 'resize' | 'close';
  terminalId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

/**
 * Union of all command types
 */
export type CLICommand =
  | CLIMessageCommand
  | CLICancelCommand
  | CLIRefreshCommand
  | CLIGitCommand
  | CLITerminalCommand;

// ============================================================================
// Driver Interface
// ============================================================================

/**
 * Event handler for IR messages
 */
export type IREventHandler = (envelope: IREnvelope) => void;

/**
 * Abstract driver interface that all CLI drivers must implement
 */
export interface Driver {
  /** Unique driver identifier */
  readonly id: IRSource;

  /** Human-readable driver name */
  readonly name: string;

  /** Current driver status */
  readonly status: DriverStatus;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the driver for a session
   */
  start(sessionId: string, config: DriverConfig): Promise<void>;

  /**
   * Stop the driver for a session
   */
  stop(sessionId: string): Promise<void>;

  /**
   * Check if driver is available/installed
   */
  isAvailable(): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * Get list of capabilities this driver supports
   */
  capabilities(): Capability[];

  /**
   * Check if a specific capability is available
   */
  hasCapability(name: CapabilityName): boolean;

  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------

  /**
   * Send a command to the CLI
   */
  send(sessionId: string, command: CLICommand): Promise<void>;

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /**
   * Register handler for IR events
   */
  onEvent(handler: IREventHandler): void;

  /**
   * Remove event handler
   */
  offEvent(handler: IREventHandler): void;
}

// ============================================================================
// Driver Manager
// ============================================================================

/**
 * Manages multiple CLI drivers
 */
export interface DriverManager {
  /**
   * Register a driver
   */
  register(driver: Driver): void;

  /**
   * Get driver by ID
   */
  get(id: IRSource): Driver | undefined;

  /**
   * Get all registered drivers
   */
  all(): Driver[];

  /**
   * Get available (installed) drivers
   */
  available(): Promise<Driver[]>;

  /**
   * Get the default/preferred driver
   */
  default(): Driver | undefined;

  /**
   * Set the default driver
   */
  setDefault(id: IRSource): void;
}

// ============================================================================
// Default Capabilities by Provider
// ============================================================================

export const CLAUDE_CAPABILITIES: Capability[] = [
  { name: 'file.read', available: true },
  { name: 'file.write', available: true },
  { name: 'file.edit', available: true },
  { name: 'shell.exec', available: true },
  { name: 'web.search', available: true },
  { name: 'web.fetch', available: true },
  { name: 'session.resume', available: true },
  { name: 'session.fork', available: false },
  { name: 'session.rollback', available: false },
  { name: 'agent.spawn', available: true },
  { name: 'todo.manage', available: true },
  { name: 'checkpoint', available: false },
  { name: 'conductor', available: false },
  { name: 'mcp.support', available: true },
  { name: 'image.vision', available: true },
];

export const CODEX_CAPABILITIES: Capability[] = [
  { name: 'file.read', available: true },
  { name: 'file.write', available: true },
  { name: 'file.edit', available: true },
  { name: 'shell.exec', available: true },
  { name: 'web.search', available: true },
  { name: 'web.fetch', available: true },
  { name: 'session.resume', available: true },
  { name: 'session.fork', available: true },
  { name: 'session.rollback', available: true },
  { name: 'agent.spawn', available: false },
  { name: 'todo.manage', available: false },
  { name: 'checkpoint', available: false },
  { name: 'conductor', available: false },
  { name: 'mcp.support', available: true },
  { name: 'image.vision', available: true },
];

export const GEMINI_CAPABILITIES: Capability[] = [
  { name: 'file.read', available: true },
  { name: 'file.write', available: true },
  { name: 'file.edit', available: true },
  { name: 'shell.exec', available: true },
  { name: 'web.search', available: true },
  { name: 'web.fetch', available: true },
  { name: 'session.resume', available: true },
  { name: 'session.fork', available: false },
  { name: 'session.rollback', available: false },
  { name: 'agent.spawn', available: false },
  { name: 'todo.manage', available: true },
  { name: 'checkpoint', available: true },
  { name: 'conductor', available: true },
  { name: 'mcp.support', available: true },
  { name: 'image.vision', available: true },
];

/**
 * Get default capabilities for a provider
 */
export function getDefaultCapabilities(source: IRSource): Capability[] {
  switch (source) {
    case 'claude':
      return CLAUDE_CAPABILITIES;
    case 'codex':
      return CODEX_CAPABILITIES;
    case 'gemini':
      return GEMINI_CAPABILITIES;
    default:
      return [];
  }
}
