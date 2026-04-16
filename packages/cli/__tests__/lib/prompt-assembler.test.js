/**
 * Tests for prompt-assembler.js
 *
 * Validates prompt inheritance, mixin injection, variable substitution,
 * circular dependency detection, and fail-open behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  assemblePrompt,
  clearAssemblerCaches,
  loadBaseTemplate,
  loadMixin,
  extractChildSections,
  getChildBodyWithoutSections,
  substituteVariables,
  buildCleanFrontmatter,
} = require('../../tools/cli/lib/prompt-assembler');

// Create a temporary core directory structure for testing
let tmpDir;
let coreDir;

beforeEach(() => {
  clearAssemblerCaches();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-assembler-test-'));
  coreDir = path.join(tmpDir, 'core');
  fs.mkdirSync(path.join(coreDir, 'base-prompts'), { recursive: true });
  fs.mkdirSync(path.join(coreDir, 'mixins'), { recursive: true });
  fs.mkdirSync(path.join(coreDir, 'agents'), { recursive: true });
});

afterEach(() => {
  clearAssemblerCaches();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// extractChildSections
// =============================================================================
describe('extractChildSections', () => {
  test('extracts named sections from body', () => {
    const body = `
Some intro text

<!-- SECTION: focus_areas -->
1. **Item one**
2. **Item two**
<!-- END_SECTION -->

<!-- SECTION: patterns -->
Pattern content here
<!-- END_SECTION -->
`;
    const sections = extractChildSections(body);
    expect(sections.size).toBe(2);
    expect(sections.get('focus_areas')).toBe('1. **Item one**\n2. **Item two**');
    expect(sections.get('patterns')).toBe('Pattern content here');
  });

  test('returns empty map if no sections', () => {
    const sections = extractChildSections('Just plain text');
    expect(sections.size).toBe(0);
  });

  test('handles sections with hyphens in names', () => {
    const body = `
<!-- SECTION: step1-focus -->
Content
<!-- END_SECTION -->
`;
    const sections = extractChildSections(body);
    expect(sections.has('step1-focus')).toBe(true);
  });

  test('handles multiline section content', () => {
    const body = `
<!-- SECTION: output -->
Line 1
Line 2

Line 4 (after blank)
<!-- END_SECTION -->
`;
    const sections = extractChildSections(body);
    expect(sections.get('output')).toContain('Line 1');
    expect(sections.get('output')).toContain('Line 4 (after blank)');
  });
});

// =============================================================================
// getChildBodyWithoutSections
// =============================================================================
describe('getChildBodyWithoutSections', () => {
  test('removes section blocks from body', () => {
    const body = `
Free content here

<!-- SECTION: focus_areas -->
Section content
<!-- END_SECTION -->

More free content
`;
    const result = getChildBodyWithoutSections(body);
    expect(result).toContain('Free content here');
    expect(result).toContain('More free content');
    expect(result).not.toContain('Section content');
    expect(result).not.toContain('SECTION:');
  });

  test('returns full body if no sections', () => {
    const body = 'Just plain text\nWith multiple lines';
    expect(getChildBodyWithoutSections(body)).toBe(body);
  });
});

// =============================================================================
// substituteVariables
// =============================================================================
describe('substituteVariables', () => {
  test('replaces {{VAR}} with values', () => {
    const content = '# {{TITLE}}\n\nFocused on **{{FOCUS}}**.';
    const result = substituteVariables(content, {
      TITLE: 'My Analyzer',
      FOCUS: 'edge cases',
    });
    expect(result).toBe('# My Analyzer\n\nFocused on **edge cases**.');
  });

  test('ignores variables not present in content', () => {
    const content = 'Hello {{WORLD}}';
    const result = substituteVariables(content, { WORLD: 'Earth', EXTRA: 'ignored' });
    expect(result).toBe('Hello Earth');
    expect(result).not.toContain('ignored');
  });

  test('returns content unchanged if no variables', () => {
    const content = 'No variables here';
    expect(substituteVariables(content, {})).toBe(content);
    expect(substituteVariables(content, null)).toBe(content);
  });

  test('handles multiple occurrences of same variable', () => {
    const content = '{{X}} and {{X}} again';
    expect(substituteVariables(content, { X: 'val' })).toBe('val and val again');
  });

  test('rejects unsafe variable names', () => {
    const content = '{{../hack}} {{SAFE}}';
    const result = substituteVariables(content, {
      '../hack': 'bad',
      SAFE: 'good',
    });
    expect(result).toContain('{{../hack}}'); // Not replaced
    expect(result).toContain('good');
  });

  test('truncates long values', () => {
    const longValue = 'x'.repeat(2000);
    const result = substituteVariables('{{V}}', { V: longValue });
    expect(result.length).toBeLessThanOrEqual(1000);
  });
});

// =============================================================================
// buildCleanFrontmatter
// =============================================================================
describe('buildCleanFrontmatter', () => {
  test('builds YAML frontmatter from object', () => {
    const fm = { name: 'test-agent', tools: ['Read', 'Write'], model: 'haiku' };
    const result = buildCleanFrontmatter(fm);
    expect(result).toContain('---');
    expect(result).toContain('name: test-agent');
    expect(result).toContain('model: haiku');
  });

  test('strips extends, mixins, and variables keys', () => {
    const fm = {
      name: 'test',
      extends: 'base',
      mixins: ['a', 'b'],
      variables: { X: 'Y' },
    };
    const result = buildCleanFrontmatter(fm);
    expect(result).toContain('name: test');
    expect(result).not.toContain('extends');
    expect(result).not.toContain('mixins');
    expect(result).not.toContain('variables');
  });

  test('quotes strings with special characters', () => {
    const fm = { description: 'Has: colons and [brackets]' };
    const result = buildCleanFrontmatter(fm);
    expect(result).toContain('"Has: colons and [brackets]"');
  });

  test('handles boolean and number values', () => {
    const fm = { active: true, count: 42 };
    const result = buildCleanFrontmatter(fm);
    expect(result).toContain('active: true');
    expect(result).toContain('count: 42');
  });
});

// =============================================================================
// loadBaseTemplate
// =============================================================================
describe('loadBaseTemplate', () => {
  test('loads template from base-prompts directory', () => {
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'test-base.md'),
      '# Base Template\n\n{{CHILD_BODY}}'
    );
    const result = loadBaseTemplate('test-base', coreDir);
    expect(result).toContain('# Base Template');
  });

  test('returns null for nonexistent template', () => {
    const result = loadBaseTemplate('nonexistent', coreDir);
    expect(result).toBeNull();
  });

  test('caches loaded templates', () => {
    fs.writeFileSync(path.join(coreDir, 'base-prompts', 'cached.md'), 'Content');
    loadBaseTemplate('cached', coreDir);
    // Delete file - cache should still work
    fs.unlinkSync(path.join(coreDir, 'base-prompts', 'cached.md'));
    expect(loadBaseTemplate('cached', coreDir)).toBe('Content');
  });
});

// =============================================================================
// loadMixin
// =============================================================================
describe('loadMixin', () => {
  test('loads mixin from mixins directory', () => {
    fs.writeFileSync(
      path.join(coreDir, 'mixins', 'session.md'),
      '## Session Protocol\n\nSession content.'
    );
    const result = loadMixin('session', coreDir);
    expect(result).toContain('Session Protocol');
  });

  test('returns null for nonexistent mixin', () => {
    expect(loadMixin('nonexistent', coreDir)).toBeNull();
  });
});

// =============================================================================
// assemblePrompt - Full integration tests
// =============================================================================
describe('assemblePrompt', () => {
  test('returns content unchanged if no extends or mixins', () => {
    const content = '---\nname: simple\n---\n\n# Simple Agent\n\nContent.';
    expect(assemblePrompt(content, coreDir)).toBe(content);
  });

  test('returns content unchanged if no frontmatter', () => {
    const content = '# No frontmatter\n\nJust content.';
    expect(assemblePrompt(content, coreDir)).toBe(content);
  });

  test('resolves extends with section substitution', () => {
    // Create base template
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'simple-base.md'),
      '# {{TITLE}}\n\n## Focus\n\n<!-- {{SECTION:focus}} -->\n\n## Rules\n\n1. Be specific'
    );

    // Create child content
    const child = `---
name: test-child
extends: simple-base
variables:
  TITLE: My Child Agent
---

<!-- SECTION: focus -->
1. Item A
2. Item B
<!-- END_SECTION -->
`;

    const result = assemblePrompt(child, coreDir);
    expect(result).toContain('# My Child Agent');
    expect(result).toContain('1. Item A');
    expect(result).toContain('2. Item B');
    expect(result).toContain('1. Be specific');
    expect(result).toContain('name: test-child');
    expect(result).not.toContain('extends:');
    expect(result).not.toContain('variables:');
  });

  test('replaces {{CHILD_BODY}} with non-section body content', () => {
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'body-base.md'),
      'Header\n\n{{CHILD_BODY}}\n\nFooter'
    );

    const child = `---
name: test
extends: body-base
---

Free content that goes in CHILD_BODY.

<!-- SECTION: ignored -->
This should not be in CHILD_BODY
<!-- END_SECTION -->
`;

    const result = assemblePrompt(child, coreDir);
    expect(result).toContain('Free content that goes in CHILD_BODY.');
    expect(result).toContain('Header');
    expect(result).toContain('Footer');
    expect(result).not.toContain('This should not be in CHILD_BODY');
  });

  test('resolves mixins at placeholder markers', () => {
    fs.writeFileSync(
      path.join(coreDir, 'mixins', 'validator.md'),
      '## Validation\n\nCheck all inputs.'
    );

    const content = `---
name: test
mixins:
  - validator
---

# Agent

<!-- {{MIXIN:validator}} -->

End.
`;

    const result = assemblePrompt(content, coreDir);
    expect(result).toContain('## Validation');
    expect(result).toContain('Check all inputs.');
    expect(result).not.toContain('{{MIXIN:validator}}');
  });

  test('handles both extends and mixins together', () => {
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'combined.md'),
      '# {{TITLE}}\n\n<!-- {{SECTION:body}} -->\n\n<!-- {{MIXIN:footer}} -->'
    );
    fs.writeFileSync(path.join(coreDir, 'mixins', 'footer.md'), '---\nEnd of document.');

    const child = `---
name: combined-test
extends: combined
mixins:
  - footer
variables:
  TITLE: Combined Agent
---

<!-- SECTION: body -->
Main content here.
<!-- END_SECTION -->
`;

    const result = assemblePrompt(child, coreDir);
    expect(result).toContain('# Combined Agent');
    expect(result).toContain('Main content here.');
    expect(result).toContain('End of document.');
  });

  test('fail-open: returns original if base template not found', () => {
    const content = `---
name: orphan
extends: nonexistent-base
---

# Orphan Agent
`;

    const result = assemblePrompt(content, coreDir);
    expect(result).toContain('# Orphan Agent');
    expect(result).toContain('extends: nonexistent-base');
  });

  test('fail-open: ignores missing mixins gracefully', () => {
    const content = `---
name: test
mixins:
  - nonexistent
---

# Agent

<!-- {{MIXIN:nonexistent}} -->

End.
`;

    const result = assemblePrompt(content, coreDir);
    expect(result).toContain('# Agent');
    expect(result).toContain('<!-- {{MIXIN:nonexistent}} -->');
  });

  test('blocks deep inheritance (max 1 level)', () => {
    // Base template that itself extends (should be blocked)
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'deep-base.md'),
      '---\nextends: grandparent\n---\n\nContent'
    );

    const child = `---
name: deep-child
extends: deep-base
---

# Deep Child
`;

    const result = assemblePrompt(child, coreDir);
    // Should return child unchanged since base itself extends
    expect(result).toContain('# Deep Child');
    expect(result).toContain('extends: deep-base');
  });

  test('handles empty sections gracefully', () => {
    fs.writeFileSync(
      path.join(coreDir, 'base-prompts', 'empty-sections.md'),
      '# Title\n\n<!-- {{SECTION:optional}} -->\n\nEnd.'
    );

    const child = `---
name: test
extends: empty-sections
---

No sections provided.
`;

    const result = assemblePrompt(child, coreDir);
    expect(result).toContain('# Title');
    expect(result).toContain('End.');
    expect(result).not.toContain('{{SECTION:optional}}');
  });

  test('preserves frontmatter fields in output', () => {
    fs.writeFileSync(path.join(coreDir, 'base-prompts', 'fm-test.md'), 'Body content');

    const child = `---
name: my-agent
description: Test agent
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: fm-test
---

Child body.
`;

    const result = assemblePrompt(child, coreDir);
    expect(result).toContain('name: my-agent');
    // tools contains commas, so buildCleanFrontmatter may quote it
    expect(result).toMatch(/tools:.*Read.*Glob.*Grep/);
    expect(result).toContain('model: haiku');
    expect(result).toContain('team_role: utility');
  });

  test('handles null/undefined content', () => {
    expect(assemblePrompt(null, coreDir)).toBeNull();
    expect(assemblePrompt(undefined, coreDir)).toBeUndefined();
    expect(assemblePrompt('', coreDir)).toBe('');
  });

  test('handles null/undefined coreDir', () => {
    const content = '---\nname: test\n---\n\nBody';
    expect(assemblePrompt(content, null)).toBe(content);
    expect(assemblePrompt(content, undefined)).toBe(content);
  });
});

// =============================================================================
// Real-world: test with actual analyzer-specialist base template
// =============================================================================
describe('analyzer-specialist integration', () => {
  test('assembles a realistic analyzer agent', () => {
    // Copy the real base template
    const realBase = path.join(__dirname, '../../src/core/base-prompts/analyzer-specialist.md');
    if (fs.existsSync(realBase)) {
      fs.copyFileSync(realBase, path.join(coreDir, 'base-prompts', 'analyzer-specialist.md'));

      const child = `---
name: test-analyzer
description: Test analyzer
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: analyzer-specialist
variables:
  ANALYZER_TITLE: "Test Analyzer: Example"
  ANALYZER_TYPE: test
  FOCUS_DESCRIPTION: "example patterns"
  FINDING_DESCRIPTION: "example issues in code"
---

<!-- SECTION: focus_areas -->
1. **Pattern A**: Description
2. **Pattern B**: Description
<!-- END_SECTION -->

<!-- SECTION: step1_focus -->
- JavaScript files
- TypeScript files
<!-- END_SECTION -->

<!-- SECTION: patterns -->
**Pattern 1: Example**
\`\`\`javascript
// Example code
\`\`\`
<!-- END_SECTION -->

<!-- SECTION: output_format -->
\`\`\`markdown
### FINDING-{N}: {Title}
**Location**: \`{file}:{line}\`
\`\`\`
<!-- END_SECTION -->

<!-- SECTION: domain_rules -->
2. **Check imports**: Look at import statements
<!-- END_SECTION -->

<!-- SECTION: exclusions -->
- Test files
- Generated code
<!-- END_SECTION -->
`;

      const result = assemblePrompt(child, coreDir);

      // Should have assembled structure
      expect(result).toContain('# Test Analyzer: Example');
      expect(result).toContain('specialized test analyzer');
      expect(result).toContain('**example patterns**');
      expect(result).toContain('example issues in code');
      expect(result).toContain('## Your Focus Areas');
      expect(result).toContain('1. **Pattern A**');
      expect(result).toContain('## Analysis Process');
      expect(result).toContain('### Step 1: Read the Target Code');
      expect(result).toContain('- JavaScript files');
      expect(result).toContain('### Step 2: Look for These Patterns');
      expect(result).toContain('**Pattern 1: Example**');
      expect(result).toContain('## Output Format');
      expect(result).toContain('## Important Rules');
      expect(result).toContain('1. **Be SPECIFIC**');
      expect(result).toContain('2. **Check imports**');
      expect(result).toContain('## What NOT to Report');
      expect(result).toContain('- Test files');

      // Should NOT have assembly metadata
      expect(result).not.toContain('extends:');
      expect(result).not.toContain('variables:');
      expect(result).not.toContain('{{SECTION:');
      expect(result).not.toContain('{{ANALYZER_');
    }
  });
});
