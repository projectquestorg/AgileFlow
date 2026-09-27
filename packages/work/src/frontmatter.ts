import { isDeepStrictEqual } from 'node:util';
import YAML, { isCollection, isMap, isScalar, type Node } from 'yaml';
import { WorkError } from './paths';
import { FRONTMATTER_SCHEMAS, type ArtifactType } from './types';

export interface ParsedDocument {
  /** Parsed frontmatter mapping, or null when there is none or it is not a mapping. */
  data: Record<string, unknown> | null;
  /** Raw frontmatter text between the `---` lines. */
  frontmatter: string | null;
  /** Everything after the closing `---` line, byte for byte. */
  body: string;
  /** YAML syntax error, when the frontmatter does not parse. */
  error?: string;
  /**
   * Text after an unquoted `title:` value that YAML read as a comment
   * (`title: Fix #123 crash` parses as "Fix"), so callers can warn.
   */
  titleComment?: string;
}

const FRONTMATTER_RE = /^(\uFEFF?)---(\r?\n)([\s\S]*?)(\r?\n)---[ \t]*(\r?\n|$)/;

/** Split a Markdown document into frontmatter and body. The body is returned exactly as written. */
export function parse(text: string): ParsedDocument {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { data: null, frontmatter: null, body: text };
  const frontmatter = m[3] ?? '';
  const body = text.slice(m[0].length);
  try {
    const doc = YAML.parseDocument(frontmatter);
    if (doc.errors.length) return { data: null, frontmatter, body, error: doc.errors[0]!.message.split('\n')[0] };
    const value = doc.toJS();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { data: null, frontmatter, body, error: 'frontmatter is not a YAML mapping' };
    }
    const result: ParsedDocument = { data: value as Record<string, unknown>, frontmatter, body };
    const title = isMap(doc.contents) ? doc.contents.items.find((p) => isScalar(p.key) && p.key.value === 'title')?.value : null;
    if (isScalar(title) && title.type === 'PLAIN' && title.range) {
      const tail = frontmatter.slice(title.range[1], title.range[2]);
      if (/^[ \t]+#/.test(tail)) result.titleComment = tail.trim();
    }
    return result;
  } catch (err) {
    return { data: null, frontmatter, body, error: (err as Error).message.split('\n')[0] };
  }
}

export interface FrontmatterProblem {
  level: 'error' | 'warn';
  message: string;
}

/**
 * Validate frontmatter against the schema for its `type`. Keys outside the
 * schema are warnings (schema 1 keeps metadata minimal); everything else is an error.
 */
export function validate(data: Record<string, unknown>, expected?: ArtifactType): FrontmatterProblem[] {
  const type = data.type;
  if (type !== 'epic' && type !== 'story' && type !== 'decision') {
    return [{ level: 'error', message: `type must be epic, story, or decision (got ${JSON.stringify(type ?? null)})` }];
  }
  if (expected && type !== expected) {
    return [{ level: 'error', message: `type is "${type}" but the file is in the ${expected} folder` }];
  }
  if (data.schema !== 1) {
    return [
      {
        level: 'error',
        message:
          typeof data.schema === 'number' && data.schema > 1
            ? `schema ${data.schema} is newer than this AgileFlow understands (schema 1)`
            : 'schema: 1 is required',
      },
    ];
  }
  const result = FRONTMATTER_SCHEMAS[type].safeParse(data);
  if (result.success) return [];
  const problems: FrontmatterProblem[] = [];
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      problems.push({
        level: 'warn',
        message: `unknown field${issue.keys.length === 1 ? '' : 's'} ${issue.keys.join(', ')} (not part of ${type} schema 1)`,
      });
      continue;
    }
    const where = issue.path.length ? issue.path.join('.') : 'frontmatter';
    // zod does not report the input value, so look it up: only an absent key is "required".
    const missing = issue.code === 'invalid_type' && issue.path.length === 1 && data[String(issue.path[0])] === undefined;
    const got = issue.code === 'invalid_type' && issue.path.length ? describe(data, issue.path) : '';
    problems.push({ level: 'error', message: missing ? `${where} is required` : `${where}: ${issue.message}${got}` });
  }
  return problems;
}

