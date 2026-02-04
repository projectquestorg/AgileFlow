# Multi-CLI Dashboard Abstraction Layer Research

**Date**: 2026-02-03
**Topic**: Building a unified dashboard that proxies multiple AI coding CLIs
**CLIs Covered**: Claude Code, OpenAI Codex CLI, Google Gemini CLI
**Sources**: ChatGPT and Claude web research (2 comprehensive analyses)

---

## Executive Summary

**Both research sources agree: Use the Adapter Pattern with a custom Intermediate Representation (IR), augmented by MCP where available.**

Key findings:
1. **MCP is viable but not sufficient** - All three CLIs support MCP, but it can't unify streaming protocols or native tools
2. **Adapter Pattern is the best approach** - One adapter per CLI, normalizing to a common IR
3. **Streaming requires unification** - Each CLI streams differently (NDJSON, JSON-RPC, WebSocket)
4. **Tool names need mapping** - `Read` vs `read_file` vs `exec_command`
5. **Capability negotiation is essential** - CLIs have different features (thread forking, conductor workflows)

---

## Protocol Mapping (Consensus from Both Sources)

| Concept | Claude Code | Codex CLI | Gemini CLI |
|---------|-------------|-----------|------------|
| **File Read** | `Read` | `exec_command` with `cat` | `read_file` |
| **File Write** | `Write` | `apply_patch` | `write_file` |
| **File Edit** | `Edit` | `apply_patch` (patch format) | `replace` |
| **Shell Exec** | `Bash` | `exec_command` | `run_shell_command` |
| **Search** | `Glob` + `Grep` | `exec_command` with `rg` | `glob` + `search_file_content` |
| **Web Search** | `WebSearch` | `web_search` | `google_web_search` |
| **Session ID** | `session_id` | `threadId` | `session_id` |
| **Streaming** | NDJSON (`stream_event`) | JSON-RPC notifications | NDJSON |
| **CLI Flag** | `--output-format stream-json` | `--json` or app-server | `--output-format stream-json` |

---

## Architecture: Unified IR (Intermediate Representation)

### Core Types (TypeScript)

```typescript
// packages/cli/lib/protocol/ir.ts
export type IRKind =
  | "init" | "text" | "text_delta"
  | "tool_start" | "tool_result"
  | "file_op" | "shell" | "task"
  | "session" | "status" | "error" | "done";

export interface IREnvelope<T = unknown> {
  kind: IRKind;
  ts: number;           // Date.now()
  seq: number;          // monotonic per session
  sessionId: string;
  source: "claude" | "codex" | "gemini";
  payload: T;
}

// Payload types
export interface IRTextDelta { text: string; done?: boolean; }
export interface IRToolStart {
  id: string;
  name: string;         // Normalized name (file_read, shell_exec)
  nativeName: string;   // Original CLI name (Read, exec_command)
  input: unknown;
}
export interface IRToolResult {
  id: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}
export interface IRFileOp {
  action: "read" | "write" | "edit";
  path: string;
  content?: string;
  diff?: unknown;
}
export interface IRShell {
  command: string;
  output?: string;
  exitCode?: number;
}
export interface IRSession {
  event: "created" | "forked" | "closed";
  parentId?: string;
}
export interface IRStats {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  durationMs: number;
}
```

---

## Driver Interface

```typescript
// packages/cli/lib/drivers/types.ts
import { IREnvelope } from "../protocol/ir";

export interface Capability {
  name: string;   // e.g., "file.read", "shell.exec", "session.fork"
  mcp?: boolean;  // true if available via MCP
}

export interface DriverConfig {
  workingDirectory: string;
  apiKey?: string;
  model?: string;
  permissionMode?: "default" | "auto" | "yolo";
  mcpServers?: Record<string, MCPServerConfig>;
}

export interface Driver {
  id: "claude" | "codex" | "gemini";

  // Lifecycle
  start(sessionId: string, config: DriverConfig): Promise<void>;
  stop(sessionId: string): Promise<void>;

  // Capabilities
  capabilities(): Promise<Capability[]>;

  // Communication
  send(sessionId: string, cmd: CLICommand): Promise<void>;
  sendInput(sessionId: string, input: string): Promise<void>;

  // Events (push IR to caller)
  onevent(handler: (env: IREnvelope) => void): void;
}
```

---

## Provider-Specific Capabilities

| Capability | Claude | Codex | Gemini |
|------------|--------|-------|--------|
| file.read | ✅ | ✅ | ✅ |
| file.write | ✅ | ✅ | ✅ |
| file.edit | ✅ | ✅ | ✅ |
| shell.exec | ✅ | ✅ | ✅ |
| web.search | ✅ | ✅ | ✅ |
| session.resume | ✅ | ✅ | ✅ |
| session.fork | ❌ | ✅ | ❌ |
| session.rollback | ❌ | ✅ | ❌ |
| agent.spawn | ✅ | ❌ | ❌ |
| todo.manage | ✅ | ❌ | ✅ |
| checkpoint | ❌ | ❌ | ✅ |
| conductor | ❌ | ❌ | ✅ |
| mcp.support | ✅ | ✅ | ✅ |

**Max Context**: Claude 200K, Codex 128K, Gemini 1M+
**Rate Limits**: Gemini 60 RPM / 1000 RPD (free tier)

---

## MCP Assessment

