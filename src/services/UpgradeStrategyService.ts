import * as semver from 'semver';
import { ReleaseNotesService } from './ReleaseNotesService';

export interface VersionRecommendation {
  type: 'none' | 'patch' | 'minor' | 'major' | 'latest';
  version?: string;
  reason: string;
  breakingChanges: boolean;
  breakingChangesList?: string[];
  confidence?: 'low' | 'medium' | 'high';
}

export interface UpgradeStep {
  from: string;
  to: string;
  reason: string;
  breaking?: boolean;
}

export interface UpgradePath {
  direct: boolean;
  steps: UpgradeStep[];
  recommendation?: string;
}

export class UpgradeStrategyService {
  private releaseNotesService: ReleaseNotesService;

  constructor() {
    this.releaseNotesService = new ReleaseNotesService();
  }

  /**
   * Find the minimal safe upgrade (latest version in same major)
   */
  async getMinimalSafeUpgrade(
    packageName: string,
    currentVersion: string
  ): Promise<VersionRecommendation> {
    console.error(`[DEBUG] UpgradeStrategyService: Finding minimal safe upgrade for ${packageName}@${currentVersion}`);
    
    try {
      // Fetch all available versions
      const metadata = await this.releaseNotesService.fetchMavenMetadata(packageName);
      
      if (!metadata) {
        return {
          type: 'none',
          reason: 'Could not fetch version information',
          breakingChanges: false
        };
      }
      
      const allVersions = metadata.allVersions || [];
      
      // Filter to valid semver versions
      const validVersions = allVersions.filter((v: string) => semver.valid(v));
      
      if (validVersions.length === 0) {
        return {
          type: 'none',
          reason: 'No valid versions found',
          breakingChanges: false
        };
      }
      
      // Clean current version for comparison
      const cleanCurrent = semver.valid(semver.coerce(currentVersion));
      if (!cleanCurrent) {
        return {
          type: 'none',
          reason: 'Current version is not valid semver',
          breakingChanges: false
        };
      }
      
      // Find versions newer than current
      const newerVersions = validVersions.filter((v: string) => 
        semver.gt(v, cleanCurrent)
      );
      
      if (newerVersions.length === 0) {
        return {
          type: 'none',
          version: currentVersion,
          reason: 'Already on latest stable version',
          breakingChanges: false
        };
      }
      
      // Get current major version
      const currentMajor = semver.major(cleanCurrent);
      
      // Find latest version in same major (safest upgrade)
      const sameMajorVersions = newerVersions.filter((v: string) => 
        semver.major(v) === currentMajor
      );
      
      if (sameMajorVersions.length > 0) {
        const recommended = sameMajorVersions[sameMajorVersions.length - 1];
        const diffType = semver.diff(cleanCurrent, recommended);
        
        return {
          type: diffType === 'patch' ? 'patch' : 'minor',
          version: recommended,
          reason: `Latest ${diffType} version in same major (no breaking changes expected)`,
          breakingChanges: false,
          confidence: 'high'
        };
      }
      
      // If no same-major versions, suggest next major
      const nextMajor = currentMajor + 1;
      const nextMajorVersions = newerVersions.filter((v: string) => 
        semver.major(v) === nextMajor
      );
      
      if (nextMajorVersions.length > 0) {
        const recommended = nextMajorVersions[0]; // First stable in next major
        
        return {
          type: 'major',
          version: recommended,
          reason: 'Major version upgrade required (breaking changes likely)',
          breakingChanges: true,
          confidence: 'medium'
        };
      }
      
      // Fall back to latest
      return {
        type: 'latest',
        version: newerVersions[newerVersions.length - 1],
        reason: 'Latest available version',
        breakingChanges: true,
        confidence: 'low'
      };
    } catch (error: any) {
      console.error(`[ERROR] Failed to get upgrade recommendation:`, error);
      return {
        type: 'none',
        reason: `Error: ${error.message}`,
        breakingChanges: false
      };
    }
  }

