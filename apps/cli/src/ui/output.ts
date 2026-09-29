import type { Diagnostic, OperationEvent } from '@agileflow/core';

export interface Writer {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

export type Color = 'green' | 'yellow' | 'red' | 'dim' | 'bold' | 'cyan';

const CODES: Record<Color, [number, number]> = {
  green: [32, 39],
  yellow: [33, 39],
  red: [31, 39],
  dim: [2, 22],
  bold: [1, 22],
  cyan: [36, 39],
};

/** ASCII status markers (no emoji). */
export const MARK: Record<Diagnostic['level'], string> = {
  ok: '[ok]',
  info: '[--]',
  warn: '[!]',
  error: '[x]',
};

const MARK_COLOR: Record<Diagnostic['level'], Color> = {
  ok: 'green',
  info: 'dim',
  warn: 'yellow',
  error: 'red',
};

const pipeGuarded = new WeakSet<object>();

/**
 * `agileflow ... | head` closes stdout early; the next write then fails with
 * EPIPE on the stream. End quietly instead of crashing (the exit code is
 * unaffected); any other stream error still surfaces.
 */
function ignoreBrokenPipe(stream: Writer): void {
  const s = stream as Writer & { on?: (event: string, listener: (err: NodeJS.ErrnoException) => void) => unknown };
  if (typeof s.on !== 'function' || pipeGuarded.has(s)) return;
  pipeGuarded.add(s);
  s.on('error', (err) => {
    if (err?.code === 'EPIPE') return;
    throw err;
  });
}

/**
 * Plain terminal output. Colors only on a TTY and never when NO_COLOR is set.
 *
 * In JSON mode (`--json`) stdout carries exactly one JSON document: human
 * lines are dropped, warnings and errors still go to stderr, and errors are
 * also reported as `{"ok": false, "error": {...}}` on stdout.
 */
export class Output {
  readonly color: boolean;
  jsonMode = false;
  private emittedJson = false;

  constructor(
    readonly stdout: Writer,
    readonly stderr: Writer,
    env: Record<string, string | undefined> = {},
    options: { json?: boolean; color?: boolean } = {},
  ) {
    this.jsonMode = !!options.json;
    this.color = options.color !== false && !!stdout.isTTY && !('NO_COLOR' in env) && env.TERM !== 'dumb';
    ignoreBrokenPipe(stdout);
  }

  /** True once a command printed its JSON result. */
  get hasJson(): boolean {
    return this.emittedJson;
  }

  paint(text: string, color: Color): string {
    if (!this.color) return text;
    const [open, close] = CODES[color];
    return `\u001b[${open}m${text}\u001b[${close}m`;
  }

  line(text = ''): void {
    if (this.jsonMode) return;
    this.stdout.write(`${text}\n`);
  }

  lines(lines: string[]): void {
    for (const l of lines) this.line(l);
  }

  heading(text: string): void {
    this.line(this.paint(text, 'bold'));
  }

  error(text: string, hints: string[] = []): void {
    this.stderr.write(`${this.paint('error', 'red')}: ${text}\n`);
    for (const hint of hints) this.stderr.write(`  ${hint}\n`);
  }

  warn(text: string): void {
    this.stderr.write(`${this.paint('warning', 'yellow')}: ${text}\n`);
  }

  /** Progress for long operations: stderr, only on a terminal, never in JSON mode. */
  progress(text: string): void {
    if (this.jsonMode || !this.stderr.isTTY) return;
    this.stderr.write(`${this.paint(text, 'dim')}\n`);
  }

  /** Informational line on stderr (never mixed into JSON or piped stdout data). */
  note(text: string): void {
    this.stderr.write(`${text}\n`);
  }

  diagnostic(d: Diagnostic, indent = '  '): void {
    this.line(`${indent}${this.paint(MARK[d.level], MARK_COLOR[d.level])} ${d.message}`);
    for (const detail of d.detail ?? []) this.line(`${indent}     ${detail}`);
  }

  json(value: unknown): void {
    this.emittedJson = true;
    this.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  /** The standard machine-readable error document. */
  jsonError(message: string, hints: string[] = [], code = 'error'): void {
    this.json({ ok: false, error: { code, message, hints } });
  }
}

// ---------------------------------------------------------------------------
// Versioned JSON envelope for commands that change things
// ---------------------------------------------------------------------------

/** Version of the mutation envelope below. Bumped only for incompatible changes. */
export const JSON_SCHEMA = 1;

export interface SkippedItem {
  id: string;
  reason: string;
}

export interface FailedItem {
  /** Skill id, or null for a failure that is not about one skill. */
  id: string | null;
  error: string;
}

/**
 * The one result shape of every changing command (`add`, `remove`, `sync`,
 * `update`, `configure`, `migrate`) in `--json` mode:
 *
 *   { schema: 1, ok, command, dryRun,
 *     applied: [...], skipped: [{id, reason}], failed: [{id, error}],
 *     repaired: [...], warnings: [string], events: [OperationEvent],
 *     ...command-specific keys kept for backward compatibility }
 *
 * `applied` lists what changed (or would change, with `dryRun`); items are
 * skill ids or objects with an `id`. `failed` is derived from error events
 * unless the command passes its own. `ok` is false when anything failed.
 */
export interface MutationEnvelope {
  schema: typeof JSON_SCHEMA;
  ok: boolean;
  command: string;
  dryRun: boolean;
  applied: unknown[];
  skipped: SkippedItem[];
  failed: FailedItem[];
  repaired: unknown[];
  warnings: string[];
  events: OperationEvent[];
  [key: string]: unknown;
}

export interface EnvelopeParts {
  ok?: boolean;
  dryRun?: boolean;
  applied?: unknown[];
  skipped?: SkippedItem[];
  failed?: FailedItem[];
  repaired?: unknown[];
  warnings?: string[];
  events?: OperationEvent[];
  /** Command-specific keys (existing fields kept for compatibility). */
  extra?: Record<string, unknown>;
}

function eventText(e: OperationEvent): string {
  return `${e.skill ? `${e.skill}: ` : ''}${e.message}`;
}

/** Build the envelope; error events become `failed`, warn events `warnings`. */
export function mutationEnvelope(command: string, parts: EnvelopeParts = {}): MutationEnvelope {
  const events = parts.events ?? [];
  const failed = [
    ...(parts.failed ?? []),
    ...events.filter((e) => e.level === 'error').map((e) => ({ id: e.skill ?? null, error: e.message })),
  ];
  const warnings = [...new Set([...(parts.warnings ?? []), ...events.filter((e) => e.level === 'warn').map(eventText)])];
  return {
    // Command-specific keys first so the envelope fields always win.
    ...(parts.extra ?? {}),
    schema: JSON_SCHEMA,
    ok: (parts.ok ?? true) && failed.length === 0,
    command,
    dryRun: !!parts.dryRun,
    applied: parts.applied ?? [],
    skipped: parts.skipped ?? [],
    failed,
    repaired: parts.repaired ?? [],
    warnings,
    events,
  };
}
