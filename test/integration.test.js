const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const FastCache = require('../src/index');

describe('FastCache Integration Tests', () => {
  let fastcache;
  let testProjectDir;
  let testCacheDir;

  beforeEach(async () => {
    // Create temporary directories
    testProjectDir = path.join(os.tmpdir(), 'fastcache-test-project-' + Date.now());
    testCacheDir = path.join(os.tmpdir(), 'fastcache-test-cache-' + Date.now());

    await fs.mkdir(testProjectDir, { recursive: true });

    // Create FastCache instance with test cache directory
    fastcache = new FastCache();
    fastcache.cache.cacheDir = testCacheDir;
    fastcache.cache.storeDir = path.join(testCacheDir, 'store');
    fastcache.cache.metadataDir = path.join(testCacheDir, 'metadata');
    fastcache.cache.analyticsDir = path.join(testCacheDir, 'analytics');
    fastcache.analytics = new (require('../src/analytics'))(fastcache.cache.analyticsDir);

    await fastcache.init();
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Full Installation Flow', () => {
    test('should install simple package from package.json', async () => {
      // Create package.json with a simple dependency
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'is-odd': '^3.0.1'  // Small package with minimal dependencies
        }
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Install dependencies
      await fastcache.install(testProjectDir);

      // Verify node_modules was created
      const nodeModulesExists = await fs.access(
        path.join(testProjectDir, 'node_modules')
      ).then(() => true).catch(() => false);

      expect(nodeModulesExists).toBe(true);

      // Verify package was installed
      const pkgExists = await fs.access(
        path.join(testProjectDir, 'node_modules', 'is-odd')
      ).then(() => true).catch(() => false);

      expect(pkgExists).toBe(true);
    }, 30000); // Increase timeout for network request

    test('should use cache on second install', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'is-odd': '^3.0.1'
        }
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // First install
      await fastcache.install(testProjectDir);

      // Get initial analytics
      const report1 = await fastcache.analytics.getReport();
      const cacheHits1 = report1.cacheHits;

      // Create second project
      const testProjectDir2 = path.join(os.tmpdir(), 'fastcache-test-project-2-' + Date.now());
      await fs.mkdir(testProjectDir2, { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectDir2, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Second install (should use cache)
      await fastcache.install(testProjectDir2);

      // Check analytics
      const report2 = await fastcache.analytics.getReport();
      
      expect(report2.cacheHits).toBeGreaterThan(cacheHits1);

      // Clean up
      await fs.rm(testProjectDir2, { recursive: true, force: true });
    }, 60000);
  });

  describe('Package Addition', () => {
    test('should add package to package.json and install', async () => {
      // Create minimal package.json
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {}
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Add package
      await fastcache.add(['is-odd'], testProjectDir);

      // Verify package.json was updated
      const updatedPkg = JSON.parse(
        await fs.readFile(path.join(testProjectDir, 'package.json'), 'utf8')
      );

      expect(updatedPkg.dependencies).toHaveProperty('is-odd');

      // Verify package was installed
      const pkgExists = await fs.access(
        path.join(testProjectDir, 'node_modules', 'is-odd')
      ).then(() => true).catch(() => false);

      expect(pkgExists).toBe(true);
    }, 30000);

    test('should add multiple packages at once', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {}
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      await fastcache.add(['is-odd', 'is-even'], testProjectDir);

      const updatedPkg = JSON.parse(
        await fs.readFile(path.join(testProjectDir, 'package.json'), 'utf8')
      );

      expect(updatedPkg.dependencies).toHaveProperty('is-odd');
      expect(updatedPkg.dependencies).toHaveProperty('is-even');
    }, 30000);
  });

  describe('Cache Statistics', () => {
    test('should track cache statistics', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'is-odd': '^3.0.1'
        }
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      await fastcache.install(testProjectDir);

      const stats = await fastcache.cache.getStats();

      expect(stats.packageCount).toBeGreaterThan(0);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.totalSizeFormatted).toBeDefined();
    }, 30000);

    test('should track analytics correctly', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'is-odd': '^3.0.1'
        }
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      await fastcache.install(testProjectDir);

      const report = await fastcache.analytics.getReport();

      expect(report.totalInstalls).toBeGreaterThan(0);
      expect(report).toHaveProperty('cacheHits');
      expect(report).toHaveProperty('cacheMisses');
      expect(report).toHaveProperty('hitRate');
    }, 30000);
  });

  describe('Cache Cleanup', () => {
    test('should identify unused packages', async () => {
      // Create a package with old metadata
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      await fastcache.cache.updateMetadata('old-package', '1.0.0', {
        lastUsed: oldDate.toISOString(),
        size: 1000
      });

      const toDelete = await fastcache.cache.findUnused(30);

      expect(toDelete.length).toBeGreaterThan(0);
      expect(toDelete[0].name).toBe('old-package@1.0.0');
    });

    test('should clean unused packages', async () => {
      // Create old package
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      const pkgPath = fastcache.cache.getPackagePath('old-package', '1.0.0');
      await fs.mkdir(pkgPath, { recursive: true });
      await fs.writeFile(path.join(pkgPath, 'test.txt'), 'content');

      await fastcache.cache.updateMetadata('old-package', '1.0.0', {
        lastUsed: oldDate.toISOString(),
        size: 100
      });

      // Clean packages
      await fastcache.clean(30, false);

      // Verify package was deleted
      const pkgExists = await fs.access(pkgPath)
        .then(() => true)
        .catch(() => false);

      expect(pkgExists).toBe(false);
    });

    test('should not delete anything in dry-run mode', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      const pkgPath = fastcache.cache.getPackagePath('old-package', '1.0.0');
      await fs.mkdir(pkgPath, { recursive: true });
      await fs.writeFile(path.join(pkgPath, 'test.txt'), 'content');

      await fastcache.cache.updateMetadata('old-package', '1.0.0', {
        lastUsed: oldDate.toISOString(),
        size: 100
      });

      // Dry run
      await fastcache.clean(30, true);

      // Verify package still exists
      const pkgExists = await fs.access(pkgPath)
        .then(() => true)
        .catch(() => false);

      expect(pkgExists).toBe(true);
    });
  });

  describe('List Packages', () => {
    test('should list all cached packages', async () => {
      // Create some mock packages
      const pkg1Path = fastcache.cache.getPackagePath('pkg1', '1.0.0');
      const pkg2Path = fastcache.cache.getPackagePath('pkg2', '2.0.0');

      await fs.mkdir(pkg1Path, { recursive: true });
      await fs.mkdir(pkg2Path, { recursive: true });

      await fs.writeFile(path.join(pkg1Path, 'test.txt'), 'content1');
      await fs.writeFile(path.join(pkg2Path, 'test.txt'), 'content2');

      // This should not throw
      await expect(fastcache.list()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing package.json', async () => {
      await expect(
        fastcache.install(testProjectDir)
      ).rejects.toThrow('Cannot read package.json');
    });

    test('should handle invalid package.json', async () => {
      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        'invalid json {'
      );

      await expect(
        fastcache.install(testProjectDir)
      ).rejects.toThrow();
    });

    test('should handle empty dependencies', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0'
      };

      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Should complete without error
      await expect(
        fastcache.install(testProjectDir)
      ).resolves.not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent installations', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'is-odd': '^3.0.1'
        }
      };

      // Create two projects
      await fs.writeFile(
        path.join(testProjectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const testProjectDir2 = path.join(os.tmpdir(), 'fastcache-test-project-2-' + Date.now());
      await fs.mkdir(testProjectDir2, { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectDir2, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Install concurrently
      await Promise.all([
        fastcache.install(testProjectDir),
        fastcache.install(testProjectDir2)
      ]);

      // Both should have node_modules
      const exists1 = await fs.access(
        path.join(testProjectDir, 'node_modules')
      ).then(() => true).catch(() => false);

      const exists2 = await fs.access(
        path.join(testProjectDir2, 'node_modules')
      ).then(() => true).catch(() => false);

      expect(exists1).toBe(true);
      expect(exists2).toBe(true);

      // Clean up
      await fs.rm(testProjectDir2, { recursive: true, force: true });
    }, 60000);
  });
});