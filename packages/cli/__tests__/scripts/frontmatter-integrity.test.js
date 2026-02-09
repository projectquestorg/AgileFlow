const fs = require('fs');
const path = require('path');
const { safeLoad } = require('../../lib/yaml-utils');

function collectMarkdownFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath);
    }
  }
  return out;
}

describe('core markdown frontmatter integrity', () => {
  it('has valid YAML frontmatter for all core commands and agents', () => {
    const coreRoot = path.resolve(__dirname, '../../src/core');
    const targets = [path.join(coreRoot, 'commands'), path.join(coreRoot, 'agents')];
    const errors = [];

    for (const targetDir of targets) {
      const files = collectMarkdownFiles(targetDir);
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) {
          continue;
        }

        try {
          safeLoad(match[1]);
        } catch (err) {
          errors.push(`${path.relative(coreRoot, filePath)}: ${err.message}`);
        }
      }
    }

    expect(errors).toEqual([]);
  });
});
