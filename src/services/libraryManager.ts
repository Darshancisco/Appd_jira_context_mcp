/**
 * JIRA Resolution MCP Server - Library Management Service
 * 
 * Copyright (c) 2024 Darshan Hanumanthappa <darshan.hanumanthappa@gmail.com>
 * Licensed under the MIT License
 */

import axios from 'axios';

export interface LibraryInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  repository: 'maven' | 'npm' | 'pypi';
  hasVulnerabilities?: boolean;
  vulnerabilities?: Vulnerability[];
  releaseDate?: string;
  changelog?: string;
}

export interface Vulnerability {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  fixedInVersion?: string;
  cvssScore?: number;
}

export interface UpgradeRecommendation {
  library: string;
  from: string;
  to: string;
  breaking: boolean;
  reason: string;
  steps: string[];
}

export class LibraryManager {
  /**
   * Check Maven Central for latest version
   */
  async checkMavenLibrary(groupId: string, artifactId: string, currentVersion: string): Promise<LibraryInfo> {
    try {
      const searchUrl = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;
      const response = await axios.get(searchUrl);
      
      const docs = response.data.response?.docs;
      if (!docs || docs.length === 0) {
        throw new Error(`Library ${groupId}:${artifactId} not found in Maven Central`);
      }

      const latestVersion = docs[0].latestVersion;
      const timestamp = docs[0].timestamp;

      return {
        name: `${groupId}:${artifactId}`,
        currentVersion,
        latestVersion,
        repository: 'maven',
        releaseDate: new Date(timestamp).toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to check Maven library: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check NPM registry for latest version
   */
  async checkNpmLibrary(packageName: string, currentVersion: string): Promise<LibraryInfo> {
    try {
      const url = `https://registry.npmjs.org/${packageName}`;
      const response = await axios.get(url);
      
      const latestVersion = response.data['dist-tags'].latest;
      const publishDate = response.data.time[latestVersion];

      return {
        name: packageName,
        currentVersion,
        latestVersion,
        repository: 'npm',
        releaseDate: publishDate,
      };
    } catch (error) {
      throw new Error(`Failed to check NPM library: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check PyPI for latest version
   */
  async checkPyPiLibrary(packageName: string, currentVersion: string): Promise<LibraryInfo> {
    try {
      const url = `https://pypi.org/pypi/${packageName}/json`;
      const response = await axios.get(url);
      
      const latestVersion = response.data.info.version;
      const releases = response.data.releases[latestVersion];
      const releaseDate = releases && releases[0] ? releases[0].upload_time : undefined;

      return {
        name: packageName,
        currentVersion,
        latestVersion,
        repository: 'pypi',
        releaseDate,
      };
    } catch (error) {
      throw new Error(`Failed to check PyPI library: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse library information from ticket description
   */
  parseLibrariesFromTicket(description: string): Array<{type: string, groupId?: string, artifactId?: string, name?: string, version: string}> {
    const libraries: Array<{type: string, groupId?: string, artifactId?: string, name?: string, version: string}> = [];
    
    // Maven pattern: groupId:artifactId:version
    const mavenRegex = /([a-z0-9\.\-_]+):([a-z0-9\.\-_]+):(\d+\.\d+\.\d+[^\s]*)/gi;
    let match;
    
    while ((match = mavenRegex.exec(description)) !== null) {
      libraries.push({
        type: 'maven',
        groupId: match[1],
        artifactId: match[2],
        version: match[3],
      });
    }

    // NPM/package.json pattern
    const npmRegex = /"([a-z0-9@\-_\/]+)":\s*"[\^~]?(\d+\.\d+\.\d+[^\s"]*)"/gi;
    while ((match = npmRegex.exec(description)) !== null) {
      libraries.push({
        type: 'npm',
        name: match[1],
        version: match[2],
      });
    }

    return libraries;
  }

  /**
   * Generate upgrade recommendations
   */
  async generateUpgradeRecommendations(libraries: LibraryInfo[]): Promise<UpgradeRecommendation[]> {
    const recommendations: UpgradeRecommendation[] = [];

    for (const lib of libraries) {
      if (lib.currentVersion !== lib.latestVersion) {
        const isBreaking = this.isBreakingChange(lib.currentVersion, lib.latestVersion);
        
        recommendations.push({
          library: lib.name,
          from: lib.currentVersion,
          to: lib.latestVersion,
          breaking: isBreaking,
          reason: lib.hasVulnerabilities 
            ? `Security vulnerabilities fixed in ${lib.latestVersion}` 
            : `Upgrade available from ${lib.currentVersion} to ${lib.latestVersion}`,
          steps: this.generateUpgradeSteps(lib, isBreaking),
        });
      }
    }

    return recommendations;
  }

  /**
   * Check if version change is breaking (major version change)
   */
  private isBreakingChange(from: string, to: string): boolean {
    const fromMajor = parseInt(from.split('.')[0]);
    const toMajor = parseInt(to.split('.')[0]);
    return toMajor > fromMajor;
  }

  /**
   * Generate upgrade steps based on repository type
   */
  private generateUpgradeSteps(lib: LibraryInfo, isBreaking: boolean): string[] {
    const steps: string[] = [];

    if (lib.repository === 'maven') {
      steps.push(`1. Update pom.xml or build.gradle:`);
      steps.push(`   Change version from ${lib.currentVersion} to ${lib.latestVersion}`);
      steps.push(`2. Run: mvn clean install`);
      if (isBreaking) {
        steps.push(`3. Review breaking changes in changelog`);
        steps.push(`4. Update code for API changes`);
        steps.push(`5. Run full test suite`);
      } else {
        steps.push(`3. Run tests: mvn test`);
      }
    } else if (lib.repository === 'npm') {
      steps.push(`1. Update package.json:`);
      steps.push(`   "${lib.name}": "^${lib.latestVersion}"`);
      steps.push(`2. Run: npm install`);
      if (isBreaking) {
        steps.push(`3. Check migration guide for breaking changes`);
        steps.push(`4. Update code accordingly`);
        steps.push(`5. Run: npm test`);
      } else {
        steps.push(`3. Run: npm test`);
      }
    } else if (lib.repository === 'pypi') {
      steps.push(`1. Update requirements.txt:`);
      steps.push(`   ${lib.name}==${lib.latestVersion}`);
      steps.push(`2. Run: pip install -r requirements.txt`);
      if (isBreaking) {
        steps.push(`3. Review changelog for breaking changes`);
        steps.push(`4. Update imports and API calls`);
        steps.push(`5. Run: pytest`);
      } else {
        steps.push(`3. Run: pytest`);
      }
    }

    return steps;
  }

  /**
   * Check OSV (Open Source Vulnerabilities) database
   */
  async checkVulnerabilities(ecosystem: string, packageName: string, version: string): Promise<Vulnerability[]> {
    try {
      const url = 'https://api.osv.dev/v1/query';
      const response = await axios.post(url, {
        package: {
          ecosystem,
          name: packageName,
        },
        version,
      });

      const vulnerabilities: Vulnerability[] = [];
      
      if (response.data.vulns) {
        for (const vuln of response.data.vulns) {
          vulnerabilities.push({
            id: vuln.id,
            severity: this.mapSeverity(vuln.severity),
            description: vuln.summary || 'No description available',
            cvssScore: vuln.severity?.[0]?.score,
            fixedInVersion: vuln.affected?.[0]?.ranges?.[0]?.events?.find((e: any) => e.fixed)?.fixed,
          });
        }
      }

      return vulnerabilities;
    } catch (error) {
      console.error('Error checking vulnerabilities:', error);
      return [];
    }
  }

  /**
   * Map OSV severity to standard levels
   */
  private mapSeverity(severity: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (!severity || !severity[0]) return 'MEDIUM';
    
    const score = severity[0].score;
    if (score >= 9.0) return 'CRITICAL';
    if (score >= 7.0) return 'HIGH';
    if (score >= 4.0) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate a comprehensive upgrade report
   */
  async generateUpgradeReport(ticketDescription: string, ticketSummary: string = ''): Promise<string> {
    // Try using LibraryAnalyzer for better pattern matching
    let libraries = this.parseLibrariesFromTicket(ticketDescription);
    
    // If simple parsing didn't work, try LibraryAnalyzer (handles JIRA format)
    if (libraries.length === 0) {
      try {
        const { LibraryAnalyzer } = require('./LibraryAnalyzer.js');
        const analyzer = new LibraryAnalyzer();
        const fullText = `${ticketSummary} ${ticketDescription}`;
        const extractedLibs = analyzer.extractLibraries(fullText, 'java');
        
        // Extract library name from summary if needed
        const libraryNameMatch = ticketSummary.match(/upgrade\s+([\w\s-]+?)(?:\s+to|\s+from|$)/i);
        const detectedLibraryName = libraryNameMatch ? libraryNameMatch[1].trim() : null;
        
        // Known library mappings
        const knownLibraries: any = {
          'bouncy castle fips': { groupId: 'org.bouncycastle', artifactId: 'bc-fips', type: 'maven' },
          'bouncy castle': { groupId: 'org.bouncycastle', artifactId: 'bcprov-jdk15on', type: 'maven' },
          'commons-collections': { groupId: 'org.apache.commons', artifactId: 'commons-collections4', type: 'maven' },
          'commons-lang': { groupId: 'org.apache.commons', artifactId: 'commons-lang3', type: 'maven' },
        };
        
        // Convert LibraryAnalyzer format to our format
        libraries = extractedLibs.map((lib: any, index: number) => {
          const libName = lib.name || detectedLibraryName || 'unknown-library';
          const libNameLower = libName.toLowerCase().trim();
          
          // Check if it's a known library (try exact match first, then partial)
          let knownLib = knownLibraries[libNameLower];
          if (!knownLib) {
            // Try partial matching
            for (const [key, value] of Object.entries(knownLibraries)) {
              if (libNameLower.includes(key) || key.includes(libNameLower)) {
                knownLib = value;
                break;
              }
            }
          }
          
          if (knownLib) {
            return {
              type: knownLib.type,
              name: libName,
              version: lib.toVersion || lib.fromVersion || 'unknown',
              fromVersion: lib.fromVersion,
              toVersion: lib.toVersion,
              groupId: knownLib.groupId,
              artifactId: knownLib.artifactId,
            };
          }
          
          // Try to determine if it's Maven or NPM
          let type = 'npm';
          if (libNameLower.includes('bouncy') || 
              libNameLower.includes('castle') ||
              libNameLower.includes('apache') ||
              libNameLower.includes('commons')) {
            type = 'maven';
          }
          
          return {
            type,
            name: libName,
            version: lib.toVersion || lib.fromVersion || 'unknown',
            fromVersion: lib.fromVersion,
            toVersion: lib.toVersion,
            groupId: type === 'maven' && libName.includes(':') ? libName.split(':')[0] : 'org.bouncycastle',
            artifactId: type === 'maven' ? (libName.includes(':') ? libName.split(':')[1] : libName.toLowerCase().replace(/\s+/g, '-')) : undefined,
          };
        });
        
        // If we have multiple versions detected but same library, keep only unique one
        if (libraries.length > 1 && detectedLibraryName) {
          const uniqueLib = libraries[0];
          libraries = [uniqueLib];
        }
        
      } catch (error) {
        console.log('LibraryAnalyzer error:', error);
      }
    }
    
    if (libraries.length === 0) {
      return 'No libraries found in ticket description. Please provide library information in format:\n' +
             '- Maven: groupId:artifactId:version\n' +
             '- NPM: "package-name": "version"\n' +
             '- PyPI: package-name==version\n' +
             '- Or JIRA format: ||current_version|X.Y.Z||remediation|A.B.C||';
    }

    let report = '# Library Upgrade Analysis Report\n\n';
    report += `Found ${libraries.length} libraries to analyze\n\n`;

    for (const lib of libraries) {
      try {
        let libInfo: LibraryInfo;
        
        if (lib.type === 'maven' && lib.groupId && lib.artifactId) {
          libInfo = await this.checkMavenLibrary(lib.groupId, lib.artifactId, lib.version);
          
          // Check vulnerabilities for Maven
          const vulns = await this.checkVulnerabilities('Maven', `${lib.groupId}:${lib.artifactId}`, lib.version);
          libInfo.vulnerabilities = vulns;
          libInfo.hasVulnerabilities = vulns.length > 0;
        } else if (lib.type === 'npm' && lib.name) {
          libInfo = await this.checkNpmLibrary(lib.name, lib.version);
          
          // Check vulnerabilities for NPM
          const vulns = await this.checkVulnerabilities('npm', lib.name, lib.version);
          libInfo.vulnerabilities = vulns;
          libInfo.hasVulnerabilities = vulns.length > 0;
        } else {
          continue;
        }

        report += `## ${libInfo.name}\n`;
        report += `- Current Version: ${libInfo.currentVersion}\n`;
        report += `- Latest Version: ${libInfo.latestVersion}\n`;
        report += `- Status: ${libInfo.currentVersion === libInfo.latestVersion ? '✅ Up to date' : '⚠️ Update available'}\n`;
        
        if (libInfo.hasVulnerabilities && libInfo.vulnerabilities) {
          report += `- **Vulnerabilities:** ${libInfo.vulnerabilities.length} found\n`;
          for (const vuln of libInfo.vulnerabilities) {
            report += `  - [${vuln.severity}] ${vuln.id}: ${vuln.description}\n`;
            if (vuln.fixedInVersion) {
              report += `    Fixed in: ${vuln.fixedInVersion}\n`;
            }
          }
        }
        
        report += '\n';
      } catch (error) {
        report += `## Error checking ${lib.type} library\n`;
        report += `${error instanceof Error ? error.message : String(error)}\n\n`;
      }
    }

    // Generate recommendations
    const allLibs = await Promise.all(
      libraries.map(async (lib) => {
        try {
          if (lib.type === 'maven' && lib.groupId && lib.artifactId) {
            return await this.checkMavenLibrary(lib.groupId, lib.artifactId, lib.version);
          } else if (lib.type === 'npm' && lib.name) {
            return await this.checkNpmLibrary(lib.name, lib.version);
          }
        } catch (e) {
          return null;
        }
        return null;
      })
    );

    const validLibs = allLibs.filter((lib): lib is LibraryInfo => lib !== null);
    const recommendations = await this.generateUpgradeRecommendations(validLibs);

    if (recommendations.length > 0) {
      report += '## Upgrade Recommendations\n\n';
      for (const rec of recommendations) {
        report += `### ${rec.library}\n`;
        report += `Upgrade: ${rec.from} → ${rec.to}\n`;
        report += `Breaking Change: ${rec.breaking ? '⚠️ Yes' : '✅ No'}\n`;
        report += `Reason: ${rec.reason}\n\n`;
        report += 'Steps:\n';
        rec.steps.forEach(step => report += `${step}\n`);
        report += '\n';
      }
    }

    return report;
  }
}

