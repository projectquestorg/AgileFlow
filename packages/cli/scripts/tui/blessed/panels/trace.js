'use strict';

const blessed = require('blessed');

/**
 * Create the trace panel showing execution steps
 */
module.exports = function createTracePanel(grid, state) {
  const box = blessed.box({
    parent: grid.screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-4',
    label: ' {yellow-fg}{bold}Trace{/bold}{/yellow-fg} ',
    tags: true,
    border: {
      type: 'line',
      fg: 'yellow'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' }
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      style: { fg: 'yellow' }
    },
    keys: true,
    vi: true
  });

  let traces = [];

  function render() {
    if (traces.length === 0) {
      box.setContent(`
  {gray-fg}No trace data{/}

  {yellow-fg}What shows here:{/}
  • Active command execution
  • Step-by-step agent workflow
  • Tool calls and responses
  • Timing information

  {gray-fg}Trace data comes from .agileflow/session-state.json{/}
      `);
      return;
    }

    let lines = [];
    traces.forEach((t, i) => {
      // Status indicator
      let statusIcon = '{gray-fg}○{/}';
      if (t.status === 'running') statusIcon = '{yellow-fg}◉{/}';
      else if (t.status === 'completed') statusIcon = '{green-fg}●{/}';
      else if (t.status === 'error') statusIcon = '{red-fg}✖{/}';

      const stepNum = String(i + 1).padStart(2, '0');
      const action = (t.action || 'Unknown').substring(0, 40);
      const duration = t.duration || '--';

      lines.push(`  ${statusIcon} Step ${stepNum}: {bold}${action}{/}`);
      if (t.details) {
        lines.push(`           {gray-fg}${t.details.substring(0, 60)}{/}`);
      }
      lines.push(`           {gray-fg}Duration: ${duration}{/}`);
      lines.push('');
    });

    box.setContent(lines.join('\n'));
  }

  return {
    element: box,
    show() { box.show(); },
    hide() { box.hide(); },
    focus() { box.focus(); },
    setData(data) {
      traces = data || [];
      render();
    },
    addStep(action, status = 'running', details = '') {
      traces.push({ action, status, details, duration: '--' });
      render();
    }
  };
};
