/**
 * Tests for merge-history.js
 *
 * Tests cover:
 * - appendEntry() - adding JSONL entries
 * - readHistory() - reading and filtering entries
 * - getLastN() - retrieving recent entries
 * - getStats() - computing merge statistics
 * - maybeRotate() - log rotation when exceeding max entries
 * - clearHistory() - clearing the log
 */

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('../../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getAgileflowDir: jest.fn(() => '/test/project/.agileflow'),
}));

const fs = require('fs');

const {
  appendEntry,
  readHistory,
  getLastN,
  getStats,
  clearHistory,
  _getHistoryPath,
  _maybeRotate,
  _MAX_ENTRIES,
  _ROTATION_KEEP,
} = require('../../../scripts/lib/merge-history');

describe('merge-history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
  });

  describe('_getHistoryPath', () => {
    it('returns path within sessions directory', () => {
      const historyPath = _getHistoryPath();
      expect(historyPath).toContain('sessions');
      expect(historyPath).toContain('merge-history.jsonl');
    });
  });

  describe('appendEntry', () => {
    it('appends entry as JSONL line', () => {
      fs.existsSync.mockReturnValue(true);

      const result = appendEntry({
        sessionId: 'session-1',
        success: true,
        strategy: 'squash',
      });

      expect(result).toBe(true);
      expect(fs.appendFileSync).toHaveBeenCalled();

      const appendCall = fs.appendFileSync.mock.calls[0];
      const line = appendCall[1];

      // Should be valid JSON ending with newline
      expect(line.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(line.trim());
      expect(parsed.sessionId).toBe('session-1');
      expect(parsed.success).toBe(true);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.pid).toBe(process.pid);
    });

    it('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);

      appendEntry({ sessionId: 'session-1', success: true });

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('returns false on write error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const result = appendEntry({ sessionId: 'session-1', success: true });

      expect(result).toBe(false);
    });

    it('includes timestamp and pid automatically', () => {
      fs.existsSync.mockReturnValue(true);

      appendEntry({ sessionId: 'session-1', success: true });

      const line = fs.appendFileSync.mock.calls[0][1];
      const parsed = JSON.parse(line.trim());

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.pid).toBeDefined();
      expect(typeof parsed.pid).toBe('number');
    });
  });

  describe('readHistory', () => {
    const sampleLines = [
      JSON.stringify({
        timestamp: '2026-03-16T10:00:00Z',
        sessionId: 's1',
        success: true,
        strategy: 'squash',
      }),
      JSON.stringify({
        timestamp: '2026-03-16T10:01:00Z',
        sessionId: 's2',
        success: false,
        error: 'conflict',
      }),
      JSON.stringify({
        timestamp: '2026-03-16T10:02:00Z',
        sessionId: 's3',
        success: true,
        strategy: 'merge',
      }),
      JSON.stringify({
        timestamp: '2026-03-16T10:03:00Z',
        sessionId: 's1',
        success: true,
        strategy: 'squash',
      }),
    ].join('\n');

    it('returns empty when no history file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = readHistory();

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('reads all entries', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(sampleLines);

      const result = readHistory();

      expect(result.entries).toHaveLength(4);
      expect(result.total).toBe(4);
    });

    it('filters by sessionId', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(sampleLines);

      const result = readHistory({ sessionId: 's1' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.sessionId === 's1')).toBe(true);
    });

    it('filters successOnly', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(sampleLines);

      const result = readHistory({ successOnly: true });

      expect(result.entries).toHaveLength(3);
      expect(result.entries.every(e => e.success === true)).toBe(true);
    });

    it('filters failuresOnly', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(sampleLines);

      const result = readHistory({ failuresOnly: true });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].sessionId).toBe('s2');
    });

    it('applies limit from end', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(sampleLines);

      const result = readHistory({ limit: 2 });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].sessionId).toBe('s3');
      expect(result.entries[1].sessionId).toBe('s1');
    });

    it('skips malformed lines gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ sessionId: 's1', success: true }) +
          '\n' +
          'not json\n' +
          JSON.stringify({ sessionId: 's2', success: true }) +
          '\n'
      );

      const result = readHistory();

      expect(result.entries).toHaveLength(2);
    });

    it('handles empty file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('');

      const result = readHistory();

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getLastN', () => {
    it('returns last N entries', () => {
      fs.existsSync.mockReturnValue(true);
      const lines = Array.from({ length: 20 }, (_, i) =>
        JSON.stringify({ sessionId: `s${i}`, success: true })
      ).join('\n');
      fs.readFileSync.mockReturnValue(lines);

      const entries = getLastN(5);

      expect(entries).toHaveLength(5);
      expect(entries[4].sessionId).toBe('s19');
    });

    it('defaults to 10 entries', () => {
      fs.existsSync.mockReturnValue(true);
      const lines = Array.from({ length: 20 }, (_, i) =>
        JSON.stringify({ sessionId: `s${i}`, success: true })
      ).join('\n');
      fs.readFileSync.mockReturnValue(lines);

      const entries = getLastN();

      expect(entries).toHaveLength(10);
    });

    it('returns all entries when fewer than N exist', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ sessionId: 's1', success: true }) +
          '\n' +
          JSON.stringify({ sessionId: 's2', success: true })
      );

      const entries = getLastN(10);

      expect(entries).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns zeroed stats when no history', () => {
      fs.existsSync.mockReturnValue(false);

      const stats = getStats();

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('computes correct statistics', () => {
      fs.existsSync.mockReturnValue(true);
      const lines = [
        JSON.stringify({ sessionId: 's1', success: true, strategy: 'squash' }),
        JSON.stringify({ sessionId: 's2', success: true, strategy: 'squash' }),
        JSON.stringify({ sessionId: 's3', success: false, strategy: 'merge' }),
        JSON.stringify({ sessionId: 's4', success: true, strategy: 'merge' }),
      ].join('\n');
      fs.readFileSync.mockReturnValue(lines);

      const stats = getStats();

      expect(stats.total).toBe(4);
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(75);
      expect(stats.strategies.squash).toBe(2);
      expect(stats.strategies.merge).toBe(2);
    });

    it('includes last merge timestamp', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ timestamp: '2026-03-16T10:00:00Z', sessionId: 's1', success: true })
      );

      const stats = getStats();

      expect(stats.lastMerge).toBe('2026-03-16T10:00:00Z');
    });
  });

  describe('_maybeRotate', () => {
    it('does not rotate when under max entries', () => {
      const lines = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({ sessionId: `s${i}` })
      ).join('\n');
      fs.readFileSync.mockReturnValue(lines);

      _maybeRotate('/test/history.jsonl');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rotates when over max entries', () => {
      const lines = Array.from({ length: _MAX_ENTRIES + 10 }, (_, i) =>
        JSON.stringify({ sessionId: `s${i}` })
      ).join('\n');
      fs.readFileSync.mockReturnValue(lines);

      _maybeRotate('/test/history.jsonl');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = fs.writeFileSync.mock.calls[0][1];
      const keptLines = written.trim().split('\n');
      expect(keptLines).toHaveLength(_ROTATION_KEEP);
    });
  });

  describe('clearHistory', () => {
    it('removes history file when it exists', () => {
      fs.existsSync.mockReturnValue(true);

      const result = clearHistory();

      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('returns true when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = clearHistory();

      expect(result).toBe(true);
    });

    it('returns false on error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = clearHistory();

      expect(result).toBe(false);
    });
  });
});
