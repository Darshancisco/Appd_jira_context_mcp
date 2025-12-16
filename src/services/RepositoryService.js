// Converted to CommonJS for compatibility
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

class RepositoryService {
  constructor(workingDirectory = process.cwd()) {
    this.workingDirectory = workingDirectory;
    this.supportedFiles = {
      javascript: {
        package_files: ['package.json', 'package-lock.json', 'yarn.lock'],
        source_patterns: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
        config_files: ['webpack.config.js', 'babel.config.js', '.eslintrc.js', 'jest.config.js'],
        exclude_patterns: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
      },
      java: {
        package_files: ['pom.xml', 'build.gradle', 'gradle.properties'],
        source_patterns: ['**/*.java', '**/*.kt'],
        config_files: ['application.properties', 'application.yml'],
        exclude_patterns: ['target/**', 'build/**', '.gradle/**', '.git/**']
      },
      python: {
        package_files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
        source_patterns: ['**/*.py'],
        config_files: ['setup.cfg', 'tox.ini', 'pytest.ini'],
        exclude_patterns: ['__pycache__/**', '*.egg-info/**', 'venv/**', '.git/**']
      },
      go: {
        package_files: ['go.mod', 'go.sum'],
        source_patterns: ['**/*.go'],
        config_files: ['Makefile'],
        exclude_patterns: ['vendor/**', '.git/**']
      },
      rust: {
        package_files: ['Cargo.toml', 'Cargo.lock'],
        source_patterns: ['**/*.rs'],
        config_files: ['rust-toolchain.toml'],
        exclude_patterns: ['target/**', '.git/**']
      }
    };
  }

  async analyzeRepository() {
    console.log(`Analyzing repository at: ${this.workingDirectory}`);
    
    const analysis = {
      working_directory: this.workingDirectory,
      detected_languages: [],
      project_structure: {},
      dependency_files: [],
      source_files: [],
      config_files: [],
      total_files: 0,
      recommendations: []
    };

    // Detect project languages
    analysis.detected_languages = await this.detectProjectLanguages();
    
    // Analyze each detected language
    for (const language of analysis.detected_languages) {
      console.log(`Analyzing ${language} project structure...`);
      analysis.project_structure[language] = await this.analyzeLanguageProject(language);
    }

    // Get file listings
    analysis.dependency_files = await this.findDependencyFiles();
    analysis.source_files = await this.findSourceFiles();
    analysis.config_files = await this.findConfigFiles();
    analysis.total_files = analysis.source_files.length;

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  async detectProjectLanguages() {
    const languages = [];
    
    for (const [language, config] of Object.entries(this.supportedFiles)) {
      for (const packageFile of config.package_files) {
        const filePath = path.join(this.workingDirectory, packageFile);
        if (fs.existsSync(filePath)) {
          languages.push(language);
          break;
        }
      }
    }

    return languages;
  }

  async analyzeLanguageProject(language) {
    const config = this.supportedFiles[language];
    const analysis = {
      language,
      package_files: [],
      dependencies: {},
      source_file_count: 0,
      config_files: []
    };

    // Find package files
    for (const packageFile of config.package_files) {
      const filePath = path.join(this.workingDirectory, packageFile);
      if (fs.existsSync(filePath)) {
        analysis.package_files.push({
          file: packageFile,
          path: filePath,
          size: fs.statSync(filePath).size
        });

        // Parse dependencies
        try {
          const dependencies = await this.parseDependencies(filePath, language);
          analysis.dependencies = { ...analysis.dependencies, ...dependencies };
        } catch (error) {
          console.warn(`Failed to parse dependencies from ${packageFile}:`, error.message);
        }
      }
    }

    // Count source files
    try {
      const sourceFiles = await this.findFilesByPatterns(config.source_patterns, config.exclude_patterns);
      analysis.source_file_count = sourceFiles.length;
    } catch (error) {
      console.warn(`Failed to count source files for ${language}:`, error.message);
    }

    return analysis;
  }

  async parseDependencies(filePath, language) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = {};

    try {
      switch (language) {
        case 'javascript':
          if (filePath.endsWith('package.json')) {
            const packageJson = JSON.parse(content);
            return {
              ...packageJson.dependencies || {},
              ...packageJson.devDependencies || {}
            };
          }
          break;

        case 'java':
          if (filePath.endsWith('pom.xml')) {
            return this.parseMavenDependencies(content);
          } else if (filePath.endsWith('build.gradle')) {
            return this.parseGradleDependencies(content);
          }
          break;

        case 'python':
          if (filePath.endsWith('requirements.txt')) {
            return this.parseRequirementsTxt(content);
          } else if (filePath.endsWith('pyproject.toml')) {
            return this.parsePyprojectToml(content);
          }
          break;

        case 'go':
          if (filePath.endsWith('go.mod')) {
            return this.parseGoMod(content);
          }
          break;

        case 'rust':
          if (filePath.endsWith('Cargo.toml')) {
            return this.parseCargoToml(content);
          }
          break;
      }
    } catch (error) {
      console.warn(`Error parsing ${filePath}:`, error.message);
    }

    return dependencies;
  }

