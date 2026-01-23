/**
 * Tests for frontmatter-parser.js - YAML frontmatter extraction
 *
 * Tests all 4 exported functions:
 * - parseFrontmatter (handles missing/invalid YAML)
 * - extractFrontmatter (file-based extraction)
 * - extractBody (content after frontmatter)
 * - normalizeTools (array/string/null handling)
 */

const fs = require('fs');

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

// Mock yaml-utils - returns parsed object or throws
jest.mock('../../../lib/yaml-utils', () => ({
  safeLoad: jest.fn(),
}));

const {
  parseFrontmatter,
  extractFrontmatter,
  extractBody,
  normalizeTools,
} = require('../../../scripts/lib/frontmatter-parser');

const { safeLoad } = require('../../../lib/yaml-utils');

describe('frontmatter-parser.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseFrontmatter', () => {
    it('returns empty object when no frontmatter present', () => {
      const content = '# Heading\n\nSome content without frontmatter.';

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
      expect(safeLoad).not.toHaveBeenCalled();
    });

    it('returns empty object when frontmatter is incomplete (no closing ---)', () => {
      const content = '---\ntitle: Test\nSome content';

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('parses valid YAML frontmatter', () => {
      const content = '---\ntitle: Test\ndescription: A test file\n---\n\n# Content';
      safeLoad.mockReturnValue({ title: 'Test', description: 'A test file' });

      const result = parseFrontmatter(content);

      expect(result).toEqual({ title: 'Test', description: 'A test file' });
      expect(safeLoad).toHaveBeenCalledWith('title: Test\ndescription: A test file');
    });

    it('returns empty object when safeLoad returns null', () => {
      const content = '---\n\n---\n\nContent';
      safeLoad.mockReturnValue(null);

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('returns empty object when safeLoad returns undefined', () => {
      const content = '---\n\n---\n\nContent';
      safeLoad.mockReturnValue(undefined);

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('returns empty object when safeLoad returns non-object (string)', () => {
      const content = '---\njust a string\n---\n\nContent';
      safeLoad.mockReturnValue('just a string');

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('returns empty object when safeLoad returns non-object (number)', () => {
      const content = '---\n42\n---\n\nContent';
      safeLoad.mockReturnValue(42);

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('returns empty object when safeLoad throws error (invalid YAML)', () => {
      const content = '---\ninvalid: yaml: syntax:\n---\n\nContent';
      safeLoad.mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });

    it('handles frontmatter with arrays', () => {
      const content = '---\ntools:\n  - Read\n  - Write\n---\n\nContent';
      safeLoad.mockReturnValue({ tools: ['Read', 'Write'] });

      const result = parseFrontmatter(content);

      expect(result).toEqual({ tools: ['Read', 'Write'] });
    });

    it('handles frontmatter with nested objects', () => {
      const content = '---\ncompact_context:\n  priority: high\n---\n\nContent';
      safeLoad.mockReturnValue({ compact_context: { priority: 'high' } });

      const result = parseFrontmatter(content);

      expect(result).toEqual({ compact_context: { priority: 'high' } });
    });

    it('handles empty frontmatter block', () => {
      const content = '---\n---\n\nContent';
      safeLoad.mockReturnValue(null);

      const result = parseFrontmatter(content);

      expect(result).toEqual({});
    });
  });

  describe('extractFrontmatter', () => {
    it('reads file and extracts frontmatter', () => {
      const filePath = '/path/to/file.md';
      const content = '---\ntitle: Test\n---\n\nContent';
      fs.readFileSync.mockReturnValue(content);
      safeLoad.mockReturnValue({ title: 'Test' });

      const result = extractFrontmatter(filePath);

      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(result).toEqual({ title: 'Test' });
    });

    it('returns empty object when file read throws error', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });

      const result = extractFrontmatter('/nonexistent/file.md');

      expect(result).toEqual({});
    });

    it('returns empty object when file is empty', () => {
      fs.readFileSync.mockReturnValue('');

      const result = extractFrontmatter('/empty/file.md');

      expect(result).toEqual({});
    });

    it('returns empty object when file has no frontmatter', () => {
      fs.readFileSync.mockReturnValue('# Just a heading\n\nNo frontmatter here.');

      const result = extractFrontmatter('/no-frontmatter.md');

      expect(result).toEqual({});
    });
  });

  describe('extractBody', () => {
    it('returns content after frontmatter', () => {
      const content = '---\ntitle: Test\n---\n\n# Heading\n\nBody content here.';

      const result = extractBody(content);

      expect(result).toBe('# Heading\n\nBody content here.');
    });

    it('returns original content when no frontmatter present', () => {
      const content = '# Heading\n\nBody content without frontmatter.';

      const result = extractBody(content);

      expect(result).toBe('# Heading\n\nBody content without frontmatter.');
    });

    it('trims whitespace from result', () => {
      const content = '---\ntitle: Test\n---\n\n\n  # Heading  \n\n';

      const result = extractBody(content);

      expect(result).toBe('# Heading');
    });

    it('handles content immediately after frontmatter (no newline)', () => {
      const content = '---\ntitle: Test\n---\n# Heading';

      const result = extractBody(content);

      expect(result).toBe('# Heading');
    });

    it('handles empty content after frontmatter', () => {
      const content = '---\ntitle: Test\n---\n';

      const result = extractBody(content);

      expect(result).toBe('');
    });

    it('handles content with only whitespace after frontmatter', () => {
      const content = '---\ntitle: Test\n---\n\n   \n\t\n';

      const result = extractBody(content);

      expect(result).toBe('');
    });

    it('preserves internal whitespace in body', () => {
      const content = '---\ntitle: Test\n---\n\nLine 1\n\n\nLine 2';

      const result = extractBody(content);

      expect(result).toBe('Line 1\n\n\nLine 2');
    });
  });

  describe('normalizeTools', () => {
    it('returns empty array when tools is null', () => {
      const result = normalizeTools(null);
      expect(result).toEqual([]);
    });

    it('returns empty array when tools is undefined', () => {
      const result = normalizeTools(undefined);
      expect(result).toEqual([]);
    });

    it('returns empty array when tools is empty string', () => {
      const result = normalizeTools('');
      expect(result).toEqual([]);
    });

    it('returns array unchanged when tools is already an array', () => {
      const tools = ['Read', 'Write', 'Bash'];
      const result = normalizeTools(tools);
      expect(result).toEqual(['Read', 'Write', 'Bash']);
    });

    it('returns same array reference when input is array', () => {
      const tools = ['Read', 'Write'];
      const result = normalizeTools(tools);
      expect(result).toBe(tools);
    });

    it('splits comma-separated string into array', () => {
      const tools = 'Read, Write, Bash';
      const result = normalizeTools(tools);
      expect(result).toEqual(['Read', 'Write', 'Bash']);
    });

    it('trims whitespace from each tool in comma-separated string', () => {
      const tools = '  Read  ,  Write  ,  Bash  ';
      const result = normalizeTools(tools);
      expect(result).toEqual(['Read', 'Write', 'Bash']);
    });

    it('filters out empty strings from comma-separated input', () => {
      const tools = 'Read,,Write,  ,Bash';
      const result = normalizeTools(tools);
      expect(result).toEqual(['Read', 'Write', 'Bash']);
    });

    it('handles single tool as string', () => {
      const tools = 'Read';
      const result = normalizeTools(tools);
      expect(result).toEqual(['Read']);
    });

    it('returns empty array when string is only commas', () => {
      const tools = ',,,';
      const result = normalizeTools(tools);
      expect(result).toEqual([]);
    });

    it('returns empty array when string is only whitespace and commas', () => {
      const tools = '  ,  ,  ';
      const result = normalizeTools(tools);
      expect(result).toEqual([]);
    });

    it('returns empty array for number input', () => {
      const result = normalizeTools(42);
      expect(result).toEqual([]);
    });

    it('returns empty array for object input', () => {
      const result = normalizeTools({ tool: 'Read' });
      expect(result).toEqual([]);
    });

    it('returns empty array for boolean input', () => {
      const result = normalizeTools(true);
      expect(result).toEqual([]);
    });
  });
});
