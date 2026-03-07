#!/usr/bin/env node

/**
 * check-sessions.js - Top-level entry point for monitoring tmux audit sessions
 *
 * Thin wrapper around lib/tmux-audit-monitor.js for easy discovery and calling.
 *
 * Subcommands:
 *   list                                 - List all active audit traces
 *   status  <trace_id>                   - Check progress of a specific audit trace
 *   wait    <trace_id> [--timeout=1800]  - Block until audit trace completes
 *   collect <trace_id>                   - Collect findings from completed analyzers
 *   retry   <trace_id> [--analyzer=key]  - Retry stalled analyzers
 *   kill    <trace_id> [--keep-files]    - Clean shutdown
 *
 * All output is JSON to stdout. Progress goes to stderr.
 *
 * Usage:
 *   node .agileflow/scripts/check-sessions.js list
 *   node .agileflow/scripts/check-sessions.js status abc123ef
 *   node .agileflow/scripts/check-sessions.js wait abc123ef --timeout=600
 */

const USAGE = `Usage: check-sessions.js <subcommand> [trace_id] [options]

Subcommands:
  list                              List all active audit traces
  status  <trace_id>                Check progress of a specific audit trace
  wait    <trace_id> [--timeout=N]  Block until audit trace completes (default: 1800s)
  collect <trace_id>                Collect findings from completed analyzers
  retry   <trace_id> [--analyzer=X] Retry stalled analyzers
  kill    <trace_id> [--keep-files] Clean shutdown of audit sessions

Options:
  --timeout=N       Seconds to wait before timeout (default: 1800)
  --poll=N          Seconds between status checks (default: 5)
  --analyzer=KEY    Retry specific analyzer only
  --model=MODEL     Model override for retry
  --keep-files      Don't remove sentinel files on kill
  --help            Show this help message`;

function jsonOut(obj) {
  console.log(JSON.stringify(obj));
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.error(USAGE);
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Delegate to tmux-audit-monitor.js
  let monitor;
  try {
    monitor = require('./lib/tmux-audit-monitor');
  } catch (err) {
    jsonOut({ ok: false, error: `Failed to load tmux-audit-monitor: ${err.message}` });
    process.exit(1);
  }

  const subcommand = args[0];
  const traceId = args[1];
  const restArgs = args.slice(2);
  const rootDir = process.cwd();
  const opts = monitor.parseSubcommandArgs(restArgs);

  // Validate traceId for commands that require it
  const needsTraceId = ['status', 'wait', 'collect', 'retry', 'kill'];
  if (needsTraceId.includes(subcommand) && !traceId) {
    jsonOut({ ok: false, error: 'trace_id required' });
    process.exit(1);
  }

  try {
    switch (subcommand) {
      case 'status':
        monitor.cmdStatus(rootDir, traceId);
        break;

      case 'wait':
        // Not awaited — event loop stays alive via sleep() timer inside cmdWait
        monitor.cmdWait(rootDir, traceId, opts.timeout, opts.poll).catch(err => {
          jsonOut({ ok: false, error: err.message });
          process.exit(1);
        });
        break;

      case 'collect':
        monitor.cmdCollect(rootDir, traceId);
        break;

      case 'retry':
        monitor.cmdRetry(rootDir, traceId, opts.analyzer, opts.model);
        break;

      case 'kill':
        monitor.cmdKill(rootDir, traceId, opts.keepFiles);
        break;

      case 'list':
        monitor.cmdList(rootDir);
        break;

      default:
        jsonOut({ ok: false, error: `Unknown subcommand: ${subcommand}` });
        process.exit(1);
    }
  } catch (err) {
    jsonOut({ ok: false, error: err.message });
    process.exit(1);
  }
}

module.exports = { USAGE };
