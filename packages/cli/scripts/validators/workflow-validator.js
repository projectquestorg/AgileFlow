#!/usr/bin/env node
/**
 * Workflow Validator
 *
 * Validates GitHub Actions and other CI/CD workflow files.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks:
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Write"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/workflow-validator.js"
 */

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    // Only validate workflow files
    if (!filePath || !isWorkflowFile(filePath)) {
      process.exit(0);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    const issues = validateWorkflow(filePath);

    if (issues.length > 0) {
      console.error(`Fix these workflow issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Workflow validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function isWorkflowFile(filePath) {
  const normalizedPath = filePath.toLowerCase();

  // GitHub Actions
  if (normalizedPath.includes('.github/workflows/') && normalizedPath.endsWith('.yml')) {
    return true;
  }
  if (normalizedPath.includes('.github/workflows/') && normalizedPath.endsWith('.yaml')) {
    return true;
  }

  // GitLab CI
  if (normalizedPath.endsWith('.gitlab-ci.yml') || normalizedPath.endsWith('.gitlab-ci.yaml')) {
    return true;
  }

  // Circle CI
  if (normalizedPath.includes('.circleci/config.yml')) {
    return true;
  }

  // Azure Pipelines
  if (normalizedPath.endsWith('azure-pipelines.yml') || normalizedPath.endsWith('azure-pipelines.yaml')) {
    return true;
  }

  return false;
}

function validateWorkflow(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const normalizedPath = filePath.toLowerCase();

    // Check for empty file
    if (!content.trim()) {
      issues.push('Workflow file is empty');
      return issues;
    }

    // Basic YAML structure check
    if (!isValidYamlStructure(content)) {
      issues.push('Invalid YAML structure - check indentation and syntax');
      return issues;
    }

    // GitHub Actions specific validation
    if (normalizedPath.includes('.github/workflows/')) {
      issues.push(...validateGitHubActions(content));
    }

    // GitLab CI specific validation
    if (normalizedPath.includes('.gitlab-ci.')) {
      issues.push(...validateGitLabCI(content));
    }

    // General CI/CD security checks
    issues.push(...validateCISecurity(content));

  } catch (e) {
    issues.push(`Read error: ${e.message}`);
  }

  return issues;
}

function isValidYamlStructure(content) {
  // Basic checks for common YAML issues
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for tabs (YAML should use spaces)
    if (line.includes('\t')) {
      return false;
    }

    // Check for invalid indentation (odd spaces at line start are suspicious)
    const leadingSpaces = line.match(/^( *)/)[1].length;
    if (leadingSpaces % 2 !== 0 && line.trim().length > 0) {
      // Could be valid, but flag for review
      console.log(`Note: Unusual indentation (${leadingSpaces} spaces) at line ${i + 1}`);
    }
  }

  return true;
}

function validateGitHubActions(content) {
  const issues = [];

  // Check for 'on' trigger
  if (!content.includes('on:')) {
    issues.push('GitHub Actions workflow must have an "on:" trigger section');
  }

  // Check for jobs section
  if (!content.includes('jobs:')) {
    issues.push('GitHub Actions workflow must have a "jobs:" section');
  }

  // Check for runs-on in jobs
  if (content.includes('jobs:') && !content.includes('runs-on:')) {
    issues.push('Jobs must specify "runs-on:" for the runner');
  }

  // Check for deprecated set-output
  if (content.includes('::set-output')) {
    issues.push('::set-output is deprecated - use $GITHUB_OUTPUT instead');
  }

  // Check for deprecated save-state
  if (content.includes('::save-state')) {
    issues.push('::save-state is deprecated - use $GITHUB_STATE instead');
  }

  // Check for hardcoded action versions without SHA
  const actionVersions = content.match(/uses:\s*[\w-]+\/[\w-]+@v?\d+/gi) || [];
  if (actionVersions.length > 0) {
    console.log('Note: Consider pinning actions to specific SHA for security');
  }

  // Check for potentially dangerous permissions
  if (content.includes('permissions: write-all') || content.includes('permissions:\n  contents: write')) {
    console.log('Note: Broad write permissions detected - ensure this is necessary');
  }

  // Check for secrets usage
  if (content.includes('${{ secrets.') && !content.includes('secrets:')) {
    // Using secrets but didn't declare them - common but worth noting
  }

  return issues;
}

function validateGitLabCI(content) {
  const issues = [];

  // Check for stages
  if (!content.includes('stages:') && !content.includes('stage:')) {
    console.log('Note: Consider defining stages for better pipeline organization');
  }

  // Check for image
  if (!content.includes('image:')) {
    console.log('Note: No default image specified - jobs should specify their image');
  }

  return issues;
}

function validateCISecurity(content) {
  const issues = [];

  // Check for hardcoded secrets (common patterns)
  const secretPatterns = [
    { pattern: /api[_-]?key\s*[:=]\s*["'][^$]/i, message: 'Possible hardcoded API key detected' },
    { pattern: /password\s*[:=]\s*["'][^$]/i, message: 'Possible hardcoded password detected' },
    { pattern: /secret\s*[:=]\s*["'][^$]/i, message: 'Possible hardcoded secret detected' },
    { pattern: /token\s*[:=]\s*["'][^$]/i, message: 'Possible hardcoded token detected' },
  ];

  for (const { pattern, message } of secretPatterns) {
    if (pattern.test(content)) {
      issues.push(`${message} - use secrets/environment variables instead`);
    }
  }

  // Check for curl | bash pattern (security risk)
  if (content.includes('curl') && content.includes('| bash')) {
    issues.push('curl | bash pattern detected - this is a security risk, use verified installation methods');
  }

  // Check for npm install without lockfile
  if (content.includes('npm install') && !content.includes('npm ci')) {
    console.log('Note: Consider using "npm ci" instead of "npm install" for reproducible builds');
  }

  return issues;
}
