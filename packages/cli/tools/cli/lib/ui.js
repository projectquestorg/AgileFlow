/**
 * AgileFlow CLI - UI Utilities
 *
 * Provides interactive prompts and display utilities for the CLI.
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('node:path');
const fs = require('node:fs');
const { IdeManager } = require('../installers/ide/manager');
const { BRAND_HEX } = require('../../../lib/colors');

// Load package.json for version
const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
const packageJson = require(packageJsonPath);

/**
 * Display the AgileFlow ASCII logo
 */
function displayLogo() {
  const logo = `
 █████╗  ██████╗ ██╗██╗     ███████╗███████╗██╗      ██████╗ ██╗    ██╗
██╔══██╗██╔════╝ ██║██║     ██╔════╝██╔════╝██║     ██╔═══██╗██║    ██║
███████║██║  ███╗██║██║     █████╗  █████╗  ██║     ██║   ██║██║ █╗ ██║
██╔══██║██║   ██║██║██║     ██╔══╝  ██╔══╝  ██║     ██║   ██║██║███╗██║
██║  ██║╚██████╔╝██║███████╗███████╗██║     ███████╗╚██████╔╝╚███╔███╔╝
╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ `;
  console.log(chalk.hex(BRAND_HEX)(logo));
  console.log(chalk.dim(`  AgileFlow v${packageJson.version} - AI-Driven Agile Development\n`));
}

/**
 * Display a section header
 * @param {string} title - Section title
 * @param {string} subtitle - Optional subtitle
 */
function displaySection(title, subtitle = null) {
  console.log(chalk.bold.hex(BRAND_HEX)(`\n${title}`));
  if (subtitle) {
    console.log(chalk.dim(subtitle));
  }
  console.log();
}

/**
 * Display a success message
 * @param {string} message - Success message
 */
function success(message) {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * Display a warning message
 * @param {string} message - Warning message
 */
function warning(message) {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * Display an error message
 * @param {string} message - Error message
 */
function error(message) {
  console.log(chalk.red(`✗ ${message}`));
}

/**
 * Display an info message
 * @param {string} message - Info message
 */
function info(message) {
  console.log(chalk.dim(`  ${message}`));
}

// IDE Manager instance for dynamic IDE discovery
const ideManager = new IdeManager();

/**
 * Get available IDE choices dynamically from installed handlers
 * @returns {Array} IDE choices formatted for inquirer
 */
function getIdeChoices() {
  const ides = ideManager.getAvailableIdes();

  return ides.map((ide, index) => ({
    name: ide.name,
    value: ide.value,
    // First IDE (preferred) is checked by default
    checked: ide.preferred || index === 0,
  }));
}

/**
 * @deprecated Use getIdeChoices() instead - dynamically loaded from IDE handlers
 * Legacy hardcoded IDE choices kept for backward compatibility
 */
const IDE_CHOICES = [
  {
    name: 'Claude Code',
    value: 'claude-code',
    checked: true,
    configDir: '.claude/commands',
    description: "Anthropic's Claude Code IDE",
  },
  {
    name: 'Cursor',
    value: 'cursor',
    checked: false,
    configDir: '.cursor/rules',
    description: 'AI-powered code editor',
  },
  {
    name: 'Windsurf',
    value: 'windsurf',
    checked: false,
    configDir: '.windsurf/workflows',
    description: "Codeium's AI IDE",
  },
];

/**
 * Prompt for installation configuration
 * @returns {Promise<Object>} Installation configuration
 */
async function promptInstall() {
  displayLogo();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'directory',
      message: 'Where would you like to install AgileFlow?',
      default: '.',
      validate: input => {
        const resolved = path.resolve(input);
        const parent = path.dirname(resolved);
        if (!fs.existsSync(parent)) {
          return `Parent directory does not exist: ${parent}`;
        }
        return true;
      },
    },
    {
      type: 'checkbox',
      name: 'ides',
      message: 'Select your IDE(s):',
      choices: getIdeChoices(),
      validate: input => {
        if (input.length === 0) {
          return 'Please select at least one IDE';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'userName',
      message: 'What should agents call you?',
      default: 'Developer',
    },
    {
      type: 'input',
      name: 'agileflowFolder',
      message: 'AgileFlow installation folder name:',
      default: '.agileflow',
      validate: input => {
        if (!/^[a-zA-Z0-9._-]+$/.test(input)) {
          return 'Folder name can only contain letters, numbers, dots, underscores, and hyphens';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'docsFolder',
      message: 'Documentation folder name:',
      default: 'docs',
      validate: input => {
        if (!/^[a-zA-Z0-9._-]+$/.test(input)) {
          return 'Folder name can only contain letters, numbers, dots, underscores, and hyphens';
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'updateGitignore',
      message: 'Create/update .gitignore with recommended entries?',
      default: true,
    },
  ]);

  return {
    directory: path.resolve(answers.directory),
    ides: answers.ides,
    userName: answers.userName,
    agileflowFolder: answers.agileflowFolder,
    docsFolder: answers.docsFolder,
    updateGitignore: answers.updateGitignore,
  };
}

/**
 * Prompt for confirmation
 * @param {string} message - Confirmation message
 * @param {boolean} defaultValue - Default value
 * @returns {Promise<boolean>}
 */
async function confirm(message, defaultValue = true) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Get IDE configuration by name
 * @param {string} ideName - IDE name
 * @returns {Object|null}
 */
function getIdeConfig(ideName) {
  return IDE_CHOICES.find(ide => ide.value === ideName) || null;
}

module.exports = {
  displayLogo,
  displaySection,
  success,
  warning,
  error,
  info,
  promptInstall,
  confirm,
  getIdeConfig,
  getIdeChoices,
  IDE_CHOICES, // @deprecated - kept for backward compatibility
};
