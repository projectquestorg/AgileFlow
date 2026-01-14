/**
 * Tests for path traversal protection in validate.js
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {
  PathValidationError,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
  checkSymlinkChainDepth,
} = require('../../lib/validate');

describe('Path Traversal Protection', () => {
  let tempDir;

  beforeAll(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-path-test-'));

    // Create some test files and directories
    fs.mkdirSync(path.join(tempDir, 'subdir'));
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test content');
    fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.txt'), 'nested content');
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('PathValidationError', () => {
    it('creates error with all properties', () => {
      const error = new PathValidationError('Test error', '/bad/path', 'test_reason');
      expect(error.message).toBe('Test error');
      expect(error.inputPath).toBe('/bad/path');
      expect(error.reason).toBe('test_reason');
      expect(error.name).toBe('PathValidationError');
    });

    it('is instance of Error', () => {
      const error = new PathValidationError('test', 'path', 'reason');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('validatePath', () => {
    describe('valid paths', () => {
      it('accepts simple relative path', () => {
        const result = validatePath('test.txt', tempDir);
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(path.join(tempDir, 'test.txt'));
      });

      it('accepts nested relative path', () => {
        const result = validatePath('subdir/nested.txt', tempDir);
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(path.join(tempDir, 'subdir', 'nested.txt'));
      });

      it('accepts absolute path within base', () => {
        const absolutePath = path.join(tempDir, 'test.txt');
        const result = validatePath(absolutePath, tempDir);
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(absolutePath);
      });

      it('accepts base directory itself', () => {
        const result = validatePath('.', tempDir);
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(tempDir);
      });

      it('handles path with ./ prefix', () => {
        const result = validatePath('./test.txt', tempDir);
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(path.join(tempDir, 'test.txt'));
      });
    });

    describe('path traversal attacks', () => {
      it('rejects simple ../ traversal', () => {
        const result = validatePath('../', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects double ../ traversal', () => {
        const result = validatePath('../../', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects ../ with filename', () => {
        const result = validatePath('../etc/passwd', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects nested ../ traversal', () => {
        const result = validatePath('subdir/../../etc/passwd', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects triple ../ traversal', () => {
        const result = validatePath('../../../etc/passwd', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects absolute path outside base', () => {
        const result = validatePath('/etc/passwd', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });

      it('rejects path that looks like it stays in but escapes', () => {
        const result = validatePath('subdir/../../../etc/passwd', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });
    });

    describe('prefix attacks', () => {
      it('rejects path that is prefix of base but different directory', () => {
        // If base is /tmp/test, reject /tmp/test2
        const fakeParent = tempDir + '2';
        const result = validatePath(fakeParent + '/file.txt', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('path_traversal');
      });
    });

    describe('input validation', () => {
      it('rejects null path', () => {
        const result = validatePath(null, tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('invalid_input');
      });

      it('rejects undefined path', () => {
        const result = validatePath(undefined, tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('invalid_input');
      });

      it('rejects empty string path', () => {
        const result = validatePath('', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('invalid_input');
      });

      it('rejects non-string path', () => {
        const result = validatePath(123, tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('invalid_input');
      });

      it('rejects null base directory', () => {
        const result = validatePath('test.txt', null);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('invalid_base');
      });

      it('rejects relative base directory', () => {
        const result = validatePath('test.txt', './relative');
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('relative_base');
      });
    });

    describe('mustExist option', () => {
      it('passes when file exists and mustExist=true', () => {
        const result = validatePath('test.txt', tempDir, { mustExist: true });
        expect(result.ok).toBe(true);
      });

      it('fails when file does not exist and mustExist=true', () => {
        const result = validatePath('nonexistent.txt', tempDir, { mustExist: true });
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('not_found');
      });

      it('passes when file does not exist and mustExist=false', () => {
        const result = validatePath('nonexistent.txt', tempDir, { mustExist: false });
        expect(result.ok).toBe(true);
      });
    });

    describe('symlink handling', () => {
      let symlinkPath;
      let symlinkDirPath;
      let symlinkEscapePath;

      beforeAll(() => {
        // Create symlinks for testing (skip on Windows)
        if (process.platform !== 'win32') {
          // Symlink within base - should be allowed with allowSymlinks=true
          symlinkPath = path.join(tempDir, 'symlink.txt');
          try {
            fs.symlinkSync(path.join(tempDir, 'test.txt'), symlinkPath);
          } catch {
            // Symlink creation may fail on some systems
          }

          // Symlink to directory within base
          symlinkDirPath = path.join(tempDir, 'symlink-dir');
          try {
            fs.symlinkSync(path.join(tempDir, 'subdir'), symlinkDirPath);
          } catch {
            // Symlink creation may fail
          }

          // Symlink that escapes to outside base - should always be rejected
          symlinkEscapePath = path.join(tempDir, 'escape-link');
          try {
            fs.symlinkSync('/etc/passwd', symlinkEscapePath);
          } catch {
            // Symlink creation may fail
          }
        }
      });

      afterAll(() => {
        if (symlinkPath && fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        if (symlinkDirPath && fs.existsSync(symlinkDirPath)) {
          fs.unlinkSync(symlinkDirPath);
        }
        if (symlinkEscapePath && fs.existsSync(symlinkEscapePath)) {
          fs.unlinkSync(symlinkEscapePath);
        }
      });

      it('rejects symlinks when allowSymlinks=false (default)', () => {
        if (process.platform === 'win32' || !fs.existsSync(symlinkPath)) {
          return; // Skip on Windows or if symlink wasn't created
        }
        const result = validatePath('symlink.txt', tempDir);
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('symlink_rejected');
      });

      it('accepts symlinks to targets within base when allowSymlinks=true', () => {
        if (process.platform === 'win32' || !fs.existsSync(symlinkPath)) {
          return;
        }
        const result = validatePath('symlink.txt', tempDir, { allowSymlinks: true });
        expect(result.ok).toBe(true);
        expect(result.resolvedPath).toBe(symlinkPath);
        // Should also return the real path
        expect(result.realPath).toBe(path.join(tempDir, 'test.txt'));
      });

      it('rejects symlinks escaping base even with allowSymlinks=true', () => {
        if (process.platform === 'win32' || !fs.existsSync(symlinkEscapePath)) {
          return;
        }
        const result = validatePath('escape-link', tempDir, { allowSymlinks: true });
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('symlink_escape');
      });

      it('returns realPath for symlinks within base', () => {
        if (process.platform === 'win32' || !fs.existsSync(symlinkDirPath)) {
          return;
        }
        const result = validatePath('symlink-dir', tempDir, { allowSymlinks: true });
        expect(result.ok).toBe(true);
        expect(result.realPath).toBe(path.join(tempDir, 'subdir'));
      });
    });
  });

  describe('validatePathSync', () => {
    it('returns path for valid input', () => {
      const result = validatePathSync('test.txt', tempDir);
      expect(result).toBe(path.join(tempDir, 'test.txt'));
    });

    it('throws PathValidationError for traversal attempt', () => {
      expect(() => {
        validatePathSync('../etc/passwd', tempDir);
      }).toThrow(PathValidationError);
    });

    it('throws with correct reason', () => {
      try {
        validatePathSync('../etc/passwd', tempDir);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error.reason).toBe('path_traversal');
      }
    });
  });

  describe('hasUnsafePathPatterns', () => {
    it('returns safe for normal paths', () => {
      expect(hasUnsafePathPatterns('file.txt').safe).toBe(true);
      expect(hasUnsafePathPatterns('subdir/file.txt').safe).toBe(true);
    });

    it('detects null bytes', () => {
      const result = hasUnsafePathPatterns('file\x00.txt');
      expect(result.safe).toBe(false);
      expect(result.reason).toBe('null_byte');
    });

    it('detects double dot sequences', () => {
      const result = hasUnsafePathPatterns('../etc/passwd');
      expect(result.safe).toBe(false);
      expect(result.reason).toBe('dot_dot_sequence');
    });

    it('detects Windows absolute paths', () => {
      const result = hasUnsafePathPatterns('C:\\Windows\\System32');
      expect(result.safe).toBe(false);
      expect(result.reason).toBe('windows_absolute');
    });

    it('handles invalid input', () => {
      expect(hasUnsafePathPatterns(null).safe).toBe(false);
      expect(hasUnsafePathPatterns(undefined).safe).toBe(false);
      expect(hasUnsafePathPatterns('').safe).toBe(false);
    });
  });

  describe('sanitizeFilename', () => {
    it('returns clean filenames unchanged', () => {
      expect(sanitizeFilename('file.txt')).toBe('file.txt');
      expect(sanitizeFilename('my-document.md')).toBe('my-document.md');
    });

    it('removes dangerous characters', () => {
      expect(sanitizeFilename('file<script>.txt')).toBe('file_script_.txt');
      expect(sanitizeFilename('file:name.txt')).toBe('file_name.txt');
      expect(sanitizeFilename('file|pipe.txt')).toBe('file_pipe.txt');
    });

    it('replaces double dots', () => {
      expect(sanitizeFilename('file..txt')).toBe('file_txt');
      expect(sanitizeFilename('../passwd')).toBe('__passwd');
    });

    it('replaces leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('_hidden');
      expect(sanitizeFilename('..dotdot')).toBe('_dotdot');
    });

    it('replaces leading dashes', () => {
      expect(sanitizeFilename('-flag')).toBe('_flag');
      expect(sanitizeFilename('--option')).toBe('_option');
    });

    it('truncates long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result.endsWith('.txt')).toBe(true);
    });

    it('handles custom replacement character', () => {
      expect(sanitizeFilename('file<>.txt', { replacement: '-' })).toBe('file--.txt');
    });

    it('handles empty input', () => {
      expect(sanitizeFilename('')).toBe('');
      expect(sanitizeFilename(null)).toBe('');
      expect(sanitizeFilename(undefined)).toBe('');
    });
  });

  describe('real-world attack vectors', () => {
    it('blocks %2e%2e URL-encoded traversal (after decoding)', () => {
      // If URL decoding happens before validation
      const decoded = decodeURIComponent('%2e%2e%2f%2e%2e%2fetc%2fpasswd');
      const result = validatePath(decoded, tempDir);
      expect(result.ok).toBe(false);
    });

    it('handles ....// as literal directory name (not traversal)', () => {
      // ....// is NOT a traversal attempt - it's a literal directory name with 4 dots
      // path.resolve treats it as tempDir/..../etc/passwd (literal subdirectory)
      // This is correct behavior - the path stays within base
      const result = validatePath('....//etc/passwd', tempDir);
      expect(result.ok).toBe(true); // Stays within tempDir as literal subpath
    });

    it('handles backslashes as literal characters on Unix', () => {
      // On Unix, backslashes are valid filename characters, not path separators
      // So ..\\..\\etc\\passwd is a literal filename containing backslashes
      const result = validatePath('..\\..\\etc\\passwd', tempDir);
      if (process.platform === 'win32') {
        // On Windows, backslashes ARE path separators, so this would escape
        expect(result.ok).toBe(false);
      } else {
        // On Unix, this is a literal filename containing backslash characters
        // It stays within the base directory
        expect(result.ok).toBe(true);
      }
    });

    it('blocks /absolute/path inside base name', () => {
      // e.g., if someone tries tempDir/../../../etc/passwd
      const malicious = tempDir + '/../../../etc/passwd';
      const result = validatePath(malicious, tempDir);
      expect(result.ok).toBe(false);
    });

    it('blocks paths with embedded nulls', () => {
      // Null bytes in paths can truncate strings in some C-based systems
      const quickCheck = hasUnsafePathPatterns('valid\x00/../../../etc/passwd');
      expect(quickCheck.safe).toBe(false);
    });
  });

  describe('checkSymlinkChainDepth', () => {
    let symlinkTestDir;

    beforeAll(() => {
      // Create a temp directory for symlink chain tests
      symlinkTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-chain-test-'));
    });

    afterAll(() => {
      fs.rmSync(symlinkTestDir, { recursive: true, force: true });
    });

    it('returns depth 0 for regular files', () => {
      const filePath = path.join(symlinkTestDir, 'regular.txt');
      fs.writeFileSync(filePath, 'content');

      const result = checkSymlinkChainDepth(filePath, 3);
      expect(result.ok).toBe(true);
      expect(result.depth).toBe(0);
    });

    it('returns depth 0 for non-existent files', () => {
      const result = checkSymlinkChainDepth(path.join(symlinkTestDir, 'nonexistent'), 3);
      expect(result.ok).toBe(true);
      expect(result.depth).toBe(0);
    });

    // Skip symlink tests on Windows
    const describeSymlinks = process.platform === 'win32' ? describe.skip : describe;

    describeSymlinks('symlink chains (Unix only)', () => {
      let targetFile;
      let link1, link2, link3, link4;

      beforeAll(() => {
        // Create target file and symlink chain
        targetFile = path.join(symlinkTestDir, 'target.txt');
        fs.writeFileSync(targetFile, 'target content');

        // Create symlink chain: link1 -> link2 -> link3 -> target
        link3 = path.join(symlinkTestDir, 'link3');
        fs.symlinkSync(targetFile, link3);

        link2 = path.join(symlinkTestDir, 'link2');
        fs.symlinkSync(link3, link2);

        link1 = path.join(symlinkTestDir, 'link1');
        fs.symlinkSync(link2, link1);

        // Create a 4th link for depth > 3
        link4 = path.join(symlinkTestDir, 'link4');
        fs.symlinkSync(link1, link4);
      });

      afterAll(() => {
        [link4, link1, link2, link3, targetFile].forEach(p => {
          try {
            fs.unlinkSync(p);
          } catch {
            // ignore
          }
        });
      });

      it('counts symlink depth correctly (depth 1)', () => {
        const result = checkSymlinkChainDepth(link3, 3);
        expect(result.ok).toBe(true);
        expect(result.depth).toBe(1);
      });

      it('counts symlink depth correctly (depth 2)', () => {
        const result = checkSymlinkChainDepth(link2, 3);
        expect(result.ok).toBe(true);
        expect(result.depth).toBe(2);
      });

      it('counts symlink depth correctly (depth 3)', () => {
        const result = checkSymlinkChainDepth(link1, 3);
        expect(result.ok).toBe(true);
        expect(result.depth).toBe(3);
      });

      it('rejects symlink chain depth > maxDepth', () => {
        const result = checkSymlinkChainDepth(link4, 3);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      });

      it('allows chain at exactly maxDepth', () => {
        const result = checkSymlinkChainDepth(link1, 3);
        expect(result.ok).toBe(true);
        expect(result.depth).toBe(3);
      });

      it('rejects chain at maxDepth+1', () => {
        const result = checkSymlinkChainDepth(link4, 3);
        expect(result.ok).toBe(false);
      });
    });

    describeSymlinks('circular symlinks (Unix only)', () => {
      let circularDir;
      let circA, circB;

      beforeAll(() => {
        circularDir = path.join(symlinkTestDir, 'circular');
        fs.mkdirSync(circularDir);

        // Create circular symlinks: A -> B -> A
        circA = path.join(circularDir, 'circA');
        circB = path.join(circularDir, 'circB');

        // Create B first pointing to where A will be
        fs.symlinkSync(circA, circB);
        // Then create A pointing to B
        fs.symlinkSync(circB, circA);
      });

      afterAll(() => {
        try {
          fs.unlinkSync(circA);
          fs.unlinkSync(circB);
          fs.rmdirSync(circularDir);
        } catch {
          // ignore
        }
      });

      it('detects circular symlinks', () => {
        const result = checkSymlinkChainDepth(circA, 10);
        expect(result.ok).toBe(false);
        expect(result.isCircular).toBe(true);
        expect(result.error).toContain('Circular symlink');
      });
    });
  });

  describe('validatePath with maxSymlinkDepth', () => {
    // Skip symlink tests on Windows
    const describeSymlinks = process.platform === 'win32' ? describe.skip : describe;

    describeSymlinks('symlink chain depth validation (Unix only)', () => {
      let chainTestDir;
      let targetFile;
      let link1, link2, link3, link4;

      beforeAll(() => {
        chainTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-depth-test-'));

        // Create target and chain
        targetFile = path.join(chainTestDir, 'target.txt');
        fs.writeFileSync(targetFile, 'content');

        link3 = path.join(chainTestDir, 'link3');
        fs.symlinkSync(targetFile, link3);

        link2 = path.join(chainTestDir, 'link2');
        fs.symlinkSync(link3, link2);

        link1 = path.join(chainTestDir, 'link1');
        fs.symlinkSync(link2, link1);

        link4 = path.join(chainTestDir, 'link4');
        fs.symlinkSync(link1, link4);
      });

      afterAll(() => {
        fs.rmSync(chainTestDir, { recursive: true, force: true });
      });

      it('allows symlink chain within depth limit', () => {
        const result = validatePath('link1', chainTestDir, {
          allowSymlinks: true,
          maxSymlinkDepth: 3,
        });
        expect(result.ok).toBe(true);
      });

      it('rejects symlink chain exceeding depth limit', () => {
        const result = validatePath('link4', chainTestDir, {
          allowSymlinks: true,
          maxSymlinkDepth: 3,
        });
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('symlink_chain_too_deep');
      });

      it('uses default maxSymlinkDepth of 3', () => {
        // link4 has depth 4, default is 3
        const result = validatePath('link4', chainTestDir, {
          allowSymlinks: true,
        });
        expect(result.ok).toBe(false);
        expect(result.error.reason).toBe('symlink_chain_too_deep');
      });

      it('allows custom maxSymlinkDepth', () => {
        // link4 has depth 4, set limit to 5
        const result = validatePath('link4', chainTestDir, {
          allowSymlinks: true,
          maxSymlinkDepth: 5,
        });
        expect(result.ok).toBe(true);
      });
    });
  });
});
