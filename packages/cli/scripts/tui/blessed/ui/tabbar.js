'use strict';

const blessed = require('blessed');

/**
 * Create a proper styled tab bar with visual distinction
 */
module.exports = function createTabBar(screen, state) {
  // Header bar background
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      bg: 'black'
    }
  });

  // Logo/title
  blessed.box({
    parent: header,
    top: 0,
    left: 0,
    width: 20,
    height: 3,
    content: '{bold}{#e8683a-fg}▄▀▄ AgileFlow{/}',
    tags: true,
    style: {
      bg: 'black'
    }
  });

  // Tab container
  const tabContainer = blessed.box({
    parent: header,
    top: 0,
    left: 20,
    width: '100%-20',
    height: 3,
    style: {
      bg: 'black'
    }
  });

  // Create styled tabs
  const tabs = state.tabs.map((name, i) => {
    const tab = blessed.box({
      parent: tabContainer,
      top: 1,
      left: i * 18,
      width: 16,
      height: 1,
      content: `[${i + 1}] ${name}`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    });
    return tab;
  });

  // Version info on right
  blessed.box({
    parent: header,
    top: 1,
    right: 1,
    width: 12,
    height: 1,
    content: '{gray-fg}v2.90.7{/}',
    tags: true,
    style: {
      bg: 'black'
    }
  });

  return {
    element: header,
    setTab(index) {
      tabs.forEach((tab, i) => {
        if (i === index) {
          // Active tab - cyan background, black text, with brackets
          tab.style.fg = 'black';
          tab.style.bg = 'cyan';
          tab.style.bold = true;
          tab.setContent(`▶ ${state.tabs[i]} ◀`);
        } else {
          // Inactive tabs
          tab.style.fg = 'gray';
          tab.style.bg = 'black';
          tab.style.bold = false;
          tab.setContent(`[${i + 1}] ${state.tabs[i]}`);
        }
      });
    }
  };
};
