/**
 * Gemini CLI Driver
 *
 * Driver implementation for Google Gemini CLI.
 * Translates Gemini's NDJSON protocol to the unified IR format.
 *
 * Key differences from Claude:
 * - Supports checkpointing for long-running tasks
 * - Conductor workflow system for multi-step automation
 * - Higher context window (1M+ tokens)
 * - Rate limits: 60 RPM / 1000 RPD on free tier
 * - Uses google_web_search for web searches
 */

import {
  Driver,
  DriverConfig,
  DriverStatus,
  Capability,
  CapabilityName,
  CLICommand,
  IREventHandler,
  GEMINI_CAPABILITIES,
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
  IRTask,
  IRNotification,
} from "../protocol/ir";

// ============================================================================
// Tool Name Mapping (Gemini -> IR normalized names)
// ============================================================================

const GEMINI_TOOL_MAPPING: Record<string, string> = {
  "read_file": "file_read",
  "write_file": "file_write",
  "replace": "file_edit",
  "run_shell_command": "shell_exec",
  "glob": "file_glob",
  "search_file_content": "file_grep",
  "google_web_search": "web_search",
  "fetch_url": "web_fetch",
  "create_checkpoint": "checkpoint_create",
  "restore_checkpoint": "checkpoint_restore",
  "list_checkpoints": "checkpoint_list",
  "conductor_run": "conductor_run",
  "task_create": "todo_create",
  "task_update": "todo_update",
  "task_list": "todo_list",
};

/**
 * Normalize Gemini tool name to IR format
 */
