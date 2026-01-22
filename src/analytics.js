const fs = require('fs').promises;
const path = require('path');

class Analytics {
  constructor(analyticsDir) {
    this.analyticsDir = analyticsDir;
    this.statsFile = path.join(analyticsDir, 'stats.json');
  }

  // Record an installation
  async recordInstall(packageName, version, cacheHit, duration, size = 0) {
    const stats = await this.loadStats();
    
    if (!stats.installs) stats.installs = [];
    
    stats.installs.push({
      package: `${packageName}@${version}`,
      cacheHit,
      duration,
      size,
      timestamp: new Date().toISOString()
    });

    // Update counters
    if (cacheHit) {
      stats.cacheHits = (stats.cacheHits || 0) + 1;
      stats.timeSaved = (stats.timeSaved || 0) + (duration * 5); // Estimate 5x slower without cache
      stats.bandwidthSaved = (stats.bandwidthSaved || 0) + size;
    } else {
      stats.cacheMisses = (stats.cacheMisses || 0) + 1;
      stats.totalDownloaded = (stats.totalDownloaded || 0) + size;
    }

    await this.saveStats(stats);
  }

  // Get analytics report
  async getReport() {
    const stats = await this.loadStats();
    const totalInstalls = (stats.cacheHits || 0) + (stats.cacheMisses || 0);
    const hitRate = totalInstalls > 0 
      ? ((stats.cacheHits / totalInstalls) * 100).toFixed(2) 
      : 0;

    return {
      totalInstalls,
      cacheHits: stats.cacheHits || 0,
      cacheMisses: stats.cacheMisses || 0,
      hitRate: `${hitRate}%`,
      timeSaved: `${((stats.timeSaved || 0) / 1000 / 60).toFixed(2)} minutes`,
      bandwidthSaved: this.formatBytes(stats.bandwidthSaved || 0),
      totalDownloaded: this.formatBytes(stats.totalDownloaded || 0)
    };
  }

  // Reset analytics
  async reset() {
    await this.saveStats({});
  }

  // Load stats from file
  async loadStats() {
    try {
      const data = await fs.readFile(this.statsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  // Save stats to file
  async saveStats(stats) {
    await fs.writeFile(this.statsFile, JSON.stringify(stats, null, 2));
  }

  // Helper: Format bytes
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

module.exports = Analytics;