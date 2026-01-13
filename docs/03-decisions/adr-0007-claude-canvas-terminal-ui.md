# ADR-0007: Claude Canvas Terminal UI

**Status**: Deferred
**Date**: 2026-01-13
**Decision Makers**: Development Team
**Research**: [20260113-claude-canvas-terminal-ui-extension.md](../10-research/20260113-claude-canvas-terminal-ui-extension.md)

## Context

Claude Canvas is an open-source Claude Code plugin that adds split-pane visual UI to the terminal. Created by David (CEO of Glide Apps), it uses tmux for pane management and Ink (React for terminals) for rendering interactive components.

Key capabilities:
- Email previews with from/to/subject fields
- Flight booking interfaces with seat selection
- Calendar views
- IPC between Claude Code and spawned UI panes

This represents a paradigm shift from text-output coding agents to visually-rich personal assistants.

## Decision

**Defer implementation** of Claude Canvas-style split-pane UI in AgileFlow.

Document the architecture and preserve the research for future consideration when:
1. Claude Code provides native canvas/preview support
2. User demand justifies the development investment
3. Team capacity allows for 3-5 week focused effort

## Rationale

### Why Not Now

1. **Significant architectural shift required**
   - Current AgileFlow: Linear, script-driven outputs
   - Canvas requires: Event-driven, stateful UI with render loop

2. **Dependencies exist but unused**
   - `blessed` and `blessed-contrib` are installed but no code utilizes them
   - Would need to build: Blessed lifecycle, pane manager, event router, IPC system

3. **Competing priorities**
   - Active epics (EP-0012, EP-0014) have immediate user value
   - Canvas is "nice to have" vs. core agentic workflow improvements

4. **Waiting may be strategic**
   - Claude Code team may add native canvas support
   - Community forks (Ghostty, iTerm) are evolving
   - Better to adopt standard than build custom

### What We Have Ready

| Component | Status |
|-----------|--------|
| Color system (`lib/colors.js`) | Production-ready |
| Blessed library | Installed |
| blessed-contrib | Installed |
| node-pty (terminal emulation) | Available |
| Table rendering | Working |
| Session manager | Working |

### What Would Need Building

| Gap | Effort |
|-----|--------|
| Blessed screen lifecycle | High |
| Pane manager (create/resize/focus) | High |
| Event router (keyboard/mouse/file) | Medium |
| IPC system | Medium |
| Content renderers (code/terminal/diff) | Medium |

## Alternatives Considered

### Option A: Full Implementation Now
- **Pros**: Differentiated UX, immediate value
- **Cons**: 3-5 week effort, architectural risk, may be obsoleted by native support
- **Decision**: Rejected

### Option B: Minimal Preview Pane
- **Pros**: Lower effort, incremental value
- **Cons**: Still requires Blessed lifecycle, limited usefulness
- **Decision**: Rejected (still too much overhead for uncertain value)

### Option C: Defer and Document (Selected)
- **Pros**: Zero effort, preserves option, allows Claude Code ecosystem to mature
- **Cons**: No immediate feature gain
- **Decision**: Selected

### Option D: External Tool Integration
- **Pros**: Use Claude Canvas directly instead of building
- **Cons**: Requires team session, adds dependency on external project
- **Decision**: Possible future alternative

## Consequences

### Positive
- Research preserved for future reference
- Dependencies remain available
- Team focuses on higher-priority work
- Can adopt native solution if Claude Code adds canvas support

### Negative
- No visual preview capability in AgileFlow
- Users wanting canvas must use external tools
- May fall behind if competitors adopt similar features

### Neutral
- Architecture decision documented
- Can revisit when conditions change

## Implementation Notes (For Future Reference)

If implementing in the future, recommended approach:

**Phase 1: Foundation**
- Initialize Blessed screen with cleanup handlers
- Single split pane (main + preview)
- Static content display
- Keyboard toggle (Ctrl+P)

**Phase 2: Integration**
- Connect to session manager for process output
- File watcher for live updates
- Story/epic preview rendering

**Phase 3: Full Canvas**
- Multiple pane layouts
- IPC between panes
- Skills system (equivalent to flight/document/calendar)
- tmux alternative support

**New module structure:**
```
packages/cli/tools/canvas/
├── index.js          # Entry point
├── screen.js         # Blessed lifecycle
├── panes.js          # Pane manager
├── events.js         # Event router
├── renderers/        # Content renderers
│   ├── code.js
│   ├── terminal.js
│   └── diff.js
└── ipc.js            # Inter-process communication
```

## References

- Research: [Claude Canvas - Terminal UI Extension](../10-research/20260113-claude-canvas-terminal-ui-extension.md)
- External: Claude Canvas GitHub (open source)
- Related: Ink library, Blessed library, tmux
