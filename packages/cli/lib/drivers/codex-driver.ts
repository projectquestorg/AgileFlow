/**
 * Codex CLI Driver
 *
 * Driver implementation for OpenAI Codex CLI.
 * Translates Codex's JSON-RPC protocol to the unified IR format.
 *
 * Key differences from Claude:
 * - Uses JSON-RPC for message format
 * - exec_command for shell and file operations
 * - apply_patch for file edits (unified diff format)
 * - Supports thread forking and rollback
 */

import {
  Driver,
  DriverConfig,
  DriverStatus,
  Capability,
  CapabilityName,
  CLICommand,
  IREventHandler,
  CODEX_CAPABILITIES,
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
  IRError,
  IRFileOp,
  IRShell,
} from "../protocol/ir";

// ============================================================================
// Tool Name Mapping (Codex -> IR normalized names)
// ============================================================================

const CODEX_TOOL_MAPPING: Record<string, string> = {
  "exec_command": "shell_exec",  // Used for both shell and file reads
  "apply_patch": "file_edit",
  "web_search": "web_search",
  "read_file": "file_read",
  "write_file": "file_write",
  "container_exec": "shell_exec",
};

/**
 * Normalize Codex tool name to IR format
 */
function normalizeToolName(codexName: string): string {
  return CODEX_TOOL_MAPPING[codexName] || codexName.toLowerCase();
}

/**
 * Determine if an exec_command is a file read operation
 */
function isFileReadCommand(params: CodexExecCommandParams): boolean {
  const cmd = params.command?.trim() || "";
  return cmd.startsWith("cat ") || cmd.startsWith("head ") || cmd.startsWith("tail ");
}

/**
 * Extract file path from cat/head/tail command
 */
