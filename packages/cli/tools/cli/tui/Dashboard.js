/**
 * Dashboard Component
 *
 * BETA - Main TUI dashboard view
 */

const path = require('path');
const fs = require('fs');

class Dashboard {
  constructor(options = {}) {
    this.statusPath =
      options.statusPath || path.join(process.cwd(), 'docs', '09-agents', 'status.json');
    this.data = null;
  }

  async load() {
    if (!fs.existsSync(this.statusPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(this.statusPath, 'utf8');
      this.data = JSON.parse(content);
      return true;
    } catch (err) {
      return false;
    }
  }

  getStories() {
    if (!this.data) return [];
    return Object.values(this.data).filter(s => s && typeof s === 'object' && (s.id || s.story_id));
  }

  getStats() {
    const stories = this.getStories();
    return {
      total: stories.length,
      in_progress: stories.filter(s => ['in_progress', 'in-progress'].includes(s.status)).length,
      blocked: stories.filter(s => s.status === 'blocked').length,
      ready: stories.filter(s => s.status === 'ready').length,
      completed: stories.filter(s => ['completed', 'done'].includes(s.status)).length,
    };
  }

  getCompletionPercentage() {
    const stats = this.getStats();
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }

  getStoriesByStatus(status) {
    const stories = this.getStories();
    if (status === 'in_progress') {
      return stories.filter(s => ['in_progress', 'in-progress'].includes(s.status));
    }
    if (status === 'completed') {
      return stories.filter(s => ['completed', 'done'].includes(s.status));
    }
    return stories.filter(s => s.status === status);
  }
}

module.exports = Dashboard;
