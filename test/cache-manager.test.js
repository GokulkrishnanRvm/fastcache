const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const CacheManager = require('../src/cache-manager');

describe('CacheManager', () => {
  let cacheManager;
  let testCacheDir;

  beforeEach(async () => {
    // Create a temporary cache directory for testing
    testCacheDir = path.join(os.tmpdir(), 'fastcache-test-' + Date.now());
    cacheManager = new CacheManager(testCacheDir);
    await cacheManager.init();
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('init()', () => {
    test('should create cache directories', async () => {
      const storeExists = await fs.access(cacheManager.storeDir)
        .then(() => true)
        .catch(() => false);
      const metadataExists = await fs.access(cacheManager.metadataDir)
        .then(() => true)
        .catch(() => false);
      const analyticsExists = await fs.access(cacheManager.analyticsDir)
        .then(() => true)
        .catch(() => false);

      expect(storeExists).toBe(true);
      expect(metadataExists).toBe(true);
      expect(analyticsExists).toBe(true);
    });
  });

  describe('getPackageHash()', () => {
    test('should generate consistent hash for same package', () => {
      const hash1 = cacheManager.getPackageHash('lodash', '4.17.21');
      const hash2 = cacheManager.getPackageHash('lodash', '4.17.21');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    test('should generate different hash for different packages', () => {
      const hash1 = cacheManager.getPackageHash('lodash', '4.17.21');
      const hash2 = cacheManager.getPackageHash('express', '4.18.2');
      
      expect(hash1).not.toBe(hash2);
    });

    test('should generate different hash for different versions', () => {
      const hash1 = cacheManager.getPackageHash('lodash', '4.17.21');
      const hash2 = cacheManager.getPackageHash('lodash', '4.17.20');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getPackagePath()', () => {
    test('should return valid path in store directory', () => {
      const pkgPath = cacheManager.getPackagePath('lodash', '4.17.21');
      
      expect(pkgPath).toContain(cacheManager.storeDir);
      expect(pkgPath).toContain('lodash@4.17.21');
    });

    test('should include hash in path', () => {
      const pkgPath = cacheManager.getPackagePath('lodash', '4.17.21');
      const hash = cacheManager.getPackageHash('lodash', '4.17.21');
      
      expect(pkgPath).toContain(hash);
    });
  });

  describe('hasPackage()', () => {
    test('should return false for non-existent package', async () => {
      const exists = await cacheManager.hasPackage('lodash', '4.17.21');
      
      expect(exists).toBe(false);
    });

    test('should return true for existing package', async () => {
      // Create a mock package directory
      const pkgPath = cacheManager.getPackagePath('lodash', '4.17.21');
      await fs.mkdir(pkgPath, { recursive: true });
      await fs.writeFile(path.join(pkgPath, 'package.json'), '{}');

      const exists = await cacheManager.hasPackage('lodash', '4.17.21');
      
      expect(exists).toBe(true);
    });
  });

  describe('storePackage()', () => {
    test('should copy package to cache', async () => {
      // Create a temporary source package
      const tempPkgDir = path.join(os.tmpdir(), 'test-pkg-' + Date.now());
      await fs.mkdir(tempPkgDir, { recursive: true });
      await fs.writeFile(
        path.join(tempPkgDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      await fs.writeFile(path.join(tempPkgDir, 'index.js'), 'module.exports = {};');

      // Store package
      const cachedPath = await cacheManager.storePackage('test-pkg', '1.0.0', tempPkgDir);

      // Verify package was copied
      const pkgJsonExists = await fs.access(path.join(cachedPath, 'package.json'))
        .then(() => true)
        .catch(() => false);
      const indexExists = await fs.access(path.join(cachedPath, 'index.js'))
        .then(() => true)
        .catch(() => false);

      expect(pkgJsonExists).toBe(true);
      expect(indexExists).toBe(true);

      // Clean up
      await fs.rm(tempPkgDir, { recursive: true, force: true });
    });

    test('should create metadata for stored package', async () => {
      const tempPkgDir = path.join(os.tmpdir(), 'test-pkg-' + Date.now());
      await fs.mkdir(tempPkgDir, { recursive: true });
      await fs.writeFile(path.join(tempPkgDir, 'test.txt'), 'test content');

      await cacheManager.storePackage('test-pkg', '1.0.0', tempPkgDir);

      // Check metadata
      const metaPath = path.join(cacheManager.metadataDir, 'test-pkg@1.0.0.json');
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
      
      expect(metaExists).toBe(true);

      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      expect(metadata).toHaveProperty('installedAt');
      expect(metadata).toHaveProperty('lastUsed');
      expect(metadata).toHaveProperty('size');

      // Clean up
      await fs.rm(tempPkgDir, { recursive: true, force: true });
    });
  });

  describe('touchPackage()', () => {
    test('should update lastUsed timestamp', async () => {
      // Create initial metadata
      await cacheManager.updateMetadata('test-pkg', '1.0.0', {
        installedAt: '2024-01-01T00:00:00.000Z',
        lastUsed: '2024-01-01T00:00:00.000Z'
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Touch package
      await cacheManager.touchPackage('test-pkg', '1.0.0');

      // Verify lastUsed was updated
      const metaPath = path.join(cacheManager.metadataDir, 'test-pkg@1.0.0.json');
      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));

      expect(new Date(metadata.lastUsed).getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00.000Z').getTime()
      );
    });
  });

  describe('updateMetadata()', () => {
    test('should create new metadata file', async () => {
      await cacheManager.updateMetadata('new-pkg', '1.0.0', {
        testField: 'testValue'
      });

      const metaPath = path.join(cacheManager.metadataDir, 'new-pkg@1.0.0.json');
      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));

      expect(metadata.testField).toBe('testValue');
    });

    test('should merge with existing metadata', async () => {
      await cacheManager.updateMetadata('merge-pkg', '1.0.0', {
        field1: 'value1'
      });

      await cacheManager.updateMetadata('merge-pkg', '1.0.0', {
        field2: 'value2'
      });

      const metaPath = path.join(cacheManager.metadataDir, 'merge-pkg@1.0.0.json');
      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));

      expect(metadata.field1).toBe('value1');
      expect(metadata.field2).toBe('value2');
    });
  });

  describe('getStats()', () => {
    test('should return zero stats for empty cache', async () => {
      const stats = await cacheManager.getStats();

      expect(stats.packageCount).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.cacheDir).toBe(testCacheDir);
    });

    test('should count packages and calculate size', async () => {
      // Create mock packages
      const pkg1Path = cacheManager.getPackagePath('pkg1', '1.0.0');
      const pkg2Path = cacheManager.getPackagePath('pkg2', '2.0.0');
      
      await fs.mkdir(pkg1Path, { recursive: true });
      await fs.mkdir(pkg2Path, { recursive: true });
      
      await fs.writeFile(path.join(pkg1Path, 'file.txt'), 'content1');
      await fs.writeFile(path.join(pkg2Path, 'file.txt'), 'content2');

      const stats = await cacheManager.getStats();

      expect(stats.packageCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.totalSizeFormatted).toMatch(/\d+(\.\d+)?\s(B|KB|MB|GB)/);
    });
  });

  describe('findUnused()', () => {
    test('should find packages not used for specified days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      // Create old package metadata
      await cacheManager.updateMetadata('old-pkg', '1.0.0', {
        lastUsed: oldDate.toISOString(),
        size: 1000
      });

      // Create recent package metadata
      await cacheManager.updateMetadata('recent-pkg', '1.0.0', {
        lastUsed: new Date().toISOString(),
        size: 2000
      });

      const unused = await cacheManager.findUnused(30);

      expect(unused.length).toBe(1);
      expect(unused[0].name).toBe('old-pkg@1.0.0');
    });

    test('should return empty array when all packages are recent', async () => {
      await cacheManager.updateMetadata('recent-pkg', '1.0.0', {
        lastUsed: new Date().toISOString(),
        size: 1000
      });

      const unused = await cacheManager.findUnused(30);

      expect(unused.length).toBe(0);
    });
  });

  describe('deletePackage()', () => {
    test('should delete package and metadata', async () => {
      // Create package
      const pkgPath = cacheManager.getPackagePath('delete-pkg', '1.0.0');
      await fs.mkdir(pkgPath, { recursive: true });
      await fs.writeFile(path.join(pkgPath, 'test.txt'), 'content');
      
      // Create metadata
      await cacheManager.updateMetadata('delete-pkg', '1.0.0', {
        testField: 'test'
      });

      // Delete package
      const result = await cacheManager.deletePackage('delete-pkg', '1.0.0');

      expect(result).toBe(true);

      // Verify deletion
      const pkgExists = await fs.access(pkgPath).then(() => true).catch(() => false);
      const metaPath = path.join(cacheManager.metadataDir, 'delete-pkg@1.0.0.json');
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);

      expect(pkgExists).toBe(false);
      expect(metaExists).toBe(false);
    });
  });

  describe('formatBytes()', () => {
    test('should format bytes correctly', () => {
      expect(cacheManager.formatBytes(500)).toBe('500.00 B');
      expect(cacheManager.formatBytes(1024)).toBe('1.00 KB');
      expect(cacheManager.formatBytes(1048576)).toBe('1.00 MB');
      expect(cacheManager.formatBytes(1073741824)).toBe('1.00 GB');
    });

    test('should handle decimal values', () => {
      expect(cacheManager.formatBytes(1536)).toBe('1.50 KB');
      expect(cacheManager.formatBytes(2621440)).toBe('2.50 MB');
    });
  });

  describe('getDirectorySize()', () => {
    test('should calculate directory size including subdirectories', async () => {
      const testDir = path.join(testCacheDir, 'size-test');
      await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
      
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'a'.repeat(100));
      await fs.writeFile(path.join(testDir, 'subdir', 'file2.txt'), 'b'.repeat(200));

      const size = await cacheManager.getDirectorySize(testDir);

      expect(size).toBe(300);
    });

    test('should return 0 for non-existent directory', async () => {
      const size = await cacheManager.getDirectorySize('/non/existent/path');

      expect(size).toBe(0);
    });
  });
});