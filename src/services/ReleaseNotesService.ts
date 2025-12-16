/**
 * Release Notes Service - Fetches and analyzes library release notes
 * 
 * Copyright (c) 2024 Darshan Hanumanthappa <darshan.hanumanthappa@gmail.com>
 * Licensed under the MIT License
 */

import axios from 'axios';

interface ReleaseNote {
  version: string;
  name: string;
  body: string;
  published_at: string;
  url: string;
}

export interface MavenMetadata {
  latestVersion: string;
  groupId: string;
  artifactId: string;
  timestamp?: number;
  versionCount?: number;
  allVersions?: string[]; // Add this for upgrade strategy
}

interface LibraryReleaseInfo {
  library: string;
  fromVersion: string;
  toVersion: string;
  releases: ReleaseNote[];
  maven: MavenMetadata | null;
  summary: string;
  breakingChanges: string[];
  securityFixes: string[];
  deprecations: string[];
}

export class ReleaseNotesService {
  // Cache for discovered GitHub repos
  private githubRepoCache: Map<string, string | null> = new Map();

  /**
   * Get comprehensive release information for a library upgrade
   */
  async getLibraryReleaseInfo(libraryId: string, fromVersion: string, toVersion: string): Promise<LibraryReleaseInfo> {
    console.error(`[DEBUG] 📚 Fetching release info for ${libraryId}: ${fromVersion} → ${toVersion}`);

    const result: LibraryReleaseInfo = {
      library: libraryId,
      fromVersion,
      toVersion,
      releases: [],
      maven: null,
      summary: '',
      breakingChanges: [],
      securityFixes: [],
      deprecations: []
    };

    // Parse library ID
    const parsed = this.parseLibraryId(libraryId);
    if (!parsed) {
      result.summary = 'Invalid library identifier format';
      return result;
    }

    const { groupId, artifactId } = parsed;

    // Fetch Maven metadata
    try {
      result.maven = await this.fetchMavenMetadataInternal(groupId, artifactId);
      if (result.maven) {
        console.error(`[DEBUG]    ✅ Maven Latest: ${result.maven.latestVersion}`);
      }
    } catch (error: any) {
      console.error(`[DEBUG]    ⚠️  Could not fetch Maven metadata: ${error.message}`);
    }

    // Try to discover GitHub repository for this library
    console.error(`[DEBUG]    🔍 Discovering GitHub repository for ${groupId}:${artifactId}...`);
    const repoPath = await this.discoverGitHubRepo(groupId, artifactId);
    
    if (repoPath) {
      console.error(`[DEBUG]    ✅ Found GitHub repo: https://github.com/${repoPath}`);
      
      try {
        result.releases = await this.fetchGitHubReleases(repoPath, fromVersion, toVersion);
        
        if (result.releases.length > 0) {
          console.error(`[DEBUG]    ✅ Found ${result.releases.length} GitHub releases`);
          console.error(`[DEBUG]    📝 Analyzing releases for breaking changes, security fixes, and deprecations...`);
          // Analyze releases for important changes
          this.analyzeReleases(result);
          console.error(`[DEBUG]    ✅ Analysis complete: ${result.breakingChanges.length} breaking changes, ${result.securityFixes.length} security fixes, ${result.deprecations.length} deprecations`);
        } else {
          console.error(`[DEBUG]    ℹ️  No GitHub releases found for version range ${fromVersion} → ${toVersion}`);
          console.error(`[DEBUG]    💡 Tip: Check if the version numbers match the GitHub release tags at https://github.com/${repoPath}/releases`);
        }
      } catch (error: any) {
        console.error(`[DEBUG]    ❌ Could not fetch GitHub releases: ${error.message}`);
        if (error.response) {
          console.error(`[DEBUG]    ❌ GitHub API error: ${error.response.status} - ${error.response.statusText}`);
        }
      }
    } else {
      console.error(`[DEBUG]    ⚠️  Could not discover GitHub repository for ${groupId}:${artifactId}`);
      console.error(`[DEBUG]    💡 This could mean:`);
      console.error(`[DEBUG]       - The library's pom.xml doesn't have an SCM URL`);
      console.error(`[DEBUG]       - The SCM URL is not a GitHub repository`);
      console.error(`[DEBUG]       - Maven Central doesn't have the pom.xml for this library`);
    }

    // Generate summary
    result.summary = this.generateSummary(result);

    return result;
  }

  /**
   * Parse library identifier (e.g., "org.apache.commons:commons-lang3")
   */
  private parseLibraryId(libraryId: string): { groupId: string; artifactId: string } | null {
    if (libraryId.includes(':')) {
      const [groupId, artifactId] = libraryId.split(':');
      return { groupId, artifactId };
    }
    return null;
  }

