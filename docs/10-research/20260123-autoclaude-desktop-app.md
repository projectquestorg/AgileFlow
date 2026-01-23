# AutoClaude Desktop App

**Import Date**: 2026-01-23
**Topic**: AutoClaude Desktop App
**Source**: YouTube video transcript (Eric's tutorial)
**Content Type**: Video transcript

---

## Summary

AutoClaude is a desktop GUI application that provides a visual interface for Claude Code, replacing terminal-based interactions with a Kanban board workflow. The application enables spec-driven development with automatic planning, implementation, and QA phases. It supports running up to 12 parallel Claude sessions simultaneously, each working on different tasks with their own feature branches.

The tool emphasizes visual task management with columns for different development statuses (planning, in progress, AI review, etc.). It includes several advanced features beyond basic Kanban: a roadmap feature for competitor analysis and feature ideation, an insights panel for codebase Q&A during task execution, MCP server management, and visual git worktree/branch management.

The demo showcased redesigning a "match transaction page" in a bookkeeper app - AutoClaude autonomously planned the UI restructure, implemented the changes, and produced a more condensed, user-friendly interface with improved navigation elements.

---

## Key Findings

- **Visual Kanban Board**: Replaces terminal CLI with drag-and-drop task management across status columns (planning, in progress, AI review, human review, completed)

- **Spec-Driven Development**: Automatic three-phase workflow: Planning -> Implementation -> QA, with optional human review gates between phases

- **Parallel Agent Execution**: Up to 12 Claude sessions can run simultaneously, each on separate feature branches, visible in a grid terminal view

- **Model Configuration Per Phase**: Different AI models and thinking levels can be configured for spec, planning, and coding phases to optimize cost vs quality

- **Roadmap Feature**: AI-powered competitor analysis that scans app stores and forums to suggest must-have vs nice-to-have features, groupable into implementation phases

- **Ideation Generator**: Generates feature ideas across categories (UX/UI, documentation, security, performance) that can be converted directly into Kanban tasks

- **Insights Panel**: ChatGPT-like interface for asking questions about your codebase while other tasks are running (architecture questions, code quality suggestions)

- **MCP Server Management**: Visual interface for adding/managing MCP servers (shown: Context7, Graphite Memory), with easy custom server addition

- **Git Worktree Visualization**: Visual branch management showing all worktrees, with UI for creating PRs and deleting branches

- **Automatic Branch Creation**: Each task automatically creates a feature branch, isolating changes from main

---

## Implementation Approach

1. **Installation**
   - Download stable version from AutoClaude repository for your OS (Mac/Windows/Linux)
   - Install and launch the desktop application

2. **Project Setup**
   - Click "+" to open existing project or create new
   - Projects appear as Kanban boards with configurable status columns

3. **Task Creation**
   - Click "+" in planning column
   - Add title, description, and optional screenshot/attachments
   - Configure agent profile (complexity level affects model selection)
   - Optionally customize model per phase (spec/planning/coding)
   - Toggle "require human review before coding" if needed

4. **Task Execution**
   - Click "Start" to begin autonomous execution
   - Monitor progress via logs panel with colored output
   - Task moves through columns automatically
   - Feature branch created automatically

5. **Review & Iteration**
   - Review completed tasks in human review column
   - Request additional changes via task dialog
   - Create PR directly from task interface
   - Check conflicts with main branch

---

## Notable Features Demonstrated

### Task Configuration Options
- **Complex task**: Uses Opus 4.5 with ultra thinking
- **Balanced task**: Uses Sonnet 4.5 for cost optimization
- **Per-phase model selection**: Different models for spec vs coding

### Roadmap Analysis Output
- **Must-have features**: API rate limiting, duplicate detection for receipts/transactions
- **Nice-to-have**: Smart category learning, enhanced matching algorithm, cloud storage imports (Google Drive, Dropbox, S3)

### UI Ideation Examples
- Undo toast alert for destructive actions (5-second reversal window)
- Breadcrumb navigation
- Tooltips for icons

---

## Action Items

- [ ] Evaluate AutoClaude for AgileFlow's visual dashboard aspirations
- [ ] Compare AutoClaude's Kanban approach with AgileFlow's status.json tracking
- [ ] Research AutoClaude's MCP integration approach for potential adoption
- [ ] Investigate parallel session architecture (up to 12 agents)
- [ ] Consider roadmap/ideation features for AgileFlow enhancement

---

## Risks & Gotchas

- **Resource Usage**: Running 12 parallel Claude sessions could be expensive and resource-intensive
- **Complexity**: Adding GUI layer adds complexity vs terminal simplicity
- **Learning Curve**: Team needs to learn new interface vs familiar CLI
- **Integration**: May not integrate well with existing terminal-based workflows
- **Cost**: No pricing mentioned - unclear if free or paid tool

---

## Comparison to AgileFlow

| Feature | AutoClaude | AgileFlow |
|---------|------------|-----------|
| Interface | Desktop GUI | CLI + status.json |
| Parallel Sessions | Up to 12 visual | Session commands + worktrees |
| Kanban | Built-in visual | `/agileflow:board` ASCII |
| Competitor Analysis | Built-in roadmap | Manual research commands |
| Ideation | Built-in generator | `/agileflow:ideate` command |
| MCP Management | Visual panel | Manual mcp.json config |
| Git Integration | Visual worktree viewer | Session worktree commands |

---

## Story Suggestions

### Potential Epic: Visual Dashboard for AgileFlow

**US-XXXX**: Create web-based Kanban board view
- AC: Stories display in status columns
- AC: Drag-and-drop status changes
- AC: Real-time updates from status.json

**US-XXXX**: Add parallel session visualization
- AC: Show active sessions in grid layout
- AC: Display session logs with colors
- AC: Support up to 4 concurrent views

**US-XXXX**: Implement roadmap/ideation panel
- AC: Generate feature ideas by category
- AC: Convert ideas to stories with one click

---

## References

- Source: YouTube video transcript (Eric's channel)
- Import date: 2026-01-23
- Related: [20260106-autoclaude-framework.md](./20260106-autoclaude-framework.md) (earlier AutoClaude research)
