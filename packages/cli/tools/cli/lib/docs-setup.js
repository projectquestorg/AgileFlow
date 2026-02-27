/**
 * AgileFlow CLI - Docs Structure Setup
 *
 * Creates the complete AgileFlow docs/ directory structure with README files.
 * Idempotent - checks for existing files and only creates missing ones.
 */

const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk');

// Load AgileFlow version from package.json (used for docs metadata)
const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
const packageJson = require(packageJsonPath);

// Load package README.md for docs/README.md
const packageReadmePath = path.join(__dirname, '..', '..', '..', 'README.md');
let packageReadme = '';
try {
  packageReadme = fs.readFileSync(packageReadmePath, 'utf8');
  // Fix relative image paths to use npm CDN
  packageReadme = packageReadme.replace(
    /src="assets\//g,
    'src="https://cdn.jsdelivr.net/npm/agileflow/assets/'
  );
} catch (e) {
  // Fallback if README not found
  packageReadme =
    '# AgileFlow\n\nSee https://github.com/projectquestorg/AgileFlow for documentation.';
}

/**
 * Directory structure to create
 * @param {string} docsFolder - Name of the docs folder (default: "docs")
 */
function getDirectoryStructure(docsFolder = 'docs') {
  return [
    `${docsFolder}/00-meta/templates`,
    `${docsFolder}/00-meta/guides`,
    `${docsFolder}/00-meta/scripts`,
    `${docsFolder}/01-brainstorming/ideas`,
    `${docsFolder}/01-brainstorming/sketches`,
    `${docsFolder}/02-practices/prompts/agents`,
    `${docsFolder}/03-decisions`,
    `${docsFolder}/04-architecture`,
    `${docsFolder}/05-epics`,
    `${docsFolder}/06-stories`,
    `${docsFolder}/07-testing/acceptance`,
    `${docsFolder}/07-testing/test-cases`,
    `${docsFolder}/08-project`,
    `${docsFolder}/08-project/ideation`,
    `${docsFolder}/08-project/logic-audits`,
    `${docsFolder}/09-agents/bus`,
    `${docsFolder}/10-research`,
  ];
}

/**
 * README content templates
 * @param {string} docsFolder - Name of the docs folder
 */
function getReadmeTemplates(docsFolder = 'docs') {
  return {
    [`${docsFolder}/README.md`]: packageReadme,

    [`${docsFolder}/00-meta/README.md`]: `# Meta Documentation

System metadata, templates, and guides for AgileFlow.

## Contents

- **templates/**: Document templates (story, epic, ADR, etc.)
- **guides/**: How-to guides and best practices
- **scripts/**: Utility scripts for automation
- **agileflow-metadata.json**: System configuration and settings
- **glossary.md**: Project terminology and definitions
- **conventions.md**: Coding and documentation conventions
`,

    [`${docsFolder}/01-brainstorming/README.md`]: `# Brainstorming

Ideas and sketches for future features and improvements.

## Contents

- **ideas/**: Feature ideas and proposals
- **sketches/**: UI/UX sketches and mockups

Use this space to capture thoughts before they become formal stories.
`,

    [`${docsFolder}/02-practices/README.md`]: `# Project Practices

Project-specific practices, conventions, and standards for YOUR codebase.

## Contents

- **testing.md**: Testing strategies and patterns
- **git-branching.md**: Git workflow and branching strategy
- **releasing.md**: Release process and versioning
- **security.md**: Security practices and guidelines
- **ci.md**: CI/CD configuration and workflows
- **prompts/agents/**: Custom agent prompts for this project

**Note**: This is for YOUR project's practices (styling, typography, component patterns, API conventions), NOT AgileFlow system practices (those go in 00-meta/).
`,

    [`${docsFolder}/03-decisions/README.md`]: `# Architecture Decision Records (ADRs)

Technical decisions, trade-offs, and alternatives considered.

## Format

Use \`/agileflow:adr\` to create new decision records.

Each ADR should include:
- **Context**: What problem are we solving?
- **Decision**: What did we decide?
- **Consequences**: What are the impacts?
`,

    [`${docsFolder}/04-architecture/README.md`]: `# Architecture Documentation

System architecture, data models, API specifications, and technical designs.

## Contents

- Data models and schemas
- API specifications
- Component architecture
- File/directory structure
- Testing architecture
- Technical constraints

Use this documentation to maintain architectural context for development.
`,

    [`${docsFolder}/05-epics/README.md`]: `# Epics

Large features broken down into user stories.

## Format

Use \`/agileflow:epic\` to create new epics.

Each epic includes:
- Epic ID (EP-XXXX)
- Description and goals
- Related stories
- Milestones and timeline
`,

    [`${docsFolder}/06-stories/README.md`]: `# User Stories

Implementation tasks with acceptance criteria and technical details.

## Format

Use \`/agileflow:story\` to create new stories.

Each story includes:
- Story ID (US-XXXX)
- Description
- Acceptance criteria (Given/When/Then)
- Architecture context
- Testing strategy
- Implementation notes
`,

    [`${docsFolder}/07-testing/README.md`]: `# Testing Documentation

Test cases, acceptance criteria, and testing strategies.

## Contents

- **acceptance/**: Acceptance test definitions
- **test-cases/**: Detailed test case documentation

Use \`/agileflow:tests\` to set up testing infrastructure.
`,

    [`${docsFolder}/08-project/README.md`]: `# Project Management

Project-level planning and tracking.

## Contents

- **roadmap.md**: Product roadmap and vision
- **backlog.md**: Prioritized backlog
- **milestones.md**: Release milestones
- **risks.md**: Project risks and mitigation strategies
- **ideation/**: Ideation reports from \`/agileflow:ideate:new\`
- **code-audits/**: Code audit reports from \`/agileflow:code:logic\`
`,

    [`${docsFolder}/09-agents/README.md`]: `# Agent Status Tracking

Real-time status of stories being worked on by agents.

## Files

- **status.json**: Active stories and recent completions
- **status-archive.json**: Archived completed stories
- **bus/log.jsonl**: Agent communication log

Use \`/agileflow:status\` to update story status.
`,

    [`${docsFolder}/10-research/README.md`]: `# Research Notes

Research findings, investigations, and technical explorations.

## Format

Use \`/agileflow:research:ask\` to generate research prompts for web AI, then \`/agileflow:research:import\` to bring results back.

| Date | Topic | Path | Summary |
|------|-------|------|---------|
| | | | |
`,
  };
}

