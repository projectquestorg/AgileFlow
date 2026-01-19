# Specialized Self-Validating Agents

How to add per-agent hooks for deterministic validation.

## Overview

AgileFlow agents can include hooks in their frontmatter that run specialized validators after tool operations. This creates **closed-loop prompts** where validation is guaranteed, not optional.

**ADR**: [ADR-0009: Specialized Self-Validating Agents](../03-decisions/adr-0009-specialized-self-validating-agents.md)
**Research**: [Specialized Self-Validating Agents](../10-research/20260119-specialized-self-validating-agents.md)

---

## Why Specialized Hooks?

| Approach | Guarantee | Self-Correction |
|----------|-----------|-----------------|
| Prompt instructions ("validate your work") | None - can be skipped | No |
| Global hooks (damage-control) | Always runs | Yes, but generic |
| **Specialized hooks** | Always runs | **Yes, agent-specific** |

Key insight: **"Agents plus code beats agents alone."**

---

## Hook Types

| Hook | When | Use Case |
|------|------|----------|
| `PostToolUse` | After each tool call | Validate individual file operations |
| `Stop` | Agent completes | Final validation, cleanup |
| `PreToolUse` | Before tool call | Block operations (global only) |

---

## Adding Hooks to an Agent

### Frontmatter Example

```yaml
---
name: agileflow-epic-planner
description: Epic and story planning specialist
tools: Read, Write, Edit, Glob, Grep
model: sonnet
hooks:
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "node .agileflow/hooks/validators/story-format-validator.js"
  Stop:
    - hooks:
        - type: command
          command: "echo 'Planning complete'"
compact_context:
  priority: "high"
  preserve_rules: [...]
---
```

### Matcher Patterns

- `"Write"` - Matches Write tool only
- `"Bash"` - Matches Bash tool only
- `"Write|Edit"` - Matches Write OR Edit

---

## Creating a Validator

### Location

```
.agileflow/hooks/validators/
├── README.md                    # Authoring guide
├── json-schema-validator.js     # Validate JSON structure
├── markdown-validator.js        # Validate markdown format
├── story-format-validator.js    # Validate story structure
└── test-result-validator.js     # Validate test outputs
```

### Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| `0` | Success | Proceed normally |
| `2` | Error | **Claude receives stderr and attempts to fix** |
| Other | Warning | Log but continue |

**Exit code 2 is the magic**: Claude will read the error and try to correct it.

### Template

```javascript
#!/usr/bin/env node
const fs = require('fs');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    if (!filePath) {
      process.exit(0); // Skip if no file
    }

    const issues = validate(filePath);

    if (issues.length > 0) {
      console.error(`Fix these issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Triggers self-correction
    }

    console.log(`Validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validate(filePath) {
  const issues = [];
  // Your validation logic here
  return issues;
}
```

---

## Agents with Hooks

Currently configured:

| Agent | Hook Type | Validator | Purpose |
|-------|-----------|-----------|---------|
| `epic-planner.md` | PostToolUse (Write) | story-format-validator.js | Validate story structure |
| `testing.md` | PostToolUse (Bash) | test-result-validator.js | Validate test results |
| `testing.md` | Stop | echo message | Confirm completion |
| `documentation.md` | PostToolUse (Write) | markdown-validator.js | Validate markdown |
| `adr-writer.md` | PostToolUse (Write) | markdown-validator.js | Validate ADR markdown |
| `research.md` | PostToolUse (Write) | markdown-validator.js | Validate research notes |
| `database.md` | PostToolUse (Write) | json-schema-validator.js | Validate JSON files |
| `database.md` | PostToolUse (Bash) | migration-validator.js | Validate migrations |
| `api.md` | PostToolUse (Write) | json-schema-validator.js | Validate JSON files |
| `ui.md` | PostToolUse (Write) | component-validator.js | Validate components |
| `ci.md` | PostToolUse (Write) | workflow-validator.js | Validate CI workflows |
| `security.md` | PostToolUse (Write) | security-validator.js | Security audit |
| `devops.md` | PostToolUse (Write) | json-schema-validator.js | Validate config files |
| `compliance.md` | PostToolUse (Write) | security-validator.js | Security/compliance audit |
| `qa.md` | PostToolUse (Bash) | test-result-validator.js | Validate test results |
| `refactor.md` | PostToolUse (Bash) | test-result-validator.js | Ensure tests pass |
| `datamigration.md` | PostToolUse (Bash) | migration-validator.js | Validate migrations |
| `design.md` | PostToolUse (Write) | component-validator.js | Validate design components |
| `accessibility.md` | PostToolUse (Write) | component-validator.js | Validate a11y |
| `product.md` | PostToolUse (Write) | story-format-validator.js | Validate requirements |
| `monitoring.md` | PostToolUse (Write) | json-schema-validator.js | Validate config |
| `performance.md` | PostToolUse (Bash) | test-result-validator.js | Validate benchmarks |
| `analytics.md` | PostToolUse (Write) | security-validator.js | Privacy/PII checks |
| `integrations.md` | PostToolUse (Write) | security-validator.js | API security |
| `mobile.md` | PostToolUse (Write) | component-validator.js | Validate components |
| `mentor.md` | PostToolUse (Write) | json-schema-validator.js | Validate status updates |

---

## Best Practices

### Do

- Keep validators fast (< 100ms)
- Use specific matchers (not `"Write|Edit|Read"`)
- Return helpful error messages
- Test validators standalone first

### Don't

- Add hooks to every agent (start with high-value ones)
- Validate on Read operations (slows down exploration)
- Block on warnings (use exit code 1, not 2)
- Forget to handle missing files gracefully

---

## Testing Validators

```bash
# Test with sample input
echo '{"tool_input":{"file_path":"test.json"}}' | node .agileflow/hooks/validators/json-schema-validator.js

# Check exit code
echo $?  # Should be 0, 1, or 2
```

---

## Troubleshooting

### Hook Not Running

1. Check YAML frontmatter syntax
2. Verify matcher matches the tool name exactly
3. Ensure validator file exists and is executable

### Validator Errors

1. Test standalone with sample JSON input
2. Check for missing file handling
3. Verify exit codes are correct

### Self-Correction Not Working

1. Ensure exit code is exactly `2`
2. Write clear errors to stderr (not stdout)
3. Provide actionable fix instructions

---

## References

- [Validators README](.agileflow/hooks/validators/README.md)
- [ADR-0009](../03-decisions/adr-0009-specialized-self-validating-agents.md)
- [Research Note](../10-research/20260119-specialized-self-validating-agents.md)
- [agentic-finance-review](https://github.com/disler/agentic-finance-review)
