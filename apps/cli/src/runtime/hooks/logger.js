/**
 * Hook execution logger.
 *
 * Appends one JSON object per line to `.agileflow/logs/hook-execution.jsonl`.
 * The orchestrator writes one entry per hook invocation, capturing
 * timing, exit code, and truncated stdout/stderr.
 *
 * Log file is created on first write; missing parent directories are
 * created automatically. Append-only — log rotation is a future concern.
 */
const fs = require('fs');
const path = require('path');

const MAX_OUTPUT_BYTES = 4 * 1024; // 4 KB cap per stream

/**
 * @typedef {Object} HookLogEntry
 * @property {string} timestamp - ISO 8601
 * @property {string} event
 * @property {string} hookId
 * @property {'ok'|'error'|'timeout'|'skipped'} status
 * @property {number|null} exitCode
 * @property {number} durationMs
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {boolean} [skippedByOnError] - true when status='error' was tolerated due to skipOnError
 * @property {string} [reason] - free-form note (e.g. why skipped)
 */

/**
 * Truncate a string buffer to `MAX_OUTPUT_BYTES` to keep the log line
 * bounded. Cuts on byte length, not code units, so trailing multi-byte
 * sequences are stripped cleanly.
 * @param {string|Buffer|undefined} value
 * @returns {string}
 */
function truncate(value) {
  if (value == null || value === '') return '';
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  if (buf.length <= MAX_OUTPUT_BYTES) return buf.toString('utf8');
  return buf.subarray(0, MAX_OUTPUT_BYTES).toString('utf8') + '\n…[truncated]';
}

/**
 * Append one entry to the JSONL log.
 *
 * Throws on filesystem failures so the orchestrator can surface them in
 * structured exit codes — but in practice the orchestrator wraps this
 * in a try/catch and never fails because of a logging error.
 *
 * @param {string} logPath - absolute path to hook-execution.jsonl
 * @param {HookLogEntry} entry
 */
async function appendHookLog(logPath, entry) {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
  const normalized = {
    ...entry,
    stdout: entry.stdout == null ? undefined : truncate(entry.stdout),
    stderr: entry.stderr == null ? undefined : truncate(entry.stderr),
  };
  // Drop undefined keys so the JSONL line is compact.
  for (const k of Object.keys(normalized)) {
    if (normalized[k] === undefined) delete normalized[k];
  }
  await fs.promises.appendFile(logPath, JSON.stringify(normalized) + '\n', 'utf8');
}

module.exports = { appendHookLog, truncate, MAX_OUTPUT_BYTES };
