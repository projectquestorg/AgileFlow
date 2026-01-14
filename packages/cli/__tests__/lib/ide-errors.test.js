/**
 * Tests for IDE typed error classes.
 */

const {
  IdeError,
  IdeConfigNotFoundError,
  CommandInstallationError,
  FilePermissionError,
  ContentInjectionError,
  CleanupError,
  IdeDetectionError,
  withPermissionHandling,
  isIdeError,
} = require('../../tools/cli/lib/ide-errors');

describe('ide-errors', () => {
  describe('IdeError (base class)', () => {
    it('creates error with message and IDE name', () => {
      const error = new IdeError('Something failed', 'TestIDE');
      expect(error.message).toBe('Something failed');
      expect(error.ideName).toBe('TestIDE');
      expect(error.name).toBe('IdeError');
    });

    it('includes context object', () => {
      const error = new IdeError('Failed', 'TestIDE', { foo: 'bar' });
      expect(error.context).toEqual({ foo: 'bar' });
    });

    it('provides user-friendly message', () => {
      const error = new IdeError('Something failed', 'Claude Code');
      expect(error.getUserMessage()).toBe('Claude Code: Something failed');
    });

    it('is instance of Error', () => {
      const error = new IdeError('test', 'IDE');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('IdeConfigNotFoundError', () => {
    it('creates error with config path', () => {
      const error = new IdeConfigNotFoundError('Cursor', '/project/.cursor');
      expect(error.message).toBe('Configuration directory not found: /project/.cursor');
      expect(error.ideName).toBe('Cursor');
      expect(error.configPath).toBe('/project/.cursor');
      expect(error.name).toBe('IdeConfigNotFoundError');
    });

    it('provides suggested action', () => {
      const error = new IdeConfigNotFoundError('Cursor', '.cursor');
      expect(error.getSuggestedAction()).toContain('.cursor');
    });

    it('is instance of IdeError', () => {
      const error = new IdeConfigNotFoundError('IDE', '/path');
      expect(error).toBeInstanceOf(IdeError);
    });
  });

  describe('CommandInstallationError', () => {
    it('creates error with command name and reason', () => {
      const error = new CommandInstallationError('Claude Code', 'babysit.md', 'disk full');
      expect(error.message).toBe("Failed to install command 'babysit.md': disk full");
      expect(error.ideName).toBe('Claude Code');
      expect(error.commandName).toBe('babysit.md');
      expect(error.reason).toBe('disk full');
    });

    it('provides disk-related suggestion for disk errors', () => {
      const error = new CommandInstallationError('IDE', 'cmd', 'disk full');
      expect(error.getSuggestedAction()).toContain('disk space');
    });

    it('provides permission suggestion for permission errors', () => {
      const error = new CommandInstallationError('IDE', 'cmd', 'permission denied');
      expect(error.getSuggestedAction()).toContain('permission');
    });

    it('provides generic suggestion for other errors', () => {
      const error = new CommandInstallationError('IDE', 'cmd', 'unknown error');
      expect(error.getSuggestedAction()).toContain('again');
    });
  });

  describe('FilePermissionError', () => {
    it('creates error with file path and operation', () => {
      const error = new FilePermissionError('Windsurf', '/path/to/file', 'write');
      expect(error.message).toBe("Permission denied: cannot write '/path/to/file'");
      expect(error.filePath).toBe('/path/to/file');
      expect(error.operation).toBe('write');
    });

    it('supports different operations', () => {
      const readError = new FilePermissionError('IDE', '/file', 'read');
      expect(readError.message).toContain('cannot read');

      const deleteError = new FilePermissionError('IDE', '/file', 'delete');
      expect(deleteError.message).toContain('cannot delete');
    });

    it('provides suggested action', () => {
      const error = new FilePermissionError('IDE', '/path/to/file', 'write');
      expect(error.getSuggestedAction()).toContain('/path/to/file');
    });
  });

  describe('ContentInjectionError', () => {
    it('creates error with template file and reason', () => {
      const error = new ContentInjectionError('Claude Code', 'babysit.md', 'placeholder not found');
      expect(error.message).toBe(
        "Content injection failed for 'babysit.md': placeholder not found"
      );
      expect(error.templateFile).toBe('babysit.md');
      expect(error.reason).toBe('placeholder not found');
    });
  });

  describe('CleanupError', () => {
    it('creates error with target path and reason', () => {
      const error = new CleanupError('Cursor', '/project/.cursor/commands/AgileFlow', 'locked');
      expect(error.message).toBe(
        "Cleanup failed for '/project/.cursor/commands/AgileFlow': locked"
      );
      expect(error.targetPath).toBe('/project/.cursor/commands/AgileFlow');
      expect(error.reason).toBe('locked');
    });
  });

  describe('IdeDetectionError', () => {
    it('creates error with reason', () => {
      const error = new IdeDetectionError('Generic', 'multiple configs found');
      expect(error.message).toBe('IDE detection failed: multiple configs found');
      expect(error.reason).toBe('multiple configs found');
    });
  });

  describe('withPermissionHandling', () => {
    it('returns result when function succeeds', async () => {
      const result = await withPermissionHandling('IDE', '/path', 'read', async () => 'success');
      expect(result).toBe('success');
    });

    it('converts EACCES to FilePermissionError', async () => {
      const eaccessError = new Error('access denied');
      eaccessError.code = 'EACCES';

      await expect(
        withPermissionHandling('Claude Code', '/path', 'write', async () => {
          throw eaccessError;
        })
      ).rejects.toThrow(FilePermissionError);
    });

    it('converts EPERM to FilePermissionError', async () => {
      const epermError = new Error('operation not permitted');
      epermError.code = 'EPERM';

      await expect(
        withPermissionHandling('Cursor', '/file', 'read', async () => {
          throw epermError;
        })
      ).rejects.toThrow(FilePermissionError);
    });

    it('re-throws other errors unchanged', async () => {
      const otherError = new Error('some other error');
      otherError.code = 'ENOENT';

      await expect(
        withPermissionHandling('IDE', '/path', 'read', async () => {
          throw otherError;
        })
      ).rejects.toThrow('some other error');
    });

    it('preserves operation type in FilePermissionError', async () => {
      const error = new Error('denied');
      error.code = 'EACCES';

      try {
        await withPermissionHandling('IDE', '/path', 'delete', async () => {
          throw error;
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e.operation).toBe('delete');
      }
    });
  });

  describe('isIdeError', () => {
    it('returns true for IdeError instances', () => {
      expect(isIdeError(new IdeError('msg', 'IDE'))).toBe(true);
      expect(isIdeError(new IdeConfigNotFoundError('IDE', '/path'))).toBe(true);
      expect(isIdeError(new CommandInstallationError('IDE', 'cmd', 'reason'))).toBe(true);
      expect(isIdeError(new FilePermissionError('IDE', '/path', 'read'))).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isIdeError(new Error('regular error'))).toBe(false);
      expect(isIdeError(new TypeError('type error'))).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isIdeError(null)).toBe(false);
      expect(isIdeError(undefined)).toBe(false);
      expect(isIdeError('string')).toBe(false);
      expect(isIdeError({})).toBe(false);
    });
  });
});
