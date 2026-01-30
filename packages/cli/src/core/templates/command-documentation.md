# Command Documentation Template

This template provides a standardized structure for documenting AgileFlow slash commands.

## File Structure

```markdown
---
# REQUIRED: Frontmatter section
description: Brief one-line description of what the command does
argument-hint: PARAM1=<value> [PARAM2=<optional>]
compact_context:
  priority: high|medium|low
  preserve_rules:
    - "Rule descriptions for compact context"
  state_fields:
    - field_name
---

# command-name

Full description of the command's purpose and primary use case.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js command-name
```

This gathers relevant context for the command.

---

## Context Loading (Documentation)

**PURPOSE**: Description of why context is loaded.

**ACTIONS**:
1. Action item 1
2. Action item 2

**WHY**: Explanation of benefits.

---

## Syntax

```
/agileflow:command-name PARAM1=value [PARAM2=optional]
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| PARAM1 | Yes | - | Description |
| PARAM2 | No | default | Description |

---

## Examples

### Basic Usage

```
/agileflow:command-name PARAM1=example
```

### Advanced Usage

```
/agileflow:command-name PARAM1=example PARAM2=custom
```

---

## Expected Output

### Success Case

```
✓ Operation completed successfully

Results:
- Item 1: value
- Item 2: value
```

### Error Cases

#### Missing Required Parameter

```
❌ Error: PARAM1 is required
Usage: /agileflow:command-name PARAM1=<value>
```

#### Invalid Parameter Value

```
❌ Error: Invalid value for PARAM1: 'invalid'
Expected: description of valid values
```

---

## Related Commands

- `/agileflow:related1` - Description
- `/agileflow:related2` - Description

---

## Troubleshooting

### Common Issue 1

**Symptom**: Description of what goes wrong.

**Cause**: Explanation of why it happens.

**Solution**: Steps to resolve.

### Common Issue 2

**Symptom**: Description.

**Cause**: Explanation.

**Solution**: Steps.

---

## See Also

- [Practice Guide](link) - Related practice documentation
- [Architecture Doc](link) - Technical implementation details
```

## Best Practices for Command Documentation

### 1. Description Quality

- **Frontmatter description**: Keep to one line, action-oriented (e.g., "Create a new story" not "This command creates stories")
- **Main description**: 1-2 sentences explaining the command's purpose and when to use it

### 2. Expected Output Section

Always include:
- **Success case**: Show actual CLI output the user will see
- **At least 2 error cases**: Common failures with their messages
- Use actual ANSI color indicators if present:
  - `✓` (green) for success
  - `❌` (red) for errors
  - `⚠️` (yellow) for warnings

### 3. Parameter Documentation

- Table format for clarity
- Always specify Required/Optional
- Include default values
- Provide meaningful descriptions

### 4. Examples

- Start with simplest usage
- Progress to advanced scenarios
- Include real-world use cases

### 5. Consistency

- Use consistent heading levels
- Follow the template structure
- Match the formatting of existing commands

## Checklist Before Publishing

- [ ] Frontmatter has description and argument-hint
- [ ] Expected Output section exists
- [ ] At least one success example shown
- [ ] At least two error scenarios documented
- [ ] Parameters are documented in a table
- [ ] Examples demonstrate common use cases
- [ ] Related commands are linked
- [ ] Troubleshooting section addresses common issues
