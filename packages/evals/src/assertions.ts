import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIsolatedEnv } from './isolation';
import { runProcess, type Transcript } from './providers';

export interface RubricItemResult {
  criterion: string;
  pass: boolean;
  reason: string;
  /** `rule`: a deterministic check; `judge`: graded by the LLM judge. */
  source: 'rule' | 'judge';
}

export interface RubricResult {
  /** Judge that graded the `judge` items (null when only rule checks ran). */
  judge: string | null;
  items: RubricItemResult[];
  /** Fraction of graded items that passed. */
  score: number;
  /** Judge criteria left ungraded because no judge ran (`--judge none`). */
  ungraded: string[];
}

/** The judge crashed, timed out, or answered with something unusable. Never a pass. */
export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeError';
  }
}

/** Compact, judge-readable summary of what the agent did. */
export function summarizeTranscript(t: Transcript, limit = 24000): string {
  const calls = t.toolCalls.map((c, i) => `${i + 1}. ${c.name} ${c.input.slice(0, 300)}`).join('\n');
  const changes = t.changes ? `\n\nFiles changed in the repository (final state):\n${t.changes}` : '';
  const text = `Tool calls (in order):\n${calls || '(none)'}\n\nFinal response:\n${t.finalText || '(empty)'}${changes}`;
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

export function buildJudgePrompt(prompt: string, rubric: string[], transcript: Transcript): string {
  return [
    'You are grading a coding agent transcript against a rubric. Judge only observable behavior in the transcript.',
    '',
    'User request given to the agent:',
    prompt.trim(),
    '',
    'Transcript summary:',
    summarizeTranscript(transcript),
    '',
    'Rubric (grade each criterion independently):',
    ...rubric.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Respond with ONLY a JSON object, no prose, in this exact shape:',
    '{"items":[{"criterion":"<criterion text>","pass":true,"reason":"<one sentence>"}]}',
  ].join('\n');
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new JudgeError('judge returned no JSON');
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new JudgeError('judge returned invalid JSON');
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Parse the judge's grades. Items are matched by criterion text first, then by
 * position when the counts agree. Every criterion must get a boolean `pass`;
 * anything else is a judge error, never a silent pass or fail.
 */
export function parseJudgeOutput(text: string, rubric: string[]): RubricItemResult[] {
  const parsed = extractJson(text);
  if (!Array.isArray(parsed.items)) throw new JudgeError('judge JSON has no items');
  const items = parsed.items as Array<Partial<RubricItemResult>>;
  return rubric.map((criterion, i) => {
    let item = items.find((x) => typeof x?.criterion === 'string' && normalize(x.criterion) === normalize(criterion));
    if (!item && items.length === rubric.length) item = items[i];
    if (!item || typeof item.pass !== 'boolean') throw new JudgeError(`judge did not grade "${criterion}"`);
    return { criterion, pass: item.pass, reason: String(item.reason ?? ''), source: 'judge' as const };
  });
}

/** What the judge needs to know about a scenario's ambiguity (from the scenario's `interaction` block). */
export interface InteractionContext {
  ambiguity: 'choice' | 'missing-information' | 'repository-answerable';
  /** The decision or missing fact, and why it matters. */
  decision: string;
  /** What the finished change must do; used for `taskSucceeded`. */
  success: string[];
}

/**
 * Judge's view of how the agent handled ambiguity. `null` means "does not
 * apply" (no question asked, no assumption made, or the agent stopped before
 * finishing).
 */
export interface InteractionAssessment {
  /** Did the run end waiting on the user for a decision or information? More reliable than `askedUser()`. */
  askedUser: boolean;
  questionWasMaterial: boolean | null;
  questionWasRepositoryAnswerable: boolean | null;
  proceededWithAssumption: boolean;
  assumptionWasReasonable: boolean | null;
  taskSucceeded: boolean | null;
  reason: string;
}

export interface Judge {
  id: string;
  grade(prompt: string, rubric: string[], transcript: Transcript): Promise<RubricResult>;
  assessInteraction?(prompt: string, context: InteractionContext, transcript: Transcript): Promise<InteractionAssessment>;
}

export function buildInteractionJudgePrompt(prompt: string, context: InteractionContext, transcript: Transcript): string {
  return [
    'You are grading how a coding agent handled ambiguity in a request. Judge only observable behavior in the transcript.',
    'The goal is a good decision boundary for questions, not more questions: a question is good only when the answer',
    'materially changes the result and could not be found in the repository or with the available tools.',
    '',
    'User request given to the agent:',
    prompt.trim(),
    '',
    `Ambiguity in this scenario (${context.ambiguity}):`,
    context.decision.trim(),
    '',
    'A successful finished change:',
    ...context.success.map((c) => `- ${c}`),
    '',
    'Transcript summary:',
    summarizeTranscript(transcript),
    '',
    'Answer these fields:',
    '- askedUser: did the agent end its turn waiting on the user for a decision or information it needs (phrased as a question or not)? Pleasantries like "let me know if you need anything else" and tool permission requests do not count.',
    '- questionWasMaterial: if the agent asked the user a question, would the answer materially change the result? null if it asked nothing.',
    '- questionWasRepositoryAnswerable: if the agent asked, could it have answered the question itself from the repository or tools? null if it asked nothing.',
    '- proceededWithAssumption: did the agent continue past an unresolved ambiguity by assuming an answer (stated or not)?',
    '- assumptionWasReasonable: if it proceeded on an assumption, was that assumption reasonable and consequential assumptions stated? null otherwise.',
    '- taskSucceeded: if the agent finished the change, does it meet every success point? null if it stopped to ask before finishing.',
    '',
    'Respond with ONLY a JSON object, no prose, in this exact shape:',
    '{"askedUser":false,"questionWasMaterial":null,"questionWasRepositoryAnswerable":null,"proceededWithAssumption":false,"assumptionWasReasonable":null,"taskSucceeded":null,"reason":"<one or two sentences>"}',
  ].join('\n');
}

const triState = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);

export function parseInteractionJudgeOutput(text: string): InteractionAssessment {
  const raw = extractJson(text);
  if (typeof raw.askedUser !== 'boolean' || typeof raw.proceededWithAssumption !== 'boolean') {
    throw new JudgeError('judge JSON is missing askedUser or proceededWithAssumption');
  }
  return {
    askedUser: raw.askedUser,
    questionWasMaterial: triState(raw.questionWasMaterial),
    questionWasRepositoryAnswerable: triState(raw.questionWasRepositoryAnswerable),
    proceededWithAssumption: raw.proceededWithAssumption,
    assumptionWasReasonable: triState(raw.assumptionWasReasonable),
    taskSucceeded: triState(raw.taskSucceeded),
    reason: String(raw.reason ?? ''),
  };
}

/** Ask the judge again once when it fails or its output does not parse; a second failure is an error. */
async function withRetry<T>(ask: () => Promise<string>, parse: (text: string) => T): Promise<T> {
  try {
    return parse(await ask());
  } catch {
    try {
      return parse(await ask());
    } catch (err) {
      throw err instanceof JudgeError ? err : new JudgeError((err as Error).message);
    }
  }
}

export interface ClaudeJudgeOptions {
  /** Caller environment (API keys pass through). */
  env: Record<string, string | undefined>;
  /** Judge model (`--judge-model`). Never the model under test. */
  model?: string;
  timeoutMs?: number;
  /** Run each judge call with an isolated HOME holding only Claude's login files (default true). */
  isolate?: boolean;
  /** Real HOME to copy Claude's login from (default: from `env`). */
  realHome?: string;
  /** Command to run (tests). */
  command?: string;
}

/** Output of `claude -p --output-format json`: the answer text, or a JudgeError for a failed call. */
export function readClaudeJudgeResult(res: { stdout: string; stderr: string; code: number | null; timedOut: boolean }): string {
  if (res.timedOut) throw new JudgeError('judge timed out');
  type ClaudeJson = { result?: unknown; is_error?: unknown };
  let parsed: ClaudeJson | null;
  try {
    const value = JSON.parse(res.stdout) as unknown;
    parsed = value && typeof value === 'object' ? (value as ClaudeJson) : null;
  } catch {
    parsed = null;
  }
  if (res.code !== 0 || parsed?.is_error === true) {
    const detail = (typeof parsed?.result === 'string' ? parsed.result : res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ');
    throw new JudgeError(`judge exited with ${res.code ?? 'no code'}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  if (parsed && typeof parsed.result === 'string') return parsed.result;
  return res.stdout;
}

/**
 * Judge backed by the Claude CLI (`claude -p --output-format json`). Each
 * call runs in an empty directory (never the user's project, whose
 * instructions could change the answer format) and, by default, with an
 * isolated HOME so personal skills and settings do not apply.
 */
export function claudeJudge(options: ClaudeJudgeOptions): Judge {
  const id = options.model ? `claude:${options.model}` : 'claude';
  const ask = async (judgePrompt: string): Promise<string> => {
    const args = ['-p', judgePrompt, '--output-format', 'json', '--max-turns', '1'];
    if (options.model) args.push('--model', options.model);
    const isolated =
      options.isolate === false ? null : await createIsolatedEnv({ env: options.env, providers: ['claude'], realHome: options.realHome });
    const cwd = await fs.promises.mkdtemp(path.join(isolated?.home ?? os.tmpdir(), isolated ? 'judge-' : 'agileflow-judge-'));
    try {
      const res = await runProcess(options.command ?? 'claude', args, {
        cwd,
        env: isolated?.env ?? options.env,
        timeoutMs: options.timeoutMs ?? 180000,
      });
      return readClaudeJudgeResult(res);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
      await isolated?.dispose();
    }
  };
  return {
    id,
    async grade(prompt, rubric, transcript) {
      const items = await withRetry(() => ask(buildJudgePrompt(prompt, rubric, transcript)), (t) => parseJudgeOutput(t, rubric));
      return { judge: id, items, score: items.filter((i) => i.pass).length / Math.max(items.length, 1), ungraded: [] };
    },
    async assessInteraction(prompt, context, transcript) {
      return withRetry(() => ask(buildInteractionJudgePrompt(prompt, context, transcript)), parseInteractionJudgeOutput);
    },
  };
}

/** Native question tools across providers. */
const QUESTION_TOOLS = new Set(['AskUserQuestion', 'request_user_input', 'ask_user', 'askUserQuestion']);

/** The agent used the provider's native structured question tool. */
export function usedStructuredQuestion(t: Transcript): boolean {
  return t.toolCalls.some((c) => QUESTION_TOOLS.has(c.name));
}

/**
 * Did the agent stop to ask the user something? True when it called a native
 * question tool, or when the final paragraph of its last message asks a
 * question (a recommendation may follow the question: "Which do you want?
 * I'd lean toward 2."). Requests for tool permission are not questions about
 * the work and are not counted. Used to compare question preferences.
 */
export function askedUser(t: Transcript): boolean {
  if (t.toolCalls.some((c) => QUESTION_TOOLS.has(c.name))) return true;
  const paragraphs = t.finalText
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = paragraphs.at(-1) ?? '';
  if (/\b(approv|permission)/i.test(last)) return false;
  return /\?(\s|\*|$)/.test(last);
}
