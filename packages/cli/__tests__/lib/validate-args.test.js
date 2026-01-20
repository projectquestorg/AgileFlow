/**
 * Tests for validate-args.js - CLI argument validation utilities
 */

const {
  isPositiveInteger,
  parseIntBounded,
  isValidOption,
  validateArgs,
} = require('../../lib/validate-args');

describe('validate-args', () => {
  describe('isPositiveInteger', () => {
    describe('valid positive integers', () => {
      it.each([
        [1, 'number 1'],
        [10, 'number 10'],
        [100, 'number 100'],
        [999999, 'large number'],
        ['1', 'string "1"'],
        ['42', 'string "42"'],
        ['1000', 'string "1000"'],
      ])('accepts %s (%s)', (val, _desc) => {
        expect(isPositiveInteger(val)).toBe(true);
      });
    });

    describe('invalid values', () => {
      it.each([
        [0, 'zero'],
        [-1, 'negative number'],
        [-100, 'large negative'],
        ['0', 'string zero'],
        ['-5', 'string negative'],
        [1.5, 'float'],
        // Note: '1.5' parses to 1 via parseInt, which is valid
        [NaN, 'NaN'],
        [Infinity, 'Infinity'],
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty string'],
        ['abc', 'non-numeric string'],
        [{}, 'object'],
        [[], 'array'],
      ])('rejects %s (%s)', (val, _desc) => {
        expect(isPositiveInteger(val)).toBe(false);
      });
    });

    describe('with min/max bounds', () => {
      it('accepts value within bounds', () => {
        expect(isPositiveInteger(5, 1, 10)).toBe(true);
        expect(isPositiveInteger('5', 1, 10)).toBe(true);
      });

      it('accepts value at min bound', () => {
        expect(isPositiveInteger(1, 1, 10)).toBe(true);
      });

      it('accepts value at max bound', () => {
        expect(isPositiveInteger(10, 1, 10)).toBe(true);
      });

      it('rejects value below min', () => {
        expect(isPositiveInteger(0, 1, 10)).toBe(false);
        expect(isPositiveInteger(0, 5, 10)).toBe(false);
      });

      it('rejects value above max', () => {
        expect(isPositiveInteger(11, 1, 10)).toBe(false);
        expect(isPositiveInteger(100, 1, 10)).toBe(false);
      });

      it('works with custom min starting at 0', () => {
        expect(isPositiveInteger(0, 0, 10)).toBe(true);
        expect(isPositiveInteger(-1, 0, 10)).toBe(false);
      });
    });
  });

  describe('parseIntBounded', () => {
    it('parses valid integer', () => {
      expect(parseIntBounded('42', 0)).toBe(42);
      expect(parseIntBounded(100, 0)).toBe(100);
    });

    it('returns default for invalid input', () => {
      expect(parseIntBounded('abc', 10)).toBe(10);
      expect(parseIntBounded(null, 5)).toBe(5);
      expect(parseIntBounded(undefined, 20)).toBe(20);
      expect(parseIntBounded('', 15)).toBe(15);
    });

    it('returns default for out-of-bounds values', () => {
      expect(parseIntBounded(0, 10, 1, 100)).toBe(10);
      expect(parseIntBounded(200, 50, 1, 100)).toBe(50);
    });

    it('clamps to bounds', () => {
      expect(parseIntBounded('5', 10, 5, 10)).toBe(5); // at min
      expect(parseIntBounded('10', 5, 5, 10)).toBe(10); // at max
    });

    it('handles string numbers', () => {
      expect(parseIntBounded('50', 0, 1, 100)).toBe(50);
    });

    it('handles negative defaults when needed', () => {
      expect(parseIntBounded('abc', -1)).toBe(-1);
    });

    it('parses integers from mixed strings', () => {
      // parseInt stops at first non-digit
      expect(parseIntBounded('42abc', 0)).toBe(42);
    });
  });

  describe('isValidOption', () => {
    const allowedKeys = ['name', 'age', 'email'];

    it('accepts key in whitelist', () => {
      expect(isValidOption('name', allowedKeys)).toBe(true);
      expect(isValidOption('age', allowedKeys)).toBe(true);
      expect(isValidOption('email', allowedKeys)).toBe(true);
    });

    it('rejects key not in whitelist', () => {
      expect(isValidOption('unknown', allowedKeys)).toBe(false);
      expect(isValidOption('Name', allowedKeys)).toBe(false); // case sensitive
    });

    it('handles invalid key types', () => {
      expect(isValidOption(null, allowedKeys)).toBe(false);
      expect(isValidOption(undefined, allowedKeys)).toBe(false);
      expect(isValidOption('', allowedKeys)).toBe(false);
      expect(isValidOption(123, allowedKeys)).toBe(false);
    });

    it('handles invalid allowedKeys', () => {
      expect(isValidOption('name', null)).toBe(false);
      expect(isValidOption('name', undefined)).toBe(false);
      expect(isValidOption('name', 'not-array')).toBe(false);
    });

    it('handles empty allowedKeys array', () => {
      expect(isValidOption('anything', [])).toBe(false);
    });
  });

  describe('validateArgs', () => {
    describe('basic parsing', () => {
      it('parses --key=value format', () => {
        const args = ['--name=test'];
        const schema = { name: { type: 'string' } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
        expect(result.data.name).toBe('test');
      });

      it('parses --key value format', () => {
        const args = ['--name', 'test'];
        const schema = { name: { type: 'string' } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
        expect(result.data.name).toBe('test');
      });

      it('handles value with = sign', () => {
        const args = ['--query=foo=bar'];
        const schema = { query: { type: 'string' } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
        expect(result.data.query).toBe('foo=bar');
      });
    });

    describe('required fields', () => {
      it('fails when required field is missing', () => {
        const args = [];
        const schema = { name: { type: 'string', required: true } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required option');
        expect(result.error).toContain('--name');
      });

      it('passes when required field is provided', () => {
        const args = ['--name=test'];
        const schema = { name: { type: 'string', required: true } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
      });
    });

    describe('default values', () => {
      it('uses default when field not provided', () => {
        const args = [];
        const schema = { count: { type: 'positiveInt', default: 10 } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
        expect(result.data.count).toBe(10);
      });

      it('overrides default when field provided', () => {
        const args = ['--count=20'];
        const schema = { count: { type: 'positiveInt', default: 10 } };
        const result = validateArgs(args, schema);
        expect(result.ok).toBe(true);
        expect(result.data.count).toBe(20);
      });
    });

    describe('type validation', () => {
      describe('branchName type', () => {
        const schema = { branch: { type: 'branchName' } };

        it('accepts valid branch name', () => {
          const result = validateArgs(['--branch=feature/US-001'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.branch).toBe('feature/US-001');
        });

        it('rejects invalid branch name', () => {
          const result = validateArgs(['--branch=..invalid'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid branch name');
        });
      });

      describe('storyId type', () => {
        const schema = { story: { type: 'storyId' } };

        it('accepts valid story ID', () => {
          const result = validateArgs(['--story=US-0001'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.story).toBe('US-0001');
        });

        it('rejects invalid story ID', () => {
          const result = validateArgs(['--story=EP-0001'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid story ID');
        });
      });

      describe('epicId type', () => {
        const schema = { epic: { type: 'epicId' } };

        it('accepts valid epic ID', () => {
          const result = validateArgs(['--epic=EP-0023'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.epic).toBe('EP-0023');
        });

        it('rejects invalid epic ID', () => {
          const result = validateArgs(['--epic=US-0001'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid epic ID');
        });
      });

      describe('featureName type', () => {
        const schema = { feature: { type: 'featureName' } };

        it('accepts valid feature name', () => {
          const result = validateArgs(['--feature=damage-control'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.feature).toBe('damage-control');
        });

        it('rejects invalid feature name', () => {
          const result = validateArgs(['--feature=Invalid_Name'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid feature name');
        });
      });

      describe('profileName type', () => {
        const schema = { profile: { type: 'profileName' } };

        it('accepts valid profile name', () => {
          const result = validateArgs(['--profile=my-profile'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.profile).toBe('my-profile');
        });

        it('rejects invalid profile name', () => {
          const result = validateArgs(['--profile=123invalid'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid profile name');
        });
      });

      describe('commandName type', () => {
        const schema = { cmd: { type: 'commandName' } };

        it('accepts valid command name', () => {
          const result = validateArgs(['--cmd=story:list'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.cmd).toBe('story:list');
        });

        it('rejects invalid command name', () => {
          const result = validateArgs(['--cmd=:invalid'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid command name');
        });
      });

      describe('sessionNickname type', () => {
        const schema = { session: { type: 'sessionNickname' } };

        it('accepts valid session nickname', () => {
          const result = validateArgs(['--session=auth-work'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.session).toBe('auth-work');
        });

        it('rejects invalid session nickname', () => {
          const result = validateArgs(['--session=-invalid'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid session nickname');
        });
      });

      describe('positiveInt type', () => {
        it('parses valid positive integer', () => {
          const schema = { count: { type: 'positiveInt', min: 1, max: 100 } };
          const result = validateArgs(['--count=50'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.count).toBe(50);
        });

        it('fails for out-of-range integer', () => {
          const schema = { count: { type: 'positiveInt', min: 1, max: 100, default: 10 } };
          const result = validateArgs(['--count=200'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('expected 1-100');
        });

        it('uses default for invalid integer', () => {
          const schema = { count: { type: 'positiveInt', min: 1, max: 100, default: 10 } };
          const result = validateArgs(['--count=abc'], schema);
          expect(result.ok).toBe(false);
          // Returns error but also sets default
          expect(result.error).toContain('Invalid integer');
        });
      });

      describe('enum type', () => {
        const schema = { mode: { type: 'enum', values: ['fast', 'slow', 'auto'] } };

        it('accepts value in enum', () => {
          const result = validateArgs(['--mode=fast'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.mode).toBe('fast');
        });

        it('rejects value not in enum', () => {
          const result = validateArgs(['--mode=invalid'], schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('Invalid value for mode');
          expect(result.error).toContain('expected: fast, slow, auto');
        });
      });

      describe('boolean type', () => {
        const schema = { verbose: { type: 'boolean' } };

        it.each([
          ['true', true],
          ['1', true],
          ['false', false],
          ['0', false],
          ['anything', false],
        ])('parses "%s" as %s', (input, expected) => {
          const result = validateArgs([`--verbose=${input}`], schema);
          expect(result.ok).toBe(true);
          expect(result.data.verbose).toBe(expected);
        });
      });

      describe('string type', () => {
        const schema = { message: { type: 'string' } };

        it('stores string value', () => {
          const result = validateArgs(['--message=Hello World'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.message).toBe('Hello World');
        });

        it('converts non-string to string', () => {
          const result = validateArgs(['--message=123'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.message).toBe('123');
        });
      });

      describe('unknown type', () => {
        it('passes through value for unknown type', () => {
          const schema = { custom: { type: 'unknownType' } };
          const result = validateArgs(['--custom=value'], schema);
          expect(result.ok).toBe(true);
          expect(result.data.custom).toBe('value');
        });
      });
    });

    describe('multiple errors', () => {
      it('collects multiple validation errors', () => {
        const schema = {
          branch: { type: 'branchName', required: true },
          story: { type: 'storyId' },
        };
        const result = validateArgs(['--story=invalid'], schema);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required option');
        expect(result.error).toContain('Invalid story ID');
      });
    });

    describe('edge cases', () => {
      it('handles empty args array', () => {
        const schema = { name: { type: 'string', default: 'default' } };
        const result = validateArgs([], schema);
        expect(result.ok).toBe(true);
        expect(result.data.name).toBe('default');
      });

      it('handles empty schema', () => {
        const result = validateArgs(['--random=value'], {});
        expect(result.ok).toBe(true);
        expect(result.data).toEqual({});
      });

      it('ignores non-option arguments', () => {
        const schema = { name: { type: 'string' } };
        const result = validateArgs(['positional', '--name=test', 'another'], schema);
        expect(result.ok).toBe(true);
        expect(result.data.name).toBe('test');
      });
    });
  });
});
