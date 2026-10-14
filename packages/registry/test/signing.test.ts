import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { copyTree, createContext, sha256Hex } from '@agileflow/core';
import {
  buildRegistry,
  generateSigningKey,
  RegistryClient,
  sign,
  updateRoot,
  verifySnapshot,
  type RootMeta,
  type Signed,
  type SnapshotMeta,
} from '@agileflow/registry';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const VC = YAML.parse(fs.readFileSync(path.join(REPO, 'skills/verifying-changes/agileflow.skill.yaml'), 'utf8')).package.version as string;
const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sign-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const NOW = new Date('2026-09-29T00:00:00Z');
const LATER = '2027-09-29T00:00:00.000Z';

function rootMeta(version: number, rootKeys: string[], snapshotKeys: string[], threshold = 1): RootMeta {
  const keys: RootMeta['keys'] = {};
  const ids = (list: string[]) => list.map((pub) => sha256Hex(Buffer.from(pub, 'base64')));
  for (const k of [...rootKeys, ...snapshotKeys]) keys[sha256Hex(Buffer.from(k, 'base64'))] = { type: 'ed25519', public: k };
  return { type: 'root', version, expires: LATER, keys, roles: { root: { keyids: ids(rootKeys), threshold }, snapshot: { keyids: ids(snapshotKeys), threshold: 1 } } };
}

function snapshotFor(manifest: Buffer, version = 1, expires = LATER): SnapshotMeta {
  return { type: 'snapshot', version, expires, manifest: { sha256: sha256Hex(manifest), length: manifest.length } };
}

describe('signed metadata', () => {
  const rootKey = generateSigningKey();
  const snapKey = generateSigningKey();
  const root1 = sign(rootMeta(1, [rootKey.publicKey], [snapKey.publicKey]), [rootKey.privateKeyPem]);
  const manifest = Buffer.from('{"schema":1,"packages":{}}');

  it('verifies a snapshot signed by the snapshot role and bound to the manifest bytes', () => {
    const snap = sign(snapshotFor(manifest), [snapKey.privateKeyPem]);
    expect(verifySnapshot(root1.signed, snap, manifest, { now: NOW }).version).toBe(1);
    expect(() => verifySnapshot(root1.signed, snap, Buffer.from('{"schema":1,"packages":{"x":{}}}'), { now: NOW })).toThrow(/does not match its signed snapshot/);
    // The root key is not a snapshot key, and an unknown key counts for nothing.
    expect(() => verifySnapshot(root1.signed, sign(snapshotFor(manifest), [rootKey.privateKeyPem]), manifest, { now: NOW })).toThrow(/0 valid snapshot signature/);
    expect(() => verifySnapshot(root1.signed, sign(snapshotFor(manifest), [generateSigningKey().privateKeyPem]), manifest, { now: NOW })).toThrow(/0 valid/);
    // Signatures cover the canonical form: any edit to the signed fields breaks them.
    const edited = { ...snap, signed: { ...snap.signed, version: 9 } };
    expect(() => verifySnapshot(root1.signed, edited, manifest, { now: NOW })).toThrow(/0 valid/);
  });

  it('refuses expired and rolled-back snapshots', () => {
    const expired = sign(snapshotFor(manifest, 1, '2026-01-01T00:00:00Z'), [snapKey.privateKeyPem]);
    expect(() => verifySnapshot(root1.signed, expired, manifest, { now: NOW })).toThrow(/expired/);
    const old = sign(snapshotFor(manifest, 3), [snapKey.privateKeyPem]);
    expect(() => verifySnapshot(root1.signed, old, manifest, { now: NOW, lastSeen: 4 })).toThrow(/rollback/);
  });

  it('rotates keys only through a root signed by both the old and the new root keys', async () => {
    const newRootKey = generateSigningKey();
    const newSnapKey = generateSigningKey();
    const meta2 = rootMeta(2, [newRootKey.publicKey], [newSnapKey.publicKey]);
    const both = sign(meta2, [rootKey.privateKeyPem, newRootKey.privateKeyPem]);
    const chain = (docs: Record<number, Signed<RootMeta>>) => async (n: number) => docs[n] ?? null;
    const updated = await updateRoot(root1, chain({ 2: both }), NOW);
    expect(updated.signed.version).toBe(2);
    // After rotation, the old snapshot key no longer counts.
    expect(() => verifySnapshot(updated.signed, sign(snapshotFor(manifest), [snapKey.privateKeyPem]), manifest, { now: NOW })).toThrow(/0 valid/);
    expect(verifySnapshot(updated.signed, sign(snapshotFor(manifest), [newSnapKey.privateKeyPem]), manifest, { now: NOW }).version).toBe(1);

    await expect(updateRoot(root1, chain({ 2: sign(meta2, [newRootKey.privateKeyPem]) }), NOW)).rejects.toThrow(/root v2 has 0 valid root signature/);
    await expect(updateRoot(root1, chain({ 2: sign(meta2, [rootKey.privateKeyPem]) }), NOW)).rejects.toThrow(/root v2 has 0 valid root signature/);
    await expect(updateRoot(root1, chain({ 2: sign({ ...meta2, version: 3 }, [rootKey.privateKeyPem, newRootKey.privateKeyPem]) }), NOW)).rejects.toThrow(/claims version 3/);
  });

  it('needs the threshold of distinct keys', () => {
    const second = generateSigningKey();
    const root = sign(rootMeta(1, [rootKey.publicKey, second.publicKey], [snapKey.publicKey], 2), [rootKey.privateKeyPem]);
    const meta2 = rootMeta(2, [rootKey.publicKey, second.publicKey], [snapKey.publicKey], 2);
    // The same key twice is one signature.
    return expect(updateRoot(root, async (n) => (n === 2 ? sign(meta2, [rootKey.privateKeyPem, rootKey.privateKeyPem]) : null), NOW)).rejects.toThrow(/1 valid root signature/);
  });
});

