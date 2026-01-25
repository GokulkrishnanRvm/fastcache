const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const tar = require('tar');
const crypto = require('crypto');

class RegistryClient {
  constructor(registryUrl = 'https://registry.npmjs.org') {
    this.registryUrl = registryUrl;
    this.metadataCache = new Map();
    // Track in-progress downloads to prevent duplicate concurrent downloads
    this.activeDownloads = new Map();
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

  // Download and extract package tarball with concurrency protection
  async downloadPackage(packageName, version, targetPath) {
    const downloadKey = `${packageName}@${version}:${targetPath}`;
    
    // If this exact download is already in progress, wait for it
    if (this.activeDownloads.has(downloadKey)) {
      return this.activeDownloads.get(downloadKey);
    }

    // Create the download promise
    const downloadPromise = this._performDownload(packageName, version, targetPath);
    
    // Track it to prevent duplicate downloads
    this.activeDownloads.set(downloadKey, downloadPromise);
    
    try {
      const result = await downloadPromise;
      return result;
    } finally {
      // Clean up tracking
      this.activeDownloads.delete(downloadKey);
    }
  }

  async _performDownload(packageName, version, targetPath) {
    const metadata = await this.getPackageMetadata(packageName);
    const versionData = metadata.versions[version];
    
    if (!versionData) {
      throw new Error(`Version ${version} not found for ${packageName}`);
    }

    const tarballUrl = versionData.dist.tarball;
    
    // Create unique temp directory using random suffix to avoid conflicts
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const tempDir = path.join(path.dirname(targetPath), `temp-${packageName}-${version}-${uniqueSuffix}`);
    const tarballPath = path.join(tempDir, `${packageName}-${version}.tgz`);
    
    // Ensure directories exist
    await fs.mkdir(tempDir, { recursive: true });
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

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return targetPath;
    } catch (error) {
      // Clean up on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
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