  parseMavenDependencies(content) {
    const dependencies = {};
    const dependencyRegex = /<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<version>(.*?)<\/version>[\s\S]*?<\/dependency>/g;
    
    let match;
    while ((match = dependencyRegex.exec(content)) !== null) {
      const [, groupId, artifactId, version] = match;
      dependencies[`${groupId}:${artifactId}`] = version;
    }
    
    return dependencies;
  }

  parseGradleDependencies(content) {
    const dependencies = {};
    const dependencyRegex = /(?:implementation|compile|api|testImplementation)\s+['"]([^'"]+):([^'"]+):([^'"]+)['"]/g;
    
    let match;
    while ((match = dependencyRegex.exec(content)) !== null) {
      const [, groupId, artifactId, version] = match;
      dependencies[`${groupId}:${artifactId}`] = version;
    }
    
    return dependencies;
  }

  parseRequirementsTxt(content) {
    const dependencies = {};
    const lines = content.split('\n');
    
    lines.forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=<>!]+)([=<>!]+)(.+)$/);
        if (match) {
          const [, name, operator, version] = match;
          dependencies[name.trim()] = version.trim();
        }
      }
    });
    
    return dependencies;
  }

  parseGoMod(content) {
    const dependencies = {};
    const requireRegex = /require\s+([^\s]+)\s+([^\s]+)/g;
    
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const [, module, version] = match;
      dependencies[module] = version;
    }
    
    return dependencies;
  }

  parseCargoToml(content) {
    const dependencies = {};
    
    try {
      // Simple TOML parsing for dependencies section
      const dependenciesSection = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
      if (dependenciesSection) {
        const depLines = dependenciesSection[1].split('\n');
        depLines.forEach(line => {
          const match = line.match(/^([^=]+)\s*=\s*"([^"]+)"/);
          if (match) {
            const [, name, version] = match;
            dependencies[name.trim()] = version.trim();
          }
        });
      }
    } catch (error) {
      console.warn('Error parsing Cargo.toml:', error.message);
    }
    
    return dependencies;
  }

  async findFilesByPatterns(includePatterns, excludePatterns = []) {
    const files = [];
    
    for (const pattern of includePatterns) {
      try {
        const matches = await glob(pattern, {
          cwd: this.workingDirectory,
          ignore: excludePatterns,
          nodir: true
        });
        files.push(...matches);
      } catch (error) {
        console.warn(`Error finding files with pattern ${pattern}:`, error.message);
      }
    }
    
    return [...new Set(files)]; // Remove duplicates
  }

  async findDependencyFiles() {
    const files = [];
    
    for (const config of Object.values(this.supportedFiles)) {
      for (const packageFile of config.package_files) {
        const filePath = path.join(this.workingDirectory, packageFile);
        if (fs.existsSync(filePath)) {
          files.push({
            file: packageFile,
            path: filePath,
            size: fs.statSync(filePath).size,
            modified: fs.statSync(filePath).mtime
          });
        }
      }
    }
    
    return files;
  }

  async findSourceFiles() {
    const files = [];
    
    for (const [language, config] of Object.entries(this.supportedFiles)) {
      const sourceFiles = await this.findFilesByPatterns(config.source_patterns, config.exclude_patterns);
      files.push(...sourceFiles.map(file => ({
        file,
        language,
        path: path.join(this.workingDirectory, file),
        size: fs.existsSync(path.join(this.workingDirectory, file)) ? 
          fs.statSync(path.join(this.workingDirectory, file)).size : 0
      })));
    }
    
    return files;
  }

  async findConfigFiles() {
    const files = [];
    
    for (const config of Object.values(this.supportedFiles)) {
      for (const configFile of config.config_files) {
        const filePath = path.join(this.workingDirectory, configFile);
        if (fs.existsSync(filePath)) {
          files.push({
            file: configFile,
            path: filePath,
            size: fs.statSync(filePath).size
          });
        }
      }
    }
    
    return files;
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    // Check for multiple languages
    if (analysis.detected_languages.length > 1) {
      recommendations.push({
        type: 'multi_language',
        message: `Multi-language project detected (${analysis.detected_languages.join(', ')}). Consider language-specific upgrade strategies.`,
        priority: 'medium'
      });
    }

    // Check for large projects
    if (analysis.total_files > 100) {
      recommendations.push({
        type: 'large_project',
        message: `Large project with ${analysis.total_files} source files. Consider gradual upgrade approach and comprehensive testing.`,
        priority: 'high'
      });
    }

    // Check for missing dependency files
    if (analysis.dependency_files.length === 0) {
      recommendations.push({
        type: 'no_dependencies',
        message: 'No dependency files found. Manual dependency management may be required.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  async updateDependency(libraryName, newVersion, language) {
    console.log(`Updating ${libraryName} to ${newVersion} in ${language} project...`);
    
    const config = this.supportedFiles[language];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const updates = [];

    for (const packageFile of config.package_files) {
      const filePath = path.join(this.workingDirectory, packageFile);
      if (fs.existsSync(filePath)) {
        try {
          const updated = await this.updateDependencyInFile(filePath, libraryName, newVersion, language);
          if (updated) {
            updates.push({
              file: packageFile,
              path: filePath,
              updated: true
            });
          }
        } catch (error) {
          console.error(`Failed to update ${packageFile}:`, error.message);
          updates.push({
            file: packageFile,
            path: filePath,
            updated: false,
            error: error.message
          });
        }
      }
    }

    return updates;
  }

  async updateDependencyInFile(filePath, libraryName, newVersion, language) {
    const content = fs.readFileSync(filePath, 'utf8');
    let updatedContent = content;
    let updated = false;

    try {
      switch (language) {
        case 'javascript':
          if (filePath.endsWith('package.json')) {
            const packageJson = JSON.parse(content);
            
            if (packageJson.dependencies && packageJson.dependencies[libraryName]) {
              packageJson.dependencies[libraryName] = newVersion;
              updated = true;
            }
            
            if (packageJson.devDependencies && packageJson.devDependencies[libraryName]) {
              packageJson.devDependencies[libraryName] = newVersion;
              updated = true;
            }
            
            if (updated) {
              updatedContent = JSON.stringify(packageJson, null, 2);
            }
          }
          break;

        case 'java':
          if (filePath.endsWith('pom.xml')) {
            // Update Maven POM
            const dependencyRegex = new RegExp(
              `(<dependency>[\\s\\S]*?<groupId>${libraryName.split(':')[0]}</groupId>[\\s\\S]*?<artifactId>${libraryName.split(':')[1]}</artifactId>[\\s\\S]*?<version>)[^<]+(</version>[\\s\\S]*?</dependency>)`,
              'g'
            );
            
            updatedContent = content.replace(dependencyRegex, `$1${newVersion}$2`);
            updated = updatedContent !== content;
          } else if (filePath.endsWith('build.gradle')) {
            // Update Gradle build file
            const dependencyRegex = new RegExp(
              `((?:implementation|compile|api|testImplementation)\\s+['"]${libraryName.replace(':', ':')}:)[^'"]+(['"])`,
              'g'
            );
            
            updatedContent = content.replace(dependencyRegex, `$1${newVersion}$2`);
            updated = updatedContent !== content;
          }
          break;

        case 'python':
          if (filePath.endsWith('requirements.txt')) {
            const lines = content.split('\n');
            const updatedLines = lines.map(line => {
              if (line.trim().startsWith(libraryName)) {
                updated = true;
                return `${libraryName}==${newVersion}`;
              }
              return line;
            });
            
            if (updated) {
              updatedContent = updatedLines.join('\n');
            }
          }
          break;

        case 'go':
          if (filePath.endsWith('go.mod')) {
            const requireRegex = new RegExp(`(require\\s+${libraryName}\\s+)[^\\s]+`, 'g');
            updatedContent = content.replace(requireRegex, `$1${newVersion}`);
            updated = updatedContent !== content;
          }
          break;

        case 'rust':
          if (filePath.endsWith('Cargo.toml')) {
            const dependencyRegex = new RegExp(`(${libraryName}\\s*=\\s*")[^"]+(")`);
            updatedContent = content.replace(dependencyRegex, `$1${newVersion}$2`);
            updated = updatedContent !== content;
          }
          break;
      }

      if (updated) {
        // Create backup
        const backupPath = `${filePath}.backup.${Date.now()}`;
        fs.copyFileSync(filePath, backupPath);
        console.log(`Created backup: ${backupPath}`);
        
        // Write updated content
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Updated ${filePath}`);
      }

    } catch (error) {
      console.error(`Error updating ${filePath}:`, error.message);
      throw error;
    }

    return updated;
  }

  async createUpgradeReport(libraries, repositoryAnalysis) {
    const report = {
      timestamp: new Date().toISOString(),
      repository: repositoryAnalysis,
      libraries: libraries,
      upgrade_plan: [],
      risks: [],
      recommendations: []
    };

    // Generate upgrade plan
    libraries.forEach(lib => {
      report.upgrade_plan.push({
        library: lib.name,
        current_version: lib.fromVersion,
        target_version: lib.toVersion,
        language: lib.language || 'unknown',
        files_to_update: this.getFilesToUpdate(lib, repositoryAnalysis),
        estimated_effort: this.estimateUpgradeEffort(lib, repositoryAnalysis)
      });
    });

    // Assess risks
    report.risks = this.assessUpgradeRisks(libraries, repositoryAnalysis);

    // Generate recommendations
    report.recommendations = this.generateUpgradeRecommendations(libraries, repositoryAnalysis);

    return report;
  }

  getFilesToUpdate(library, repositoryAnalysis) {
    const files = [];
    
    repositoryAnalysis.dependency_files.forEach(file => {
      if (this.fileContainsDependency(file.path, library.name)) {
        files.push(file.file);
      }
    });

    return files;
  }

  fileContainsDependency(filePath, libraryName) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.includes(libraryName);
    } catch (error) {
      return false;
    }
  }

  estimateUpgradeEffort(library, repositoryAnalysis) {
    let effort = 'low';
    
    // Check if it's a major version upgrade
    if (library.fromVersion && library.toVersion) {
      const fromMajor = parseInt(library.fromVersion.split('.')[0]);
      const toMajor = parseInt(library.toVersion.split('.')[0]);
      
      if (toMajor > fromMajor) {
        effort = 'high';
      } else if (parseInt(library.toVersion.split('.')[1]) > parseInt(library.fromVersion.split('.')[1])) {
        effort = 'medium';
      }
    }

    // Adjust based on project size
    if (repositoryAnalysis.total_files > 100) {
      effort = effort === 'low' ? 'medium' : 'high';
    }

    return effort;
  }

  assessUpgradeRisks(libraries, repositoryAnalysis) {
    const risks = [];

    // Multi-language project risk
    if (repositoryAnalysis.detected_languages.length > 1) {
      risks.push({
        type: 'multi_language',
        level: 'medium',
        description: 'Multi-language project may have complex dependency interactions'
      });
    }

    // Large project risk
    if (repositoryAnalysis.total_files > 200) {
      risks.push({
        type: 'large_codebase',
        level: 'high',
        description: 'Large codebase increases testing and validation requirements'
      });
    }

    // Major version upgrades
    libraries.forEach(lib => {
      if (lib.fromVersion && lib.toVersion) {
        const fromMajor = parseInt(lib.fromVersion.split('.')[0]);
        const toMajor = parseInt(lib.toVersion.split('.')[0]);
        
        if (toMajor > fromMajor) {
          risks.push({
            type: 'major_upgrade',
            level: 'high',
            library: lib.name,
            description: `Major version upgrade for ${lib.name} may introduce breaking changes`
          });
        }
      }
    });

    return risks;
  }

  generateUpgradeRecommendations(libraries, repositoryAnalysis) {
    const recommendations = [];

    // Backup recommendation
    recommendations.push({
      type: 'backup',
      priority: 'critical',
      description: 'Create a complete backup of the repository before starting upgrades'
    });

    // Testing recommendation
    recommendations.push({
      type: 'testing',
      priority: 'high',
      description: 'Run comprehensive test suite after each library upgrade'
    });

    // Gradual upgrade for large projects
    if (repositoryAnalysis.total_files > 100 || libraries.length > 3) {
      recommendations.push({
        type: 'gradual_upgrade',
        priority: 'medium',
        description: 'Consider upgrading libraries one at a time to isolate potential issues'
      });
    }

    // Documentation update
    recommendations.push({
      type: 'documentation',
      priority: 'medium',
      description: 'Update project documentation to reflect new library versions'
    });

    return recommendations;
  }
}

// CommonJS export
module.exports = { RepositoryService };
