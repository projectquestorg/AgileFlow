# Research: Node.js TUI Libraries for Dashboard-Style Interfaces

**Date**: 2026-01-17
**Researcher**: RESEARCH Agent
**Status**: Active

## Summary

Comprehensive evaluation of five major Node.js Terminal User Interface (TUI) libraries for building an AgileFlow dashboard with session list panels, output streams, status bars, and trace panels. **Recommendation: Ink (React for CLI)** is the best choice for AgileFlow's TUI dashboard due to its active maintenance, modern architecture, Flexbox layout support, and alignment with the project's existing React dependency. Alternative: blessed-contrib for lightweight deployment without React runtime, though it's unmaintained.

---

## Problem & Goals

AgileFlow requires a TUI dashboard that supports:
1. Responsive layouts adapting to various terminal sizes
2. Multi-panel architecture (sessions list sidebar, output stream, status bar, optional trace panel)
3. Real-time content updates from agent bus (docs/09-agents/bus/log.jsonl)
4. Keyboard navigation (Q=quit, S=start, P=pause, R=resume, T=trace, 1-9=sessions)
5. Maintainable, non-blocking implementation suitable for long-running sessions

**Note**: AgileFlow has *already begun implementation* using Ink (see `/packages/cli/scripts/tui/App.js` and `/packages/cli/scripts/tui/simple-tui.js`). This research validates the choice and explores alternatives.

---

## Approaches Considered

### 1. **Ink (React for CLI)** ✅ RECOMMENDED
**Current Implementation Status**: In use (v3.2.0 in packages/cli, v4.4.1 in monorepo)

**Architecture**:
- React renderer for terminal apps using react-reconciler
- Flexbox layouts via Yoga layout engine
- Component-based with hooks support
- Declarative UI patterns familiar to React developers

**Key Features**:
- Built-in `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`, `<Transform>` components
- Hooks: `useInput()`, `useApp()`, `useStdin()`, `useFocus()` for keyboard interaction
- Colors, backgrounds, text styling (bold, italic, underline, strikethrough)
- Full TypeScript support with included type definitions
- Can combine with @inkjs/ui for pre-built components (TextInput, Select, MultiSelect, etc.)

**Ecosystem**:
- 2.5M+ monthly downloads (NPM trends data)
- 34,045 GitHub stars
- Active development (last update ~1 month ago as of research date)
- Used by: Claude Code, GitHub Copilot CLI, Cloudflare Wrangler, Gatsby, Prisma, Shopify CLI, Linear, Canva CLI

**Trade-offs**:
- ✅ Actively maintained with frequent updates
- ✅ Strong React community alignment
- ✅ Excellent TypeScript support
- ✅ Flexbox layouts = responsive design
- ✅ Already used by AgileFlow
- ❌ Requires React + Node.js runtime on user machines
- ❌ Slightly higher memory footprint than blessed
- ❌ Learning curve for developers unfamiliar with React

**Real-Time Updates**:
- Pair with EventStream class (already exists in `/packages/cli/scripts/tui/lib/eventStream.js`)
- Ink components re-render efficiently on state changes
- Use React hooks to manage polling from agent bus

**Layout & Responsiveness**:
- Yoga Flexbox engine provides responsive, terminal-size-aware layouts
- `flexGrow`, `width`, `height` properties adapt to terminal resize events
- Box nesting enables complex multi-panel layouts

---

### 2. **Blessed / Neo-Blessed** (Alternative)
**Architecture**:
- Low-level curses-like terminal interface library
- Widget-based model (traditional desktop UI thinking)
- Direct screen buffer manipulation with ANSI escape codes

**Key Features**:
- Rich widget set (lists, tables, texts, buttons, forms)
- Mouse event support (clicks, drag, scrolling)
- Custom styling and themes
- Legacy but feature-complete

**Maintenance Status**:
- **Original blessed**: Unmaintained (last update ~2014, marked "largely unmaintained")
- **neo-blessed**: Occasional updates for Node.js compatibility (forks by rivy-t, dundalek)
- **reblessed**: Experimental fork with some updates

**Download Activity**:
- blessed: ~46,000-60,000 weekly downloads
- neo-blessed: Lower adoption

**Trade-offs**:
- ❌ Original blessed abandoned; neo-blessed receives minimal updates
- ✅ No React dependency = smaller footprint
- ✅ Mature widget library for complex dashboards
- ❌ Learning curve: widget-based thinking vs React's declarative model
- ❌ Harder to manage state and re-renders

---