  /**
   * Fetch Maven Central metadata (using repository XML for accurate latest version)
   * Public method for use by other services
   */
  async fetchMavenMetadata(libraryId: string): Promise<MavenMetadata | null> {
    const parsed = this.parseLibraryId(libraryId);
    if (!parsed) return null;
    
    return this.fetchMavenMetadataInternal(parsed.groupId, parsed.artifactId);
  }

  /**
   * Internal method to fetch Maven metadata
   */
  private async fetchMavenMetadataInternal(groupId: string, artifactId: string): Promise<MavenMetadata | null> {
    try {
      // Use Maven repository metadata XML (more accurate than search API)
      const groupPath = groupId.replace(/\./g, '/');
      const metadataUrl = `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/maven-metadata.xml`;
      
      const response = await axios.get(metadataUrl, { timeout: 10000 });
      const xmlData = response.data;
      
      // Parse XML to extract latest version (including versions with .Final, .RELEASE, etc.)
      let latestMatch = xmlData.match(/<latest>([^<]+)<\/latest>/);
      const releaseMatch = xmlData.match(/<release>([^<]+)<\/release>/);
      const versionsMatch = xmlData.match(/<versions>([\s\S]*?)<\/versions>/);
      
      let versionCount = 0;
      let allVersions: string[] = [];
      if (versionsMatch) {
        const versions = versionsMatch[1].match(/<version>/g);
        versionCount = versions ? versions.length : 0;
        
        // Extract all version strings
        const versionMatches = versionsMatch[1].match(/<version>([^<]+)<\/version>/g);
        if (versionMatches) {
          allVersions = versionMatches
            .map((v: string) => v.match(/<version>([^<]+)<\/version>/)?.[1])
            .filter((v: string | undefined): v is string => v !== undefined);
        }
      }
      
      // Helper to check if version is stable
      const isStable = (v: string) => 
        !v.includes('Alpha') && 
        !v.includes('Beta') && 
        !v.includes('RC') && 
        !v.includes('SNAPSHOT') && 
        !v.includes('-M');
      
      // Check if <latest> or <release> tags exist and are stable
      let latestVersion: string | null = null;
      
      if (latestMatch && isStable(latestMatch[1])) {
        latestVersion = latestMatch[1];
      } else if (releaseMatch && isStable(releaseMatch[1])) {
        latestVersion = releaseMatch[1];
      }
      
      // If no stable version from tags, parse all versions and find last stable one
      if (!latestVersion && versionsMatch) {
        const versionMatches = versionsMatch[1].match(/<version>([^<]+)<\/version>/g);
        if (versionMatches && versionMatches.length > 0) {
          const stableVersions = versionMatches
            .map((v: string) => v.match(/<version>([^<]+)<\/version>/)?.[1])
            .filter((v: string | undefined): v is string => v !== undefined && isStable(v));
          
          if (stableVersions.length > 0) {
            latestVersion = stableVersions[stableVersions.length - 1];
          }
        }
      }
      
      if (latestVersion) {
        return {
          latestVersion,
          groupId,
          artifactId,
          versionCount,
          allVersions
        };
      }
    } catch (error) {
      // Fallback to search API if XML fetch fails
      console.error(`[DEBUG]    ⚠️  Maven XML fetch failed, trying search API...`);
      
      try {
        const searchUrl = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;
        const response = await axios.get(searchUrl, { timeout: 10000 });
        
        if (response.data.response.numFound > 0) {
          const doc = response.data.response.docs[0];
          return {
            latestVersion: doc.latestVersion,
            groupId: doc.g,
            artifactId: doc.a,
            timestamp: doc.timestamp,
            versionCount: doc.versionCount
          };
        }
      } catch (searchError) {
        throw new Error(`Maven Central request failed`);
      }
    }
    
    return null;
  }

  /**
   * Fetch release notes for a specific version
   * Used by ChangelogAnalyzer
   */
  async fetchReleaseNotes(libraryId: string, version: string): Promise<string | null> {
    const parsed = this.parseLibraryId(libraryId);
    if (!parsed) return null;
    
    const { groupId, artifactId } = parsed;
    const repoPath = await this.discoverGitHubRepo(groupId, artifactId);
    
    if (!repoPath) return null;
    
    try {
      const releases = await this.fetchGitHubReleases(repoPath, '', version);
      const targetRelease = releases.find(r => r.version === version || r.name.includes(version));
      
      return targetRelease ? targetRelease.body : null;
    } catch (error) {
      console.error(`[ERROR] Failed to fetch release notes:`, error);
      return null;
    }
  }

