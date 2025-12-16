import { ReleaseNotesService } from './ReleaseNotesService';

export interface ChangelogAnalysis {
  breakingChanges: string[];
  deprecations: string[];
  securityFixes: string[];
  features: string[];
  bugFixes: string[];
  confidence: 'low' | 'medium' | 'high';
  rawChangelog?: string;
}

export class ChangelogAnalyzer {
  private releaseNotesService: ReleaseNotesService;

  constructor() {
    this.releaseNotesService = new ReleaseNotesService();
  }

  /**
   * Fetch and analyze changelog between versions
   */
  async analyzeChangelog(
    packageName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<ChangelogAnalysis> {
    console.error(`[DEBUG] ChangelogAnalyzer: Analyzing changes from ${fromVersion} to ${toVersion}`);
    
    try {
      // Fetch release notes from GitHub
      const releaseNotes = await this.releaseNotesService.fetchReleaseNotes(packageName, toVersion);
      
      if (!releaseNotes) {
        console.error('[DEBUG] ChangelogAnalyzer: No release notes found');
        return {
          breakingChanges: [],
          deprecations: [],
          securityFixes: [],
          features: [],
          bugFixes: [],
          confidence: 'low'
        };
      }
      
      // Parse with regex patterns
      return this.parseWithRegex(releaseNotes);
    } catch (error: any) {
      console.error(`[ERROR] Failed to analyze changelog:`, error);
      return {
        breakingChanges: [],
        deprecations: [],
        securityFixes: [],
        features: [],
        bugFixes: [],
        confidence: 'low'
      };
    }
  }

  /**
   * Parse changelog with regex patterns
   */
  private parseWithRegex(changelog: string): ChangelogAnalysis {
    const breakingPatterns = [
      /BREAKING[\s\-_]?CHANGE[S]?:?\s*(.+)/gi,
      /\[BREAKING\]\s*(.+)/gi,
      /⚠️\s*(.+)/g,
      /Breaking:?\s*(.+)/gi,
      /Removed:?\s*(.+)/gi,
      /\*\*BREAKING\*\*:?\s*(.+)/gi,
      /^[\*\-]\s*\[BREAKING\]\s*(.+)/gim
    ];
    
    const deprecationPatterns = [
      /DEPRECATED:?\s*(.+)/gi,
      /Deprecation:?\s*(.+)/gi,
      /\[DEPRECATED\]\s*(.+)/gi,
      /\*\*DEPRECATED\*\*:?\s*(.+)/gi,
      /^[\*\-]\s*Deprecated:?\s*(.+)/gim
    ];
    
    const securityPatterns = [
      /SECURITY:?\s*(.+)/gi,
      /Security Fix:?\s*(.+)/gi,
      /\[SECURITY\]\s*(.+)/gi,
      /CVE-\d{4}-\d+/g,
      /\*\*SECURITY\*\*:?\s*(.+)/gi,
      /^[\*\-]\s*Security:?\s*(.+)/gim,
      /vulnerability/gi,
      /XSS/gi,
      /SQL injection/gi
    ];
    
    const featurePatterns = [
      /^[\*\-]\s*Added:?\s*(.+)/gim,
      /^[\*\-]\s*New:?\s*(.+)/gim,
      /^[\*\-]\s*Feature:?\s*(.+)/gim,
      /\[FEATURE\]\s*(.+)/gi,
      /^#{2,3}\s*New Features/gim
    ];
    
    const bugFixPatterns = [
      /^[\*\-]\s*Fixed:?\s*(.+)/gim,
      /^[\*\-]\s*Fix:?\s*(.+)/gim,
      /^[\*\-]\s*Bug:?\s*(.+)/gim,
      /\[FIX\]\s*(.+)/gi,
      /^#{2,3}\s*Bug Fixes/gim
    ];
    
    const breakingChanges: string[] = [];
    const deprecations: string[] = [];
    const securityFixes: string[] = [];
    const features: string[] = [];
    const bugFixes: string[] = [];
    
    // Extract breaking changes
    for (const pattern of breakingPatterns) {
      const matches = changelog.matchAll(pattern);
      for (const match of matches) {
        const text = (match[1] || match[0]).trim();
        if (text && text.length > 10) { // Filter out too short matches
          breakingChanges.push(text);
        }
      }
    }
    
    // Extract deprecations
    for (const pattern of deprecationPatterns) {
      const matches = changelog.matchAll(pattern);
      for (const match of matches) {
        const text = (match[1] || match[0]).trim();
        if (text && text.length > 10) {
          deprecations.push(text);
        }
      }
    }
    
    // Extract security fixes
    for (const pattern of securityPatterns) {
      const matches = changelog.matchAll(pattern);
      for (const match of matches) {
        const text = (match[1] || match[0]).trim();
        if (text && text.length > 5) {
          securityFixes.push(text);
        }
      }
    }
    
    // Extract features
    for (const pattern of featurePatterns) {
      const matches = changelog.matchAll(pattern);
      for (const match of matches) {
        const text = (match[1] || match[0]).trim();
        if (text && text.length > 10 && !text.match(/^#{2,3}/)) {
          features.push(text);
        }
      }
    }
    
    // Extract bug fixes
    for (const pattern of bugFixPatterns) {
      const matches = changelog.matchAll(pattern);
      for (const match of matches) {
        const text = (match[1] || match[0]).trim();
        if (text && text.length > 10 && !text.match(/^#{2,3}/)) {
          bugFixes.push(text);
        }
      }
    }
    
    // Deduplicate
    const dedupe = (arr: string[]) => [...new Set(arr.map(s => s.toLowerCase()))].slice(0, 10);
    
    // Calculate confidence based on found items
    let confidence: 'low' | 'medium' | 'high' = 'low';
    const totalFindings = breakingChanges.length + deprecations.length + 
                         securityFixes.length + features.length + bugFixes.length;
    
    if (totalFindings > 10) confidence = 'high';
    else if (totalFindings > 3) confidence = 'medium';
    
    console.error(`[DEBUG] ChangelogAnalyzer: Found ${breakingChanges.length} breaking changes, ${securityFixes.length} security fixes`);
    
    return {
      breakingChanges: dedupe(breakingChanges),
      deprecations: dedupe(deprecations),
      securityFixes: dedupe(securityFixes),
      features: dedupe(features).slice(0, 5), // Top 5 features
      bugFixes: dedupe(bugFixes).slice(0, 5), // Top 5 bug fixes
      confidence,
      rawChangelog: changelog
    };
  }

  /**
   * Analyze multiple versions at once
   */
  async analyzeVersionRange(
    packageName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<ChangelogAnalysis> {
    // For now, just analyze the target version
    // In the future, we could aggregate multiple version changelogs
    return this.analyzeChangelog(packageName, fromVersion, toVersion);
  }

  /**
   * Check if upgrade contains breaking changes
   */
  async hasBreakingChanges(
    packageName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<boolean> {
    const analysis = await this.analyzeChangelog(packageName, fromVersion, toVersion);
    return analysis.breakingChanges.length > 0;
  }

  /**
   * Get security-related changes only
   */
  async getSecurityChanges(
    packageName: string,
    version: string
  ): Promise<string[]> {
    const analysis = await this.analyzeChangelog(packageName, '', version);
    return analysis.securityFixes;
  }

  /**
   * Generate a summary of changes
   */
  generateSummary(analysis: ChangelogAnalysis): string {
    let summary = '';
    
    if (analysis.breakingChanges.length > 0) {
      summary += `⚠️  **${analysis.breakingChanges.length} Breaking Change(s)**\n`;
      summary += analysis.breakingChanges.slice(0, 3).map(c => `- ${c}`).join('\n');
      if (analysis.breakingChanges.length > 3) {
        summary += `\n- ...and ${analysis.breakingChanges.length - 3} more`;
      }
      summary += '\n\n';
    }
    
    if (analysis.securityFixes.length > 0) {
      summary += `🔒 **${analysis.securityFixes.length} Security Fix(es)**\n`;
      summary += analysis.securityFixes.slice(0, 3).map(c => `- ${c}`).join('\n');
      if (analysis.securityFixes.length > 3) {
        summary += `\n- ...and ${analysis.securityFixes.length - 3} more`;
      }
      summary += '\n\n';
    }
    
    if (analysis.deprecations.length > 0) {
      summary += `📢 **${analysis.deprecations.length} Deprecation(s)**\n`;
      summary += analysis.deprecations.slice(0, 3).map(c => `- ${c}`).join('\n');
      summary += '\n\n';
    }
    
    if (analysis.features.length > 0) {
      summary += `✨ **${analysis.features.length} New Feature(s)**\n`;
      summary += analysis.features.slice(0, 3).map(c => `- ${c}`).join('\n');
      summary += '\n\n';
    }
    
    if (summary === '') {
      summary = '✅ No significant changes detected (or changelog not available)\n';
    }
    
    summary += `\n_Confidence: ${analysis.confidence}_`;
    
    return summary;
  }
}







