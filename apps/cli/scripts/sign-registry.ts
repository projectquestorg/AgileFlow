// Registry signing: key ceremony, root rotation, and snapshot signing.
//
//   npm run registry:sign -- keygen <dir>
//       New ed25519 key: <dir>/<keyid>.pem (0600, keep offline) and prints the public key.
//   npm run registry:sign -- root --version N --expires 2027-10-01 \
//         --root-keys <pub,...> --root-threshold 1 --snapshot-keys <pub,...> --snapshot-threshold 1 \
//         --sign <pem,...>
//       Writes registry/v1/root/N.json. Version 1 is also written to
//       packages/registry/src/trust-root.ts (pinned into the next CLI release).
//       Version N>1 must be signed by enough keys of root N-1 AND of root N.
//   npm run registry:sign -- snapshot --sign <pem,...> [--expires-days 365]
//       Signs registry/v1/manifest.json into registry/v1/snapshot.json (version +1).
//       Run after every `npm run registry:build` that changes the manifest.
//       Keys can also come from AGILEFLOW_SNAPSHOT_KEY (PEM contents).
//   npm run registry:sign -- check [--min-days 30]
//       Release gate: once a trust root is pinned, the snapshot must be valid,
//       match the manifest, and not expire within --min-days.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateSigningKey,
  keyIdOf,
  sign,
  SignedRootSchema,
  SignedSnapshotSchema,
  TRUSTED_ROOT,
  updateRoot,
  verifySnapshot,
  type RootMeta,
  type SnapshotMeta,
} from '@agileflow/registry';
import { sha256Hex } from '@agileflow/core';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const registry = path.join(repo, 'registry');
const [command, ...rest] = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
const list = (name: string): string[] => (opt(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
function signingKeys(): string[] {
  const files = list('sign').map((f) => fs.readFileSync(f, 'utf8'));
  if (process.env.AGILEFLOW_SNAPSHOT_KEY) files.push(process.env.AGILEFLOW_SNAPSHOT_KEY);
  if (!files.length) fail('no signing key: pass --sign <key.pem,...> or set AGILEFLOW_SNAPSHOT_KEY');
  return files;
}
function latestRoot(): { file: string; version: number } | null {
  const dir = path.join(registry, 'v1', 'root');
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).map((f) => Number(/^(\d+)\.json$/.exec(f)?.[1])).filter((n) => n > 0).sort((a, b) => a - b);
  const version = versions.at(-1);
  return version ? { file: path.join(dir, `${version}.json`), version } : null;
}

if (command === 'keygen') {
  const dir = rest[0] ?? fail('usage: keygen <dir>');
  const key = generateSigningKey();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${key.keyid.slice(0, 16)}.pem`);
  fs.writeFileSync(file, key.privateKeyPem, { mode: 0o600, flag: 'wx' });
  console.log(`private key: ${file} (keep it offline; never commit it)`);
  console.log(`public key:  ${key.publicKey}`);
  console.log(`key id:      ${key.keyid}`);
} else if (command === 'root') {
  const version = Number(opt('version'));
  const expires = opt('expires');
  if (!Number.isInteger(version) || version < 1 || !expires) fail('root needs --version N and --expires <ISO date>');
  const rootKeys = list('root-keys');
  const snapshotKeys = list('snapshot-keys');
  if (!rootKeys.length || !snapshotKeys.length) fail('root needs --root-keys and --snapshot-keys (public keys, base64)');
  const keys: RootMeta['keys'] = {};
  for (const k of [...rootKeys, ...snapshotKeys]) keys[keyIdOf(k)] = { type: 'ed25519', public: k };
  const meta: RootMeta = {
    type: 'root',
    version,
    expires: new Date(expires).toISOString(),
    keys,
    roles: {
      root: { keyids: rootKeys.map(keyIdOf), threshold: Number(opt('root-threshold') ?? 1) },
      snapshot: { keyids: snapshotKeys.map(keyIdOf), threshold: Number(opt('snapshot-threshold') ?? 1) },
    },
  };
  const doc = sign(meta, signingKeys());
  if (version > 1) {
    const previous = path.join(registry, 'v1', 'root', `${version - 1}.json`);
    if (!fs.existsSync(previous)) fail(`root ${version - 1} not found at ${previous}`);
    await updateRoot(SignedRootSchema.parse(readJson(previous)), async (n) => (n === version ? doc : null)).catch((err: Error) =>
      fail(`root ${version} does not chain from root ${version - 1}: ${err.message}`),
    );
  }
  writeJson(path.join(registry, 'v1', 'root', `${version}.json`), doc);
  if (version === 1) {
    fs.writeFileSync(
      path.join(repo, 'packages/registry/src/trust-root.ts'),
      "import type { RootMeta, Signed } from './signing';\n\n" +
        '/**\n * Registry trust root pinned into this CLI release (written by `npm run registry:sign -- root`).\n' +
        ' * Newer roots are accepted only when they chain from this one.\n */\n' +
        `export const TRUSTED_ROOT: Signed<RootMeta> | null = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
  console.log(`wrote registry/v1/root/${version}.json`);
} else if (command === 'snapshot') {
  const manifestFile = path.join(registry, 'v1', 'manifest.json');
  const manifest = fs.readFileSync(manifestFile);
  const snapshotFile = path.join(registry, 'v1', 'snapshot.json');
  const previous = fs.existsSync(snapshotFile) ? SignedSnapshotSchema.parse(readJson(snapshotFile)).signed.version : 0;
  const days = Number(opt('expires-days') ?? 365);
  const meta: SnapshotMeta = {
    type: 'snapshot',
    version: previous + 1,
    expires: new Date(Date.now() + days * 86400000).toISOString(),
    manifest: { sha256: sha256Hex(manifest), length: manifest.length },
  };
  writeJson(snapshotFile, sign(meta, signingKeys()));
  console.log(`wrote registry/v1/snapshot.json (version ${meta.version}, expires ${meta.expires})`);
} else if (command === 'check') {
  if (!TRUSTED_ROOT) {
    console.log('registry signing: no trust root pinned in this CLI yet (unsigned; see apps/cli/PUBLISHING.md)');
    process.exit(0);
  }
  const root = await updateRoot(TRUSTED_ROOT, async (n) => {
    const file = path.join(registry, 'v1', 'root', `${n}.json`);
    return fs.existsSync(file) ? readJson(file) : null;
  }).catch((err: Error) => fail(err.message));
  const snapshotFile = path.join(registry, 'v1', 'snapshot.json');
  if (!fs.existsSync(snapshotFile)) fail('registry/v1/snapshot.json is missing; run `npm run registry:sign -- snapshot`');
  const minDays = Number(opt('min-days') ?? 30);
  const soon = new Date(Date.now() + minDays * 86400000);
  let snap: SnapshotMeta;
  try {
    snap = verifySnapshot(root.signed, readJson(snapshotFile), fs.readFileSync(path.join(registry, 'v1', 'manifest.json')));
  } catch (err) {
    fail(`${(err as Error).message} (run \`npm run registry:sign -- snapshot\` after registry:build)`);
  }
  if (Date.parse(snap.expires) <= soon.getTime()) fail(`registry snapshot expires ${snap.expires}, within ${minDays} days; re-sign it`);
  const latest = latestRoot();
  console.log(`registry signed: root v${root.signed.version}${latest ? ` of ${latest.version}` : ''}, snapshot v${snap.version} (expires ${snap.expires})`);
} else {
  fail('usage: sign-registry.ts keygen|root|snapshot|check (see the header of this file)');
}
