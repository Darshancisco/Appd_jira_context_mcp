import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JiraService } from "./services/jira";
import { LibraryManager } from "./services/libraryManager";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import { PromptGenerator } from "./utils/promptGenerator";
// @ts-ignore - Now using CommonJS versions
import { LibraryAnalyzer } from "./services/LibraryAnalyzer.js";
// @ts-ignore - Now using CommonJS versions
import { RepositoryService } from "./services/RepositoryService.js";
import { ReleaseNotesService } from "./services/ReleaseNotesService";
import { DependencyParser } from "./services/DependencyParser";
import { DependencyTreeService } from "./services/DependencyTreeService";
import { UpgradeStrategyService } from "./services/UpgradeStrategyService";
import { ChangelogAnalyzer } from "./services/ChangelogAnalyzer";
import { CodebaseAnalyzer } from "./services/CodebaseAnalyzer";
import { parseJiraUrl, extractBoardIdFromUrl } from "./utils/url-parser";
import { DatabaseService } from "./services/DatabaseService";

export class JiraMcpServer {
  private readonly server: McpServer;
  private readonly jiraService: JiraService;
  private readonly libraryManager: LibraryManager;
  private readonly libraryAnalyzer: any; // Using any for now since it's JS
  private readonly releaseNotesService: ReleaseNotesService;
  private readonly dependencyParser: DependencyParser;
  private readonly dependencyTreeService: DependencyTreeService;
  private readonly upgradeStrategyService: UpgradeStrategyService;
  private readonly changelogAnalyzer: ChangelogAnalyzer;
  private readonly codebaseAnalyzer: CodebaseAnalyzer;
  private readonly databaseService?: DatabaseService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(
    jiraUrl: string, 
    username: string, 
    apiToken: string,
    dbConfig?: {
      host: string;
      port: number;
      user: string;
      password: string;
      database?: string;
      ssl?: boolean;
    }
  ) {
    this.jiraService = new JiraService(jiraUrl, username, apiToken);
    this.libraryManager = new LibraryManager();
    this.libraryAnalyzer = new LibraryAnalyzer();
    this.releaseNotesService = new ReleaseNotesService();
    this.dependencyParser = new DependencyParser();
    this.dependencyTreeService = new DependencyTreeService();
    this.upgradeStrategyService = new UpgradeStrategyService();
    this.changelogAnalyzer = new ChangelogAnalyzer();
    this.codebaseAnalyzer = new CodebaseAnalyzer();
    
    // Initialize database service if config provided
    if (dbConfig) {
      this.databaseService = new DatabaseService(dbConfig);
      console.error('[DEBUG] Database service initialized and ready');
    }
    
    this.server = new McpServer({
      name: "Jira Resolution MCP Server",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Tool to get issue information
    this.server.tool(
      "get_issue",
      "Get detailed information about a Jira issue",
      {
        issueKey: z.string().describe("The key of the Jira issue to fetch (e.g., PROJECT-123)"),
      },
      async ({ issueKey }) => {
        try {
          console.error(`[DEBUG] Fetching issue: ${issueKey}`);
          const issue = await this.jiraService.getIssue(issueKey);
          console.error(`[DEBUG] Successfully fetched issue: ${issue.key} - ${issue.fields.summary}`);
          return {
            content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching issue ${issueKey}:`, error);
          return {
            content: [{ type: "text", text: `Error fetching issue: ${error}` }],
          };
        }
      },
    );

    // Tool to get assigned issues
    this.server.tool(
      "get_assigned_issues",
      "Get issues assigned to the current user in a project",
      {
        projectKey: z.string().optional().describe("The key of the Jira project to fetch issues from"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      },
      async ({ projectKey, maxResults }) => {
        try {
          console.error(`[DEBUG] Fetching assigned issues${projectKey ? ` for project: ${projectKey}` : ''}`);
          const response = await this.jiraService.getAssignedIssues(projectKey, maxResults);
          console.error(`[DEBUG] Successfully fetched ${response.issues.length} assigned issues`);
          return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching assigned issues:`, error);
          return {
            content: [{ type: "text", text: `Error fetching assigned issues: ${error}` }],
          };
        }
      },
    );

    // Tool to get issues by type
    this.server.tool(
      "get_issues_by_type",
      "Get issues of a specific type",
      {
        issueType: z.string().describe("The type of issue to fetch (e.g., Bug, Story, Epic)"),
        projectKey: z.string().optional().describe("The key of the Jira project to fetch issues from"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      },
      async ({ issueType, projectKey, maxResults }) => {
        try {
          console.error(`[DEBUG] Fetching issues of type: ${issueType}${projectKey ? ` for project: ${projectKey}` : ''}`);
          const response = await this.jiraService.getIssuesByType(issueType, projectKey, maxResults);
          console.error(`[DEBUG] Successfully fetched ${response.issues.length} issues of type ${issueType}`);
          return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching issues by type:`, error);
          return {
            content: [{ type: "text", text: `Error fetching issues by type: ${error}` }],
          };
        }
      },
    );

    // Tool to get projects
    this.server.tool(
      "get_projects",
      "Get list of available Jira projects",
      {},
      async () => {
        try {
          console.error("[DEBUG] Fetching projects");
          const projects = await this.jiraService.getProjects();
          console.error(`[DEBUG] Successfully fetched ${projects.length} projects`);
          return {
            content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
          };
        } catch (error) {
          console.error("Error fetching projects:", error);
          return {
            content: [{ type: "text", text: `Error fetching projects: ${error}` }],
          };
        }
      },
    );

    // Tool to get issue types
    this.server.tool(
      "get_issue_types",
      "Get list of available Jira issue types",
      {},
      async () => {
        try {
          console.error("[DEBUG] Fetching issue types");
          const issueTypes = await this.jiraService.getIssueTypes();
          console.error(`[DEBUG] Successfully fetched issue types`);
          return {
            content: [{ type: "text", text: JSON.stringify(issueTypes, null, 2) }],
          };
        } catch (error) {
          console.error("Error fetching issue types:", error);
          return {
            content: [{ type: "text", text: `Error fetching issue types: ${error}` }],
          };
        }
      },
    );

    // Tool to analyze ticket and generate Cursor prompt
    this.server.tool(
      "analyze_ticket_for_resolution",
      "Analyze a Jira ticket and generate an AI-ready prompt to resolve it",
      {
        issueKey: z.string().describe("The key of the Jira issue to analyze (e.g., PROJECT-123)"),
      },
      async ({ issueKey }) => {
        try {
          console.error(`[DEBUG] Analyzing ticket: ${issueKey} for resolution`);
          
          // Fetch the full issue with comments
          const issue = await this.jiraService.getIssue(issueKey);
          
          // Note: Comments are fetched by Python bridge and included in the response
          const comments = (issue as any).comments || [];
          
          // Generate analysis and prompt
          const analysis = PromptGenerator.analyzeTicket(issue, comments);
          
          console.error(`[DEBUG] Successfully analyzed ticket: ${issueKey}`);
          console.error(`[DEBUG] Generated prompt with ${analysis.actionItems.length} action items`);
          
          return {
            content: [
              { 
                type: "text", 
                text: JSON.stringify({
                  analysis: {
                    ticketKey: analysis.ticketKey,
                    summary: analysis.summary,
                    issueType: analysis.issueType,
                    priority: analysis.priority,
                    technicalDetails: analysis.technicalDetails,
                    actionItems: analysis.actionItems,
                    commentsCount: analysis.comments.length
                  },
                  prompt: analysis.cursorPrompt
                }, null, 2)
              }
            ],
          };
        } catch (error) {
          console.error(`Error analyzing ticket ${issueKey}:`, error);
          return {
            content: [{ type: "text", text: `Error analyzing ticket: ${error}` }],
          };
        }
      },
    );

    // Tool to generate resolution prompt
    this.server.tool(
      "generate_resolution_prompt",
      "Generate a detailed resolution prompt for a Jira ticket",
      {
        issueKey: z.string().describe("The key of the Jira issue (e.g., PROJECT-123)"),
      },
      async ({ issueKey }) => {
        try {
          console.error(`[DEBUG] Generating resolution prompt for: ${issueKey}`);
          
          const issue = await this.jiraService.getIssue(issueKey);
          const comments = (issue as any).comments || [];
          const analysis = PromptGenerator.analyzeTicket(issue, comments);
          
          console.error(`[DEBUG] Successfully generated resolution prompt for: ${issueKey}`);
          
          return {
            content: [{ type: "text", text: analysis.cursorPrompt }],
          };
        } catch (error) {
          console.error(`Error generating prompt for ${issueKey}:`, error);
          return {
            content: [{ type: "text", text: `Error generating prompt: ${error}` }],
          };
        }
      },
    );

    // Tool to check library versions (Maven)
    this.server.tool(
      "check_maven_library",
      "Check latest version of a Maven library and detect vulnerabilities",
      {
        groupId: z.string().describe("Maven group ID (e.g., org.springframework)"),
        artifactId: z.string().describe("Maven artifact ID (e.g., spring-core)"),
        currentVersion: z.string().describe("Current version being used"),
      },
      async ({ groupId, artifactId, currentVersion }) => {
        try {
          console.error(`[DEBUG] Checking Maven library: ${groupId}:${artifactId}`);
          const libInfo = await this.libraryManager.checkMavenLibrary(groupId, artifactId, currentVersion);
          
          // Check for vulnerabilities
          const vulnerabilities = await this.libraryManager.checkVulnerabilities(
            'Maven',
            `${groupId}:${artifactId}`,
            currentVersion
          );
          
          libInfo.vulnerabilities = vulnerabilities;
          libInfo.hasVulnerabilities = vulnerabilities.length > 0;
          
          let response = `# ${libInfo.name}\n\n`;
          response += `**Current Version:** ${libInfo.currentVersion}\n`;
          response += `**Latest Version:** ${libInfo.latestVersion}\n`;
          response += `**Status:** ${libInfo.currentVersion === libInfo.latestVersion ? '✅ Up to date' : '⚠️ Update available'}\n\n`;
          
          if (libInfo.hasVulnerabilities && vulnerabilities.length > 0) {
            response += `## ⚠️ Security Vulnerabilities Found: ${vulnerabilities.length}\n\n`;
            for (const vuln of vulnerabilities) {
              response += `### [${vuln.severity}] ${vuln.id}\n`;
              response += `${vuln.description}\n`;
              if (vuln.fixedInVersion) {
                response += `**Fixed in:** ${vuln.fixedInVersion}\n`;
              }
              if (vuln.cvssScore) {
                response += `**CVSS Score:** ${vuln.cvssScore}\n`;
              }
              response += '\n';
            }
          }
          
          return {
            content: [{ type: "text", text: response }],
          };
        } catch (error) {
          console.error(`Error checking Maven library:`, error);
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          };
        }
      },
    );

    // Tool to check NPM library versions
    this.server.tool(
      "check_npm_library",
      "Check latest version of an NPM library and detect vulnerabilities",
      {
        packageName: z.string().describe("NPM package name (e.g., express, react)"),
        currentVersion: z.string().describe("Current version being used"),
      },
      async ({ packageName, currentVersion }) => {
        try {
          console.error(`[DEBUG] Checking NPM library: ${packageName}`);
          const libInfo = await this.libraryManager.checkNpmLibrary(packageName, currentVersion);
          
          // Check for vulnerabilities
          const vulnerabilities = await this.libraryManager.checkVulnerabilities(
            'npm',
            packageName,
            currentVersion
          );
          
          libInfo.vulnerabilities = vulnerabilities;
          libInfo.hasVulnerabilities = vulnerabilities.length > 0;
          
          let response = `# ${libInfo.name}\n\n`;
          response += `**Current Version:** ${libInfo.currentVersion}\n`;
          response += `**Latest Version:** ${libInfo.latestVersion}\n`;
          response += `**Status:** ${libInfo.currentVersion === libInfo.latestVersion ? '✅ Up to date' : '⚠️ Update available'}\n\n`;
          
          if (libInfo.hasVulnerabilities && vulnerabilities.length > 0) {
            response += `## ⚠️ Security Vulnerabilities Found: ${vulnerabilities.length}\n\n`;
            for (const vuln of vulnerabilities) {
              response += `### [${vuln.severity}] ${vuln.id}\n`;
              response += `${vuln.description}\n`;
              if (vuln.fixedInVersion) {
                response += `**Fixed in:** ${vuln.fixedInVersion}\n`;
              }
              response += '\n';
            }
          }
          
          return {
            content: [{ type: "text", text: response }],
          };
        } catch (error) {
          console.error(`Error checking NPM library:`, error);
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          };
        }
      },
    );

    // Tool to analyze and generate upgrade report from JIRA ticket
    this.server.tool(
      "analyze_library_upgrade_ticket",
      "Analyze a JIRA ticket for library upgrades and generate comprehensive upgrade report",
      {
        issueKey: z.string().describe("The key of the Jira issue (e.g., CSDL-23958)"),
      },
      async ({ issueKey }) => {
        try {
          console.error(`[DEBUG] Analyzing library upgrade ticket: ${issueKey}`);
          
          // Fetch the JIRA ticket
          const issue = await this.jiraService.getIssue(issueKey);
          const description = issue.fields.description || '';
          const summary = issue.fields.summary || '';
          
          // Generate upgrade report with both description and summary
          const report = await this.libraryManager.generateUpgradeReport(description, summary);
          
          return {
            content: [{ type: "text", text: report }],
          };
        } catch (error) {
          console.error(`Error analyzing upgrade ticket ${issueKey}:`, error);
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          };
        }
      },
    );

    // ⭐ COMPREHENSIVE VULNERABILITY TICKET RESOLVER ⭐
    this.server.tool(
      "resolve_vulnerability_ticket",
      "Comprehensive resolver for vulnerability tickets - fetches full ticket details (description+comments), checks Maven repo versions, fetches release notes, detects breaking changes, and generates a perfect AI prompt",
      {
        ticketNumber: z.string().describe("JIRA ticket number (e.g., SIM-10237)"),
        repositoryPath: z.string().optional().describe("Optional path to the repository to analyze"),
      },
      async ({ ticketNumber, repositoryPath }) => {
        try {
          console.error(`\n${'='.repeat(70)}`);
          console.error(`🎫 Resolving vulnerability ticket: ${ticketNumber}`);
          console.error(`${'='.repeat(70)}\n`);

          // Step 1: Fetch full ticket details (including comments)
          console.error('📋 Step 1: Fetching full ticket details...');
          const ticketWithComments = await this.jiraService.getIssueWithComments(ticketNumber);
          const ticket = ticketWithComments.fields;
          const comments = ticketWithComments.comments;

          console.error(`   ✅ Ticket: ${ticket.summary}`);
          console.error(`   ✅ Status: ${ticket.status?.name || 'Unknown'}`);
          console.error(`   ✅ Comments: ${comments.length}`);

          // Step 2: Extract library information from description
          console.error('\n📦 Step 2: Extracting library information...');
          const description = ticket.description || '';
          const summary = ticket.summary || '';
          const libraries = this.libraryAnalyzer.extractLibraryInfo(description);

          console.error(`   ✅ Found ${libraries.length} libraries to upgrade`);

          // Step 3: Enhance library information (Maven repo + Release notes)
          console.error('\n🔍 Step 3: Checking Maven repository and release notes...');
          
          const enhancedLibraries = await Promise.all(
            libraries.map(async (lib: any) => {
              try {
                console.error(`   Processing ${lib.name || lib.library}...`);

                // Determine library coordinates
                let libraryId = lib.name || lib.library;
                if (!libraryId.includes(':')) {
                  // Try to find from known mappings
                  const knownLibraries: Record<string, string> = {
                    'bouncy castle fips': 'org.bouncycastle:bc-fips',
                    'bouncy castle': 'org.bouncycastle:bcprov-jdk15on',
                    'commons-lang': 'org.apache.commons:commons-lang3',
                    'spring-core': 'org.springframework:spring-core',
                    'jackson': 'com.fasterxml.jackson.core:jackson-core'
                  };

                  const libLower = libraryId.toLowerCase();
                  libraryId = knownLibraries[libLower] || libraryId;
                }

                // Fetch release notes and Maven info
                const releaseInfo = await this.releaseNotesService.getLibraryReleaseInfo(
                  libraryId,
                  lib.fromVersion || lib.currentVersion || '0.0.0',
                  lib.toVersion || lib.targetVersion || '999.999.999'
                );

                return {
                  ...lib,
                  libraryId,
                  releaseNotes: releaseInfo.summary,
                  breakingChanges: releaseInfo.breakingChanges,
                  securityFixes: releaseInfo.securityFixes,
                  deprecations: releaseInfo.deprecations,
                  mavenInfo: releaseInfo.maven,
                  releases: releaseInfo.releases
                };
              } catch (error: any) {
                console.warn(`   ⚠️  Failed to process ${lib.name}: ${error.message}`);
                return {
                  ...lib,
                  error: error.message
                };
              }
            })
          );

          // Step 4: Analyze codebase impact (if repository path provided)
          if (repositoryPath) {
            console.error('\n🔍 Step 4: Analyzing codebase impact...');
            
            for (const lib of enhancedLibraries) {
              try {
                if (lib.libraryId) {
                  console.error(`   Analyzing impact of ${lib.libraryId}...`);
                  
                  const usage = await this.codebaseAnalyzer.findLibraryUsage(
                    lib.libraryId,
                    repositoryPath,
                    {
                      findImports: true,
                      findMethodCalls: true,
                      checkDeprecated: true
                    }
                  );
                  
                  lib.codebaseImpact = usage;
                  console.error(`   ✅ Found usage in ${usage.totalFiles} files (Impact: ${usage.impactScore.toUpperCase()})`);
                  
                  if (usage.deprecatedUsage.length > 0) {
                    console.error(`   ⚠️  Deprecated usage detected: ${usage.deprecatedUsage.length} instances`);
                  }
                }
              } catch (error: any) {
                console.error(`   ⚠️  Could not analyze codebase impact: ${error.message}`);
                lib.codebaseImpact = null;
              }
            }
          } else {
            console.error('\n⏭️  Step 4: Skipping codebase impact analysis (no repository path provided)');
          }

          // Step 5: Generate comprehensive AI prompt
          console.error('\n🤖 Step 5: Generating comprehensive AI prompt...');

          let prompt = `# 🎫 JIRA Ticket Resolution: ${ticketNumber}

## 📋 Ticket Information
- **Title:** ${ticket.summary}
- **Status:** ${ticket.status?.name || 'Unknown'}
- **Priority:** ${ticket.priority?.name || 'Unknown'}
- **Assignee:** ${ticket.assignee?.displayName || 'Unassigned'}
- **Link:** ${process.env.JIRA_BASE_URL}/browse/${ticketNumber}

## 📝 Description
${description}

`;

          // Add comments if present
          if (comments.length > 0) {
            prompt += `## 💬 Comments (${comments.length} total)\n`;
            comments.forEach((comment: any, index: number) => {
              prompt += `\n### Comment ${index + 1} by ${comment.author} (${new Date(comment.created).toLocaleDateString()})\n`;
              prompt += `${comment.body}\n`;
            });
            prompt += '\n';
          }

          // Add library upgrade details
          prompt += `## 📦 Library Upgrades Required\n\n`;
          prompt += `Found ${enhancedLibraries.length} library upgrade(s):\n\n`;

          enhancedLibraries.forEach((lib: any, index: number) => {
            prompt += `### ${index + 1}. ${lib.libraryId || lib.name || lib.library}\n\n`;
            prompt += `**Upgrade:** ${lib.fromVersion || lib.currentVersion} → ${lib.toVersion || lib.targetVersion}\n\n`;

            if (lib.mavenInfo) {
              prompt += `**Maven Central Info:**\n`;
              prompt += `- Latest Version: ${lib.mavenInfo.latestVersion}\n`;
              prompt += `- Total Versions Available: ${lib.mavenInfo.versionCount || 'Unknown'}\n\n`;
            }

            if (lib.breakingChanges && lib.breakingChanges.length > 0) {
              prompt += `⚠️  **BREAKING CHANGES DETECTED:**\n`;
              lib.breakingChanges.forEach((change: string) => {
                prompt += `- ${change}\n`;
              });
              prompt += '\n';
            }

            if (lib.securityFixes && lib.securityFixes.length > 0) {
              prompt += `🔒 **SECURITY FIXES:**\n`;
              lib.securityFixes.forEach((fix: string) => {
                prompt += `- ${fix}\n`;
              });
              prompt += '\n';
            }

            if (lib.deprecations && lib.deprecations.length > 0) {
              prompt += `📢 **DEPRECATIONS/REMOVALS:**\n`;
              lib.deprecations.forEach((dep: string) => {
                prompt += `- ${dep}\n`;
              });
              prompt += '\n';
            }

            if (lib.releaseNotes) {
              prompt += `**Release Notes Summary:**\n\n${lib.releaseNotes}\n\n`;
            }

            // Add codebase impact analysis
            if (lib.codebaseImpact) {
              const impact = lib.codebaseImpact;
              prompt += `## 🎯 Codebase Impact Analysis\n\n`;
              prompt += `- **Files using this library:** ${impact.totalFiles}\n`;
              prompt += `- **Impact Score:** ${impact.impactScore.toUpperCase()}\n`;
              prompt += `- **Deprecated Usage:** ${impact.deprecatedUsage.length} instances\n\n`;
              
              prompt += `**${impact.recommendation}**\n\n`;
              
              if (impact.mostUsedClasses.length > 0) {
                prompt += `**Most Used Classes:**\n`;
                impact.mostUsedClasses.slice(0, 5).forEach((cls: any, idx: number) => {
                  prompt += `${idx + 1}. ${cls.className} (${cls.count} file(s))\n`;
                });
                prompt += '\n';
              }
              
              if (impact.files.length > 0) {
                prompt += `**Files Affected (Top 5):**\n`;
                impact.files.slice(0, 5).forEach((file: any, idx: number) => {
                  const shortPath = file.filePath.split('/').slice(-3).join('/');
                  prompt += `${idx + 1}. ${shortPath} (${file.imports.length} imports, ${file.usageCount} usages)\n`;
                });
                if (impact.files.length > 5) {
                  prompt += `... and ${impact.files.length - 5} more files\n`;
                }
                prompt += '\n';
              }
              
              if (impact.deprecatedUsage.length > 0) {
                prompt += `⚠️  **Deprecated Usage Detected:**\n`;
                impact.deprecatedUsage.slice(0, 3).forEach((dep: any) => {
                  const shortPath = dep.file.split('/').slice(-3).join('/');
                  prompt += `- ${dep.usage} in ${shortPath}:${dep.line}\n`;
                  prompt += `  → ${dep.suggestion}\n`;
                });
                if (impact.deprecatedUsage.length > 3) {
                  prompt += `... and ${impact.deprecatedUsage.length - 3} more\n`;
                }
                prompt += '\n';
              }
            }

            prompt += `---\n\n`;
          });

          // Add AI instructions
          prompt += `## 🤖 AI Resolution Instructions\n\n`;
          prompt += `You are tasked with resolving this security vulnerability ticket. Please follow these steps:\n\n`;

          prompt += `### Step 1: Understand the Context\n`;
          prompt += `- Review the ticket description and all comments above\n`;
          prompt += `- Understand the security implications of each library upgrade\n`;
          prompt += `- Note any breaking changes or deprecations mentioned\n\n`;

          prompt += `### Step 2: Find Dependency Files\n`;
          prompt += `Search for dependency management files in the repository:\n`;
          prompt += `- For Maven: \`pom.xml\` or \`build.gradle\`\n`;
          prompt += `- For NPM: \`package.json\` and \`package-lock.json\`\n`;
          prompt += `- For Python: \`requirements.txt\` or \`pyproject.toml\`\n\n`;

          prompt += `### Step 3: Update Library Versions\n`;
          enhancedLibraries.forEach((lib: any, index: number) => {
            prompt += `${index + 1}. Update \`${lib.libraryId || lib.name}\` from \`${lib.fromVersion || lib.currentVersion}\` to \`${lib.toVersion || lib.targetVersion}\`\n`;
          });
          prompt += `\n`;

          if (enhancedLibraries.some((lib: any) => lib.breakingChanges && lib.breakingChanges.length > 0)) {
            prompt += `### Step 4: Handle Breaking Changes\n`;
            prompt += `⚠️  **IMPORTANT:** Some libraries have breaking changes!\n\n`;
            enhancedLibraries.forEach((lib: any) => {
              if (lib.breakingChanges && lib.breakingChanges.length > 0) {
                prompt += `**${lib.libraryId || lib.name}:**\n`;
                lib.breakingChanges.forEach((change: string) => {
                  prompt += `- ${change}\n`;
                });
                prompt += `\n`;
                
                if (lib.codebaseImpact) {
                  prompt += `**Known usage in codebase:** ${lib.codebaseImpact.totalFiles} files (see impact analysis above)\n\n`;
                }
                
                prompt += `Please:\n`;
                prompt += `1. ${lib.codebaseImpact ? 'Review the affected files listed above' : 'Search for usages of this library in the codebase'}\n`;
                prompt += `2. Review the release notes for API changes\n`;
                prompt += `3. Update affected code accordingly\n\n`;
              }
            });
          } else {
            prompt += `### Step 4: Verify No Breaking Changes\n`;
            prompt += `✅ No breaking changes detected in release notes.\n`;
            prompt += `However, please still:\n`;
            prompt += `1. Search for usages of the upgraded libraries\n`;
            prompt += `2. Review the changes to ensure compatibility\n\n`;
          }

          prompt += `### Step 5: Generate Changes Summary\n`;
          prompt += `After making the updates, provide:\n`;
          prompt += `1. **Diff of changes** made to dependency files\n`;
          prompt += `2. **List of files modified** (if breaking changes required code updates)\n`;
          prompt += `3. **Testing recommendations** for the upgraded libraries\n\n`;

          prompt += `### Step 6: Create Commit Message\n`;
          prompt += `Generate a commit message in this format:\n\n`;
          prompt += `\`\`\`\n`;
          prompt += `fix(security): upgrade ${enhancedLibraries.map((l: any) => l.libraryId || l.name).join(', ')}\n\n`;
          enhancedLibraries.forEach((lib: any) => {
            prompt += `- Upgrade ${lib.libraryId || lib.name} from ${lib.fromVersion || lib.currentVersion} to ${lib.toVersion || lib.targetVersion}\n`;
          });
          prompt += `\n`;
          if (enhancedLibraries.some((lib: any) => lib.securityFixes && lib.securityFixes.length > 0)) {
            prompt += `Security fixes:\n`;
            enhancedLibraries.forEach((lib: any) => {
              if (lib.securityFixes && lib.securityFixes.length > 0) {
                lib.securityFixes.forEach((fix: string) => {
                  prompt += `- ${fix}\n`;
                });
              }
            });
            prompt += `\n`;
          }
          prompt += `Resolves: ${ticketNumber}\n`;
          prompt += `\`\`\`\n\n`;

          prompt += `---\n\n`;
          prompt += `**Repository:** ${repositoryPath || process.env.REPO_PATH || 'Not specified'}\n`;
          prompt += `**Ready to start!** 🚀\n`;

          console.error('\n✅ Comprehensive prompt generated!');
          console.error(`${'='.repeat(70)}\n`);

          return {
            content: [{ type: "text", text: prompt }],
          };
        } catch (error: any) {
          console.error(`\n❌ Error resolving ticket ${ticketNumber}:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Resolving Vulnerability Ticket ${ticketNumber}

**Error:** ${error.message}

## Troubleshooting Steps:
1. Verify JIRA ticket number is correct
2. Check JIRA configuration (URL, credentials)
3. Ensure repository path is accessible
4. Check network connectivity

## Configuration:
Set these environment variables:
- JIRA_BASE_URL: Your JIRA instance URL
- JIRA_USERNAME: Your JIRA username
- JIRA_API_TOKEN: Your JIRA API token
- REPO_PATH: Path to your repository

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      },
    );

    // ========== NEW TOOLS: Dependency Analysis & Smart Upgrades ==========

    // Tool to analyze project dependencies
    this.server.tool(
      "analyze_dependencies",
      "Analyze dependencies in a project (pom.xml, package.json, requirements.txt, build.gradle, build.gradle.kts)",
      {
        projectPath: z.string().describe("Path to the project directory"),
      },
      async ({ projectPath }) => {
        try {
          console.error(`[DEBUG] Analyzing dependencies in: ${projectPath}`);
          
          const analysis = await this.dependencyTreeService.analyzeDependencies(projectPath);
          
          let output = `# Dependency Analysis: ${projectPath}\n\n`;
          
          // Summary
          output += `## 📊 Summary\n\n`;
          output += `- **Total Dependencies:** ${analysis.totalDependencies}\n`;
          output += `- **Direct Dependencies:** ${analysis.directDependencies}\n`;
          output += `- **Transitive Dependencies:** ${analysis.transitiveDependencies}\n`;
          output += `- **Maximum Depth:** ${analysis.maxDepth}\n\n`;
          
          // Duplicates
          if (analysis.duplicates.length > 0) {
            output += `## ⚠️  Duplicate Dependencies\n\n`;
            output += `Found ${analysis.duplicates.length} dependencies with multiple versions:\n\n`;
            analysis.duplicates.forEach(dup => {
              output += `### ${dup.name}\n`;
              output += `Versions: ${dup.versions.join(', ')}\n`;
              output += `❗ **Action:** Consolidate to a single version\n\n`;
            });
          } else {
            output += `## ✅ No Duplicate Dependencies\n\n`;
          }
          
          // Outdated
          if (analysis.outdated.length > 0) {
            output += `## 📦 Outdated Dependencies\n\n`;
            analysis.outdated.forEach(dep => {
              const urgency = dep.type === 'major' ? '🔴' : dep.type === 'minor' ? '🟡' : '🟢';
              output += `${urgency} **${dep.name}**\n`;
              output += `- Current: ${dep.currentVersion}\n`;
              output += `- Latest: ${dep.latestVersion}\n`;
              output += `- Type: ${dep.type.toUpperCase()} update\n\n`;
            });
          } else {
            output += `## ✅ All Dependencies Up to Date\n\n`;
          }
          
          // Dependency tree visualization
          const tree = await this.dependencyTreeService.buildDependencyTree(projectPath);
          output += `## 🌳 Dependency Tree\n\n`;
          output += `\`\`\`\n`;
          output += this.dependencyTreeService.visualizeTree(tree, 3);
          output += `\`\`\`\n`;
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`[ERROR] Failed to analyze dependencies:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Analyzing Dependencies

**Error:** ${error.message}

## Troubleshooting:
1. Verify project path is correct
2. Ensure dependency file exists (pom.xml, package.json, etc.)
3. Check file permissions

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      },
    );

    // Tool to get smart upgrade recommendations
    this.server.tool(
      "recommend_upgrade",
      "Get smart upgrade recommendation for a library",
      {
        library: z.string().describe("Library name (e.g., 'org.bouncycastle:bc-fips')"),
        currentVersion: z.string().describe("Current version (e.g., '1.0.0')"),
        targetVersion: z.string().optional().describe("Optional target version (will find best if not specified)"),
      },
      async ({ library, currentVersion, targetVersion }) => {
        try {
          console.error(`[DEBUG] Getting upgrade recommendation for ${library}@${currentVersion}`);
          
          let output = `# Upgrade Recommendation: ${library}\n\n`;
          output += `**Current Version:** ${currentVersion}\n\n`;
          
          if (targetVersion) {
            // Analyze specific upgrade path
            output += `**Target Version:** ${targetVersion}\n\n`;
            
            const path = await this.upgradeStrategyService.getUpgradePath(
              library,
              currentVersion,
              targetVersion
            );
            
            const analysis = this.upgradeStrategyService.analyzeVersionDifference(
              currentVersion,
              targetVersion
            );
            
            output += `## 📊 Upgrade Analysis\n\n`;
            output += `- **Type:** ${analysis.type.toUpperCase()}\n`;
            output += `- **Risk Level:** ${analysis.riskLevel.toUpperCase()}\n`;
            output += `- **Description:** ${analysis.description}\n\n`;
            
            output += `## 🛣️  Upgrade Path\n\n`;
            if (path.direct) {
              output += `✅ **Direct Upgrade Recommended**\n\n`;
              output += `${currentVersion} → ${targetVersion}\n\n`;
              output += `${path.steps[0].reason}\n`;
            } else {
              output += `⚠️  **Step-by-step Upgrade Recommended**\n\n`;
              output += `${path.recommendation}\n\n`;
              path.steps.forEach((step, index) => {
                output += `**Step ${index + 1}:** ${step.from} → ${step.to}\n`;
                output += `${step.reason}\n`;
                if (step.breaking) output += `⚠️  May contain breaking changes\n`;
                output += `\n`;
              });
            }
            
            // Fetch changelog analysis
            const changelog = await this.changelogAnalyzer.analyzeChangelog(
              library,
              currentVersion,
              targetVersion
            );
            
            output += `## 📝 Changelog Analysis\n\n`;
            output += this.changelogAnalyzer.generateSummary(changelog);
            
          } else {
            // Find best upgrade
            const recommendation = await this.upgradeStrategyService.getMinimalSafeUpgrade(
              library,
              currentVersion
            );
            
            if (recommendation.type === 'none') {
              output += `## ✅ No Upgrade Needed\n\n`;
              output += `${recommendation.reason}\n`;
            } else {
              output += `**Recommended Version:** ${recommendation.version}\n\n`;
              
              output += `## 🎯 Recommendation\n\n`;
              output += `- **Type:** ${recommendation.type.toUpperCase()} update\n`;
              output += `- **Breaking Changes:** ${recommendation.breakingChanges ? 'YES ⚠️' : 'NO ✅'}\n`;
              output += `- **Confidence:** ${recommendation.confidence?.toUpperCase()}\n`;
              output += `- **Reason:** ${recommendation.reason}\n\n`;
              
              if (recommendation.version) {
                // Fetch changelog
                const changelog = await this.changelogAnalyzer.analyzeChangelog(
                  library,
                  currentVersion,
                  recommendation.version
                );
                
                output += `## 📝 What's Changed\n\n`;
                output += this.changelogAnalyzer.generateSummary(changelog);
              }
            }
          }
          
          output += `\n---\n\n`;
          output += `💡 **Next Steps:**\n`;
          output += `1. Review the changes above\n`;
          output += `2. Test the upgrade in a development environment\n`;
          output += `3. Update your dependency file\n`;
          output += `4. Run your test suite\n`;
          output += `5. Deploy to staging for validation\n`;
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`[ERROR] Failed to get upgrade recommendation:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Getting Upgrade Recommendation

**Error:** ${error.message}

## Troubleshooting:
1. Verify library name format
2. Check version format
3. Ensure network connectivity

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      },
    );

    // Tool to analyze breaking changes
    this.server.tool(
      "analyze_breaking_changes",
      "Analyze breaking changes between two versions of a library",
      {
        library: z.string().describe("Library name"),
        fromVersion: z.string().describe("Current version"),
        toVersion: z.string().describe("Target version"),
      },
      async ({ library, fromVersion, toVersion }) => {
        try {
          console.error(`[DEBUG] Analyzing breaking changes for ${library}: ${fromVersion} → ${toVersion}`);
          
          const analysis = await this.changelogAnalyzer.analyzeChangelog(
            library,
            fromVersion,
            toVersion
          );
          
          let output = `# Breaking Changes Analysis: ${library}\n\n`;
          output += `**From:** ${fromVersion} → **To:** ${toVersion}\n\n`;
          
          if (analysis.breakingChanges.length === 0) {
            output += `## ✅ No Breaking Changes Detected\n\n`;
            output += `According to the release notes, this upgrade should be backward compatible.\n\n`;
            output += `_Note: Always test thoroughly as changes may not be documented as breaking changes._\n`;
          } else {
            output += `## ⚠️  Breaking Changes Detected (${analysis.breakingChanges.length})\n\n`;
            analysis.breakingChanges.forEach((change, index) => {
              output += `${index + 1}. ${change}\n`;
            });
            output += `\n`;
          }
          
          if (analysis.deprecations.length > 0) {
            output += `## 📢 Deprecations (${analysis.deprecations.length})\n\n`;
            analysis.deprecations.forEach((dep, index) => {
              output += `${index + 1}. ${dep}\n`;
            });
            output += `\n`;
          }
          
          if (analysis.securityFixes.length > 0) {
            output += `## 🔒 Security Fixes (${analysis.securityFixes.length})\n\n`;
            analysis.securityFixes.forEach((fix, index) => {
              output += `${index + 1}. ${fix}\n`;
            });
            output += `\n`;
          }
          
          if (analysis.features.length > 0) {
            output += `## ✨ New Features (${analysis.features.length})\n\n`;
            analysis.features.forEach((feature, index) => {
              output += `${index + 1}. ${feature}\n`;
            });
            output += `\n`;
          }
          
          output += `\n---\n\n`;
          output += `**Analysis Confidence:** ${analysis.confidence.toUpperCase()}\n\n`;
          output += `💡 **Recommendations:**\n`;
          if (analysis.breakingChanges.length > 0) {
            output += `1. ⚠️  **HIGH PRIORITY:** Review all breaking changes carefully\n`;
            output += `2. Search your codebase for usage of affected APIs\n`;
            output += `3. Update code to handle breaking changes\n`;
            output += `4. Run comprehensive test suite\n`;
            output += `5. Consider step-by-step upgrade if multiple major versions\n`;
          } else {
            output += `1. Review deprecations and plan to migrate away from them\n`;
            output += `2. Test the upgrade in dev environment\n`;
            output += `3. Run your test suite\n`;
            output += `4. Deploy to staging for validation\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`[ERROR] Failed to analyze breaking changes:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Analyzing Breaking Changes

**Error:** ${error.message}

## Possible Reasons:
1. Release notes not available on GitHub
2. Library not found in Maven Central
3. Network connectivity issues

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      },
    );

    // Tool to get GitHub release notes
    this.server.tool(
      "get_github_release_notes",
      "Fetch GitHub release notes for a library upgrade",
      {
        library: z.string().describe("Library name (e.g., 'org.springframework:spring-core')"),
        fromVersion: z.string().describe("Current version (e.g., '5.3.0')"),
        toVersion: z.string().describe("Target version (e.g., '6.0.0')"),
      },
      async ({ library, fromVersion, toVersion }) => {
        try {
          console.error(`[DEBUG] Fetching GitHub release notes for ${library}: ${fromVersion} → ${toVersion}`);
          
          const releaseInfo = await this.releaseNotesService.getLibraryReleaseInfo(
            library,
            fromVersion,
            toVersion
          );
          
          let output = `# GitHub Release Notes: ${library}\n\n`;
          output += `**Version Range:** ${fromVersion} → ${toVersion}\n\n`;
          
          if (releaseInfo.maven) {
            output += `## Maven Central Info\n\n`;
            output += `- **Latest Version:** ${releaseInfo.maven.latestVersion}\n`;
            if (releaseInfo.maven.versionCount) {
              output += `- **Total Versions:** ${releaseInfo.maven.versionCount}\n`;
            }
            output += `\n`;
          }
          
          if (releaseInfo.releases.length === 0) {
            output += `## ℹ️ No GitHub Releases Found\n\n`;
            output += `Could not find GitHub releases for this version range.\n\n`;
            output += `**Possible reasons:**\n`;
            output += `- Library may not publish GitHub releases\n`;
            output += `- Version tags don't match release tags\n`;
            output += `- Repository not found or private\n\n`;
          } else {
            output += `## 📚 Found ${releaseInfo.releases.length} Release(s)\n\n`;
            
            releaseInfo.releases.forEach((release, idx) => {
              output += `### ${idx + 1}. ${release.name || release.version}\n\n`;
              output += `**Version:** ${release.version}\n`;
              output += `**Published:** ${new Date(release.published_at).toLocaleDateString()}\n`;
              output += `**URL:** ${release.url}\n\n`;
              
              if (release.body) {
                // Truncate if too long
                const maxLength = 500;
                let body = release.body;
                if (body.length > maxLength) {
                  body = body.substring(0, maxLength) + '...\n\n[See full release notes](' + release.url + ')';
                }
                output += `**Release Notes:**\n\n${body}\n\n`;
              }
              
              output += `---\n\n`;
            });
          }
          
          if (releaseInfo.breakingChanges.length > 0) {
            output += `## ⚠️ Breaking Changes (${releaseInfo.breakingChanges.length})\n\n`;
            releaseInfo.breakingChanges.forEach((change, idx) => {
              output += `${idx + 1}. ${change}\n`;
            });
            output += `\n`;
          }
          
          if (releaseInfo.securityFixes.length > 0) {
            output += `## 🔒 Security Fixes (${releaseInfo.securityFixes.length})\n\n`;
            releaseInfo.securityFixes.forEach((fix, idx) => {
              output += `${idx + 1}. ${fix}\n`;
            });
            output += `\n`;
          }
          
          if (releaseInfo.deprecations.length > 0) {
            output += `## 📢 Deprecations (${releaseInfo.deprecations.length})\n\n`;
            releaseInfo.deprecations.forEach((dep, idx) => {
              output += `${idx + 1}. ${dep}\n`;
            });
            output += `\n`;
          }
          
          if (releaseInfo.summary) {
            output += `## 📝 Summary\n\n${releaseInfo.summary}\n\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`[ERROR] Failed to get GitHub release notes:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Fetching GitHub Release Notes

**Error:** ${error.message}

## Troubleshooting:
1. Check library name format (e.g., 'org.springframework:spring-core')
2. Verify version numbers are correct
3. Ensure GitHub repository exists and is public

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      }
    );

    // ========== CODEBASE IMPACT ANALYSIS ==========
    this.server.tool(
      "find_library_usage",
      "Find where a library is used in the codebase (AUTOMATICALLY called before upgrades)",
      {
        library: z.string().describe("Library name (e.g., 'org.bouncycastle:bc-fips')"),
        projectPath: z.string().describe("Path to the project directory"),
        findImports: z.boolean().optional().describe("Find import statements (default: true)"),
        findMethodCalls: z.boolean().optional().describe("Find method calls (default: true)"),
        checkDeprecated: z.boolean().optional().describe("Check for deprecated usage (default: true)"),
      },
      async ({ library, projectPath, findImports = true, findMethodCalls = true, checkDeprecated = true }) => {
        try {
          console.error(`\n${'='.repeat(70)}`);
          console.error(`🔍 Finding library usage: ${library}`);
          console.error(`${'='.repeat(70)}\n`);

          const usage = await this.codebaseAnalyzer.findLibraryUsage(
            library,
            projectPath,
            { findImports, findMethodCalls, checkDeprecated }
          );

          const report = this.codebaseAnalyzer.formatReport(usage);

          return {
            content: [{ type: "text", text: report }],
          };
        } catch (error: any) {
          console.error(`[ERROR] Failed to analyze library usage:`, error);
          return {
            content: [{
              type: "text",
              text: `# Error Analyzing Library Usage

**Error:** ${error.message}

## Possible Reasons:
1. Invalid project path
2. Library name format incorrect
3. Insufficient permissions to read files
4. Project directory not accessible

**Stack trace:**
${error.stack || 'No stack trace available'}`
            }],
          };
        }
      },
    );

    // ========== SPRINT BOARD TOOLS ==========

    // Tool to analyze Jira URL (smart URL parser)
    this.server.tool(
      "analyze_jira_url",
      "Parse any Jira URL (board, sprint, issue) and fetch relevant information",
      {
        url: z.string().describe("Any Jira URL (board, sprint, issue link)"),
      },
      async ({ url }) => {
        try {
          console.error(`[DEBUG] Analyzing Jira URL: ${url}`);
          const parsed = parseJiraUrl(url);
          
          let output = `# Jira URL Analysis\n\n`;
          output += `**URL Type:** ${parsed.type.toUpperCase()}\n\n`;
          
          if (parsed.type === 'board' && parsed.id) {
            output += `**Board ID:** ${parsed.id}\n\n`;
            
            // Fetch board info
            const boards = await this.jiraService.getBoards();
            const board = boards.values?.find((b: any) => b.id === parseInt(parsed.id!));
            
            if (board) {
              output += `## Board Information\n\n`;
              output += `- **Name:** ${board.name}\n`;
              output += `- **Type:** ${board.type}\n`;
              if (board.location) {
                output += `- **Project:** ${board.location.projectKey} - ${board.location.projectName}\n`;
              }
              output += `\n`;
              
              // Fetch active sprint
              const sprints = await this.jiraService.getSprints(parsed.id, 'active');
              if (sprints.values && sprints.values.length > 0) {
                output += `## Active Sprint\n\n`;
                const activeSprint = sprints.values[0];
                output += `- **Name:** ${activeSprint.name}\n`;
                output += `- **ID:** ${activeSprint.id}\n`;
                if (activeSprint.goal) output += `- **Goal:** ${activeSprint.goal}\n`;
                output += `\n`;
                
                // Fetch sprint report
                const report = await this.jiraService.getSprintReport(parsed.id, activeSprint.id);
                if (report.metrics) {
                  output += `### Sprint Progress\n\n`;
                  output += `- Total: ${report.metrics.total} issues\n`;
                  output += `- Completed: ${report.metrics.completed} ✅\n`;
                  output += `- In Progress: ${report.metrics.inProgress} 🔄\n`;
                  output += `- To Do: ${report.metrics.todo} 📝\n`;
                  output += `- Completion: ${report.metrics.completionRate}%\n\n`;
                  
                  const completedBars = Math.round(report.metrics.completionRate / 10);
                  const remainingBars = 10 - completedBars;
                  output += `[${'█'.repeat(completedBars)}${'░'.repeat(remainingBars)}] ${report.metrics.completionRate}%\n\n`;
                }
              }
              
              output += `## 💡 Next Steps\n\n`;
              output += `You can now:\n`;
              output += `1. Get all sprints: \`get_sprints\` with boardId: ${parsed.id}\n`;
              output += `2. View sprint issues: \`get_sprint_issues\` with sprintId from above\n`;
              output += `3. Check backlog: \`get_backlog\` with boardId: ${parsed.id}\n`;
            } else {
              output += `Board with ID ${parsed.id} not found. You may not have access to it.\n`;
            }
          } else if (parsed.type === 'sprint' && parsed.id && parsed.boardId) {
            output += `**Sprint ID:** ${parsed.id}\n`;
            output += `**Board ID:** ${parsed.boardId}\n\n`;
            
            const report = await this.jiraService.getSprintReport(parsed.boardId, parsed.id);
            output += `## Sprint: ${report.sprint?.name || 'Unknown'}\n\n`;
            
            if (report.metrics) {
              output += `### Metrics\n\n`;
              output += `- Total: ${report.metrics.total} issues\n`;
              output += `- Completed: ${report.metrics.completed} ✅\n`;
              output += `- Completion: ${report.metrics.completionRate}%\n\n`;
            }
          } else if (parsed.type === 'issue' && parsed.id) {
            output += `**Issue Key:** ${parsed.id}\n\n`;
            const issue = await this.jiraService.getIssue(parsed.id);
            output += `## ${issue.fields.summary}\n\n`;
            output += `- **Status:** ${issue.fields.status?.name}\n`;
            output += `- **Type:** ${issue.fields.issuetype?.name}\n`;
            output += `- **Priority:** ${issue.fields.priority?.name}\n`;
          } else {
            output += `Could not parse URL. Please provide:\n`;
            output += `- Board URL: https://jira.example.com/secure/RapidBoard.jspa?rapidView=123\n`;
            output += `- Issue URL: https://jira.example.com/browse/PROJECT-123\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error analyzing URL:`, error);
          return {
            content: [{ type: "text", text: `Error analyzing URL: ${error.message}` }],
          };
        }
      },
    );
    
    // Tool to get boards
    this.server.tool(
      "get_boards",
      "Get list of agile boards (optionally filtered by project)",
      {
        projectKey: z.string().optional().describe("Optional project key to filter boards (e.g., PROJECT)"),
      },
      async ({ projectKey }) => {
        try {
          console.error(`[DEBUG] Fetching boards${projectKey ? ` for project ${projectKey}` : ''}`);
          const boards = await this.jiraService.getBoards(projectKey);
          
          let output = `# Agile Boards\n\n`;
          
          if (boards.values && boards.values.length > 0) {
            output += `Found ${boards.values.length} board(s):\n\n`;
            
            boards.values.forEach((board: any, index: number) => {
              output += `## ${index + 1}. ${board.name}\n`;
              output += `- **ID:** ${board.id}\n`;
              output += `- **Type:** ${board.type}\n`;
              if (board.location) {
                output += `- **Project:** ${board.location.projectKey} - ${board.location.projectName}\n`;
              }
              output += `\n`;
            });
          } else {
            output += `No boards found${projectKey ? ` for project ${projectKey}` : ''}.\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error fetching boards:`, error);
          return {
            content: [{ type: "text", text: `Error fetching boards: ${error.message}` }],
          };
        }
      },
    );

    // Tool to get sprints for a board
    this.server.tool(
      "get_sprints",
      "Get sprints for a board (optionally filtered by state: active, future, closed)",
      {
        boardId: z.string().describe("Board ID to fetch sprints from"),
        state: z.enum(['active', 'future', 'closed']).optional().describe("Filter sprints by state (active, future, or closed)"),
      },
      async ({ boardId, state }) => {
        try {
          console.error(`[DEBUG] Fetching sprints for board ${boardId}${state ? ` with state: ${state}` : ''}`);
          const sprints = await this.jiraService.getSprints(boardId, state);
          
          let output = `# Sprints for Board ${boardId}\n\n`;
          
          if (sprints.values && sprints.values.length > 0) {
            output += `Found ${sprints.values.length} sprint(s)${state ? ` (${state})` : ''}:\n\n`;
            
            sprints.values.forEach((sprint: any, index: number) => {
              output += `## ${index + 1}. ${sprint.name}\n`;
              output += `- **ID:** ${sprint.id}\n`;
              output += `- **State:** ${sprint.state}\n`;
              if (sprint.startDate) {
                output += `- **Start Date:** ${new Date(sprint.startDate).toLocaleDateString()}\n`;
              }
              if (sprint.endDate) {
                output += `- **End Date:** ${new Date(sprint.endDate).toLocaleDateString()}\n`;
              }
              if (sprint.completeDate) {
                output += `- **Completed:** ${new Date(sprint.completeDate).toLocaleDateString()}\n`;
              }
              if (sprint.goal) {
                output += `- **Goal:** ${sprint.goal}\n`;
              }
              output += `\n`;
            });
          } else {
            output += `No sprints found for board ${boardId}${state ? ` with state: ${state}` : ''}.\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error fetching sprints:`, error);
          return {
            content: [{ type: "text", text: `Error fetching sprints: ${error.message}` }],
          };
        }
      },
    );

    // Tool to get sprint issues
    this.server.tool(
      "get_sprint_issues",
      "Get all issues in a specific sprint",
      {
        sprintId: z.string().describe("Sprint ID to fetch issues from"),
      },
      async ({ sprintId }) => {
        try {
          console.error(`[DEBUG] Fetching issues for sprint ${sprintId}`);
          const response = await this.jiraService.getSprintIssues(sprintId);
          
          let output = `# Sprint Issues - Sprint ${sprintId}\n\n`;
          
          if (response.issues && response.issues.length > 0) {
            output += `Total Issues: ${response.total || response.issues.length}\n\n`;
            
            // Group by status
            const byStatus: Record<string, any[]> = {};
            response.issues.forEach((issue: any) => {
              const status = issue.fields?.status?.name || 'Unknown';
              if (!byStatus[status]) {
                byStatus[status] = [];
              }
              byStatus[status].push(issue);
            });
            
            // Display grouped issues
            Object.keys(byStatus).forEach(status => {
              output += `## ${status} (${byStatus[status].length})\n\n`;
              byStatus[status].forEach((issue: any) => {
                output += `- **${issue.key}**: ${issue.fields?.summary || 'No summary'}\n`;
                output += `  - Type: ${issue.fields?.issuetype?.name || 'Unknown'}\n`;
                output += `  - Priority: ${issue.fields?.priority?.name || 'None'}\n`;
                output += `  - Assignee: ${issue.fields?.assignee?.displayName || 'Unassigned'}\n`;
              });
              output += `\n`;
            });
          } else {
            output += `No issues found in sprint ${sprintId}.\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error fetching sprint issues:`, error);
          return {
            content: [{ type: "text", text: `Error fetching sprint issues: ${error.message}` }],
          };
        }
      },
    );

    // Tool to get backlog
    this.server.tool(
      "get_backlog",
      "Get backlog issues for a board",
      {
        boardId: z.string().describe("Board ID to fetch backlog from"),
      },
      async ({ boardId }) => {
        try {
          console.error(`[DEBUG] Fetching backlog for board ${boardId}`);
          const response = await this.jiraService.getBacklog(boardId);
          
          let output = `# Backlog - Board ${boardId}\n\n`;
          
          if (response.issues && response.issues.length > 0) {
            output += `Total Backlog Issues: ${response.total || response.issues.length}\n\n`;
            
            // Group by priority
            const byPriority: Record<string, any[]> = {};
            response.issues.forEach((issue: any) => {
              const priority = issue.fields?.priority?.name || 'None';
              if (!byPriority[priority]) {
                byPriority[priority] = [];
              }
              byPriority[priority].push(issue);
            });
            
            // Display grouped issues
            const priorityOrder = ['Highest', 'High', 'Medium', 'Low', 'Lowest', 'None'];
            priorityOrder.forEach(priority => {
              if (byPriority[priority]) {
                output += `## Priority: ${priority} (${byPriority[priority].length})\n\n`;
                byPriority[priority].forEach((issue: any) => {
                  output += `- **${issue.key}**: ${issue.fields?.summary || 'No summary'}\n`;
                  output += `  - Type: ${issue.fields?.issuetype?.name || 'Unknown'}\n`;
                  output += `  - Assignee: ${issue.fields?.assignee?.displayName || 'Unassigned'}\n`;
                });
                output += `\n`;
              }
            });
          } else {
            output += `No backlog issues found for board ${boardId}.\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error fetching backlog:`, error);
          return {
            content: [{ type: "text", text: `Error fetching backlog: ${error.message}` }],
          };
        }
      },
    );

    // Tool to get sprint report
    this.server.tool(
      "get_sprint_report",
      "Get detailed sprint report with metrics and progress",
      {
        boardId: z.string().describe("Board ID"),
        sprintId: z.string().describe("Sprint ID to generate report for"),
      },
      async ({ boardId, sprintId }) => {
        try {
          console.error(`[DEBUG] Fetching sprint report for sprint ${sprintId}`);
          const report = await this.jiraService.getSprintReport(boardId, sprintId);
          
          let output = `# Sprint Report\n\n`;
          
          // Sprint details
          if (report.sprint) {
            output += `## Sprint: ${report.sprint.name}\n\n`;
            output += `- **ID:** ${report.sprint.id}\n`;
            output += `- **State:** ${report.sprint.state}\n`;
            if (report.sprint.startDate) {
              output += `- **Start Date:** ${new Date(report.sprint.startDate).toLocaleDateString()}\n`;
            }
            if (report.sprint.endDate) {
              output += `- **End Date:** ${new Date(report.sprint.endDate).toLocaleDateString()}\n`;
            }
            if (report.sprint.goal) {
              output += `- **Goal:** ${report.sprint.goal}\n`;
            }
            output += `\n`;
          }
          
          // Metrics
          if (report.metrics) {
            output += `## 📊 Sprint Metrics\n\n`;
            output += `- **Total Issues:** ${report.metrics.total}\n`;
            output += `- **Completed:** ${report.metrics.completed} ✅\n`;
            output += `- **In Progress:** ${report.metrics.inProgress} 🔄\n`;
            output += `- **To Do:** ${report.metrics.todo} 📝\n`;
            output += `- **Completion Rate:** ${report.metrics.completionRate}%\n\n`;
            
            // Progress bar
            const completedBars = Math.round(report.metrics.completionRate / 10);
            const remainingBars = 10 - completedBars;
            output += `Progress: [${'█'.repeat(completedBars)}${'░'.repeat(remainingBars)}] ${report.metrics.completionRate}%\n\n`;
          }
          
          // Issues breakdown
          if (report.issues && report.issues.length > 0) {
            output += `## 📋 Issues Breakdown\n\n`;
            
            // Group by status
            const byStatus: Record<string, any[]> = {};
            report.issues.forEach((issue: any) => {
              const status = issue.fields?.status?.name || 'Unknown';
              if (!byStatus[status]) {
                byStatus[status] = [];
              }
              byStatus[status].push(issue);
            });
            
            Object.keys(byStatus).forEach(status => {
              output += `### ${status} (${byStatus[status].length})\n\n`;
              byStatus[status].forEach((issue: any) => {
                output += `- **${issue.key}**: ${issue.fields?.summary || 'No summary'}\n`;
              });
              output += `\n`;
            });
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          console.error(`Error fetching sprint report:`, error);
          return {
            content: [{ type: "text", text: `Error fetching sprint report: ${error.message}` }],
          };
        }
      },
    );

    // ========== DATABASE TOOLS ==========
    if (this.databaseService) {
      console.error('[DEBUG] Registering database tools...');
      this.registerDatabaseTools();
    }
  }

  private registerDatabaseTools(): void {
    if (!this.databaseService) return;

    // Tool to list all databases
    this.server.tool(
      "list_databases",
      "List all databases available on the MySQL server",
      {},
      async () => {
        try {
          const databases = await this.databaseService!.listDatabases();
          let output = `# Available Databases\n\n`;
          output += `Found ${databases.length} database(s):\n\n`;
          databases.forEach((db, idx) => {
            output += `${idx + 1}. ${db}\n`;
          });
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to switch database
    this.server.tool(
      "use_database",
      "Switch to a different database",
      {
        database: z.string().describe("Database name to switch to"),
      },
      async ({ database }) => {
        try {
          await this.databaseService!.useDatabase(database);
          return {
            content: [{ type: "text", text: `✅ Switched to database: ${database}` }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to list tables
    this.server.tool(
      "list_db_tables",
      "List all tables in a database",
      {
        database: z.string().optional().describe("Database name (optional if already selected)"),
      },
      async ({ database }) => {
        try {
          const tables = await this.databaseService!.listTables(database);
          let output = database 
            ? `# Tables in Database: ${database}\n\n`
            : `# Tables in Current Database\n\n`;
          
          output += `Found ${tables.length} table(s):\n\n`;
          tables.forEach((table, idx) => {
            output += `${idx + 1}. \`${table}\`\n`;
          });
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}\n\nTip: Use 'use_database' to select a database first, or specify database parameter.` }],
          };
        }
      }
    );

    // Tool to get table schema
    this.server.tool(
      "get_table_schema",
      "Get the structure/schema of a database table",
      {
        tableName: z.string().describe("Name of the table"),
        database: z.string().optional().describe("Database name (optional)"),
      },
      async ({ tableName, database }) => {
        try {
          const schema = await this.databaseService!.getTableInfo(tableName, database);
          const rowCount = await this.databaseService!.getTableRowCount(tableName, database);
          
          let output = `# Table: ${tableName}\n\n`;
          output += `**Row Count:** ${rowCount.toLocaleString()}\n\n`;
          output += `## Schema\n\n`;
          output += `| Column | Type | Nullable | Key | Default | Extra | Comment |\n`;
          output += `|--------|------|----------|-----|---------|-------|----------|\n`;
          
          schema.forEach((col: any) => {
            output += `| ${col.COLUMN_NAME} | ${col.COLUMN_TYPE} | ${col.IS_NULLABLE} | ${col.COLUMN_KEY || '-'} | ${col.COLUMN_DEFAULT || 'NULL'} | ${col.EXTRA || '-'} | ${col.COLUMN_COMMENT || '-'} |\n`;
          });
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to query database
    this.server.tool(
      "query_database",
      "Execute a SQL SELECT query on the database",
      {
        query: z.string().describe("SQL SELECT query to execute"),
        limit: z.number().optional().describe("Maximum number of rows to return (default: 100)"),
      },
      async ({ query, limit = 100 }) => {
        try {
          // Add limit if not present
          let finalQuery = query.trim();
          if (!finalQuery.toLowerCase().includes('limit')) {
            finalQuery += ` LIMIT ${limit}`;
          }
          
          const results = await this.databaseService!.executeReadOnlyQuery(finalQuery);
          
          if (results.length === 0) {
            return {
              content: [{ type: "text", text: `✅ Query executed successfully.\n\nNo results returned.` }],
            };
          }
          
          let output = `# Query Results\n\n`;
          output += `**Rows returned:** ${results.length}\n\n`;
          
          // Show as table if reasonable size
          if (results.length <= 20) {
            const columns = Object.keys(results[0]);
            output += `| ${columns.join(' | ')} |\n`;
            output += `| ${columns.map(() => '---').join(' | ')} |\n`;
            
            results.forEach((row: any) => {
              output += `| ${columns.map(col => String(row[col] || 'NULL')).join(' | ')} |\n`;
            });
          } else {
            // Show as JSON for large results
            output += `\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to search in a table
    this.server.tool(
      "search_table",
      "Search for a term across all text columns in a table",
      {
        tableName: z.string().describe("Table name to search"),
        searchTerm: z.string().describe("Term to search for"),
        database: z.string().optional().describe("Database name (optional)"),
        limit: z.number().optional().describe("Max results (default: 50)"),
      },
      async ({ tableName, searchTerm, database, limit = 50 }) => {
        try {
          const results = await this.databaseService!.searchTable(tableName, searchTerm, database, limit);
          
          let output = `# Search Results: "${searchTerm}" in ${tableName}\n\n`;
          if (results.length === 0) {
            output += `No results found.\n`;
          } else {
            output += `Found ${results.length} matching row(s):\n\n`;
            output += `\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to get database statistics
    this.server.tool(
      "get_database_stats",
      "Get statistics about database size and table sizes",
      {
        database: z.string().optional().describe("Database name (optional)"),
      },
      async ({ database }) => {
        try {
          const stats = await this.databaseService!.getDatabaseStats(database);
          
          let output = `# Database Statistics\n\n`;
          
          if (stats.length === 0) {
            output += `No tables found in database.\n`;
          } else {
            output += `## Tables by Size\n\n`;
            output += `| Table | Rows | Data Size | Index Size | Total Size |\n`;
            output += `|-------|------|-----------|------------|------------|\n`;
            
            stats.forEach((stat: any) => {
              const dataSize = (stat.DATA_LENGTH / 1024 / 1024).toFixed(2);
              const indexSize = (stat.INDEX_LENGTH / 1024 / 1024).toFixed(2);
              const totalSize = (stat.TOTAL_SIZE / 1024 / 1024).toFixed(2);
              
              output += `| ${stat.TABLE_NAME} | ${stat.TABLE_ROWS?.toLocaleString() || 'N/A'} | ${dataSize} MB | ${indexSize} MB | ${totalSize} MB |\n`;
            });
            
            const totalDataSize = stats.reduce((sum: number, s: any) => sum + (s.DATA_LENGTH || 0), 0) / 1024 / 1024;
            const totalIndexSize = stats.reduce((sum: number, s: any) => sum + (s.INDEX_LENGTH || 0), 0) / 1024 / 1024;
            
            output += `\n**Total Data:** ${totalDataSize.toFixed(2)} MB\n`;
            output += `**Total Index:** ${totalIndexSize.toFixed(2)} MB\n`;
            output += `**Grand Total:** ${(totalDataSize + totalIndexSize).toFixed(2)} MB\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    // Tool to get recent records
    this.server.tool(
      "get_recent_records",
      "Get the most recent records from a table",
      {
        tableName: z.string().describe("Table name"),
        timestampColumn: z.string().optional().describe("Column to sort by (default: created_at)"),
        limit: z.number().optional().describe("Number of records (default: 50)"),
        database: z.string().optional().describe("Database name (optional)"),
      },
      async ({ tableName, timestampColumn, limit, database }) => {
        try {
          const results = await this.databaseService!.getRecentRecords(tableName, {
            timestampColumn,
            limit,
            database
          });
          
          let output = `# Recent Records from ${tableName}\n\n`;
          if (results.length === 0) {
            output += `No records found.\n`;
          } else {
            output += `Showing ${results.length} most recent record(s):\n\n`;
            output += `\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`;
          }
          
          return {
            content: [{ type: "text", text: output }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
          };
        }
      }
    );

    console.error('[DEBUG] Database tools registered successfully');
  }

  async connect(transport: Transport): Promise<void> {
    console.error("[DEBUG] Connecting to transport...");
    await this.server.connect(transport);
    console.error("[DEBUG] Server connected and ready to process requests");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.error("[DEBUG] New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.error(`[DEBUG] HTTP server listening on port ${port}`);
      console.error(`[DEBUG] SSE endpoint available at http://localhost:${port}/sse`);
      console.error(`[DEBUG] Message endpoint available at http://localhost:${port}/messages`);
    });
  }
} 