/**
 * Claude Code Driver
 *
 * Driver implementation for Claude Code CLI (Anthropic).
 * Translates Claude's native protocol to the unified IR format.
 */

import {
  Driver,
  DriverConfig,
  DriverStatus,
  Capability,
  CapabilityName,
  CLICommand,
  IREventHandler,
  CLAUDE_CAPABILITIES,
} from "../protocol/driver";
import {
  IREnvelope,
  IRSource,
  createIREnvelope,
  IRTextDelta,
  IRToolStart,
  IRToolResult,
  IRSession,
  IRInit,
  IRTask,
  IRGit,
  IRError,
} from "../protocol/ir";

// ============================================================================
// Tool Name Mapping (Claude -> IR normalized names)
// ============================================================================

const CLAUDE_TOOL_MAPPING: Record<string, string> = {
  "Read": "file_read",
  "Write": "file_write",
  "Edit": "file_edit",
  "Bash": "shell_exec",
  "Glob": "file_glob",
  "Grep": "file_grep",
  "WebSearch": "web_search",
  "WebFetch": "web_fetch",
  "Task": "agent_spawn",
  "TaskCreate": "todo_create",
  "TaskUpdate": "todo_update",
  "TaskList": "todo_list",
  "TaskGet": "todo_get",
  "AskUserQuestion": "user_question",
  "EnterPlanMode": "plan_mode_enter",
  "ExitPlanMode": "plan_mode_exit",
  "Skill": "skill_invoke",
  "NotebookEdit": "notebook_edit",
};

/**
 * Normalize Claude tool name to IR format
 */
function normalizeToolName(claudeName: string): string {
  return CLAUDE_TOOL_MAPPING[claudeName] || claudeName.toLowerCase();
}

// ============================================================================
// Claude Driver Implementation
// ============================================================================

export class ClaudeDriver implements Driver {
  readonly id: IRSource = "claude";
  readonly name = "Claude Code";

  private _status: DriverStatus = {
    state: "stopped",
    provider: "claude",
  };

