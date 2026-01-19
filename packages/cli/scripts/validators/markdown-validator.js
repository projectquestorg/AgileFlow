#!/usr/bin/env node
/**
 * Markdown Validator
 *
 * Validates markdown files for proper structure after Write operations.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks:
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Write"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/markdown-validator.js"
 */

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    // Only validate markdown files
    if (!filePath || !filePath.endsWith('.md')) {
      process.exit(0);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    const issues = validateMarkdown(filePath);

    if (issues.length > 0) {
      console.error(`Resolve these markdown issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Markdown validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validateMarkdown(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const fileName = path.basename(filePath);

    // Check for empty file
    if (!content.trim()) {
      issues.push('File is empty');
      return issues;
    }

    // Check for title (first line should be # heading)
    const firstContentLine = lines.find(l => l.trim());
    if (!firstContentLine?.startsWith('#')) {
      issues.push('Document should start with a heading (#)');
    }

    // Check for broken links (basic check)
    const brokenLinkPattern = /\[([^\]]*)\]\(\s*\)/g;
    let match;
    while ((match = brokenLinkPattern.exec(content)) !== null) {
      issues.push(`Empty link found: [${match[1]}]()`);
    }

    // Check for unclosed code blocks
    const codeBlockCount = (content.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      issues.push('Unclosed code block (odd number of ``` markers)');
    }

    // Check for heading hierarchy issues
    let lastHeadingLevel = 0;
    lines.forEach((line, index) => {
      const headingMatch = line.match(/^(#{1,6})\s/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        // Skip from level 0 to level 1 is OK
        if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
          issues.push(`Line ${index + 1}: Heading level jump (h${lastHeadingLevel} to h${level})`);
        }
        lastHeadingLevel = level;
      }
    });

    // Check for specific file types
    if (fileName.startsWith('adr-') || fileName.startsWith('ADR-')) {
      issues.push(...validateADR(content));
    } else if (filePath.includes('/10-research/')) {
      issues.push(...validateResearchNote(content));
    }

  } catch (e) {
    issues.push(`Read error: ${e.message}`);
  }

  return issues;
}

function validateADR(content) {
  const issues = [];

  const requiredSections = ['## Context', '## Decision', '## Consequences'];
  requiredSections.forEach(section => {
    if (!content.includes(section)) {
      issues.push(`ADR missing required section: ${section}`);
    }
  });

  if (!content.includes('**Status**:')) {
    issues.push('ADR missing Status field');
  }
  if (!content.includes('**Date**:')) {
    issues.push('ADR missing Date field');
  }

  return issues;
}

function validateResearchNote(content) {
  const issues = [];

  if (!content.includes('**Import Date**:')) {
    issues.push('Research note missing Import Date');
  }
  if (!content.includes('## Summary')) {
    issues.push('Research note missing Summary section');
  }
  if (!content.includes('## Key Findings')) {
    issues.push('Research note missing Key Findings section');
  }

  return issues;
}