describe('registry client with a pinned trust root', () => {
  const rootKey = generateSigningKey();
  const snapKey = generateSigningKey();
  const trustRoot = sign(rootMeta(1, [rootKey.publicKey], [snapKey.publicKey]), [rootKey.privateKeyPem]);

  async function signedRegistry() {
    const root = tmpdir();
    const out = path.join(root, 'registry');
    await copyTree(path.join(REPO, 'skills'), path.join(root, 'skills'));
    expect((await buildRegistry({ skillsDir: path.join(root, 'skills'), packsDir: path.join(REPO, 'packs'), outDir: out })).errors).toEqual([]);
    const writeSnapshot = (version: number) => {
      const manifest = fs.readFileSync(path.join(out, 'v1/manifest.json'));
      fs.writeFileSync(path.join(out, 'v1/snapshot.json'), JSON.stringify(sign(snapshotFor(manifest, version), [snapKey.privateKeyPem])));
    };
    writeSnapshot(2);
    const client = (env: Record<string, string> = {}) =>
      new RegistryClient(out, createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'cache'), env }), { trustRoot, now: () => NOW });
    return { out, client, writeSnapshot };
  }

  it('installs official packages listed in the signed manifest', async () => {
    const { client } = await signedRegistry();
    const c = client();
    const meta = (await c.getVersion('@agileflow/verifying-changes', VC))!;
    expect((await c.download(meta)).length).toBeGreaterThan(0);
    expect(await c.signedMetadata()).toMatchObject({ status: 'verified', root: 1, snapshot: { version: 2 } });
  });

  it('refuses content whose manifest entry was changed after signing', async () => {
    const { out, client } = await signedRegistry();
    const file = path.join(out, 'v1/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.packages['@agileflow/verifying-changes'][VC] = 'sha256-' + 'A'.repeat(43) + '=';
    fs.writeFileSync(file, JSON.stringify(manifest));
    const c = client();
    await expect(c.download((await c.getVersion('@agileflow/verifying-changes', VC))!)).rejects.toThrow(/does not match its signed snapshot/);
  });

  it('refuses a version document whose integrity is not the signed one', async () => {
    const { out } = await signedRegistry();
    // No CLI pins, so only the signature stands between the documents and the install.
    const c = new RegistryClient(out, createContext({ cwd: out, homeDir: out, cacheDir: tmpdir(), env: {} }), { trustRoot, now: () => NOW, pins: {} });
    const meta = (await c.getVersion('@agileflow/verifying-changes', VC))!;
    await expect(c.download({ ...meta, integrity: 'sha256-' + 'B'.repeat(43) + '=' })).rejects.toThrow(/not in the registry's signed manifest with this integrity/);
  });

  it('refuses a rolled-back snapshot after seeing a newer one', async () => {
    const { client, writeSnapshot } = await signedRegistry();
    await client().signedMetadata();
    writeSnapshot(1);
    await expect(client().signedMetadata()).rejects.toThrow(/rollback/);
  });

  it('treats a user-chosen registry without signatures as unsigned, unless signatures are required', async () => {
    const { out, client } = await signedRegistry();
    fs.rmSync(path.join(out, 'v1/snapshot.json'));
    expect(await client().signedMetadata()).toMatchObject({ status: 'unsigned' });
    const strict = client({ AGILEFLOW_REQUIRE_SIGNED: '1' });
    await expect(strict.download((await strict.getVersion('@agileflow/verifying-changes', VC))!)).rejects.toThrow(/publishes no signed snapshot/);
  });
});
