/**
 * Tests for validate-names.js - Name/ID validation patterns
 */

const {
  PATTERNS,
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
  isValidMergeStrategy,
} = require('../../lib/validate-names');

describe('validate-names', () => {
  describe('PATTERNS', () => {
    it('exports all expected patterns', () => {
      expect(PATTERNS.branchName).toBeInstanceOf(RegExp);
      expect(PATTERNS.storyId).toBeInstanceOf(RegExp);
      expect(PATTERNS.epicId).toBeInstanceOf(RegExp);
      expect(PATTERNS.featureName).toBeInstanceOf(RegExp);
      expect(PATTERNS.profileName).toBeInstanceOf(RegExp);
      expect(PATTERNS.commandName).toBeInstanceOf(RegExp);
      expect(PATTERNS.sessionNickname).toBeInstanceOf(RegExp);
      expect(PATTERNS.mergeStrategy).toBeInstanceOf(RegExp);
    });
  });

  describe('isValidBranchName', () => {
    describe('valid branch names', () => {
      it.each([
        ['main'],
        ['master'],
        ['develop'],
        ['feature/US-0001'],
        ['feature/add-login'],
        ['fix/bug-123'],
        ['release/v1'],
        ['hotfix/critical-fix'],
        ['session-1'],
        ['my_branch'],
        ['feature/US-0001-add-feature'],
        ['a1b2c3'],
        ['Branch123'],
      ])('accepts "%s"', name => {
        expect(isValidBranchName(name)).toBe(true);
      });
    });

    describe('invalid branch names', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['-starts-with-dash', 'starts with dash'],
        ['contains..double-dots', 'contains ..'],
        ['ends.lock', 'ends with .lock'],
        ['has spaces', 'contains spaces'],
        ['has$pecial', 'contains special chars'],
        ['has@symbol', 'contains @'],
        ['has*star', 'contains *'],
        ['has?question', 'contains ?'],
        ['has[bracket', 'contains ['],
        ['has\\backslash', 'contains backslash'],
      ])('rejects %s (%s)', (name, _reason) => {
        expect(isValidBranchName(name)).toBe(false);
      });

      it('rejects names longer than 255 characters', () => {
        const longName = 'a'.repeat(256);
        expect(isValidBranchName(longName)).toBe(false);
      });

      it('accepts names exactly 255 characters', () => {
        const maxName = 'a'.repeat(255);
        expect(isValidBranchName(maxName)).toBe(true);
      });
    });
  });

  describe('isValidStoryId', () => {
    describe('valid story IDs', () => {
      it.each([['US-0001'], ['US-0123'], ['US-9999'], ['US-12345'], ['US-00001']])(
        'accepts "%s"',
        id => {
          expect(isValidStoryId(id)).toBe(true);
        }
      );
    });

    describe('invalid story IDs', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['US-001', 'too few digits'],
        ['US-123456', 'too many digits'],
        ['us-0001', 'lowercase US'],
        ['EP-0001', 'wrong prefix (EP)'],
        ['US0001', 'missing dash'],
        ['US-ABCD', 'letters instead of digits'],
        [' US-0001', 'leading space'],
        ['US-0001 ', 'trailing space'],
      ])('rejects %s (%s)', (id, _reason) => {
        expect(isValidStoryId(id)).toBe(false);
      });
    });
  });

  describe('isValidEpicId', () => {
    describe('valid epic IDs', () => {
      it.each([['EP-0001'], ['EP-0123'], ['EP-9999'], ['EP-12345'], ['EP-00001']])(
        'accepts "%s"',
        id => {
          expect(isValidEpicId(id)).toBe(true);
        }
      );
    });

    describe('invalid epic IDs', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['EP-001', 'too few digits'],
        ['EP-123456', 'too many digits'],
        ['ep-0001', 'lowercase EP'],
        ['US-0001', 'wrong prefix (US)'],
        ['EP0001', 'missing dash'],
        ['EP-ABCD', 'letters instead of digits'],
      ])('rejects %s (%s)', (id, _reason) => {
        expect(isValidEpicId(id)).toBe(false);
      });
    });
  });

  describe('isValidFeatureName', () => {
    describe('valid feature names', () => {
      it.each([
        ['damage-control'],
        ['status-line'],
        ['archival'],
        ['a'],
        ['feature1'],
        ['my-feature-name'],
        ['a1b2c3'],
      ])('accepts "%s"', name => {
        expect(isValidFeatureName(name)).toBe(true);
      });
    });

    describe('invalid feature names', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['Uppercase', 'contains uppercase'],
        ['ALLCAPS', 'all uppercase'],
        ['has_underscore', 'contains underscore'],
        ['1startswithnumber', 'starts with number'],
        ['-startwithdash', 'starts with dash'],
        ['has space', 'contains space'],
        ['has.dot', 'contains dot'],
      ])('rejects %s (%s)', (name, _reason) => {
        expect(isValidFeatureName(name)).toBe(false);
      });

      it('rejects names longer than 50 characters', () => {
        const longName = 'a' + '-abc'.repeat(20); // > 50 chars
        expect(isValidFeatureName(longName)).toBe(false);
      });

      it('accepts names exactly 50 characters', () => {
        const maxName = 'a'.repeat(50);
        expect(isValidFeatureName(maxName)).toBe(true);
      });
    });
  });

  describe('isValidProfileName', () => {
    describe('valid profile names', () => {
      it.each([
        ['default'],
        ['my-profile'],
        ['dev_config'],
        ['Profile1'],
        ['a'],
        ['ABC'],
        ['test123'],
        ['Test_Profile-1'],
      ])('accepts "%s"', name => {
        expect(isValidProfileName(name)).toBe(true);
      });
    });

    describe('invalid profile names', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['1profile', 'starts with number'],
        ['-profile', 'starts with dash'],
        ['_profile', 'starts with underscore'],
        ['has space', 'contains space'],
        ['has.dot', 'contains dot'],
        ['has@at', 'contains @'],
      ])('rejects %s (%s)', (name, _reason) => {
        expect(isValidProfileName(name)).toBe(false);
      });

      it('rejects names longer than 50 characters', () => {
        const longName = 'a'.repeat(51);
        expect(isValidProfileName(longName)).toBe(false);
      });
    });
  });

  describe('isValidCommandName', () => {
    describe('valid command names', () => {
      it.each([
        ['babysit'],
        ['story:list'],
        ['agileflow:configure'],
        ['research/ask'],
        ['command-name'],
        ['cmd1'],
        ['a'],
        ['status:show:all'],
        ['path/to/command'],
      ])('accepts "%s"', name => {
        expect(isValidCommandName(name)).toBe(true);
      });
    });

    describe('invalid command names', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['1command', 'starts with number'],
        [':command', 'starts with colon'],
        ['/command', 'starts with slash'],
        ['-command', 'starts with dash'],
        ['has space', 'contains space'],
        ['has.dot', 'contains dot'],
        ['has_underscore', 'contains underscore'],
      ])('rejects %s (%s)', (name, _reason) => {
        expect(isValidCommandName(name)).toBe(false);
      });

      it('rejects names longer than 100 characters', () => {
        const longName = 'a'.repeat(101);
        expect(isValidCommandName(longName)).toBe(false);
      });
    });
  });

  describe('isValidSessionNickname', () => {
    describe('valid session nicknames', () => {
      it.each([
        ['auth-work'],
        ['feature_1'],
        ['main'],
        ['session1'],
        ['a'],
        ['1session'],
        ['TEST'],
        ['Session-Test_123'],
      ])('accepts "%s"', name => {
        expect(isValidSessionNickname(name)).toBe(true);
      });
    });

    describe('invalid session nicknames', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['-starts-dash', 'starts with dash'],
        ['_starts-underscore', 'starts with underscore'],
        ['has space', 'contains space'],
        ['has.dot', 'contains dot'],
        ['has@at', 'contains @'],
        ['has:colon', 'contains colon'],
      ])('rejects %s (%s)', (name, _reason) => {
        expect(isValidSessionNickname(name)).toBe(false);
      });

      it('rejects names longer than 50 characters', () => {
        const longName = 'a'.repeat(51);
        expect(isValidSessionNickname(longName)).toBe(false);
      });
    });
  });

  describe('isValidMergeStrategy', () => {
    describe('valid merge strategies', () => {
      it('accepts squash', () => {
        expect(isValidMergeStrategy('squash')).toBe(true);
      });

      it('accepts merge', () => {
        expect(isValidMergeStrategy('merge')).toBe(true);
      });
    });

    describe('invalid merge strategies', () => {
      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        [123, 'number'],
        ['rebase', 'rebase (not allowed)'],
        ['SQUASH', 'uppercase SQUASH'],
        ['MERGE', 'uppercase MERGE'],
        ['squash ', 'trailing space'],
        [' merge', 'leading space'],
        ['fast-forward', 'fast-forward'],
      ])('rejects %s (%s)', (strategy, _reason) => {
        expect(isValidMergeStrategy(strategy)).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('handles object input', () => {
      expect(isValidBranchName({})).toBe(false);
      expect(isValidStoryId({})).toBe(false);
      expect(isValidEpicId({})).toBe(false);
    });

    it('handles array input', () => {
      expect(isValidBranchName(['main'])).toBe(false);
      expect(isValidFeatureName(['feature'])).toBe(false);
    });

    it('handles boolean input', () => {
      expect(isValidBranchName(true)).toBe(false);
      expect(isValidProfileName(false)).toBe(false);
    });

    it('handles whitespace-only strings', () => {
      expect(isValidBranchName('   ')).toBe(false);
      expect(isValidStoryId('\t\n')).toBe(false);
    });
  });
});
