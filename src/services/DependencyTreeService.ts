import { Dependency, ParsedDependencies, DependencyParser } from './DependencyParser';
import { ReleaseNotesService } from './ReleaseNotesService';
import * as semver from 'semver';

export interface DependencyTreeNode {
  name: string;
  version: string;
  scope?: string;
  children: DependencyTreeNode[];
  hasCircular?: boolean;
}

export interface DependencyTree {
  name: string;
  version: string;
  children: DependencyTreeNode[];
}

export interface DependencyPath {
  path: string[];
  depth: number;
}

export interface DependencyAnalysis {
  totalDependencies: number;
  directDependencies: number;
  transitiveDependencies: number;
  maxDepth: number;
  duplicates: DuplicateDependency[];
  outdated: OutdatedDependency[];
}

export interface DuplicateDependency {
  name: string;
  versions: string[];
  count: number;
}

export interface OutdatedDependency {
  name: string;
  currentVersion: string;
  latestVersion: string;
  type: 'major' | 'minor' | 'patch';
}

export class DependencyTreeService {
  private parser: DependencyParser;
  private releaseNotesService: ReleaseNotesService;
  private visited: Set<string> = new Set();

  constructor() {
    this.parser = new DependencyParser();
    this.releaseNotesService = new ReleaseNotesService();
  }

  /**
   * Build a simple 2-level dependency tree (direct dependencies only)
   * For full transitive dependencies, we'd need to fetch and parse each dependency's manifest
   */
  async buildDependencyTree(
    projectPath: string
  ): Promise<DependencyTree> {
    console.error(`[DEBUG] DependencyTreeService: Building dependency tree for ${projectPath}`);
    
    const parsed = await this.parser.parseProjectDependencies(projectPath);
    
    const root: DependencyTree = {
      name: parsed.projectName || 'root',
      version: '1.0.0',
      children: []
    };
    
    // Add direct dependencies
    for (const dep of parsed.dependencies) {
      root.children.push({
        name: dep.name,
        version: dep.version,
        scope: dep.scope,
        children: [] // Only showing direct dependencies for simplicity
      });
    }
    
    console.error(`[DEBUG] DependencyTreeService: Built tree with ${root.children.length} direct dependencies`);
    
    return root;
  }

  /**
   * Find all paths to a specific dependency in the tree
   */
  findDependencyPaths(
    tree: DependencyTree,
    targetName: string
  ): DependencyPath[] {
    const paths: DependencyPath[] = [];
    
    const traverse = (node: DependencyTreeNode | DependencyTree, currentPath: string[]) => {
      const newPath = [...currentPath, `${node.name}@${node.version}`];
      
      if (node.name === targetName || node.name.includes(targetName)) {
        paths.push({
          path: newPath,
          depth: newPath.length - 1
        });
      }
      
      for (const child of node.children) {
        traverse(child, newPath);
      }
    };
    
    traverse(tree, []);
    return paths;
  }

  /**
   * Analyze dependencies for duplicates and outdated packages
   */
  async analyzeDependencies(projectPath: string): Promise<DependencyAnalysis> {
    console.error(`[DEBUG] DependencyTreeService: Analyzing dependencies for ${projectPath}`);
    
    const parsed = await this.parser.parseProjectDependencies(projectPath);
    const tree = await this.buildDependencyTree(projectPath);
    
    // Count all dependencies
    const allDeps = new Map<string, string[]>();
    const countDeps = (node: DependencyTreeNode | DependencyTree) => {
      if (node.name !== 'root') {
        const versions = allDeps.get(node.name) || [];
        versions.push(node.version);
        allDeps.set(node.name, versions);
      }
      for (const child of node.children) {
        countDeps(child);
      }
    };
    countDeps(tree);
    
    // Find duplicates (same package, different versions)
    const duplicates: DuplicateDependency[] = [];
    for (const [name, versions] of allDeps.entries()) {
      const uniqueVersions = [...new Set(versions)];
      if (uniqueVersions.length > 1) {
        duplicates.push({
          name,
          versions: uniqueVersions,
          count: uniqueVersions.length
        });
      }
    }
    
    // Check for outdated dependencies
    const outdated: OutdatedDependency[] = [];
    for (const dep of parsed.dependencies) {
      try {
        // Only check for Maven packages for now
        if (dep.name.includes(':')) {
          const metadata = await this.releaseNotesService.fetchMavenMetadata(dep.name);
          
          if (!metadata) continue;
          
          const currentVersion = dep.version.replace(/[^\d.]/g, ''); // Remove non-semver chars
          
          if (metadata.latestVersion && semver.valid(currentVersion) && semver.valid(metadata.latestVersion)) {
            if (semver.lt(currentVersion, metadata.latestVersion)) {
              const diff = semver.diff(currentVersion, metadata.latestVersion);
              outdated.push({
                name: dep.name,
                currentVersion: dep.version,
                latestVersion: metadata.latestVersion,
                type: diff as 'major' | 'minor' | 'patch' || 'major'
              });
            }
          }
        }
      } catch (error) {
        console.error(`[ERROR] Failed to check for updates: ${dep.name}`, error);
      }
    }
    
    // Calculate tree depth
    const calculateDepth = (node: DependencyTreeNode | DependencyTree, currentDepth: number = 0): number => {
      if (node.children.length === 0) return currentDepth;
      return Math.max(...node.children.map(child => calculateDepth(child, currentDepth + 1)));
    };
    
    return {
      totalDependencies: allDeps.size,
      directDependencies: parsed.dependencies.length,
      transitiveDependencies: allDeps.size - parsed.dependencies.length,
      maxDepth: calculateDepth(tree),
      duplicates,
      outdated
    };
  }

