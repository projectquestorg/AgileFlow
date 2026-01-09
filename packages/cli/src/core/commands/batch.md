---
description: Process multiple items with functional patterns (map/pmap/filter/reduce)
argument-hint: <operation> <pattern> [action]
compact_context:
  priority: normal
  preserve_rules:
    - "map: Execute action on each item sequentially"
    - "pmap: Execute action on each item in parallel (spawn Task agents)"
    - "filter: Return items matching criteria"
    - "reduce: Aggregate items into single output"
  state_fields:
    - batch_operation
    - items_processed
    - items_total
---

# /agileflow:batch

Process multiple items with functional patterns. Enables batch operations on stories, files, or tasks.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js batch
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: Batch Processor - Apply functional patterns to collections

**Operations**:
- `map` - Execute action on each item sequentially
- `pmap` - Execute action in parallel (spawn agents)
- `filter` - Return items matching criteria
- `reduce` - Aggregate items into output

**Usage Examples**:
```
/agileflow:batch map "docs/06-stories/*.md" validate
/agileflow:batch pmap "src/**/*.tsx" add-tests
/agileflow:batch filter stories status=ready
/agileflow:batch reduce "docs/06-stories/*.md" summary
```

**Workflow**:
1. Parse operation and pattern
2. Resolve pattern to item list
3. For each item: execute action based on operation type
4. Collect and report results

<!-- COMPACT_SUMMARY_END -->

---

## Usage

```
/agileflow:batch <operation> <pattern> [action]
```

### Operations

| Operation | Description | Parallelism |
|-----------|-------------|-------------|
| `map` | Execute action on each item | Sequential |
| `pmap` | Execute action in parallel | Parallel (agents) |
| `filter` | Return matching items | N/A |
| `reduce` | Aggregate to single output | Sequential |

### Pattern Types

| Pattern | Resolves To | Example |
|---------|-------------|---------|
| Glob | File paths | `src/**/*.tsx` |
| `stories` | Stories from status.json | `stories status=ready` |
| `epics` | Epics from status.json | `epics status=in_progress` |

---

## Examples

### 1. Validate All Stories (map)

```
/agileflow:batch map "docs/06-stories/*.md" validate
```

Sequentially validates each story file:
- Checks for required frontmatter
- Validates acceptance criteria format
- Reports issues

**Output:**
```
📦 Batch: map over 12 items

📍 Processing: docs/06-stories/US-0042.md
  ✅ Valid story format

📍 Processing: docs/06-stories/US-0043.md
  ⚠️ Missing acceptance criteria

...

✅ Complete: 10 passed, 2 warnings
```

### 2. Generate Tests in Parallel (pmap)

```
/agileflow:batch pmap "src/components/*.tsx" add-tests
```

Spawns parallel agents to generate tests:

**What happens:**
1. Glob resolves to list of component files
2. For each file, spawn Task agent:
   ```
   Task(
     description: "Add tests for Button.tsx",
     prompt: "Generate comprehensive tests for src/components/Button.tsx",
     subagent_type: "agileflow-testing",
     run_in_background: true
   )
   ```
3. Collect results with TaskOutput
4. Report summary

**Output:**
```
🔀 Batch: pmap over 8 items (parallel)

🔀 Spawning 8 parallel agents...
  📍 task-001: Button.tsx
  📍 task-002: Input.tsx
  📍 task-003: Select.tsx
  ...

⏳ Waiting for completion...

✅ task-001: Button.tsx - 5 tests added
✅ task-002: Input.tsx - 4 tests added
✅ task-003: Select.tsx - 6 tests added
...

✅ Complete: 8/8 successful, 38 tests added
```

### 3. Filter Ready Stories

```
/agileflow:batch filter stories status=ready
```

Returns stories matching criteria:

**Output:**
```
🔍 Filter: stories where status=ready

Found 3 matching stories:

1. US-0042: Add user profile settings
   Epic: EP-0009 | Priority: high

2. US-0043: Implement password reset
   Epic: EP-0009 | Priority: high

3. US-0045: Add notification preferences
   Epic: EP-0010 | Priority: medium
```

