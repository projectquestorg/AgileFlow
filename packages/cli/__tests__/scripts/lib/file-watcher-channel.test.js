/**
 * Tests for file-watcher-channel.js and automation-registry ON_EVENT/ON_CHANNEL (EP-0049, US-0439)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('file-watcher-channel', () => {
  const {
    shouldIgnore,
    setupFileWatcherChannel,
    DEFAULT_DEBOUNCE_MS,
    IGNORE_PATTERNS,
  } = require('../../../scripts/lib/file-watcher-channel');

  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-test-'));
    fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('shouldIgnore', () => {
    it('ignores node_modules', () => {
      expect(shouldIgnore('node_modules/foo/bar.js')).toBe(true);
    });

    it('ignores .git directory', () => {
      expect(shouldIgnore('.git/objects/abc')).toBe(true);
    });

    it('ignores .agileflow directory', () => {
      expect(shouldIgnore('.agileflow/scripts/foo.js')).toBe(true);
    });

    it('ignores .claude directory', () => {
      expect(shouldIgnore('.claude/settings.json')).toBe(true);
    });

    it('ignores .DS_Store', () => {
      expect(shouldIgnore('.DS_Store')).toBe(true);
    });

    it('ignores swap files', () => {
      expect(shouldIgnore('file.js.swp')).toBe(true);
      expect(shouldIgnore('file.js~')).toBe(true);
    });

    it('does not ignore normal source files', () => {
      expect(shouldIgnore('src/index.js')).toBe(false);
      expect(shouldIgnore('package.json')).toBe(false);
      expect(shouldIgnore('README.md')).toBe(false);
    });
  });

  describe('setupFileWatcherChannel', () => {
    it('sets up channel for valid directory', () => {
      const watchDir = path.join(tempDir, 'src');
      fs.mkdirSync(watchDir);

      const result = setupFileWatcherChannel(tempDir, watchDir);
      expect(result.ok).toBe(true);
    });

    it('registers in channel config', () => {
      const watchDir = path.join(tempDir, 'src');
      fs.mkdirSync(watchDir);

      setupFileWatcherChannel(tempDir, watchDir);

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels['file-watcher']).toBeDefined();
      expect(config.channels['file-watcher'].source).toBe('file-watcher');
    });

    it('rejects missing watchDir', () => {
      const result = setupFileWatcherChannel(tempDir, '');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects non-existent directory', () => {
      const result = setupFileWatcherChannel(tempDir, '/nonexistent/path');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('rejects file path (not directory)', () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      const result = setupFileWatcherChannel(tempDir, filePath);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not a directory');
    });

    it('respects custom name', () => {
      const watchDir = path.join(tempDir, 'src');
      fs.mkdirSync(watchDir);

      setupFileWatcherChannel(tempDir, watchDir, { name: 'my-watcher' });

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels['my-watcher']).toBeDefined();
    });
  });

  describe('constants', () => {
    it('has reasonable debounce default', () => {
      expect(DEFAULT_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
      expect(DEFAULT_DEBOUNCE_MS).toBeLessThanOrEqual(2000);
    });

    it('has ignore patterns array', () => {
      expect(Array.isArray(IGNORE_PATTERNS)).toBe(true);
      expect(IGNORE_PATTERNS.length).toBeGreaterThan(3);
    });
  });
});

describe('automation-registry ON_EVENT/ON_CHANNEL', () => {
  const { AutomationRegistry } = require('../../../scripts/lib/automation-registry');

  let tempDir;
  let registry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-reg-test-'));
    fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
    registry = new AutomationRegistry({ rootDir: tempDir });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('ON_EVENT automations are never due via polling', () => {
    registry.set('ci-autofix', {
      name: 'CI Auto-Fix',
      enabled: true,
      command: '/agileflow:automate ACTION=ci-fix',
      schedule: { type: 'on_event', event: 'ci_failure', channel: 'ci-events' },
    });

    const due = registry.getDue();
    const ids = due.map(d => d.id || d.name);
    expect(ids).not.toContain('ci-autofix');
  });

  it('ON_CHANNEL automations are never due via polling', () => {
    registry.set('deploy-notify', {
      name: 'Deploy Notification',
      enabled: true,
      command: '/agileflow:status ACTION=deploy-log',
      schedule: { type: 'on_channel', channel: 'deploy-events' },
    });

    const due = registry.getDue();
    const ids = due.map(d => d.id || d.name);
    expect(ids).not.toContain('deploy-notify');
  });

  it('getEventTriggered matches ON_EVENT by event type + channel', () => {
    registry.set('ci-autofix', {
      name: 'CI Auto-Fix',
      enabled: true,
      command: '/agileflow:automate ACTION=ci-fix',
      schedule: { type: 'on_event', event: 'ci_failure', channel: 'ci-events' },
    });

    const matches = registry.getEventTriggered({
      event_type: 'ci_failure',
      channel: 'ci-events',
    });

    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('CI Auto-Fix');
  });

  it('getEventTriggered does not match wrong event type', () => {
    registry.set('ci-autofix', {
      name: 'CI Auto-Fix',
      enabled: true,
      command: '/agileflow:automate ACTION=ci-fix',
      schedule: { type: 'on_event', event: 'ci_failure', channel: 'ci-events' },
    });

    const matches = registry.getEventTriggered({
      event_type: 'ci_success',
      channel: 'ci-events',
    });

    expect(matches.length).toBe(0);
  });

  it('getEventTriggered matches ON_CHANNEL by channel name', () => {
    registry.set('deploy-notify', {
      name: 'Deploy Notification',
      enabled: true,
      command: '/agileflow:status ACTION=deploy-log',
      schedule: { type: 'on_channel', channel: 'deploy-events' },
    });

    const matches = registry.getEventTriggered({
      event_type: 'anything',
      channel: 'deploy-events',
    });

    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Deploy Notification');
  });

  it('getEventTriggered skips disabled automations', () => {
    registry.set('disabled-auto', {
      name: 'Disabled',
      enabled: false,
      command: 'echo disabled',
      schedule: { type: 'on_event', event: 'ci_failure', channel: 'ci-events' },
    });

    const matches = registry.getEventTriggered({
      event_type: 'ci_failure',
      channel: 'ci-events',
    });

    expect(matches.length).toBe(0);
  });

  it('getEventTriggered returns empty for null event', () => {
    expect(registry.getEventTriggered(null)).toEqual([]);
    expect(registry.getEventTriggered(undefined)).toEqual([]);
  });
});
