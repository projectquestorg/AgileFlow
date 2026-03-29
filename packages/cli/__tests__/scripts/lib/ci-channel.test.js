/**
 * Tests for ci-channel.js (EP-0049, US-0437)
 *
 * Tests cover:
 * - detectCIProvider() - GitHub Actions, GitLab, CircleCI, Jenkins, Travis, unknown
 * - generateCISnippet() - GitHub Actions, GitLab, generic snippets
 * - setupCIChannel() - end-to-end channel setup
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  detectCIProvider,
  generateCISnippet,
  setupCIChannel,
} = require('../../../scripts/lib/ci-channel');

describe('ci-channel', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-channel-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ========================================================================
  // detectCIProvider()
  // ========================================================================

  describe('detectCIProvider', () => {
    it('detects GitHub Actions', () => {
      const workflowDir = path.join(tempDir, '.github', 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.writeFileSync(path.join(workflowDir, 'test.yml'), 'name: Test');
      fs.writeFileSync(path.join(workflowDir, 'deploy.yaml'), 'name: Deploy');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('github-actions');
      expect(result.confidence).toBe('high');
      expect(result.workflows).toContain('test.yml');
      expect(result.workflows).toContain('deploy.yaml');
    });

    it('detects GitLab CI', () => {
      fs.writeFileSync(path.join(tempDir, '.gitlab-ci.yml'), 'stages:');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('gitlab-ci');
      expect(result.confidence).toBe('high');
    });

    it('detects CircleCI', () => {
      const circleDir = path.join(tempDir, '.circleci');
      fs.mkdirSync(circleDir, { recursive: true });
      fs.writeFileSync(path.join(circleDir, 'config.yml'), 'version: 2.1');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('circleci');
      expect(result.confidence).toBe('high');
    });

    it('detects Jenkins', () => {
      fs.writeFileSync(path.join(tempDir, 'Jenkinsfile'), 'pipeline {}');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('jenkins');
      expect(result.confidence).toBe('medium');
    });

    it('detects Travis CI', () => {
      fs.writeFileSync(path.join(tempDir, '.travis.yml'), 'language: node_js');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('travis');
      expect(result.confidence).toBe('medium');
    });

    it('returns unknown when no CI found', () => {
      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('unknown');
      expect(result.confidence).toBe('none');
      expect(result.workflows).toEqual([]);
    });

    it('prioritizes GitHub Actions over other providers', () => {
      // Create both GitHub Actions and GitLab CI
      const workflowDir = path.join(tempDir, '.github', 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.writeFileSync(path.join(workflowDir, 'test.yml'), 'name: Test');
      fs.writeFileSync(path.join(tempDir, '.gitlab-ci.yml'), 'stages:');

      const result = detectCIProvider(tempDir);
      expect(result.provider).toBe('github-actions');
    });
  });

  // ========================================================================
  // generateCISnippet()
  // ========================================================================

  describe('generateCISnippet', () => {
    it('generates GitHub Actions snippet', () => {
      const result = generateCISnippet({ provider: 'github-actions' });
      expect(result.ok).toBe(true);
      expect(result.snippet).toContain('if: failure()');
      expect(result.snippet).toContain('curl');
      expect(result.snippet).toContain('localhost');
      expect(result.snippet).toContain('github.workflow');
      expect(result.instructions).toContain('GitHub Actions');
    });

    it('generates GitLab CI snippet', () => {
      const result = generateCISnippet({ provider: 'gitlab-ci' });
      expect(result.ok).toBe(true);
      expect(result.snippet).toContain('on_failure');
      expect(result.snippet).toContain('curl');
      expect(result.snippet).toContain('CI_PIPELINE');
    });

    it('generates generic snippet for unknown providers', () => {
      const result = generateCISnippet({ provider: 'unknown' });
      expect(result.ok).toBe(true);
      expect(result.snippet).toContain('curl');
      expect(result.snippet).toContain('localhost');
    });

    it('uses custom port when specified', () => {
      const result = generateCISnippet({ provider: 'github-actions' }, { port: 9999 });
      expect(result.snippet).toContain('9999');
      expect(result.snippet).not.toContain('8432');
    });

    it('defaults to port 8432', () => {
      const result = generateCISnippet({ provider: 'github-actions' });
      expect(result.snippet).toContain('8432');
    });
  });

  // ========================================================================
  // setupCIChannel()
  // ========================================================================

  describe('setupCIChannel', () => {
    it('sets up CI channel end-to-end', () => {
      // Create GitHub Actions directory
      const workflowDir = path.join(tempDir, '.github', 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.writeFileSync(path.join(workflowDir, 'test.yml'), 'name: Test');

      // Create required docs directory
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      const result = setupCIChannel(tempDir);
      expect(result.ok).toBe(true);
      expect(result.provider.provider).toBe('github-actions');
      expect(result.snippet).toBeDefined();
      expect(result.instructions).toBeDefined();
    });

    it('registers channel in channel config', () => {
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      setupCIChannel(tempDir);

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels.ci).toBeDefined();
      expect(config.channels.ci.source).toBe('ci');
      expect(config.channels.ci.trustLevel).toBe('observe');
    });

    it('respects custom trust level', () => {
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      setupCIChannel(tempDir, { trustLevel: 'react' });

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels.ci.trustLevel).toBe('react');
    });

    it('works with unknown CI provider', () => {
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      const result = setupCIChannel(tempDir);
      expect(result.ok).toBe(true);
      expect(result.provider.provider).toBe('unknown');
      expect(result.snippet).toContain('curl');
    });
  });
});
