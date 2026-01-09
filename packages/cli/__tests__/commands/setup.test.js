/**
 * Tests for setup.js command
 *
 * Tests the setup command structure and options
 */

const setupCommand = require('../../tools/cli/commands/setup');

describe('setup command', () => {
  describe('command metadata', () => {
    it('has correct name', () => {
      expect(setupCommand.name).toBe('setup');
    });

    it('has description', () => {
      expect(setupCommand.description).toBeTruthy();
      expect(typeof setupCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(setupCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof setupCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = setupCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes yes/skip-prompts option', () => {
      const yesOption = setupCommand.options.find(opt => opt[0].includes('--yes'));
      expect(yesOption).toBeTruthy();
    });

    it('includes no-self-update option', () => {
      const noUpdateOption = setupCommand.options.find(opt => opt[0].includes('--no-self-update'));
      expect(noUpdateOption).toBeTruthy();
    });

    it('includes self-updated internal flag', () => {
      const selfUpdatedOption = setupCommand.options.find(opt => opt[0].includes('--self-updated'));
      expect(selfUpdatedOption).toBeTruthy();
    });
  });

  describe('options format', () => {
    it('all options have short or long format', () => {
      for (const option of setupCommand.options) {
        expect(option[0]).toMatch(/^-[a-z]|^--[a-z]/);
      }
    });

    it('all options have descriptions', () => {
      for (const option of setupCommand.options) {
        // Option can be [flag, description] or [flag, description, default]
        expect(option.length).toBeGreaterThanOrEqual(2);
        expect(typeof option[1]).toBe('string');
      }
    });
  });
});

// Note: Integration tests for the full setup flow would require mocking:
// - inquirer for interactive prompts
// - fs operations
// - npm-utils for version checking
// - spawn for self-update
// These are better suited for end-to-end tests
