'use strict';

const blessed = require('blessed');

/**
 * Create the help overlay that shows all available commands
 * Toggled with ? or h key
 */
module.exports = function createHelpOverlay(screen, state) {
  const help = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 55,
    height: 22,
    tags: true,
    border: { type: 'line', fg: 'yellow' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
    label: ' {yellow-fg}Help{/yellow-fg} ',
    hidden: true,
    content: `
{bold}Navigation{/bold}
  {cyan-fg}1{/}         Sessions tab
  {cyan-fg}2{/}         Output tab
  {cyan-fg}3{/}         Trace tab
  {cyan-fg}Tab{/}       Next tab
  {cyan-fg}j/k or {/}{cyan-fg}arrow-down/arrow-up{/} Navigate list items
  {cyan-fg}Enter{/}     Select item

{bold}Actions{/bold}
  {cyan-fg}r{/}         Refresh data
  {cyan-fg}s{/}         Start loop on current story
  {cyan-fg}p{/}         Pause active loop

{bold}Display{/bold}
  {cyan-fg}?{/} or {cyan-fg}h{/}   Toggle this help
  {cyan-fg}Escape{/}    Close help/dialogs

{bold}Exit{/bold}
  {cyan-fg}q{/}         Quit TUI
  {cyan-fg}Ctrl+C{/}    Force quit

{gray-fg}Press Escape or ? to close{/gray-fg}`,
  });

  // Close help on various keys
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
    show() {
      help.show();
      help.focus();
    },
    hide() {
      help.hide();
    },
    isVisible() {
      return !help.hidden;
    },
  };
};
