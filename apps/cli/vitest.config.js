/**
 * Vitest config — Phase 1 skeleton.
 * @see https://vitest.dev/config/
 */
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['tests/**', 'bin/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