### 4. Reduce to Summary Report

```
/agileflow:batch reduce "docs/06-stories/*.md" summary
```

Aggregates stories into summary:

**Output:**
```
📊 Reduce: 15 stories → summary

Epic Distribution:
  EP-0009: 8 stories (53%)
  EP-0010: 4 stories (27%)
  EP-0011: 3 stories (20%)

Status Distribution:
  ready: 5 (33%)
  in_progress: 3 (20%)
  completed: 7 (47%)

Priority:
  high: 6
  medium: 7
  low: 2
```

---

## Actions

### Built-in Actions

| Action | Description | Works With |
|--------|-------------|------------|
| `validate` | Check format/structure | stories, epics |
| `add-tests` | Generate tests | source files |
| `lint` | Run linter | source files |
| `format` | Apply formatting | source files |
| `summarize` | Generate summary | any |
| `count` | Count items | any |

### Custom Actions

For pmap, action becomes the agent prompt:

```
/agileflow:batch pmap "src/**/*.ts" "refactor to use async/await"
```

This spawns agents with prompt: "refactor to use async/await" for each file.

---

## Filter Criteria

Filters use `field=value` syntax:

```
/agileflow:batch filter stories status=ready
/agileflow:batch filter stories epic=EP-0009
/agileflow:batch filter stories priority=high
/agileflow:batch filter epics status=in_progress
```

Multiple criteria (AND):
```
/agileflow:batch filter stories status=ready priority=high
```

---

## Implementation Details

### Map Operation

```javascript
// Sequential execution
for (const item of items) {
  const result = await executeAction(item, action);
  results.push(result);
  console.log(`📍 ${item}: ${result.status}`);
}
```

### Pmap Operation

```javascript
// Parallel execution with agents
const tasks = items.map(item => Task({
  description: `Process ${path.basename(item)}`,
  prompt: `${action} for ${item}`,
  subagent_type: getAgentForAction(action),
  run_in_background: true
}));

// Collect results
for (const task of tasks) {
  const result = await TaskOutput(task.id, { block: true });
  results.push(result);
}
```

### Filter Operation

```javascript
// Load and filter status.json
const status = loadStatus();
const items = type === 'stories' ? status.stories : status.epics;

const filtered = Object.entries(items)
  .filter(([id, item]) => matchesCriteria(item, criteria))
  .map(([id, item]) => ({ id, ...item }));
```

### Reduce Operation

```javascript
// Aggregate with accumulator
let accumulator = initialValue;
for (const item of items) {
  accumulator = reducer(accumulator, item);
}
return accumulator;
```

---

## Best Practices

### When to Use Each Operation

| Use Case | Operation |
|----------|-----------|
| Sequential processing | `map` |
| Independent tasks, time-sensitive | `pmap` |
| Query/search | `filter` |
| Reports/aggregation | `reduce` |

### Performance Considerations

- **pmap** spawns agents - each costs tokens
- Limit pmap to reasonable batch sizes (< 20 items)
- Use `map` for quick operations (validation, counting)
- Use `filter` before other operations to reduce scope

### Error Handling

- Map/pmap continue on individual item failures
- Failed items are reported at end
- Use `--fail-fast` flag to stop on first error:
  ```
  /agileflow:batch map "*.ts" lint --fail-fast
  ```

---

## State Tracking

Batch operations update session-state.json:

```json
{
  "last_batch": {
    "operation": "pmap",
    "pattern": "src/**/*.tsx",
    "action": "add-tests",
    "items_total": 8,
    "items_processed": 8,
    "items_failed": 0,
    "completed_at": "2026-01-09T12:00:00Z"
  }
}
```

---

## Integration

- Works with `/agileflow:babysit` for batch story processing
- Can be used in Ralph Loop for batch operations per iteration
- Integrates with agent system for parallel work
