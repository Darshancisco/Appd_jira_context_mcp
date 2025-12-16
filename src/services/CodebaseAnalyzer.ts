/**
 * Codebase Analyzer Service - Finds library usage in codebase
 * 
 * Analyzes Java, JavaScript/TypeScript, Python code to find:
 * - Import statements
 * - Method calls
 * - Deprecated usage
 * - Impact analysis before upgrades
 * 
 * Copyright (c) 2024 Darshan Hanumanthappa <darshan.hanumanthappa@gmail.com>
 * Licensed under the MIT License
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface LibraryUsage {
  library: string;
  totalFiles: number;
  files: FileUsage[];
  mostUsedClasses: ClassUsageCount[];
  deprecatedUsage: DeprecatedUsage[];
  impactScore: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

interface FileUsage {
  filePath: string;
  imports: string[];
  usageCount: number;
  lines: number[];
}

interface ClassUsageCount {
  className: string;
  count: number;
  files: string[];
}

interface DeprecatedUsage {
  file: string;
  line: number;
  usage: string;
  suggestion: string;
}

export class CodebaseAnalyzer {
  // Known deprecated patterns for common libraries
  private deprecatedPatterns: Record<string, Array<{ pattern: RegExp; suggestion: string }>> = {
    'org.bouncycastle': [
      { pattern: /FipsTripleDES/g, suggestion: 'Use FipsAES instead (TripleDES is deprecated)' },
      { pattern: /FipsDES/g, suggestion: 'Use FipsAES instead (DES is deprecated)' },
      { pattern: /MD5/g, suggestion: 'Use SHA-256 or stronger (MD5 is insecure)' },
    ],
    'org.springframework': [
      { pattern: /NestedCheckedException/g, suggestion: 'Use NestedRuntimeException (removed in Spring 6)' },
      { pattern: /WebMvcConfigurerAdapter/g, suggestion: 'Implement WebMvcConfigurer directly' },
    ],
    'javax': [
      { pattern: /javax\./g, suggestion: 'Migrate to jakarta.* (Java EE → Jakarta EE)' },
    ],
  };

  /**
   * Find all usage of a library in the codebase
   */
  async findLibraryUsage(
    library: string,
    projectPath: string,
    options: {
      findImports?: boolean;
      findMethodCalls?: boolean;
      checkDeprecated?: boolean;
    } = {}
  ): Promise<LibraryUsage> {
    const {
      findImports = true,
      findMethodCalls = true,
      checkDeprecated = true,
    } = options;

    console.error(`\n[CodebaseAnalyzer] 🔍 Analyzing usage of ${library} in ${projectPath}`);

    // Parse library identifier
    const { groupId, artifactId, packageName } = this.parseLibrary(library);

    // Find all relevant source files
    const sourceFiles = await this.findSourceFiles(projectPath);
    console.error(`[CodebaseAnalyzer] 📁 Found ${sourceFiles.length} source files to analyze`);

    // Analyze each file
    const fileUsages: FileUsage[] = [];
    const classUsageMap = new Map<string, Set<string>>();

    for (const filePath of sourceFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const usage = await this.analyzeFile(
          filePath,
          content,
          packageName,
          { findImports, findMethodCalls }
        );

        if (usage.imports.length > 0 || usage.usageCount > 0) {
          fileUsages.push(usage);

          // Track class usage
          usage.imports.forEach(importStmt => {
            const className = this.extractClassName(importStmt);
            if (!classUsageMap.has(className)) {
              classUsageMap.set(className, new Set());
            }
            classUsageMap.get(className)!.add(filePath);
          });
        }
      } catch (error: any) {
        console.error(`[CodebaseAnalyzer] ⚠️  Failed to analyze ${filePath}: ${error.message}`);
      }
    }

    // Sort files by usage count
    fileUsages.sort((a, b) => b.usageCount - a.usageCount);

    // Calculate most used classes
    const mostUsedClasses: ClassUsageCount[] = Array.from(classUsageMap.entries())
      .map(([className, files]) => ({
        className,
        count: files.size,
        files: Array.from(files),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10

    // Check for deprecated usage
    const deprecatedUsage: DeprecatedUsage[] = [];
    if (checkDeprecated) {
      for (const fileUsage of fileUsages) {
        const content = await fs.readFile(fileUsage.filePath, 'utf-8');
        const deprecated = this.findDeprecatedUsage(
          fileUsage.filePath,
          content,
          groupId || packageName
        );
        deprecatedUsage.push(...deprecated);
      }
    }

    // Calculate impact score
    const impactScore = this.calculateImpactScore(fileUsages.length, mostUsedClasses.length);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      fileUsages.length,
      deprecatedUsage.length,
      impactScore
    );

    console.error(`[CodebaseAnalyzer] ✅ Analysis complete: ${fileUsages.length} files, ${mostUsedClasses.length} classes`);

    return {
      library,
      totalFiles: fileUsages.length,
      files: fileUsages,
      mostUsedClasses,
      deprecatedUsage,
      impactScore,
      recommendation,
    };
  }

  /**
   * Parse library identifier
   */
  private parseLibrary(library: string): {
    groupId?: string;
    artifactId?: string;
    packageName: string;
  } {
    if (library.includes(':')) {
      // Maven format: org.bouncycastle:bc-fips
      const [groupId, artifactId] = library.split(':');
      return { groupId, artifactId, packageName: groupId };
    } else if (library.includes('/')) {
      // NPM scoped: @angular/core
      return { packageName: library };
    } else {
      // Simple package name
      return { packageName: library };
    }
  }

  /**
   * Find all source files in project
   */
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const sourceFiles: string[] = [];
    const extensions = ['.java', '.ts', '.tsx', '.js', '.jsx', '.py'];

    async function walk(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip common directories
          if (entry.isDirectory()) {
            const skipDirs = ['node_modules', '.git', 'target', 'build', 'dist', '.gradle'];
            if (!skipDirs.includes(entry.name)) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              sourceFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await walk(projectPath);
    return sourceFiles;
  }

  /**
   * Analyze a single file for library usage
   */
  private async analyzeFile(
    filePath: string,
    content: string,
    packageName: string,
    options: { findImports: boolean; findMethodCalls: boolean }
  ): Promise<FileUsage> {
    const imports: string[] = [];
    const lines: number[] = [];
    let usageCount = 0;

    const contentLines = content.split('\n');

    // Find imports
    if (options.findImports) {
      contentLines.forEach((line, index) => {
        // Java: import org.bouncycastle.crypto.fips.*
        // JavaScript/TypeScript: import { something } from 'package'
        // Python: from package import something
        const javaImport = line.match(/import\s+([\w.]+)/);
        const jsImport = line.match(/from\s+['"]([^'"]+)['"]/);
        const pyImport = line.match(/from\s+([\w.]+)\s+import/);

        const importedPackage =
          javaImport?.[1] || jsImport?.[1] || pyImport?.[1];

        if (importedPackage && importedPackage.includes(packageName)) {
          imports.push(importedPackage);
          lines.push(index + 1);
          usageCount++;
        }
      });
    }

    // Find method calls (approximate - looks for class names from package)
    if (options.findMethodCalls) {
      // Extract potential class names from package
      const classPatterns = this.generateClassPatterns(packageName);

      contentLines.forEach((line, index) => {
        classPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            usageCount++;
            if (!lines.includes(index + 1)) {
              lines.push(index + 1);
            }
          }
        });
      });
    }

    return {
      filePath,
      imports,
      usageCount,
      lines,
    };
  }

  /**
   * Generate regex patterns for finding class usage
   */
  private generateClassPatterns(packageName: string): RegExp[] {
    const patterns: RegExp[] = [];

    // Common class name patterns based on package
    if (packageName.includes('bouncycastle')) {
      patterns.push(
        /Fips[A-Z][a-zA-Z]+/g, // FipsRSA, FipsAES, etc.
        /BC[A-Z][a-zA-Z]+/g // BCrypt, BCProvider, etc.
      );
    } else if (packageName.includes('springframework')) {
      patterns.push(/Spring[A-Z][a-zA-Z]+/g);
    } else if (packageName.includes('jackson')) {
      patterns.push(/Object[A-Z][a-zA-Z]+/g, /Json[A-Z][a-zA-Z]+/g);
    }

    return patterns;
  }

  /**
   * Extract class name from import statement
   */
  private extractClassName(importStmt: string): string {
    const parts = importStmt.split('.');
    return parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Find deprecated usage patterns
   */
  private findDeprecatedUsage(
    filePath: string,
    content: string,
    libraryKey: string
  ): DeprecatedUsage[] {
    const deprecated: DeprecatedUsage[] = [];
    const contentLines = content.split('\n');

    // Find matching deprecated patterns
    const patterns = this.deprecatedPatterns[libraryKey] || [];

    contentLines.forEach((line, index) => {
      patterns.forEach(({ pattern, suggestion }) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            deprecated.push({
              file: filePath,
              line: index + 1,
              usage: match,
              suggestion,
            });
          });
        }
      });
    });

    return deprecated;
  }

  /**
   * Calculate impact score based on usage
   */
  private calculateImpactScore(
    fileCount: number,
    classCount: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const totalImpact = fileCount + classCount * 2;

    if (totalImpact === 0) return 'low';
    if (totalImpact <= 5) return 'low';
    if (totalImpact <= 15) return 'medium';
    if (totalImpact <= 30) return 'high';
    return 'critical';
  }

  /**
   * Generate upgrade recommendation
   */
  private generateRecommendation(
    fileCount: number,
    deprecatedCount: number,
    impactScore: string
  ): string {
    if (fileCount === 0) {
      return '✅ Library not used in codebase - safe to remove or upgrade';
    }

    if (impactScore === 'critical') {
      return `⚠️  CRITICAL IMPACT: Used in ${fileCount} files. Requires careful testing and staged rollout.`;
    }

    if (impactScore === 'high') {
      return `⚠️  HIGH IMPACT: Used in ${fileCount} files. Recommend comprehensive testing before deployment.`;
    }

    if (deprecatedCount > 0) {
      return `⚠️  Deprecated usage detected (${deprecatedCount} instances). Review and update before upgrading.`;
    }

    if (impactScore === 'medium') {
      return `✅ MEDIUM IMPACT: Used in ${fileCount} files. Standard testing should be sufficient.`;
    }

    return `✅ LOW IMPACT: Used in ${fileCount} files. Upgrade should be straightforward.`;
  }

  /**
   * Format usage report for display
   */
  formatReport(usage: LibraryUsage): string {
    let report = `# 📦 Library Usage Analysis: ${usage.library}\n\n`;

    // Summary
    report += `## 📊 Summary\n\n`;
    report += `- **Files using this library:** ${usage.totalFiles}\n`;
    report += `- **Impact Score:** ${usage.impactScore.toUpperCase()}\n`;
    report += `- **Deprecated Usage:** ${usage.deprecatedUsage.length} instances\n`;
    report += `\n**Recommendation:** ${usage.recommendation}\n\n`;

    // Most used classes
    if (usage.mostUsedClasses.length > 0) {
      report += `## 🔧 Most Used Classes\n\n`;
      usage.mostUsedClasses.slice(0, 5).forEach((cls, index) => {
        report += `${index + 1}. **${cls.className}** - ${cls.count} file(s)\n`;
      });
      report += '\n';
    }

    // Files using library (top 10)
    if (usage.files.length > 0) {
      report += `## 📁 Files Using This Library (Top ${Math.min(10, usage.files.length)})\n\n`;
      usage.files.slice(0, 10).forEach((file, index) => {
        const relativePath = file.filePath.split('/').slice(-4).join('/');
        report += `${index + 1}. \`${relativePath}\` (${file.imports.length} imports, ${file.usageCount} usages)\n`;
      });

      if (usage.files.length > 10) {
        report += `\n... and ${usage.files.length - 10} more files\n`;
      }
      report += '\n';
    }

    // Deprecated usage
    if (usage.deprecatedUsage.length > 0) {
      report += `## ⚠️  Deprecated Usage Detected\n\n`;
      usage.deprecatedUsage.forEach(dep => {
        const relativePath = dep.file.split('/').slice(-4).join('/');
        report += `- **${dep.usage}** in \`${relativePath}:${dep.line}\`\n`;
        report += `  → ${dep.suggestion}\n`;
      });
      report += '\n';
    }

    // Next steps
    report += `## 🎯 Recommended Actions\n\n`;

    if (usage.impactScore === 'critical') {
      report += `1. ⚠️  **Review all ${usage.totalFiles} affected files**\n`;
      report += `2. 🧪 **Create comprehensive test suite**\n`;
      report += `3. 🚀 **Staged rollout**: Test → Staging → Production\n`;
      report += `4. 📊 **Monitor metrics closely** after deployment\n`;
      report += `5. 🔄 **Prepare rollback plan**\n`;
    } else if (usage.impactScore === 'high') {
      report += `1. 📝 **Review affected files** (${usage.totalFiles} files)\n`;
      report += `2. 🧪 **Run full test suite**\n`;
      report += `3. 🚀 **Deploy to staging first**\n`;
      report += `4. ✅ **Verify functionality** before production\n`;
    } else if (usage.deprecatedUsage.length > 0) {
      report += `1. ⚠️  **Fix deprecated usage** (${usage.deprecatedUsage.length} instances)\n`;
      report += `2. 🧪 **Run affected tests**\n`;
      report += `3. 🚀 **Deploy after fixes**\n`;
    } else {
      report += `1. 🧪 **Run standard test suite**\n`;
      report += `2. 🚀 **Deploy to staging**\n`;
      report += `3. ✅ **Verify and deploy to production**\n`;
    }

    return report;
  }
}











