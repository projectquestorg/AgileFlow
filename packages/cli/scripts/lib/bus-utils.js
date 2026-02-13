/**
 * bus-utils.js - JSONL bus log rotation utility
 *
 * Provides log rotation for bus/log.jsonl files to manage file size and maintain
 * fast I/O performance. Archives old messages while preserving all history.
 *
 * Rotation Strategy:
 * - When log.jsonl exceeds threshold (default 1000 lines), rotation is triggered
 * - Recent lines (default 100) are kept in current log.jsonl
 * - Earlier lines are appended to bus/archive/YYYY-MM-archive.jsonl
 * - Archives are organized by month and never overwritten
 * - Fail-safe: if anything fails, original log.jsonl is left intact
 *
 * Usage:
 *   const { getLineCount, shouldRotate, rotateLog, ensureArchiveDir } = require('./lib/bus-utils');
 *
 *   // Check if rotation is needed
 *   const count = getLineCount(logPath);
 *   if (shouldRotate(logPath, 1000)) {
 *     const result = rotateLog(logPath, { keepRecent: 100 });
 *     if (result.ok) {
 *       console.log(`Rotated: ${result.archivedCount} messages archived`);
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Get the line count of a JSONL file
 *
 * @param {string} logPath - Path to the JSONL log file
 * @returns {number} Number of lines in the file (0 if file doesn't exist)
 */
function getLineCount(logPath) {
  try {
    if (!fs.existsSync(logPath)) {
      return 0;
    }

    const content = fs.readFileSync(logPath, 'utf8');
    if (!content) {
      return 0;
    }

    // Count newlines, but account for file that may not end in newline
    const lineCount = content.split('\n').filter(line => line.trim().length > 0).length;
    return lineCount;
  } catch (e) {
    // On error, assume we can't count lines (fail-safe: don't rotate)
    return 0;
  }
}

/**
 * Check if a log file should be rotated based on line count threshold
 *
 * @param {string} logPath - Path to the JSONL log file
 * @param {number} [threshold=1000] - Line count threshold for rotation
 * @returns {boolean} True if rotation is needed, false otherwise
 */
function shouldRotate(logPath, threshold = 1000) {
  const lineCount = getLineCount(logPath);
  return lineCount > threshold;
}

/**
 * Ensure the archive directory exists
 *
 * @param {string} logPath - Path to the log file (archive dir is relative to log file)
 * @returns {{ ok: boolean, archiveDir?: string, error?: string }}
 */
