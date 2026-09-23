import { spawn } from 'node:child_process';
import { findExecutable } from '@agileflow/providers';

/**
 * Eval drivers run a real provider CLI headlessly in a sandbox repository
 * and normalize its event stream. Activation is read from the provider's
 * own tool calls, never inferred from the final text.
 */

export interface EvalRunInput {
  cwd: string;
  prompt: string;
  skillId: string;
  invocation: 'implicit' | 'explicit';
  /** `activation`: read-only, few turns. `full`: may edit files so rubrics can be judged. */
  mode: 'activation' | 'full';
  model?: string;
  timeoutMs: number;
  env: Record<string, string | undefined>;
}

export interface ToolCall {
  name: string;
  input: string;
}

export interface Transcript {
  provider: string;
  raw: string;
  toolCalls: ToolCall[];
  /** Messages injected as user turns (explicit skill expansion shows up here). */
  userMessages: string[];
  finalText: string;
  /** Skills the provider reported as available, when it reports them. */
  visibleSkills: string[] | null;
  /** Skill explicitly invoked by name for this run (e.g. `/skill`), if any. */
  explicitSkill?: string;
  /** Slash commands the provider registered (Claude init event). */
  slashCommands?: string[];
  exitCode: number | null;
  durationMs: number;
  error?: string;
}

export interface EvalDriver {
  id: string;
  displayName: string;
  executable: string;
  available(env: Record<string, string | undefined>): Promise<boolean>;
  /** Prompt used when a scenario asks for explicit invocation. */
  explicitPrompt(skillId: string, prompt: string): string;
  run(input: EvalRunInput): Promise<Transcript>;
  activated(transcript: Transcript, skillId: string): boolean;
}

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string | undefined>; timeoutMs: number; stdin?: string },
): Promise<{ stdout: string; stderr: string; code: number | null; durationMs: number; timedOut: boolean }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, options.timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), code: null, durationMs: Date.now() - started, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, durationMs: Date.now() - started, timedOut });
    });
    child.stdin.end(options.stdin ?? '');
  });
}

function jsonLines(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // ignore partial lines
    }
  }
  return out;
}

const skillPathRe = (id: string) => new RegExp(`skills[\\\\/]${id.replace(/[-]/g, '\\-')}[\\\\/]SKILL\\.md`);

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

export function parseClaudeStream(stdout: string): Omit<Transcript, 'provider' | 'raw' | 'exitCode' | 'durationMs'> {
  const toolCalls: ToolCall[] = [];
  const userMessages: string[] = [];
  let finalText = '';
  let visibleSkills: string[] | null = null;
  let slashCommands: string[] | undefined;
  for (const event of jsonLines(stdout)) {
    if (event.type === 'system' && event.subtype === 'init' && Array.isArray(event.skills)) {
      visibleSkills = event.skills as string[];
      if (Array.isArray(event.slash_commands)) slashCommands = event.slash_commands as string[];
    }
    const message = event.message as { content?: unknown } | undefined;
    if ((event.type === 'assistant' || event.type === 'user') && Array.isArray(message?.content)) {
      for (const block of message!.content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_use') toolCalls.push({ name: String(block.name), input: JSON.stringify(block.input ?? {}) });
        if (event.type === 'user' && block.type === 'text') userMessages.push(String(block.text));
      }
    } else if (event.type === 'user' && typeof message?.content === 'string') {
      userMessages.push(message.content);
    }
    if (event.type === 'result' && typeof event.result === 'string') finalText = event.result;
  }
  return { toolCalls, userMessages, finalText, visibleSkills, ...(slashCommands ? { slashCommands } : {}) };
}

