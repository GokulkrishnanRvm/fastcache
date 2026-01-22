const fs = require('fs').promises;
const path = require('path');

class LinkManager {
  // Create a link from cached package to project
  async linkPackage(cachedPath, targetPath) {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Remove existing if present
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch {}

    try {
      // Try hard link first (most efficient)
      await this.createHardLink(cachedPath, targetPath);
      return 'hardlink';
    } catch (hardLinkError) {
      try {
        // Fallback to symbolic link
        await fs.symlink(cachedPath, targetPath, 'junction');
        return 'symlink';
      } catch (symlinkError) {
        // Final fallback: copy
        await fs.cp(cachedPath, targetPath, { recursive: true });
        return 'copy';
      }
    }
  }

  // Create hard link for each file in directory
  async createHardLink(sourcePath, targetPath) {
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      // Create target directory
      await fs.mkdir(targetPath, { recursive: true });

      // Read source directory
      const entries = await fs.readdir(sourcePath, { withFileTypes: true });

      // Link each entry
      for (const entry of entries) {
        const srcPath = path.join(sourcePath, entry.name);
        const tgtPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
          await this.createHardLink(srcPath, tgtPath);
        } else {
          try {
            await fs.link(srcPath, tgtPath);
          } catch (error) {
            // If hard link fails, copy the file
            await fs.copyFile(srcPath, tgtPath);
          }
        }
      }
    } else {
      // Single file - create hard link
      await fs.link(sourcePath, targetPath);
    }
  }

  // Link package to project's node_modules
  async linkToProject(cachedPkgPath, projectPath, packageName) {
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    const targetPath = path.join(nodeModulesPath, packageName);
    
    // Create node_modules if doesn't exist
    await fs.mkdir(nodeModulesPath, { recursive: true });
    
    // Create link
    const linkType = await this.linkPackage(cachedPkgPath, targetPath);
    
    return { targetPath, linkType };
  }

  // Check if a path is a link
  async isLink(targetPath) {
    try {
      const stats = await fs.lstat(targetPath);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }
}

module.exports = LinkManager;