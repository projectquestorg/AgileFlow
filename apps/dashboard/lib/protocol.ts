/**
 * Multi-CLI Protocol Types for Dashboard
 *
 * These types mirror the server-side IR format and enable the dashboard
 * to work with any supported CLI provider.
 */

// ============================================================================
// IR Message Types (matching packages/cli/lib/protocol/ir.ts)
// ============================================================================

export type IRKind =
  | "init"
  | "text"
  | "text_delta"
  | "tool_start"
  | "tool_result"
  | "file_op"
  | "shell"
  | "task"
  | "session"
  | "status"
  | "git"
  | "terminal"
  | "notification"
  | "error"
  | "done";

export type IRSource = "claude" | "codex" | "gemini";

export interface IREnvelope<T = unknown> {
  kind: IRKind;
  ts: number;
  seq: number;
  sessionId: string;
  source: IRSource;
  payload: T;
}

// ============================================================================
// Capability Types
// ============================================================================

export type CapabilityName =
  | "file.read"
  | "file.write"
  | "file.edit"
  | "shell.exec"
  | "web.search"
  | "web.fetch"
  | "session.resume"
  | "session.fork"
  | "session.rollback"
  | "agent.spawn"
  | "todo.manage"
  | "checkpoint"
  | "conductor"
  | "mcp.support"
  | "image.vision";

export interface Capability {
  name: CapabilityName;
  available: boolean;
  viaMcp?: boolean;
  details?: string;
}

// ============================================================================
// Provider Information
// ============================================================================

export interface ProviderInfo {
  id: IRSource;
  name: string;
  icon: string;
  color: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  available: boolean;
  capabilities: CapabilityName[];
  model?: string;
  contextUsed?: number;
  contextMax?: number;
}

export const PROVIDER_INFO: Record<IRSource, Omit<ProviderInfo, "status" | "available" | "capabilities">> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    icon: "🤖",
    color: "text-orange-400",
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex",
    icon: "⚡",
    color: "text-green-400",
  },
  gemini: {
    id: "gemini",
    name: "Gemini CLI",
    icon: "✨",
    color: "text-blue-400",
  },
};

// ============================================================================
// Default Capabilities by Provider
// ============================================================================

export const DEFAULT_CAPABILITIES: Record<IRSource, CapabilityName[]> = {
  claude: [
    "file.read",
    "file.write",
    "file.edit",
    "shell.exec",
    "web.search",
    "web.fetch",
    "session.resume",
    "agent.spawn",
    "todo.manage",
    "mcp.support",
    "image.vision",
  ],
  codex: [
    "file.read",
    "file.write",
    "file.edit",
    "shell.exec",
    "web.search",
    "web.fetch",
    "session.resume",
    "session.fork",
    "session.rollback",
    "mcp.support",
    "image.vision",
  ],
  gemini: [
    "file.read",
    "file.write",
    "file.edit",
    "shell.exec",
    "web.search",
    "web.fetch",
    "session.resume",
    "todo.manage",
    "checkpoint",
    "conductor",
    "mcp.support",
    "image.vision",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a provider has a specific capability
 */
export function hasCapability(provider: IRSource, capability: CapabilityName): boolean {
  return DEFAULT_CAPABILITIES[provider]?.includes(capability) ?? false;
}

/**
 * Get capabilities available for a provider
 */
export function getCapabilities(provider: IRSource): CapabilityName[] {
  return DEFAULT_CAPABILITIES[provider] || [];
}

/**
 * Get full provider info with defaults
 */
export function getProviderInfo(provider: IRSource): ProviderInfo {
  const base = PROVIDER_INFO[provider];
  return {
    ...base,
    status: "stopped",
    available: false,
    capabilities: DEFAULT_CAPABILITIES[provider] || [],
  };
}

// ============================================================================
// Feature Flags Based on Capabilities
// ============================================================================

export interface FeatureFlags {
  canForkThread: boolean;      // Codex only
  canRollbackThread: boolean;  // Codex only
  canSpawnAgents: boolean;     // Claude only
  canManageTodos: boolean;     // Claude, Gemini
  canUseCheckpoints: boolean;  // Gemini only
  canUseConductor: boolean;    // Gemini only
  hasVision: boolean;          // All
  hasMcpSupport: boolean;      // All
}

/**
 * Get feature flags for a provider
 */
export function getFeatureFlags(provider: IRSource): FeatureFlags {
  return {
    canForkThread: hasCapability(provider, "session.fork"),
    canRollbackThread: hasCapability(provider, "session.rollback"),
    canSpawnAgents: hasCapability(provider, "agent.spawn"),
    canManageTodos: hasCapability(provider, "todo.manage"),
    canUseCheckpoints: hasCapability(provider, "checkpoint"),
    canUseConductor: hasCapability(provider, "conductor"),
    hasVision: hasCapability(provider, "image.vision"),
    hasMcpSupport: hasCapability(provider, "mcp.support"),
  };
}
