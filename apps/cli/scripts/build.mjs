// Bundle the CLI and the workspace packages into dist/cli.js.
// Runtime dependencies stay external and are installed from package.json.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8'));

await build({
  entryPoints: [here('../src/index.ts')],
  outfile: here('../dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  external: Object.keys(pkg.dependencies ?? {}),
  alias: {
    '@agileflow/core': here('../../../packages/core/src/index.ts'),
    '@agileflow/providers': here('../../../packages/providers/src/index.ts'),
    '@agileflow/registry': here('../../../packages/registry/src/index.ts'),
    '@agileflow/evals': here('../../../packages/evals/src/index.ts'),
  },
  logLevel: 'info',
});
