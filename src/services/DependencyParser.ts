import * as fs from 'fs/promises';
import * as path from 'path';
import * as xml2js from 'xml2js';

export interface Dependency {
  name: string;
  version: string;
  scope?: string;
  type?: 'runtime' | 'dev' | 'peer' | 'optional';
  operator?: '==' | '>=' | '<=' | '~=' | '>' | '<' | '~' | '^';
}

export interface ParsedDependencies {
  type: 'maven' | 'npm' | 'python' | 'gradle';
  dependencies: Dependency[];
  filePath: string;
  projectName?: string;
}

export class DependencyParser {
  /**
   * Parse Maven pom.xml
   */
  async parseMavenPom(pomPath: string): Promise<ParsedDependencies> {
    console.error(`[DEBUG] DependencyParser: Parsing Maven pom.xml from ${pomPath}`);
    
    const content = await fs.readFile(pomPath, 'utf-8');
    const xml = await xml2js.parseStringPromise(content);
    
    const dependencies: Dependency[] = [];
    const dependencyNodes = xml.project?.dependencies?.[0]?.dependency || [];
    
    for (const dep of dependencyNodes) {
      const groupId = dep.groupId?.[0] || '';
      const artifactId = dep.artifactId?.[0] || '';
      const version = dep.version?.[0] || 'unknown';
      const scope = dep.scope?.[0] || 'compile';
      
      dependencies.push({
        name: `${groupId}:${artifactId}`,
        version: version,
        scope: scope,
        type: scope === 'test' ? 'dev' : 'runtime'
      });
    }
    
    console.error(`[DEBUG] DependencyParser: Found ${dependencies.length} Maven dependencies`);
    
    return {
      type: 'maven',
      dependencies,
      filePath: pomPath,
      projectName: xml.project?.artifactId?.[0] || 'unknown'
    };
  }
  
  /**
   * Parse NPM package.json
   */
  async parseNpmPackageJson(packagePath: string): Promise<ParsedDependencies> {
    console.error(`[DEBUG] DependencyParser: Parsing NPM package.json from ${packagePath}`);
    
    const content = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    
    const dependencies: Dependency[] = [];
    
    // Regular dependencies
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      dependencies.push({
        name,
        version: version as string,
        type: 'runtime'
      });
    }
    
