import type { Diagnostic } from '@agileflow/core';

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

/** Plain terminal output. Colors only on a TTY and never when NO_COLOR is set. */
export class Output {
  readonly color: boolean;

  constructor(
    readonly stdout: Writer,
    readonly stderr: Writer,
    env: Record<string, string | undefined> = {},
  ) {
    this.color = !!stdout.isTTY && !('NO_COLOR' in env) && env.TERM !== 'dumb';
  }

  paint(text: string, color: Color): string {
    if (!this.color) return text;
    const [open, close] = CODES[color];
    return `\u001b[${open}m${text}\u001b[${close}m`;
  }

  line(text = ''): void {
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

  diagnostic(d: Diagnostic, indent = '  '): void {
    this.line(`${indent}${this.paint(MARK[d.level], MARK_COLOR[d.level])} ${d.message}`);
    for (const detail of d.detail ?? []) this.line(`${indent}     ${detail}`);
  }

  json(value: unknown): void {
    this.line(JSON.stringify(value, null, 2));
  }
}
