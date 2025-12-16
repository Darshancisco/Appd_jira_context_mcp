import fetch from 'node-fetch';
import semver from 'semver';

export class PackageRegistryService {
  constructor() {
    this.registries = {
      javascript: {
        name: 'NPM',
        baseUrl: 'https://registry.npmjs.org',
        searchUrl: 'https://api.npms.io/v2/search'
      },
      java: {
        name: 'Maven Central',
        baseUrl: 'https://search.maven.org/solrsearch/select',
        repoUrl: 'https://repo1.maven.org/maven2'
      },
      python: {
        name: 'PyPI',
        baseUrl: 'https://pypi.org/pypi',
        searchUrl: 'https://pypi.org/search'
      },
      go: {
        name: 'Go Modules',
        baseUrl: 'https://proxy.golang.org',
        searchUrl: 'https://pkg.go.dev'
      },
      rust: {
        name: 'Crates.io',
        baseUrl: 'https://crates.io/api/v1/crates',
        searchUrl: 'https://crates.io/api/v1/crates'
      }
    };
  }

  async getLibraryInfo(libraryName, language = 'javascript') {
    try {
      switch (language) {
        case 'javascript':
          return await this.getNpmInfo(libraryName);
        case 'java':
          return await this.getMavenInfo(libraryName);
        case 'python':
          return await this.getPyPiInfo(libraryName);
        case 'go':
          return await this.getGoModuleInfo(libraryName);
        case 'rust':
          return await this.getCratesInfo(libraryName);
        default:
          throw new Error(`Unsupported language: ${language}`);
      }
    } catch (error) {
      console.error(`Error fetching info for ${libraryName}:`, error);
      return {
        name: libraryName,
        error: error.message,
        registry: this.registries[language]?.name || 'Unknown'
      };
    }
  }

  async getNpmInfo(packageName) {
    const response = await fetch(`${this.registries.javascript.baseUrl}/${packageName}`);
    
    if (!response.ok) {
      throw new Error(`Package not found: ${packageName}`);
    }

    const data = await response.json();
    const latestVersion = data['dist-tags']?.latest;
    const versions = Object.keys(data.versions || {});

    return {
      name: data.name,
      description: data.description,
      latest_version: latestVersion,
      versions: versions.slice(-10), // Last 10 versions
      homepage: data.homepage,
      repository: data.repository?.url,
      license: data.license,
      keywords: data.keywords,
      maintainers: data.maintainers?.map(m => m.name),
      created: data.time?.created,
      modified: data.time?.modified,
      registry: 'NPM'
    };
  }

  async getMavenInfo(artifactId) {
    // Handle Maven coordinates (groupId:artifactId)
    let groupId, artifact;
    if (artifactId.includes(':')) {
      [groupId, artifact] = artifactId.split(':');
    } else {
      // Try to guess common groupIds
      artifact = artifactId;
      groupId = this.guessGroupId(artifactId);
    }

    const query = `q=g:"${groupId}"+AND+a:"${artifact}"&rows=1&wt=json`;
    const response = await fetch(`${this.registries.java.baseUrl}?${query}`);
    
    if (!response.ok) {
      throw new Error(`Maven artifact not found: ${artifactId}`);
    }

    const data = await response.json();
    
    if (data.response.numFound === 0) {
      throw new Error(`No Maven artifact found for: ${artifactId}`);
    }

    const doc = data.response.docs[0];
    
    return {
      name: `${doc.g}:${doc.a}`,
      group_id: doc.g,
      artifact_id: doc.a,
      latest_version: doc.latestVersion,
      versions: doc.versionCount,
      repository: `https://mvnrepository.com/artifact/${doc.g}/${doc.a}`,
      registry: 'Maven Central'
    };
  }

  async getPyPiInfo(packageName) {
    const response = await fetch(`${this.registries.python.baseUrl}/${packageName}/json`);
    
    if (!response.ok) {
      throw new Error(`Python package not found: ${packageName}`);
    }

    const data = await response.json();
    const info = data.info;
    
    return {
      name: info.name,
      description: info.summary,
      latest_version: info.version,
      versions: Object.keys(data.releases || {}).slice(-10),
      homepage: info.home_page,
      repository: info.project_urls?.Repository,
      license: info.license,
      keywords: info.keywords?.split(',') || [],
      author: info.author,
      registry: 'PyPI'
    };
  }

  async getGoModuleInfo(moduleName) {
    // Go modules use a different approach - we'll get basic info
    try {
      const response = await fetch(`https://api.github.com/repos/${moduleName}`);
      
      if (response.ok) {
        const data = await response.json();
        return {
          name: moduleName,
          description: data.description,
          homepage: data.html_url,
          repository: data.clone_url,
          license: data.license?.name,
          stars: data.stargazers_count,
          registry: 'Go Modules'
        };
      }
    } catch (error) {
      // Fallback for non-GitHub modules
    }

    return {
      name: moduleName,
      registry: 'Go Modules',
      note: 'Limited info available - check pkg.go.dev for details'
    };
  }

