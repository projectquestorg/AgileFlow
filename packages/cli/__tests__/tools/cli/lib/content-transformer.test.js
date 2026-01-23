/**
 * Tests for content-transformer.js - Content transformation utilities
 *
 * Tests all exported functions:
 * - replaceReferences (object and array forms)
 * - stripFrontmatter
 * - convertFrontmatter
 * - injectContent (delegates to content-injector)
 * - getFrontmatter
 * - escapeRegex
 * - IDE_REPLACEMENTS
 * - createDocsReplacements
 * - transformForIde
 */

// Mock the content-injector module
jest.mock('../../../../tools/cli/lib/content-injector', () => ({
  injectContent: jest.fn((content, options) => {
    // Simple mock that replaces a placeholder
    return content.replace('{{VERSION}}', options.version || 'unknown');
  }),
}));

// Mock the frontmatter-parser module
jest.mock('../../../../scripts/lib/frontmatter-parser', () => ({
  parseFrontmatter: jest.fn(content => {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    // Simple YAML-like parsing for tests
    const lines = match[1].split('\n');
    const result = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join(':').trim();
      }
    }
    return result;
  }),
  extractBody: jest.fn(content => {
    const match = content.match(/^---\n[\s\S]*?\n---\n*/);
    if (!match) return content;
    return content.slice(match[0].length).trim();
  }),
}));

const {
  replaceReferences,
  stripFrontmatter,
  convertFrontmatter,
  injectContent,
  getFrontmatter,
  escapeRegex,
  IDE_REPLACEMENTS,
  createDocsReplacements,
  transformForIde,
} = require('../../../../tools/cli/lib/content-transformer');

