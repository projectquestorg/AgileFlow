# Claude Code Task System - Multi-Agent Team Orchestration

**Import Date**: 2026-02-03
**Topic**: Claude Code Task System for Multi-Agent Orchestration
**Source**: YouTube video transcript (IndyDevDan)
**Content Type**: Video transcript

---

## Summary

The Claude Code Task System represents a significant evolution in agentic engineering, enabling reliable multi-agent team orchestration through four key tools: TaskCreate, TaskGet, TaskList, and TaskUpdate. Unlike ad-hoc sub-agent spawning, this system allows agents to communicate through a shared task list with dependencies, blocking relationships, and real-time completion notifications.

The approach combines three powerful components: **self-validation** (agents validate their own work via hooks), **agent orchestration** (teams of specialized agents working together), and **templating** (meta-prompts that generate prompts in consistent formats). This enables "building the agentic layer" - teaching agents how to build applications rather than building applications directly.

The key insight is that more agents with focused context windows doing one specific thing outperform a single overloaded agent. The recommended minimum team structure is a **builder** agent paired with a **validator** agent - doubling compute to increase trust in delivered work.

---

## Key Findings

- **Task System Tools**: Four primary tools - TaskCreate, TaskGet, TaskList, TaskUpdate - enable agents to communicate and coordinate work
- **Task Dependencies**: Tasks can block other tasks and have prerequisites, enabling ordered parallel execution
- **Primary Agent Orchestration**: The main agent becomes an orchestrator, building task lists and assigning work to specialized sub-agents
- **Builder + Validator Pattern**: Minimum viable team is 2 agents - one builds, one validates. This 2x compute increases trust in results
- **Self-Validation via Hooks**: Agents can validate their own work using PostToolUse and Stop hooks with validation scripts
- **Template Meta-Prompts**: Prompts that generate prompts in consistent, highly-vetted formats for reproducible workflows
- **Focused Context Windows**: Each sub-agent operates with a focused context on one specific task, avoiding context degradation
- **Real-Time Communication**: Sub-agents ping back to the primary agent when work completes; no sleep loops needed
- **Core Four Framework**: Context, Model, Prompt, Tools - the fundamental levers of agentic coding

---

## Implementation Approach

### 1. Build a Template Meta-Prompt

Create a reusable prompt that generates plans with team orchestration:
- Include hooks for self-validation (validate_new_file, validate_file_contains)
- Define team orchestration section detailing TaskCreate/Update/List/Get tools
- Template the output format so plans come out consistently

### 2. Define Specialized Agents

Create at minimum two agent types in `.claude/agents/team/`:

**Builder Agent**:
- Purpose: Focus on single task, build and report work
- Hooks: PostToolUse for per-file validation (e.g., run linter on Python files)
- Output: Reports completion to task list

**Validator Agent**:
- Purpose: Verify builder completed task correctly
- Actions: Run validation, report success/failure
- Can trigger additional checks or corrections

### 3. Use the Orchestration Prompt

Pass two prompts to your planning agent:
1. **User Prompt**: What you want to build
2. **Orchestration Prompt**: How to build the team (e.g., "create groups of agents for each hook, one builder and one validator")

### 4. Leverage Task Dependencies

Structure tasks to run in order:
- First batch: All builders run in parallel
- Blocked batch: Validators run after builders complete
- Final batch: Documentation/integration tasks

---

## Code Snippets

### Task System Key Tools

```javascript
// TaskCreate - Create a new task with metadata
TaskCreate({
  subject: "Build session end hook",
  description: "Implement session_end.py with logging",
  activeForm: "Building session end hook",
  owner: "builder-session-end"
})

// TaskUpdate - Update task status and communicate completion
TaskUpdate({
  taskId: "1",
  status: "completed",
  // Or set up dependencies:
  addBlockedBy: ["2", "3"] // This task waits for tasks 2 and 3
})

// TaskList - View all tasks and their states
TaskList() // Returns all tasks with status, owner, blockedBy

// TaskGet - Get full details of a specific task
TaskGet({ taskId: "1" })
```

