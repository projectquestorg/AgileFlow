---
description: Define and run parameterized workflow templates
argument-hint: <template> [arguments...]
compact_context:
  priority: normal
  preserve_rules:
    - "Workflows are reusable templates with arguments"
    - "Template format: {{arg_name}} for substitution"
    - "Built-in workflows: review, test-feature, implement, analyze"
    - "Custom workflows in docs/08-project/workflows/"
---

# /agileflow:workflow

Run parameterized workflow templates. Enables DRY patterns for common multi-step operations.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js workflow
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: Workflow Runner - Execute parameterized templates

**Template syntax**: `{{arg}}` for argument substitution

**Built-in workflows:**
- `review` - Code review with configurable focus
- `test-feature` - Test and verify a feature
- `implement` - Implement a story/feature
- `analyze` - Analyze codebase for issues

**Usage:**
```
/agileflow:workflow review path=src/auth.ts focus=security
/agileflow:workflow implement story=US-0042
/agileflow:workflow analyze target=src/**/*.ts type=performance
```

<!-- COMPACT_SUMMARY_END -->

---

## Usage

```
/agileflow:workflow <template> [arg1=value1] [arg2=value2] ...
```

---

## Built-in Workflows

### review

Review code with configurable focus.

**Arguments:**
- `path` (required): File or glob pattern to review
- `focus` (optional): Review focus (security, performance, quality, all)

**Template:**
```markdown
## Code Review: {{path}}

Focus: {{focus:all}}

### Steps
1. Read the target file(s)
2. Analyze for {{focus}} issues
3. Generate findings with severity
4. Suggest fixes

### Experts (parallel, on-fail: continue)
- agileflow-security (if focus=security|all)
- agileflow-performance (if focus=performance|all)
- agileflow-testing (if focus=quality|all)
```

**Example:**
```
/agileflow:workflow review path=src/auth.ts focus=security
```

---

### test-feature

Test a feature end-to-end.

**Arguments:**
- `feature` (required): Feature name or path
- `coverage` (optional): Minimum coverage threshold (default: 80)

**Template:**
```markdown
## Test Feature: {{feature}}

Coverage threshold: {{coverage:80}}%

### Steps
1. Identify test files for feature
2. Run existing tests
3. Generate missing tests
4. Verify coverage >= {{coverage}}%

### Expert: agileflow-testing
Discretion condition: **coverage above {{coverage}}%**
```

**Example:**
```
/agileflow:workflow test-feature feature=user-auth coverage=90
```

---

### implement

Implement a story or feature.

**Arguments:**
- `story` (required): Story ID or description
- `mode` (optional): Implementation mode (quick, thorough, tdd)

**Template:**
```markdown
## Implement: {{story}}

Mode: {{mode:thorough}}

### Steps (based on mode)

#### If mode=quick:
1. Minimal implementation
2. Basic tests
3. Quick review

#### If mode=thorough:
1. Plan mode first
2. Full implementation
3. Comprehensive tests
4. Code review
5. Documentation

#### If mode=tdd:
1. Write tests first
2. Implement to pass tests
3. Refactor
4. Verify coverage

### Expert selection based on story domain
```

**Example:**
```
/agileflow:workflow implement story=US-0042 mode=tdd
```

---

### analyze

Analyze codebase for issues.

**Arguments:**
- `target` (required): Path or glob pattern
- `type` (required): Analysis type (security, performance, complexity, all)

**Template:**
```markdown
## Analyze: {{target}}

Type: {{type}}

### Steps
1. Gather files matching {{target}}
2. Run {{type}} analysis
3. Generate report with findings
4. Prioritize by severity

### Experts (parallel, strategy: all, on-fail: continue)
- agileflow-security (if type=security|all)
- agileflow-performance (if type=performance|all)
- agileflow-refactor (if type=complexity|all)

### Output
Markdown report with:
- Summary metrics
- Findings by severity
- Recommended actions
```

**Example:**
```
/agileflow:workflow analyze target=src/**/*.ts type=all
```

---

## Custom Workflows

Create custom workflows in `docs/08-project/workflows/`:

```
docs/08-project/workflows/
├── deploy-staging.md
├── release-check.md
└── onboard-feature.md
```

### Custom Workflow Format

```markdown
---
name: deploy-staging
description: Deploy to staging environment
arguments:
  - name: version
    required: true
    description: Version to deploy
  - name: notify
    required: false
    default: true
    description: Send Slack notification
---

# Deploy to Staging: {{version}}

## Pre-checks
1. Verify tests passing
2. Check no blocking PRs

## Deployment
1. Build version {{version}}
2. Deploy to staging cluster
3. Run smoke tests

## Post-deploy
{{#if notify}}
4. Send Slack notification
{{/if}}
```

### Using Custom Workflows

```
/agileflow:workflow deploy-staging version=2.42.0 notify=false
```

---

## Advanced Features

### Conditional Sections

Use `{{#if arg}}` for conditional content:

```markdown
{{#if verbose}}
### Verbose Output
Show detailed logs...
{{/if}}
```

### Default Values

Use `{{arg:default}}` for default values:

```markdown
Coverage threshold: {{coverage:80}}%
Mode: {{mode:thorough}}
```

### Lists

Use `{{args...}}` for multiple values:

```markdown
Files to process:
{{#each files}}
- {{this}}
{{/each}}
```

---

## Workflow Composition

Workflows can reference other workflows:

```markdown
## Full Release

1. /agileflow:workflow test-feature feature=all coverage=90
2. /agileflow:workflow analyze target=src type=security
3. /agileflow:workflow deploy-staging version={{version}}
```

---

## Workflow Discovery

List available workflows:

```
/agileflow:workflow --list

Built-in workflows:
- review: Code review with focus
- test-feature: Test a feature
- implement: Implement a story
- analyze: Analyze codebase

Custom workflows (docs/08-project/workflows/):
- deploy-staging: Deploy to staging
- release-check: Pre-release checklist
```

---

## Best Practices

1. **Use descriptive names**: `deploy-staging` not `ds`
2. **Document arguments**: Include types and defaults
3. **Keep workflows focused**: One purpose per workflow
4. **Use composition**: Build complex flows from simple ones
5. **Version workflows**: Track changes in git

---

## Integration

- Works with babysit for story implementation
- Can trigger from Ralph Loop
- Integrates with expert system for multi-domain work
