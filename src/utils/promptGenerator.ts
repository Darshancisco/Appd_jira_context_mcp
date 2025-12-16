import { JiraIssue } from "~/types/jira";

export interface TicketAnalysis {
  ticketKey: string;
  summary: string;
  issueType: string;
  priority: string;
  description: string;
  comments: string[];
  technicalDetails: {
    libraries?: string[];
    versions?: string[];
    errorMessages?: string[];
    cveNumbers?: string[];
    stackTraces?: string[];
  };
  actionItems: string[];
  cursorPrompt: string;
}

export class PromptGenerator {
  /**
   * Extract technical information from ticket description and comments
   */
  private static extractTechnicalDetails(description: string, comments: any[]): TicketAnalysis['technicalDetails'] {
    const allText = description + '\n' + comments.map(c => c.body || '').join('\n');
    
    const details: TicketAnalysis['technicalDetails'] = {};
    
    // Extract CVE numbers
    const cveMatches = allText.match(/CVE-\d{4}-\d{4,}/gi);
    if (cveMatches) {
      details.cveNumbers = [...new Set(cveMatches)];
    }
    
    // Extract version numbers
    const versionMatches = allText.match(/\d+\.\d+\.\d+/g);
    if (versionMatches) {
      details.versions = [...new Set(versionMatches)];
    }
    
    // Extract library names (common patterns)
    const libraryMatches = allText.match(/(?:commons-lang|apache|spring|react|lodash|express|axios|jackson|log4j|slf4j)[\w-]*/gi);
    if (libraryMatches) {
      details.libraries = [...new Set(libraryMatches)];
    }
    
    // Extract error messages
    const errorPatterns = [
      /Error: .+/g,
      /Exception: .+/g,
      /Failed to .+/g,
      /Unable to .+/g
    ];
    
    const errorMessages: string[] = [];
    errorPatterns.forEach(pattern => {
      const matches = allText.match(pattern);
      if (matches) {
        errorMessages.push(...matches);
      }
    });
    
    if (errorMessages.length > 0) {
      details.errorMessages = [...new Set(errorMessages)].slice(0, 5); // Limit to 5
    }
    
    // Extract stack traces (simplified)
    const stackTraceMatch = allText.match(/at .+\(.+:\d+:\d+\)/g);
    if (stackTraceMatch) {
      details.stackTraces = stackTraceMatch.slice(0, 3); // First 3 lines
    }
    
    return details;
  }

  /**
   * Parse description tables (Jira markup)
   */
  private static parseJiraTable(description: string): Record<string, string> {
    const tableData: Record<string, string> = {};
    
    // Match ||key|value| pattern
    const tableMatches = description.match(/\|\|([^|]+)\|([^|]+)\|/g);
    if (tableMatches) {
      tableMatches.forEach(match => {
        const parts = match.split('|').filter(p => p.trim());
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          tableData[key] = value;
        }
      });
    }
    
