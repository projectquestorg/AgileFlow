---
description: Orchestrate Research-Plan-Implement workflow with explicit phase transitions
argument-hint: "[TASK=<text>] [PHASE=research|plan|implement] [SKIP_RESEARCH=true|false]"
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:rpi - RPI workflow orchestration"
    - "Three phases: Research → Plan → Implement"
    - "Each phase ends with NEW CONVERSATION recommendation"
    - "Scaling detection: trivial tasks skip research"
    - "Context health monitoring: warn at 40% utilization"
    - "Phase artifacts compress previous phase understanding"
  state_fields:
    - current_phase
    - task_description
    - research_artifact_path
    - plan_artifact_path
    - complexity_level
---

# /agileflow:rpi

Orchestrate the Research-Plan-Implement workflow for maximum AI agent effectiveness.

---

## Purpose

Guide complex tasks through three phases, each producing a compressed artifact for the next phase. Based on [Context Engineering for Coding Agents](../10-research/20260113-context-engineering-coding-agents.md) research.

**Key insight**: LLMs are stateless. Better output requires better input context. Frequent intentional compaction at phase boundaries prevents the "dumb zone" (~40% context utilization).

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js rpi
```

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - RPI WORKFLOW ACTIVE

**CRITICAL**: You are running `/agileflow:rpi`. Guide user through Research → Plan → Implement phases.

### The Three Phases

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RESEARCH   │ ──► │    PLAN     │ ──► │  IMPLEMENT  │
│             │     │             │     │             │
│ Understand  │     │ Design      │     │ Execute     │
│ the system  │     │ the change  │     │ the plan    │
│             │     │             │     │             │
│ Output:     │     │ Output:     │     │ Output:     │
│ research.md │     │ plan.md     │     │ code + tests│
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
  NEW CONVERSATION    NEW CONVERSATION    DONE
```

### RULE #1: SCALING DETECTION

**Assess task complexity FIRST:**

| Complexity | Signs | Approach |
|------------|-------|----------|
| Trivial | Typo, config tweak, simple fix | Just do it |
| Simple | Single file, clear path | Plan → Implement |
| Moderate | Multi-file, known patterns | Plan → Implement |
| Complex | Brownfield, unfamiliar code | Research → Plan → Implement |
| Exploratory | Unknown territory, multi-repo | Full RPI with iteration |

**Skip research when**:
- Task is clearly defined
- You already understand the codebase area
- Changes are isolated to 1-2 files
- User specifies `SKIP_RESEARCH=true`

### RULE #2: PHASE TRANSITIONS

**After each phase, output the compaction prompt:**

```markdown
---

## Phase Complete: [PHASE_NAME]

**Artifact saved**: `[path/to/artifact.md]`

### Recommended Next Step

Start a **new conversation** with this context:

> I need to [NEXT_PHASE] based on the [ARTIFACT_TYPE] at `[path]`.
>
> [Brief summary of artifact content]

**Why new conversation?** Fresh context window starts in the "smart zone" (<40% utilization). The artifact compresses all previous understanding.

---
```

### RULE #3: PHASE OUTPUTS

**Research Phase Output** → `docs/10-research/YYYYMMDD-topic.md`:
- Exact files and line numbers that matter
- How the system actually works (from code, not docs)
- Key patterns and constraints discovered
- Risks and edge cases identified

**Plan Phase Output** → `.claude/plans/[slug].md`:
- Exact steps with file paths and line numbers
- Actual code snippets (not pseudocode)
- Testing strategy per change
- Edge cases and risks

**Implement Phase Output** → Code + tests:
- Follow the plan exactly
- Test after each change
- Don't deviate without replanning

### RULE #4: CONTEXT HEALTH WARNING

If conversation is getting long, warn:

```markdown
⚠️ **Context Health Warning**

This conversation has grown significantly. Signs of approaching the "dumb zone":
- We've read many files
- Multiple exploration cycles
- Heavy tool output

**Recommendation**: Complete current phase, save artifact, start fresh.
```

### WORKFLOW

**Phase 1: Research** (when needed)
1. Use `/agileflow:research:ask TOPIC="..."` to generate research prompt
2. User pastes results from ChatGPT/Claude/Perplexity
3. Use `/agileflow:research:import` to save artifact
4. Output phase transition prompt → NEW CONVERSATION

