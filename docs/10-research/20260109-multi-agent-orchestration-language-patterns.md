# Multi-Agent Orchestration Language Patterns

**Date**: 2026-01-09
**Source**: Research on AI orchestration DSLs and agentic workflow patterns
**Status**: Active research - features to implement

## Executive Summary

Research into domain-specific languages for AI agent orchestration revealed several patterns that would enhance AgileFlow's multi-agent capabilities. Key findings focus on three areas:

1. **State Narration Protocol** - Visual markers for execution state tracking
2. **Discretion Markers** - Semantic conditions for loop termination
3. **Pipeline Operations** - Batch processing with functional patterns

## 1. State Narration Protocol

### Concept

In long-running agent sessions, tracking execution state becomes difficult. A visual marker system embeds state directly in conversation history, making it scannable.

### Proposed Markers

| Marker | Meaning | Usage |
|--------|---------|-------|
| 📍 | Execution position | Current step/story being worked on |
| 📦 | Variable/context | Data being passed between agents |
| 🔀 | Parallel status | When multiple agents working simultaneously |
| 🔄 | Loop iteration | Current loop count (e.g., `🔄 3/10`) |
| ⚠️ | Error state | When errors occur, with brief description |
| ✅ | Completion | Task/story completed successfully |
| 🔒 | Blocked | Task blocked, with blocker reason |

### Implementation in AgileFlow

**babysit.md changes:**
```markdown
## State Narration

At key points, emit state markers:

📍 **Current**: US-0042 - Add login form
📦 **Context**: { user: "auth", api: "complete" }
🔄 **Loop**: 3/10 (Ralph iteration)
```

**ralph-loop.js changes:**
```javascript
// Before each iteration
console.log(`🔄 Iteration ${iteration}/${maxIterations}`);
console.log(`📍 Working on: ${currentStory}`);

// On completion
console.log(`✅ Story complete: ${storyId}`);

// On error
console.log(`⚠️ Test failure: ${testResult.summary}`);
```

### Benefits

- **Visibility**: State is inline, not hidden in files
- **Debugging**: Easy to scan conversation for state changes
- **Resumability**: After compact, state markers help restore context
- **Human-readable**: No need to check status.json for quick status

---

## 2. Discretion Markers for Loop Conditions

### Concept

Traditional loop conditions are boolean (true/false). Discretion markers allow semantic conditions that require AI judgment.

### Proposed Syntax

Use `**...**` (double asterisks) for AI-evaluated conditions:

```markdown
## Loop Conditions

The loop continues until ONE of these semantic conditions is met:

**Semantic Conditions (AI-evaluated):**
- **all tests passing**
- **code coverage above 80%**
- **all acceptance criteria verified**
- **no linting errors**

**Hard Conditions (always checked):**
- Max iterations reached (default: 20)
- User requests stop
- Unrecoverable error
```

### Implementation Strategy

**In ralph-loop.js:**
```javascript
async function evaluateSemanticCondition(condition, context) {
  // For now, translate common conditions to concrete checks
  const translations = {
    'all tests passing': () => runTests().success,
    'code coverage above 80%': () => getCoverage() > 80,
    'all acceptance criteria verified': () => checkACsComplete(),
    'no linting errors': () => runLint().success,
  };

  return translations[condition]?.() ?? false;
}
```

**In babysit.md:**
```markdown
### Loop Termination

When **all acceptance criteria verified**:
1. Parse AC from story file
2. Check each AC is marked complete
3. Return true if all complete
```

### Benefits

- **Natural language**: Conditions read like requirements
- **Flexible**: Easy to add new condition types
- **Expressive**: Matches how developers think about "done"

---

## 3. Pipeline Operations for Batch Processing

### Concept

Functional programming patterns (map, filter, reduce) for processing collections of stories, files, or tasks.

### Proposed Commands

**`/agileflow:batch`** - Apply operation to multiple items

```markdown
# Batch Operations

## Usage

/agileflow:batch map GLOB_PATTERN ACTION
/agileflow:batch filter CRITERIA
/agileflow:batch pmap GLOB_PATTERN ACTION  # parallel

## Examples

# Map: Apply to each
/agileflow:batch map docs/06-stories/*.md validate

# Filter: Select matching
/agileflow:batch filter stories status=ready

# Parallel Map: Process concurrently
/agileflow:batch pmap src/**/*.tsx add-tests
```

### Implementation Approach

**New command: `packages/cli/src/core/commands/batch.md`**

