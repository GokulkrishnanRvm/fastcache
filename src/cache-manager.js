const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class CacheManager {
  constructor(cacheDir = path.join(os.homedir(), '.fastcache')) {
    this.cacheDir = cacheDir;
    this.storeDir = path.join(cacheDir, 'store');
    this.metadataDir = path.join(cacheDir, 'metadata');
    this.analyticsDir = path.join(cacheDir, 'analytics');
  }

  // Initialize cache directories
  async init() {
    await fs.mkdir(this.storeDir, { recursive: true });
    await fs.mkdir(this.metadataDir, { recursive: true });
    await fs.mkdir(this.analyticsDir, { recursive: true });
    console.log('✓ Cache initialized at:', this.cacheDir);
  }

  // Generate unique hash for package
  getPackageHash(name, version) {
    return crypto
      .createHash('sha256')
      .update(`${name}@${version}`)
      .digest('hex')
      .substring(0, 16);
  }

  // Get the cache path for a package
  getPackagePath(name, version) {
    const hash = this.getPackageHash(name, version);
    return path.join(this.storeDir, `${name}@${version}-${hash}`);
  }

  // Check if package exists in cache
  async hasPackage(name, version) {
    const pkgPath = this.getPackagePath(name, version);
    try {
      await fs.access(pkgPath);
      return true;
    } catch {
      return false;
    }
  }

  // Store package in cache
  async storePackage(name, version, sourcePath) {
    const targetPath = this.getPackagePath(name, version);
    
    // Copy package to cache
    await fs.cp(sourcePath, targetPath, { recursive: true });
    
    // Update metadata
    await this.updateMetadata(name, version, {
      installedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      size: await this.getDirectorySize(targetPath)
    });

    return targetPath;
  }

  // Update metadata for when package is used
  async touchPackage(name, version) {
    await this.updateMetadata(name, version, {
      lastUsed: new Date().toISOString()
    });
  }

  // Update package metadata
  async updateMetadata(name, version, data) {
    const metaPath = path.join(this.metadataDir, `${name}@${version}.json`);
    let metadata = {};
    
    try {
      const existing = await fs.readFile(metaPath, 'utf8');
      metadata = JSON.parse(existing);
    } catch {
      // File doesn't exist yet, that's ok
    }

    metadata = { ...metadata, ...data };
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  // Get cache statistics
  async getStats() {
    const packages = await fs.readdir(this.storeDir);
    let totalSize = 0;
    let packageCount = packages.length;

    for (const pkg of packages) {
      const pkgPath = path.join(this.storeDir, pkg);
      totalSize += await this.getDirectorySize(pkgPath);
    }

    return {
      packageCount,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      cacheDir: this.cacheDir
    };
  }

  // Find unused packages
  async findUnused(unusedDays = 30) {
    const metadata = await fs.readdir(this.metadataDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - unusedDays);

    const toDelete = [];

    for (const metaFile of metadata) {
      const metaPath = path.join(this.metadataDir, metaFile);
      const data = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      
      if (new Date(data.lastUsed) < cutoffDate) {
        const pkgName = metaFile.replace('.json', '');
        toDelete.push({
          name: pkgName,
          lastUsed: data.lastUsed,
          size: data.size || 0
        });
      }
    }

    return toDelete;
  }

  // Delete a package from cache
  async deletePackage(name, version) {
    const pkgPath = this.getPackagePath(name, version);
    const metaPath = path.join(this.metadataDir, `${name}@${version}.json`);
    
    try {
      await fs.rm(pkgPath, { recursive: true, force: true });
      await fs.rm(metaPath, { force: true });
      return true;
    } catch (error) {
      console.error(`Error deleting ${name}@${version}:`, error.message);
      return false;
    }
  }

  // Helper: Get directory size
  async getDirectorySize(dirPath) {
    let size = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch {
      // Directory might not exist
    }
    return size;
  }

  // Helper: Format bytes to human readable
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

module.exports = CacheManager;