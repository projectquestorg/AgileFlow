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

    // Header
    const title = ' AgileFlow TUI ';
    const headerPadding = Math.floor((width - title.length) / 2);
    output.push(
      `${ANSI.bgCyan}${ANSI.black}${'═'.repeat(headerPadding)}${ANSI.bold}${title}${ANSI.reset}${ANSI.bgCyan}${ANSI.black}${'═'.repeat(width - headerPadding - title.length)}${ANSI.reset}`
    );
    output.push('');

    // Calculate panel widths
    const leftWidth = Math.floor(width * 0.4);
    const rightWidth = width - leftWidth - 1;
    const panelHeight = height - 6; // Leave room for header and footer

    // Get data
    const sessions = getSessions();
    const loopStatus = getLoopStatus();
    const agentEvents = getAgentEvents(8);

    // Build left panel (sessions)
    output.push(`${ANSI.cyan}${ANSI.bold}┌─ SESSIONS ─${'─'.repeat(leftWidth - 14)}┐${ANSI.reset}`);

    if (sessions.length === 0) {
      output.push(
        `${ANSI.cyan}│${ANSI.reset} ${ANSI.dim}No active sessions${ANSI.reset}${' '.repeat(leftWidth - 21)}${ANSI.cyan}│${ANSI.reset}`
      );
    } else {
      for (const session of sessions.slice(0, 5)) {
        const indicator = session.current ? `${ANSI.green}>` : ' ';
        const name = `Session ${session.id}${session.is_main ? ' [main]' : ''}`;
        const branch = session.branch || 'unknown';
        const story = session.story || 'none';

        output.push(
          `${ANSI.cyan}│${ANSI.reset} ${indicator} ${ANSI.bold}${pad(name, leftWidth - 6)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`
        );
        output.push(
          `${ANSI.cyan}│${ANSI.reset}   ${ANSI.dim}Branch:${ANSI.reset} ${ANSI.cyan}${pad(branch, leftWidth - 12)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`
        );
        output.push(
          `${ANSI.cyan}│${ANSI.reset}   ${ANSI.dim}Story:${ANSI.reset}  ${ANSI.yellow}${pad(story, leftWidth - 12)}${ANSI.reset}${ANSI.cyan}│${ANSI.reset}`
        );
      }
    }

    // Fill remaining space in left panel
    const usedRows = sessions.length === 0 ? 1 : Math.min(sessions.length, 5) * 3;
    const remainingRows = Math.max(0, panelHeight - usedRows - 2);
    for (let i = 0; i < remainingRows; i++) {
      output.push(
        `${ANSI.cyan}│${ANSI.reset}${' '.repeat(leftWidth - 2)}${ANSI.cyan}│${ANSI.reset}`
      );
    }

    output.push(`${ANSI.cyan}└${'─'.repeat(leftWidth - 2)}┘${ANSI.reset}`);

    // Move cursor to right panel position and draw
    // For simplicity, we'll draw the right panel below the left panel
    output.push('');
    output.push(
      `${ANSI.green}${ANSI.bold}┌─ AGENT OUTPUT ─${'─'.repeat(width - 19)}┐${ANSI.reset}`
    );

    if (agentEvents.length === 0 && this.messages.length === 0) {
      output.push(
        `${ANSI.green}│${ANSI.reset} ${ANSI.dim}Waiting for agent activity...${ANSI.reset}${' '.repeat(width - 34)}${ANSI.green}│${ANSI.reset}`
      );
    } else {
      // Show recent events
      const allMessages = [
        ...agentEvents.map(e => ({
          timestamp: e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '',
          agent: e.agent || 'unknown',
          message:
            e.message ||
            (e.event === 'iteration' ? `Iteration ${e.iter}` : e.event || JSON.stringify(e)),
        })),
        ...this.messages,
      ].slice(-8);

      for (const msg of allMessages) {
        const line = `[${msg.timestamp}] [${ANSI.cyan}${msg.agent}${ANSI.reset}] ${msg.message}`;
        const cleanLine = `[${msg.timestamp}] [${msg.agent}] ${msg.message}`;
        const padding = width - cleanLine.length - 4;
        output.push(
          `${ANSI.green}│${ANSI.reset} ${line}${' '.repeat(Math.max(0, padding))}${ANSI.green}│${ANSI.reset}`
        );
      }
    }

    output.push(`${ANSI.green}└${'─'.repeat(width - 2)}┘${ANSI.reset}`);

    // Loop status (if active)
    if (loopStatus.active) {
      output.push('');
      const statusIcon = loopStatus.paused
        ? `${ANSI.yellow}||${ANSI.reset}`
        : `${ANSI.green}>${ANSI.reset}`;
      output.push(
        `${statusIcon} ${ANSI.bold}Loop:${ANSI.reset} ${loopStatus.epic || 'unknown'} | Story: ${loopStatus.currentStory || 'none'} | ${progressBar(loopStatus.iteration, loopStatus.maxIterations, 15)}`
      );
    }

    // Footer with key bindings
    output.push('');
    output.push(
      `${ANSI.dim}[Q]uit  [S]tart  [P]ause  [R]esume  [T]race  [1-9]Sessions  ${ANSI.reset}${ANSI.cyan}AgileFlow v2.90.0${ANSI.reset}`
    );

    // Output everything
    process.stdout.write(output.join('\n'));
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
