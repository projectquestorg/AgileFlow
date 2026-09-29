import crypto from 'node:crypto';
import { z } from 'zod';
import { formatZodError, sha256Hex } from '@agileflow/core';

/**
 * Signed registry metadata (a small subset of The Update Framework).
 *
 * The registry's integrity hashes live next to the bytes they describe, so on
 * their own they only prove the download was not corrupted. Signed metadata
 * adds who published it:
 *
 * - `v1/root/<n>.json`: the trust root. Lists the publishers' ed25519 keys and
 *   how many signatures each role needs. This CLI pins one root version
 *   (`trust-root.ts`); a newer root is accepted only when signed by the
 *   previous root's keys and its own, which is how keys rotate.
 * - `v1/snapshot.json`: signed by the snapshot role. Binds the exact bytes of
 *   `v1/manifest.json` (every published name@version -> integrity), carries a
 *   version that only goes up (rollback protection: clients remember the
 *   highest version they saw) and an expiry (a frozen, stale registry is
 *   refused).
 *
 * A valid signature identifies an authorized publisher. It does not make a
 * skill's instructions safe; that is what the install and update review is for.
 */

const Ed25519Key = z.object({ type: z.literal('ed25519'), public: z.string().regex(/^[A-Za-z0-9+/]{43}=$/) });
const Role = z.object({ keyids: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1), threshold: z.number().int().positive() });
const Expires = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be an ISO date' });

export const RootMetaSchema = z.object({
  type: z.literal('root'),
  version: z.number().int().positive(),
  expires: Expires,
  keys: z.record(z.string(), Ed25519Key),
  roles: z.object({ root: Role, snapshot: Role }),
});
export type RootMeta = z.infer<typeof RootMetaSchema>;

export const SnapshotMetaSchema = z.object({
  type: z.literal('snapshot'),
  version: z.number().int().positive(),
  expires: Expires,
  manifest: z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), length: z.number().int().nonnegative() }),
});
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

const Signature = z.object({ keyid: z.string(), sig: z.string() });
export interface Signed<T> {
  signed: T;
  signatures: Array<{ keyid: string; sig: string }>;
}
export const SignedRootSchema = z.object({ signed: RootMetaSchema, signatures: z.array(Signature) });
export const SignedSnapshotSchema = z.object({ signed: SnapshotMetaSchema, signatures: z.array(Signature) });

export class SignatureError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'SignatureError';
  }
}

/** JSON with sorted keys and no whitespace: the bytes that are signed. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Key id: sha256 of the raw 32-byte public key, hex. */
export function keyIdOf(publicKeyBase64: string): string {
  return sha256Hex(Buffer.from(publicKeyBase64, 'base64'));
}

function publicKeyObject(publicKeyBase64: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKeyBase64, 'base64').toString('base64url') }, format: 'jwk' });
}

/** Raw base64 public key of an ed25519 private key (PEM). */
export function publicKeyOf(privateKeyPem: string): string {
  const jwk = crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({ format: 'jwk' }) as { x?: string; crv?: string };
  if (jwk.crv !== 'Ed25519' || !jwk.x) throw new SignatureError('signing keys must be ed25519');
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

export function generateSigningKey(): { privateKeyPem: string; publicKey: string; keyid: string } {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicKey = publicKeyOf(privateKeyPem);
  return { privateKeyPem, publicKey, keyid: keyIdOf(publicKey) };
}

export function sign<T>(signed: T, privateKeyPems: string[]): Signed<T> {
  const data = Buffer.from(canonicalJson(signed));
  return {
    signed,
    signatures: privateKeyPems.map((pem) => ({
      keyid: keyIdOf(publicKeyOf(pem)),
      sig: crypto.sign(null, data, crypto.createPrivateKey(pem)).toString('base64'),
    })),
  };
}

/** Number of distinct keys of `role` in `root` with a valid signature over `doc.signed`. */
function validSignatures(doc: Signed<unknown>, root: RootMeta, role: 'root' | 'snapshot'): number {
  const data = Buffer.from(canonicalJson(doc.signed));
  const allowed = new Set(root.roles[role].keyids);
  const valid = new Set<string>();
  for (const { keyid, sig } of doc.signatures) {
    const key = root.keys[keyid];
    if (!allowed.has(keyid) || !key || valid.has(keyid)) continue;
    // A key listed under the wrong id would let one key count twice.
    if (keyIdOf(key.public) !== keyid) continue;
    try {
      if (crypto.verify(null, data, publicKeyObject(key.public), Buffer.from(sig, 'base64'))) valid.add(keyid);
    } catch {
      // malformed signature or key: not valid
    }
  }
  return valid.size;
}

function assertThreshold(doc: Signed<unknown>, root: RootMeta, role: 'root' | 'snapshot', what: string): void {
  const n = validSignatures(doc, root, role);
  if (n < root.roles[role].threshold) {
    throw new SignatureError(`${what} has ${n} valid ${role} signature(s); root v${root.version} requires ${root.roles[role].threshold}`);
  }
}

function assertNotExpired(expires: string, what: string, now: Date): void {
  if (Date.parse(expires) <= now.getTime()) {
    throw new SignatureError(`${what} expired on ${expires}`, [
      'The registry has not been re-signed. Retry later, or report it to the registry maintainers.',
    ]);
  }
}

export function parseSigned<T>(schema: z.ZodType<Signed<T>>, raw: unknown, what: string): Signed<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new SignatureError(`${what} is malformed: ${formatZodError(parsed.error)}`);
  return parsed.data;
}

/**
 * Walk the root chain from `trusted` using `fetchRoot(n)` (null when root `n`
 * is not published). Each new root must be version n+1 and signed by the
 * threshold of both the previous root's and its own root keys.
 */
export async function updateRoot(
  trusted: Signed<RootMeta>,
  fetchRoot: (version: number) => Promise<unknown | null>,
  now = new Date(),
): Promise<Signed<RootMeta>> {
  let current = trusted;
  for (;;) {
    const next = current.signed.version + 1;
    const raw = await fetchRoot(next);
    if (raw === null) break;
    const doc = parseSigned(SignedRootSchema, raw, `root v${next}`);
    if (doc.signed.version !== next) throw new SignatureError(`root v${next} claims version ${doc.signed.version}`);
    assertThreshold(doc, current.signed, 'root', `root v${next}`);
    assertThreshold(doc, doc.signed, 'root', `root v${next}`);
    current = doc;
  }
  assertNotExpired(current.signed.expires, `registry root v${current.signed.version}`, now);
  return current;
}

/**
 * Verify a snapshot against a (chain-updated) root and the manifest bytes it
 * must describe. `lastSeen` is the highest snapshot version this machine has
 * accepted before; an older one is a rollback.
 */
export function verifySnapshot(
  root: RootMeta,
  raw: unknown,
  manifestBytes: Buffer,
  options: { lastSeen?: number; now?: Date } = {},
): SnapshotMeta {
  const doc = parseSigned(SignedSnapshotSchema, raw, 'registry snapshot');
  assertThreshold(doc, root, 'snapshot', 'registry snapshot');
  const snap = doc.signed;
  assertNotExpired(snap.expires, `registry snapshot v${snap.version}`, options.now ?? new Date());
  if (options.lastSeen !== undefined && snap.version < options.lastSeen) {
    throw new SignatureError(`registry snapshot v${snap.version} is older than v${options.lastSeen} seen before (rollback)`);
  }
  if (manifestBytes.length !== snap.manifest.length || sha256Hex(manifestBytes) !== snap.manifest.sha256) {
    throw new SignatureError('registry manifest does not match its signed snapshot');
  }
  return snap;
}
