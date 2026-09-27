import toml from '@iarna/toml';

/**
 * Minimal, line-preserving TOML editing for `migrate v4`.
 *
 * `toml.parse` + `toml.stringify` drops comments and reorders the user's
 * Codex config, so migration edits the text instead: it only deletes the
 * lines that belong to the entries it removes. The result is then parsed
 * and compared with the intended structure; when they differ (a layout this
 * editor does not understand, e.g. inline hook arrays), the edit is refused
 * rather than written.
 *
 * Supported layout (what v4 wrote with `toml.stringify`, possibly edited by
 * hand afterwards): `[[hooks.<Event>]]` array-of-tables entries with nested
 * `[[hooks.<Event>.hooks]]` commands or a flat `command = ...` key, plus
 * root-level `key = value` lines. Comments, blank lines, CRLF line endings,
 * quoted/dotted keys, and multi-line strings/arrays are handled.
 */

interface Line {
  text: string;
  eol: string;
}

type Item =
  | { kind: 'header'; line: number; path: string[]; array: boolean }
  | { kind: 'kv'; start: number; end: number; path: string[]; value: string }
  | { kind: 'comment'; line: number }
  | { kind: 'blank'; line: number };

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < text.length) {
    const nl = text.indexOf('\n', i);
    if (nl === -1) {
      out.push({ text: text.slice(i), eol: '' });
      break;
    }
    const cr = nl > i && text[nl - 1] === '\r';
    out.push({ text: text.slice(i, cr ? nl - 1 : nl), eol: cr ? '\r\n' : '\n' });
    i = nl + 1;
  }
  return out;
}

/** Parse a dotted key (`a."b.c".'d'`) starting at `i`. Returns null when there is no key. */
function parseKeyPath(s: string, start: number): { path: string[]; end: number } | null {
  const path: string[] = [];
  let i = start;
  for (;;) {
    while (s[i] === ' ' || s[i] === '\t') i++;
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      let raw = '';
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\' && j + 1 < s.length) {
          raw += s[j]! + s[j + 1]!;
          j += 2;
        } else raw += s[j++];
      }
      if (j >= s.length) return null;
      try {
        path.push(JSON.parse(`"${raw}"`) as string);
      } catch {
        path.push(raw);
      }
      i = j + 1;
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j === -1) return null;
      path.push(s.slice(i + 1, j));
      i = j + 1;
    } else {
      const m = /^[A-Za-z0-9_-]+/.exec(s.slice(i));
      if (!m) return null;
      path.push(m[0]);
      i += m[0].length;
    }
    while (s[i] === ' ' || s[i] === '\t') i++;
    if (s[i] !== '.') return { path, end: i };
    i++;
  }
}

interface ScanState {
  multi: '"""' | "'''" | null;
  depth: number;
}

/** Advance the value scanner over `s` from `i`, tracking strings and bracket depth. */
function scanValue(s: string, i: number, st: ScanState): void {
  while (i < s.length) {
    if (st.multi) {
      if (st.multi === '"""' && s[i] === '\\') {
        i += 2;
        continue;
      }
      if (s.startsWith(st.multi, i)) {
        i += 3;
        // A closing delimiter may be followed by up to two extra quotes.
        while (s[i] === st.multi[0]) i++;
        st.multi = null;
        continue;
      }
      i++;
      continue;
    }
    const c = s[i]!;
    if (c === '#') return;
    if (s.startsWith('"""', i) || s.startsWith("'''", i)) {
      st.multi = s.slice(i, i + 3) as ScanState['multi'];
      i += 3;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') i += s[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      i = j === -1 ? s.length : j + 1;
      continue;
    }
    if (c === '[' || c === '{') st.depth++;
    else if (c === ']' || c === '}') st.depth = Math.max(0, st.depth - 1);
    i++;
  }
}