function normalizeToolName(geminiName: string): string {
  return GEMINI_TOOL_MAPPING[geminiName] || geminiName.toLowerCase();
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitState {
  requestsThisMinute: number;
  requestsToday: number;
  minuteStartTime: number;
  dayStartTime: number;
}

const RATE_LIMITS = {
  rpm: 60,   // Requests per minute
  rpd: 1000, // Requests per day
};

// ============================================================================
// Gemini Driver Implementation
// ============================================================================

export class GeminiDriver implements Driver {
  readonly id: IRSource = "gemini";
  readonly name = "Gemini CLI";

  private _status: DriverStatus = {
    state: "stopped",
    provider: "gemini",
  };

  private _capabilities: Capability[] = [...GEMINI_CAPABILITIES];
  private _eventHandlers: Set<IREventHandler> = new Set();
  private _sessions: Map<string, {
    config: DriverConfig;
    seqCounter: number;
    checkpoints: string[];
    conductorWorkflow?: string;
  }> = new Map();

  // Rate limiting state
  private _rateLimit: RateLimitState = {
    requestsThisMinute: 0,
    requestsToday: 0,
    minuteStartTime: Date.now(),
    dayStartTime: Date.now(),
  };

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
    this._sessions.set(sessionId, {
      config,
      seqCounter: 0,
      checkpoints: [],
    });

    this._status = {
      state: "ready",
      provider: "gemini",
      model: config.model || "gemini-2.0-flash",
      contextMax: config.maxTokens || 1000000, // 1M context
    };

    // Emit init event
    const initPayload: IRInit = {
      provider: "gemini",
      version: "1.0.0",
      capabilities: this._capabilities.filter(c => c.available).map(c => c.name),
      maxContext: config.maxTokens || 1000000,
    };

    this._emit(createIREnvelope("init", sessionId, "gemini", initPayload));
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
    // Check if 'gemini' command is available
    return true;
  }

  // -------------------------------------------------------------------------
  // Rate Limiting
  // -------------------------------------------------------------------------

  private _checkRateLimit(): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();

    // Reset minute counter if needed
    if (now - this._rateLimit.minuteStartTime > 60000) {
      this._rateLimit.requestsThisMinute = 0;
      this._rateLimit.minuteStartTime = now;
    }

    // Reset day counter if needed
    if (now - this._rateLimit.dayStartTime > 86400000) {
      this._rateLimit.requestsToday = 0;
      this._rateLimit.dayStartTime = now;
    }

    // Check limits
    if (this._rateLimit.requestsThisMinute >= RATE_LIMITS.rpm) {
      const retryAfterMs = 60000 - (now - this._rateLimit.minuteStartTime);
      return { allowed: false, retryAfterMs };
    }

    if (this._rateLimit.requestsToday >= RATE_LIMITS.rpd) {
      const retryAfterMs = 86400000 - (now - this._rateLimit.dayStartTime);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  private _recordRequest(): void {
    this._rateLimit.requestsThisMinute++;
    this._rateLimit.requestsToday++;
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
    // Check rate limits
    const rateCheck = this._checkRateLimit();
    if (!rateCheck.allowed) {
      this._emit(createIREnvelope<IRError>("error", sessionId, "gemini", {
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Retry after ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)} seconds.`,
        details: {
          rpm: this._rateLimit.requestsThisMinute,
          rpd: this._rateLimit.requestsToday,
          limits: RATE_LIMITS,
        },
        recoverable: true,
      }));
      return;
    }

    this._recordRequest();
    this._status = { ...this._status, state: "busy" };

    const sessionPayload: IRSession = {
      state: "thinking",
    };
    this._emit(createIREnvelope("session", sessionId, "gemini", sessionPayload));
  }

  // -------------------------------------------------------------------------
  // Checkpoint Management (Gemini-specific)
  // -------------------------------------------------------------------------

  /**
   * Create a checkpoint for the current session state
   */
  async createCheckpoint(sessionId: string, name: string): Promise<string> {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    const checkpointId = `ckpt_${Date.now()}_${name}`;
    session.checkpoints.push(checkpointId);

    this._emit(createIREnvelope<IRNotification>("notification", sessionId, "gemini", {
      level: "info",
      title: "Checkpoint Created",
      message: `Checkpoint "${name}" created (${checkpointId})`,
    }));

    return checkpointId;
  }

  /**
   * Restore a previous checkpoint
   */
  async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    if (!session.checkpoints.includes(checkpointId)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this._emit(createIREnvelope<IRSession>("session", sessionId, "gemini", {
      state: "idle",
      message: `Restored checkpoint: ${checkpointId}`,
    }));
  }

  /**
   * List available checkpoints
   */
  listCheckpoints(sessionId: string): string[] {
    const session = this._sessions.get(sessionId);
    return session?.checkpoints || [];
  }

  // -------------------------------------------------------------------------
  // Conductor Workflow (Gemini-specific)
  // -------------------------------------------------------------------------

  /**
   * Start a Conductor workflow
   */
  async startConductor(sessionId: string, workflowName: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    session.conductorWorkflow = workflowName;

    this._emit(createIREnvelope<IRNotification>("notification", sessionId, "gemini", {
      level: "info",
      title: "Conductor Started",
      message: `Starting workflow: ${workflowName}`,
    }));
  }

  // -------------------------------------------------------------------------
  // Message Translation (Gemini NDJSON -> IR)
  // -------------------------------------------------------------------------

  /**
   * Translate a Gemini NDJSON message to IR format
   */
  translateToIR(sessionId: string, geminiMessage: GeminiNdjsonMessage): IREnvelope | null {
    const session = this._sessions.get(sessionId);
    if (!session) return null;

    switch (geminiMessage.type) {
      case "message":
        return createIREnvelope<IRTextDelta>("text_delta", sessionId, "gemini", {
          text: geminiMessage.content || "",
          done: !geminiMessage.delta,
        });

      case "tool_use":
        return createIREnvelope<IRToolStart>("tool_start", sessionId, "gemini", {
          id: geminiMessage.id || `tool_${Date.now()}`,
          name: normalizeToolName(geminiMessage.tool || ""),
          nativeName: geminiMessage.tool || "",
          input: geminiMessage.input || {},
        });

      case "tool_result":
        return createIREnvelope<IRToolResult>("tool_result", sessionId, "gemini", {
          id: geminiMessage.id || "",
          ok: !geminiMessage.error,
          output: geminiMessage.output,
          error: geminiMessage.error,
        });

      case "checkpoint":
        // Checkpoint created/restored
        return createIREnvelope<IRNotification>("notification", sessionId, "gemini", {
          level: "info",
          title: geminiMessage.action === "create" ? "Checkpoint Created" : "Checkpoint Restored",
          message: `Checkpoint: ${geminiMessage.checkpointId}`,
        });

      case "conductor":
        // Conductor workflow event
        return createIREnvelope<IRNotification>("notification", sessionId, "gemini", {
          level: "info",
          title: "Conductor",
          message: `Workflow ${geminiMessage.workflow}: ${geminiMessage.status}`,
        });

      case "task":
        return createIREnvelope<IRTask>("task", sessionId, "gemini", {
          action: geminiMessage.action as "create" | "update" | "delete" | "list",
          task: geminiMessage.task ? {
            id: geminiMessage.task.id,
            subject: geminiMessage.task.subject,
            description: geminiMessage.task.description,
            status: geminiMessage.task.status as "pending" | "in_progress" | "completed",
          } : undefined,
          tasks: geminiMessage.tasks?.map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status as "pending" | "in_progress" | "completed",
          })),
        });

      case "result":
        this._status = { ...this._status, state: "ready" };
        return createIREnvelope<IRSession>("session", sessionId, "gemini", {
          state: "idle",
        });

      case "error":
        return createIREnvelope<IRError>("error", sessionId, "gemini", {
          code: geminiMessage.code || "UNKNOWN",
          message: geminiMessage.message || "Unknown error",
          details: geminiMessage.details,
          recoverable: geminiMessage.recoverable ?? true,
        });

      case "rate_limit":
        return createIREnvelope<IRError>("error", sessionId, "gemini", {
          code: "RATE_LIMITED",
          message: geminiMessage.message || "Rate limit exceeded",
          details: {
            retryAfterSeconds: geminiMessage.retryAfter,
          },
          recoverable: true,
        });

      default:
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
        console.error("[GeminiDriver] Event handler error:", error);
      }
    });
  }
}

// ============================================================================
// Gemini NDJSON Message Types
// ============================================================================

export interface GeminiNdjsonMessage {
  type: string;
  id?: string;
  content?: string;
  delta?: boolean;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  action?: string;
  checkpointId?: string;
  workflow?: string;
  status?: string;
  task?: {
    id: string;
    subject: string;
    description?: string;
    status: string;
  };
  tasks?: Array<{
    id: string;
    subject: string;
    status: string;
  }>;
  message?: string;
  code?: string;
  details?: unknown;
  recoverable?: boolean;
  retryAfter?: number;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Gemini driver instance
 */
export function createGeminiDriver(): GeminiDriver {
  return new GeminiDriver();
}
