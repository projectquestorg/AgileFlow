import { defineConfig } from 'vitest/config';
import os from 'node:os';
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
      '@agileflow/work': pkg('work'),
    },
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['packages/*/test/**/*.test.ts', 'packages/*/tests/**/*.test.ts', 'apps/cli/test/**/*.test.ts'],
    environment: 'node',
    // Tests must not depend on the developer's git setup (autocrlf, hooks,
    // signing, URL rewrites). Each test that commits sets its own identity.
    env: {
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'AgileFlow Test',
      GIT_AUTHOR_EMAIL: 'test@agileflow.invalid',
      GIT_COMMITTER_NAME: 'AgileFlow Test',
      GIT_COMMITTER_EMAIL: 'test@agileflow.invalid',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