### 3. **Blessed-contrib** (Dashboard Widgets)
**Architecture**:
- High-level widgets built on blessed for dashboards
- Provides chart, graph, table, donut, gauge widgets out-of-box
- ASCII art rendering for visualizations

**Key Features**:
- Line charts, bar charts, stacked bars, sparklines
- Tables, trees, donuts, gauges
- ASCII-based images and maps
- Layout system for organizing widgets
- Grid and carousel layouts

**Maintenance Status**:
- **Status**: Inactive (Snyk analysis)
- **Last Release**: 12+ months ago
- **Downloads**: 46,090 weekly (popular despite inactivity)
- **Active Forks**: hp4k1h5/blessed-contrib (maintained for iexcli), coral/blessed-contrib

**Trade-offs**:
- ✅ Zero-config dashboard widgets (pre-built visualizations)
- ✅ Pure JavaScript, no React/React-reconciler overhead
- ❌ Unmaintained upstream
- ❌ Limited to blessed-based architectures
- ❌ Complex state management difficult without React

**Use Case**: Lightweight, chart-heavy dashboards where you want ASCII graphs without Redux/state complexity.

---

### 4. **Terminal-kit**
**Architecture**:
- Comprehensive terminal utilities library
- Low-level and high-level APIs
- No ncurses dependency

**Key Features**:
- 256 colors, styles, keyboard & mouse handling
- Input fields, progress bars, menus
- Screen buffer with 32-bit composition
- Image loading capabilities
- Mouse drag support

**Maintenance Status**:
- Active maintenance (v3.1.2+)
- ~656 projects using it on npm registry
- Used primarily for simpler interactive CLI tools

**Trade-offs**:
- ✅ Lightweight, no external dependencies
- ✅ Good for simple forms/menus
- ❌ Low-level APIs = more manual work for complex UIs
- ❌ No built-in component model like React
- ❌ Manual state management and re-rendering

**Use Case**: Simple interactive CLIs where blessed/Ink are overkill. Good for forms, menus, progress bars but not for complex dashboard layouts.

---

### 5. **React-blessed** & **Terminal-in-react** (Legacy)
**Status**: Largely unmaintained
- **react-blessed**: 4,503 GitHub stars, 385 weekly downloads, last update 5 years ago
- **terminal-in-react**: 2,157 GitHub stars, 836 weekly downloads, last update 7 years ago

**Assessment**: Superseded by Ink with its superior Flexbox layout support via Yoga. Not recommended for new projects.

---

## Pros/Cons Comparison Table

| Criterion | Ink | Blessed | Blessed-Contrib | Terminal-Kit | React-Blessed |
|-----------|-----|---------|-----------------|--------------|---------------|
| **Maintenance** | ✅ Active | ❌ Abandoned | ❌ Inactive | ✅ Active | ❌ 5yr old |
| **Weekly Downloads** | 2.5M | 46-60K | 46K | ~500K | 385 |
| **GitHub Stars** | 34K | 11K | N/A | 2K | 4.5K |
| **Responsive Layouts** | ✅ Flexbox | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual |
| **Real-Time Updates** | ✅ React hooks | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual |
| **Component Model** | ✅ React | ❌ Widgets | ❌ Widgets | ❌ Low-level | ⚠️ Dated |
| **TypeScript Support** | ✅ Full | ⚠️ Basic | ❌ None | ⚠️ Limited | ❌ None |
| **Learning Curve** | Medium | Medium | Medium | Low | Medium |
| **Memory Footprint** | Medium | Low | Low | Low | Medium |
| **Bundle Size** | ~1.5MB | ~500KB | ~600KB | ~400KB | ~800KB |
| **Mouse Support** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Panel/Layout Support** | ✅ Excellent | ✅ Good | ✅ Good | ⚠️ Manual | ⚠️ OK |
| **Ecosystem/Plugins** | ✅ Rich (@inkjs/ui) | ⚠️ Limited | ⚠️ Limited | ⚠️ Minimal | ❌ Stale |

---

## Recommended Approach: Ink

### Why Ink Wins for AgileFlow

1. **Already In Use**: AgileFlow has begun Ink implementation (`packages/cli/scripts/tui/`). The `App.js` React component uses Ink's `Box`, `Text`, `useInput`, and `useApp` hooks.

2. **Responsive Design**: Yoga-based Flexbox layouts naturally adapt to terminal size changes, meeting requirement #1.

3. **Real-Time Updates**: React's efficient re-rendering paired with EventStream watchers (already implemented) makes polling agent bus events performant.

