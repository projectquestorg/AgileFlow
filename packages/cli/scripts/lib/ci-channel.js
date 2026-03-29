/**
 * ci-channel.js - CI Provider Detection & Channel Setup (EP-0049, US-0437)
 *
 * Auto-detects CI provider (GitHub Actions, GitLab CI, etc.) and generates
 * copy-paste workflow snippets for one-line CI integration.
 *
 * Usage:
 *   const { detectCIProvider, generateCISnippet, setupCIChannel } = require('./lib/ci-channel');
 *
 *   const provider = detectCIProvider(rootDir);
 *   // => { provider: 'github-actions', confidence: 'high', workflows: ['test.yml'] }
 *
 *   const snippet = generateCISnippet(provider);
 *   // => YAML string to add to workflow
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CI PROVIDER DETECTION
// ============================================================================

/**
 * Detect the CI provider used by a project.
 *
 * Checks for common CI configuration files and directories.
 *
 * @param {string} rootDir - Project root directory
 * @returns {{ provider: string, confidence: string, workflows: string[], configPath: string }}
 */
function detectCIProvider(rootDir) {
  const checks = [
    {
      provider: 'github-actions',
      dir: '.github/workflows',
      pattern: /\.ya?ml$/,
      confidence: 'high',
    },
    {
      provider: 'gitlab-ci',
      file: '.gitlab-ci.yml',
      confidence: 'high',
    },
    {
      provider: 'circleci',
      file: '.circleci/config.yml',
      confidence: 'high',
    },
    {
      provider: 'jenkins',
      file: 'Jenkinsfile',
      confidence: 'medium',
    },
    {
      provider: 'travis',
      file: '.travis.yml',
      confidence: 'medium',
    },
  ];

  for (const check of checks) {
    if (check.dir) {
      const dirPath = path.join(rootDir, check.dir);
      if (fs.existsSync(dirPath)) {
        let workflows = [];
        try {
          workflows = fs.readdirSync(dirPath).filter(f => check.pattern.test(f));
        } catch {
          // Can't read directory
        }
        return {
          provider: check.provider,
          confidence: check.confidence,
          workflows,
          configPath: dirPath,
        };
      }
    }

    if (check.file) {
      const filePath = path.join(rootDir, check.file);
      if (fs.existsSync(filePath)) {
        return {
          provider: check.provider,
          confidence: check.confidence,
          workflows: [check.file],
          configPath: filePath,
        };
      }
    }
  }

  return { provider: 'unknown', confidence: 'none', workflows: [], configPath: '' };
}

// ============================================================================
// SNIPPET GENERATION
// ============================================================================

/**
 * Generate a CI workflow snippet for channel integration.
 *
 * Produces a copy-paste YAML snippet that sends failure events
 * to the AgileFlow channel via localhost (no external infrastructure needed).
 *
 * @param {{ provider: string }} detection - CI detection result
 * @param {object} [options] - Options
 * @param {number} [options.port] - Channel ingress port (default: 8432)
 * @returns {{ ok: boolean, snippet?: string, instructions?: string, error?: string }}
 */
function generateCISnippet(detection, options = {}) {
  const port = options.port || 8432;

  switch (detection.provider) {
    case 'github-actions':
      return generateGitHubActionsSnippet(port);

    case 'gitlab-ci':
      return generateGitLabSnippet(port);

    default:
      return generateGenericSnippet(detection.provider, port);
  }
}

/**
 * @private
 */
function generateGitHubActionsSnippet(port) {
  const snippet = `    # AgileFlow CI Channel - sends failure events to your warm session
    - name: Notify AgileFlow
      if: failure()
      run: |
        curl -sf http://localhost:${port}/ci \\
          -H "Content-Type: application/json" \\
          -d '{
            "status": "failure",
            "workflow": "\${{ github.workflow }}",
            "branch": "\${{ github.ref_name }}",
            "run_id": "\${{ github.run_id }}",
            "run_url": "\${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}"
          }' || true`;

  return {
    ok: true,
    snippet,
    instructions: [
      'Add this step to your GitHub Actions workflow file(s):',
      '',
      '1. Open your workflow YAML (e.g., .github/workflows/test.yml)',
      '2. Add the step below AFTER your test/build steps',
      '3. The step only runs on failure (if: failure())',
      '4. It communicates via localhost - no external webhooks needed',
      '',
      'Note: This only works when a warm Claude Code session is running',
      'alongside your CI. For remote CI, use a webhook channel instead.',
    ].join('\n'),
  };
}

/**
 * @private
 */
function generateGitLabSnippet(port) {
  const snippet = `# AgileFlow CI Channel - add to your .gitlab-ci.yml
agileflow_notify:
  stage: .post
  when: on_failure
  script:
    - |
      curl -sf http://localhost:${port}/ci \\
        -H "Content-Type: application/json" \\
        -d "{
          \\"status\\": \\"failure\\",
          \\"workflow\\": \\"$CI_PIPELINE_NAME\\",
          \\"branch\\": \\"$CI_COMMIT_BRANCH\\",
          \\"run_id\\": \\"$CI_PIPELINE_ID\\",
          \\"run_url\\": \\"$CI_PIPELINE_URL\\"
        }" || true`;

  return {
    ok: true,
    snippet,
    instructions: 'Add this job to your .gitlab-ci.yml. It runs after any failed job.',
  };
}

/**
 * @private
 */
function generateGenericSnippet(provider, port) {
  const snippet = `# AgileFlow CI Channel - generic integration
# Add this after your test/build step:
curl -sf http://localhost:${port}/ci \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "failure",
    "workflow": "YOUR_WORKFLOW_NAME",
    "branch": "YOUR_BRANCH",
    "error": "FAILURE_DETAILS"
  }' || true`;

  return {
    ok: true,
    snippet,
    instructions: `Detected CI provider: ${provider || 'unknown'}. Adapt this curl command for your CI system.`,
  };
}

// ============================================================================
// CHANNEL SETUP
// ============================================================================

/**
 * Set up the CI channel end-to-end.
 *
 * 1. Detects CI provider
 * 2. Registers the channel in channel-adapter
 * 3. Generates the workflow snippet
 * 4. Returns everything the user needs
 *
 * @param {string} rootDir - Project root
 * @param {object} [options] - Options
 * @param {string} [options.trustLevel] - Trust level (default: 'observe')
 * @param {number} [options.port] - Channel port (default: 8432)
 * @returns {{ ok: boolean, provider?: object, snippet?: string, instructions?: string, error?: string }}
 */
function setupCIChannel(rootDir, options = {}) {
  try {
    const channelAdapter = require('./channel-adapter');

    // 1. Detect CI provider
    const detection = detectCIProvider(rootDir);

    // 2. Register channel
    const regResult = channelAdapter.registerChannel(rootDir, 'ci', {
      source: 'ci',
      trustLevel: options.trustLevel || 'observe',
      provider: detection.provider,
      workflows: detection.workflows,
    });

    if (!regResult.ok) {
      return { ok: false, error: `Failed to register CI channel: ${regResult.error}` };
    }

    // 3. Generate snippet
    const snippetResult = generateCISnippet(detection, { port: options.port });

    return {
      ok: true,
      provider: detection,
      snippet: snippetResult.snippet,
      instructions: snippetResult.instructions,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  detectCIProvider,
  generateCISnippet,
  setupCIChannel,
};
