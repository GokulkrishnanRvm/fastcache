const DependencyResolver = require('../src/resolver');

// Mock RegistryClient
class MockRegistryClient {
  constructor(mockData = {}) {
    this.mockData = mockData;
  }

  async getPackageMetadata(packageName) {
    if (this.mockData[packageName]) {
      return this.mockData[packageName];
    }
    
    // Default mock data for common packages
    const defaultMocks = {
      'lodash': {
        name: 'lodash',
        versions: {
          '4.17.21': {
            version: '4.17.21',
            dependencies: {}
          },
          '4.17.20': {
            version: '4.17.20',
            dependencies: {}
          }
        }
      },
      'express': {
        name: 'express',
        versions: {
          '4.18.2': {
            version: '4.18.2',
            dependencies: {
              'body-parser': '^1.20.0',
              'cookie': '^0.5.0'
            }
          }
        }
      },
      'body-parser': {
        name: 'body-parser',
        versions: {
          '1.20.0': {
            version: '1.20.0',
            dependencies: {}
          },
          '1.20.1': {
            version: '1.20.1',
            dependencies: {}
          }
        }
      },
      'cookie': {
        name: 'cookie',
        versions: {
          '0.5.0': {
            version: '0.5.0',
            dependencies: {}
          }
        }
      }
    };

    return defaultMocks[packageName] || {
      name: packageName,
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dependencies: {}
        }
      }
    };
  }
}

