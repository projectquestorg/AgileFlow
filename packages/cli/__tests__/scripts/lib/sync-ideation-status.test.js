/**
 * Tests for sync-ideation-status.js
 *
 * Tests cover:
 * - normalizeReportName() - Report name normalization
 * - findIdeasByReport() - Finding ideas from a specific report
 * - syncEpicIdeas() - Syncing ideas for a single epic
 * - getCompletedEpicsWithResearch() - Getting epics with research field
 * - syncImplementedIdeas() - Full sync workflow
 * - getSyncStatus() - Status summary
 */

const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const fs = require('fs');

const {
  normalizeReportName,
  findIdeasByReport,
  syncEpicIdeas,
  getCompletedEpicsWithResearch,
  syncImplementedIdeas,
  getSyncStatus,
  loadJSON,
  saveJSON,
  STATUS_PATH,
  IDEATION_INDEX_PATH,
} = require('../../../scripts/lib/sync-ideation-status');

describe('sync-ideation-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeReportName', () => {
    it('returns empty string for falsy input', () => {
      expect(normalizeReportName(null)).toBe('');
      expect(normalizeReportName(undefined)).toBe('');
      expect(normalizeReportName('')).toBe('');
    });

    it('removes path prefix and lowercases', () => {
      expect(normalizeReportName('docs/10-research/ideation-20260114.md')).toBe(
        'ideation-20260114.md'
      );
      expect(normalizeReportName('IDEATION-20260114.md')).toBe('ideation-20260114.md');
    });

    it('handles filenames without path', () => {
      expect(normalizeReportName('ideation-20260114.md')).toBe('ideation-20260114.md');
    });

    it('trims whitespace', () => {
      expect(normalizeReportName('  ideation-20260114.md  ')).toBe('ideation-20260114.md');
    });
  });

  describe('findIdeasByReport', () => {
    it('returns empty array for empty index', () => {
      expect(findIdeasByReport({}, 'ideation-20260114.md')).toEqual([]);
      expect(findIdeasByReport({ ideas: {} }, 'ideation-20260114.md')).toEqual([]);
    });

    it('returns empty array for null inputs', () => {
      expect(findIdeasByReport(null, 'ideation-20260114.md')).toEqual([]);
      expect(findIdeasByReport({ ideas: {} }, null)).toEqual([]);
    });

    it('finds ideas matching report name', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            title: 'Test Idea 1',
            source_report: 'ideation-20260114.md',
          },
          'IDEA-0002': {
            id: 'IDEA-0002',
            title: 'Test Idea 2',
            source_report: 'ideation-20260115.md',
          },
          'IDEA-0003': {
            id: 'IDEA-0003',
            title: 'Test Idea 3',
            source_report: 'ideation-20260114.md',
          },
        },
      };

      const result = findIdeasByReport(index, 'ideation-20260114.md');
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toEqual(['IDEA-0001', 'IDEA-0003']);
    });

    it('handles case-insensitive matching', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            source_report: 'IDEATION-20260114.md',
          },
        },
      };

      const result = findIdeasByReport(index, 'ideation-20260114.md');
      expect(result).toHaveLength(1);
    });

    it('handles path prefix in report name', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            source_report: 'ideation-20260114.md',
          },
        },
      };

      const result = findIdeasByReport(index, 'docs/10-research/ideation-20260114.md');
      expect(result).toHaveLength(1);
    });
  });

  describe('syncEpicIdeas', () => {
    it('returns zero updates for epic without research', () => {
      const index = { ideas: {} };
      const epic = { status: 'complete', title: 'Test Epic' };

      const result = syncEpicIdeas('EP-0001', epic, index);
      expect(result.updated).toBe(0);
      expect(result.ideas).toEqual([]);
    });

    it('marks ideas as implemented for completed epic', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            title: 'Test Idea',
            source_report: 'ideation-20260114.md',
            status: 'pending',
          },
        },
      };
      const epic = {
        status: 'complete',
        research: 'ideation-20260114.md',
        completed: '2026-01-20',
      };

      const result = syncEpicIdeas('EP-0017', epic, index);

      expect(result.updated).toBe(1);
      expect(result.ideas).toEqual(['IDEA-0001']);
      expect(index.ideas['IDEA-0001'].status).toBe('implemented');
      expect(index.ideas['IDEA-0001'].linked_epic).toBe('EP-0017');
      expect(index.ideas['IDEA-0001'].implemented_date).toBe('2026-01-20');
    });

    it('skips already implemented ideas', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            source_report: 'ideation-20260114.md',
            status: 'implemented',
            linked_epic: 'EP-0015',
          },
        },
      };
      const epic = {
        status: 'complete',
        research: 'ideation-20260114.md',
      };

      const result = syncEpicIdeas('EP-0017', epic, index);
      expect(result.updated).toBe(0);
      expect(index.ideas['IDEA-0001'].linked_epic).toBe('EP-0015'); // Unchanged
    });

    it('skips rejected ideas', () => {
      const index = {
        ideas: {
          'IDEA-0001': {
            id: 'IDEA-0001',
            source_report: 'ideation-20260114.md',
            status: 'rejected',
          },
        },
      };
      const epic = {
        status: 'complete',
        research: 'ideation-20260114.md',
      };

      const result = syncEpicIdeas('EP-0017', epic, index);
      expect(result.updated).toBe(0);
    });
  });

  describe('getCompletedEpicsWithResearch', () => {
    it('returns empty array for empty status', () => {
      expect(getCompletedEpicsWithResearch({})).toEqual([]);
      expect(getCompletedEpicsWithResearch({ epics: {} })).toEqual([]);
      expect(getCompletedEpicsWithResearch(null)).toEqual([]);
    });

    it('filters to completed epics with research field', () => {
      const statusData = {
        epics: {
          'EP-0001': { status: 'complete', research: 'ideation-20260114.md' },
          'EP-0002': { status: 'in_progress', research: 'ideation-20260115.md' },
          'EP-0003': { status: 'complete' }, // No research
          'EP-0004': { status: 'complete', research: 'research-20260116.md' },
        },
      };

      const result = getCompletedEpicsWithResearch(statusData);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toEqual(['EP-0001', 'EP-0004']);
    });
  });

  describe('loadJSON', () => {
    it('returns error for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadJSON('/test/path.json');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('loads and parses JSON file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"key": "value"}');

      const result = loadJSON('/test/path.json');
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('returns error for invalid JSON', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not json');

      const result = loadJSON('/test/path.json');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to load');
    });
  });

  describe('saveJSON', () => {
    it('writes JSON with atomic rename', () => {
      fs.writeFileSync.mockImplementation(() => {});
      fs.renameSync.mockImplementation(() => {});

      const result = saveJSON('/test/path.json', { key: 'value' });

      expect(result.ok).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/path.json.tmp',
        expect.stringContaining('"key": "value"')
      );
      expect(fs.renameSync).toHaveBeenCalledWith('/test/path.json.tmp', '/test/path.json');
    });

    it('cleans up temp file on error', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {});

      const result = saveJSON('/test/path.json', { key: 'value' });

      expect(result.ok).toBe(false);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/path.json.tmp');
    });
  });

  describe('syncImplementedIdeas', () => {
    const mockStatusData = {
      epics: {
        'EP-0017': {
          status: 'complete',
          research: 'ideation-20260114.md',
          completed: '2026-01-14',
        },
      },
    };

    const mockIndex = {
      schema_version: '1.0.0',
      updated: '2026-01-01T00:00:00Z',
      ideas: {
        'IDEA-0001': {
          id: 'IDEA-0001',
          title: 'Test Idea',
          source_report: 'ideation-20260114.md',
          status: 'pending',
        },
      },
    };

    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('returns error when status.json fails to load', () => {
      fs.existsSync.mockImplementation(p => !p.includes('status.json'));
      fs.readFileSync.mockReturnValue('{}');

      const result = syncImplementedIdeas('/test/root');
      expect(result.ok).toBe(false);
    });

    it('returns success with no updates when index does not exist', () => {
      fs.existsSync.mockImplementation(p => p.includes('status.json'));
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('status.json')) return JSON.stringify(mockStatusData);
        throw new Error('Not found');
      });

      const result = syncImplementedIdeas('/test/root');
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(0);
    });

    it('syncs ideas and saves updated index', () => {
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('status.json')) return JSON.stringify(mockStatusData);
        if (p.includes('ideation-index.json')) return JSON.stringify(mockIndex);
        return '{}';
      });
      fs.writeFileSync.mockImplementation(() => {});
      fs.renameSync.mockImplementation(() => {});

      const result = syncImplementedIdeas('/test/root');

      expect(result.ok).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.details['EP-0017'].ideas).toContain('IDEA-0001');
      expect(fs.renameSync).toHaveBeenCalled(); // Index was saved
    });

    it('does not save when in dry-run mode', () => {
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('status.json')) return JSON.stringify(mockStatusData);
        if (p.includes('ideation-index.json')) return JSON.stringify(mockIndex);
        return '{}';
      });

      const result = syncImplementedIdeas('/test/root', { dryRun: true });

      expect(result.ok).toBe(true);
      expect(result.updated).toBe(1);
      expect(fs.renameSync).not.toHaveBeenCalled(); // Index was NOT saved
    });

    it('does not save when no updates made', () => {
      const alreadyImplementedIndex = {
        ...mockIndex,
        ideas: {
          'IDEA-0001': {
            ...mockIndex.ideas['IDEA-0001'],
            status: 'implemented',
          },
        },
      };

      fs.readFileSync.mockImplementation(p => {
        if (p.includes('status.json')) return JSON.stringify(mockStatusData);
        if (p.includes('ideation-index.json')) return JSON.stringify(alreadyImplementedIndex);
        return '{}';
      });

      const result = syncImplementedIdeas('/test/root');

      expect(result.ok).toBe(true);
      expect(result.updated).toBe(0);
      expect(fs.renameSync).not.toHaveBeenCalled();
    });
  });

  describe('getSyncStatus', () => {
    it('returns zeros when index does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = getSyncStatus('/test/root');
      expect(result).toEqual({
        totalIdeas: 0,
        pending: 0,
        implemented: 0,
        linkedEpics: 0,
      });
    });

    it('returns counts from index', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          ideas: {
            'IDEA-0001': { status: 'pending' },
            'IDEA-0002': { status: 'pending' },
            'IDEA-0003': { status: 'implemented', linked_epic: 'EP-0017' },
            'IDEA-0004': { status: 'implemented', linked_epic: 'EP-0017' },
            'IDEA-0005': { status: 'implemented', linked_epic: 'EP-0018' },
            'IDEA-0006': { status: 'rejected' },
          },
        })
      );

      const result = getSyncStatus('/test/root');

      expect(result.totalIdeas).toBe(6);
      expect(result.pending).toBe(2);
      expect(result.implemented).toBe(3);
      expect(result.rejected).toBe(1);
      expect(result.linkedEpics).toBe(2); // EP-0017 and EP-0018
    });
  });

  describe('path constants', () => {
    it('exports correct paths', () => {
      expect(STATUS_PATH).toBe('docs/09-agents/status.json');
      expect(IDEATION_INDEX_PATH).toBe('docs/00-meta/ideation-index.json');
    });
  });
});
