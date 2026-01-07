---
name: skill-name
description: Brief description of what this skill does and when Claude should use it (one line, <150 chars)
---

# Skill Name

Brief overview of what this skill does (1-2 sentences).

## When to Use

Use this skill when:
- Scenario 1 (be specific about triggers/keywords)
- Scenario 2
- Scenario 3

## What This Does

Clear explanation of the skill's functionality and purpose. Keep this concise and focused.

Include:
- Primary function
- Key capabilities
- Expected outcomes

## Self-Improving Learnings

This skill learns from your corrections and preferences.

**On invocation**:
1. Check if `.agileflow/skills/_learnings/{skill-name}.yaml` exists
2. If exists, read and apply learned preferences
3. Follow conventions and avoid anti-patterns from learnings

**On correction**:
1. When user corrects output, extract the signal
2. Determine confidence level:
   - **high**: Explicit correction ("never do X", "always do Y")
   - **medium**: User approved or pattern worked well
   - **low**: Observation to review later
3. Update the learnings file with new preference

**Learnings file location**: `.agileflow/skills/_learnings/{skill-name}.yaml`

## Instructions

Step-by-step guidance for Claude:

1. **Load learnings** (if exists):
   - Read `.agileflow/skills/_learnings/{skill-name}.yaml`
   - Apply preferences, conventions, and anti-patterns
   - Skip if file doesn't exist (first run)

2. **Execute skill**:
   - Follow the instructions below with learned preferences applied
   - [Your skill-specific step A]
   - [Your skill-specific step B]

3. **If user corrects**:
   - Extract signal from correction
   - Update learnings file
   - Continue with corrected approach

4. **Final step**: Complete the task
   - Detail A
   - Detail B

## Output Format

Describe the expected output or deliverable:

```
[Example output format or template]
```

## Quality Checklist

Before completing, verify:
- [ ] Loaded learnings file (if exists)
- [ ] Applied learned preferences
- [ ] Requirement 1 met
- [ ] Requirement 2 met
- [ ] If corrected, updated learnings file

## Examples

### Example 1: [Scenario]

**User Input:**
```
[Example user prompt or input]
```

**Expected Output:**
```
[Example of what Claude should produce]
```

### Example 2: Learning from Correction

**User Correction:**
```
"Don't include emojis in the output"
```

**Self-Improve Action:**
1. Extract signal: "User said 'Don't include emojis'"
2. Learning: "Never include emojis in output"
3. Confidence: high (explicit correction)
4. Update `.agileflow/skills/_learnings/{skill-name}.yaml`

## Notes

- Learnings persist across sessions
- First run has no learnings file - that's OK
- High-confidence learnings are treated as rules
- Git tracks learnings evolution over time