function scan(lines: Line[]): Item[] {
  const items: Item[] = [];
  const st: ScanState = { multi: null, depth: 0 };
  let current: Extract<Item, { kind: 'kv' }> | null = null;
  for (let n = 0; n < lines.length; n++) {
    const text = n === 0 ? lines[n]!.text.replace(/^﻿/, '') : lines[n]!.text;
    if (current) {
      scanValue(text, 0, st);
      if (!st.multi && st.depth === 0) {
        current.end = n + 1;
        current = null;
      }
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === '') {
      items.push({ kind: 'blank', line: n });
      continue;
    }
    if (trimmed.startsWith('#')) {
      items.push({ kind: 'comment', line: n });
      continue;
    }
    if (trimmed.startsWith('[')) {
      const array = trimmed.startsWith('[[');
      const start = text.indexOf('[') + (array ? 2 : 1);
      const key = parseKeyPath(text, start);
      if (key) {
        items.push({ kind: 'header', line: n, path: key.path, array });
        continue;
      }
      throw new Error(`unsupported TOML header on line ${n + 1}`);
    }
    const key = parseKeyPath(text, 0);
    if (!key || text[key.end] !== '=') throw new Error(`unsupported TOML on line ${n + 1}`);
    const kv: Extract<Item, { kind: 'kv' }> = {
      kind: 'kv',
      start: n,
      end: n + 1,
      path: key.path,
      value: text.slice(key.end + 1).trim(),
    };
    items.push(kv);
    scanValue(text, key.end + 1, st);
    if (st.multi || st.depth > 0) current = kv;
  }
  if (current) throw new Error('unterminated TOML value');
  return items;
}

function stringValue(value: string): string | null {
  try {
    const parsed = toml.parse(`v = ${value}`) as { v?: unknown };
    return typeof parsed.v === 'string' ? parsed.v : null;
  } catch {
    return null;
  }
}

const samePath = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);
const startsWith = (a: string[], prefix: string[]) => a.length > prefix.length && prefix.every((s, i) => s === a[i]);

interface Section {
  header: Extract<Item, { kind: 'header' }> | null;
  items: Item[];
}

function sections(items: Item[]): Section[] {
  const out: Section[] = [{ header: null, items: [] }];
  for (const item of items) {
    if (item.kind === 'header') out.push({ header: item, items: [] });
    else out[out.length - 1]!.items.push(item);
  }
  return out;
}

function sectionLines(section: Section): number[] {
  const out: number[] = [];
  if (section.header) out.push(section.header.line);
  for (const item of section.items) {
    if (item.kind === 'kv') for (let n = item.start; n < item.end; n++) out.push(n);
    else if (item.kind === 'blank') out.push(item.line);
    // comment lines are kept: they are the user's
  }
  return out;
}

export interface TomlEditRequest {
  /** Remove `[[hooks.<Event>]]` entries/commands whose `command` matches. */
  removeHookCommand?: (command: string) => boolean;
  /** Remove these root-level keys (only when they are plain `key = value` lines in the root table). */
  removeRootKeys?: string[];
}

