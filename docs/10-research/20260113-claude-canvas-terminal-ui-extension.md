# Claude Canvas - Terminal UI Extension

**Import Date**: 2026-01-13
**Topic**: Claude Canvas - Terminal UI Extension
**Source**: YouTube video transcript
**Content Type**: Video transcript

---

## Summary

Claude Canvas is an open-source Claude Code plugin created by David (CEO of Glide Apps) that adds an external display capability to Claude Code. It enables rich UI previews in a split terminal pane, transforming Claude Code from a pure coding assistant into a personal assistant capable of previewing emails, scheduling meetings, and even displaying flight booking interfaces.

The plugin uses tmux to spawn split panes and renders interactive UI using Ink (the same React library used by Claude Code itself). The key innovation is interprocess communication (IPC) between the Claude Code session and the spawned UI pane, allowing bidirectional data flow - users can make selections in the UI that Claude can then act upon.

While currently requiring a team session to run, the project demonstrates the potential for AI terminal agents to evolve beyond code-only interactions into rich, visual experiences that handle personal tasks.

---

## Key Findings

- **Plugin Architecture**: Claude Canvas is installed as a Claude plugin, spawning tmux split panes for UI rendering
- **Ink-based Rendering**: Uses the Ink React library (same as Claude Code's UI) to render interactive components in the terminal
- **Skills System**: Currently supports three skills: flight, document, and calendar - triggered by natural language prompts
- **IPC Communication**: Split pane can communicate back to Claude Code and vice versa using interprocess communication
- **Bun Runtime**: Uses Bun to run TypeScript CLI files that handle the UI logic
- **Terminal Alternatives**: While tmux is the default, forks exist for native Ghostty, iTerm, and Apple Terminal panes
- **MCP Integration Potential**: Can connect to MCP servers (like Gmail) for real data instead of mock data
- **Creator Endorsement**: Received positive response from developers and the Claude Code founder himself
- **Open Source**: Fully open source and available for community contributions

---

## Implementation Approach

1. **Install as Claude Plugin**: Add Claude Canvas to your Claude Code setup (currently requires team session)
2. **Configure tmux**: Ensure tmux is available for split pane functionality
3. **Use Natural Language**: Trigger skills with prompts like "Book me a flight from London to Barcelona and spawn a preview with the canvas plugin"
4. **Connect MCP Servers**: Optionally connect Gmail, Calendar, or other MCP servers for real data integration
5. **Interact with UI**: Use arrow keys, tab, and spacebar to navigate the spawned UI panes

---

## Code Snippets

No code snippets provided in transcript (demo-focused video).

---

## Action Items

- [ ] Explore Claude Canvas GitHub repository for implementation details
- [ ] Investigate tmux/IPC architecture for potential AgileFlow integration
- [ ] Consider adding visual preview capabilities to AgileFlow commands
- [ ] Research Ink library for terminal UI components
- [ ] Evaluate if similar split-pane UI could enhance AgileFlow workflows

---

## Risks & Gotchas

- **Team Session Requirement**: Currently needs to run in a team session (workarounds exist but not detailed)
- **Mock Data**: Flight/calendar data shown is AI-generated, not connected to real APIs without MCP setup
- **Terminal Dependency**: Requires tmux or compatible terminal with split pane support
- **Practical Limitations**: While impressive for demos, may not be practical for complex tasks like flight booking where mistakes are costly

---

## Story Suggestions

### Potential Epic: Split-Pane UI for AgileFlow

**US-XXXX**: Research Ink library integration
- AC: Document how Ink could be used to render AgileFlow previews

**US-XXXX**: Implement tmux split-pane spawning
- AC: Create utility to spawn and manage tmux panes from AgileFlow commands

**US-XXXX**: Add IPC between Claude Code and spawned UI
- AC: Enable bidirectional communication for user selections to flow back to agent

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

Claude is not just being used to write code anymore. People are using it to preview emails, schedule meetings, and even book flights all in the terminal thanks to a tool called Claude Canvas, created by the CEO of Glide Apps to turn Claude Code into his own personal assistant. But how exactly does this work? And is this the future of AI terminal coding agents? It all started when David posted a tweet saying, "What if Claude had an external display?" here, followed by this amazing demo that got an overwhelmingly positive response from developers and even the founder of Claude Code himself. The whole thing is open source and is installed as a Claude plugin. But for now, it needs to be run in a team session. There are ways to get around this which I'll explain later on in the video. From here, we can give it a prompt like write an email from me rich@gmail.com to a friend ben@gmail.com telling them I'm looking forward to meeting them for lunch with a subject of excited for lunch. Preview it using canvas spawn. And once we hit enter, Claude goes to work and it wrote the email but didn't put it in a split pane which happens sometimes. So let's give it another prompt. And now we can see a preview of the email inside Claude with from to and a subject with a perfectly formatted email.

</details>

---

## References

- Source: YouTube video transcript
- Import date: 2026-01-13
- Related: Ink React library, tmux, Claude Code plugins, MCP servers
- **ADR**: [ADR-0007: Claude Canvas Terminal UI](../03-decisions/adr-0007-claude-canvas-terminal-ui.md) - Decision to defer implementation
