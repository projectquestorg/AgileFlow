import type { ProviderAdapter } from '@agileflow/core';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';
import { geminiAdapter } from './gemini';
import { opencodeAdapter } from './opencode';

export * from './types';
export * from './util';
export * from './toml-patch';
export * from './standard-agent-skills';
export { claudeAdapter } from './claude';
export {
  codexAdapter,
  codexConfigPath,
  codexHome,
  configureStructuredQuestions,
  readStructuredQuestions,
  CODEX_OPENAI_YAML,
  STRUCTURED_QUESTIONS_FEATURE,
} from './codex';
export { cursorAdapter } from './cursor';
export { opencodeAdapter } from './opencode';
export { geminiAdapter } from './gemini';
export { t3Host } from './t3';

/** Every supported provider. Order is the display order in `list`/`check`. */
export function allAdapters(): ProviderAdapter[] {
  return [codexAdapter, claudeAdapter, cursorAdapter, opencodeAdapter, geminiAdapter];
}

/** Providers with verified skill semantics and their support level. */
export const SUPPORT_MATRIX = [
  { provider: 'Codex', support: 'native' },
  { provider: 'Cursor', support: 'native' },
  { provider: 'OpenCode', support: 'native' },
  { provider: 'Gemini CLI', support: 'native' },
  { provider: 'Claude Code', support: 'adapted' },
  { provider: 'Grok', support: 'experimental' },
  { provider: 'Antigravity', support: 'experimental' },
] as const;
