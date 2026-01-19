# Node.js TUI Dashboard with blessed Library

**Import Date**: 2026-01-17
**Topic**: Node.js TUI Dashboard with blessed library
**Source**: ChatGPT/Claude research
**Content Type**: research

---

## Summary

This research covers building a professional, full-screen terminal user interface (TUI) dashboard for Node.js applications using the **blessed** and **blessed-contrib** libraries. The key requirements are: fixed screen without scrolling (like htop/lazygit), tabbed interface, live updating panels, and user-friendly design.

The recommended approach uses `@terminal-junkies/neo-blessed` (actively maintained fork of blessed) with `blessed-contrib` for widgets. The critical technique for flicker-free rendering is **smartCSR** (smart cursor save/restore) which enables differential rendering - only updating changed cells rather than redrawing the entire screen.

---

## Key Findings

- **Library Choice**: Use `blessed` (specifically `@terminal-junkies/neo-blessed` fork) with `blessed-contrib` for grid layouts and widgets
- **Flicker-Free Rendering**: Enable `smartCSR: true` in screen options for differential rendering
- **Double Buffering**: blessed uses internal double buffering - writes to buffer first, then flushes only differences
- **Synchronized Output**: Terminal escape sequence `\x1b[?2026h` enables synchronized updates (batch screen updates atomically)
- **CommonJS Compatible**: blessed works with `require()`, unlike Ink 4.x which is ESM-only
- **No React Required**: blessed is pure Node.js - avoids React version conflicts in monorepos
- **Grid Layout**: blessed-contrib provides 12x12 grid system for responsive panel placement
- **UX Best Practices**: Always-visible key hints (nano-style), semantic colors, clear focus indication

---

## Implementation Approach

1. **Install dependencies**: `@terminal-junkies/neo-blessed`, `blessed-contrib`, `chokidar`
2. **Create screen** with `smartCSR: true` and `fullUnicode: true`
3. **Use grid layout** (12x12) for responsive panel placement
4. **Build tab bar** at top with number key switching (1-3)
5. **Create panels**: Sessions list, Output log, Trace panel
6. **Add status bar** at bottom with always-visible key hints
7. **Implement help overlay** toggled with `?` key
8. **Set up file watchers** for live data updates (chokidar)
9. **Use semantic colors**: green=success, yellow=warning, red=error, cyan=info

---

## Code Snippets

### Main Entry Point (src/index.js)

```javascript
#!/usr/bin/env node
'use strict';

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const createScreen = require('./ui/screen');
const createTabBar = require('./ui/tabbar');
const createStatusBar = require('./ui/statusbar');
const createHelpOverlay = require('./ui/help');
const createSessionsPanel = require('./panels/sessions');
const createOutputPanel = require('./panels/output');
const createTracePanel = require('./panels/trace');
const DataWatcher = require('./data/watcher');

class AgileFlowTUI {
  constructor() {
    this.state = {
      activeTab: 0,
      tabs: ['Sessions', 'Output', 'Trace'],
      sessions: [],
      logs: [],
      traces: [],
      showHelp: false
    };
    this.components = {};
    this.watcher = null;
  }

  init() {
    // Create screen with flicker-free rendering
    this.screen = createScreen();

    // Create 12x12 grid for layout
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    // Create UI components
    this.components.tabBar = createTabBar(this.screen, this.state);
    this.components.sessions = createSessionsPanel(this.grid, this.state);
    this.components.output = createOutputPanel(this.grid, this.state);
    this.components.trace = createTracePanel(this.grid, this.state);
    this.components.statusBar = createStatusBar(this.screen, this.state);
    this.components.help = createHelpOverlay(this.screen, this.state);

    // Set up keybindings
    this.setupKeys();

    // Start data watcher
    this.watcher = new DataWatcher(this.state, () => this.refresh());
    this.watcher.start();

    // Initial render
    this.switchTab(0);
    this.screen.render();
  }

  setupKeys() {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Tab switching with number keys
    this.screen.key(['1', '2', '3'], (ch) => {
      this.switchTab(parseInt(ch) - 1);
    });

    // Tab switching with Tab key
    this.screen.key(['tab'], () => {
      this.switchTab((this.state.activeTab + 1) % this.state.tabs.length);
    });

    // Help overlay
    this.screen.key(['?', 'h'], () => {
      this.state.showHelp = !this.state.showHelp;
      this.components.help.toggle();
      this.screen.render();
    });

    // Refresh
    this.screen.key(['r'], () => {
      this.refresh();
    });
  }

  switchTab(index) {
    this.state.activeTab = index;

    // Hide all panels
    this.components.sessions.hide();
    this.components.output.hide();
    this.components.trace.hide();

    // Show active panel
    switch (index) {
      case 0:
        this.components.sessions.show();
        this.components.sessions.focus();
        break;
      case 1:
        this.components.output.show();
        this.components.output.focus();
        break;
      case 2:
        this.components.trace.show();
        this.components.trace.focus();
        break;
    }

    // Update tab bar
    this.components.tabBar.setTab(index);
    this.screen.render();
  }

  refresh() {
    this.components.sessions.setData(this.state.sessions);
    this.components.output.setData(this.state.logs);
    this.components.trace.setData(this.state.traces);
    this.screen.render();
  }

  cleanup() {
    if (this.watcher) {
      this.watcher.stop();
    }
  }

  run() {
    this.init();
  }
}

// Run if executed directly
if (require.main === module) {
  const tui = new AgileFlowTUI();
  tui.run();
}

module.exports = AgileFlowTUI;
```

