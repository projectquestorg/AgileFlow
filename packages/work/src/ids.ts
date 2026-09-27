import crypto from 'node:crypto';
import { CROCKFORD_ALPHABET, ID_PREFIX, ID_SUFFIX_LENGTH } from './constants';
import { WorkError } from './paths';
import type { ArtifactType } from './types';

/**
 * 8 random Crockford Base32 characters (40 bits). No counter, no registry,
 * no next-id file: IDs created on different branches, worktrees, or by
 * parallel agents do not collide in practice.
 */
export function randomSuffix(random: (n: number) => Buffer = crypto.randomBytes): string {
  // 5 random bytes = 40 bits = exactly 8 base32 digits.
  const bytes = random(5);
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < ID_SUFFIX_LENGTH; i++) {
    out = CROCKFORD_ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

/** New ID for `type`, avoiding `existing` (retries on the astronomically rare local collision). */
export function createId(type: ArtifactType, existing: Iterable<string> = []): string {
  const taken = existing instanceof Set ? (existing as Set<string>) : new Set(existing);
  for (;;) {
    const id = `${ID_PREFIX[type]}-${randomSuffix()}`;
    if (!taken.has(id)) return id;
  }
}

export const createEpicId = (existing?: Iterable<string>) => createId('epic', existing);
export const createStoryId = (existing?: Iterable<string>) => createId('story', existing);
export const createDecisionId = (existing?: Iterable<string>) => createId('decision', existing);

/** Uppercase and map Crockford look-alikes (I/L to 1, O to 0) so typed prefixes still match. */
export function normalizeIdInput(input: string): string {
  const upper = input.trim().toUpperCase();
  const dash = upper.indexOf('-');
  const fix = (s: string) => s.replace(/[IL]/g, '1').replace(/O/g, '0');
  return dash === -1 ? fix(upper) : `${upper.slice(0, dash + 1)}${fix(upper.slice(dash + 1))}`;
}

export function idType(id: string): ArtifactType | null {
  if (id.startsWith('EPIC-')) return 'epic';
  if (id.startsWith('STORY-')) return 'story';
  if (id.startsWith('DEC-')) return 'decision';
  return null;
}

/**
 * Resolve a full ID or an unambiguous prefix. Accepts `STORY-3Q7MX2PK`,
 * `STORY-3Q7M`, or just `3Q7M` (matched against the random part of every ID).
 * Throws when nothing or more than one ID matches, and when the matched ID is
 * listed more than once (two files with the same ID, e.g. a copied story).
 */
export function resolvePartialId(input: string, ids: Iterable<string>, type?: ArtifactType): string {
  const counts = new Map<string, number>();
  for (const id of ids) if (!type || idType(id) === type) counts.set(id, (counts.get(id) ?? 0) + 1);
  const all = [...counts.keys()];
  const wanted = normalizeIdInput(input);
  if (!wanted) throw new WorkError('An ID is required');
  if (/^[A-Z]+-$/.test(wanted)) throw new WorkError(`"${input}" is only a type prefix; add characters of the ID`);
  const kind = type ? `${type} ` : '';
  const exact = all.find((id) => id === wanted);
  const matches = exact
    ? [exact]
    : all.filter((id) => (wanted.includes('-') ? id.startsWith(wanted) : id.slice(id.indexOf('-') + 1).startsWith(wanted)));
  if (!matches.length) throw new WorkError(`No ${kind}work item matches "${input}"`, ['List items with `agileflow work list`.']);
  if (matches.length > 1) {
    throw new WorkError(`"${input}" is ambiguous: it matches ${matches.length} ${kind}items`, [
      matches.slice(0, 8).join(', ') + (matches.length > 8 ? ', ...' : ''),
      'Type more characters of the ID.',
    ]);
  }
  const id = matches[0]!;
  const copies = counts.get(id) ?? 0;
  if (copies > 1) throw duplicateIdError(id, copies);
  return id;
}

/** Refusal for an ID that more than one file uses. `files` are listed when known. */
export function duplicateIdError(id: string, copies: number, files: string[] = []): WorkError {
  return new WorkError(`${id} is used by ${copies} work items (duplicate ID); refusing to guess which one you mean`, [
    ...files,
    'Give every copy but one a new ID (create new items with `agileflow work new`), then run the command again.',
    '`agileflow check` lists every duplicate ID.',
  ]);
}