    // Dev dependencies
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      dependencies.push({
        name,
        version: version as string,
        type: 'dev'
      });
    }
    
    // Peer dependencies
    for (const [name, version] of Object.entries(pkg.peerDependencies || {})) {
      dependencies.push({
        name,
        version: version as string,
        type: 'peer'
      });
    }
    
    console.error(`[DEBUG] DependencyParser: Found ${dependencies.length} NPM dependencies`);
    
    return {
      type: 'npm',
      dependencies,
      filePath: packagePath,
      projectName: pkg.name || 'unknown'
    };
  }
  
  /**
   * Parse Python requirements.txt
   */
  async parsePythonRequirements(reqPath: string): Promise<ParsedDependencies> {
    console.error(`[DEBUG] DependencyParser: Parsing Python requirements.txt from ${reqPath}`);
    
    const content = await fs.readFile(reqPath, 'utf-8');
    const lines = content.split('\n');
    
    const dependencies: Dependency[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse "package==version" or "package>=version"
      const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)(==|>=|<=|~=|>|<)(.+)$/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[3],
          operator: match[2] as any,
          type: 'runtime'
        });
      } else {
        // Package without version specifier
        dependencies.push({
          name: trimmed,
          version: 'latest',
          type: 'runtime'
        });
      }
    }
    
    console.error(`[DEBUG] DependencyParser: Found ${dependencies.length} Python dependencies`);
    
    return {
      type: 'python',
      dependencies,
      filePath: reqPath
    };
  }
  
  /**
   * Parse Gradle build.gradle or build.gradle.kts
   */
  async parseGradleFile(gradlePath: string): Promise<ParsedDependencies> {
    console.error(`[DEBUG] DependencyParser: Parsing Gradle file from ${gradlePath}`);
    
    const content = await fs.readFile(gradlePath, 'utf-8');
    const dependencies: Dependency[] = [];
    const seenDeps = new Set<string>(); // Track duplicates
    
    // Parse Groovy/Kotlin DSL dependency declarations
    // Enhanced patterns to catch more formats
    const patterns = [
      // Pattern 1: implementation 'group:artifact:version' or implementation "group:artifact:version"
      /(?:implementation|compile|api|runtimeOnly|testImplementation|compileOnly|annotationProcessor|kapt|kaptTest)\s*['"]([^:'"]+):([^:'"]+):([^'"]+)['"]/gi,
      
      // Pattern 2: implementation('group:artifact:version') or implementation("group:artifact:version")
      /(?:implementation|compile|api|runtimeOnly|testImplementation|compileOnly|annotationProcessor|kapt|kaptTest)\s*\(\s*['"]([^:'"]+):([^:'"]+):([^'"]+)['"]\s*\)/gi,
      
      // Pattern 3: Multi-line with group/name/version
      /(?:implementation|compile|api|runtimeOnly|testImplementation|compileOnly|annotationProcessor|kapt|kaptTest)\s*\(\s*group\s*[:=]\s*['"]([^'"]+)['"]\s*,\s*name\s*[:=]\s*['"]([^'"]+)['"]\s*,\s*version\s*[:=]\s*['"]([^'"]+)['"]/gi,
      
      // Pattern 4: Kotlin DSL with named parameters
      /(?:implementation|compile|api|runtimeOnly|testImplementation|compileOnly|annotationProcessor|kapt|kaptTest)\s*\(\s*group\s*=\s*"([^"]+)"\s*,\s*name\s*=\s*"([^"]+)"\s*,\s*version\s*=\s*"([^"]+)"/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const [fullMatch, group, artifact, version] = match;
        const depKey = `${group}:${artifact}`;
        
        // Skip if already seen (avoid duplicates from multiple patterns)
        if (seenDeps.has(depKey)) {
          continue;
        }
        
        seenDeps.add(depKey);
        
        // Determine scope from the configuration type
        const configType = fullMatch.toLowerCase();
        let scope: 'compile' | 'test' | 'runtime' = 'compile';
        let type: 'runtime' | 'dev' = 'runtime';
        
        if (configType.includes('test')) {
          scope = 'test';
          type = 'dev';
        } else if (configType.includes('runtimeonly')) {
          scope = 'runtime';
          type = 'runtime';
        } else if (configType.includes('compileonly') || configType.includes('annotationprocessor')) {
          scope = 'compile';
          type = 'dev';
        }
        
        dependencies.push({
          name: depKey,
          version: version.trim(),
          scope: scope,
          type: type
        });
      }
    }
    
    console.error(`[DEBUG] DependencyParser: Found ${dependencies.length} Gradle dependencies`);
    
    // Log first few dependencies for debugging
    if (dependencies.length > 0) {
      console.error(`[DEBUG] First few dependencies: ${dependencies.slice(0, 3).map(d => d.name).join(', ')}`);
    }
    
    return {
      type: 'gradle',
      dependencies,
      filePath: gradlePath
    };
  }
  
  /**
   * Auto-detect and parse project dependencies
   */
  async parseProjectDependencies(projectPath: string): Promise<ParsedDependencies> {
    console.error(`[DEBUG] DependencyParser: Auto-detecting dependency file in ${projectPath}`);
    
    // Check for pom.xml
    const pomPath = path.join(projectPath, 'pom.xml');
    try {
      await fs.access(pomPath);
      return await this.parseMavenPom(pomPath);
    } catch {
      // File doesn't exist, continue
    }
    
    // Check for package.json
    const packagePath = path.join(projectPath, 'package.json');
    try {
      await fs.access(packagePath);
      return await this.parseNpmPackageJson(packagePath);
    } catch {
      // File doesn't exist, continue
    }
    
    // Check for requirements.txt
    const reqPath = path.join(projectPath, 'requirements.txt');
    try {
      await fs.access(reqPath);
      return await this.parsePythonRequirements(reqPath);
    } catch {
      // File doesn't exist, continue
    }
    
    // Check for build.gradle
    const gradlePath = path.join(projectPath, 'build.gradle');
    try {
      await fs.access(gradlePath);
      return await this.parseGradleFile(gradlePath);
    } catch {
      // File doesn't exist, continue
    }
    
    // Check for build.gradle.kts
    const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
    try {
      await fs.access(gradleKtsPath);
      return await this.parseGradleFile(gradleKtsPath);
    } catch {
      // File doesn't exist, continue
    }
    
    throw new Error('No supported dependency file found (pom.xml, package.json, requirements.txt, build.gradle)');
  }
  
  /**
   * Find all dependency files in a directory (for multi-module projects)
   */
  async findAllDependencyFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scan = async (dir: string, depth: number = 0): Promise<void> => {
      if (depth > 5) return; // Limit recursion depth
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip node_modules, target, build, dist, etc.
            if (['node_modules', 'target', 'build', 'dist', '.git'].includes(entry.name)) {
              continue;
            }
            await scan(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Check if it's a dependency file
            if (entry.name === 'pom.xml' || 
                entry.name === 'package.json' || 
                entry.name === 'requirements.txt' ||
                entry.name === 'build.gradle' ||
                entry.name === 'build.gradle.kts') {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error(`[ERROR] Failed to scan directory ${dir}:`, error);
      }
    };
    
    await scan(rootPath);
    return files;
  }
}