describe('DependencyResolver', () => {
  let resolver;
  let mockRegistry;

  beforeEach(() => {
    mockRegistry = new MockRegistryClient();
    resolver = new DependencyResolver(mockRegistry);
  });

  describe('resolve()', () => {
    test('should resolve single dependency', async () => {
      const dependencies = {
        'lodash': '^4.17.21'
      };

      const tree = await resolver.resolve(dependencies);

      expect(tree).toHaveProperty('lodash');
      expect(tree.lodash.version).toBe('4.17.21');
    });

    test('should resolve multiple dependencies', async () => {
      const dependencies = {
        'lodash': '^4.17.21',
        'express': '^4.18.2'
      };

      const tree = await resolver.resolve(dependencies);

      expect(tree).toHaveProperty('lodash');
      expect(tree).toHaveProperty('express');
      expect(tree.lodash.version).toBe('4.17.21');
      expect(tree.express.version).toBe('4.18.2');
    });

    test('should resolve nested dependencies', async () => {
      const dependencies = {
        'express': '^4.18.2'
      };

      const tree = await resolver.resolve(dependencies);

      expect(tree).toHaveProperty('express');
      expect(tree).toHaveProperty('body-parser');
      expect(tree).toHaveProperty('cookie');
    });

    test('should handle empty dependencies', async () => {
      const tree = await resolver.resolve({});

      expect(Object.keys(tree).length).toBe(0);
    });
  });

  describe('resolveDependency()', () => {
    test('should resolve single package', async () => {
      const tree = {};
      const version = await resolver.resolveDependency('lodash', '^4.17.21', tree);

      expect(version).toBe('4.17.21');
      expect(tree.lodash).toBeDefined();
      expect(tree.lodash.version).toBe('4.17.21');
    });

    test('should use cached resolution', async () => {
      const tree = {};
      
      // First resolution
      await resolver.resolveDependency('lodash', '^4.17.21', tree);
      
      // Second resolution should use cache
      const version = await resolver.resolveDependency('lodash', '^4.17.21', tree);

      expect(version).toBe('4.17.21');
      expect(resolver.resolved.size).toBeGreaterThan(0);
    });

    test('should resolve nested dependencies recursively', async () => {
      const tree = {};
      await resolver.resolveDependency('express', '^4.18.2', tree);

      expect(tree.express).toBeDefined();
      expect(tree['body-parser']).toBeDefined();
      expect(tree.cookie).toBeDefined();
    });

    test('should prevent circular dependencies', async () => {
      // Create circular dependency mock
      const circularMock = new MockRegistryClient({
        'pkg-a': {
          name: 'pkg-a',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'pkg-b': '^1.0.0'
              }
            }
          }
        },
        'pkg-b': {
          name: 'pkg-b',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'pkg-a': '^1.0.0'
              }
            }
          }
        }
      });

      const circularResolver = new DependencyResolver(circularMock);
      const tree = {};

      // Should throw error after max depth
      await expect(
        circularResolver.resolveDependency('pkg-a', '^1.0.0', tree, 101)
      ).rejects.toThrow('Circular dependency detected');
    });

    test('should handle non-existent package', async () => {
      const emptyMock = new MockRegistryClient({
        'non-existent': {
          name: 'non-existent',
          versions: {}
        }
      });

      const testResolver = new DependencyResolver(emptyMock);
      const tree = {};

      await expect(
        testResolver.resolveDependency('non-existent', '^1.0.0', tree)
      ).rejects.toThrow('No matching version found');
    });
  });

  describe('selectVersion()', () => {
    test('should select latest version for * range', () => {
      const versions = {
        '1.0.0': {},
        '2.0.0': {},
        '3.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '*');

      expect(selected).toBe('3.0.0');
    });

    test('should select latest version for "latest" range', () => {
      const versions = {
        '1.0.0': {},
        '2.0.0': {},
        '1.5.0': {}
      };

      const selected = resolver.selectVersion(versions, 'latest');

      expect(selected).toBe('2.0.0');
    });

    test('should select compatible version for caret range', () => {
      const versions = {
        '4.17.19': {},
        '4.17.20': {},
        '4.17.21': {},
        '5.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '^4.17.20');

      // Should select highest compatible version (4.17.21, not 5.0.0)
      expect(selected).toBe('4.17.21');
    });

    test('should select compatible version for tilde range', () => {
      const versions = {
        '1.2.3': {},
        '1.2.4': {},
        '1.3.0': {},
        '2.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '~1.2.3');

      // Should select 1.2.4 (not 1.3.0 or 2.0.0)
      expect(selected).toBe('1.2.4');
    });

    test('should select exact version', () => {
      const versions = {
        '1.0.0': {},
        '2.0.0': {},
        '3.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '2.0.0');

      expect(selected).toBe('2.0.0');
    });

    test('should handle version not found', () => {
      const versions = {
        '1.0.0': {},
        '2.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '^5.0.0');

      // Should return null when no matching version
      expect(selected).toBeNull();
    });

    test('should handle greater than or equal', () => {
      const versions = {
        '1.0.0': {},
        '2.0.0': {},
        '3.0.0': {}
      };

      const selected = resolver.selectVersion(versions, '>=2.0.0');

      expect(selected).toBe('3.0.0');
    });
  });

  describe('complex scenarios', () => {
    test('should handle multiple packages with shared dependencies', async () => {
      // Mock packages that share a common dependency
      const sharedMock = new MockRegistryClient({
        'pkg-a': {
          name: 'pkg-a',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'shared-dep': '^1.0.0'
              }
            }
          }
        },
        'pkg-b': {
          name: 'pkg-b',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'shared-dep': '^1.0.0'
              }
            }
          }
        },
        'shared-dep': {
          name: 'shared-dep',
          versions: {
            '1.0.0': {},
            '1.1.0': {}
          }
        }
      });

      const sharedResolver = new DependencyResolver(sharedMock);
      const tree = await sharedResolver.resolve({
        'pkg-a': '^1.0.0',
        'pkg-b': '^1.0.0'
      });

      // Both packages should share the same version of the dependency
      expect(tree['shared-dep']).toBeDefined();
      expect(tree['shared-dep'].version).toBe('1.1.0');
    });

    test('should handle deep dependency trees', async () => {
      const deepMock = new MockRegistryClient({
        'level-1': {
          name: 'level-1',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'level-2': '^1.0.0'
              }
            }
          }
        },
        'level-2': {
          name: 'level-2',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {
                'level-3': '^1.0.0'
              }
            }
          }
        },
        'level-3': {
          name: 'level-3',
          versions: {
            '1.0.0': {
              version: '1.0.0',
              dependencies: {}
            }
          }
        }
      });

      const deepResolver = new DependencyResolver(deepMock);
      const tree = await deepResolver.resolve({
        'level-1': '^1.0.0'
      });

      expect(tree['level-1']).toBeDefined();
      expect(tree['level-2']).toBeDefined();
      expect(tree['level-3']).toBeDefined();
    });
  });
});