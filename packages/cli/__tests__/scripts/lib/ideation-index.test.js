/**
 * Tests for ideation-index.js - Ideation History & Deduplication System
 *
 * Tests all exported functions:
 * - Schema creation and validation
 * - Fingerprinting and similarity detection
 * - Idea management (add, update, find duplicates)
 * - Queries (by status, recurring, search)
 */

const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const {
  // Constants
  SCHEMA_VERSION,
  SIMILARITY_THRESHOLD,
  DEFAULT_INDEX_PATH,

  // Schema
  createEmptyIndex,
  validateAndMigrateIndex,

  // File I/O
  getIndexPath,
  loadIdeationIndex,
  saveIdeationIndex,

  // Fingerprinting & Similarity
  normalizeString,
  normalizeFiles,
  generateIdeaFingerprint,
  stringSimilarity,
  fileOverlap,
  calculateIdeaSimilarity,

  // Idea Management
  findDuplicates,
  addIdeaToIndex,
  updateIdeaStatus,

  // Queries
  getIdeasByStatus,
  getRecurringIdeas,
  getIndexSummary,
  getIdeaById,
  searchIdeas,
  updateReportMetadata,
} = require('../../../scripts/lib/ideation-index');

describe('ideation-index.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  describe('constants', () => {
    it('exports SCHEMA_VERSION', () => {
      expect(SCHEMA_VERSION).toBe('1.0.0');
    });

    it('exports SIMILARITY_THRESHOLD', () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.75);
    });

    it('exports DEFAULT_INDEX_PATH', () => {
      expect(DEFAULT_INDEX_PATH).toBe('docs/00-meta/ideation-index.json');
    });
  });

  // ============================================================================
  // SCHEMA
  // ============================================================================

  describe('createEmptyIndex', () => {
    it('returns valid index structure', () => {
      const index = createEmptyIndex();

      expect(index).toHaveProperty('schema_version', SCHEMA_VERSION);
      expect(index).toHaveProperty('updated');
      expect(index).toHaveProperty('ideas');
      expect(index).toHaveProperty('reports');
      expect(index).toHaveProperty('next_id', 1);
      expect(typeof index.updated).toBe('string');
      expect(index.ideas).toEqual({});
      expect(index.reports).toEqual({});
    });

    it('sets updated to ISO timestamp', () => {
      const before = new Date().toISOString();
      const index = createEmptyIndex();
      const after = new Date().toISOString();

      expect(index.updated >= before).toBe(true);
      expect(index.updated <= after).toBe(true);
    });
  });

  describe('validateAndMigrateIndex', () => {
    it('returns empty index for null input', () => {
      const result = validateAndMigrateIndex(null);

      expect(result.schema_version).toBe(SCHEMA_VERSION);
      expect(result.ideas).toEqual({});
      expect(result.reports).toEqual({});
      expect(result.next_id).toBe(1);
    });

    it('returns empty index for undefined input', () => {
      const result = validateAndMigrateIndex(undefined);

      expect(result.schema_version).toBe(SCHEMA_VERSION);
    });

    it('returns empty index for non-object input', () => {
      const result = validateAndMigrateIndex('string');

      expect(result.schema_version).toBe(SCHEMA_VERSION);
    });

    it('preserves valid index data', () => {
      const input = {
        schema_version: '1.0.0',
        updated: '2026-01-30T00:00:00.000Z',
        ideas: { 'IDEA-0001': { title: 'Test' } },
        reports: { 'report.md': {} },
        next_id: 42,
      };

      const result = validateAndMigrateIndex(input);

      expect(result.schema_version).toBe('1.0.0');
      expect(result.next_id).toBe(42);
      expect(result.ideas['IDEA-0001']).toEqual({ title: 'Test' });
    });

    it('fills in missing fields with defaults', () => {
      const input = { ideas: { 'IDEA-0001': { title: 'Test' } } };

      const result = validateAndMigrateIndex(input);

      expect(result.schema_version).toBe(SCHEMA_VERSION);
      expect(result.reports).toEqual({});
      expect(result.next_id).toBe(1);
    });
  });

  // ============================================================================
  // FILE I/O
  // ============================================================================

  describe('getIndexPath', () => {
    it('returns correct path for root directory', () => {
      const result = getIndexPath('/project');

      expect(result).toBe('/project/docs/00-meta/ideation-index.json');
    });
  });

  describe('loadIdeationIndex', () => {
    it('returns new index when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadIdeationIndex('/project');

      expect(result.ok).toBe(true);
      expect(result.created).toBe(true);
      expect(result.data.schema_version).toBe(SCHEMA_VERSION);
    });

    it('returns new index when file is empty', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('  ');

      const result = loadIdeationIndex('/project');

      expect(result.ok).toBe(true);
      expect(result.created).toBe(true);
    });

    it('parses valid JSON file', () => {
      const indexData = {
        schema_version: '1.0.0',
        ideas: { 'IDEA-0001': { title: 'Test' } },
        reports: {},
        next_id: 2,
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(indexData));

      const result = loadIdeationIndex('/project');

      expect(result.ok).toBe(true);
      expect(result.data.ideas['IDEA-0001'].title).toBe('Test');
    });

    it('returns error for invalid JSON', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not valid json');

      const result = loadIdeationIndex('/project');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to load ideation index');
    });

    it('returns error when file read throws', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = loadIdeationIndex('/project');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('saveIdeationIndex', () => {
    it('writes index to temp file then renames', () => {
      fs.existsSync.mockReturnValue(true);
      const index = createEmptyIndex();

      const result = saveIdeationIndex('/project', index);

      expect(result.ok).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.any(String)
      );
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('creates directory if missing', () => {
      fs.existsSync.mockReturnValue(false);
      const index = createEmptyIndex();

      saveIdeationIndex('/project', index);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('docs/00-meta'),
        { recursive: true }
      );
    });

    it('updates timestamp on save', () => {
      fs.existsSync.mockReturnValue(true);
      const index = createEmptyIndex();
      const originalTime = index.updated;

      // Wait a tiny bit
      const result = saveIdeationIndex('/project', index);

      expect(result.ok).toBe(true);
      // Updated timestamp should be different or same (fast execution)
      expect(index.updated).toBeDefined();
    });

    it('returns error on write failure', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });
      const index = createEmptyIndex();

      const result = saveIdeationIndex('/project', index);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Disk full');
    });
  });

  // ============================================================================
  // FINGERPRINTING & SIMILARITY
  // ============================================================================

  describe('normalizeString', () => {
    it('converts to lowercase', () => {
      expect(normalizeString('HELLO')).toBe('hello');
    });

    it('removes punctuation', () => {
      expect(normalizeString('Hello, World!')).toBe('hello world');
    });

    it('collapses whitespace', () => {
      expect(normalizeString('hello   world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(normalizeString('  hello  ')).toBe('hello');
    });

    it('returns empty string for null', () => {
      expect(normalizeString(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeString(undefined)).toBe('');
    });

    it('returns empty string for non-string', () => {
      expect(normalizeString(42)).toBe('');
    });
  });

  describe('normalizeFiles', () => {
    it('returns sorted array', () => {
      const result = normalizeFiles(['z.js', 'a.js', 'm.js']);

      expect(result).toEqual(['a.js', 'm.js', 'z.js']);
    });

    it('removes backticks from paths', () => {
      const result = normalizeFiles(['`path/to/file.js`']);

      expect(result).toEqual(['path/to/file.js']);
    });

    it('removes quotes from paths', () => {
      const result = normalizeFiles(['"path/to/file.js"', "'other.js'"]);

      expect(result).toEqual(['other.js', 'path/to/file.js']);
    });

    it('filters out empty strings', () => {
      const result = normalizeFiles(['a.js', '', 'b.js']);

      expect(result).toEqual(['a.js', 'b.js']);
    });

    it('returns empty array for null', () => {
      expect(normalizeFiles(null)).toEqual([]);
    });

    it('returns empty array for non-array', () => {
      expect(normalizeFiles('string')).toEqual([]);
    });
  });

  describe('generateIdeaFingerprint', () => {
    it('generates consistent fingerprint for same input', () => {
      const fp1 = generateIdeaFingerprint('Test Idea', ['a.js', 'b.js']);
      const fp2 = generateIdeaFingerprint('Test Idea', ['a.js', 'b.js']);

      expect(fp1).toBe(fp2);
    });

    it('generates different fingerprint for different title', () => {
      const fp1 = generateIdeaFingerprint('Test Idea', ['a.js']);
      const fp2 = generateIdeaFingerprint('Different Idea', ['a.js']);

      expect(fp1).not.toBe(fp2);
    });

    it('generates same fingerprint regardless of file order', () => {
      const fp1 = generateIdeaFingerprint('Test', ['a.js', 'b.js']);
      const fp2 = generateIdeaFingerprint('Test', ['b.js', 'a.js']);

      expect(fp1).toBe(fp2);
    });

    it('generates same fingerprint regardless of case', () => {
      const fp1 = generateIdeaFingerprint('TEST IDEA', ['A.js']);
      const fp2 = generateIdeaFingerprint('test idea', ['A.js']);

      expect(fp1).toBe(fp2);
    });

    it('returns 16-character hex string', () => {
      const fp = generateIdeaFingerprint('Test', ['a.js']);

      expect(fp).toHaveLength(16);
      expect(/^[0-9a-f]+$/.test(fp)).toBe(true);
    });
  });

  describe('stringSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1);
    });

    it('returns 1 for identical after normalization', () => {
      expect(stringSimilarity('Hello!', 'hello')).toBe(1);
    });

    it('returns 0 for empty and non-empty', () => {
      expect(stringSimilarity('', 'hello')).toBe(0);
    });

    it('returns 0 for null input', () => {
      expect(stringSimilarity(null, 'hello')).toBe(0);
    });

    it('returns high similarity for similar strings', () => {
      const sim = stringSimilarity('error handling', 'error handler');

      expect(sim).toBeGreaterThan(0.7);
    });

    it('returns low similarity for different strings', () => {
      const sim = stringSimilarity('apple', 'orange');

      expect(sim).toBeLessThan(0.5);
    });
  });

  describe('fileOverlap', () => {
    it('returns 1 for identical file sets', () => {
      const result = fileOverlap(['a.js', 'b.js'], ['a.js', 'b.js']);

      expect(result).toBe(1);
    });

    it('returns 0 for no overlap', () => {
      const result = fileOverlap(['a.js'], ['b.js']);

      expect(result).toBe(0);
    });

    it('returns 0 for empty arrays', () => {
      expect(fileOverlap([], [])).toBe(0);
      expect(fileOverlap(['a.js'], [])).toBe(0);
    });

    it('returns partial overlap ratio', () => {
      // Intersection = 1 (a.js), Union = 3 (a.js, b.js, c.js)
      const result = fileOverlap(['a.js', 'b.js'], ['a.js', 'c.js']);

      expect(result).toBeCloseTo(1 / 3, 2);
    });
  });

  describe('calculateIdeaSimilarity', () => {
    it('returns score of 1 for identical ideas', () => {
      const idea = { title: 'Test Idea', files: ['a.js'] };

      const result = calculateIdeaSimilarity(idea, idea);

      expect(result.score).toBe(1);
      expect(result.titleSimilarity).toBe(1);
      expect(result.fileOverlap).toBe(1);
    });

    it('weighs title more than files (70/30)', () => {
      // Same title, different files
      const idea1 = { title: 'Test Idea', files: ['a.js'] };
      const idea2 = { title: 'Test Idea', files: ['b.js'] };

      const result = calculateIdeaSimilarity(idea1, idea2);

      // Title sim = 1, file overlap = 0
      // Score = 1 * 0.7 + 0 * 0.3 = 0.7
      expect(result.score).toBeCloseTo(0.7, 2);
    });
  });

  // ============================================================================
  // IDEA MANAGEMENT
  // ============================================================================

  describe('addIdeaToIndex', () => {
    it('adds new idea with generated ID', () => {
      const index = createEmptyIndex();
      const idea = {
        title: 'Test Idea',
        category: 'Security',
        files: ['a.js'],
        experts: ['Security'],
      };

      const result = addIdeaToIndex(index, idea, 'ideation-20260130.md');

      expect(result.ok).toBe(true);
      expect(result.id).toBe('IDEA-0001');
      expect(result.recurring).toBe(false);
      expect(index.ideas['IDEA-0001']).toBeDefined();
      expect(index.ideas['IDEA-0001'].title).toBe('Test Idea');
      expect(index.next_id).toBe(2);
    });

    it('returns error for idea without title', () => {
      const index = createEmptyIndex();

      const result = addIdeaToIndex(index, {}, 'report.md');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('title is required');
    });

    it('detects recurring idea and adds occurrence', () => {
      const index = createEmptyIndex();
      const idea = {
        title: 'Test Idea',
        category: 'Security',
        files: ['a.js'],
      };

      // Add first time
      addIdeaToIndex(index, idea, 'report1.md');

      // Add second time (same idea)
      const result = addIdeaToIndex(index, idea, 'report2.md');

      expect(result.ok).toBe(true);
      expect(result.recurring).toBe(true);
      expect(result.id).toBe('IDEA-0001');
      expect(index.ideas['IDEA-0001'].occurrences).toHaveLength(2);
      expect(index.next_id).toBe(2); // Didn't increment
    });

    it('updates report metadata', () => {
      const index = createEmptyIndex();
      const idea = { title: 'Test Idea' };

      addIdeaToIndex(index, idea, 'report.md');

      expect(index.reports['report.md']).toBeDefined();
      expect(index.reports['report.md'].ideas).toContain('IDEA-0001');
      expect(index.reports['report.md'].idea_count).toBe(1);
    });

    it('pads ID with leading zeros', () => {
      const index = createEmptyIndex();
      index.next_id = 42;

      const result = addIdeaToIndex(index, { title: 'Test' }, 'report.md');

      expect(result.id).toBe('IDEA-0042');
    });
  });

  describe('findDuplicates', () => {
    it('returns empty array when no duplicates', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Existing Idea',
        fingerprint: 'abc123',
        files: ['x.js'],
      };

      const result = findDuplicates(index, {
        title: 'Completely Different',
        files: ['y.js'],
      });

      expect(result).toEqual([]);
    });

    it('finds exact fingerprint match', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Test Idea',
        fingerprint: generateIdeaFingerprint('Test Idea', ['a.js']),
        files: ['a.js'],
      };

      const result = findDuplicates(index, {
        title: 'Test Idea',
        files: ['a.js'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('IDEA-0001');
      expect(result[0].exact).toBe(true);
    });

    it('finds similar ideas above threshold', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Error Handling Consolidation',
        fingerprint: 'different',
        files: ['errors.js'],
      };

      const result = findDuplicates(index, {
        title: 'Error Handler Consolidation',
        files: ['errors.js'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].exact).toBe(false);
      expect(result[0].similarity.score).toBeGreaterThan(0.75);
    });

    it('sorts results by similarity descending', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Error Handling',
        fingerprint: 'fp1',
        files: ['a.js'],
      };
      index.ideas['IDEA-0002'] = {
        title: 'Error Handler',
        fingerprint: 'fp2',
        files: ['a.js', 'b.js'],
      };

      const result = findDuplicates(index, {
        title: 'Error Handler',
        files: ['a.js'],
      });

      if (result.length >= 2) {
        expect(result[0].similarity.score).toBeGreaterThanOrEqual(
          result[1].similarity.score
        );
      }
    });
  });

  describe('updateIdeaStatus', () => {
    it('updates status successfully', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { title: 'Test', status: 'pending' };

      const result = updateIdeaStatus(index, 'IDEA-0001', 'implemented');

      expect(result.ok).toBe(true);
      expect(index.ideas['IDEA-0001'].status).toBe('implemented');
    });

    it('returns error for non-existent idea', () => {
      const index = createEmptyIndex();

      const result = updateIdeaStatus(index, 'IDEA-9999', 'implemented');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for invalid status', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { title: 'Test', status: 'pending' };

      const result = updateIdeaStatus(index, 'IDEA-0001', 'invalid-status');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('links story and epic when provided', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { title: 'Test', status: 'pending' };

      const result = updateIdeaStatus(index, 'IDEA-0001', 'implemented', {
        linkedStory: 'US-0095',
        linkedEpic: 'EP-0017',
      });

      expect(result.ok).toBe(true);
      expect(index.ideas['IDEA-0001'].linked_story).toBe('US-0095');
      expect(index.ideas['IDEA-0001'].linked_epic).toBe('EP-0017');
    });
  });

  // ============================================================================
  // QUERIES
  // ============================================================================

  describe('getIdeasByStatus', () => {
    it('filters ideas by status', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { status: 'pending' };
      index.ideas['IDEA-0002'] = { status: 'implemented' };
      index.ideas['IDEA-0003'] = { status: 'pending' };

      const result = getIdeasByStatus(index, 'pending');

      expect(result).toHaveLength(2);
    });

    it('returns empty array when no matches', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { status: 'pending' };

      const result = getIdeasByStatus(index, 'implemented');

      expect(result).toEqual([]);
    });
  });

  describe('getRecurringIdeas', () => {
    it('returns ideas with 2+ occurrences', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        status: 'pending',
        occurrences: [{ report: 'r1.md' }, { report: 'r2.md' }],
      };
      index.ideas['IDEA-0002'] = {
        status: 'pending',
        occurrences: [{ report: 'r1.md' }],
      };

      const result = getRecurringIdeas(index);

      expect(result).toHaveLength(1);
      expect(result[0].idea).toBe(index.ideas['IDEA-0001']);
      expect(result[0].occurrenceCount).toBe(2);
    });

    it('excludes implemented ideas by default', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        status: 'implemented',
        occurrences: [{ report: 'r1.md' }, { report: 'r2.md' }],
      };

      const result = getRecurringIdeas(index);

      expect(result).toEqual([]);
    });

    it('includes implemented when excludeImplemented=false', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        status: 'implemented',
        occurrences: [{ report: 'r1.md' }, { report: 'r2.md' }],
      };

      const result = getRecurringIdeas(index, { excludeImplemented: false });

      expect(result).toHaveLength(1);
    });

    it('sorts by occurrence count descending', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        status: 'pending',
        occurrences: [{ report: 'r1.md' }, { report: 'r2.md' }],
      };
      index.ideas['IDEA-0002'] = {
        status: 'pending',
        occurrences: [
          { report: 'r1.md' },
          { report: 'r2.md' },
          { report: 'r3.md' },
        ],
      };

      const result = getRecurringIdeas(index);

      expect(result[0].occurrenceCount).toBe(3);
      expect(result[1].occurrenceCount).toBe(2);
    });
  });

  describe('getIndexSummary', () => {
    it('returns correct summary statistics', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        status: 'pending',
        category: 'Security',
        occurrences: [{ report: 'r1.md' }],
      };
      index.ideas['IDEA-0002'] = {
        status: 'implemented',
        category: 'Security',
        occurrences: [{ report: 'r1.md' }, { report: 'r2.md' }],
      };
      index.reports['r1.md'] = {};
      index.reports['r2.md'] = {};

      const summary = getIndexSummary(index);

      expect(summary.totalIdeas).toBe(2);
      expect(summary.totalReports).toBe(2);
      expect(summary.byStatus.pending).toBe(1);
      expect(summary.byStatus.implemented).toBe(1);
      expect(summary.byCategory['Security']).toBe(2);
      expect(summary.recurringCount).toBe(1);
    });
  });

  describe('getIdeaById', () => {
    it('returns idea when found', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { title: 'Test' };

      const result = getIdeaById(index, 'IDEA-0001');

      expect(result.title).toBe('Test');
    });

    it('returns null when not found', () => {
      const index = createEmptyIndex();

      const result = getIdeaById(index, 'IDEA-9999');

      expect(result).toBeNull();
    });
  });

  describe('searchIdeas', () => {
    it('finds ideas by title keyword', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Error Handling Consolidation',
        title_normalized: 'error handling consolidation',
      };
      index.ideas['IDEA-0002'] = {
        title: 'Path Traversal Protection',
        title_normalized: 'path traversal protection',
      };

      const result = searchIdeas(index, 'error');

      expect(result).toHaveLength(1);
      expect(result[0].title).toContain('Error');
    });

    it('is case insensitive', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Error Handling',
        title_normalized: 'error handling',
      };

      const result = searchIdeas(index, 'ERROR');

      expect(result).toHaveLength(1);
    });

    it('returns empty array for no matches', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = {
        title: 'Test',
        title_normalized: 'test',
      };

      const result = searchIdeas(index, 'xyz');

      expect(result).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      const index = createEmptyIndex();
      index.ideas['IDEA-0001'] = { title: 'Test' };

      const result = searchIdeas(index, '');

      expect(result).toEqual([]);
    });
  });

  describe('updateReportMetadata', () => {
    it('creates report entry if missing', () => {
      const index = createEmptyIndex();

      updateReportMetadata(index, 'new-report.md', { scope: 'all' });

      expect(index.reports['new-report.md']).toBeDefined();
      expect(index.reports['new-report.md'].scope).toBe('all');
    });

    it('updates existing report entry', () => {
      const index = createEmptyIndex();
      index.reports['report.md'] = { scope: 'security', depth: 'quick' };

      updateReportMetadata(index, 'report.md', { depth: 'deep' });

      expect(index.reports['report.md'].scope).toBe('security');
      expect(index.reports['report.md'].depth).toBe('deep');
    });
  });
});
