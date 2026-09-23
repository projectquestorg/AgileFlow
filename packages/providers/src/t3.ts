import { detectT3Host } from '@agileflow/core';

/**
 * T3 Code is a host/control surface over provider CLIs (Codex, Claude,
 * Cursor, OpenCode, ...), not a provider with its own skill format. There
 * is deliberately no T3 content adapter: when T3 launches a provider, that
 * provider reads the same `.agents/skills` (or linked `.claude/skills`).
 * T3 is detected only so `check` can explain this and note that T3's own
 * skill picker may not list every provider-visible skill.
 */
export const t3Host = {
  id: 't3',
  displayName: 'T3 Code',
  kind: 'host' as const,
  /** Providers T3 can run that AgileFlow supports. */
  providers: ['codex', 'claude', 'cursor', 'opencode'] as const,
  detect: detectT3Host,
};
