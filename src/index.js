const fs = require('fs').promises;
const path = require('path');
const CacheManager = require('./cache-manager');
const RegistryClient = require('./registry-client');
const DependencyResolver = require('./resolver');
const LinkManager = require('./link-manager');
const Analytics = require('./analytics');

class FastCache {
  constructor() {
    this.cache = new CacheManager();
    this.registry = new RegistryClient();
    this.resolver = new DependencyResolver(this.registry);
    this.linker = new LinkManager();
    this.analytics = new Analytics(this.cache.analyticsDir);
  }

  // Initialize FastCache
  async init() {
    await this.cache.init();
  }

  // Install all dependencies from package.json
  async install(projectDir = process.cwd()) {
    console.log('📦 FastCache - Installing dependencies...\n');

    const packageJsonPath = path.join(projectDir, 'package.json');
    
    // Read package.json
    let packageJson;
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(content);
    } catch (error) {
      throw new Error(`Cannot read package.json: ${error.message}`);
    }

    // Collect all dependencies
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    if (Object.keys(dependencies).length === 0) {
      console.log('No dependencies to install.');
      return;
    }

    // Resolve dependency tree
    const resolved = await this.resolver.resolve(dependencies);

    console.log('\n📥 Installing packages...\n');

    // Install each package
    let installed = 0;
    let cached = 0;

    for (const [name, info] of Object.entries(resolved)) {
      const startTime = Date.now();
      const cacheHit = await this.cache.hasPackage(name, info.version);

      if (cacheHit) {
        // Package in cache - just link it
        console.log(`  ✓ ${name}@${info.version} (cached)`);
        const cachedPath = this.cache.getPackagePath(name, info.version);
        await this.linker.linkToProject(cachedPath, projectDir, name);
        await this.cache.touchPackage(name, info.version);
        cached++;
      } else {
        // Download and cache package
        console.log(`  ↓ ${name}@${info.version} (downloading)`);
        
        const tempPath = path.join(this.cache.cacheDir, 'temp', name);
        await this.registry.downloadPackage(name, info.version, tempPath);
        
        const cachedPath = await this.cache.storePackage(name, info.version, tempPath);
        await this.linker.linkToProject(cachedPath, projectDir, name);
        
        // Clean temp
        await fs.rm(tempPath, { recursive: true, force: true });
      }

      const duration = Date.now() - startTime;
      await this.analytics.recordInstall(name, info.version, cacheHit, duration);
      installed++;
    }

    console.log(`\n✨ Installation complete!`);
    console.log(`   Installed: ${installed} packages`);
    console.log(`   From cache: ${cached} packages`);
    
    await this.showStats();
  }

  // Add a new package
  async add(packages, projectDir = process.cwd()) {
    console.log(`📦 Adding packages: ${packages.join(', ')}\n`);

    const packageJsonPath = path.join(projectDir, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }

    for (const pkg of packages) {
      // Parse package@version or just package
      const [name, version] = pkg.includes('@') && !pkg.startsWith('@')
        ? pkg.split('@')
        : [pkg, 'latest'];

      const actualVersion = version === 'latest'
        ? await this.registry.getLatestVersion(name)
        : version;

      // Add to package.json
      packageJson.dependencies[name] = `^${actualVersion}`;
      console.log(`  Added ${name}@${actualVersion} to package.json`);
    }

    // Save package.json
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n'
    );

    // Install the new packages
    console.log('');
    await this.install(projectDir);
  }

  // Show cache statistics
  async showStats() {
    const cacheStats = await this.cache.getStats();
    const analyticsReport = await this.analytics.getReport();

    console.log('\n📊 FastCache Statistics:');
    console.log(`   Cached packages: ${cacheStats.packageCount}`);
    console.log(`   Cache size: ${cacheStats.totalSizeFormatted}`);
    console.log(`   Cache hit rate: ${analyticsReport.hitRate}`);
    console.log(`   Time saved: ${analyticsReport.timeSaved}`);
    console.log(`   Bandwidth saved: ${analyticsReport.bandwidthSaved}`);
  }

  // Clean unused packages
  async clean(unusedDays = 30, dryRun = false) {
    console.log(`🧹 Finding packages unused for ${unusedDays} days...\n`);

    const toDelete = await this.cache.findUnused(unusedDays);

    if (toDelete.length === 0) {
      console.log('No packages to clean!');
      return;
    }

    let totalSize = 0;
    console.log('Packages to clean:');
    for (const pkg of toDelete) {
      console.log(`  - ${pkg.name} (${this.cache.formatBytes(pkg.size)})`);
      totalSize += pkg.size;
    }

    console.log(`\nTotal space to free: ${this.cache.formatBytes(totalSize)}`);

    if (dryRun) {
      console.log('\n(Dry run - no packages deleted)');
      return;
    }

    console.log('\nDeleting packages...');
    for (const pkg of toDelete) {
      const [name, version] = pkg.name.split('@');
      await this.cache.deletePackage(name, version);
      console.log(`  ✓ Deleted ${pkg.name}`);
    }

    console.log(`\n✨ Cleaned ${toDelete.length} packages!`);
  }

  // List all cached packages
  async list() {
    const stats = await this.cache.getStats();
    console.log(`\n📦 Cached Packages (${stats.packageCount} total):\n`);

    const packages = await fs.readdir(this.cache.storeDir);
    
    for (const pkg of packages) {
      const size = await this.cache.getDirectorySize(
        path.join(this.cache.storeDir, pkg)
      );
      console.log(`  ${pkg} (${this.cache.formatBytes(size)})`);
    }
  }
}

module.exports = FastCache;