  private _capabilities: Capability[] = [...CLAUDE_CAPABILITIES];
  private _eventHandlers: Set<IREventHandler> = new Set();
  private _sessions: Map<string, { config: DriverConfig; seqCounter: number }> = new Map();

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  get status(): DriverStatus {
    return this._status;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(sessionId: string, config: DriverConfig): Promise<void> {
    this._sessions.set(sessionId, { config, seqCounter: 0 });

    this._status = {
      state: "ready",
      provider: "claude",
      model: config.model || "claude-3-opus",
      contextMax: config.maxTokens || 200000,
    };

    // Emit init event
    const initPayload: IRInit = {
      provider: "claude",
      version: "1.0.0", // TODO: Get actual version from CLI
      capabilities: this._capabilities.filter(c => c.available).map(c => c.name),
      maxContext: config.maxTokens || 200000,
    };

    this._emit(createIREnvelope("init", sessionId, "claude", initPayload));
  }

  async stop(sessionId: string): Promise<void> {
    this._sessions.delete(sessionId);

    if (this._sessions.size === 0) {
      this._status = {
        ...this._status,
        state: "stopped",
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    // Check if 'claude' command is available
    // In a real implementation, this would use exec/spawn to check
    return true; // Assume available for now
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  capabilities(): Capability[] {
    return this._capabilities;
  }

  hasCapability(name: CapabilityName): boolean {
    const cap = this._capabilities.find(c => c.name === name);
    return cap?.available ?? false;
  }

  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------

  async send(sessionId: string, command: CLICommand): Promise<void> {
    // Mark as busy
    this._status = { ...this._status, state: "busy" };

    // This would normally send to the CLI process
    // For now, just emit a session state change
    const sessionPayload: IRSession = {
      state: "thinking",
    };
    this._emit(createIREnvelope("session", sessionId, "claude", sessionPayload));
  }

  // -------------------------------------------------------------------------
  // Message Translation (Claude -> IR)
  // -------------------------------------------------------------------------

  /**
   * Translate a Claude-native message to IR format
   * Called by the dashboard server when it receives messages from Claude
   */
  translateToIR(sessionId: string, claudeMessage: ClaudeNativeMessage): IREnvelope | null {
    const session = this._sessions.get(sessionId);
    if (!session) return null;

    switch (claudeMessage.type) {
      case "text":
        return createIREnvelope<IRTextDelta>("text_delta", sessionId, "claude", {
          text: claudeMessage.content,
          done: claudeMessage.done ?? false,
        });

      case "tool_use":
        return createIREnvelope<IRToolStart>("tool_start", sessionId, "claude", {
          id: claudeMessage.id || `tool_${Date.now()}`,
          name: normalizeToolName(claudeMessage.tool),
          nativeName: claudeMessage.tool,
          input: claudeMessage.input || {},
        });

      case "tool_result":
        return createIREnvelope<IRToolResult>("tool_result", sessionId, "claude", {
          id: claudeMessage.id || "",
          ok: !claudeMessage.error,
          output: claudeMessage.content,
          error: claudeMessage.error,
        });

      case "task":
        return createIREnvelope<IRTask>("task", sessionId, "claude", {
          action: claudeMessage.action as "create" | "update" | "delete" | "list",
          task: claudeMessage.task ? {
            ...claudeMessage.task,
            status: claudeMessage.task.status as "pending" | "in_progress" | "completed",
          } : undefined,
          tasks: claudeMessage.tasks?.map((t: { id: string; subject: string; status: string }) => ({
            ...t,
            status: t.status as "pending" | "in_progress" | "completed",
          })),
        });

      case "git_status":
        return createIREnvelope<IRGit>("git", sessionId, "claude", {
          action: "status",
          branch: claudeMessage.branch,
          staged: claudeMessage.staged,
          unstaged: claudeMessage.unstaged,
        });

      case "session_state":
        return createIREnvelope<IRSession>("session", sessionId, "claude", {
          state: claudeMessage.state as "connected" | "thinking" | "idle" | "error",
          message: claudeMessage.message,
        });

      case "error":
        return createIREnvelope<IRError>("error", sessionId, "claude", {
          code: claudeMessage.code || "UNKNOWN",
          message: claudeMessage.message,
          details: claudeMessage.details,
          recoverable: claudeMessage.recoverable ?? true,
        });

      default:
        // Unknown message type, skip
        return null;
    }
  }

  /**
   * Emit translated IR message to all handlers
   */
  emitIR(envelope: IREnvelope): void {
    this._emit(envelope);
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  onEvent(handler: IREventHandler): void {
    this._eventHandlers.add(handler);
  }

  offEvent(handler: IREventHandler): void {
    this._eventHandlers.delete(handler);
  }

  private _emit(envelope: IREnvelope): void {
    Array.from(this._eventHandlers).forEach((handler) => {
      try {
        handler(envelope);
      } catch (error) {
        console.error("[ClaudeDriver] Event handler error:", error);
      }
    });
  }
}

// ============================================================================
// Claude Native Message Types (from dashboard-protocol.js)
// ============================================================================

export interface ClaudeNativeMessage {
  type: string;
  id?: string;
  content?: string;
  done?: boolean;
  tool?: string;
  input?: Record<string, unknown>;
  error?: string;
  action?: string;
  task?: {
    id: string;
    subject: string;
    description?: string;
    status: string;
    activeForm?: string;
  };
  tasks?: Array<{
    id: string;
    subject: string;
    status: string;
  }>;
  branch?: string;
  staged?: Array<{ path: string; status: string }>;
  unstaged?: Array<{ path: string; status: string }>;
  state?: string;
  message?: string;
  code?: string;
  details?: unknown;
  recoverable?: boolean;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Claude driver instance
 */
export function createClaudeDriver(): ClaudeDriver {
  return new ClaudeDriver();
}