function ensureArchiveDir(logPath) {
  try {
    const logDir = path.dirname(logPath);
    const archiveDir = path.join(logDir, 'archive');

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    return { ok: true, archiveDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get the archive file path for a given date
 *
 * @param {string} logPath - Path to the log file
 * @param {Date} [date] - Date for archive (defaults to now)
 * @returns {string} Path to the archive file (YYYY-MM-archive.jsonl)
 */
function getArchiveFilePath(logPath, date = new Date()) {
  const logDir = path.dirname(logPath);
  const archiveDir = path.join(logDir, 'archive');

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const archiveFilename = `${year}-${month}-archive.jsonl`;

  return path.join(archiveDir, archiveFilename);
}

/**
 * Read all lines from a JSONL file as objects
 *
 * @param {string} filePath - Path to the JSONL file
 * @returns {{ ok: boolean, lines?: object[], error?: string }}
 */
function readJSONLFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: true, lines: [] };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;

      try {
        const obj = JSON.parse(line);
        lines.push(obj);
      } catch (e) {
        // Skip malformed lines (fail-safe: continue with valid lines)
        continue;
      }
    }

    return { ok: true, lines };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Write lines to a JSONL file (append mode)
 *
 * @param {string} filePath - Path to the JSONL file
 * @param {object[]} lines - Array of objects to write
 * @param {object} [options] - Options
 * @param {boolean} [options.append=true] - Append to file instead of overwriting
 * @returns {{ ok: boolean, lineCount?: number, error?: string }}
 */
function writeJSONLFile(filePath, lines, options = {}) {
  try {
    const { append = true } = options;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert lines to JSONL format
    const jsonlContent = lines.map(obj => JSON.stringify(obj)).join('\n');

    if (append && fs.existsSync(filePath)) {
      // Append mode: add newline before new content if file exists
      fs.appendFileSync(filePath, '\n' + jsonlContent);
    } else {
      // Write mode: overwrite file
      fs.writeFileSync(filePath, jsonlContent);
    }

    return { ok: true, lineCount: lines.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Perform log rotation: archive old messages, keep recent ones
 *
 * @param {string} logPath - Path to the JSONL log file
 * @param {object} [options] - Options
 * @param {number} [options.keepRecent=100] - Number of recent lines to keep in current log
 * @param {number} [options.threshold=1000] - Minimum lines before rotating (for safety check)
 * @returns {{ ok: boolean, archivedCount?: number, keptCount?: number, archiveFile?: string, error?: string }}
 */
function rotateLog(logPath, options = {}) {
  const { keepRecent = 100, threshold = 1000 } = options;

  try {
    // Safety check: only rotate if we have more than threshold
    const lineCount = getLineCount(logPath);
    if (lineCount <= threshold) {
      return {
        ok: true,
        archivedCount: 0,
        keptCount: lineCount,
        message: 'No rotation needed',
      };
    }

    // Step 1: Read all lines
    const readResult = readJSONLFile(logPath);
    if (!readResult.ok) {
      return { ok: false, error: `Failed to read log: ${readResult.error}` };
    }

    const allLines = readResult.lines;
    if (allLines.length === 0) {
      return { ok: true, archivedCount: 0, keptCount: 0 };
    }

    // Step 2: Split into archive portion and keep-recent portion
    const archiveCount = allLines.length - keepRecent;
    const linesToArchive = allLines.slice(0, archiveCount);
    const linesToKeep = allLines.slice(archiveCount);

    // Step 3: Ensure archive directory exists
    const archiveResult = ensureArchiveDir(logPath);
    if (!archiveResult.ok) {
      return { ok: false, error: `Failed to create archive directory: ${archiveResult.error}` };
    }

    // Step 4: Append to archive file
    const archiveFilePath = getArchiveFilePath(logPath);
    const appendResult = writeJSONLFile(archiveFilePath, linesToArchive, { append: true });
    if (!appendResult.ok) {
      return { ok: false, error: `Failed to write archive: ${appendResult.error}` };
    }

    // Step 5: Write kept lines back to current log (truncate + write)
    const writeResult = writeJSONLFile(logPath, linesToKeep, { append: false });
    if (!writeResult.ok) {
      return { ok: false, error: `Failed to write current log: ${writeResult.error}` };
    }

    return {
      ok: true,
      archivedCount: linesToArchive.length,
      keptCount: linesToKeep.length,
      archiveFile: path.relative(path.dirname(logPath), archiveFilePath),
    };
  } catch (e) {
    // Fail-safe: return error without modifying files
    return { ok: false, error: e.message };
  }
}

/**
 * Get statistics about a log file and its archives
 *
 * @param {string} logPath - Path to the JSONL log file
 * @returns {{ ok: boolean, stats?: object, error?: string }}
 */
function getLogStats(logPath) {
  try {
    const archiveResult = ensureArchiveDir(logPath);
    if (!archiveResult.ok) {
      return { ok: false, error: archiveResult.error };
    }

    const archiveDir = archiveResult.archiveDir;
    const logDir = path.dirname(logPath);

    // Count lines in current log
    const currentLineCount = getLineCount(logPath);
    const currentSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

    // Count archives
    const archives = [];
    if (fs.existsSync(archiveDir)) {
      const files = fs.readdirSync(archiveDir);
      for (const file of files) {
        if (!file.endsWith('-archive.jsonl')) continue;

        const filePath = path.join(archiveDir, file);
        const stat = fs.statSync(filePath);
        const lineCount = getLineCount(filePath);

        archives.push({
          filename: file,
          size: stat.size,
          lineCount,
          modified: stat.mtime.toISOString(),
        });
      }
    }

    // Calculate totals
    const totalSize = currentSize + archives.reduce((sum, a) => sum + a.size, 0);
    const totalLineCount = currentLineCount + archives.reduce((sum, a) => sum + a.lineCount, 0);

    return {
      ok: true,
      stats: {
        current: {
          filename: path.basename(logPath),
          lineCount: currentLineCount,
          size: currentSize,
          sizeKB: Math.round(currentSize / 1024),
        },
        archives: archives.sort((a, b) => b.filename.localeCompare(a.filename)),
        totals: {
          lineCount: totalLineCount,
          size: totalSize,
          sizeKB: Math.round(totalSize / 1024),
          archiveCount: archives.length,
        },
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Format log statistics for display
 *
 * @param {object} stats - Statistics object from getLogStats()
 * @returns {string} Formatted string for display
 */
function formatLogStats(stats) {
  if (!stats || !stats.current) {
    return 'No log statistics available';
  }

  const lines = [];
  const current = stats.current;
  const totals = stats.totals;

  lines.push('Bus Log Statistics');
  lines.push('─'.repeat(50));

  lines.push('');
  lines.push('Current Log:');
  lines.push(`  File: ${current.filename}`);
  lines.push(`  Lines: ${current.lineCount}`);
  lines.push(`  Size: ${current.sizeKB} KB`);

  if (totals.archiveCount > 0) {
    lines.push('');
    lines.push('Archives:');
    if (stats.archives && stats.archives.length > 0) {
      for (const archive of stats.archives) {
        lines.push(
          `  ${archive.filename}: ${archive.lineCount} lines (${Math.round(archive.size / 1024)} KB)`
        );
      }
    }

    lines.push('');
    lines.push('Totals:');
    lines.push(`  All messages: ${totals.lineCount}`);
    lines.push(`  Total size: ${totals.sizeKB} KB`);
    lines.push(`  Archive files: ${totals.archiveCount}`);
  }

  return lines.join('\n');
}

/**
 * CLI interface for bus-utils
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'count': {
      const logPath = args[1];
      if (!logPath) {
        console.log(JSON.stringify({ ok: false, error: 'Log path required' }));
        process.exit(1);
      }
      const count = getLineCount(logPath);
      console.log(JSON.stringify({ ok: true, lineCount: count }));
      break;
    }

    case 'should-rotate': {
      const logPath = args[1];
      const threshold = parseInt(args[2] || '1000', 10);
      if (!logPath) {
        console.log(JSON.stringify({ ok: false, error: 'Log path required' }));
        process.exit(1);
      }
      const shouldRotateNow = shouldRotate(logPath, threshold);
      console.log(JSON.stringify({ ok: true, shouldRotate: shouldRotateNow, threshold }));
      break;
    }

    case 'rotate': {
      const logPath = args[1];
      const keepRecent = parseInt(args[2] || '100', 10);
      if (!logPath) {
        console.log(JSON.stringify({ ok: false, error: 'Log path required' }));
        process.exit(1);
      }
      const result = rotateLog(logPath, { keepRecent });
      console.log(JSON.stringify(result));
      break;
    }

    case 'stats': {
      const logPath = args[1];
      if (!logPath) {
        console.log(JSON.stringify({ ok: false, error: 'Log path required' }));
        process.exit(1);
      }
      const result = getLogStats(logPath);
      if (result.ok) {
        console.log(formatLogStats(result.stats));
      } else {
        console.log(JSON.stringify(result));
      }
      break;
    }

    case 'ensure-archive': {
      const logPath = args[1];
      if (!logPath) {
        console.log(JSON.stringify({ ok: false, error: 'Log path required' }));
        process.exit(1);
      }
      const result = ensureArchiveDir(logPath);
      console.log(JSON.stringify(result));
      break;
    }

    case 'help':
    default:
      console.log(`
Bus Log Rotation Utility

Commands:
  count <log-path>             Get line count of log file
  should-rotate <log-path> [threshold]
                               Check if rotation is needed (default threshold: 1000)
  rotate <log-path> [keep]     Rotate log, keeping N recent lines (default: 100)
  stats <log-path>             Show log statistics (size, archives)
  ensure-archive <log-path>    Create archive directory if needed
  help                         Show this help

Examples:
  node bus-utils.js count docs/09-agents/bus/log.jsonl
  node bus-utils.js should-rotate docs/09-agents/bus/log.jsonl 1000
  node bus-utils.js rotate docs/09-agents/bus/log.jsonl 100
  node bus-utils.js stats docs/09-agents/bus/log.jsonl
`);
  }
}

// Export for use as module
module.exports = {
  // Core functions
  getLineCount,
  shouldRotate,
  rotateLog,
  ensureArchiveDir,
  getArchiveFilePath,

  // File I/O
  readJSONLFile,
  writeJSONLFile,

  // Statistics and formatting
  getLogStats,
  formatLogStats,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
