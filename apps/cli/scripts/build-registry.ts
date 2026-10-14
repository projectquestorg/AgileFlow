// Build (or --check) the static skill registry from skills/ and packs/.
//
// Published history is checked against the manifest of the last release as
// recorded in git (not against registry/ itself), so rewriting an old bundle
// together with its hashes and pins is caught. Override the baseline with
// AGILEFLOW_REGISTRY_BASELINE=<git ref>, or set it to "none" to skip.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry, OFFICIAL_PINS, RegistryManifestSchema, type RegistryManifest } from '@agileflow/registry';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const check = process.argv.includes('--check');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function releaseBaseline(): { ref: string; manifest: RegistryManifest } | null {
  const requested = process.env.AGILEFLOW_REGISTRY_BASELINE;
  if (requested === 'none') return null;
  let ref = requested;
  try {
    // The previous release: on a tagged release commit, HEAD's own tag would
    // make the release its own baseline, so start from HEAD's parent.
    ref ??= git(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^']);
  } catch {
    console.warn('warning: no release tag found; published history is only checked against registry/ itself');
    return null;
  }
  let text: string;
  try {
    text = git(['show', `${ref}:registry/v1/manifest.json`]);
  } catch {
    if (requested) throw new Error(`AGILEFLOW_REGISTRY_BASELINE=${requested}: registry/v1/manifest.json not found at that ref`);
    console.warn(`warning: ${ref} has no registry manifest; published history is only checked against registry/ itself`);
    return null;
  }
  return { ref, manifest: RegistryManifestSchema.parse(JSON.parse(text)) };
}

const baseline = releaseBaseline();
const result = await buildRegistry({
  skillsDir: path.join(repo, 'skills'),
  packsDir: path.join(repo, 'packs'),
  outDir: path.join(repo, 'registry'),
  pinsFile: path.join(repo, 'packages/registry/src/official-pins.ts'),
  check,
  ...(baseline ? { baseline: baseline.manifest } : {}),
  pinned: OFFICIAL_PINS,
});
for (const w of result.warnings) console.warn(`warning: ${w}`);
for (const e of result.errors) console.error(`error: ${e}`);
if (result.errors.length) process.exit(1);
const against = baseline ? `, history verified against ${baseline.ref}` : '';
if (check) {
  if (result.outOfDate.length) {
    console.error('registry/ is out of date with skills/ and packs/:');
    for (const f of result.outOfDate) console.error(`  ${f}`);
    console.error('Run `npm run registry:build` in apps/cli.');
    process.exit(1);
  }
  console.log(`registry up to date (${result.skills.length} skills${against})`);
} else {
  console.log(`registry: ${result.written.length} file(s) written, ${result.skills.length} skills${against}`);
}