export interface TomlEditResult {
  text: string;
  removedHooks: number;
  removedKeys: string[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/**
 * Remove AgileFlow hook entries and/or root keys from TOML text by deleting
 * lines. `expected` is the structure the edit must produce (computed by the
 * caller from the parsed original); the edit throws instead of returning a
 * result that parses to anything else.
 */
export function editTomlLines(
  original: string,
  request: TomlEditRequest,
  expected: (parsed: Record<string, unknown>) => Record<string, unknown>,
): TomlEditResult {
  const lines = splitLines(original);
  const items = scan(lines);
  const secs = sections(items);
  const remove = new Set<number>();
  let removedHooks = 0;
  const removedKeys: string[] = [];

  if (request.removeRootKeys?.length) {
    for (const item of secs[0]!.items) {
      if (item.kind !== 'kv' || item.path.length !== 1) continue;
      if (!request.removeRootKeys.includes(item.path[0]!)) continue;
      for (let n = item.start; n < item.end; n++) remove.add(n);
      removedKeys.push(item.path[0]!);
    }
  }

  const match = request.removeHookCommand;
  if (match) {
    for (let i = 1; i < secs.length; i++) {
      const entry = secs[i]!;
      const h = entry.header!;
      if (!h.array || h.path.length !== 2 || h.path[0] !== 'hooks') continue;
      // Subsections of this entry: headers below `hooks.<Event>` until the next
      // entry or an unrelated table.
      const subs: Section[] = [];
      let j = i + 1;
      while (j < secs.length && startsWith(secs[j]!.header!.path, h.path)) subs.push(secs[j++]!);
      const commands = subs.filter((s) => s.header!.array && samePath(s.header!.path, [...h.path, 'hooks']));
      const hitOf = (s: Section) => {
        const cmd = s.items.find((it) => it.kind === 'kv' && samePath(it.path, ['command']));
        const value = cmd && cmd.kind === 'kv' ? stringValue(cmd.value) : null;
        return value !== null && match(value);
      };
      if (commands.length) {
        const hits = commands.filter(hitOf);
        if (hits.length === commands.length) {
          for (const s of [entry, ...subs]) for (const n of sectionLines(s)) remove.add(n);
        } else {
          for (const s of hits) for (const n of sectionLines(s)) remove.add(n);
        }
        removedHooks += hits.length;
      } else if (hitOf(entry)) {
        for (const s of [entry, ...subs]) for (const n of sectionLines(s)) remove.add(n);
        removedHooks++;
      }
      i = j - 1;
    }
    // Drop a `[hooks]` table header that is left with nothing in or under it.
    const remainingHooks = secs.some(
      (s) => s.header && startsWith(s.header.path, ['hooks']) && !remove.has(s.header.line),
    );
    for (const s of secs) {
      if (!s.header || s.header.array || !samePath(s.header.path, ['hooks']) || remainingHooks) continue;
      if (s.items.some((it) => it.kind === 'kv')) continue;
      for (const n of sectionLines(s)) remove.add(n);
    }
  }

  // Rebuild, collapsing blank lines that only became adjacent because
  // something between them was removed.
  const kept: Line[] = [];
  let removedSince = false;
  let removedAny = false;
  for (let n = 0; n < lines.length; n++) {
    if (remove.has(n)) {
      removedSince = true;
      removedAny = true;
      continue;
    }
    const line = lines[n]!;
    const blank = line.text.trim() === '';
    const prev = kept[kept.length - 1];
    if (blank && removedSince && (!prev || prev.text.trim() === '')) continue;
    kept.push(line);
    removedSince = false;
  }
  if (removedSince) {
    while (kept.length && kept[kept.length - 1]!.text.trim() === '') kept.pop();
  }
  if (kept.length && removedAny) {
    // The file keeps ending the way it did (with or without a final newline).
    const endsWithNewline = lines[lines.length - 1]!.eol !== '';
    const fileEol = lines.find((l) => l.eol)?.eol ?? '\n';
    const last = kept[kept.length - 1]!;
    kept[kept.length - 1] = { text: last.text, eol: endsWithNewline ? last.eol || fileEol : '' };
  }
  const text = removedAny ? kept.map((l) => l.text + l.eol).join('') : original;

  // Verify: the edited text must parse to exactly the intended structure.
  const want = expected(toml.parse(original) as Record<string, unknown>);
  let got: Record<string, unknown>;
  try {
    got = toml.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`line edit produced invalid TOML (${(err as Error).message})`);
  }
  const hooks = got.hooks;
  if (hooks && typeof hooks === 'object' && !Array.isArray(hooks) && Object.keys(hooks).length === 0) delete got.hooks;
  if (JSON.stringify(canonical(got)) !== JSON.stringify(canonical(want))) {
    throw new Error('the file uses a layout that cannot be edited line by line');
  }
  return { text, removedHooks, removedKeys };
}