**Phase 2: Plan**
1. Reference research artifact (if exists)
2. Use `EnterPlanMode` for read-only exploration
3. Design implementation approach
4. Save plan to `.claude/plans/[slug].md`
5. Get user approval on plan
6. Output phase transition prompt → NEW CONVERSATION

**Phase 3: Implement**
1. Reference plan artifact
2. Execute step-by-step
3. Test after each change
4. Follow plan exactly (don't deviate)
5. Mark story complete when done

### ANTI-PATTERNS

❌ Skip research for complex brownfield work
❌ Plan without understanding the system first
❌ Implement without approved plan
❌ Continue in same conversation after phase complete
❌ Deviate from plan during implementation
❌ Ignore context health warnings

### DO THESE INSTEAD

✅ Assess complexity before choosing phases
✅ Complete research before planning
✅ Get plan approval before implementing
✅ Start fresh conversation between phases
✅ Follow plan exactly during implementation
✅ Monitor context health throughout

### KEY FILES

| File | Purpose |
|------|---------|
| `docs/10-research/YYYYMMDD-*.md` | Research artifacts |
| `.claude/plans/*.md` | Plan artifacts |
| `docs/02-practices/context-engineering-rpi.md` | RPI practice guide |

### REMEMBER AFTER COMPACTION

- `/agileflow:rpi` IS ACTIVE - orchestrating RPI workflow
- Three phases: Research → Plan → Implement
- Each phase produces compressed artifact
- NEW CONVERSATION between phases (fresh context)
- Assess complexity first (skip phases for simple tasks)
- Monitor context health (warn at ~40%)
- Follow plan exactly during implementation

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| TASK | No | Description of what to implement |
| PHASE | No | Start at specific phase: `research`, `plan`, or `implement` |
| SKIP_RESEARCH | No | Set `true` to skip research phase for simpler tasks |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Assess Task Complexity

Read the TASK argument (or ask user) and assess complexity:

```
Trivial     → Just do it (no RPI needed)
Simple      → Plan → Implement
Moderate    → Plan → Implement
Complex     → Research → Plan → Implement
Exploratory → Full RPI with iteration
```

**Complexity indicators**:
- **Trivial**: Typo fix, config change, <10 lines
- **Simple**: Single file, clear requirements, known patterns
- **Moderate**: 2-5 files, established patterns, some exploration
- **Complex**: Brownfield code, unfamiliar area, many files
- **Exploratory**: Unknown territory, needs investigation, multi-repo

### Step 2: Determine Starting Phase

Based on complexity assessment:

```
If PHASE argument provided → Start at that phase
If SKIP_RESEARCH=true     → Start at Plan phase
If Trivial                → Skip RPI, just implement
If Simple/Moderate        → Start at Plan phase
If Complex/Exploratory    → Start at Research phase
```

### Step 3: Execute Current Phase

#### Research Phase

If starting research:

1. **Generate research prompt**:
```markdown
I'll help you research this topic. Let me generate a comprehensive prompt for external AI.

Running: `/agileflow:research:ask TOPIC="[task description]"`
```

2. **Wait for user to paste results**:
```markdown
Copy the prompt above and paste it into ChatGPT, Claude web, or Perplexity.

When you get the answer, paste the results here and I'll save them.
```

3. **Import and save research**:
```markdown
Running: `/agileflow:research:import TOPIC="[topic]"`
```

4. **Output phase transition**:
```markdown
---

## Phase Complete: Research ✓

**Artifact saved**: `docs/10-research/[date]-[topic].md`

### Key Findings Summary
- [3-5 bullet points of key discoveries]

### Recommended Next Step

Start a **new conversation** with this context:

> I need to plan the implementation of [task] based on the research at `docs/10-research/[date]-[topic].md`.
>
> Key constraints discovered:
> - [constraint 1]
> - [constraint 2]

**Why new conversation?** Fresh context window starts in the "smart zone" (<40% utilization). The research artifact compresses all understanding from exploration.

---
```

#### Plan Phase

If starting plan:

1. **Load research context** (if exists):
```markdown
Reading research artifact: `docs/10-research/[relevant].md`
```

2. **Enter plan mode**:
```markdown
Entering plan mode for read-only exploration...

I'll explore the codebase to design the implementation approach.
```

3. **Explore and design** using Glob, Grep, Read tools

4. **Create plan artifact**:
```markdown
Saving plan to: `.claude/plans/[slug].md`
```

5. **Present plan for approval**:
```markdown
## Implementation Plan

### Step 1: [Description]
**File**: `path/to/file.ts`
**Change**: [What to change]
```typescript
// Actual code snippet
```
**Test**: [How to verify]

### Step 2: [Description]
...

---

**Please review this plan.**

⚠️ **Leverage reminder**: A bad plan = 100+ bad lines of code. Take time to review.

Approve this plan? (YES to proceed, or provide feedback)
```

6. **Output phase transition** (after approval):
```markdown
---

## Phase Complete: Plan ✓

**Artifact saved**: `.claude/plans/[slug].md`

### Plan Summary
- [N] steps to implement
- Files affected: [list]
- Estimated complexity: [assessment]

### Recommended Next Step

Start a **new conversation** with this context:

> Implement the plan from `.claude/plans/[slug].md`, starting with step 1.
>
> This plan implements [brief description]. Follow each step exactly.

**Why new conversation?** Fresh context window with compressed intent. The plan contains everything needed for implementation.

---
```

#### Implement Phase

If starting implement:

1. **Load plan artifact**:
```markdown
Reading plan: `.claude/plans/[slug].md`
```

2. **Execute step-by-step**:
```markdown
## Implementing Step 1 of [N]

[Execute the step as defined in plan]
```

3. **Test after each step**:
```markdown
Running tests to verify step 1...
```

4. **Complete implementation** with smart AskUserQuestion:
```markdown
---

## Phase Complete: Implement ✓

All [N] steps executed successfully.

### Summary
- [X] files modified
- [Y] tests added/updated
- [Z] tests passing
```

Then present smart next steps:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Implementation complete: [N] steps done, [X] files modified, [Z] tests passing. What next?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Run full test suite (Recommended)", "description": "Verify all [Z] tests still pass after [X] file changes"},
    {"label": "🔍 Run logic audit on [X] modified files", "description": "5 analyzers check for edge cases, race conditions, type bugs"},
    {"label": "Create PR with /agileflow:pr", "description": "[X] files changed across [N] implementation steps"},
    {"label": "Pause here", "description": "Implementation saved, tests can be run later"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Monitor Context Health

Throughout execution, monitor for signs of context degradation:

**Warning signs**:
- Many files read (>10)
- Multiple exploration cycles
- Heavy tool output (JSON, logs)
- Repetitive or generic responses

**If detected, use smart AskUserQuestion**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "⚠️ Context at ~[utilization]% ([phase] phase). [files_read] files read, [tool_calls] tool calls. Save progress?",
  "header": "Context health",
  "multiSelect": false,
  "options": [
    {"label": "Save [phase] artifact and start fresh (Recommended)", "description": "New conversation starts in smart zone (<40%). Artifact preserves all understanding."},
    {"label": "Compact context and continue", "description": "Reduce utilization but may lose some nuance"},
    {"label": "Continue without saving", "description": "⚠️ Quality may degrade - currently at [utilization]%"},
    {"label": "Pause here", "description": "Progress saved to [artifact_path]"}
  ]
}]</parameter>
</invoke>
```

---

## Scaling Guide

| Task Type | Recommended Approach |
|-----------|---------------------|
| Typo fix | Just fix it |
| Config change | Just do it |
| Simple bug fix | Plan → Implement |
| New component | Plan → Implement |
| Feature in known area | Plan → Implement |
| Feature in unfamiliar area | Research → Plan → Implement |
| Complex refactoring | Research → Plan → Implement |
| Multi-repo changes | Full RPI with iteration |
| Architectural change | Research → Plan → Implement (with ADR) |

---

## The Dumb Zone

Context utilization affects agent performance:

| Utilization | Zone | Performance |
|-------------|------|-------------|
| 0-40% | Smart Zone | Full reasoning capability |
| 40-70% | Diminishing Returns | Reduced quality |
| 70%+ | Dumb Zone | Significant degradation |

**Signs you're in the Dumb Zone**:
- Agent makes obvious mistakes
- Responses become repetitive
- "I understand your concern" after corrections
- Tool calls become less accurate

**Solution**: Complete current phase, save artifact, start fresh.

---

## Leverage Math

```
Bad line of code        = 1 bad line
Bad part of plan        = 100+ bad lines
Bad line of research    = entire direction is hosed
```

Human review should focus on highest leverage points:
1. Research quality (is our understanding correct?)
2. Plan quality (are these the right steps?)
3. Code quality (implementation details)

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/agileflow:research:ask` | Generate research prompts |
| `/agileflow:research:import` | Save research artifacts |
| `/agileflow:research:analyze` | Analyze for implementation |
| `/agileflow:mentor` | Full orchestrated development |
| `EnterPlanMode` | Read-only exploration mode |