### Use MCP For:
- **Custom tool injection** - Dashboard-specific tools (task_create, project_status)
- **Tool discovery** - Standard `tools/list` endpoint
- **Resource access** - File system abstraction

### Don't Use MCP For:
- **Native file/shell tools** - Each CLI optimizes these natively
- **Streaming unification** - MCP doesn't standardize response streaming
- **Session management** - MCP has no conversation/thread concept
- **Authentication** - Each CLI handles differently

### MCP Configuration Locations:
- Claude: `~/.claude/.mcp.json`
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json`

---

## Streaming Unification Strategy

### Goals:
1. Single WebSocket stream to browser (dashboard)
2. Consistent event format regardless of CLI
3. Low latency (no unnecessary buffering)

### Implementation:
1. **Drivers parse CLI-specific streams** (NDJSON, JSON-RPC)
2. **Normalize to IR envelopes** with monotonic sequence numbers
3. **WS Gateway forwards IR** to dashboard
4. **Heartbeats** every 5s per driver (detect dead pipes)
5. **Backpressure** with byte budget, drop/compact low-priority deltas

### Event Type Mapping:

```typescript
const EVENT_TYPE_MAP = {
  claude: {
    textDelta: (e) => e.type === "stream_event" &&
                      e.event?.delta?.type === "text_delta",
    toolStart: (e) => e.event?.type === "content_block_start" &&
                      e.event?.content_block?.type === "tool_use",
    done: (e) => e.type === "result"
  },
  codex: {
    textDelta: (e) => e.method === "item/agentMessage/delta",
    toolStart: (e) => e.method === "item/started" &&
                      e.params?.item?.type === "function_call",
    done: (e) => e.method === "turn/completed"
  },
  gemini: {
    textDelta: (e) => e.type === "message" && e.delta === true,
    toolStart: (e) => e.type === "tool_use",
    done: (e) => e.type === "result"
  }
};
```

---

## Authentication Strategy

### Principle: CLI-specific, never centralized

| CLI | Env Variable | Storage |
|-----|--------------|---------|
| Claude | `ANTHROPIC_API_KEY` | OS keychain / env |
| Codex | `OPENAI_API_KEY` | OS keychain / env |
| Gemini | `GEMINI_API_KEY` | OS keychain / env |

### Dashboard Approach:
1. Store encrypted credential references only (not raw keys)
2. Auth broker loads keys from secure storage
3. Inject to child process environment on spawn
4. Scrub on exit

---

## Implementation Roadmap

### Phase 1: Abstract Claude (Week 1-2)
1. Define IR types and WS envelope format
2. Implement `ClaudeDriver` with `--output-format stream-json`
3. Create base `Driver` interface
4. Update dashboard to use IR instead of Claude-specific messages

### Phase 2: Add Codex CLI (Week 3-4)
1. Implement `CodexDriver` with JSON-RPC parsing
2. Add tool name mapping (exec_command → shell_exec)
3. Handle apply_patch format for file edits
4. Implement thread management (fork, resume, rollback)

### Phase 3: Add Gemini CLI (Week 5-6)
1. Implement `GeminiDriver` with streaming JSON
2. Add MCP client for tool discovery
3. Handle Gemini-specific features (checkpointing, GEMINI.md)
4. Respect rate limits (60 RPM / 1000 RPD)

### Phase 4: Parity & Polish (Week 7-8)
1. Capability negotiation handshake
2. Graceful degradation for missing features
3. Connection pooling for concurrent sessions
4. Health monitoring and auto-restart
5. Performance optimization

---

## Dashboard Integration

### Provider Selector UI:

```
┌─────────────────────────────────────────┐
│ Provider: [Claude ▼]                     │
│           ├─ Claude Code (Anthropic)    │
│           ├─ Codex CLI (OpenAI)         │
│           └─ Gemini CLI (Google)        │
│                                          │
│ Status: ● Connected                      │
│ Model: claude-3-opus                     │
│ Context: 180K / 200K tokens             │
└─────────────────────────────────────────┘
```

### Capability-Based Feature Flags:

```typescript
// Dashboard disables features based on provider
const features = {
  threadFork: canUseFeature(provider, "session.fork"),    // Codex only
  agentSpawn: canUseFeature(provider, "agent.spawn"),     // Claude only
  conductor: canUseFeature(provider, "conductor"),        // Gemini only
};
```

---

## References

### Official Documentation:
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Gemini 3 Flash Announcement](https://developers.googleblog.com/gemini-3-flash-is-now-available-in-gemini-cli/)
- [MCP Specification](https://modelcontextprotocol.io/)

### Third-Party Resources:
- [claude-agent-server (WebSocket wrapper)](https://github.com/dzhng/claude-agent-server)
- [DeepWiki: openai/codex Architecture](https://deepwiki.com/openai/codex)
- [Conductor Extension for Gemini CLI](https://www.marktechpost.com/2026/02/02/google-releases-conductor-a-context-driven-gemini-cli-extension/)

---

## Key Takeaways

1. **Adapter Pattern wins** - Clean separation, testable, extensible
2. **MCP augments, doesn't replace** - Use for custom tools, not core features
3. **IR is essential** - Single wire format simplifies dashboard code
4. **Capabilities vary** - Design for graceful degradation
5. **Authentication stays local** - Never store raw provider keys in cloud
