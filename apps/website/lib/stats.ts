import 'server-only';

/**
 * Static, verifiable facts about AgileFlow v5 shown on the landing page.
 *
 * v5 deliberately avoids vanity counts of prompts, agents, or commands, so
 * nothing here is derived by counting files in the CLI package.
 */
export function getAgileFlowStats() {
  return {
    /** Major version shown in the announcement banner. */
    version: '5',
    /** Codex, Cursor, OpenCode, Gemini (native) + Claude (adapted). */
    providers: 5,
  };
}