export const claudeDriver: EvalDriver = {
  id: 'claude',
  displayName: 'Claude Code',
  executable: 'claude',
  async available(env) {
    return (await findExecutable('claude', env, process.platform)) !== null;
  },
  explicitPrompt: (id, prompt) => `/${id} ${prompt}`,
  async run(input) {
    const prompt = input.invocation === 'explicit' ? this.explicitPrompt(input.skillId, input.prompt) : input.prompt;
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      input.mode === 'activation' ? '8' : '30',
      '--permission-mode',
      input.mode === 'activation' ? 'default' : 'acceptEdits',
    ];
    // Activation runs must not change the sandbox; unapproved tools are denied in print mode.
    if (input.mode === 'activation') args.push('--disallowedTools', 'Edit', 'Write', 'NotebookEdit');
    if (input.model) args.push('--model', input.model);
    const res = await runProcess('claude', args, { cwd: input.cwd, env: input.env, timeoutMs: input.timeoutMs });
    return {
      provider: 'claude',
      raw: res.stdout,
      ...parseClaudeStream(res.stdout),
      ...(input.invocation === 'explicit' ? { explicitSkill: input.skillId } : {}),
      exitCode: res.code,
      durationMs: res.durationMs,
      ...(res.timedOut ? { error: 'timed out' } : res.code !== 0 ? { error: res.stderr.trim().slice(-500) } : {}),
    };
  },
  activated(t, id) {
    if (t.toolCalls.some((c) => c.name === 'Skill' && new RegExp(`"(skill|command|name)":"/?${id}"`).test(c.input))) return true;
    if (t.toolCalls.some((c) => skillPathRe(id).test(c.input))) return true;
    // In print mode an explicit `/skill` prompt expands the skill without a
    // stream event; it loads exactly when Claude registered that command.
    if (t.explicitSkill === id && t.exitCode === 0 && t.slashCommands?.includes(id)) return true;
    return t.userMessages.some((m) => m.includes(`<command-name>/${id}</command-name>`) || m.includes(`skills/${id}`));
  },
};

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

export function parseCodexStream(stdout: string): Omit<Transcript, 'provider' | 'raw' | 'exitCode' | 'durationMs'> {
  const toolCalls: ToolCall[] = [];
  let finalText = '';
  for (const event of jsonLines(stdout)) {
    const item = event.item as Record<string, unknown> | undefined;
    if (!item || event.type !== 'item.completed') continue;
    if (item.type === 'command_execution') toolCalls.push({ name: 'shell', input: String(item.command ?? '') });
    else if (item.type === 'file_change') toolCalls.push({ name: 'file_change', input: JSON.stringify(item.changes ?? []) });
    else if (item.type === 'mcp_tool_call') toolCalls.push({ name: String(item.tool ?? 'mcp'), input: JSON.stringify(item.arguments ?? {}) });
    else if (item.type === 'agent_message' && typeof item.text === 'string') finalText = item.text;
  }
  return { toolCalls, userMessages: [], finalText, visibleSkills: null };
}

export const codexDriver: EvalDriver = {
  id: 'codex',
  displayName: 'Codex',
  executable: 'codex',
  async available(env) {
    return (await findExecutable('codex', env, process.platform)) !== null;
  },
  explicitPrompt: (id, prompt) => `$${id} ${prompt}`,
  async run(input) {
    const prompt = input.invocation === 'explicit' ? this.explicitPrompt(input.skillId, input.prompt) : input.prompt;
    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-s',
      input.mode === 'activation' ? 'read-only' : 'workspace-write',
      '-C',
      input.cwd,
    ];
    if (input.model) args.push('-m', input.model);
    args.push(prompt);
    const res = await runProcess('codex', args, { cwd: input.cwd, env: input.env, timeoutMs: input.timeoutMs });
    return {
      provider: 'codex',
      raw: res.stdout,
      ...parseCodexStream(res.stdout),
      exitCode: res.code,
      durationMs: res.durationMs,
      ...(res.timedOut ? { error: 'timed out' } : res.code !== 0 ? { error: res.stderr.trim().slice(-500) } : {}),
    };
  },
  activated(t, id) {
    // Codex loads a skill by reading its SKILL.md; explicit `$skill` mentions inject it directly.
    return t.toolCalls.some((c) => skillPathRe(id).test(c.input));
  },
};

// ---------------------------------------------------------------------------
// Gemini CLI
// ---------------------------------------------------------------------------