```markdown
# /agileflow:batch

Process multiple items with functional patterns.

## IMMEDIATE ACTIONS

1. Parse operation type (map, filter, pmap, reduce)
2. Resolve glob pattern to file list
3. For each file:
   - map: Execute ACTION synchronously
   - pmap: Spawn parallel Task agents
   - filter: Evaluate CRITERIA, output matches
4. Collect results
5. Report summary

## Operations

### map
Execute action on each item sequentially.
Good for: Validation, linting, formatting

### pmap (parallel map)
Execute action on each item in parallel.
Good for: Test generation, refactoring, independent changes

### filter
Return items matching criteria.
Good for: Finding ready stories, incomplete tests

### reduce
Aggregate items into single output.
Good for: Generating reports, combining files
```

### Example Workflows

**Generate tests for all new files:**
```
/agileflow:batch pmap src/components/*.tsx generate-tests
```

**Find all blocked stories:**
```
/agileflow:batch filter stories status=blocked
```

**Validate all stories:**
```
/agileflow:batch map docs/06-stories/*.md validate-story
```

---

## 4. Join Strategies for Parallel Work

### Concept

When spawning parallel agents, define how to handle completion/failure.

### Proposed Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `all` | Wait for all to complete | Multi-reviewer code review |
| `first` | Take first result | Racing alternative approaches |
| `any` | Take any that succeeds | Fallback patterns |
| `majority` | Take consensus result | High-stakes decisions |

### Implementation

**In orchestrator.md:**
```markdown
## Join Strategies

When spawning parallel agents, specify strategy:

parallel(strategy: "all"):
  api = Task("Create API", subagent_type: "agileflow-api")
  ui = Task("Create UI", subagent_type: "agileflow-ui")

# Strategy options:
# - all: Wait for all, fail if any fails
# - first: Return first completion
# - any: Return first success, ignore failures
# - majority: Return most common result
```

---

## 5. Choice Blocks for Dynamic Branching

### Concept

AI-selected branching based on context analysis, more flexible than if/else.

### Proposed Syntax

```markdown
## Choice Block

Evaluate context and select best approach:

choice **best fix for this performance issue**:
  option "Add caching":
    - Implement Redis cache layer
    - Update API to use cache
  option "Optimize queries":
    - Add database indexes
    - Rewrite N+1 queries
  option "Add pagination":
    - Implement cursor pagination
    - Update UI for infinite scroll
```

### When to Use

- Multiple valid approaches exist
- Best choice depends on codebase context
- Expert judgment required

---

## Implementation Roadmap

### Phase 1: State Narration (Low effort, high impact) ✅ COMPLETE
- [x] Add markers to babysit.md response format
- [x] Add markers to ralph-loop.js console output
- [x] Document marker meanings in compact summary

### Phase 2: Discretion Markers (Medium effort) ✅ COMPLETE
- [x] Update ralph-loop.js to support semantic conditions
- [x] Create condition translation layer (8 built-in conditions)
- [x] Add common conditions (tests, coverage, lint, types, build, AC)
- [x] CLI flag `--condition="**...**"` support
- [x] Metadata configuration in agileflow-metadata.json

### Phase 3: Pipeline Commands (Medium effort) ✅ COMPLETE
- [x] Create /agileflow:batch command
- [x] Design map, pmap, filter, reduce operations
- [x] Document glob pattern resolution and criteria syntax

### Phase 4: Advanced Features ✅ COMPLETE
- [x] Join strategies in orchestrator (all/first/any/any-N/majority)
- [x] Failure policies (fail-fast/continue/ignore)
- [x] Retry with backoff for expert spawning
- [x] Parameterized workflow templates (/agileflow:workflow)
- [x] Choice blocks for dynamic branching (/agileflow:choose)

---

## Related Research

- [20260109-ralph-loop-tdd-ui-workflow.md](./20260109-ralph-loop-tdd-ui-workflow.md) - Visual mode patterns
- [20260101-claude-code-stop-hooks-ralph-loop.md](./20260101-claude-code-stop-hooks-ralph-loop.md) - Ralph loop foundation
- [20251225-top-2pct-agentic-engineer-2026.md](./20251225-top-2pct-agentic-engineer-2026.md) - Multi-agent orchestration

---

## Key Insights

1. **State should be visible** - Hidden state causes confusion in long sessions
2. **Conditions should be semantic** - "All tests passing" is clearer than `testResult.success === true`
3. **Batch operations save tokens** - Processing 10 stories with pmap uses 10x fewer context tokens than sequential
4. **Join strategies prevent waste** - "First wins" avoids waiting for slow agents
