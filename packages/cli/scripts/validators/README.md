# Validators

Specialized self-validation scripts for AgileFlow agents.

## Overview

Validators are Node.js scripts that run via hooks to verify agent output. They enable **closed-loop prompts** where validation is guaranteed, not optional.

**Research**: See [ADR-0009](../../../docs/03-decisions/adr-0009-specialized-self-validating-agents.md)

---

## Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| `0` | Success | Proceed normally |
| `2` | Error (blocking) | Stderr sent to Claude for self-correction |
| Other | Warning | Log but continue |

**Exit code 2 is special**: Claude receives stderr output and automatically attempts to fix the issue.

---

## Input Format

Validators receive JSON via stdin with tool context:

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.json",
    "content": "..."
  },
  "result": "File written successfully"
}
```

---

## Validator Template

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
      console.log('No file path in context, skipping');
      process.exit(0);
    }

    // Your validation logic here
    const issues = validate(filePath);

    if (issues.length > 0) {
      // Exit 2 = Claude will try to fix these
      console.error(`Resolve these issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2);
    }

    console.log(`Validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    // Exit 1 = warning, don't block
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validate(filePath) {
  const issues = [];
  // Add your checks here
  return issues;
}
```

---

## Hook Configuration

Add hooks to agent/command frontmatter:

### PostToolUse (after each tool call)

```yaml
hooks:
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "node .agileflow/hooks/validators/your-validator.js"
```

### Stop (when agent finishes)

```yaml
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node .agileflow/hooks/validators/final-validator.js"
```

---

## Best Practices

1. **Keep validators fast** (< 100ms) - they run on every matching tool call
2. **Use specific matchers** - `"Write"` not `"Write|Edit|Read"`
3. **Return helpful errors** - Claude uses stderr to fix issues
4. **Test standalone first** - `echo '{"tool_input":{"file_path":"test.json"}}' | node validator.js`
5. **Log success too** - helps debugging hook chains

---

## Available Validators

| Validator | Purpose | Matcher |
|-----------|---------|---------|
| `json-schema-validator.js` | Validate JSON structure | Write (*.json) |
| `markdown-validator.js` | Validate markdown format | Write (*.md) |
| `story-format-validator.js` | Validate story structure | Write (status.json) |

---

## Testing Validators

```bash
# Test with sample input
echo '{"tool_name":"Write","tool_input":{"file_path":"test.json","content":"{}"}}' | node json-schema-validator.js

# Check exit code
echo $?
```