### Self-Validating Agent Hook (Stop Hook)

```yaml
# In agent prompt front matter
hooks:
  stop:
    - command: "node scripts/validate_new_file.js specs/ .md"
    - command: "node scripts/validate_file_contains.js specs/ '## Team Orchestration' '## Step-by-Step Tasks'"
```

### Builder Agent with PostToolUse Validation

```yaml
# Builder agent prompt
hooks:
  post_tool_use:
    write:
      - match: "*.py"
        command: "ruff check {file} && pyright {file}"
```

### Orchestration Prompt Example

```markdown
ORCHESTRATION PROMPT:
Create groups of agents for each hook:
- One builder agent (focuses on implementation)
- One validator agent (verifies correctness)

Builder agents should:
1. Read existing hook patterns
2. Implement the specific hook
3. Report completion to task list

Validator agents should:
1. Run Python compile on scripts
2. Verify logging is correct
3. Report success or failure with details
```

---

## Action Items

- [ ] Create builder and validator agent prompts in `.claude/agents/team/`
- [ ] Build a template meta-prompt for team-based planning
- [ ] Add validation hooks to existing agents for self-checking
- [ ] Implement task dependency patterns for ordered execution
- [ ] Create orchestration prompt templates for common workflows

---

## Risks & Gotchas

- **Over-reliance on abstraction**: Using high-level tools without understanding fundamentals leads to "slop engineering"
- **Validation gaps**: The demo acknowledged validators could have been stronger (e.g., running cloud-p messages)
- **Context degradation in single agent**: Without task system, long-running single agents lose quality at ~40% context
- **Team composition matters**: Too many agents without clear roles creates confusion; start with builder+validator minimum

---

## Key Concepts

### Template Meta-Prompt
A prompt that generates another prompt in a specific, highly-vetted, consistent format. Enables reproducible workflows and teaches agents to "build as you would."

### Agentic Layer
The layer of code that builds the application for you. Focus development effort here rather than directly on the application.

### Core Four Framework
The four fundamental levers of agentic coding:
1. **Context** - What information the agent has access to
2. **Model** - Which AI model runs the agent
3. **Prompt** - Instructions and goals for the agent
4. **Tools** - Capabilities the agent can invoke

### Focused Context Windows
Each sub-agent operates with minimal, task-specific context. This prevents context degradation and enables specialization.

---

## Story Suggestions

### Potential Epic: Enhanced Multi-Agent Orchestration

**US-XXXX**: Create builder/validator agent team templates
- AC: Builder agent with PostToolUse validation hooks
- AC: Validator agent with comprehensive checking
- AC: Agents discoverable in `.agileflow/agents/team/`

**US-XXXX**: Build template meta-prompt for team planning
- AC: Meta-prompt generates plans with team orchestration section
- AC: Self-validation hooks ensure plan contains required sections
- AC: Orchestration prompt customizable per workflow

**US-XXXX**: Add task dependency visualization
- AC: Show task dependency graph in `/agileflow:board`
- AC: Highlight blocked tasks and their blockers
- AC: Show completion status per team member

---

## Comparison to AgileFlow

| Feature | Video Approach | AgileFlow Current |
|---------|---------------|-------------------|
| Task Management | TaskCreate/Update/List/Get | status.json + story commands |
| Agent Teams | Builder + Validator pattern | Domain experts (34+) |
| Self-Validation | PostToolUse/Stop hooks | damage-control hooks |
| Orchestration | Template meta-prompts | Command prompts + /babysit |
| Task Dependencies | blocks/blockedBy fields | Epic → Story hierarchy |

**Opportunities for AgileFlow**:
1. Add builder/validator agent pairing for implementation tasks
2. Enhance task dependency tracking in status.json
3. Create template meta-prompts for common workflows
4. Add task-level progress visualization to /board

---

## References

- Source: YouTube video transcript (IndyDevDan)
- Import date: 2026-02-03
- Related research: [20260124-claude-code-task-management-system.md](./20260124-claude-code-task-management-system.md)
- Course reference: Tactical Agentic Coding (TAC)
