#!/usr/bin/env node
/**
 * Test Result Validator
 *
 * Validates test command outputs for the testing agent.
 * Checks for passing tests and coverage thresholds.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks (testing.md):
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Bash"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/test-result-validator.js"
 */

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const command = context.tool_input?.command || '';
    const result = context.result || '';

    // Only validate test-related commands
    const testCommands = ['npm test', 'npm run test', 'jest', 'pytest', 'cargo test', 'go test', 'vitest', 'mocha'];
    const isTestCommand = testCommands.some(tc => command.includes(tc));

    if (!isTestCommand) {
      process.exit(0); // Not a test command, skip
    }

    const issues = validateTestResult(command, result);

    if (issues.length > 0) {
      console.error(`Test validation issues (command: ${command}):`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Test validation passed for: ${command}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validateTestResult(command, result) {
  const issues = [];
  const resultLower = result.toLowerCase();

  // Check for test failures
  if (resultLower.includes('failed') || resultLower.includes('failure')) {
    // Extract failure count if possible
    const failMatch = result.match(/(\d+)\s*(failed|failure)/i);
    if (failMatch) {
      issues.push(`${failMatch[1]} test(s) failed - fix failing tests before continuing`);
    } else {
      issues.push('Tests failed - fix failing tests before continuing');
    }
  }

  // Check for errors (not test failures, but execution errors)
  if (resultLower.includes('error:') || resultLower.includes('exception')) {
    if (!resultLower.includes('0 errors')) {
      issues.push('Test execution had errors - check test setup');
    }
  }

  // Check for coverage warnings (if coverage was run)
  if (resultLower.includes('coverage')) {
    // Look for coverage percentage
    const coverageMatch = result.match(/(\d+(?:\.\d+)?)\s*%\s*(?:coverage|statements|branches|functions|lines)/i);
    if (coverageMatch) {
      const coverage = parseFloat(coverageMatch[1]);
      if (coverage < 70) {
        issues.push(`Coverage at ${coverage}% is below 70% threshold - add more tests`);
      }
    }
  }

  // Check for "no tests" scenarios
  if (resultLower.includes('no tests') || resultLower.includes('no test') || resultLower.includes('0 tests')) {
    issues.push('No tests were run - ensure test files exist and are properly configured');
  }

  // Check for timeout
  if (resultLower.includes('timeout') || resultLower.includes('timed out')) {
    issues.push('Test timed out - check for infinite loops or slow async operations');
  }

  return issues;
}
