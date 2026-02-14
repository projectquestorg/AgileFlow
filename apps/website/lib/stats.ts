import 'server-only';
import fs from 'fs';
import path from 'path';

const CLI_ROOT = path.join(process.cwd(), '../../packages/cli/src/core');
const CLI_PACKAGE = path.join(process.cwd(), '../../packages/cli/package.json');

function countFiles(dirPath: string, pattern: string): number {
  try {
    const fullPath = path.join(CLI_ROOT, dirPath);
    if (!fs.existsSync(fullPath)) return 0;

    const files = fs.readdirSync(fullPath);
    return files.filter((file) => file.endsWith(pattern)).length;
  } catch (error) {
    console.error(`Error counting files in ${dirPath}:`, error);
    return 0;
  }
}

function getVersion(): string {
  try {
    if (!fs.existsSync(CLI_PACKAGE)) return '0.0.0';
    const packageJson = JSON.parse(fs.readFileSync(CLI_PACKAGE, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    console.error('Error reading package version:', error);
    return '0.0.0';
  }
}

export function getAgileFlowStats() {
  return {
    version: getVersion(),
    commands: countFiles('commands', '.md'),
    agents: countFiles('agents', '.md'),
    skills: countFiles('skills', 'SKILL.md'),
    ides: 4, // Claude Code, Cursor, Windsurf, Codex CLI
  };
}