  /**
   * Get upgrade path with intermediate versions if needed
   */
  async getUpgradePath(
    packageName: string,
    currentVersion: string,
    targetVersion: string
  ): Promise<UpgradePath> {
    console.error(`[DEBUG] UpgradeStrategyService: Calculating upgrade path from ${currentVersion} to ${targetVersion}`);
    
    const cleanCurrent = semver.valid(semver.coerce(currentVersion));
    const cleanTarget = semver.valid(semver.coerce(targetVersion));
    
    if (!cleanCurrent || !cleanTarget) {
      return {
        direct: true,
        steps: [{
          from: currentVersion,
          to: targetVersion,
          reason: 'Direct upgrade (versions not semver compliant)'
        }]
      };
    }
    
    const currentMajor = semver.major(cleanCurrent);
    const targetMajor = semver.major(cleanTarget);
    
    // If same major or only one major apart, direct upgrade
    if (targetMajor - currentMajor <= 1) {
      const breaking = targetMajor > currentMajor;
      return {
        direct: true,
        steps: [{
          from: currentVersion,
          to: targetVersion,
          reason: breaking ? 'Direct upgrade (major version change)' : 'Direct upgrade (minor/patch)',
          breaking
        }]
      };
    }
    
    // For multiple major versions, recommend step-by-step
    try {
      const metadata = await this.releaseNotesService.fetchMavenMetadata(packageName);
      if (!metadata) {
        return {
          direct: true,
          steps: [{
            from: currentVersion,
            to: targetVersion,
            reason: 'Direct upgrade (could not fetch version information)',
            breaking: true
          }]
        };
      }
      
      const allVersions = metadata.allVersions?.filter((v: string) => semver.valid(v)) || [];
      const steps: UpgradeStep[] = [];
      
      for (let major = currentMajor + 1; major <= targetMajor; major++) {
        const versionsInMajor = allVersions.filter((v: string) => semver.major(v) === major);
        
        if (versionsInMajor.length > 0) {
          // Use the first stable version in the major (easiest to upgrade to)
          const targetInMajor = major === targetMajor 
            ? targetVersion 
            : versionsInMajor[0];
          
          steps.push({
            from: steps.length === 0 ? currentVersion : steps[steps.length - 1].to,
            to: targetInMajor,
            reason: `Upgrade to v${major}`,
            breaking: true
          });
        }
      }
      
      return {
        direct: false,
        steps,
        recommendation: `For ${targetMajor - currentMajor} major version jumps, consider step-by-step upgrade to handle breaking changes incrementally`
      };
    } catch (error) {
      console.error(`[ERROR] Failed to calculate upgrade path:`, error);
      return {
        direct: true,
        steps: [{
          from: currentVersion,
          to: targetVersion,
          reason: 'Direct upgrade (could not calculate intermediate steps)',
          breaking: true
        }]
      };
    }
  }

  /**
   * Compare two versions and provide upgrade analysis
   */
  analyzeVersionDifference(currentVersion: string, targetVersion: string): {
    type: 'major' | 'minor' | 'patch' | 'prerelease' | 'unknown';
    riskLevel: 'low' | 'medium' | 'high';
    description: string;
  } {
    const cleanCurrent = semver.valid(semver.coerce(currentVersion));
    const cleanTarget = semver.valid(semver.coerce(targetVersion));
    
    if (!cleanCurrent || !cleanTarget) {
      return {
        type: 'unknown',
        riskLevel: 'high',
        description: 'Cannot determine version difference (non-semver format)'
      };
    }
    
    const diff = semver.diff(cleanCurrent, cleanTarget);
    
    switch (diff) {
      case 'patch':
        return {
          type: 'patch',
          riskLevel: 'low',
          description: 'Patch version upgrade (bug fixes only, backward compatible)'
        };
      
      case 'minor':
      case 'preminor':
        return {
          type: 'minor',
          riskLevel: 'low',
          description: 'Minor version upgrade (new features, backward compatible)'
        };
      
      case 'major':
      case 'premajor':
        return {
          type: 'major',
          riskLevel: 'high',
          description: 'Major version upgrade (breaking changes likely)'
        };
      
      case 'prerelease':
      case 'prepatch':
        return {
          type: 'prerelease',
          riskLevel: 'medium',
          description: 'Prerelease version (may be unstable)'
        };
      
      default:
        return {
          type: 'unknown',
          riskLevel: 'medium',
          description: 'Version difference could not be determined'
        };
    }
  }

  /**
   * Get all available stable versions between current and target
   */
  async getVersionsBetween(
    packageName: string,
    currentVersion: string,
    targetVersion: string
  ): Promise<string[]> {
    const metadata = await this.releaseNotesService.fetchMavenMetadata(packageName);
    if (!metadata) return [];
    
    const allVersions = metadata.allVersions?.filter((v: string) => semver.valid(v)) || [];
    
    const cleanCurrent = semver.valid(semver.coerce(currentVersion));
    const cleanTarget = semver.valid(semver.coerce(targetVersion));
    
    if (!cleanCurrent || !cleanTarget) return [];
    
    return allVersions.filter((v: string) => 
      semver.gt(v, cleanCurrent) && semver.lte(v, cleanTarget)
    );
  }
}

