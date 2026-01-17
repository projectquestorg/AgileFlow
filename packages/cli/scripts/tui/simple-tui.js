#!/usr/bin/env node
'use strict';

/**
 * AgileFlow Simple TUI - Terminal User Interface
 *
 * A simple terminal-based dashboard that works without React/ink dependencies.
 * Uses ANSI escape codes for styling and keyboard input.
 *
 * Usage:
 *   node scripts/tui/simple-tui.js
 *   npx agileflow tui
 *
 * Key bindings:
 *   q - Quit TUI
 *   s - Start loop on current story
 *   p - Pause active loop
 *   r - Resume paused loop
 *   t - Toggle trace panel
 *   1-9 - Switch session focus
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI escape codes
const ANSI = {
  clear: '\x1b[2J',
  home: '\x1b[H',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Backgrounds
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  // Cursor
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  saveCursor: '\x1b[s',
  restoreCursor: '\x1b[u',
};

// Get project root
function getProjectRoot() {
  return process.cwd();
}

// Get sessions from registry
function getSessions() {
  try {
    const registryPath = path.join(getProjectRoot(), '.agileflow', 'sessions', 'registry.json');
    if (!fs.existsSync(registryPath)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const sessions = data.sessions || {};
    // Convert object to array (registry stores sessions as object with ID keys)
    if (Array.isArray(sessions)) {
      return sessions;
    }
    return Object.entries(sessions).map(([id, session]) => ({
      id,
      ...session,
    }));
  } catch (e) {
    return [];
  }
}

// Get loop status
function getLoopStatus() {
  try {
    const statePath = path.join(getProjectRoot(), 'docs', '09-agents', 'session-state.json');
    if (!fs.existsSync(statePath)) {
      return { active: false };
    }
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const loop = data.ralph_loop;
    if (!loop || !loop.enabled) {
      return { active: false };
    }
    return {
      active: true,
      paused: loop.paused || false,
      epic: loop.epic,
      currentStory: loop.current_story,
      iteration: loop.iteration || 0,
      maxIterations: loop.max_iterations || 20,
    };
  } catch (e) {
    return { active: false };
  }
}

// Get recent agent events
function getAgentEvents(limit = 10) {
  try {
    const logPath = path.join(getProjectRoot(), 'docs', '09-agents', 'bus', 'log.jsonl');
    if (!fs.existsSync(logPath)) {
      return [];
    }
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events = [];
    for (const line of lines.slice(-limit)) {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        // Skip invalid JSON
      }
    }
    return events;
  } catch (e) {
    return [];
  }
}

// Draw box with border
function drawBox(x, y, width, height, title = '', color = 'cyan') {
  const colorCode = ANSI[color] || ANSI.cyan;
  const lines = [];

  // Top border
  lines.push(`${colorCode}+${'─'.repeat(width - 2)}+${ANSI.reset}`);

  // Title if provided
  if (title) {
    const titleStr = ` ${title} `;
    const paddingLeft = Math.floor((width - 2 - titleStr.length) / 2);
    const paddingRight = width - 2 - titleStr.length - paddingLeft;
    lines[0] = `${colorCode}+${'─'.repeat(paddingLeft)}${ANSI.bold}${titleStr}${ANSI.reset}${colorCode}${'─'.repeat(paddingRight)}+${ANSI.reset}`;
  }

  // Content lines
  for (let i = 0; i < height - 2; i++) {
    lines.push(`${colorCode}│${ANSI.reset}${' '.repeat(width - 2)}${colorCode}│${ANSI.reset}`);
  }

  // Bottom border
  lines.push(`${colorCode}+${'─'.repeat(width - 2)}+${ANSI.reset}`);

  return lines;
}

// Pad string to width
function pad(str, width, align = 'left') {
  const s = String(str).slice(0, width);
  const padding = width - s.length;
  if (align === 'right') return ' '.repeat(padding) + s;
  if (align === 'center')
    return ' '.repeat(Math.floor(padding / 2)) + s + ' '.repeat(Math.ceil(padding / 2));
  return s + ' '.repeat(padding);
}

// Progress bar
function progressBar(value, max, width = 20) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = ANSI.red;
  if (percent >= 80) color = ANSI.green;
  else if (percent >= 50) color = ANSI.yellow;

  return `${color}${'█'.repeat(filled)}${ANSI.dim}${'░'.repeat(empty)}${ANSI.reset} ${percent.toFixed(0)}%`;
}

// Main TUI class
class SimpleTUI {
  constructor() {
    this.running = false;
    this.showTrace = true;
    this.lastUpdate = new Date();
    this.messages = [];
  }

  start() {
    this.running = true;

    // Set up terminal
    process.stdout.write(ANSI.clear + ANSI.home + ANSI.hideCursor);

    // Enable raw mode for keyboard input
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
    }

    // Handle keyboard input
    process.stdin.on('keypress', (str, key) => {
      this.handleKey(key);
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.render();
    });

    // Initial render
    this.render();

    // Update loop
    this.updateInterval = setInterval(() => {
      this.render();
    }, 2000);

    this.addMessage('TUI', 'Dashboard started');
  }

  stop() {
    this.running = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Restore terminal
    process.stdout.write(ANSI.showCursor + ANSI.clear + ANSI.home);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    console.log('AgileFlow TUI closed.');
    process.exit(0);
  }

  handleKey(key) {
    if (!key) return;

    const k = key.name || key.sequence;

    switch (k) {
      case 'q':
      case 'escape':
        this.stop();
        break;
      case 't':
        this.showTrace = !this.showTrace;
        this.addMessage('TUI', `Trace panel ${this.showTrace ? 'shown' : 'hidden'}`);
        this.render();
        break;
      case 's':
        this.addMessage('TUI', 'Start loop requested (not implemented)');
        this.render();
        break;
      case 'p':
        this.addMessage('TUI', 'Pause requested (not implemented)');
        this.render();
        break;
      case 'r':
        this.addMessage('TUI', 'Resume requested (not implemented)');
        this.render();
        break;
      case 'c':
        if (key.ctrl) {
          this.stop();
        }
        break;
    }
  }

  addMessage(agent, message) {
    const timestamp = new Date().toLocaleTimeString();
    this.messages.push({ timestamp, agent, message });
    if (this.messages.length > 50) {
      this.messages.shift();
    }
  }

  render() {
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    const output = [];

    // Clear screen
    output.push(ANSI.clear + ANSI.home);

    // Determine layout mode based on terminal width
    const isWide = width >= 100;
    const isNarrow = width < 60;

    // Header - compact on narrow terminals
    const title = isNarrow ? ' TUI ' : ' AgileFlow TUI ';
    const headerPadding = Math.floor((width - title.length) / 2);
    output.push(
      `${ANSI.bgCyan}${ANSI.black}${'═'.repeat(headerPadding)}${ANSI.bold}${title}${ANSI.reset}${ANSI.bgCyan}${ANSI.black}${'═'.repeat(width - headerPadding - title.length)}${ANSI.reset}`
    );

    // Get data
    const sessions = getSessions();
    const loopStatus = getLoopStatus();
    const agentEvents = getAgentEvents(isNarrow ? 4 : 8);

    if (isWide) {
      // Side-by-side layout for wide terminals
      this.renderSideBySide(output, width, height, sessions, loopStatus, agentEvents);
    } else {
      // Stacked layout for normal/narrow terminals
      this.renderStacked(output, width, height, sessions, loopStatus, agentEvents, isNarrow);
    }

    // Output everything
    process.stdout.write(output.join('\n'));
  }

  renderSideBySide(output, width, height, sessions, loopStatus, agentEvents) {
    // Calculate panel widths: 30% sessions, 70% output
    const leftWidth = Math.max(25, Math.floor(width * 0.3));
    const rightWidth = width - leftWidth - 3;
    const panelHeight = Math.max(6, height - 5);

    // Build both panels line by line
    const leftLines = this.buildSessionPanel(leftWidth, panelHeight, sessions);
    const rightLines = this.buildOutputPanel(rightWidth, panelHeight, agentEvents);

    // Combine side by side
    for (let i = 0; i < panelHeight; i++) {
      const left = leftLines[i] || pad('', leftWidth);
      const right = rightLines[i] || pad('', rightWidth);
      output.push(`${left} ${right}`);
    }

    // Status bar and footer
    this.renderStatusBar(output, width, loopStatus);
  }

  renderStacked(output, width, height, sessions, loopStatus, agentEvents, isNarrow) {
    // Calculate heights
    const sessionHeight = isNarrow ? 4 : Math.min(6, sessions.length * 3 + 2);
    const outputHeight = Math.max(4, height - sessionHeight - 5);

    // Build panels
    const sessionLines = this.buildSessionPanel(width - 2, sessionHeight, sessions);
    const outputLines = this.buildOutputPanel(width - 2, outputHeight, agentEvents);

    // Add session panel
    for (const line of sessionLines) {
      output.push(line);
    }
    output.push('');

    // Add output panel
    for (const line of outputLines) {
      output.push(line);
    }

    // Status bar and footer
    this.renderStatusBar(output, width, loopStatus);
  }

  buildSessionPanel(panelWidth, panelHeight, sessions) {
    const lines = [];
    const innerWidth = panelWidth - 2;

    // Header
    const header = `─ SESSIONS ─`;
    lines.push(`${ANSI.cyan}┌${header}${'─'.repeat(Math.max(0, innerWidth - header.length))}┐${ANSI.reset}`);

    if (sessions.length === 0) {
      lines.push(`${ANSI.cyan}│${ANSI.reset} ${ANSI.dim}${pad('No active sessions', innerWidth)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`);
    } else {
      const maxSessions = Math.floor((panelHeight - 2) / 2);
      for (const session of sessions.slice(0, maxSessions)) {
        const indicator = session.current ? `${ANSI.green}▶` : ' ';
        const name = `Session ${session.id}${session.is_main ? ' [main]' : ''}`;
        lines.push(`${ANSI.cyan}│${ANSI.reset}${indicator} ${ANSI.bold}${pad(name, innerWidth - 2)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`);

        const info = `${session.branch || '?'}${session.story ? ' / ' + session.story : ''}`;
        lines.push(`${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}${pad(info, innerWidth - 1)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`);
      }
    }

    // Fill remaining rows
    while (lines.length < panelHeight - 1) {
      lines.push(`${ANSI.cyan}│${ANSI.reset}${' '.repeat(innerWidth)}${ANSI.cyan}│${ANSI.reset}`);
    }

    // Footer
    lines.push(`${ANSI.cyan}└${'─'.repeat(innerWidth)}┘${ANSI.reset}`);

    return lines;
  }

  buildOutputPanel(panelWidth, panelHeight, agentEvents) {
    const lines = [];
    const innerWidth = panelWidth - 2;

    // Header
    const header = `─ OUTPUT ─`;
    lines.push(`${ANSI.green}┌${header}${'─'.repeat(Math.max(0, innerWidth - header.length))}┐${ANSI.reset}`);

    // Combine events and messages
    const allMessages = [
      ...agentEvents.map(e => ({
        time: e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '',
        agent: (e.agent || 'unknown').replace('agileflow-', ''),
        msg: e.message || (e.event === 'iteration' ? `Iter ${e.iter}` : e.event || ''),
      })),
      ...this.messages.map(m => ({
        time: m.timestamp || '',
        agent: (m.agent || 'unknown').replace('agileflow-', ''),
        msg: m.message || '',
      })),
    ].slice(-(panelHeight - 2));

    if (allMessages.length === 0) {
      lines.push(`${ANSI.green}│${ANSI.reset} ${ANSI.dim}${pad('Waiting for activity...', innerWidth)}${ANSI.reset}${ANSI.green}│${ANSI.reset}`);
    } else {
      for (const msg of allMessages) {
        const prefix = `${msg.time} [${msg.agent}] `;
        const maxMsgLen = Math.max(10, innerWidth - prefix.length - 1);
        const truncatedMsg = msg.msg.length > maxMsgLen ? msg.msg.slice(0, maxMsgLen - 2) + '..' : msg.msg;
        const line = `${ANSI.dim}${msg.time}${ANSI.reset} [${ANSI.cyan}${msg.agent}${ANSI.reset}] ${truncatedMsg}`;
        const cleanLen = prefix.length + truncatedMsg.length;
        lines.push(`${ANSI.green}│${ANSI.reset} ${line}${' '.repeat(Math.max(0, innerWidth - cleanLen - 1))}${ANSI.green}│${ANSI.reset}`);
      }
    }

    // Fill remaining rows
    while (lines.length < panelHeight - 1) {
      lines.push(`${ANSI.green}│${ANSI.reset}${' '.repeat(innerWidth)}${ANSI.green}│${ANSI.reset}`);
    }

    // Footer
    lines.push(`${ANSI.green}└${'─'.repeat(innerWidth)}┘${ANSI.reset}`);

    return lines;
  }

  renderStatusBar(output, width, loopStatus) {
    output.push('');

    // Loop status
    if (loopStatus.active) {
      const statusIcon = loopStatus.paused ? `${ANSI.yellow}⏸${ANSI.reset}` : `${ANSI.green}▶${ANSI.reset}`;
      const bar = progressBar(loopStatus.iteration, loopStatus.maxIterations, Math.min(15, Math.floor(width / 6)));
      const info = `${loopStatus.epic || ''}${loopStatus.currentStory ? ' / ' + loopStatus.currentStory : ''}`;
      output.push(`${statusIcon} ${ANSI.bold}${info}${ANSI.reset} ${bar}`);
    }

    // Key bindings - compact on narrow terminals
    const keys = width >= 70
      ? `${ANSI.dim}[Q]uit [S]tart [P]ause [R]esume [T]race [1-9]Sessions${ANSI.reset}`
      : `${ANSI.dim}Q S P R T 1-9${ANSI.reset}`;
    const version = `${ANSI.cyan}v2.90.3${ANSI.reset}`;
    output.push(`${keys}  ${version}`);
  }
}

// Main entry point
function main() {
  const tui = new SimpleTUI();
  tui.start();
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { SimpleTUI, main };