/**
 * Create docs structure with README files
 * @param {string} targetDir - Target directory for installation
 * @param {string} docsFolder - Name of the docs folder (default: "docs")
 * @param {Object} options - Options
 * @param {boolean} options.updateGitignore - Whether to create/update .gitignore (default: true)
 * @returns {Promise<Object>} Result object with counts
 */
async function createDocsStructure(targetDir, docsFolder = 'docs', options = {}) {
  const { updateGitignore = true } = options;
  const result = {
    success: false,
    counts: {
      directoriesCreated: 0,
      filesCreated: 0,
      filesSkipped: 0,
    },
    errors: [],
  };

  try {
    console.log(chalk.hex('#e8683a')(`\nCreating ${docsFolder}/ structure...`));

    // Create directories
    const directories = getDirectoryStructure(docsFolder);
    for (const dir of directories) {
      const fullPath = path.join(targetDir, dir);
      if (!fs.existsSync(fullPath)) {
        await fs.ensureDir(fullPath);
        result.counts.directoriesCreated++;
      }
    }

    // Create README files
    const readmes = getReadmeTemplates(docsFolder);
    for (const [filePath, content] of Object.entries(readmes)) {
      const fullPath = path.join(targetDir, filePath);
      if (!fs.existsSync(fullPath)) {
        await fs.writeFile(fullPath, content, 'utf8');
        result.counts.filesCreated++;
        console.log(chalk.green(`  ✓ Created ${filePath}`));
      } else {
        result.counts.filesSkipped++;
        console.log(chalk.dim(`  ⊘ Skipped ${filePath} (already exists)`));
      }
    }

    // Create agileflow-metadata.json
    const metadataPath = path.join(targetDir, docsFolder, '00-meta', 'agileflow-metadata.json');
    if (!fs.existsSync(metadataPath)) {
      const metadata = {
        version: packageJson.version,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        docsFolder: docsFolder,
        archival: {
          threshold_days: 30,
          enabled: true,
        },
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      result.counts.filesCreated++;
      console.log(chalk.green(`  ✓ Created ${docsFolder}/00-meta/agileflow-metadata.json`));
    } else {
      // Update existing metadata (keep docsFolder and version in sync)
      try {
        const existing = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        const updates = [];

        if (!existing.docsFolder) {
          existing.docsFolder = docsFolder;
          updates.push('docsFolder');
        }

        if (existing.version !== packageJson.version) {
          existing.version = packageJson.version;
          updates.push('version');
        }

        if (updates.length > 0) {
          existing.updated = new Date().toISOString();
          await fs.writeFile(metadataPath, JSON.stringify(existing, null, 2), 'utf8');
          console.log(
            chalk.yellow(
              `  ↻ Updated ${docsFolder}/00-meta/agileflow-metadata.json (${updates.join(', ')})`
            )
          );
        }
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ Could not update metadata: ${err.message}`));
      }
      result.counts.filesSkipped++;
    }

    // Create status.json
    const statusPath = path.join(targetDir, docsFolder, '09-agents', 'status.json');
    if (!fs.existsSync(statusPath)) {
      const status = {
        updated: new Date().toISOString(),
        stories: {},
      };
      await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf8');
      result.counts.filesCreated++;
      console.log(chalk.green(`  ✓ Created ${docsFolder}/09-agents/status.json`));
    } else {
      result.counts.filesSkipped++;
      console.log(chalk.dim(`  ⊘ Skipped ${docsFolder}/09-agents/status.json (already exists)`));
    }

    // Create empty bus log
    const busLogPath = path.join(targetDir, docsFolder, '09-agents', 'bus', 'log.jsonl');
    if (!fs.existsSync(busLogPath)) {
      await fs.writeFile(busLogPath, '', 'utf8');
      result.counts.filesCreated++;
      console.log(chalk.green(`  ✓ Created ${docsFolder}/09-agents/bus/log.jsonl`));
    } else {
      result.counts.filesSkipped++;
    }

    // Create basic practice files
    const practiceFiles = {
      [`${docsFolder}/02-practices/testing.md`]: `# Testing Practices

Document your testing strategies and patterns here.
`,
      [`${docsFolder}/02-practices/git-branching.md`]: `# Git Branching Strategy

Document your git workflow and branching strategy here.
`,
      [`${docsFolder}/02-practices/releasing.md`]: `# Release Process

Document your release process and versioning strategy here.
`,
      [`${docsFolder}/02-practices/security.md`]: `# Security Practices

Document your security guidelines and practices here.
`,
      [`${docsFolder}/02-practices/ci.md`]: `# CI/CD Configuration

Document your CI/CD workflows and configuration here.
`,
    };

    for (const [filePath, content] of Object.entries(practiceFiles)) {
      const fullPath = path.join(targetDir, filePath);
      if (!fs.existsSync(fullPath)) {
        await fs.writeFile(fullPath, content, 'utf8');
        result.counts.filesCreated++;
        console.log(chalk.green(`  ✓ Created ${filePath}`));
      } else {
        result.counts.filesSkipped++;
      }
    }

    if (updateGitignore) {
      // Create .gitignore additions for docs folder
      const gitignorePath = path.join(targetDir, '.gitignore');
      const gitignoreEntries = [
        '.env',
        '.env.*',
        '!.env.example',
        '.DS_Store',
        'node_modules/',
        'dist/',
        'build/',
        'coverage/',
      ];

      if (fs.existsSync(gitignorePath)) {
        const existingGitignore = await fs.readFile(gitignorePath, 'utf8');
        const newEntries = gitignoreEntries.filter(entry => !existingGitignore.includes(entry));
        if (newEntries.length > 0) {
          await fs.appendFile(gitignorePath, '\n' + newEntries.join('\n') + '\n', 'utf8');
          console.log(chalk.yellow(`  ↻ Updated .gitignore with ${newEntries.length} entries`));
        }
      } else {
        await fs.writeFile(gitignorePath, gitignoreEntries.join('\n') + '\n', 'utf8');
        result.counts.filesCreated++;
        console.log(chalk.green(`  ✓ Created .gitignore`));
      }
    }

    result.success = true;
    console.log(
      chalk.green(
        `\n✨ Docs structure created: ${result.counts.directoriesCreated} directories, ${result.counts.filesCreated} files`
      )
    );
    if (result.counts.filesSkipped > 0) {
      console.log(chalk.dim(`   ${result.counts.filesSkipped} files skipped (already exist)`));
    }
  } catch (err) {
    result.errors.push(err.message);
    console.error(chalk.red(`\n✗ Failed to create docs structure: ${err.message}`));
  }

  return result;
}

/**
 * Check if a folder is an AgileFlow docs folder
 * @param {string} folderPath - Path to check
 * @returns {boolean} True if it's an AgileFlow docs folder
 */
function isAgileFlowDocsFolder(folderPath) {
  const metadataPath = path.join(folderPath, '00-meta', 'agileflow-metadata.json');
  return fs.existsSync(metadataPath);
}

/**
 * Get the docs folder name from metadata or default
 * Checks both 'docs' and 'agileflow-docs' folders
 * @param {string} targetDir - Target directory
 * @returns {Promise<string>} Docs folder name
 */
async function getDocsFolderName(targetDir) {
  // Check in order of preference: existing metadata, then probe folders
  const candidateFolders = ['docs', 'agileflow-docs'];

  for (const folder of candidateFolders) {
    try {
      const folderPath = path.join(targetDir, folder);
      const metadataPath = path.join(folderPath, '00-meta', 'agileflow-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        return metadata.docsFolder || folder;
      }
    } catch (_err) {
      // Continue to next candidate
    }
  }

  // No existing AgileFlow docs found, default to 'docs'
  return 'docs';
}

module.exports = {
  createDocsStructure,
  getDocsFolderName,
  isAgileFlowDocsFolder,
};
