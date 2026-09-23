import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@agileflow/core': pkg('core'),
      '@agileflow/providers': pkg('providers'),
      '@agileflow/registry': pkg('registry'),
      '@agileflow/evals': pkg('evals'),
    },
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['packages/*/test/**/*.test.ts', 'apps/cli/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