  /**
   * Generate a text visualization of the dependency tree
   */
  visualizeTree(tree: DependencyTree, maxDepth: number = 3): string {
    let output = `${tree.name}@${tree.version}\n`;
    
    const visualizeNode = (node: DependencyTreeNode, prefix: string, isLast: boolean, depth: number) => {
      if (depth >= maxDepth) return;
      
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      
      output += `${prefix}${connector}${node.name}@${node.version}`;
      if (node.scope) output += ` (${node.scope})`;
      if (node.hasCircular) output += ` [CIRCULAR]`;
      output += '\n';
      
      const children = node.children;
      children.forEach((child, index) => {
        const isLastChild = index === children.length - 1;
        visualizeNode(child, prefix + childPrefix, isLastChild, depth + 1);
      });
    };
    
    tree.children.forEach((child, index) => {
      const isLast = index === tree.children.length - 1;
      visualizeNode(child, '', isLast, 1);
    });
    
    return output;
  }

  /**
   * Find which dependencies need to be updated together
   */
  async findRelatedUpdates(
    projectPath: string,
    targetDependency: string
  ): Promise<Dependency[]> {
    console.error(`[DEBUG] DependencyTreeService: Finding related updates for ${targetDependency}`);
    
    const parsed = await this.parser.parseProjectDependencies(projectPath);
    const relatedDeps: Dependency[] = [];
    
    // For Maven, find dependencies from the same group
    if (targetDependency.includes(':')) {
      const [targetGroup] = targetDependency.split(':');
      
      for (const dep of parsed.dependencies) {
        if (dep.name.includes(':')) {
          const [depGroup] = dep.name.split(':');
          if (depGroup === targetGroup && dep.name !== targetDependency) {
            relatedDeps.push(dep);
          }
        }
      }
    }
    
    console.error(`[DEBUG] DependencyTreeService: Found ${relatedDeps.length} related dependencies`);
    return relatedDeps;
  }

  /**
   * Export dependency tree to JSON
   */
  exportToJson(tree: DependencyTree): string {
    return JSON.stringify(tree, null, 2);
  }

  /**
   * Get dependency statistics
   */
  getStatistics(tree: DependencyTree): {
    total: number;
    byScope: Map<string, number>;
    byDepth: Map<number, number>;
  } {
    const byScope = new Map<string, number>();
    const byDepth = new Map<number, number>();
    let total = 0;
    
    const countNode = (node: DependencyTreeNode | DependencyTree, depth: number) => {
      if (node.name !== 'root') {
        total++;
        const scope = (node as DependencyTreeNode).scope || 'unknown';
        byScope.set(scope, (byScope.get(scope) || 0) + 1);
        byDepth.set(depth, (byDepth.get(depth) || 0) + 1);
      }
      
      for (const child of node.children) {
        countNode(child, depth + 1);
      }
    };
    
    countNode(tree, 0);
    
    return { total, byScope, byDepth };
  }
}

