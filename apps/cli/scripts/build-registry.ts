// Build (or --check) the static skill registry from skills/ and packs/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '@agileflow/registry';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const check = process.argv.includes('--check');
const result = await buildRegistry({
  skillsDir: path.join(repo, 'skills'),
  packsDir: path.join(repo, 'packs'),
  outDir: path.join(repo, 'registry'),
  check,
});
for (const e of result.errors) console.error(`error: ${e}`);
if (result.errors.length) process.exit(1);
if (check) {
  if (result.outOfDate.length) {
    console.error('registry/ is out of date with skills/ and packs/:');
    for (const f of result.outOfDate) console.error(`  ${f}`);
    console.error('Run `npm run registry:build` in apps/cli.');
    process.exit(1);
  }
  console.log(`registry up to date (${result.skills.length} skills)`);
} else {
  console.log(`registry: ${result.written.length} file(s) written, ${result.skills.length} skills`);
}
