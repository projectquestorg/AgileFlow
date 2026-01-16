# Ralph Loop & Ralph TUI

**Import Date**: 2026-01-14
**Topic**: Ralph Loop & Ralph TUI - Autonomous AI Coding with Terminal Interface
**Source**: YouTube video transcript (direct import)
**Content Type**: transcript

---

## Summary

Ralph Loop is a framework that forces Claude Code (and other agents) into continuous autonomous development, iteratively improving a project until completion. Named after the Simpsons character Ralph Wiggum (persistently clueless yet relentlessly continuing), it embodies an AI coding loop that stubbornly iterates, failing repeatedly but never giving up until success.

Ralph TUI adds a Terminal User Interface on top of Ralph Loop, providing real-time visibility into the autonomous process. It features a split-panel interface: task list with live status updates on one side, live agent output stream on the other. Key capabilities include keyboard controls (pause, resume, quit, inspect history), session persistence for crash recovery, and support for both Claude Code and OpenCode agents.

The framework addresses Ralph Loop's main limitation: lack of task orchestration for multiple AI agents. Ralph TUI provides the visibility, coordination, and control needed as complexity grows, making it ideal for prototyping and refactoring workflows.

---

## Key Findings

- **Autonomous Development**: Ralph Loop enables continuous iteration where the AI keeps working until completion, with built-in safeguards against infinite loops and excessive API usage
- **Session Persistence**: Long-running autonomous workflows can survive crashes and resume without losing state
- **Multi-Agent Orchestration**: Ralph TUI can deploy multiple sub-agents simultaneously to work on different tasks in parallel
- **PRD-Driven Development**: The system uses Product Requirement Documents (PRD) to define what to build, with an AI-assisted PRD creation wizard
- **JSON Task Tracking**: Tasks are tracked in a local PRD JSON file (alternative trackers available)
- **Real-World Results**: Demo showed a "second brain" visual graph-based thought mapping app built in ~1 hour 45 minutes, fully functional with testing and debugging
- **Safeguards**: Configurable max iterations per run prevents excessive API token usage (example: 35 iterations)
- **Tracing & Visibility**: Press 'T' to visualize all sub-agents and their live actions in a side panel

---

## Implementation Approach

1. **Install via Bun**:
   ```bash
   bun install ralph-tui
   ```

2. **Setup in Project**:
   ```bash
   cd your-project
   ralph-tui setup
   ```

3. **Configure via Setup Wizard**:
   - Choose issue tracker: JSON file tracker (local PRD.json), or alternatives
   - Choose AI agent: Claude Code or OpenCode
   - Set max iterations per run (e.g., 35 for safeguards)
   - Enable auto-complete for task completion

4. **Create PRD**:
   - Run "create PRD for your feature" command
   - Answer AI's questions about the feature (be as descriptive as possible)
   - Review generated PRD components

5. **Generate Task List**:
   - Create task list from PRD (JSON format)
   - Review priorities and configure as needed

6. **Start Autonomous Loop**:
   - Press 'S' to start deploying sub-agents
   - Press 'T' for trace/visualization panel
   - Press pause to inspect current state
   - Multiple tasks can run in parallel

---

## Code Snippets

### Installation
```bash
# Install ralph-tui globally via bun
bun install ralph-tui

# Navigate to project and setup
cd your-project
ralph-tui setup
```

### TUI Keyboard Controls
```
S - Start task / Deploy sub-agents
T - Toggle trace panel (visualize all agents)
P - Pause the loop
Q - Quit
```

---

## Action Items

- [ ] Investigate Ralph TUI for AgileFlow autonomous workflows
- [ ] Compare Ralph TUI task tracking with AgileFlow's status.json system
- [ ] Evaluate PRD-driven development pattern for epic planning
- [ ] Consider TUI visualization for AgileFlow's multi-session system
- [ ] Test session persistence mechanism for long-running tasks

---

## Risks & Gotchas

- **API Token Consumption**: Without max iteration limits, autonomous loops can burn through significant API credits (demo took ~1h45m for one app)
- **Bun Dependency**: Requires Bun runtime (not npm/yarn)
- **MVP Scope Selection**: Choosing detailed scope (8-12 weeks) vs quick output significantly affects token usage
- **Sponsored Content**: Video includes Cubic sponsorship segment (AI code review tool)

---

## Story Suggestions

### Potential Epic: TUI Visualization for AgileFlow Sessions

**US-XXXX**: Add real-time task visualization panel
- AC: Users can see all running sessions and their current tasks
- AC: Status updates appear live without manual refresh

**US-XXXX**: Implement keyboard controls for session management
- AC: Single-key shortcuts for pause/resume/quit operations
- AC: Works within existing terminal session

**US-XXXX**: Add session persistence for crash recovery
- AC: Long-running sessions survive process termination
- AC: State is automatically restored on restart

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] We recently saw a framework emerge that forces cloud code as well as other agents into continuous autonomous development where a project is iteratively improved until true completion. It includes built-in safeguards to prevent infinite loops as well as excessive API usage. And this famous framework that I'm talking about is Ralph Loop...

[00:02:01] Ralph Tui enables session persistence, meaning long running tasks with autonomous workflows can survive crashes and resumes without losing state. RAT toy works with cloud code as well as open code, giving you a lot of flexibility...

</details>

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-14
- Related: [20260109-ralph-wiggum-autonomous-ai-loops.md](./20260109-ralph-wiggum-autonomous-ai-loops.md) - Previous Ralph Loop research
- Related: [20260101-claude-code-stop-hooks-ralph-loop.md](./20260101-claude-code-stop-hooks-ralph-loop.md) - Stop hooks pattern