    return tableData;
  }

  /**
   * Generate actionable items from ticket
   */
  private static generateActionItems(
    issue: JiraIssue,
    technicalDetails: TicketAnalysis['technicalDetails'],
    tableData: Record<string, string>
  ): string[] {
    const actions: string[] = [];
    const issueType = issue.fields?.issuetype?.name || 'Unknown';
    
    if (issueType === 'Bug') {
      actions.push('🐛 Identify the root cause of the bug');
      actions.push('🔍 Review error logs and stack traces');
      actions.push('✅ Write tests to reproduce the issue');
      actions.push('🛠️ Implement the fix');
      actions.push('🧪 Verify the fix resolves the issue');
    } else if (issueType === 'Vulnerability') {
      if (tableData.current_version && tableData.remediation) {
        actions.push(`📦 Upgrade ${technicalDetails.libraries?.[0] || 'library'} from ${tableData.current_version} to ${tableData.remediation}`);
      }
      actions.push('🔒 Review security advisory details');
      actions.push('🔄 Update dependency in build file (pom.xml/package.json/build.gradle)');
      actions.push('🧪 Run tests to ensure compatibility');
      actions.push('📝 Update changelog/release notes');
    } else if (issueType === 'Story') {
      actions.push('📋 Review requirements and acceptance criteria');
      actions.push('💻 Implement the required functionality');
      actions.push('🧪 Write unit and integration tests');
      actions.push('📚 Update documentation if needed');
    }
    
    if (technicalDetails.errorMessages && technicalDetails.errorMessages.length > 0) {
      actions.push('🔍 Analyze the error messages in the logs');
    }
    
    if (technicalDetails.cveNumbers && technicalDetails.cveNumbers.length > 0) {
      actions.push(`🔐 Review CVE details: ${technicalDetails.cveNumbers.join(', ')}`);
    }
    
    return actions;
  }

  /**
   * Generate a detailed prompt for Cursor AI
   */
  private static generateCursorPrompt(
    issue: JiraIssue,
    comments: any[],
    technicalDetails: TicketAnalysis['technicalDetails'],
    tableData: Record<string, string>,
    actionItems: string[]
  ): string {
    const issueType = issue.fields?.issuetype?.name || 'Unknown';
    const priority = issue.fields?.priority?.name || 'N/A';
    
    let prompt = `# Resolve Jira Ticket: ${issue.key}\n\n`;
    prompt += `**Summary:** ${issue.fields?.summary || 'No summary'}\n`;
    prompt += `**Type:** ${issueType} | **Priority:** ${priority}\n`;
    prompt += `**Status:** ${issue.fields?.status?.name || 'Unknown'}\n\n`;
    
    prompt += `## 📋 Description\n\n`;
    prompt += `${issue.fields?.description || 'No description provided'}\n\n`;
    
    if (Object.keys(tableData).length > 0) {
      prompt += `## 📊 Key Information\n\n`;
      Object.entries(tableData).forEach(([key, value]) => {
        prompt += `- **${key}:** ${value}\n`;
      });
      prompt += `\n`;
    }
    
    if (technicalDetails.cveNumbers && technicalDetails.cveNumbers.length > 0) {
      prompt += `## 🔒 Security Information\n\n`;
      prompt += `**CVE IDs:** ${technicalDetails.cveNumbers.join(', ')}\n\n`;
    }
    
    if (technicalDetails.libraries && technicalDetails.libraries.length > 0) {
      prompt += `## 📦 Affected Libraries\n\n`;
      technicalDetails.libraries.forEach(lib => {
        prompt += `- ${lib}\n`;
      });
      prompt += `\n`;
    }
    
    if (technicalDetails.errorMessages && technicalDetails.errorMessages.length > 0) {
      prompt += `## ⚠️ Error Messages\n\n`;
      prompt += `\`\`\`\n`;
      technicalDetails.errorMessages.forEach(err => {
        prompt += `${err}\n`;
      });
      prompt += `\`\`\`\n\n`;
    }
    
    if (comments && comments.length > 0) {
      prompt += `## 💬 Comments (${comments.length})\n\n`;
      comments.slice(-3).forEach((comment, idx) => {
        const author = comment.author?.displayName || 'Unknown';
        const body = comment.body || '';
        prompt += `**Comment ${idx + 1} by ${author}:**\n${body}\n\n`;
      });
    }
    
    prompt += `## ✅ Action Items\n\n`;
    actionItems.forEach((action, idx) => {
      prompt += `${idx + 1}. ${action}\n`;
    });
    prompt += `\n`;
    
    // Generate specific instructions based on issue type
    if (issueType === 'Vulnerability' && tableData.current_version && tableData.remediation) {
      prompt += `## 🎯 Specific Instructions\n\n`;
      prompt += `Please help me upgrade the affected library:\n\n`;
      prompt += `1. Search for dependency declarations in the codebase (pom.xml, package.json, build.gradle, requirements.txt, etc.)\n`;
      prompt += `2. Update the version from \`${tableData.current_version}\` to \`${tableData.remediation}\`\n`;
      prompt += `3. Check for any breaking changes in the changelog\n`;
      prompt += `4. Update any affected code if the API changed\n`;
      prompt += `5. Run tests to ensure everything works\n\n`;
    } else if (issueType === 'Bug') {
      prompt += `## 🎯 Specific Instructions\n\n`;
      prompt += `Please help me fix this bug:\n\n`;
      prompt += `1. Locate the file(s) mentioned in the error or description\n`;
      prompt += `2. Analyze the code to understand the root cause\n`;
      prompt += `3. Implement a fix that resolves the issue\n`;
      prompt += `4. Add or update tests to prevent regression\n`;
      prompt += `5. Verify the fix works as expected\n\n`;
    }
    
    prompt += `## 🔗 Reference\n\n`;
    prompt += `Jira Ticket: ${issue.key}\n`;
    prompt += `Link: ${issue.self.replace('/rest/api/2/issue/', '/browse/')}\n`;
    
    return prompt;
  }

  /**
   * Main method to analyze a Jira ticket and generate a comprehensive prompt
   */
  public static analyzeTicket(issue: JiraIssue, comments: any[] = []): TicketAnalysis {
    // Handle null/undefined description
    const description = issue.fields?.description || '';
    
    // Ensure comments is an array
    const safeComments = Array.isArray(comments) ? comments : [];
    
    const technicalDetails = this.extractTechnicalDetails(description, safeComments);
    const tableData = this.parseJiraTable(description);
    const actionItems = this.generateActionItems(issue, technicalDetails, tableData);
    const cursorPrompt = this.generateCursorPrompt(issue, safeComments, technicalDetails, tableData, actionItems);
    
    return {
      ticketKey: issue.key,
      summary: issue.fields?.summary || 'No summary',
      issueType: issue.fields?.issuetype?.name || 'Unknown',
      priority: issue.fields?.priority?.name || 'N/A',
      description: description,
      comments: safeComments.map(c => c?.body || ''),
      technicalDetails,
      actionItems,
      cursorPrompt
    };
  }
}

