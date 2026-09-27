import { parse, TomlError } from 'smol-toml';

/**
 * Minimal, line-preserving TOML edits for a single `[table] key = <scalar>`.
 *
 * AgileFlow must change exactly one provider setting when the user opts in,
 * so the rest of the user's file (comments, ordering, formatting, line
 * endings, a UTF-8 BOM) stays byte-for-byte identical. Parsing and
 * verification use a TOML 1.0 parser, the grammar Codex itself uses: every
 * edit is re-parsed and the whole document must equal the original with only
 * the one intended change. Anything unexpected throws instead of writing a
 * guess, so AgileFlow never writes a file Codex would refuse to load.
 */

export interface TomlValueState {
  existed: boolean;
  value?: unknown;
}

/** The input is not TOML 1.0, or a safe edit is not possible. Nothing was written. */
export class TomlEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TomlEditError';
  }
}

function parseDocument(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    return parse(text) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof TomlError) {
      const first = err.message.split('\n')[0]!.replace(/^Invalid TOML document:\s*/, '');
      throw new TomlEditError(`not valid TOML (line ${err.line}, column ${err.column}: ${first})`);
    }
    throw new TomlEditError(`not valid TOML (${(err as Error).message})`);
  }
}

function tableOf(doc: Record<string, unknown>, table: string): Record<string, unknown> | null {
  const t = doc[table];
  return t && typeof t === 'object' && !Array.isArray(t) && !(t instanceof Date) ? (t as Record<string, unknown>) : null;
}

