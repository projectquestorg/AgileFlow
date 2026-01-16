/**
 * AgileFlow CLI - Doctor Command
 *
 * Diagnoses installation issues and validates configuration.
 */

const chalk = require('chalk');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('fs-extra');
const { Installer } = require('../installers/core/installer');
const {
  displayLogo,
  displaySection,
  success,
  warning,
  error,
  info,
  confirm,
} = require('../lib/ui');
const { IdeManager } = require('../installers/ide/manager');
const { getCurrentVersion } = require('../lib/version-checker');
const { ErrorHandler } = require('../lib/error-handler');
const {
  ErrorCodes,
  getErrorCodeFromError,
  getSuggestedFix,
  isRecoverable,
} = require('../../../lib/error-codes');
const { safeDump } = require('../../../lib/yaml-utils');
const { IdeRegistry } = require('../lib/ide-registry');
const { formatKeyValue, formatList, isTTY } = require('../../../lib/table-formatter');

const installer = new Installer();

module.exports = {
  name: 'doctor',
  description: 'Diagnose AgileFlow installation issues',
  options: [
    ['-d, --directory <path>', 'Project directory (default: current directory)'],
    ['--fix', 'Automatically fix detected issues'],
  ],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      displayLogo();
      displaySection(options.fix ? 'AgileFlow Auto-Repair' : 'AgileFlow Diagnostics');

      let issues = 0;
      let warnings = 0;
      const repairs = []; // Track fixable issues

      // Check Node.js version
      console.log(chalk.bold('Environment:'));
      const nodeVersion = process.version;
      const requiredNode = '18.0.0';

      if (compareVersions(nodeVersion.slice(1), requiredNode) >= 0) {
        success(`Node.js ${nodeVersion} (required: >=${requiredNode})`);
      } else {
        error(`Node.js ${nodeVersion} (required: >=${requiredNode})`);
        issues++;
      }

      // Check npm
      try {
        const { execSync } = require('node:child_process');
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        success(`npm v${npmVersion}`);
      } catch {
        warning('npm not found');
        warnings++;
      }

      // Check installation
      console.log(chalk.bold('\nInstallation:'));
      const status = await installer.getStatus(directory);

      if (!status.installed) {
        warning('No AgileFlow installation found');
        console.log(chalk.dim(`  Run 'npx agileflow setup' to set up\n`));

        // Summary
        printSummary(issues, warnings);
        process.exit(issues > 0 ? 1 : 0);
      }

      success(`.agileflow/ exists`);

      // Check manifest
      const manifestPath = path.join(status.path, '_cfg', 'manifest.yaml');
      if (await fs.pathExists(manifestPath)) {
        success('manifest.yaml valid');
      } else {
        error('manifest.yaml missing');
        issues++;
        repairs.push({
          type: 'missing-manifest',
          errorCode: 'ENOENT',
          message: 'Recreate missing manifest.yaml',
          fix: async () => {
            info('Recreating manifest.yaml...');
            const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
            const cfgDir = path.join(status.path, '_cfg');
            await fs.ensureDir(cfgDir);

            const manifest = {
              version: packageJson.version,
              installed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ides: status.ides || ['claude-code'],
              modules: ['core'],
              user_name: status.userName || 'Developer',
              agileflow_folder: path.basename(status.path),
              docs_folder: 'docs',
            };

            await fs.writeFile(manifestPath, safeDump(manifest), 'utf8');
            success('Created manifest.yaml');
          },
        });
      }

      // Check safe update tracking and pending preserved updates
      console.log(chalk.bold('\nSafe Updates:'));
      const cfgDir = path.join(status.path, '_cfg');
      const fileIndexPath = path.join(cfgDir, 'files.json');
      let fileIndex = null;

      if (await fs.pathExists(fileIndexPath)) {
        try {
          fileIndex = await fs.readJson(fileIndexPath);
          if (
            !fileIndex ||
            fileIndex.schema !== 1 ||
            !fileIndex.files ||
            typeof fileIndex.files !== 'object'
          ) {
            throw new Error('invalid format');
          }
          success('files.json present');

          const protectedCount = countProtectedFiles(fileIndex);
          if (protectedCount > 0) {
            warning(`Protected files: ${protectedCount} (local changes preserved)`);
            warnings++;
          }
        } catch (err) {
          warning(`files.json invalid (${err.message})`);
          warnings++;
          repairs.push({
            type: 'invalid-file-index',
            errorCode: 'EPARSE',
            message: 'Recreate files.json safe-update index',
            fix: async () => {
              await createProtectedFileIndex(status.path, fileIndexPath);
              success('Recreated files.json (all files protected)');
            },
          });
        }
      } else {
        warning('files.json missing (safe updates disabled)');
        warnings++;
        repairs.push({
          type: 'missing-file-index',
          errorCode: 'ENOENT',
          message: 'Create files.json safe-update index',
          fix: async () => {
            await createProtectedFileIndex(status.path, fileIndexPath);
            success('Created files.json (all files protected)');
          },
        });
      }

      const updatesDir = path.join(cfgDir, 'updates');
      const updateSets = await listSubdirectories(updatesDir);
      if (updateSets.length > 0) {
        warning(`Pending preserved updates: ${updateSets.length} set(s)`);
        warnings++;
        info(`Review: ${updatesDir}/`);
      } else {
        success('No pending preserved updates');
      }

      // Check core content
      const counts = await installer.countInstalledItems(status.path);

      let missingCore = false;

      if (counts.agents > 0) {
        success(`Core agents: ${counts.agents} files`);
      } else {
        error('Core agents: Missing');
        issues++;
        missingCore = true;
      }

      if (counts.commands > 0) {
        success(`Commands: ${counts.commands} files`);
      } else {
        error('Commands: Missing');
        issues++;
        missingCore = true;
      }

      if (missingCore) {
        repairs.push({
          type: 'missing-core',
          errorCode: 'EEMPTYDIR',
          message: 'Reinstall missing core content',
          fix: async () => {
            info('Reinstalling core content...');
            const config = {
              directory,
              ides: status.ides || ['claude-code'],
              userName: status.userName || 'Developer',
              agileflowFolder: path.basename(status.path),
              docsFolder: status.docsFolder || 'docs',
            };

            await installer.install(config);
            success('Reinstalled core content');
          },
        });
      }

      if (counts.skills > 0) {
        success(`Skills: ${counts.skills} directories`);
      } else {
        warning(`Skills: None found`);
        warnings++;
      }

      // Check IDE configurations
      if (status.ides && status.ides.length > 0) {
        console.log(chalk.bold('\nIDE Configurations:'));

        const ideManager = new IdeManager();
        ideManager.setAgileflowFolder(path.basename(status.path));
        ideManager.setDocsFolder(status.docsFolder || 'docs');

        for (const ide of status.ides) {
          const configPath = IdeRegistry.getConfigPath(ide, directory);
          const ideName = IdeRegistry.getDisplayName(ide);

          if (await fs.pathExists(configPath)) {
            // Count files in config
            const files = await countFilesInDir(configPath);
            success(`${ideName}: ${files} files`);
          } else {
            warning(`${ideName}: Config missing`);
            warnings++;
            repairs.push({
              type: 'missing-ide-config',
              errorCode: 'ENODIR',
              message: `Reinstall ${ideName} configuration`,
              fix: async () => {
                info(`Reinstalling ${ideName} configuration...`);
                await ideManager.setup(ide, directory, status.path);
                success(`Reinstalled ${ideName} configuration`);
              },
            });
          }
        }
      }

      // Check for orphaned configs
      console.log(chalk.bold('\nOrphan Check:'));
      const allIdes = IdeRegistry.getAll();
      let orphansFound = false;

      for (const ide of allIdes) {
        if (!status.ides || !status.ides.includes(ide)) {
          const configPath = IdeRegistry.getConfigPath(ide, directory);
          if (await fs.pathExists(configPath)) {
            const ideName = IdeRegistry.getDisplayName(ide);
            warning(`${ideName}: Config exists but not in manifest`);
            orphansFound = true;
            warnings++;
            repairs.push({
              type: 'orphaned-config',
              errorCode: 'ECONFLICT',
              message: `Remove orphaned ${ideName} configuration`,
              fix: async () => {
                info(`Removing orphaned ${ideName} configuration...`);
                await fs.remove(configPath);
                success(`Removed ${ideName} configuration`);
              },
            });
          }
        }
      }

      if (!orphansFound) {
        success('No orphaned configurations');
      }

      // Execute repairs if --fix is enabled
      if (options.fix && repairs.length > 0) {
        console.log();
        displaySection('Applying Fixes');

        for (const repair of repairs) {
          try {
            await repair.fix();
          } catch (err) {
            // Use error codes for better diagnosis
            const codeData = getErrorCodeFromError(err);
            error(`Failed to ${repair.message.toLowerCase()}: ${err.message}`);
            if (codeData.code !== 'EUNKNOWN') {
              console.log(chalk.dim(`  Error code: ${codeData.code}`));
              console.log(chalk.dim(`  Suggestion: ${codeData.suggestedFix}`));
            }
          }
        }

        console.log();
        success(`Applied ${repairs.length} fix(es)`);
      } else if (repairs.length > 0 && !options.fix) {
        console.log();
        info(`Found ${repairs.length} fixable issue(s). Run with --fix to auto-repair.`);

        // Show summary of fixable issues with error codes
        console.log(chalk.bold('\nFixable Issues:'));
        for (const repair of repairs) {
          const errorCode = repair.errorCode || 'ECONFIG';
          const codeData = ErrorCodes[errorCode] || ErrorCodes.ECONFIG;
          console.log(
            `  ${chalk.yellow('!')} ${repair.message} ${chalk.dim(`[${codeData.code}]`)}`
          );
        }
      }

      // Print summary
      printSummary(issues, warnings);

      process.exit(issues > 0 ? 1 : 0);
    } catch (err) {
      const handler = new ErrorHandler('doctor');
      handler.critical(
        'Diagnostics failed',
        'Check permissions and installation',
        'npx agileflow setup',
        err
      );
    }
  },
};

