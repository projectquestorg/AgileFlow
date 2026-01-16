/**
 * Agent Trace Panel - Quality gate and iteration tracking
 *
 * Shows active agent loops with:
 *   - Current gate (tests, coverage, lint, types, visual)
 *   - Iteration count and progress
 *   - Pass/fail status with color coding
 *   - Progress bars for coverage
 */

import React from 'react';
import { Box, Text } from 'ink';
import { getLoopStatus } from '../lib/loopControl.mjs';

/**
 * Quality gate definitions
 */
const QUALITY_GATES = {
  tests: { name: 'Tests', color: 'green', icon: '+' },
  coverage: { name: 'Coverage', color: 'magenta', icon: '%' },
  lint: { name: 'Lint', color: 'yellow', icon: '*' },
  types: { name: 'Types', color: 'blue', icon: '#' },
  visual: { name: 'Visual', color: 'cyan', icon: '@' },
};

/**
 * Get status color
 */
function getStatusColor(status) {
  switch (status) {
    case 'passed':
    case 'complete':
    case true:
      return 'green';
    case 'failed':
    case 'error':
    case false:
      return 'red';
    case 'running':
    case 'in_progress':
      return 'cyan';
    case 'pending':
    case 'waiting':
      return 'gray';
    default:
      return 'white';
  }
}

/**
 * Get status symbol
 */
function getStatusSymbol(status) {
  switch (status) {
    case 'passed':
    case 'complete':
    case true:
      return '+';
    case 'failed':
    case 'error':
    case false:
      return 'x';
    case 'running':
    case 'in_progress':
      return '~';
    case 'pending':
    case 'waiting':
      return 'o';
    case 'paused':
      return '|';
    default:
      return '*';
  }
}

/**
 * Progress bar component
 */
function ProgressBar({ value, max = 100, width = 20, fillChar = '#', emptyChar = '-' }) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const filledStr = fillChar.repeat(filled);
  const emptyStr = emptyChar.repeat(empty);

  // Color based on progress
  let color = 'red';
  if (percent >= 80) color = 'green';
  else if (percent >= 50) color = 'yellow';

  return React.createElement(
    Box,
    { flexDirection: 'row' },
    React.createElement(Text, { color }, filledStr),
    React.createElement(Text, { dimColor: true }, emptyStr),
    React.createElement(Text, { dimColor: true }, ` ${percent.toFixed(0)}%`)
  );
}

/**
 * Quality gate row component
 */
function GateRow({ gate, status, value }) {
  const gateConfig = QUALITY_GATES[gate] || { name: gate, color: 'white', icon: '*' };
  const statusColor = getStatusColor(status);
  const statusSymbol = getStatusSymbol(status);

  return React.createElement(
    Box,
    { flexDirection: 'row', marginLeft: 2 },
    React.createElement(Text, { color: gateConfig.color }, `${gateConfig.icon} `),
    React.createElement(Text, { color: statusColor }, `${statusSymbol} `),
    React.createElement(Text, null, `${gateConfig.name}`),
    value !== undefined && React.createElement(Text, { dimColor: true }, `: ${value}`)
  );
}

/**
 * Active loop trace component
 */
function LoopTrace({ loopStatus }) {
  if (!loopStatus || !loopStatus.active) {
    return React.createElement(Text, { dimColor: true, italic: true }, 'No active loop');
  }

  const {
    epic,
    currentStory,
    iteration,
    maxIterations,
    paused,
    coverageMode,
    coverageThreshold,
    coverageCurrent,
    visualMode,
  } = loopStatus;

  // Build gates list
  const gates = [];

  // Tests always present
  gates.push({
    gate: 'tests',
    status: 'running',
    value: null,
  });

  // Coverage if enabled
  if (coverageMode) {
    gates.push({
      gate: 'coverage',
      status: coverageCurrent >= coverageThreshold ? 'passed' : 'running',
      value: `${coverageCurrent?.toFixed(1) || 0}% / ${coverageThreshold}%`,
    });
  }

  // Visual if enabled
  if (visualMode) {
    gates.push({
      gate: 'visual',
      status: 'pending',
      value: null,
    });
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    // Loop header
    React.createElement(
      Box,
      { flexDirection: 'row', marginBottom: 1 },
      React.createElement(
        Text,
        { bold: true, color: paused ? 'yellow' : 'green' },
        paused ? '|| PAUSED' : '> RUNNING'
      ),
      React.createElement(Text, { dimColor: true }, ` * ${epic}`)
    ),
    // Current story
    React.createElement(
      Box,
      { flexDirection: 'row' },
      React.createElement(Text, { dimColor: true }, 'Story: '),
      React.createElement(Text, { color: 'cyan' }, currentStory || 'none')
    ),
    // Iteration progress
    React.createElement(
      Box,
      { flexDirection: 'row', marginY: 1 },
      React.createElement(Text, { dimColor: true }, 'Iteration: '),
      React.createElement(ProgressBar, {
        value: iteration || 0,
        max: maxIterations || 20,
        width: 15,
      }),
      React.createElement(Text, { dimColor: true }, ` ${iteration || 0}/${maxIterations || 20}`)
    ),
    // Coverage progress (if enabled)
    coverageMode &&
      React.createElement(
        Box,
        { flexDirection: 'row', marginBottom: 1 },
        React.createElement(Text, { dimColor: true }, 'Coverage: '),
        React.createElement(ProgressBar, { value: coverageCurrent || 0, max: 100, width: 15 })
      ),
    // Quality gates
    React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      React.createElement(Text, { dimColor: true }, 'Quality Gates:'),
      gates.map((g, i) => React.createElement(GateRow, { key: `gate-${i}`, ...g }))
    )
  );
}

/**
 * Main Trace Panel component
 */
function TracePanel({ visible = true, refreshInterval = 2000 }) {
  const [loopStatus, setLoopStatus] = React.useState(null);

  React.useEffect(() => {
    if (!visible) return;

    const loadStatus = () => {
      try {
        const status = getLoopStatus();
        setLoopStatus(status);
      } catch (e) {
        // Ignore errors
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, refreshInterval);

    return () => clearInterval(interval);
  }, [visible, refreshInterval]);

  if (!visible) {
    return null;
  }

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: 'blue',
      padding: 1,
    },
    // Header
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'blue' }, 'AGENT TRACE'),
      React.createElement(Text, { dimColor: true }, ' (T to toggle)')
    ),
    // Loop trace
    React.createElement(LoopTrace, { loopStatus })
  );
}

/**
 * Compact trace indicator (for status bar)
 */
function CompactTrace({ loopStatus }) {
  if (!loopStatus || !loopStatus.active) {
    return React.createElement(Text, { dimColor: true }, 'Loop: inactive');
  }

  const { iteration, maxIterations, paused, currentStory } = loopStatus;
  const statusIcon = paused ? '||' : '>';
  const statusColor = paused ? 'yellow' : 'green';

  return React.createElement(
    Box,
    { flexDirection: 'row' },
    React.createElement(Text, { color: statusColor }, statusIcon),
    React.createElement(Text, null, ` ${currentStory || '?'} `),
    React.createElement(Text, { dimColor: true }, `[${iteration || 0}/${maxIterations || 20}]`)
  );
}

export {
  TracePanel,
  LoopTrace,
  GateRow,
  ProgressBar,
  CompactTrace,
  getStatusColor,
  getStatusSymbol,
  QUALITY_GATES,
};
