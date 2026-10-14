// Bundle the CLI and the workspace packages into dist/cli.js plus lazily
// loaded chunks (dist/chunk-*.js): each command's code and dependencies (zod,
// yaml, clack, ...) load only when that command runs, so `--version`, `list`,
// and `check` never parse eval, migrate, or work code. Chunks sit next to
// cli.js because version.ts reads ../package.json relative to its own file.
// Runtime dependencies stay external and are installed from package.json.
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8'));

// Stale chunks from an earlier build would ship with the package.
rmSync(here('../dist'), { recursive: true, force: true });

// The workspace sources have no import-time side effects, so a command's chunk
// keeps only the modules it uses (e.g. `list` does not pull v4 migration code
// through the @agileflow/core barrel).
const repoRoot = here('../../../');
const sideEffectFree = {
  name: 'workspace-side-effect-free',
  setup(b) {
    b.onResolve({ filter: /^(\.|@agileflow\/)/ }, async (args) => {
      if (args.pluginData?.inner) return undefined;
      const r = await b.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer, pluginData: { inner: true } });
      if (r.errors.length) return { errors: r.errors };
      const inWorkspace = r.path.startsWith(repoRoot) && !r.path.includes(`${sep}node_modules${sep}`);
      return { path: r.path, namespace: r.namespace, external: r.external, sideEffects: inWorkspace ? false : r.sideEffects };
    });
  },
};

await build({
  entryPoints: { cli: here('../src/index.ts') },
  outdir: here('../dist'),
  splitting: true,
  chunkNames: 'chunk-[hash]',
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
    '@agileflow/work': here('../../../packages/work/src/index.ts'),
  },
  plugins: [sideEffectFree],
  logLevel: 'info',
});
