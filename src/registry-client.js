const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const tar = require('tar');

class RegistryClient {
  constructor(registryUrl = 'https://registry.npmjs.org') {
    this.registryUrl = registryUrl;
    this.metadataCache = new Map();
  }

  // Get package metadata from npm registry
  async getPackageMetadata(packageName) {
    // Check cache first
    if (this.metadataCache.has(packageName)) {
      return this.metadataCache.get(packageName);
    }

    const url = `${this.registryUrl}/${packageName}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${packageName}: ${response.statusText}`);
      }

      const metadata = await response.json();
      this.metadataCache.set(packageName, metadata);
      
      return metadata;
    } catch (error) {
      throw new Error(`Error fetching ${packageName}: ${error.message}`);
    }
  }

  // Download and extract package tarball
  async downloadPackage(packageName, version, targetPath) {
    const metadata = await this.getPackageMetadata(packageName);
    const versionData = metadata.versions[version];
    
    if (!versionData) {
      throw new Error(`Version ${version} not found for ${packageName}`);
    }

    const tarballUrl = versionData.dist.tarball;
    const tarballPath = path.join(targetPath, '..', `${packageName}-${version}.tgz`);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(tarballPath), { recursive: true });
    await fs.mkdir(targetPath, { recursive: true });

    try {
      // Download tarball
      console.log(`  Downloading from ${tarballUrl}`);
      const response = await fetch(tarballUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Save tarball temporarily
      const fileStream = require('fs').createWriteStream(tarballPath);
      await pipeline(response.body, fileStream);

      // Extract tarball
      console.log(`  Extracting to ${targetPath}`);
      await tar.extract({
        file: tarballPath,
        cwd: targetPath,
        strip: 1 // Remove the 'package' directory wrapper
      });

      // Clean up tarball
      await fs.unlink(tarballPath);

      return targetPath;
    } catch (error) {
      // Clean up on error
      try {
        await fs.unlink(tarballPath);
      } catch {}
      throw new Error(`Failed to download ${packageName}@${version}: ${error.message}`);
    }
  }

  // Get latest version of a package
  async getLatestVersion(packageName) {
    const metadata = await this.getPackageMetadata(packageName);
    return metadata['dist-tags']?.latest || Object.keys(metadata.versions).pop();
  }
}

module.exports = RegistryClient;