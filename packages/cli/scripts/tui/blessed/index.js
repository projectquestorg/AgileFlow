#!/usr/bin/env node
'use strict';

/**
 * AgileFlow TUI - Terminal User Interface
 *
 * Full-screen, flicker-free dashboard with tabs and live updates.
 *
 * Key bindings:
 *   1-3       Switch tabs (Sessions, Output, Trace)
 *   Tab       Next tab
 *   j/k       Navigate items
 *   r         Refresh data
 *   ?/h       Toggle help overlay
 *   q         Quit TUI
 */

const blessed = require('blessed');

// UI components
const createScreen = require('./ui/screen');
const createTabBar = require('./ui/tabbar');
const createStatusBar = require('./ui/statusbar');
const createHelpOverlay = require('./ui/help');

// Panels
const createSessionsPanel = require('./panels/sessions');
const createOutputPanel = require('./panels/output');
const createTracePanel = require('./panels/trace');

// Data
const DataWatcher = require('./data/watcher');

class AgileFlowTUI {
  constructor() {
    this.state = {
      activeTab: 0,
      tabs: ['Sessions', 'Output', 'Trace'],
      sessions: [],
      logs: [],
      traces: [],
      showHelp: false,
    };
    this.components = {};
    this.watcher = null;
    this.screen = null;
  }

  init() {
    // Create screen with flicker-free rendering
    this.screen = createScreen();

    // Wrapper to pass screen to panels (they expect grid.screen)
    const gridLike = { screen: this.screen };

    // Create UI components
    this.components.tabBar = createTabBar(this.screen, this.state);
    this.components.statusBar = createStatusBar(this.screen, this.state);
    this.components.help = createHelpOverlay(this.screen, this.state);

    // Create panels (pass screen wrapper)
    this.components.sessions = createSessionsPanel(gridLike, this.state);
    this.components.output = createOutputPanel(gridLike, this.state);
    this.components.trace = createTracePanel(gridLike, this.state);

    // Hide all panels initially
    this.components.sessions.hide();
    this.components.output.hide();
    this.components.trace.hide();

    // Set up keybindings
    this.setupKeys();

    // Start data watcher for live updates
    this.watcher = new DataWatcher(this.state, () => this.refresh());
    this.watcher.start();

    // Show initial tab
    this.switchTab(0);

    // Initial render
    this.screen.render();
  }

  setupKeys() {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Tab switching with number keys
    this.screen.key(['1', '2', '3'], ch => {
      if (this.components.help.isVisible()) return;
      this.switchTab(parseInt(ch) - 1);
    });

    // Tab switching with Tab key
    this.screen.key(['tab'], () => {
      if (this.components.help.isVisible()) return;
      this.switchTab((this.state.activeTab + 1) % this.state.tabs.length);
    });

    // Shift+Tab for reverse tab
    this.screen.key(['S-tab'], () => {
      if (this.components.help.isVisible()) return;
      const prev = (this.state.activeTab - 1 + this.state.tabs.length) % this.state.tabs.length;
      this.switchTab(prev);
    });

    // Help overlay
    this.screen.key(['?', 'h'], () => {
      this.state.showHelp = !this.state.showHelp;
      this.components.help.toggle();
      this.screen.render();
    });

    // Refresh
    this.screen.key(['r'], () => {
      if (this.components.help.isVisible()) return;
      this.components.statusBar.setStatus('{yellow-fg}Refreshing...{/}');
      this.screen.render();

      // Reload data
      if (this.watcher) {
        this.watcher.loadStatus();
        this.watcher.loadLogs();
        this.watcher.loadSessionState();
      }

      setTimeout(() => {
        this.refresh();
        this.components.statusBar.resetHints();
        this.screen.render();
      }, 100);
    });

    // Navigation (j/k)
    this.screen.key(['j', 'down'], () => {
      if (this.components.help.isVisible()) return;
      if (this.state.activeTab === 0 && this.components.sessions.selectNext) {
        this.components.sessions.selectNext();
        this.screen.render();
      }
    });

    this.screen.key(['k', 'up'], () => {
      if (this.components.help.isVisible()) return;
      if (this.state.activeTab === 0 && this.components.sessions.selectPrev) {
        this.components.sessions.selectPrev();
        this.screen.render();
      }
    });

    // Escape to close help
    this.screen.key(['escape'], () => {
      if (this.components.help.isVisible()) {
        this.components.help.hide();
        this.screen.render();
      }
    });
  }

  switchTab(index) {
    if (index < 0 || index >= this.state.tabs.length) return;

    this.state.activeTab = index;

    // Hide all panels
    this.components.sessions.hide();
    this.components.output.hide();
    this.components.trace.hide();

    // Show and focus active panel
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

    // Update tab bar highlighting
    this.components.tabBar.setTab(index);

    // Render changes
    this.screen.render();
  }

  refresh() {
    // Update panels with current state
    this.components.sessions.setData(this.state.sessions);
    this.components.output.setData(this.state.logs);
    this.components.trace.setData(this.state.traces);

    // Re-render
    this.screen.render();
  }

  cleanup() {
    // Stop watching files
    if (this.watcher) {
      this.watcher.stop();
    }

    // Destroy screen
    if (this.screen) {
      this.screen.destroy();
    }
  }

  run() {
    try {
      this.init();
    } catch (err) {
      console.error('Failed to initialize TUI:', err.message);
      console.error('');
      console.error('Try running: npx agileflow tui --fallback');
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
function main() {
  const tui = new AgileFlowTUI();
  tui.run();
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { AgileFlowTUI, main };
