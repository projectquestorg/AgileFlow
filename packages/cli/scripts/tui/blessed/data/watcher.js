'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

/**
 * DataWatcher - watches status.json and log files for changes
 * Triggers refresh callback when data updates
 */
class DataWatcher {
  constructor(state, onUpdate) {
    this.state = state;
    this.onUpdate = onUpdate;
    this.watcher = null;
    this.cwd = process.cwd();

    // Paths to watch
    this.statusPath = path.join(this.cwd, 'docs/09-agents/status.json');
    this.logPath = path.join(this.cwd, 'docs/09-agents/bus/log.jsonl');
    this.sessionStatePath = path.join(this.cwd, '.agileflow/session-state.json');
  }

  start() {
    // Initial load
    this.loadStatus();
    this.loadLogs();
    this.loadSessionState();

    // Set up file watcher
    const watchPaths = [this.statusPath, this.logPath, this.sessionStatePath].filter(p => {
      const dir = path.dirname(p);
      return fs.existsSync(dir);
    });

    if (watchPaths.length === 0) {
      // No paths to watch yet, check periodically
      this.pollInterval = setInterval(() => {
        this.loadStatus();
        this.loadLogs();
        this.loadSessionState();
        this.onUpdate();
      }, 2000);
      return;
    }

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    this.watcher.on('change', filePath => {
      if (filePath.endsWith('status.json')) {
        this.loadStatus();
      } else if (filePath.endsWith('log.jsonl')) {
        this.loadLogs();
      } else if (filePath.endsWith('session-state.json')) {
        this.loadSessionState();
      }
      this.onUpdate();
    });

    this.watcher.on('error', err => {
      // Silently handle watcher errors
    });
  }

  loadStatus() {
    try {
      if (fs.existsSync(this.statusPath)) {
        const content = fs.readFileSync(this.statusPath, 'utf8');
        const data = JSON.parse(content);

        // Extract stories with in_progress status as "sessions"
        const stories = data.stories || [];
        this.state.sessions = stories
          .filter(s => s.status === 'in_progress')
          .map((s, i) => ({
            id: `S-${i + 1}`,
            story: s.id || s.title || 'Unknown',
            status: 'active',
            duration: this.formatDuration(s.started_at),
            progress: s.progress || '--'
          }));

        // If no active stories, show all stories summary
        if (this.state.sessions.length === 0) {
          const ready = stories.filter(s => s.status === 'ready').length;
          const completed = stories.filter(s => s.status === 'completed').length;
          this.state.sessions = [{
            id: '--',
            story: `${ready} ready, ${completed} completed`,
            status: 'idle',
            duration: '--',
            progress: '--'
          }];
        }
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  loadLogs() {
    try {
      if (fs.existsSync(this.logPath)) {
        const content = fs.readFileSync(this.logPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        // Take last 100 lines
        this.state.logs = lines.slice(-100).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line, level: 'info' };
          }
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  loadSessionState() {
    try {
      if (fs.existsSync(this.sessionStatePath)) {
        const content = fs.readFileSync(this.sessionStatePath, 'utf8');
        const data = JSON.parse(content);

        // Extract traces from active commands
        if (data.active_commands) {
          this.state.traces = data.active_commands.map((cmd, i) => ({
            action: cmd.command || cmd,
            status: 'running',
            duration: '--',
            details: cmd.args || ''
          }));
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  formatDuration(startedAt) {
    if (!startedAt) return '--';
    try {
      const start = new Date(startedAt);
      const now = new Date();
      const diff = Math.floor((now - start) / 1000);

      if (diff < 60) return `${diff}s`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m`;
      return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    } catch {
      return '--';
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}

module.exports = DataWatcher;
