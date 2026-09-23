import toml from '@iarna/toml';

/**
 * Minimal, line-preserving TOML edits for a single `[table] key = <scalar>`.
 *
 * AgileFlow must change exactly one provider setting when the user opts in,
 * so the rest of the user's file (comments, ordering, formatting) stays
 * byte-for-byte identical. Every edit is re-parsed and verified; anything
 * unexpected throws instead of writing a guess.
 */

export interface TomlValueState {
  existed: boolean;
  value?: unknown;
}

export function readTomlValue(text: string, table: string, key: string): TomlValueState {
  const parsed = text.trim() ? (toml.parse(text) as Record<string, unknown>) : {};
  const t = parsed[table];
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { existed: false };
  if (!Object.prototype.hasOwnProperty.call(t, key)) return { existed: false };
  return { existed: true, value: (t as Record<string, unknown>)[key] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  throw new Error(`Only scalar TOML values can be restored automatically (got ${typeof value})`);
}

interface Located {
  lines: string[];
  eol: string;
  headerIndex: number;
  sectionEnd: number;
  keyIndex: number;
  dottedIndex: number;
}

function locate(text: string, table: string, key: string): Located {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const headerRe = new RegExp(`^\\s*\\[\\s*${escapeRe(table)}\\s*\\]\\s*(#.*)?$`);
  const anyHeaderRe = /^\s*\[/;
  const keyRe = new RegExp(`^\\s*${escapeRe(key)}\\s*=`);
  const dottedRe = new RegExp(`^\\s*${escapeRe(table)}\\s*\\.\\s*${escapeRe(key)}\\s*=`);
  const inlineRe = new RegExp(`^\\s*${escapeRe(table)}\\s*=\\s*\\{`);
  let headerIndex = -1;
  let sectionEnd = lines.length;
  let keyIndex = -1;
  let dottedIndex = -1;
  let inRoot = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (anyHeaderRe.test(line)) {
      if (headerIndex !== -1 && i > headerIndex && sectionEnd === lines.length) sectionEnd = i;
      inRoot = false;
      if (headerRe.test(line)) {
        headerIndex = i;
        sectionEnd = lines.length;
      }
      continue;
    }
    if (inRoot && inlineRe.test(line)) {
      throw new Error(`[${table}] is an inline table; edit it manually`);
    }
    if (inRoot && dottedRe.test(line)) dottedIndex = i;
    if (headerIndex !== -1 && i > headerIndex && i < sectionEnd && keyRe.test(line)) keyIndex = i;
  }
  return { lines, eol, headerIndex, sectionEnd, keyIndex, dottedIndex };
}

function verify(text: string, table: string, key: string, expected: TomlValueState): string {
  let actual: TomlValueState;
  try {
    actual = readTomlValue(text, table, key);
  } catch (err) {
    throw new Error(`Refusing to write: edited TOML would not parse (${(err as Error).message})`);
  }
  if (actual.existed !== expected.existed || (expected.existed && actual.value !== expected.value)) {
    throw new Error('Refusing to write: edited TOML did not produce the expected value');
  }
  return text;
}

/** Set `[table] key = value`, inserting the table at the end when absent. */
export function setTomlValue(
  text: string,
  table: string,
  key: string,
  value: boolean | number | string,
): { text: string; createdTable: boolean } {
  readTomlValue(text, table, key); // throws on unparseable input
  const loc = locate(text, table, key);
  const assignment = `${key} = ${formatScalar(value)}`;
  const lines = [...loc.lines];
  let createdTable = false;
  if (loc.keyIndex !== -1) {
    const comment = /(\s+#.*)$/.exec(lines[loc.keyIndex]!.split('=').slice(1).join('='))?.[1] ?? '';
    const indent = /^\s*/.exec(lines[loc.keyIndex]!)?.[0] ?? '';
    lines[loc.keyIndex] = `${indent}${assignment}${comment}`;
  } else if (loc.dottedIndex !== -1) {
    lines[loc.dottedIndex] = `${table}.${assignment}`;
  } else if (loc.headerIndex !== -1) {
    lines.splice(loc.headerIndex + 1, 0, assignment);
  } else {
    createdTable = true;
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(`[${table}]`, assignment, '');
  }
  const next = lines.join(loc.eol);
  return { text: verify(next, table, key, { existed: true, value }), createdTable };
}

/** Remove `key` from `[table]`; drops the table header when `dropEmptyTable` and nothing else remains. */
export function removeTomlValue(text: string, table: string, key: string, dropEmptyTable: boolean): string {
  const loc = locate(text, table, key);
  const lines = [...loc.lines];
  const index = loc.keyIndex !== -1 ? loc.keyIndex : loc.dottedIndex;
  if (index === -1) return text;
  lines.splice(index, 1);
  if (dropEmptyTable && loc.headerIndex !== -1 && index > loc.headerIndex) {
    // Section now spans headerIndex+1 .. sectionEnd-1 (one line shorter).
    const sectionEnd = loc.sectionEnd - 1;
    const body = lines.slice(loc.headerIndex + 1, sectionEnd);
    if (body.every((l) => !l.trim())) {
      let start = loc.headerIndex;
      // Also drop the blank separator line that preceded the table.
      if (start > 0 && !lines[start - 1]!.trim()) start--;
      lines.splice(start, sectionEnd - start);
    }
  }
  let next = lines.join(loc.eol);
  if (text.endsWith(loc.eol) && !next.endsWith(loc.eol) && next.length) next += loc.eol;
  return verify(next, table, key, { existed: false });
}