  /**
   * Discover GitHub repository for a Maven library by checking pom.xml
   */
  private async discoverGitHubRepo(groupId: string, artifactId: string): Promise<string | null> {
    const cacheKey = `${groupId}:${artifactId}`;
    
    // Check cache first
    if (this.githubRepoCache.has(cacheKey)) {
      return this.githubRepoCache.get(cacheKey) || null;
    }

    try {
      // Fetch pom.xml from Maven Central
      const groupPath = groupId.replace(/\./g, '/');
      
      // Try to get the latest version's pom
      const metadataUrl = `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/maven-metadata.xml`;
      const metadataResponse = await axios.get(metadataUrl, { timeout: 5000 });
      const metadataXml = metadataResponse.data;
      
      // Try <latest> tag first (any version format)
      let latestMatch = metadataXml.match(/<latest>([^<]+)<\/latest>/);
      // Then try <release> tag
      if (!latestMatch) {
        latestMatch = metadataXml.match(/<release>([^<]+)<\/release>/);
      }
      // If still not found, grab the last stable version from versions list
      if (!latestMatch) {
        const versionsMatch = metadataXml.match(/<versions>([\s\S]*?)<\/versions>/);
        if (versionsMatch) {
          // Get all versions (including .Final, .RELEASE, etc.)
          const versionMatches = versionsMatch[1].match(/<version>([^<]+)<\/version>/g);
          if (versionMatches && versionMatches.length > 0) {
            // Filter out Alpha, Beta, RC, SNAPSHOT, M versions
            const stableVersions = versionMatches
              .map((v: string) => v.match(/<version>([^<]+)<\/version>/)?.[1])
              .filter((v: string | undefined): v is string => 
                v !== undefined && 
                !v.includes('Alpha') && 
                !v.includes('Beta') && 
                !v.includes('RC') && 
                !v.includes('SNAPSHOT') && 
                !v.includes('-M')
              );
            
            if (stableVersions.length > 0) {
              // Use the last stable version
              latestMatch = [null, stableVersions[stableVersions.length - 1]];
            } else {
              // If no stable versions, just use the last one
              const lastVersion = versionMatches[versionMatches.length - 1].match(/<version>([^<]+)<\/version>/)?.[1];
              if (lastVersion) {
                latestMatch = [null, lastVersion];
              }
            }
          }
        }
      }
      
      const version = latestMatch ? latestMatch[1] : null;
      
      if (!version) {
        this.githubRepoCache.set(cacheKey, null);
        return null;
      }

      // Fetch pom.xml for that version
      const pomUrl = `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`;
      const pomResponse = await axios.get(pomUrl, { timeout: 5000 });
      const pomXml = pomResponse.data;

      // Extract SCM URL from pom.xml
      const scmMatch = pomXml.match(/<scm>[\s\S]*?<url>(.*?)<\/url>[\s\S]*?<\/scm>/i);
      let scmUrl = scmMatch ? scmMatch[1] : null;

      // Also try connection tag
      if (!scmUrl) {
        const connectionMatch = pomXml.match(/<scm>[\s\S]*?<connection>(.*?)<\/connection>[\s\S]*?<\/scm>/i);
        scmUrl = connectionMatch ? connectionMatch[1] : null;
      }

      if (scmUrl) {
        // Extract GitHub repo path from SCM URL
        // Formats: 
        // - https://github.com/owner/repo
        // - git@github.com:owner/repo.git
        // - scm:git:git://github.com/owner/repo.git
        // - https://github.com/owner/repo/module (Netty style)
        let githubMatch = scmUrl.match(/github\.com[\/:]([^\/\s]+\/[^\/\s]+?)(?:\/|\.git|$)/i);
        if (githubMatch) {
          let repoPath = githubMatch[1].replace(/\.git$/, '');
          // Remove any trailing module paths
          repoPath = repoPath.split('/').slice(0, 2).join('/');
          this.githubRepoCache.set(cacheKey, repoPath);
          return repoPath;
        }
      }

      // If no SCM found, cache null to avoid repeated lookups
      this.githubRepoCache.set(cacheKey, null);
      return null;
    } catch (error: any) {
      // Cache null on error to avoid repeated failed lookups
      this.githubRepoCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Fetch GitHub releases
   */
  private async fetchGitHubReleases(repoPath: string, fromVersion: string, toVersion: string): Promise<ReleaseNote[]> {
    const url = `https://api.github.com/repos/${repoPath}/releases`;
    
    // Prepare headers with optional GitHub token for higher rate limits
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Jira-Resolution-MCP/1.0'
    };
    
    // Add GitHub token if available (increases rate limit from 60/hr to 5000/hr)
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_API_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
      console.error(`[DEBUG]    🔑 Using GitHub token for authenticated API access`);
    } else {
      console.error(`[DEBUG]    ⚠️  No GitHub token found - using unauthenticated API (60 requests/hr limit)`);
    }
    
    console.error(`[DEBUG]    📡 Fetching GitHub releases from ${url}`);
    
    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });

    console.error(`[DEBUG]    ✅ GitHub API returned ${response.data.length} total releases`);

    const releases = response.data;
    const relevantReleases = releases
      .filter((release: any) => {
        const version = this.normalizeVersion(release.tag_name);
        return this.isVersionInRange(version, fromVersion, toVersion);
      })
      .map((release: any) => ({
        version: this.normalizeVersion(release.tag_name),
        name: release.name || release.tag_name,
        body: release.body || '',
        published_at: release.published_at,
        url: release.html_url
      }));

    console.error(`[DEBUG]    📝 Found ${relevantReleases.length} releases in version range ${fromVersion} → ${toVersion}`);
    
    // Log the first few releases for debugging
    if (relevantReleases.length > 0) {
      console.error(`[DEBUG]    📋 Release versions: ${relevantReleases.slice(0, 5).map((r: ReleaseNote) => r.version).join(', ')}${relevantReleases.length > 5 ? '...' : ''}`);
    }

    return relevantReleases;
  }

  /**
   * Analyze releases for breaking changes, security fixes, etc.
   */
  private analyzeReleases(result: LibraryReleaseInfo): void {
    result.releases.forEach(release => {
      const body = release.body || '';
      const bodyLower = body.toLowerCase();

      // Check for breaking changes
      if (bodyLower.includes('breaking') || bodyLower.includes('incompatible') || 
          bodyLower.includes('backward incompatible')) {
        result.breakingChanges.push(`${release.version}: ${release.name}`);
      }

      // Check for security fixes
      if (bodyLower.includes('security') || bodyLower.includes('cve-') || 
          bodyLower.includes('vulnerability')) {
        result.securityFixes.push(`${release.version}: Security fixes included`);
      }

      // Check for deprecations
      if (bodyLower.includes('deprecat') || bodyLower.includes('removed')) {
        result.deprecations.push(`${release.version}: Contains deprecations/removals`);
      }
    });
  }

  /**
   * Generate a comprehensive summary
   */
  private generateSummary(result: LibraryReleaseInfo): string {
    let summary = `# Release Notes Analysis: ${result.library}\n`;
    summary += `**Upgrade:** ${result.fromVersion} → ${result.toVersion}\n\n`;

    if (result.maven) {
      summary += `## Maven Central Info\n`;
      summary += `- **Latest Version:** ${result.maven.latestVersion}\n`;
      summary += `- **Total Versions:** ${result.maven.versionCount || 'Unknown'}\n\n`;
    }

    if (result.breakingChanges.length > 0) {
      summary += `## ⚠️  BREAKING CHANGES DETECTED\n`;
      result.breakingChanges.forEach(change => {
        summary += `- ${change}\n`;
      });
      summary += `\n`;
    }

    if (result.securityFixes.length > 0) {
      summary += `## 🔒 SECURITY FIXES\n`;
      result.securityFixes.forEach(fix => {
        summary += `- ${fix}\n`;
      });
      summary += `\n`;
    }

    if (result.deprecations.length > 0) {
      summary += `## 📢 DEPRECATIONS/REMOVALS\n`;
      result.deprecations.forEach(dep => {
        summary += `- ${dep}\n`;
      });
      summary += `\n`;
    }

    if (result.releases.length > 0) {
      summary += `## 📋 Release Details\n`;
      result.releases.forEach(release => {
        summary += `\n### ${release.version} (${new Date(release.published_at).toLocaleDateString()})\n`;
        summary += `**Name:** ${release.name}\n`;
        summary += `**URL:** ${release.url}\n`;
        if (release.body) {
          const bodyPreview = release.body.substring(0, 500);
          summary += `\n**Release Notes:**\n${bodyPreview}${release.body.length > 500 ? '...' : ''}\n`;
        }
      });
    } else {
      summary += `## ℹ️  No detailed release notes found\n`;
      summary += `Please check the official documentation for breaking changes.\n`;
    }

    return summary;
  }

  /**
   * Normalize version string
   */
  private normalizeVersion(version: string): string {
    return version.replace(/^v/, '').replace(/^rel\//, '').replace(/^release-/, '');
  }

  /**
   * Check if version is in the range [fromVersion, toVersion]
   */
  private isVersionInRange(version: string, fromVersion: string, toVersion: string): boolean {
    // Simple comparison - could be enhanced with proper semver
    const normalizedFrom = this.normalizeVersion(fromVersion);
    const normalizedTo = this.normalizeVersion(toVersion);
    const normalizedVersion = this.normalizeVersion(version);
    
    return normalizedVersion >= normalizedFrom && normalizedVersion <= normalizedTo;
  }
}

