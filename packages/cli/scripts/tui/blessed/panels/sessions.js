'use strict';

const blessed = require('blessed');

/**
 * Create the sessions panel with a better styled list
 */
module.exports = function createSessionsPanel(grid, state) {
  // Use a list instead of table for better control
  const box = blessed.box({
    parent: grid.screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-4',
    label: ' {cyan-fg}{bold}Sessions{/bold}{/cyan-fg} ',
    tags: true,
    border: {
      type: 'line',
      fg: 'cyan',
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      style: { fg: 'cyan' },
    },
    keys: true,
    vi: true,
  });

  // Header row
  const header = blessed.box({
    parent: box,
    top: 0,
    left: 0,
    width: '100%-2',
    height: 1,
    content:
      '{bold}{cyan-fg}  ID          Story                              Status        Time{/}{/}',
    tags: true,
    style: {
      bg: '#222222',
    },
  });

  // Divider
  blessed.box({
    parent: box,
    top: 1,
    left: 0,
    width: '100%-2',
    height: 1,
    content: '  ──────────  ─────────────────────────────────  ────────────  ──────',
    style: {
      fg: 'gray',
    },
  });

  // Content area
  const content = blessed.box({
    parent: box,
    top: 2,
    left: 0,
    width: '100%-2',
    height: '100%-3',
    tags: true,
    style: {
      fg: 'white',
    },
  });

  let sessions = [];
  let selectedIndex = 0;

  function render() {
    if (sessions.length === 0) {
      content.setContent(`
  {gray-fg}No active sessions{/}

  {cyan-fg}Quick Start:{/}
  • Run {bold}/agileflow:start{/} to begin a session
  • Use {bold}/agileflow:loop{/} for autonomous mode
  • Press {bold}?{/} for help
      `);
      return;
    }

    let lines = [];
    sessions.forEach((s, i) => {
      const selected = i === selectedIndex;
      const prefix = selected ? '{inverse}' : '';
      const suffix = selected ? '{/inverse}' : '';

      // Status with colors
      let statusText = s.status || 'unknown';
      if (statusText === 'active') statusText = '{green-fg}● active{/}';
      else if (statusText === 'running') statusText = '{green-fg}● running{/}';
      else if (statusText === 'paused') statusText = '{yellow-fg}◉ paused{/}';
      else if (statusText === 'idle') statusText = '{gray-fg}○ idle{/}';
      else if (statusText === 'error') statusText = '{red-fg}✖ error{/}';
      else statusText = `{gray-fg}○ ${statusText}{/}`;

      const id = (s.id || '--').padEnd(10);
      const story = (s.story || 'No story').substring(0, 34).padEnd(34);
      const time = (s.duration || '--').padStart(6);

      lines.push(`${prefix}  ${id}  ${story}  ${statusText.padEnd(22)}  ${time}${suffix}`);
    });

    content.setContent(lines.join('\n'));
  }

  return {
    element: box,
    show() {
      box.show();
    },
    hide() {
      box.hide();
    },
    focus() {
      box.focus();
    },
    setData(data) {
      sessions = data || [];
      render();
    },
    getSelected() {
      return selectedIndex;
    },
    selectNext() {
      if (selectedIndex < sessions.length - 1) {
        selectedIndex++;
        render();
      }
    },
    selectPrev() {
      if (selectedIndex > 0) {
        selectedIndex--;
        render();
      }
    },
  };
};
