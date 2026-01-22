const semver = require('semver');

class DependencyResolver {
  constructor(registryClient) {
    this.registry = registryClient;
    this.resolved = new Map();
  }

  // Resolve all dependencies into a flat tree
  async resolve(dependencies) {
    const tree = {};
    
    console.log('🔍 Resolving dependencies...');
    
    for (const [name, versionRange] of Object.entries(dependencies)) {
      await this.resolveDependency(name, versionRange, tree);
    }

    return tree;
  }

  // Recursively resolve a single dependency
  async resolveDependency(name, versionRange, tree, depth = 0) {
    // Prevent infinite loops
    if (depth > 100) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    // Check if already resolved
    const cacheKey = `${name}@${versionRange}`;
    if (this.resolved.has(cacheKey)) {
      const resolvedVersion = this.resolved.get(cacheKey);
      if (!tree[name]) {
        tree[name] = { version: resolvedVersion, dependencies: {} };
      }
      return resolvedVersion;
    }

    // Skip if already in tree with compatible version
    if (tree[name]) {
      if (semver.satisfies(tree[name].version, versionRange)) {
        return tree[name].version;
      }
    }

    try {
      // Fetch package metadata
      const metadata = await this.registry.getPackageMetadata(name);
      const version = this.selectVersion(metadata.versions, versionRange);

      if (!version) {
        throw new Error(`No matching version found for ${name}@${versionRange}`);
      }

      const pkgInfo = metadata.versions[version];
      
      // Store in tree
      tree[name] = {
        version,
        dependencies: pkgInfo.dependencies || {}
      };

      // Cache the resolution
      this.resolved.set(cacheKey, version);

      console.log(`  ✓ ${name}@${version}`);

      // Recursively resolve sub-dependencies
      if (pkgInfo.dependencies) {
        for (const [depName, depRange] of Object.entries(pkgInfo.dependencies)) {
          await this.resolveDependency(depName, depRange, tree, depth + 1);
        }
      }

      return version;
    } catch (error) {
      console.error(`  ✗ Failed to resolve ${name}@${versionRange}:`, error.message);
      throw error;
    }
  }

  // Select best version that matches the range
  selectVersion(versions, range) {
    const versionList = Object.keys(versions);
    
    // Handle special cases
    if (range === '*' || range === 'latest') {
      return semver.maxSatisfying(versionList, '*');
    }

    // Find the best matching version
    const matched = semver.maxSatisfying(versionList, range);
    
    if (!matched) {
      // Fallback: try without semver (for git URLs, etc)
      const cleanRange = range.replace(/[^0-9.]/g, '');
      if (versionList.includes(cleanRange)) {
        return cleanRange;
      }
    }

    return matched;
  }
}

module.exports = DependencyResolver;