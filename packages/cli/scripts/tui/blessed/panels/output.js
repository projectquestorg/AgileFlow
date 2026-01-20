'use strict';

const blessed = require('blessed');

/**
 * Create the output panel showing log stream
 */
module.exports = function createOutputPanel(grid, state) {
  const box = blessed.box({
    parent: grid.screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-4',
    label: ' {green-fg}{bold}Output{/bold}{/green-fg} ',
    tags: true,
    border: {
      type: 'line',
      fg: 'green',
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      style: { fg: 'green' },
    },
    keys: true,
    vi: true,
    mouse: true,
  });

  let logs = [];

  function render() {
    if (logs.length === 0) {
      box.setContent(`
  {gray-fg}Waiting for output...{/}

  {green-fg}What shows here:{/}
  • Agent activity logs
  • Command execution output
  • Tool call results
  • Error messages

  {gray-fg}Logs are read from docs/09-agents/bus/log.jsonl{/}
      `);
      return;
    }

    let lines = [];
    logs.forEach(entry => {
      const time = entry.timestamp
        ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })
        : '--:--:--';

      const level = entry.level || 'info';
      let levelTag = '{gray-fg}INFO{/}';
      if (level === 'error') levelTag = '{red-fg}ERRO{/}';
      else if (level === 'warn' || level === 'warning') levelTag = '{yellow-fg}WARN{/}';
      else if (level === 'debug') levelTag = '{gray-fg}DEBG{/}';
      else if (level === 'success') levelTag = '{green-fg}DONE{/}';

      const msg = entry.message || (typeof entry === 'string' ? entry : JSON.stringify(entry));
      lines.push(`  {gray-fg}${time}{/} ${levelTag} ${msg}`);
    });

    box.setContent(lines.join('\n'));
    box.setScrollPerc(100); // Auto-scroll to bottom
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
      logs = data || [];
      render();
    },
    addLine(text, level = 'info') {
      logs.push({ message: text, level, timestamp: new Date().toISOString() });
      if (logs.length > 200) logs.shift();
      render();
    },
    clear() {
      logs = [];
      render();
    },
  };
};