### Screen Setup with Flicker-Free Rendering (src/ui/screen.js)

```javascript
'use strict';

const blessed = require('blessed');

module.exports = function createScreen() {
  const screen = blessed.screen({
    smartCSR: true,      // Enable differential rendering (key for flicker-free)
    fullUnicode: true,   // Support Unicode characters
    title: 'AgileFlow TUI',
    cursor: {
      artificial: true,
      blink: true,
      shape: 'line'
    },
    debug: false,
    warnings: false
  });

  // Enable synchronized output mode for atomic updates
  // This batches all screen updates and flushes them at once
  process.stdout.write('\x1b[?2026h');

  // Disable synchronized output on exit
  process.on('exit', () => {
    process.stdout.write('\x1b[?2026l');
  });

  return screen;
};
```

### Tab Bar Component (src/ui/tabbar.js)

```javascript
'use strict';

const blessed = require('blessed');

module.exports = function createTabBar(screen, state) {
  const tabBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    style: {
      bg: 'black'
    }
  });

  const tabs = state.tabs.map((name, i) => {
    return blessed.box({
      parent: tabBar,
      top: 1,
      left: 2 + i * 15,
      width: 13,
      height: 1,
      content: `{bold}${i + 1}{/bold} ${name}`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    });
  });

  return {
    element: tabBar,
    setTab(index) {
      tabs.forEach((tab, i) => {
        if (i === index) {
          tab.style.fg = 'black';
          tab.style.bg = 'cyan';
        } else {
          tab.style.fg = 'white';
          tab.style.bg = 'black';
        }
      });
    }
  };
};
```

### Status Bar with Key Hints (src/ui/statusbar.js)

```javascript
'use strict';

const blessed = require('blessed');

module.exports = function createStatusBar(screen, state) {
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  // Always-visible key hints (nano-style)
  const hints = [
    '{bold}1-3{/bold}:Tabs',
    '{bold}Tab{/bold}:Next',
    '{bold}↑↓{/bold}:Navigate',
    '{bold}Enter{/bold}:Select',
    '{bold}r{/bold}:Refresh',
    '{bold}?{/bold}:Help',
    '{bold}q{/bold}:Quit'
  ];

  statusBar.setContent(' ' + hints.join('  '));

  return {
    element: statusBar,
    setStatus(text) {
      statusBar.setContent(' ' + text + '  |  ' + hints.slice(4).join('  '));
    }
  };
};
```

### Sessions Panel (src/panels/sessions.js)

