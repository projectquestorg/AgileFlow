/**
 * Performance tests for obtain-context.js
 *
 * Tests that parallel file pre-fetching improves performance.
 */

const path = require('path');
const { execSync, exec } = require('child_process');

describe('obtain-context.js performance', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'obtain-context.js');

  // Skip performance tests in CI (they're flaky with variable load)
  const itSkipInCI = process.env.CI ? it.skip : it;

  it('script runs without errors', () => {
    expect(() => {
      execSync(`node "${scriptPath}" test`, {
        encoding: 'utf8',
        timeout: 10000,
        cwd: process.cwd(),
      });
    }).not.toThrow();
  });

  it('script produces output', () => {
    const output = execSync(`node "${scriptPath}" test`, {
      encoding: 'utf8',
      timeout: 10000,
      cwd: process.cwd(),
    });

    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Context');
  });

  itSkipInCI(
    'script completes in reasonable time (< 1 second)',
    async () => {
      const start = Date.now();

      await new Promise((resolve, reject) => {
        exec(`node "${scriptPath}" test`, { timeout: 5000 }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });

      const elapsed = Date.now() - start;

      // Should complete in under 1 second (with margin for CI variance)
      expect(elapsed).toBeLessThan(1000);
    },
    10000
  );

  it('async prefetch functions are in loader module', () => {
    // After US-0148 refactoring, these are in context-loader.js
    const fs = require('fs');
    const loaderPath = path.join(__dirname, '..', '..', 'scripts', 'lib', 'context-loader.js');
    const content = fs.readFileSync(loaderPath, 'utf8');

    expect(content).toContain('async function prefetchAllData');
    expect(content).toContain('Promise.all');
    expect(content).toContain('safeReadAsync');
    expect(content).toContain('safeExecAsync');
  });

  it('parallel git commands are configured in loader', () => {
    const fs = require('fs');
    const loaderPath = path.join(__dirname, '..', '..', 'scripts', 'lib', 'context-loader.js');
    const content = fs.readFileSync(loaderPath, 'utf8');

    // Verify git commands are defined for parallel execution
    expect(content).toContain("branch: 'git branch --show-current'");
    expect(content).toContain('commitShort: \'git log -1 --format="%h"\'');
    expect(content).toContain("status: 'git status --short'");
  });

  it('prefetched data is used in formatter module', () => {
    const fs = require('fs');
    const formatterPath = path.join(
      __dirname,
      '..',
      '..',
      'scripts',
      'lib',
      'context-formatter.js'
    );
    const content = fs.readFileSync(formatterPath, 'utf8');

    // Verify prefetched data fallback pattern
    expect(content).toContain('prefetched?.git?.branch ??');
    expect(content).toContain('prefetched?.json?.statusJson ??');
    expect(content).toContain('prefetched?.text?.busLog ??');
    expect(content).toContain('prefetched?.text?.[prefetchKey]');
  });

  it('orchestrator imports loader and formatter modules', () => {
    const fs = require('fs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    // Verify proper module imports in orchestrator
    expect(content).toContain("require('./lib/context-loader')");
    expect(content).toContain("require('./lib/context-formatter')");
    expect(content).toContain('prefetchAllData');
    expect(content).toContain('generateSummary');
    expect(content).toContain('generateFullContent');
  });
});