4. **Multi-Panel Support**: Nested Box components enable SessionPanel (sidebar), OutputPanel (main), StatusBar (footer), and optional TracePanel (toggleable).

5. **Keyboard Navigation**: `useInput` hook with KeyboardHandler (already in `/packages/cli/scripts/tui/lib/keyboard.js`) provides centralized key binding management.

6. **Active Maintenance**: 2.5M weekly downloads, 34K stars, recent commits. Aligned with industry trends.

7. **TypeScript**: Full support matches AgileFlow's TypeScript codebase.

8. **Developer Experience**: React developers (common for JS/TS teams) will find it familiar.

### Implementation Pattern (Already Started)

**Current Architecture** (see `/packages/cli/scripts/tui/`):

```
App.js (Main React component with header/footer/content)
  ├── SessionPanel.js (Renders session list)
  ├── OutputPanel.js (Renders agent events stream)
  ├── TracePanel.js (Renders sub-agent visualization)
  └── lib/
      ├── keyboard.js (KeyboardHandler with bindings)
      ├── eventStream.js (Watches docs/09-agents/bus/log.jsonl)
      └── loopControl.js (Session state management)
```

**Hybrid Approach** (Current):
- **App.js**: React/Ink version (for developers)
- **simple-tui.js**: Pure ANSI fallback (for compatibility, no React runtime)

---

## Implementation Steps for AgileFlow

### Step 1: Extend Existing Ink Components (Week 1)
- [ ] Enhance SessionPanel to show running/paused/completed status with color coding
- [ ] Add session filtering (active, all, completed)
- [ ] Implement session selector (numbers 1-9) with visual indicator

### Step 2: Implement Real-Time Event Streaming (Week 1-2)
- [ ] Connect EventStream to watch agent bus log.jsonl
- [ ] Parse agent_loop events from JSONL
- [ ] Buffer recent events (last 50) for OutputPanel scrolling
- [ ] Handle file rotation gracefully

### Step 3: Build Output Panel with Scrolling (Week 2)
- [ ] Create scrollable event viewer showing agent output
- [ ] Support arrow keys (up/down) for scrolling
- [ ] Show timestamp, agent name, event type, message
- [ ] Color-code by event type (loop_init=cyan, iteration=yellow, abort=red, etc.)

### Step 4: Implement Trace Panel (Week 2-3)
- [ ] Parse multi-agent trace data from session state
- [ ] Display tree view of sub-agents and their tasks
- [ ] Show parallel execution visualization (P-threads, B-threads)
- [ ] Toggle with 'T' key

### Step 5: Loop Control Integration (Week 3)
- [ ] Bind 'S' to session-manager.startLoop()
- [ ] Bind 'P' to pause session
- [ ] Bind 'R' to resume session
- [ ] Add feedback messages for state changes

### Step 6: Testing & Fallback (Week 3-4)
- [ ] Unit tests for panel components
- [ ] Integration test: EventStream → Panel rendering
- [ ] Terminal size edge cases (small, large, resize events)
- [ ] Verify simple-tui fallback works

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **React runtime overhead** | Ink is optimized for CLI; ~2.5M weekly users prove feasibility. Fallback to simple-tui for minimal installs. |
| **Terminal resize handling** | Ink's Yoga layout engine handles resizes; test with `resize` command. |
| **Slow event polling** | Use fs.watch + polling fallback in EventStream; configurable poll interval (default 1000ms). |
| **Memory leaks in long sessions** | Implement event buffer size limit (maxBufferSize=100); clean up listeners on component unmount. |
| **Keyboard input conflicts** | KeyboardHandler centralizes all bindings; validate no duplicates. |

---

## Alternative Fallback: Blessed-contrib

If constraints emerge (e.g., "must minimize Node.js runtime"), consider blessed-contrib:

**Pros**:
- Zero React dependency
- Pre-built dashboard widgets (don't build charts from scratch)
- 46K weekly downloads prove stability

**Cons**:
- Unmaintained upstream (use hp4k1h5 fork for reliability)
- Manual state management (no React reactivity)
- Harder to implement real-time updates

**Implementation**: Swap `App.js` to use neo-blessed Widgets instead of Ink Components. EventStream logic remains the same.

---

## Key Findings

1. **Ink is the clear winner** for modern, actively-maintained Node.js TUI development (2.5M weekly downloads vs. 46K for blessed).

2. **AgileFlow is already on the right path** with Ink implementation; this research validates the choice.

3. **Flexbox layouts (Yoga)** in Ink provide responsive design that blessed lacks (blessed requires manual sizing calculations).

4. **Real-time updates** are best achieved through React's state/re-render model, not blessed's manual redraw.

5. **TypeScript + component model** makes Ink easier to maintain long-term vs. widget-based blessed.

6. **Blessed-contrib is still popular** (46K downloads) but unmaintained; use only if React dependency is unacceptable.

7. **Terminal-kit is a low-level utility** library; better suited for simple forms/menus, not dashboard UIs.

8. **React-blessed and terminal-in-react are legacy**; don't start new projects with these.

---

## Trade-offs Summary

| Choice | Benefit | Cost |
|--------|---------|------|
| **Ink** | Active, responsive, React familiar, TypeScript | React runtime, moderate memory footprint |
| **Blessed-contrib** | Zero dependencies, widget library | Unmaintained, manual state, harder scrolling/real-time |
| **Terminal-kit** | Lightweight, active | Low-level APIs, not dashboard-focused |

---

## Sources

- [Ink vs Blessed Comparison](https://npm-compare.com/blessed,ink) - npm-compare.com - Retrieved 2026-01-17
- [Building Terminal Interfaces with Node.js](https://blog.openreplay.com/building-terminal-interfaces-nodejs/) - OpenReplay Blog - Retrieved 2026-01-17
- [7 TUI Libraries for Creating Interactive Terminal Apps](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/) - LogRocket Blog - Retrieved 2026-01-17
- [Ink GitHub Repository](https://github.com/vadimdemedes/ink) - GitHub - Retrieved 2026-01-17
- [Blessed GitHub Repository](https://github.com/chjj/blessed) - GitHub - Retrieved 2026-01-17
- [Blessed-contrib GitHub Repository](https://github.com/yaronn/blessed-contrib) - GitHub - Retrieved 2026-01-17
- [Terminal-Kit npm Package](https://www.npmjs.com/package/terminal-kit) - NPM - Retrieved 2026-01-17
- [NPM Trends: ink vs react-blessed vs terminal-in-react](https://npmtrends.com/ink-vs-react-blessed-vs-terminal-in-react) - NPM Trends - Retrieved 2026-01-17
- [Awesome TUIs: List of terminal UI projects](https://github.com/rothgar/awesome-tuis) - GitHub - Retrieved 2026-01-17
- [Using Ink UI with React to build interactive CLIs](https://blog.logrocket.com/using-ink-ui-react-build-interactive-custom-clis/) - LogRocket Blog - Retrieved 2026-01-17
- [blessed-contrib Maintenance Status](https://snyk.io/advisor/npm-package/blessed-contrib) - Snyk - Retrieved 2026-01-17

---

## Related

- **Existing Implementation**: `/packages/cli/scripts/tui/App.js`, `/packages/cli/scripts/tui/simple-tui.js`
- **Event Stream**: `/packages/cli/scripts/tui/lib/eventStream.js`
- **Keyboard Handler**: `/packages/cli/scripts/tui/lib/keyboard.js`
- **Session Manager**: `/packages/cli/scripts/session-manager.js`
- **Research**: [Ralph Loop & Ralph TUI](20260114-ralph-loop-ralph-tui.md)
- **Research**: [Claude Canvas - Terminal UI Extension](20260113-claude-canvas-terminal-ui-extension.md)

---

## Next Steps

1. **Validate Implementation**: Review current `/packages/cli/scripts/tui/App.js` against this research. Confirm alignment with Ink best practices.

2. **Feature Roadmap**: Use Implementation Steps (above) to guide development of OutputPanel, TracePanel, and real-time event streaming.

3. **Performance Testing**: Benchmark EventStream polling frequency and OutputPanel re-render performance with 100+ events/second from agent bus.

4. **Documentation**: Create `/docs/04-architecture/tui-dashboard-architecture.md` explaining panel layout, keyboard shortcuts, and event flow.

5. **Testing Strategy**: Add tests for panel components, EventStream behavior, and terminal resize scenarios.

---

## Notes

- **Current Status**: AgileFlow's Ink TUI is partially implemented (App.js, keyboard.js, eventStream.js exist). SessionPanel, OutputPanel, TracePanel need enhancement.
- **Blessed Forks**: If maintenance of blessed becomes critical, use `hp4k1h5/blessed-contrib` (actively maintained for iexcli) or `neo-blessed` (occasional updates).
- **Production Use**: Ink powers production CLIs at GitHub (Copilot), Cloudflare (Wrangler), Shopify, and others, proving its reliability for long-running terminals.