```javascript
'use strict';

const contrib = require('blessed-contrib');

module.exports = function createSessionsPanel(grid, state) {
  const table = grid.set(1, 0, 10, 12, contrib.table, {
    keys: true,
    vi: true,
    fg: 'white',
    selectedFg: 'black',
    selectedBg: 'cyan',
    interactive: true,
    label: ' Sessions ',
    border: { type: 'line', fg: 'cyan' },
    columnSpacing: 2,
    columnWidth: [10, 30, 15, 15, 10]
  });

  table.setData({
    headers: ['ID', 'Story', 'Status', 'Duration', 'Progress'],
    data: []
  });

  return {
    element: table,
    show() { table.show(); },
    hide() { table.hide(); },
    focus() { table.focus(); },
    setData(sessions) {
      const data = sessions.map(s => [
        s.id,
        s.story || 'No story',
        s.status,
        s.duration || '--',
        s.progress || '0%'
      ]);
      table.setData({
        headers: ['ID', 'Story', 'Status', 'Duration', 'Progress'],
        data: data.length ? data : [['--', 'No active sessions', '--', '--', '--']]
      });
    }
  };
};
```

### Output Panel (src/panels/output.js)

```javascript
'use strict';

const contrib = require('blessed-contrib');

module.exports = function createOutputPanel(grid, state) {
  const log = grid.set(1, 0, 10, 12, contrib.log, {
    fg: 'green',
    selectedFg: 'green',
    label: ' Output ',
    border: { type: 'line', fg: 'cyan' },
    tags: true,
    scrollbar: {
      ch: ' ',
      track: { bg: 'black' },
      style: { inverse: true }
    }
  });

  return {
    element: log,
    show() { log.show(); },
    hide() { log.hide(); },
    focus() { log.focus(); },
    setData(logs) {
      log.setItems([]);
      logs.forEach(entry => {
        const timestamp = entry.timestamp ? `{gray-fg}${entry.timestamp}{/}` : '';
        const level = entry.level || 'info';
        const color = level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'green';
        const message = entry.message || JSON.stringify(entry);
        log.log(`${timestamp} {${color}-fg}${message}{/}`);
      });
    },
    addLine(text) {
      log.log(text);
    }
  };
};
```

### Trace Panel (src/panels/trace.js)

```javascript
'use strict';

const contrib = require('blessed-contrib');

module.exports = function createTracePanel(grid, state) {
  const tree = grid.set(1, 0, 10, 12, contrib.tree, {
    fg: 'white',
    label: ' Trace ',
    border: { type: 'line', fg: 'cyan' },
    template: {
      lines: true
    },
    style: {
      selected: { bg: 'cyan', fg: 'black' }
    }
  });

  tree.setData({
    extended: true,
    children: {}
  });

  return {
    element: tree,
    show() { tree.show(); },
    hide() { tree.hide(); },
    focus() { tree.focus(); },
    setData(traces) {
      const children = {};
      traces.forEach((trace, i) => {
        children[`Step ${i + 1}: ${trace.action || 'Unknown'}`] = {
          children: {
            'Duration': { name: trace.duration || '--' },
            'Status': { name: trace.status || 'pending' },
            'Details': { name: trace.details || 'No details' }
          }
        };
      });
      tree.setData({
        extended: true,
        children: Object.keys(children).length ? children : { 'No trace data': {} }
      });
    }
  };
};
```

### Help Overlay (src/ui/help.js)

```javascript
'use strict';

const blessed = require('blessed');

module.exports = function createHelpOverlay(screen, state) {
  const help = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 18,
    tags: true,
    border: { type: 'line', fg: 'yellow' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' }
    },
    label: ' Help ',
    hidden: true,
    content: `
{bold}Navigation{/bold}
  {cyan-fg}1-3{/}     Switch tabs
  {cyan-fg}Tab{/}     Next tab
  {cyan-fg}↑/↓{/}     Navigate items
  {cyan-fg}Enter{/}   Select item
  {cyan-fg}j/k{/}     Vim-style navigation