---

## Expected Output

### Success - RPI Workflow

```
🔄 RPI Workflow: User Authentication Feature
══════════════════════════════════════════════════════════════

Phase 1: RESEARCH (Current)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gathering context...
✓ Read existing auth code (src/api/auth.js)
✓ Analyzed 3 related components
✓ Reviewed security requirements
✓ Checked team patterns (JWT preferred)

Research Summary:
- Current: Basic session auth
- Target: JWT with refresh tokens
- Patterns: Use existing middleware structure
- Risks: Token storage, refresh logic

AskUserQuestion:
  question: "Research complete: 4 findings, 2 risks identified. Ready for planning phase?"
  options:
    - "Start planning in new conversation (Recommended)" → "Fresh context with research artifact compressed"
    - "Continue planning in this conversation" → "Context at ~35% - still in smart zone"
    - "Refine research first" → "4 findings may need deeper investigation"
    - "Pause here" → "Research saved to docs/10-research/"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proposed Implementation:
1. Add JWT generation in auth.js
2. Create refresh token middleware
3. Update login endpoint
4. Add token validation
5. Write tests (unit + integration)

Files to modify: 4
New files: 2
Estimated complexity: Medium

AskUserQuestion:
  question: "Plan ready: 5 steps, 6 files, ~medium complexity. Approve and proceed?"
  options:
    - "Approve - start implementing in new conversation (Recommended)" → "Fresh context with plan artifact"
    - "Approve - implement in this conversation" → "Context at ~50% - proceed with caution"
    - "Revise step 3 (update login endpoint)" → "Adjust plan before implementing"
    - "Pause here" → "Plan saved to .claude/plans/"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: IMPLEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implementing...
✓ Updated src/api/auth.js
✓ Created src/middleware/jwt.js
✓ Created src/utils/tokens.js
✓ Added 12 tests (all passing)

🎉 Implementation complete!

AskUserQuestion:
  question: "Implementation complete: 5 steps, 4 files modified, 12 tests passing. What next?"
  options:
    - "Run full test suite (Recommended)" → "Verify all 12 tests pass"
    - "🔍 Run logic audit on 4 modified files" → "5 analyzers check for edge cases"
    - "Create PR" → "4 files changed across 5 steps"
    - "Pause here" → "Implementation saved"
```

### Success - Phase Transition

```
🔄 RPI Phase Transition
══════════════════════════════════════════════════════════════

Current: RESEARCH → Next: PLAN

⚠️ Context Health: 65% (approaching threshold)

AskUserQuestion:
  question: "Context at 65% - approaching dumb zone. Save artifact and transition?"
  options:
    - "Save artifact and start new conversation (Recommended)" → "Fresh context in smart zone (<40%)"
    - "Continue in this conversation" → "⚠️ Quality may degrade past 70%"
    - "Compact context first" → "Reduce utilization, then continue"
    - "Pause here" → "Progress saved, resume later"
```

### Error - Wrong Phase

```
❌ Error: Cannot implement without planning

Current phase: RESEARCH

Complete the workflow in order:
1. RESEARCH ✅ (current)
2. PLAN ⏳
3. IMPLEMENT ⏳

Skip to plan: /agileflow:rpi PHASE=plan
```

---

## Related Documentation

- [Context Engineering RPI Practice](../../docs/02-practices/context-engineering-rpi.md)
- [Context Engineering Research](../../docs/10-research/20260113-context-engineering-coding-agents.md)
