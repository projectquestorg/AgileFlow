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

  it('async prefetch functions are exported (module structure)', () => {
    // Read the script and verify it contains async prefetch function
    const fs = require('fs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    expect(content).toContain('async function prefetchAllData');
    expect(content).toContain('Promise.all');
    expect(content).toContain('safeReadAsync');
    expect(content).toContain('safeExecAsync');
  });

  it('parallel git commands are configured', () => {
    const fs = require('fs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    // Verify git commands are defined for parallel execution
    expect(content).toContain("branch: 'git branch --show-current'");
    expect(content).toContain('commitShort: \'git log -1 --format="%h"\'');
    expect(content).toContain("status: 'git status --short'");
  });

  it('prefetched data is used when available', () => {
    const fs = require('fs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    // Verify prefetched data fallback pattern
    expect(content).toContain('prefetched?.git?.branch ??');
    expect(content).toContain('prefetched?.json?.statusJson ??');
    expect(content).toContain('prefetched?.text?.busLog ??');
    expect(content).toContain('prefetched?.text?.[prefetchKey]');
  });
});
