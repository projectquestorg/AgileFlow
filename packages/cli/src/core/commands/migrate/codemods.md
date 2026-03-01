---
description: Generate and execute AST-based codemods for automated code transformations with dry-run preview and rollback support
argument-hint: "[transformation] [file|directory] [--dry-run]"
---

# /agileflow:migrate:codemods

Generate AST-based codemods for automated code transformations. Preview changes with dry-run before applying, with full rollback support.

---

## Quick Reference

```
/agileflow:migrate:codemods "CommonJS to ESM" src/            # Generate CJS->ESM codemod
/agileflow:migrate:codemods "class to function components"     # React class->function
/agileflow:migrate:codemods "enzyme to testing-library"        # Test migration
/agileflow:migrate:codemods "require to import" --dry-run      # Preview only
/agileflow:migrate:codemods "update API v2 to v3" src/api/     # API migration
```

---

## How It Works

1. **Analyze transformation** - Understand the before/after patterns
2. **Scan target files** - Find all instances of the "before" pattern
3. **Generate transformation** - Create the codemod logic (using regex, AST, or direct edit)
4. **Dry-run preview** - Show what would change without modifying files
5. **Apply changes** - Execute the transformation with backup
6. **Verify** - Run tests to confirm nothing broke

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TRANSFORMATION = description of the transformation
TARGET = file or directory (default: current directory)
DRY_RUN = --dry-run flag present (default: false, always dry-run first)
```

### STEP 2: Analyze Transformation

Delegate to `agileflow-refactor` agent:
- Understand the source and target patterns
- Identify edge cases and exceptions
- Determine if transformation is safe (reversible, no logic change)

### STEP 3: Find All Instances

Scan target files for the source pattern:
- Count total instances
- Group by file
- Flag edge cases that need manual review

### STEP 4: Generate Codemod

Create the transformation logic:

```markdown
## Codemod: {Transformation Name}

**Source Pattern**:
\`\`\`javascript
{before pattern}
\`\`\`

**Target Pattern**:
\`\`\`javascript
{after pattern}
\`\`\`

**Files Affected**: {N} files, {M} instances
**Edge Cases**: {list of cases needing manual review}
**Safety**: {safe/review-needed}
```

### STEP 5: Dry-Run Preview

**ALWAYS show dry-run first** before applying:

```
Codemod Preview: "CommonJS to ESM"
═══════════════════════════════════

Files affected: 15
Total transformations: 42
Edge cases (manual review): 3

Example transformation:
  src/utils.js:1
  - const { readFile } = require('fs');
  + import { readFile } from 'fs';

  src/utils.js:5
  - module.exports = { helper };
  + export { helper };

Edge cases (skipped):
  src/dynamic-loader.js:12 - dynamic require()
  src/config.js:8 - conditional require()
  src/legacy.js:1 - require with side effects

Apply transformations? [Y/n/review-edge-cases]
```

### STEP 6: Apply and Verify

After user approval:
1. Create git stash or backup
2. Apply transformations file by file
3. Run linter to fix formatting
4. Run tests to verify
5. Show summary of changes

### STEP 7: Offer Next Steps

```
Codemod applied: [N] transformations in [M] files. [E] edge cases need manual review.

Options:
- Run tests to verify changes (Recommended)
- Review edge cases manually
- Undo all changes (git checkout)
- Continue with next migration step
```

---

## Common Codemods

| Transformation | Description |
|---------------|-------------|
| CJS to ESM | `require()` -> `import`, `module.exports` -> `export` |
| Class to function | React class components -> function components with hooks |
| Enzyme to RTL | Enzyme test assertions -> React Testing Library |
| PropTypes to TypeScript | Runtime PropTypes -> TypeScript interfaces |
| Callbacks to async/await | Callback-based code -> async/await |
| var to const/let | `var` declarations -> `const`/`let` |

---

## Related Commands

- `/agileflow:migrate:scan` - Detect migration opportunities
- `/agileflow:migrate:plan` - Generate migration roadmap
- `/agileflow:migrate:validate` - Post-migration verification
- `/agileflow:verify` - Run tests after transformation
