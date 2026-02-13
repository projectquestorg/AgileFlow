/**
 * Tests for bus-utils.js
 *
 * Tests cover:
 * - getLineCount() - empty file, normal file, missing file
 * - shouldRotate() - below threshold, above threshold, missing file
 * - ensureArchiveDir() - creates directory, already exists
 * - getArchiveFilePath() - correct format with date
 * - readJSONLFile() - valid JSONL, malformed lines, missing file
 * - writeJSONLFile() - write mode, append mode, directory creation
 * - rotateLog() - below threshold (no-op), above threshold (splits correctly)
 * - getLogStats() - with and without archives
 *
 * Uses real temp directories (not mocked fs).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test
const {
  getLineCount,
  shouldRotate,
  ensureArchiveDir,
  getArchiveFilePath,
  readJSONLFile,
  writeJSONLFile,
  rotateLog,
  getLogStats,
} = require('../../../scripts/lib/bus-utils');

describe('bus-utils', () => {
  let tempDir;

  beforeAll(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-utils-test-'));
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getLineCount', () => {
    it('returns 0 for missing file', () => {
      const logPath = path.join(tempDir, 'missing.jsonl');
      const count = getLineCount(logPath);
      expect(count).toBe(0);
    });

    it('returns 0 for empty file', () => {
      const logPath = path.join(tempDir, 'empty.jsonl');
      fs.writeFileSync(logPath, '');
      const count = getLineCount(logPath);
      expect(count).toBe(0);
    });

    it('counts lines in normal JSONL file', () => {
      const logPath = path.join(tempDir, 'normal.jsonl');
      const content = '{"id":1}\n{"id":2}\n{"id":3}\n';
      fs.writeFileSync(logPath, content);
      const count = getLineCount(logPath);
      expect(count).toBe(3);
    });

    it('handles file without trailing newline', () => {
      const logPath = path.join(tempDir, 'no-trailing.jsonl');
      const content = '{"id":1}\n{"id":2}\n{"id":3}';
      fs.writeFileSync(logPath, content);
      const count = getLineCount(logPath);
      expect(count).toBe(3);
    });

    it('ignores blank lines', () => {
      const logPath = path.join(tempDir, 'with-blanks.jsonl');
      const content = '{"id":1}\n\n{"id":2}\n\n\n{"id":3}\n';
      fs.writeFileSync(logPath, content);
      const count = getLineCount(logPath);
      expect(count).toBe(3);
    });
  });

  describe('shouldRotate', () => {
    it('returns false when below threshold', () => {
      const logPath = path.join(tempDir, 'below-threshold.jsonl');
      const content = '{"id":1}\n{"id":2}\n';
      fs.writeFileSync(logPath, content);
      const result = shouldRotate(logPath, 100);
      expect(result).toBe(false);
    });

    it('returns true when above threshold', () => {
      const logPath = path.join(tempDir, 'above-threshold.jsonl');
      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);
      const result = shouldRotate(logPath, 100);
      expect(result).toBe(true);
    });

    it('returns false for missing file', () => {
      const logPath = path.join(tempDir, 'missing-rotate.jsonl');
      const result = shouldRotate(logPath, 100);
      expect(result).toBe(false);
    });

    it('uses default threshold of 1000', () => {
      const logPath = path.join(tempDir, 'default-threshold.jsonl');
      let content = '';
      for (let i = 0; i < 500; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);
      const result = shouldRotate(logPath);
      expect(result).toBe(false);
    });
  });

  describe('ensureArchiveDir', () => {
    it('creates archive directory if missing', () => {
      const logPath = path.join(tempDir, 'test-log', 'log.jsonl');
      const archiveDir = path.join(tempDir, 'test-log', 'archive');

      const result = ensureArchiveDir(logPath);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(archiveDir)).toBe(true);
    });

    it('returns ok=true if archive directory already exists', () => {
      const logPath = path.join(tempDir, 'existing-log', 'log.jsonl');
      const archiveDir = path.join(tempDir, 'existing-log', 'archive');

      fs.mkdirSync(archiveDir, { recursive: true });
      const result = ensureArchiveDir(logPath);

      expect(result.ok).toBe(true);
      expect(result.archiveDir).toBe(archiveDir);
    });

    it('returns archiveDir path in result', () => {
      const logPath = path.join(tempDir, 'check-path', 'log.jsonl');
      const result = ensureArchiveDir(logPath);

      expect(result.ok).toBe(true);
      expect(result.archiveDir).toContain('archive');
      expect(path.dirname(result.archiveDir)).toBe(path.dirname(logPath));
    });
  });

  describe('getArchiveFilePath', () => {
    it('generates correct archive filename with YYYY-MM format', () => {
      const logPath = path.join(tempDir, 'archive-test', 'log.jsonl');
      const date = new Date('2026-02-15');

      const filePath = getArchiveFilePath(logPath, date);

      expect(filePath).toContain('2026-02-archive.jsonl');
      expect(path.basename(filePath)).toBe('2026-02-archive.jsonl');
    });

    it('pads month with leading zero', () => {
      const logPath = path.join(tempDir, 'pad-test', 'log.jsonl');
      const date = new Date('2026-01-15');

      const filePath = getArchiveFilePath(logPath, date);

      expect(filePath).toContain('2026-01-archive.jsonl');
    });

    it('places archive in archive subdirectory', () => {
      const logPath = path.join(tempDir, 'subdir-test', 'log.jsonl');
      const filePath = getArchiveFilePath(logPath);

      expect(filePath).toContain('archive');
      expect(path.basename(path.dirname(filePath))).toBe('archive');
    });

    it('uses current date when not specified', () => {
      const logPath = path.join(tempDir, 'current-date-test', 'log.jsonl');
      const filePath = getArchiveFilePath(logPath);

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      expect(filePath).toContain(`${year}-${month}-archive.jsonl`);
    });
  });

  describe('readJSONLFile', () => {
    it('returns empty array for missing file', () => {
      const filePath = path.join(tempDir, 'missing-read.jsonl');
      const result = readJSONLFile(filePath);

      expect(result.ok).toBe(true);
      expect(result.lines).toEqual([]);
    });

    it('reads valid JSONL file', () => {
      const filePath = path.join(tempDir, 'valid.jsonl');
      const lines = [
        { id: 1, msg: 'first' },
        { id: 2, msg: 'second' },
      ];
      fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'));

      const result = readJSONLFile(filePath);

      expect(result.ok).toBe(true);
      expect(result.lines).toEqual(lines);
    });

    it('skips malformed JSON lines', () => {
      const filePath = path.join(tempDir, 'malformed.jsonl');
      const content = '{"id":1}\ninvalid json line\n{"id":2}\n';
      fs.writeFileSync(filePath, content);

      const result = readJSONLFile(filePath);

      expect(result.ok).toBe(true);
      expect(result.lines.length).toBe(2);
      expect(result.lines[0].id).toBe(1);
      expect(result.lines[1].id).toBe(2);
    });

    it('ignores blank lines', () => {
      const filePath = path.join(tempDir, 'blank-lines.jsonl');
      const content = '{"id":1}\n\n{"id":2}\n\n';
      fs.writeFileSync(filePath, content);

      const result = readJSONLFile(filePath);

      expect(result.ok).toBe(true);
      expect(result.lines.length).toBe(2);
    });

    it('handles file with trailing newline', () => {
      const filePath = path.join(tempDir, 'trailing.jsonl');
      const content = '{"id":1}\n{"id":2}\n';
      fs.writeFileSync(filePath, content);

      const result = readJSONLFile(filePath);

      expect(result.ok).toBe(true);
      expect(result.lines.length).toBe(2);
    });
  });

  describe('writeJSONLFile', () => {
    it('writes to new file (write mode)', () => {
      const filePath = path.join(tempDir, 'write-new.jsonl');
      const lines = [{ id: 1 }, { id: 2 }];

      const result = writeJSONLFile(filePath, lines, { append: false });

      expect(result.ok).toBe(true);
      expect(result.lineCount).toBe(2);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('{"id":1}\n{"id":2}');
    });

    it('overwrites existing file (write mode)', () => {
      const filePath = path.join(tempDir, 'write-overwrite.jsonl');
      fs.writeFileSync(filePath, '{"old":"data"}\n');

      const lines = [{ id: 1 }, { id: 2 }];
      const result = writeJSONLFile(filePath, lines, { append: false });

      expect(result.ok).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toContain('old');
    });

    it('appends to existing file (append mode)', () => {
      const filePath = path.join(tempDir, 'append-existing.jsonl');
      fs.writeFileSync(filePath, '{"id":1}\n');

      const lines = [{ id: 2 }, { id: 3 }];
      const result = writeJSONLFile(filePath, lines, { append: true });

      expect(result.ok).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      const fileLines = content.split('\n').filter(l => l.trim());
      expect(fileLines.length).toBe(3);
    });

    it('uses append mode by default', () => {
      const filePath = path.join(tempDir, 'append-default.jsonl');
      fs.writeFileSync(filePath, '{"id":1}\n');

      const lines = [{ id: 2 }];
      writeJSONLFile(filePath, lines);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('"id":1');
      expect(content).toContain('"id":2');
    });

    it('creates missing directory structure', () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'path', 'log.jsonl');
      const lines = [{ id: 1 }];

      const result = writeJSONLFile(filePath, lines, { append: false });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('returns lineCount in result', () => {
      const filePath = path.join(tempDir, 'count-result.jsonl');
      const lines = [{ id: 1 }, { id: 2 }, { id: 3 }];

      const result = writeJSONLFile(filePath, lines);

      expect(result.lineCount).toBe(3);
    });
  });

  describe('rotateLog', () => {
    it('does nothing when below threshold', () => {
      const logPath = path.join(tempDir, 'rotate-below', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 50; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      const result = rotateLog(logPath, { threshold: 100 });

      expect(result.ok).toBe(true);
      expect(result.archivedCount).toBe(0);
      expect(result.message).toContain('No rotation needed');
    });

    it('archives old messages and keeps recent ones', () => {
      const logPath = path.join(tempDir, 'rotate-archive', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      const result = rotateLog(logPath, { keepRecent: 50, threshold: 100 });

      expect(result.ok).toBe(true);
      expect(result.archivedCount).toBe(100);
      expect(result.keptCount).toBe(50);
    });

    it('creates archive directory during rotation', () => {
      const logPath = path.join(tempDir, 'rotate-create-archive', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      const archiveDir = path.join(path.dirname(logPath), 'archive');
      expect(fs.existsSync(archiveDir)).toBe(false);

      rotateLog(logPath, { keepRecent: 50, threshold: 100 });

      expect(fs.existsSync(archiveDir)).toBe(true);
    });

    it('appends to existing archive file', () => {
      const logPath = path.join(tempDir, 'rotate-append-archive', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      const archiveDir = path.join(path.dirname(logPath), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      // Create archive with existing data
      const archiveFile = path.join(archiveDir, getArchiveFilePath(logPath).split('/').pop());
      fs.writeFileSync(archiveFile, '{"archived":1}\n');

      // Create log that will be rotated
      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      rotateLog(logPath, { keepRecent: 50, threshold: 100 });

      const archiveContent = fs.readFileSync(archiveFile, 'utf8');
      expect(archiveContent).toContain('"archived":1');
      expect(archiveContent).toContain('"id":0');
    });

    it('returns archiveFile path in result', () => {
      const logPath = path.join(tempDir, 'rotate-return-path', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      const result = rotateLog(logPath, { keepRecent: 50, threshold: 100 });

      expect(result.ok).toBe(true);
      expect(result.archiveFile).toContain('-archive.jsonl');
    });

    it('preserves recent messages in current log', () => {
      const logPath = path.join(tempDir, 'rotate-preserve', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 150; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      rotateLog(logPath, { keepRecent: 30, threshold: 100 });

      const remaining = fs.readFileSync(logPath, 'utf8');
      const lines = remaining.split('\n').filter(l => l.trim());

      expect(lines.length).toBe(30);
      // Check that last lines are preserved
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.id).toBe(149);
    });
  });

  describe('getLogStats', () => {
    it('returns stats for log with no archives', () => {
      const logPath = path.join(tempDir, 'stats-no-archive', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      let content = '';
      for (let i = 0; i < 50; i++) {
        content += `{"id":${i}}\n`;
      }
      fs.writeFileSync(logPath, content);

      const result = getLogStats(logPath);

      expect(result.ok).toBe(true);
      expect(result.stats.current.lineCount).toBe(50);
      expect(result.stats.current.filename).toBe('log.jsonl');
      expect(result.stats.totals.lineCount).toBe(50);
      expect(result.stats.totals.archiveCount).toBe(0);
    });

    it('counts lines in multiple archive files', () => {
      const logPath = path.join(tempDir, 'stats-multi-archive', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      const archiveDir = path.join(path.dirname(logPath), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      // Create archives
      fs.writeFileSync(
        path.join(archiveDir, '2026-01-archive.jsonl'),
        '{"id":1}\n{"id":2}\n'
      );
      fs.writeFileSync(
        path.join(archiveDir, '2026-02-archive.jsonl'),
        '{"id":3}\n{"id":4}\n{"id":5}\n'
      );

      // Create current log
      fs.writeFileSync(logPath, '{"id":6}\n');

      const result = getLogStats(logPath);

      expect(result.ok).toBe(true);
      expect(result.stats.totals.archiveCount).toBe(2);
      expect(result.stats.totals.lineCount).toBe(6);
    });

    it('includes file size information', () => {
      const logPath = path.join(tempDir, 'stats-size', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      const content = '{"id":1}\n';
      fs.writeFileSync(logPath, content);

      const result = getLogStats(logPath);

      expect(result.ok).toBe(true);
      expect(result.stats.current.size).toBeGreaterThan(0);
      expect(result.stats.current.sizeKB).toBeGreaterThanOrEqual(0);
    });

    it('sorts archives by filename descending', () => {
      const logPath = path.join(tempDir, 'stats-sort', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      const archiveDir = path.join(path.dirname(logPath), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      // Create archives out of order
      fs.writeFileSync(path.join(archiveDir, '2026-01-archive.jsonl'), '{"id":1}\n');
      fs.writeFileSync(path.join(archiveDir, '2026-03-archive.jsonl'), '{"id":2}\n');
      fs.writeFileSync(path.join(archiveDir, '2026-02-archive.jsonl'), '{"id":3}\n');

      fs.writeFileSync(logPath, '');

      const result = getLogStats(logPath);

      expect(result.ok).toBe(true);
      const filenames = result.stats.archives.map(a => a.filename);
      expect(filenames).toEqual([
        '2026-03-archive.jsonl',
        '2026-02-archive.jsonl',
        '2026-01-archive.jsonl',
      ]);
    });

    it('calculates total size across archives', () => {
      const logPath = path.join(tempDir, 'stats-total-size', 'log.jsonl');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });

      const archiveDir = path.join(path.dirname(logPath), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      fs.writeFileSync(path.join(archiveDir, '2026-01-archive.jsonl'), '{"id":1}\n');
      fs.writeFileSync(logPath, '{"id":2}\n');

      const result = getLogStats(logPath);

      expect(result.ok).toBe(true);
      expect(result.stats.totals.size).toBeGreaterThan(0);
      expect(result.stats.totals.sizeKB).toBeGreaterThanOrEqual(0);
    });
  });
});