function describe(data: Record<string, unknown>, path: PropertyKey[]): string {
  let v: unknown = data;
  for (const k of path) v = v && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[k] : undefined;
  if (v === undefined) return '';
  const kind = v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v;
  return ` (got ${kind}${v !== null && typeof v !== 'object' ? ` ${JSON.stringify(v)}` : ''})`;
}

/** Format one value the way AgileFlow writes it: plain scalars when safe, block lists, `[]` when empty. */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return '\n' + value.map((v) => `  - ${formatValue(v)}`).join('\n');
  }
  if (typeof value === 'string') return YAML.stringify(value, { lineWidth: 0 }).trimEnd();
  return String(value);
}

/** Frontmatter keys in the order AgileFlow writes them. */
const KEY_ORDER = ['schema', 'type', 'id', 'title', 'status', 'priority', 'horizon', 'epic', 'depends_on', 'related', 'legacy_id'];

/** Serialize frontmatter (known keys first, in canonical order) and a body into a document. */
export function serialize(data: Record<string, unknown>, body: string): string {
  const keys = [...KEY_ORDER.filter((k) => k in data), ...Object.keys(data).filter((k) => !KEY_ORDER.includes(k))];
  const lines = keys.filter((k) => data[k] !== undefined).map((k) => {
    const v = formatValue(data[k]);
    return v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/**
 * Change top-level frontmatter keys in place. Only the source of the changed
 * values is rewritten; other keys, comments (including an inline comment after
 * a changed scalar), key order, quoting style, line endings, a BOM, and the
 * body stay byte-for-byte identical. Works for quoted keys (`"status": x`),
 * explicit keys, and flow mappings (`{status: x}`). `undefined` removes a key
 * (block mappings only); a missing key is added at the end of the mapping.
 *
 * The result is re-parsed before it is returned: unless the changed keys have
 * exactly the new values and every other key and the body are unchanged, this
 * throws and the caller must not write anything.
 */
export function patch(text: string, changes: Record<string, unknown>): string {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) throw new WorkError('document has no frontmatter to patch');
  const [whole, bom = '', open = '\n', fm = '', close = '\n', after = ''] = m;
  const eol = fm.includes('\r\n') ? '\r\n' : open;
  let current = fm;
  for (const [key, value] of Object.entries(changes)) current = patchKey(current, key, value, eol);
  const next = `${bom}---${open}${current}${close}---${after}${text.slice(whole.length)}`;
  verifyPatch(text, next, changes);
  return next;
}

class PatchRefused extends WorkError {}

const lineStart = (s: string, offset: number) => {
  const i = s.lastIndexOf('\n', offset - 1);
  return i === -1 ? 0 : i + 1;
};
const lineEnd = (s: string, offset: number) => {
  const i = s.indexOf('\n', offset);
  const end = i === -1 ? s.length : i;
  return end > 0 && s[end - 1] === '\r' ? end - 1 : end;
};

/**
 * Values inside a flow mapping. Simple words stay plain (`in-progress`);
 * anything else is JSON, which is valid YAML flow syntax and never collides
 * with `,{}[]`.
 */
const flowValue = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(value) && formatValue(value) === value ? value : JSON.stringify(value);

function patchKey(fm: string, key: string, value: unknown, eol: string): string {
  const doc = YAML.parseDocument(fm);
  if (doc.errors.length) throw new PatchRefused(`frontmatter does not parse (${doc.errors[0]!.message.split('\n')[0]})`);
  const map = doc.contents;
  if (!isMap(map)) throw new PatchRefused('frontmatter is not a YAML mapping');
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
  const keyNode = pair && isScalar(pair.key) ? pair.key : null;
  const valueNode = pair?.value as Node | null | undefined;

  if (map.flow) {
    if (value === undefined) {
      if (!pair) return fm;
      throw new PatchRefused(`cannot remove ${key} from a flow-style ({...}) frontmatter mapping`);
    }
    const formatted = flowValue(value);
    if (valueNode?.range && (isScalar(valueNode) || (isCollection(valueNode) && valueNode.flow)) && valueNode.range[1] > valueNode.range[0]) {
      return fm.slice(0, valueNode.range[0]) + formatted + fm.slice(valueNode.range[1]);
    }
    if (pair) throw new PatchRefused(`cannot rewrite ${key} in a flow-style ({...}) frontmatter mapping`);
    const close = fm.lastIndexOf('}', map.range?.[1] ?? fm.length);
    if (close === -1) throw new PatchRefused('flow-style frontmatter mapping has no closing brace');
    const before = fm.slice(0, close).replace(/\s+$/, '');
    const separator = map.items.length ? ', ' : '';
    return `${before}${separator}${flowValue(key)}: ${formatted}${fm.slice(before.length)}`;
  }

  const formatted = value === undefined ? '' : formatValue(value);
  const single = value !== undefined && !formatted.includes('\n');
  // A single-line scalar replacing a single-line scalar: rewrite just the value's
  // characters, so quoting of the key and a trailing `# comment` stay untouched.
  if (
    single &&
    isScalar(valueNode) &&
    valueNode.range &&
    valueNode.range[1] > valueNode.range[0] &&
    (valueNode.type === 'PLAIN' || valueNode.type === 'QUOTE_DOUBLE' || valueNode.type === 'QUOTE_SINGLE') &&
    !fm.slice(valueNode.range[0], valueNode.range[1]).includes('\n')
  ) {
    return fm.slice(0, valueNode.range[0]) + formatted + fm.slice(valueNode.range[1]);
  }

  // Otherwise replace the key's whole lines (block values, empty values, lists).
  const first = map.items[0]?.key as Node | undefined;
  const indent = first?.range ? /^[ \t]*/.exec(fm.slice(lineStart(fm, first.range[0])))![0] : '';
  const keySource = keyNode?.range ? fm.slice(keyNode.range[0], keyNode.range[1]) : key;
  const replacement =
    value === undefined ? [] : (formatted.startsWith('\n') ? `${keySource}:${formatted}` : `${keySource}: ${formatted}`).split('\n').map((l) => indent + l);
  if (!pair || !keyNode?.range) {
    if (value === undefined) return fm;
    return fm.replace(/(\r?\n)*$/, '') + eol + replacement.join(eol);
  }
  const start = lineStart(fm, keyNode.range[0]);
  if (fm.slice(start, keyNode.range[0]).trim() !== '') throw new PatchRefused(`cannot rewrite ${key}: it shares a line with another key`);
  let end = valueNode?.range ? valueNode.range[1] : keyNode.range[1];
  while (end > keyNode.range[1] && /\s/.test(fm[end - 1]!)) end--;
  const stop = lineEnd(fm, Math.max(end - 1, keyNode.range[0]));
  if (!replacement.length) {
    // Remove the lines and one line break.
    const nextStart = fm.indexOf('\n', stop);
    return nextStart === -1 ? fm.slice(0, start).replace(/\r?\n$/, '') : fm.slice(0, start) + fm.slice(nextStart + 1);
  }
  return fm.slice(0, start) + replacement.join(eol) + fm.slice(stop);
}

function verifyPatch(before: string, after: string, changes: Record<string, unknown>): void {
  const old = parse(before);
  const next = parse(after);
  const fail = (why: string): never => {
    throw new PatchRefused(`could not update ${Object.keys(changes).join(', ')} safely: ${why}`);
  };
  if (!old.data) fail('the frontmatter does not parse');
  if (!next.data) fail(next.error ? `the result would not parse (${next.error})` : 'the result would not be a YAML mapping');
  if (next.body !== old.body) fail('the body would change');
  const keys = new Set([...Object.keys(old.data!), ...Object.keys(next.data!), ...Object.keys(changes)]);
  for (const key of keys) {
    const expected = key in changes ? changes[key] : old.data![key];
    if (!isDeepStrictEqual(next.data![key], expected)) fail(`${key} would be ${JSON.stringify(next.data![key] ?? null)}`);
  }
}
