class DependencyResolver {
  constructor(registryClient) {
    this.registry = registryClient;
    this.resolved = new Map();
  }

  // Resolve dependency tree
  async resolve(dependencies) {
    const tree = {};
    
    for (const [name, versionRange] of Object.entries(dependencies)) {
      await this.resolveDependency(name, versionRange, tree);
    }

    return tree;
  }

  async resolveDependency(name, versionRange, tree, depth = 0) {
    if (depth > 100) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    const cacheKey = `${name}@${versionRange}`;
    if (this.resolved.has(cacheKey)) {
      return this.resolved.get(cacheKey);
    }

    // Fetch package metadata from registry
    const metadata = await this.registry.getPackageMetadata(name);
    const version = this.selectVersion(metadata.versions, versionRange);

    if (!version) {
      throw new Error(`No matching version found for ${name}@${versionRange}`);
    }

    const pkgInfo = metadata.versions[version];
    tree[name] = { version, dependencies: pkgInfo.dependencies || {} };

    this.resolved.set(cacheKey, version);

    // Recursively resolve dependencies
    if (pkgInfo.dependencies) {
      for (const [depName, depRange] of Object.entries(pkgInfo.dependencies)) {
        await this.resolveDependency(depName, depRange, tree, depth + 1);
      }
    }

    return version;
  }

  // Simple version selection (in production, use semver library)
  selectVersion(versions, range) {
    const versionList = Object.keys(versions).sort().reverse();
    
    // Simplified: just return latest if range is '*' or 'latest'
    if (range === '*' || range === 'latest') {
      return versionList[0];
    }

    // For specific versions or ranges, you'd use semver.satisfies()
    return versionList.find(v => v === range.replace(/[^0-9.]/g, '')) || versionList[0];
  }
}