export function parseGeminiStream(stdout: string): Omit<Transcript, 'provider' | 'raw' | 'exitCode' | 'durationMs'> {
  const toolCalls: ToolCall[] = [];
  let finalText = '';
  for (const event of jsonLines(stdout)) {
    if (event.type === 'tool_use') {
      toolCalls.push({ name: String(event.tool_name ?? ''), input: JSON.stringify(event.parameters ?? {}) });
    } else if (event.type === 'message' && event.role === 'assistant' && typeof event.content === 'string') {
      finalText += event.content;
    }
  }
  return { toolCalls, userMessages: [], finalText, visibleSkills: null };
}

export const geminiDriver: EvalDriver = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  executable: 'gemini',
  async available(env) {
    return (await findExecutable('gemini', env, process.platform)) !== null;
  },
  explicitPrompt: (id, prompt) => `Use the ${id} skill. ${prompt}`,
  async run(input) {
    const prompt = input.invocation === 'explicit' ? this.explicitPrompt(input.skillId, input.prompt) : input.prompt;
    const args = ['-p', prompt, '--output-format', 'stream-json'];
    if (input.mode === 'full') args.push('--approval-mode', 'auto_edit');
    if (input.model) args.push('-m', input.model);
    const res = await runProcess('gemini', args, { cwd: input.cwd, env: input.env, timeoutMs: input.timeoutMs });
    return {
      provider: 'gemini',
      raw: res.stdout,
      ...parseGeminiStream(res.stdout),
      exitCode: res.code,
      durationMs: res.durationMs,
      ...(res.timedOut ? { error: 'timed out' } : res.code !== 0 ? { error: res.stderr.trim().slice(-500) } : {}),
    };
  },
  activated(t, id) {
    return t.toolCalls.some(
      (c) => (c.name === 'activate_skill' && c.input.includes(`"${id}"`)) || skillPathRe(id).test(c.input),
    );
  },
};

// ---------------------------------------------------------------------------
// OpenCode
// ---------------------------------------------------------------------------

export function parseOpenCodeStream(stdout: string): Omit<Transcript, 'provider' | 'raw' | 'exitCode' | 'durationMs'> {
  const toolCalls: ToolCall[] = [];
  let finalText = '';
  for (const event of jsonLines(stdout)) {
    const part = (event.part ?? event) as Record<string, unknown>;
    if (part.type === 'tool') {
      const state = part.state as { input?: unknown } | undefined;
      toolCalls.push({ name: String(part.tool ?? ''), input: JSON.stringify(state?.input ?? {}) });
    } else if (part.type === 'text' && typeof part.text === 'string') {
      finalText = part.text;
    }
  }
  return { toolCalls, userMessages: [], finalText, visibleSkills: null };
}

export const opencodeDriver: EvalDriver = {
  id: 'opencode',
  displayName: 'OpenCode',
  executable: 'opencode',
  async available(env) {
    return (await findExecutable('opencode', env, process.platform)) !== null;
  },
  explicitPrompt: (id, prompt) => `Use the ${id} skill. ${prompt}`,
  async run(input) {
    const prompt = input.invocation === 'explicit' ? this.explicitPrompt(input.skillId, input.prompt) : input.prompt;
    const args = ['run', '--format', 'json', '--dir', input.cwd];
    if (input.model) args.push('-m', input.model);
    args.push(prompt);
    const res = await runProcess('opencode', args, { cwd: input.cwd, env: input.env, timeoutMs: input.timeoutMs });
    return {
      provider: 'opencode',
      raw: res.stdout,
      ...parseOpenCodeStream(res.stdout),
      exitCode: res.code,
      durationMs: res.durationMs,
      ...(res.timedOut ? { error: 'timed out' } : res.code !== 0 ? { error: res.stderr.trim().slice(-500) } : {}),
    };
  },
  activated(t, id) {
    return t.toolCalls.some(
      (c) => (c.name === 'skill' && c.input.includes(`"${id}"`)) || skillPathRe(id).test(c.input),
    );
  },
};

export const DRIVERS: Record<string, EvalDriver> = {
  claude: claudeDriver,
  codex: codexDriver,
  gemini: geminiDriver,
  opencode: opencodeDriver,
};
