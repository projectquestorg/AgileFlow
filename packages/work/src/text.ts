import crypto from 'node:crypto';

/* eslint-disable no-control-regex */

/** Terminal escape sequences: CSI (`ESC [ ... m`), OSC (`ESC ] ... BEL`), and two-character escapes. */
const ESCAPE_SEQUENCE_RE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u009b[0-?]*[ -/]*[@-~]|\u001b[@-Z\\-_]/g;

/** C0 and C1 control characters, DEL, and Unicode line/paragraph separators. */
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** True when `text` contains a control character (including tab, line breaks, and ESC). */
export function hasControlCharacters(text: string): boolean {
  return CONTROL_RE.test(text);
}

/**
 * Remove terminal escape sequences whole (so no `[31m` remnants are left) and
 * every other control character except tab and line breaks. For text that is
 * copied into Work files from elsewhere (the v4 import).
 */
export function stripTerminalEscapes(text: string): string {
  return text.replace(ESCAPE_SEQUENCE_RE, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

/** A single line: escapes removed, control characters and runs of whitespace collapsed to one space. */
export function oneLine(text: string): string {
  return stripTerminalEscapes(text)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `a -> b -> c` for at most `max` items, then `... (N more)`. Keeps huge cycles and lists readable. */
export function capList(items: string[], max = 12, separator = ' -> '): string {
  if (items.length <= max) return items.join(separator);
  return `${items.slice(0, max).join(separator)}${separator}... (${items.length - max} more)`;
}

/** Content hash used for change detection and evidence: `sha256:` plus the first 16 hex digits. */
export function contentHash(content: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
}