/**
 * Compare two version strings
 * @param {string} a - Version A
 * @param {string} b - Version B
 * @returns {number} -1, 0, or 1
 */
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}


/**
 * Count files in directory recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>}
 */
async function countFilesInDir(dirPath) {
  let count = 0;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      count++;
    } else if (entry.isDirectory()) {
      count += await countFilesInDir(path.join(dirPath, entry.name));
    }
  }

  return count;
}

/**
 * Print summary using formatKeyValue for consistent output
 * @param {number} issues - Issue count
 * @param {number} warnings - Warning count
 */
function printSummary(issues, warnings) {
  console.log();

  if (issues === 0 && warnings === 0) {
    console.log(chalk.green.bold('No issues found.\n'));
  } else if (issues === 0) {
    console.log(formatKeyValue({
      Warnings: chalk.yellow(warnings),
      Issues: chalk.green('0'),
    }, { separator: ':', alignValues: false }));
    console.log();
  } else {
    console.log(formatKeyValue({
      Issues: chalk.red(issues),
      Warnings: chalk.yellow(warnings),
    }, { separator: ':', alignValues: false }));
    console.log();
  }
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function countProtectedFiles(fileIndex) {
  if (!fileIndex || !fileIndex.files || typeof fileIndex.files !== 'object') return 0;
  return Object.values(fileIndex.files).filter(record => record && record.protected).length;
}

async function listSubdirectories(dirPath) {
  if (!(await fs.pathExists(dirPath))) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

async function createProtectedFileIndex(agileflowDir, fileIndexPath) {
  const candidates = ['agents', 'commands', 'skills', 'templates', 'config.yaml'];
  const files = {};

  for (const candidate of candidates) {
    const candidatePath = path.join(agileflowDir, candidate);
    if (!(await fs.pathExists(candidatePath))) continue;

    const stat = await fs.stat(candidatePath);
    if (stat.isFile()) {
      const data = await fs.readFile(candidatePath);
      const relativePath = toPosixPath(path.relative(agileflowDir, candidatePath));
      files[relativePath] = { sha256: sha256Hex(data), protected: true };
      continue;
    }

    await indexDirectory(candidatePath, agileflowDir, files);
  }

  const index = {
    schema: 1,
    generated_at: new Date().toISOString(),
    version: getCurrentVersion(),
    files,
  };

  await fs.ensureDir(path.dirname(fileIndexPath));
  await fs.writeJson(fileIndexPath, index, { spaces: 2 });
}

async function indexDirectory(dirPath, rootDir, filesOut) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await indexDirectory(entryPath, rootDir, filesOut);
      continue;
    }

    if (entry.isFile()) {
      const data = await fs.readFile(entryPath);
      const relativePath = toPosixPath(path.relative(rootDir, entryPath));
      filesOut[relativePath] = { sha256: sha256Hex(data), protected: true };
    }
  }
}