function extractFilePath(command: string): string {
  const parts = command.trim().split(/\s+/);
  // Skip command and flags, find the file path
  for (let i = 1; i < parts.length; i++) {
    if (!parts[i].startsWith("-")) {
      return parts[i].replace(/^['"]|['"]$/g, ""); // Remove quotes
    }
  }
  return "";
}

// ============================================================================
// Codex Driver Implementation
// ============================================================================

export class CodexDriver implements Driver {
  readonly id: IRSource = "codex";
  readonly name = "Codex CLI";

  private _status: DriverStatus = {
    state: "stopped",
    provider: "codex",
  };

  private _capabilities: Capability[] = [...CODEX_CAPABILITIES];
  private _eventHandlers: Set<IREventHandler> = new Set();
  private _sessions: Map<string, {
    config: DriverConfig;
    seqCounter: number;
    threadId?: string;
    parentThreadId?: string;
  }> = new Map();

  // Rate limiting
  private _lastRequestTime = 0;
  private _requestsThisMinute = 0;

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
      provider: "codex",
      model: config.model || "codex-1",
      contextMax: config.maxTokens || 128000,
    };

    // Emit init event
    const initPayload: IRInit = {
      provider: "codex",
      version: "1.0.0",
      capabilities: this._capabilities.filter(c => c.available).map(c => c.name),
      maxContext: config.maxTokens || 128000,
    };

    this._emit(createIREnvelope("init", sessionId, "codex", initPayload));
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
    // Check if 'codex' command is available
    // In a real implementation, this would use exec/spawn to check
    return true;
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
    this._status = { ...this._status, state: "busy" };

    const sessionPayload: IRSession = {
      state: "thinking",
    };
    this._emit(createIREnvelope("session", sessionId, "codex", sessionPayload));
  }

  // -------------------------------------------------------------------------
  // Thread Management (Codex-specific)
  // -------------------------------------------------------------------------

  /**
   * Fork the current thread to create a branch
   */
  async forkThread(sessionId: string, newSessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) return;

    // Create new session as fork of current
    this._sessions.set(newSessionId, {
      config: session.config,
      seqCounter: 0,
      threadId: `thread_${Date.now()}`,
      parentThreadId: session.threadId,
    });

    // Emit session fork event
    this._emit(createIREnvelope<IRSession>("session", newSessionId, "codex", {
      state: "connected",
      message: `Forked from ${sessionId}`,
    }));
  }

  /**
   * Rollback to a previous state in the thread
   */
  async rollbackThread(sessionId: string, targetSeq: number): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) return;

    // In a real implementation, this would call the Codex CLI rollback command
    this._emit(createIREnvelope<IRSession>("session", sessionId, "codex", {
      state: "idle",
      message: `Rolled back to sequence ${targetSeq}`,
    }));
  }

  // -------------------------------------------------------------------------
  // Message Translation (Codex JSON-RPC -> IR)
  // -------------------------------------------------------------------------

  /**
   * Translate a Codex JSON-RPC message to IR format
   */
  translateToIR(sessionId: string, codexMessage: CodexJsonRpcMessage): IREnvelope | null {
    const session = this._sessions.get(sessionId);
    if (!session) return null;

    // Handle JSON-RPC notification format
    if (codexMessage.method) {
      return this._translateMethod(sessionId, codexMessage);
    }

    // Handle JSON-RPC response format
    if (codexMessage.result !== undefined || codexMessage.error) {
      return this._translateResult(sessionId, codexMessage);
    }

    return null;
  }

  private _translateMethod(sessionId: string, msg: CodexJsonRpcMessage): IREnvelope | null {
    switch (msg.method) {
      case "item/agentMessage/delta":
        // Streaming text delta
        return createIREnvelope<IRTextDelta>("text_delta", sessionId, "codex", {
          text: msg.params?.content || "",
          done: false,
        });

      case "item/agentMessage":
        // Complete text message
        return createIREnvelope<IRTextDelta>("text_delta", sessionId, "codex", {
          text: msg.params?.content || "",
          done: true,
        });

      case "item/started":
        // Tool call started
        if (msg.params?.item?.type === "function_call") {
          const toolName = msg.params.item.name || "unknown";
          const toolInput = msg.params.item.arguments || {};

          // Check if this is exec_command being used as file_read
          if (toolName === "exec_command" && isFileReadCommand(toolInput as CodexExecCommandParams)) {
            return createIREnvelope<IRToolStart>("tool_start", sessionId, "codex", {
              id: msg.params.item.id || `tool_${Date.now()}`,
              name: "file_read",
              nativeName: "exec_command",
              input: {
                path: extractFilePath((toolInput as CodexExecCommandParams).command || ""),
              },
            });
          }

          return createIREnvelope<IRToolStart>("tool_start", sessionId, "codex", {
            id: msg.params.item.id || `tool_${Date.now()}`,
            name: normalizeToolName(toolName),
            nativeName: toolName,
            input: toolInput,
          });
        }
        return null;

      case "item/completed":
        // Tool call completed
        const output = msg.params?.item?.output;
        const isError = msg.params?.item?.status === "error";

        // Check if this was a file operation
        if (msg.params?.item?.name === "exec_command" && msg.params?.item?.arguments) {
          const args = msg.params.item.arguments as CodexExecCommandParams;
          if (isFileReadCommand(args)) {
            return createIREnvelope<IRToolResult>("tool_result", sessionId, "codex", {
              id: msg.params.item.id || "",
              ok: !isError,
              output: output,
              error: isError ? String(output) : undefined,
            });
          }
        }

        // Check if this was apply_patch (file edit)
        if (msg.params?.item?.name === "apply_patch") {
          const patchArgs = msg.params.item.arguments as CodexApplyPatchParams;
          return createIREnvelope<IRFileOp>("file_op", sessionId, "codex", {
            action: "edit",
            path: patchArgs.path || "",
            diff: {
              before: "",  // Would need to parse from patch
              after: "",
            },
          });
        }

        return createIREnvelope<IRToolResult>("tool_result", sessionId, "codex", {
          id: msg.params?.item?.id || "",
          ok: !isError,
          output: output,
          error: isError ? String(output) : undefined,
        });

      case "turn/started":
        return createIREnvelope<IRSession>("session", sessionId, "codex", {
          state: "thinking",
        });

      case "turn/completed":
        this._status = { ...this._status, state: "ready" };
        return createIREnvelope<IRSession>("session", sessionId, "codex", {
          state: "idle",
        });

      case "thread/created":
        const session = this._sessions.get(sessionId);
        if (session) {
          session.threadId = msg.params?.threadId;
        }
        return createIREnvelope<IRSession>("session", sessionId, "codex", {
          state: "connected",
          message: `Thread created: ${msg.params?.threadId}`,
        });

      case "thread/forked":
        return createIREnvelope<IRSession>("session", sessionId, "codex", {
          state: "connected",
          message: `Thread forked from ${msg.params?.parentThreadId}`,
        });

      default:
        return null;
    }
  }

  private _translateResult(sessionId: string, msg: CodexJsonRpcMessage): IREnvelope | null {
    if (msg.error) {
      return createIREnvelope<IRError>("error", sessionId, "codex", {
        code: String(msg.error.code || "UNKNOWN"),
        message: msg.error.message || "Unknown error",
        details: msg.error.data,
        recoverable: true,
      });
    }

    // Result without method context - needs more info to translate
    return null;
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
        console.error("[CodexDriver] Event handler error:", error);
      }
    });
  }
}

// ============================================================================
// Codex JSON-RPC Message Types
// ============================================================================

export interface CodexJsonRpcMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  method?: string;
  params?: {
    threadId?: string;
    parentThreadId?: string;
    content?: string;
    item?: {
      id?: string;
      type?: string;
      name?: string;
      arguments?: Record<string, unknown>;
      output?: unknown;
      status?: string;
    };
    [key: string]: unknown;
  };
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export interface CodexExecCommandParams {
  command?: string;
  cwd?: string;
  timeout?: number;
}

export interface CodexApplyPatchParams {
  path?: string;
  patch?: string;
  create?: boolean;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Codex driver instance
 */
export function createCodexDriver(): CodexDriver {
  return new CodexDriver();
}
