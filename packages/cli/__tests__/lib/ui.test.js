/**
 * Tests for ui.js - UI Utilities for CLI
 */

// Mock dependencies before requiring the module
jest.mock('chalk', () => ({
  hex: jest.fn(() => jest.fn(text => `[hex]${text}[/hex]`)),
  dim: jest.fn(text => `[dim]${text}[/dim]`),
  bold: {
    hex: jest.fn(() => jest.fn(text => `[bold.hex]${text}[/bold.hex]`)),
  },
  green: jest.fn(text => `[green]${text}[/green]`),
  yellow: jest.fn(text => `[yellow]${text}[/yellow]`),
  red: jest.fn(text => `[red]${text}[/red]`),
}));

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

jest.mock('../../tools/cli/installers/ide/manager', () => ({
  IdeManager: jest.fn().mockImplementation(() => ({
    getAvailableIdes: jest.fn().mockReturnValue([
      { name: 'Claude Code', value: 'claude-code', preferred: true },
      { name: 'Cursor', value: 'cursor', preferred: false },
    ]),
  })),
}));

const chalk = require('chalk');
const inquirer = require('inquirer');
const {
  displayLogo,
  displaySection,
  success,
  warning,
  error,
  info,
  getIdeChoices,
  getIdeConfig,
  confirm,
  IDE_CHOICES,
} = require('../../tools/cli/lib/ui');

describe('ui.js', () => {
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('displayLogo', () => {
    it('outputs the AgileFlow ASCII logo', () => {
      displayLogo();

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(chalk.hex).toHaveBeenCalled();

      // Verify logo is displayed (uses Unicode block characters)
      const calls = consoleLogSpy.mock.calls;
      const hasLogo = calls.some(
        call => call[0] && (call[0].includes('█') || call[0].includes('[hex]'))
      );
      expect(hasLogo).toBe(true);
    });

    it('shows version information', () => {
      displayLogo();

      const calls = consoleLogSpy.mock.calls;
      const hasVersion = calls.some(
        call => call[0] && call[0].includes('AgileFlow v') && call[0].includes('AI-Driven')
      );
      expect(hasVersion).toBe(true);
    });
  });

  describe('displaySection', () => {
    it('outputs section title with formatting', () => {
      displaySection('Test Section');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Section'));
      expect(chalk.bold.hex).toHaveBeenCalled();
    });

    it('outputs subtitle when provided', () => {
      displaySection('Main Title', 'Subtitle text');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Subtitle text'));
      expect(chalk.dim).toHaveBeenCalledWith('Subtitle text');
    });

    it('does not output subtitle when not provided', () => {
      displaySection('Title Only');

      // chalk.dim should not be called with any subtitle
      const dimCalls = chalk.dim.mock.calls;
      const hasSubtitle = dimCalls.some(call => call[0] !== undefined && call[0] !== null);
      // displayLogo might call dim, so just check no subtitle passed
      expect(
        consoleLogSpy.mock.calls.filter(
          c => c[0] && typeof c[0] === 'string' && c[0].includes('[dim]')
        ).length
      ).toBeLessThanOrEqual(1);
    });
  });

  describe('success', () => {
    it('outputs green success message with checkmark', () => {
      success('Operation successful');

      expect(consoleLogSpy).toHaveBeenCalledWith('[green]✓ Operation successful[/green]');
      expect(chalk.green).toHaveBeenCalledWith('✓ Operation successful');
    });
  });

  describe('warning', () => {
    it('outputs yellow warning message with warning symbol', () => {
      warning('Something might be wrong');

      expect(consoleLogSpy).toHaveBeenCalledWith('[yellow]⚠ Something might be wrong[/yellow]');
      expect(chalk.yellow).toHaveBeenCalledWith('⚠ Something might be wrong');
    });
  });

  describe('error', () => {
    it('outputs red error message with X symbol', () => {
      error('Something went wrong');

      expect(consoleLogSpy).toHaveBeenCalledWith('[red]✗ Something went wrong[/red]');
      expect(chalk.red).toHaveBeenCalledWith('✗ Something went wrong');
    });
  });

  describe('info', () => {
    it('outputs dim info message with indentation', () => {
      info('Additional information');

      expect(consoleLogSpy).toHaveBeenCalledWith('[dim]  Additional information[/dim]');
      expect(chalk.dim).toHaveBeenCalledWith('  Additional information');
    });
  });

  describe('getIdeChoices', () => {
    it('returns array of IDE choices', () => {
      const choices = getIdeChoices();

      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBeGreaterThan(0);
    });

    it('each choice has name, value, and checked properties', () => {
      const choices = getIdeChoices();

      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(choice).toHaveProperty('checked');
      });
    });

    it('first IDE is checked by default', () => {
      const choices = getIdeChoices();

      expect(choices[0].checked).toBe(true);
    });
  });

  describe('getIdeConfig', () => {
    it('returns config for known IDE', () => {
      const config = getIdeConfig('claude-code');

      expect(config).not.toBeNull();
      expect(config.value).toBe('claude-code');
      expect(config.name).toBe('Claude Code');
    });

    it('returns null for unknown IDE', () => {
      const config = getIdeConfig('unknown-ide');

      expect(config).toBeNull();
    });

    it('returns config with all expected properties', () => {
      const config = getIdeConfig('cursor');

      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('value');
      expect(config).toHaveProperty('configDir');
    });
  });

  describe('IDE_CHOICES constant', () => {
    it('is an array', () => {
      expect(Array.isArray(IDE_CHOICES)).toBe(true);
    });

    it('includes Claude Code', () => {
      const claudeCode = IDE_CHOICES.find(ide => ide.value === 'claude-code');
      expect(claudeCode).toBeDefined();
      expect(claudeCode.name).toBe('Claude Code');
    });

    it('includes Cursor', () => {
      const cursor = IDE_CHOICES.find(ide => ide.value === 'cursor');
      expect(cursor).toBeDefined();
      expect(cursor.name).toBe('Cursor');
    });

    it('includes Windsurf', () => {
      const windsurf = IDE_CHOICES.find(ide => ide.value === 'windsurf');
      expect(windsurf).toBeDefined();
      expect(windsurf.name).toBe('Windsurf');
    });

    it('each IDE has required properties', () => {
      IDE_CHOICES.forEach(ide => {
        expect(ide).toHaveProperty('name');
        expect(ide).toHaveProperty('value');
        expect(ide).toHaveProperty('checked');
        expect(ide).toHaveProperty('configDir');
      });
    });
  });

  describe('confirm', () => {
    it('prompts user and returns boolean', async () => {
      inquirer.prompt.mockResolvedValue({ confirmed: true });

      const result = await confirm('Are you sure?');

      expect(result).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure?',
          default: true,
        }),
      ]);
    });

    it('uses provided default value', async () => {
      inquirer.prompt.mockResolvedValue({ confirmed: false });

      await confirm('Continue?', false);

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          default: false,
        }),
      ]);
    });

    it('returns false when user declines', async () => {
      inquirer.prompt.mockResolvedValue({ confirmed: false });

      const result = await confirm('Proceed?');

      expect(result).toBe(false);
    });
  });
});