{bold}Actions{/bold}
  {cyan-fg}r{/}       Refresh data
  {cyan-fg}s{/}       Start loop
  {cyan-fg}p{/}       Pause loop
  {cyan-fg}?/h{/}     Toggle this help

{bold}Exit{/bold}
  {cyan-fg}q{/}       Quit
  {cyan-fg}Ctrl+C{/}  Force quit

{gray-fg}Press any key to close{/}`
  });

  // Close help on any key
  help.key(['escape', 'q', '?', 'h', 'enter', 'space'], () => {
    help.hide();
    screen.render();
  });

  return {
    element: help,
    toggle() {
      if (help.hidden) {
        help.show();
        help.focus();
      } else {
        help.hide();
      }
    },
    show() { help.show(); help.focus(); },
    hide() { help.hide(); }
  };
};
```

### Data Watcher with chokidar (src/data/watcher.js)

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

class DataWatcher {
  constructor(state, onUpdate) {
    this.state = state;
    this.onUpdate = onUpdate;
    this.watcher = null;
    this.statusPath = path.join(process.cwd(), 'docs/09-agents/status.json');
    this.logPath = path.join(process.cwd(), 'docs/09-agents/bus/log.jsonl');
  }

  start() {
    // Initial load
    this.loadStatus();
    this.loadLogs();

    // Watch for changes
    this.watcher = chokidar.watch([this.statusPath, this.logPath], {
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith('status.json')) {
        this.loadStatus();
      } else if (filePath.endsWith('log.jsonl')) {
        this.loadLogs();
      }
      this.onUpdate();
    });
  }

  loadStatus() {
    try {
      if (fs.existsSync(this.statusPath)) {
        const data = JSON.parse(fs.readFileSync(this.statusPath, 'utf8'));
        this.state.sessions = data.sessions || [];
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  loadLogs() {
    try {
      if (fs.existsSync(this.logPath)) {
        const content = fs.readFileSync(this.logPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        this.state.logs = lines.slice(-100).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line };
          }
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}

module.exports = DataWatcher;
```

---

## Action Items

- [ ] Install blessed dependencies: `npm install blessed@npm:@terminal-junkies/neo-blessed blessed-contrib chokidar --save`
- [ ] Create new TUI structure in `packages/cli/scripts/tui/blessed/`
- [ ] Implement screen.js with smartCSR enabled
- [ ] Implement tabbar.js with number key switching
- [ ] Implement statusbar.js with always-visible key hints
- [ ] Implement sessions panel with table widget
- [ ] Implement output panel with log widget
- [ ] Implement trace panel
- [ ] Implement help overlay
- [ ] Implement data watcher with chokidar
- [ ] Update tui/index.js to use blessed TUI
- [ ] Test flicker-free rendering

---

## Risks & Gotchas

- **neo-blessed fork**: The original blessed is unmaintained; must use `@terminal-junkies/neo-blessed` fork
- **Terminal compatibility**: Some terminals may not support synchronized output (`\x1b[?2026h`)
- **Windows support**: blessed has limited Windows terminal support; may need fallback
- **Memory usage**: Watching files with chokidar adds memory overhead
- **Color support**: Need to detect 256-color vs 16-color terminals for graceful degradation

---

## UX Design Principles

### Always-Visible Key Hints (nano-style)
- Status bar shows essential keys at all times
- No need to remember commands or read documentation
- Format: `{bold}key{/bold}:action` with clear spacing

### Semantic Colors
- **Green**: Success, active, running
- **Yellow**: Warning, pending, in-progress
- **Red**: Error, blocked, failed
- **Cyan**: Info, selected, focused
- **White**: Normal text
- **Gray**: Disabled, secondary info

### Clear Focus Indication
- Active panel has colored border (cyan)
- Selected row has inverted colors
- Tab bar highlights active tab

### Graceful Empty States
- Show helpful message when no data: "No active sessions"
- Don't show empty tables or blank panels

---

## References

- Source: ChatGPT/Claude research
- Import date: 2026-01-17
- blessed-contrib: https://github.com/yaronn/blessed-contrib
- neo-blessed: https://github.com/terminal-junkies/neo-blessed