export function readTomlValue(text: string, table: string, key: string): TomlValueState {
  const t = tableOf(parseDocument(text), table);
  if (!t || !Object.prototype.hasOwnProperty.call(t, key)) return { existed: false };
  return { existed: true, value: t[key] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  throw new TomlEditError(`only scalar TOML values can be restored automatically (got ${typeof value})`);
}

interface Line {
  text: string;
  /** This line's own terminator ('' for a last line without one). */
  eol: string;
}

function splitLines(text: string): Line[] {
  if (!text) return [];
  return text.split(/(?<=\n)/).map((chunk) => {
    const eol = chunk.endsWith('\r\n') ? '\r\n' : chunk.endsWith('\n') ? '\n' : '';
    return { text: chunk.slice(0, chunk.length - eol.length), eol };
  });
}

const joinLines = (lines: Line[]) => lines.map((l) => l.text + l.eol).join('');
const isBlank = (line: Line | undefined) => !!line && !line.text.replace(/^\uFEFF/, '').trim();

interface Located {
  lines: Line[];
  /** Terminator for new lines: the file's first one, else LF. */
  eol: string;
  headerIndex: number;
  sectionEnd: number;
  /** `key = ...` inside the `[table]` section. */
  keyIndex: number;
  /** Root-level `table.key = ...`. */
  dottedIndex: number;
  /** Last root-level `table.<anything> = ...` (the table is defined by dotted keys). */
  lastRootDotted: number;
  /** Shapes this patcher does not edit (quoted keys/headers, inline tables). */
  unsupported: string | null;
}

function locate(text: string, table: string, key: string): Located {
  const lines = splitLines(text);
  const eol = lines.find((l) => l.eol)?.eol ?? '\n';
  const t = escapeRe(table);
  const k = escapeRe(key);
  const headerRe = new RegExp(`^\\s*\\[\\s*${t}\\s*\\]\\s*(#.*)?$`);
  const quotedHeaderRe = new RegExp(`^\\s*\\[\\s*(["'])${t}\\1\\s*\\]`);
  const anyHeaderRe = /^\s*\[/;
  const keyRe = new RegExp(`^\\s*${k}\\s*=`);
  const quotedKeyRe = new RegExp(`^\\s*(["'])${k}\\1\\s*=`);
  const dottedRe = new RegExp(`^\\s*${t}\\s*\\.\\s*${k}\\s*=`);
  const anyDottedRe = new RegExp(`^\\s*${t}\\s*\\.`);
  const quotedDottedRe = new RegExp(`^\\s*((["'])${t}\\2\\s*\\.|${t}\\s*\\.\\s*(["'])${k}\\3\\s*=)`);
  const inlineRe = new RegExp(`^\\s*${t}\\s*=`);
  const loc: Located = {
    lines,
    eol,
    headerIndex: -1,
    sectionEnd: lines.length,
    keyIndex: -1,
    dottedIndex: -1,
    lastRootDotted: -1,
    unsupported: null,
  };
  let inRoot = true;
  let openString: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.text;
    // Skip the inside of multi-line strings: a `[x]` there is not a header.
    if (openString) {
      if (line.split(openString).length % 2 === 0) openString = null;
      continue;
    }
    for (const delim of ['"""', "'''"]) {
      if (line.split(delim).length % 2 === 0) openString = delim;
    }
    if (anyHeaderRe.test(line)) {
      if (loc.headerIndex !== -1 && i > loc.headerIndex && loc.sectionEnd === lines.length) loc.sectionEnd = i;
      inRoot = false;
      if (headerRe.test(line)) {
        loc.headerIndex = i;
        loc.sectionEnd = lines.length;
      } else if (quotedHeaderRe.test(line)) {
        loc.unsupported = `a quoted [${table}] header`;
      }
      continue;
    }
    if (inRoot) {
      if (quotedDottedRe.test(line)) loc.unsupported = `quoted ${table}.* keys`;
      else if (dottedRe.test(line)) loc.dottedIndex = loc.lastRootDotted = i;
      else if (anyDottedRe.test(line)) loc.lastRootDotted = i;
      else if (inlineRe.test(line)) loc.unsupported = `an inline ${table} table (\`${table} = { ... }\`)`;
    }
    if (loc.headerIndex !== -1 && i > loc.headerIndex && i < loc.sectionEnd) {
      if (keyRe.test(line)) loc.keyIndex = i;
      else if (quotedKeyRe.test(line)) loc.unsupported = `a quoted ${key} key`;
    }
  }
  return loc;
}

/** Stable text form of a parsed document for whole-document comparison. */
function canonical(doc: Record<string, unknown>, table: string): string {
  const copy = { ...doc };
  const t = tableOf(copy, table);
  // An empty table and no table mean the same to Codex.
  if (t && Object.keys(t).length === 0) delete copy[table];
  return JSON.stringify(copy, (_k, v: unknown) => {
    if (typeof v === 'bigint') return `bigint:${v}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, (v as Record<string, unknown>)[key]]));
    }
    return v;
  });
}

/**
 * The edited text must parse as TOML 1.0 and equal the original document
 * with exactly one change: `[table] key` set to `expected.value`, or removed.
 */
function verify(
  original: Record<string, unknown>,
  next: string,
  table: string,
  key: string,
  expected: TomlValueState,
): string {
  let actual: Record<string, unknown>;
  try {
    actual = parseDocument(next);
  } catch (err) {
    throw new TomlEditError(`refusing to write: the edited file would be ${(err as Error).message}`);
  }
  const want: Record<string, unknown> = { ...original };
  const t = { ...(tableOf(original, table) ?? {}) };
  if (expected.existed) t[key] = expected.value;
  else delete t[key];
  want[table] = t;
  if (canonical(actual, table) !== canonical(want, table)) {
    throw new TomlEditError('refusing to write: the edit would change more than the one setting');
  }
  return next;
}

function manualHint(table: string, key: string): string {
  return `edit \`[${table}] ${key}\` manually`;
}

/**
 * Rewrite only the value token of an assignment line; the key spelling,
 * indentation, spacing, and any trailing comment stay as they were.
 * (A value that is not a single token fails verification and is refused.)
 */
function replaceValue(line: string, value: string): string {
  const m = /^(\s*[^=]+?=[ \t]*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s#]+)(.*)$/.exec(line);
  if (!m) return line;
  return `${m[1]}${value}${m[3]}`;
}

/**
 * Set `[table] key = value`. Uses the shape the file already has: the
 * existing line, the `[table]` section, root dotted keys (`table.x = ...`),
 * or else appends a new `[table]` at the end.
 */
export function setTomlValue(
  text: string,
  table: string,
  key: string,
  value: boolean | number | string,
): { text: string; createdTable: boolean } {
  const original = parseDocument(text);
  const loc = locate(text, table, key);
  if (loc.unsupported) throw new TomlEditError(`the file uses ${loc.unsupported}; ${manualHint(table, key)}`);
  const scalar = formatScalar(value);
  const lines = loc.lines.map((l) => ({ ...l }));
  let createdTable = false;
  if (loc.keyIndex !== -1) {
    lines[loc.keyIndex]!.text = replaceValue(lines[loc.keyIndex]!.text, scalar);
  } else if (loc.dottedIndex !== -1) {
    lines[loc.dottedIndex]!.text = replaceValue(lines[loc.dottedIndex]!.text, scalar);
  } else if (loc.headerIndex !== -1) {
    lines.splice(loc.headerIndex + 1, 0, { text: `${key} = ${scalar}`, eol: loc.eol });
    if (!lines[loc.headerIndex]!.eol) lines[loc.headerIndex]!.eol = loc.eol;
  } else if (loc.lastRootDotted !== -1) {
    // `table` is defined by root dotted keys; a `[table]` header would define
    // it twice (invalid TOML 1.0, Codex refuses to start). Add a dotted key.
    const anchor = lines[loc.lastRootDotted]!;
    const indent = /^\s*/.exec(anchor.text.replace(/^\uFEFF/, ''))?.[0] ?? '';
    if (!anchor.eol) anchor.eol = loc.eol;
    lines.splice(loc.lastRootDotted + 1, 0, { text: `${indent}${table}.${key} = ${scalar}`, eol: loc.eol });
  } else {
    createdTable = true;
    const last = lines[lines.length - 1];
    if (last && !last.eol) last.eol = loc.eol;
    if (last && !isBlank(last)) lines.push({ text: '', eol: loc.eol });
    lines.push({ text: `[${table}]`, eol: loc.eol }, { text: `${key} = ${scalar}`, eol: loc.eol });
  }
  const next = joinLines(lines);
  return { text: verify(original, next, table, key, { existed: true, value }), createdTable };
}

/** Remove `key` from `[table]`; drops the table header when `dropEmptyTable` and nothing else remains. */
export function removeTomlValue(text: string, table: string, key: string, dropEmptyTable: boolean): string {
  const original = parseDocument(text);
  const loc = locate(text, table, key);
  const index = loc.keyIndex !== -1 ? loc.keyIndex : loc.dottedIndex;
  if (index === -1) {
    if (!readTomlValue(text, table, key).existed) return text;
    throw new TomlEditError(`could not find the ${key} line safely; ${manualHint(table, key)}`);
  }
  const lines = loc.lines.map((l) => ({ ...l }));
  const removed = lines.splice(index, 1)[0]!;
  if (dropEmptyTable && loc.headerIndex !== -1 && index > loc.headerIndex) {
    // Section now spans headerIndex+1 .. sectionEnd-1 (one line shorter).
    const sectionEnd = loc.sectionEnd - 1;
    const body = lines.slice(loc.headerIndex + 1, sectionEnd);
    if (body.every((l) => isBlank(l))) {
      let start = loc.headerIndex;
      // Also drop the blank separator line that preceded the table.
      if (start > 0 && isBlank(lines[start - 1])) start--;
      lines.splice(start, sectionEnd - start);
    }
  }
  // Keep "no newline at end of file" when the removed line was the last one.
  if (!removed.eol && index >= lines.length && lines.length) lines[lines.length - 1]!.eol = '';
  return verify(original, joinLines(lines), table, key, { existed: false });
}