describe('content-transformer.js', () => {
  describe('replaceReferences', () => {
    describe('with object form', () => {
      it('replaces simple string patterns', () => {
        const content = 'Hello Claude Code, welcome to Claude Code!';
        const result = replaceReferences(content, {
          'Claude Code': 'Codex CLI',
        });
        expect(result).toBe('Hello Codex CLI, welcome to Codex CLI!');
      });

      it('replaces multiple patterns', () => {
        const content = 'Use .claude/ folder and CLAUDE.md file';
        const result = replaceReferences(content, {
          '.claude/': '.codex/',
          'CLAUDE.md': 'AGENTS.md',
        });
        expect(result).toBe('Use .codex/ folder and AGENTS.md file');
      });

      it('handles special regex characters in patterns', () => {
        const content = 'Path: .claude/settings.json';
        const result = replaceReferences(content, {
          '.claude/': '.codex/',
        });
        expect(result).toBe('Path: .codex/settings.json');
      });

      it('returns empty string for null input', () => {
        const result = replaceReferences(null, { foo: 'bar' });
        expect(result).toBe('');
      });

      it('returns empty string for undefined input', () => {
        const result = replaceReferences(undefined, { foo: 'bar' });
        expect(result).toBe('');
      });

      it('returns content unchanged for empty replacements object', () => {
        const content = 'Hello World';
        const result = replaceReferences(content, {});
        expect(result).toBe('Hello World');
      });

      it('returns content unchanged for null replacements', () => {
        const content = 'Hello World';
        const result = replaceReferences(content, null);
        expect(result).toBe('Hello World');
      });
    });

    describe('with array form', () => {
      it('replaces using array of pattern objects', () => {
        const content = 'Claude Code is great';
        const result = replaceReferences(content, [
          { pattern: 'Claude Code', replacement: 'Codex CLI' },
        ]);
        expect(result).toBe('Codex CLI is great');
      });

      it('supports regex patterns', () => {
        const content = 'claude code and CLAUDE CODE';
        const result = replaceReferences(content, [
          { pattern: /claude code/gi, replacement: 'Codex CLI' },
        ]);
        expect(result).toBe('Codex CLI and Codex CLI');
      });

      it('supports flags parameter for string patterns', () => {
        const content = 'Hello hello HELLO';
        const result = replaceReferences(content, [
          { pattern: 'hello', replacement: 'hi', flags: 'gi' },
        ]);
        expect(result).toBe('hi hi hi');
      });

      it('skips null items in array', () => {
        const content = 'Hello World';
        const result = replaceReferences(content, [
          null,
          { pattern: 'World', replacement: 'Universe' },
        ]);
        expect(result).toBe('Hello Universe');
      });

      it('skips items without pattern', () => {
        const content = 'Hello World';
        const result = replaceReferences(content, [
          { replacement: 'foo' },
          { pattern: 'World', replacement: 'Universe' },
        ]);
        expect(result).toBe('Hello Universe');
      });

      it('handles empty replacement string', () => {
        const content = 'Remove this word please';
        const result = replaceReferences(content, [{ pattern: 'this ', replacement: '' }]);
        expect(result).toBe('Remove word please');
      });
    });
  });

  describe('escapeRegex', () => {
    it('escapes special regex characters', () => {
      expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    it('leaves normal characters unchanged', () => {
      expect(escapeRegex('hello')).toBe('hello');
    });

    it('handles mixed content', () => {
      expect(escapeRegex('.claude/settings.json')).toBe('\\.claude/settings\\.json');
    });
  });

  describe('stripFrontmatter', () => {
    it('removes YAML frontmatter from content', () => {
      const content = `---
title: Test
---

# Heading

Body content`;
      const result = stripFrontmatter(content);
      expect(result).toBe('# Heading\n\nBody content');
    });

    it('returns original content when no frontmatter', () => {
      const content = '# Just a heading\n\nNo frontmatter here.';
      const result = stripFrontmatter(content);
      expect(result).toBe('# Just a heading\n\nNo frontmatter here.');
    });
  });

  describe('getFrontmatter', () => {
    it('extracts frontmatter as object', () => {
      const content = `---
title: Test Document
description: A test file
---

Content here`;
      const result = getFrontmatter(content);
      expect(result.title).toBe('Test Document');
      expect(result.description).toBe('A test file');
    });

    it('returns empty object when no frontmatter', () => {
      const content = '# Just content';
      const result = getFrontmatter(content);
      expect(result).toEqual({});
    });
  });

  describe('convertFrontmatter', () => {
    it('maps keys using keyMap', () => {
      const frontmatter = { name: 'test', description: 'A test' };
      const result = convertFrontmatter(frontmatter, {
        keyMap: { name: 'skill_name' },
      });
      expect(result.skill_name).toBe('test');
      expect(result.description).toBe('A test');
      expect(result.name).toBeUndefined();
    });

    it('transforms values using valueMap', () => {
      const frontmatter = { description: 'An agent for testing' };
      const result = convertFrontmatter(frontmatter, {
        valueMap: { description: v => v.replace('agent', 'skill') },
      });
      expect(result.description).toBe('An skill for testing');
    });

    it('excludes keys in exclude list', () => {
      const frontmatter = { name: 'test', internal: 'secret', description: 'desc' };
      const result = convertFrontmatter(frontmatter, {
        exclude: ['internal'],
      });
      expect(result.name).toBe('test');
      expect(result.description).toBe('desc');
      expect(result.internal).toBeUndefined();
    });

    it('includes only keys in include list when specified', () => {
      const frontmatter = { name: 'test', description: 'desc', extra: 'data' };
      const result = convertFrontmatter(frontmatter, {
        include: ['name', 'description'],
      });
      expect(result.name).toBe('test');
      expect(result.description).toBe('desc');
      expect(result.extra).toBeUndefined();
    });

    it('applies defaults', () => {
      const frontmatter = { name: 'test' };
      const result = convertFrontmatter(frontmatter, {
        defaults: { version: '1.0', author: 'unknown' },
      });
      expect(result.name).toBe('test');
      expect(result.version).toBe('1.0');
      expect(result.author).toBe('unknown');
    });

    it('original values override defaults', () => {
      const frontmatter = { name: 'test', version: '2.0' };
      const result = convertFrontmatter(frontmatter, {
        defaults: { version: '1.0' },
      });
      expect(result.version).toBe('2.0');
    });

    it('returns empty object for null input', () => {
      const result = convertFrontmatter(null);
      expect(result).toEqual({});
    });

    it('returns empty object for undefined input', () => {
      const result = convertFrontmatter(undefined);
      expect(result).toEqual({});
    });

    it('returns defaults only for empty frontmatter', () => {
      const result = convertFrontmatter(
        {},
        {
          defaults: { version: '1.0' },
        }
      );
      expect(result).toEqual({ version: '1.0' });
    });
  });

  describe('injectContent', () => {
    it('delegates to content-injector module', () => {
      const content = 'Version: {{VERSION}}';
      const result = injectContent(content, {
        coreDir: '/path/to/agileflow',
        version: '2.0.0',
      });
      expect(result).toBe('Version: 2.0.0');
    });
  });

  describe('IDE_REPLACEMENTS', () => {
    it('has codex replacements', () => {
      expect(IDE_REPLACEMENTS.codex).toBeDefined();
      expect(IDE_REPLACEMENTS.codex['Claude Code']).toBe('Codex CLI');
      expect(IDE_REPLACEMENTS.codex['CLAUDE.md']).toBe('AGENTS.md');
      expect(IDE_REPLACEMENTS.codex['.claude/']).toBe('.codex/');
    });

    it('has cursor replacements', () => {
      expect(IDE_REPLACEMENTS.cursor).toBeDefined();
      expect(IDE_REPLACEMENTS.cursor['Claude Code']).toBe('Cursor');
      expect(IDE_REPLACEMENTS.cursor['.claude/']).toBe('.cursor/');
    });

    it('has windsurf replacements', () => {
      expect(IDE_REPLACEMENTS.windsurf).toBeDefined();
      expect(IDE_REPLACEMENTS.windsurf['Claude Code']).toBe('Windsurf');
      expect(IDE_REPLACEMENTS.windsurf['.claude/']).toBe('.windsurf/');
    });
  });

  describe('createDocsReplacements', () => {
    it('returns empty object when target is docs', () => {
      const result = createDocsReplacements('docs');
      expect(result).toEqual({});
    });

    it('creates replacement patterns for custom folder', () => {
      const result = createDocsReplacements('project-docs');
      expect(result['docs/']).toBe('project-docs/');
      expect(result['`docs/']).toBe('`project-docs/');
      expect(result['"docs/']).toBe('"project-docs/');
      expect(result["'docs/"]).toBe("'project-docs/");
      expect(result['(docs/']).toBe('(project-docs/');
      expect(result['[docs/']).toBe('[project-docs/');
    });
  });

  describe('transformForIde', () => {
    it('transforms content for codex', () => {
      const content = 'Use Claude Code with .claude/ folder';
      const result = transformForIde(content, 'codex');
      expect(result).toBe('Use Codex CLI with .codex/ folder');
    });

    it('transforms content for cursor', () => {
      const content = 'Use Claude Code with .claude/ folder';
      const result = transformForIde(content, 'cursor');
      expect(result).toBe('Use Cursor with .cursor/ folder');
    });

    it('transforms content for windsurf', () => {
      const content = 'Use Claude Code with .claude/ folder';
      const result = transformForIde(content, 'windsurf');
      expect(result).toBe('Use Windsurf with .windsurf/ folder');
    });

    it('applies docs folder replacements', () => {
      const content = 'See docs/ folder';
      const result = transformForIde(content, 'codex', { docsFolder: 'project-docs' });
      expect(result).toBe('See project-docs/ folder');
    });

    it('skips docs replacements when folder is docs', () => {
      const content = 'See docs/ folder';
      const result = transformForIde(content, 'codex', { docsFolder: 'docs' });
      expect(result).toBe('See docs/ folder');
    });

    it('applies additional replacements', () => {
      const content = 'Custom pattern here';
      const result = transformForIde(content, 'codex', {
        additionalReplacements: { Custom: 'Modified' },
      });
      expect(result).toBe('Modified pattern here');
    });

    it('handles unknown IDE gracefully', () => {
      const content = 'Content stays same';
      const result = transformForIde(content, 'unknown-ide');
      expect(result).toBe('Content stays same');
    });
  });
});
