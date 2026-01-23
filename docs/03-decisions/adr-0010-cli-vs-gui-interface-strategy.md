# ADR-0010: CLI vs GUI Interface Strategy

**Status**: Accepted
**Date**: 2026-01-23
**Decision Makers**: Development Team
**Research**: [AutoClaude Desktop App](../10-research/20260123-autoclaude-desktop-app.md)

---

## Context

AutoClaude is a desktop GUI application that provides a visual interface for Claude Code, featuring:
- Visual Kanban board with drag-and-drop task management
- Spec-driven development workflow (Plan -> Implement -> QA)
- Up to 12 parallel Claude sessions with visual monitoring
- Built-in competitor analysis and roadmap generation
- Ideation generator for feature suggestions
- Visual MCP server management
- Git worktree visualization

AgileFlow currently provides CLI-based alternatives to most of these features. This ADR documents our strategic position on interface approach.

### Feature Comparison

| Feature | AutoClaude | AgileFlow | Gap Analysis |
|---------|------------|-----------|--------------|
| Kanban Board | Desktop GUI drag-drop | ASCII `/agileflow:board` + TUI | Visual only |
| Spec-Driven Development | Plan -> Implement -> QA | Ralph Loop + `/agileflow:babysit` | Equivalent |
| Parallel Sessions | 12 max, visual grid | Unlimited git worktrees | Superior |
| Competitor Analysis | Built-in roadmap scanner | Manual `/agileflow:research:*` | Automated gap |
| Ideation Generator | Category-based suggestions | `/agileflow:ideate` multi-expert | Equivalent |
| Insights Panel | Codebase Q&A sidebar | Native Claude Code conversation | Equivalent |
| MCP Management | Visual add/remove panel | Manual `.mcp.json` editing | Visual gap |
| Git Worktree Viewer | Visual branch management | `/agileflow:session:status` CLI | Visual only |

**Key Finding**: AgileFlow has ~80% feature parity with AutoClaude, implemented as CLI/TUI rather than desktop GUI.

---

## Decision

**Remain CLI-first with TUI enhancement path. Do not build a desktop GUI application.**

### Rationale

1. **Target Audience Alignment**: AgileFlow targets developers who prefer terminal-native workflows. These users value scriptability, keyboard shortcuts, and integration with existing terminal tooling over visual interfaces.

2. **Feature Parity Already Achieved**: The core value proposition of AutoClaude (spec-driven development, parallel sessions, ideation) is already available in AgileFlow through CLI commands.

3. **Maintenance Burden**: Desktop applications require cross-platform builds, native dependency management, and significantly more maintenance than CLI tools. This diverts resources from core functionality.

4. **Market Positioning**: AutoClaude already serves users who prefer visual interfaces. Competing directly would be redundant. Instead, AgileFlow should differentiate by excelling in the CLI space.

5. **Composability**: CLI tools integrate better with scripting, CI/CD pipelines, and automation workflows - key use cases for our target audience.

---

## Options Considered

### Option A: Enhance Existing TUI (Selected for Future)

Extend `packages/cli/scripts/tui/` with more interactive features using blessed-contrib.

- **Effort**: LOW (3-5 days)
- **Files**: `tui/Dashboard.js`, `tui/SessionPanel.js`, `tui/lib/dataWatcher.js`
- **Benefit**: Incremental improvement, no new dependencies
- **Status**: Selected for future enhancement

### Option B: Add Web Dashboard (Deferred)

Create `apps/dashboard/` as a Next.js application reading status.json.

- **Effort**: MEDIUM (2-3 weeks)
- **Components**: Real-time SSE, drag-drop kanban, session streaming
- **Benefit**: Full visual experience, shareable URL for team visibility
- **Status**: Deferred - consider if user demand warrants

### Option C: Add Automated Competitor Analysis (Recommended Next)

Create `/agileflow:roadmap:analyze` command that automates the research workflow.

- **Effort**: LOW (1-2 days)
- **Files**: `packages/cli/src/core/commands/roadmap/analyze.md`
- **Benefit**: Fills the biggest functional gap vs AutoClaude
- **Status**: Recommended as next enhancement

### Option D: Full Desktop App (Rejected)

Build an Electron desktop application wrapping AgileFlow.

- **Effort**: HIGH (1-2 months)
- **Components**: Cross-platform builds, native file access, system tray
- **Benefit**: Complete parity with AutoClaude
- **Status**: Rejected - AutoClaude already serves this niche

---

## Consequences

### Benefits

1. **Lean, Focused Tooling**: Avoids scope creep into GUI development
2. **Lower Maintenance Burden**: No cross-platform native builds to maintain
3. **Clear Market Differentiation**: CLI-first vs AutoClaude's GUI-first approach
4. **Developer Workflow Integration**: CLI tools compose better with scripts and automation
5. **Resource Efficiency**: Development effort focused on core functionality

### Trade-offs

1. **GUI Users Served Elsewhere**: Users preferring visual interfaces should consider AutoClaude
2. **No Drag-Drop Kanban**: Status updates remain CLI-based
3. **Manual MCP Configuration**: No visual server management interface
4. **Learning Curve**: New users must learn CLI commands vs visual discovery

### Mitigations

- Improve `/agileflow:help` and documentation for discoverability
- Enhance TUI with more visual feedback within terminal
- Consider lightweight web status viewer if demand grows

---

## Future Considerations

### Short-term (Recommended)

1. **Add `/agileflow:roadmap:analyze`**: Automate competitor analysis to close the biggest feature gap
2. **Enhance TUI interactivity**: Add keyboard-driven kanban navigation in blessed panels

### Medium-term (If Demand Warrants)

3. **Web status viewer**: Read-only dashboard for team visibility without full web app
4. **MCP configuration wizard**: Interactive CLI for server setup

### Long-term (Evaluate Later)

5. **Web dashboard**: Full-featured if significant user demand emerges
6. **Plugin architecture**: Allow community GUI extensions

---

## Related Documents

- [AutoClaude Desktop App Research](../10-research/20260123-autoclaude-desktop-app.md) - Full analysis of AutoClaude features
- [Earlier AutoClaude Framework Research](../10-research/20260106-autoclaude-framework.md) - Initial AutoClaude documentation
- [ADR-0007: Claude Canvas Terminal UI](./adr-0007-claude-canvas-terminal-ui.md) - Related TUI decision
