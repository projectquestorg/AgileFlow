/**
 * Tests for counter.js - Component counting module
 *
 * Tests all 5 exported functions:
 * - countCommands (with subdirectory support)
 * - countAgents
 * - countSkills (recursive SKILL.md detection)
 * - getCounts
 * - getSourceCounts
 */

const path = require('path');
const fs = require('fs');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

const {
  countCommands,
  countAgents,
  countSkills,
  getCounts,
  getSourceCounts,
} = require('../../../scripts/lib/counter');

describe('counter.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('countCommands', () => {
    it('returns 0 when directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = countCommands('/fake/commands');

      expect(result).toBe(0);
      expect(fs.existsSync).toHaveBeenCalledWith('/fake/commands');
    });

    it('counts only .md files in root directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        { name: 'help.md', isFile: () => true, isDirectory: () => false },
        { name: 'status.md', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: '.gitkeep', isFile: () => true, isDirectory: () => false },
      ]);

      const result = countCommands('/commands');

      expect(result).toBe(2);
    });

    it('counts .md files in subdirectories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce([
          { name: 'help.md', isFile: () => true, isDirectory: () => false },
          { name: 'session', isFile: () => false, isDirectory: () => true },
        ])
        .mockReturnValueOnce(['new.md', 'end.md', 'status.md']);

      const result = countCommands('/commands');

      expect(result).toBe(4); // 1 root + 3 in session/
      expect(fs.readdirSync).toHaveBeenCalledTimes(2);
    });

    it('handles multiple subdirectories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce([
          { name: 'help.md', isFile: () => true, isDirectory: () => false },
          { name: 'session', isFile: () => false, isDirectory: () => true },
          { name: 'roadmap', isFile: () => false, isDirectory: () => true },
        ])
        .mockReturnValueOnce(['new.md', 'end.md'])
        .mockReturnValueOnce(['analyze.md']);

      const result = countCommands('/commands');

      expect(result).toBe(4); // 1 root + 2 session + 1 roadmap
    });

    it('handles empty directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const result = countCommands('/empty');

      expect(result).toBe(0);
    });

    it('handles subdirectory with no .md files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce([
          { name: 'session', isFile: () => false, isDirectory: () => true },
        ])
        .mockReturnValueOnce(['readme.txt', 'config.json']);

      const result = countCommands('/commands');

      expect(result).toBe(0);
    });
  });

  describe('countAgents', () => {
    it('returns 0 when directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = countAgents('/fake/agents');

      expect(result).toBe(0);
      expect(fs.existsSync).toHaveBeenCalledWith('/fake/agents');
    });

    it('counts only .md files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'security.md',
        'performance.md',
        'api.md',
        'readme.txt',
        '.gitkeep',
      ]);

      const result = countAgents('/agents');

      expect(result).toBe(3);
    });

    it('handles empty directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const result = countAgents('/empty');

      expect(result).toBe(0);
    });

    it('handles directory with no .md files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['config.json', 'readme.txt', '.DS_Store']);

      const result = countAgents('/agents');

      expect(result).toBe(0);
    });
  });

  describe('countSkills', () => {
    it('returns 0 when directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = countSkills('/fake/skills');

      expect(result).toBe(0);
    });

    it('counts directories containing SKILL.md', () => {
      fs.existsSync.mockImplementation((p) => {
        // Directory exists
        if (p === '/skills') return true;
        // SKILL.md files exist
        if (p === '/skills/pdf/SKILL.md') return true;
        if (p === '/skills/xlsx/SKILL.md') return true;
        return false;
      });

      fs.readdirSync.mockImplementation((dir) => {
        if (dir === '/skills') {
          return [
            { name: 'pdf', isFile: () => false, isDirectory: () => true },
            { name: 'xlsx', isFile: () => false, isDirectory: () => true },
            { name: 'readme.md', isFile: () => true, isDirectory: () => false },
          ];
        }
        // Empty subdirectories (no nested skills)
        return [];
      });

      const result = countSkills('/skills');

      expect(result).toBe(2);
    });

    it('recursively counts nested skill directories', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === '/skills') return true;
        if (p === '/skills/office/SKILL.md') return false; // Parent has no skill
        if (p === '/skills/office/pdf/SKILL.md') return true;
        if (p === '/skills/office/xlsx/SKILL.md') return true;
        return false;
      });

      fs.readdirSync.mockImplementation((dir) => {
        if (dir === '/skills') {
          return [
            { name: 'office', isFile: () => false, isDirectory: () => true },
          ];
        }
        if (dir === '/skills/office') {
          return [
            { name: 'pdf', isFile: () => false, isDirectory: () => true },
            { name: 'xlsx', isFile: () => false, isDirectory: () => true },
          ];
        }
        return [];
      });

      const result = countSkills('/skills');

      expect(result).toBe(2);
    });

    it('handles empty skills directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const result = countSkills('/skills');

      expect(result).toBe(0);
    });

    it('handles directories without SKILL.md', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === '/skills') return true;
        // No SKILL.md files
        return false;
      });

      fs.readdirSync.mockImplementation((dir) => {
        if (dir === '/skills') {
          return [
            { name: 'incomplete', isFile: () => false, isDirectory: () => true },
          ];
        }
        // Return empty array for subdirectories to stop recursion
        return [];
      });

      const result = countSkills('/skills');

      expect(result).toBe(0);
    });
  });

  describe('getCounts', () => {
    it('returns counts for all component types', () => {
      fs.existsSync.mockReturnValue(true);

      // Commands directory
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (dir.endsWith('commands') && opts?.withFileTypes) {
          return [
            { name: 'help.md', isFile: () => true, isDirectory: () => false },
            { name: 'status.md', isFile: () => true, isDirectory: () => false },
          ];
        }
        if (dir.endsWith('agents')) {
          return ['api.md', 'security.md', 'performance.md'];
        }
        if (dir.endsWith('skills') && opts?.withFileTypes) {
          return [];
        }
        return [];
      });

      const result = getCounts('/core');

      expect(result).toEqual({
        commands: 2,
        agents: 3,
        skills: 0,
      });
    });

    it('handles missing directories gracefully', () => {
      fs.existsSync.mockReturnValue(false);

      const result = getCounts('/missing');

      expect(result).toEqual({
        commands: 0,
        agents: 0,
        skills: 0,
      });
    });
  });

  describe('getSourceCounts', () => {
    it('calls getCounts with correct path', () => {
      fs.existsSync.mockReturnValue(false);

      const result = getSourceCounts('/packages/cli');

      // Should look in src/core subdirectory
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join('/packages/cli', 'src', 'core', 'commands')
      );

      expect(result).toEqual({
        commands: 0,
        agents: 0,
        skills: 0,
      });
    });
  });
});