  async getCratesInfo(crateName) {
    const response = await fetch(`${this.registries.rust.baseUrl}/${crateName}`);
    
    if (!response.ok) {
      throw new Error(`Rust crate not found: ${crateName}`);
    }

    const data = await response.json();
    const crate = data.crate;
    
    return {
      name: crate.name,
      description: crate.description,
      latest_version: crate.newest_version,
      homepage: crate.homepage,
      repository: crate.repository,
      documentation: crate.documentation,
      downloads: crate.downloads,
      registry: 'Crates.io'
    };
  }

  async compareVersions(libraryName, fromVersion, toVersion, language = 'javascript') {
    try {
      const libraryInfo = await this.getLibraryInfo(libraryName, language);
      
      // Basic version comparison using semver
      const comparison = {
        library: libraryName,
        from_version: fromVersion,
        to_version: toVersion,
        is_major_upgrade: false,
        is_minor_upgrade: false,
        is_patch_upgrade: false,
        version_diff: null
      };

      if (semver.valid(fromVersion) && semver.valid(toVersion)) {
        const diff = semver.diff(fromVersion, toVersion);
        comparison.version_diff = diff;
        comparison.is_major_upgrade = diff === 'major';
        comparison.is_minor_upgrade = diff === 'minor';
        comparison.is_patch_upgrade = diff === 'patch';
      }

      // Get changelog/release notes if available
      if (language === 'javascript' && libraryInfo.repository) {
        comparison.changelog_url = this.getChangelogUrl(libraryInfo.repository);
      }

      return comparison;
    } catch (error) {
      return {
        library: libraryName,
        from_version: fromVersion,
        to_version: toVersion,
        error: error.message
      };
    }
  }

  guessGroupId(artifactId) {
    // Common Maven groupId patterns
    const commonMappings = {
      'commons-lang3': 'org.apache.commons',
      'commons-io': 'org.apache.commons',
      'commons-collections4': 'org.apache.commons',
      'spring-core': 'org.springframework',
      'spring-boot': 'org.springframework.boot',
      'jackson-core': 'com.fasterxml.jackson.core',
      'junit': 'junit',
      'logback-core': 'ch.qos.logback',
      'slf4j-api': 'org.slf4j'
    };

    return commonMappings[artifactId] || 'org.apache.commons';
  }

  getChangelogUrl(repositoryUrl) {
    if (!repositoryUrl) return null;
    
    // Convert various repository URL formats to GitHub changelog
    const githubMatch = repositoryUrl.match(/github\.com[\/:]([^\/]+)\/([^\/]+)/);
    if (githubMatch) {
      const [, owner, repo] = githubMatch;
      const cleanRepo = repo.replace(/\.git$/, '');
      return `https://github.com/${owner}/${cleanRepo}/releases`;
    }
    
    return null;
  }

  async searchLibraries(query, language = 'javascript', limit = 10) {
    try {
      switch (language) {
        case 'javascript':
          return await this.searchNpm(query, limit);
        case 'python':
          return await this.searchPyPi(query, limit);
        case 'rust':
          return await this.searchCrates(query, limit);
        default:
          return { results: [], message: `Search not implemented for ${language}` };
      }
    } catch (error) {
      return { results: [], error: error.message };
    }
  }

  async searchNpm(query, limit = 10) {
    const response = await fetch(`${this.registries.javascript.searchUrl}?q=${encodeURIComponent(query)}&size=${limit}`);
    
    if (!response.ok) {
      throw new Error('NPM search failed');
    }

    const data = await response.json();
    
    return {
      results: data.results.map(result => ({
        name: result.package.name,
        description: result.package.description,
        version: result.package.version,
        score: result.score.final
      }))
    };
  }

  async searchPyPi(query, limit = 10) {
    // PyPI search is more limited, return basic info
    return {
      results: [],
      message: 'PyPI search requires direct package name lookup'
    };
  }

  async searchCrates(query, limit = 10) {
    const response = await fetch(`${this.registries.rust.searchUrl}?q=${encodeURIComponent(query)}&per_page=${limit}`);
    
    if (!response.ok) {
      throw new Error('Crates.io search failed');
    }

    const data = await response.json();
    
    return {
      results: data.crates.map(crate => ({
        name: crate.name,
        description: crate.description,
        version: crate.newest_version,
        downloads: crate.downloads
      }))
    };
  }
}

