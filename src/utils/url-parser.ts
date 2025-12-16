/**
 * Extracts a Jira issue key from a URL
 * Example URLs:
 * - https://your-domain.atlassian.net/browse/PROJECT-123
 * - https://your-domain.atlassian.net/jira/software/projects/PROJECT/issues/PROJECT-123
 * 
 * @param url The Jira issue URL
 * @returns The extracted issue key or null if not found
 */
export function extractIssueKeyFromUrl(url: string): string | null {
  // First, try the standard pattern for browse URLs
  const browseRegex = /\/browse\/([A-Z0-9]+-[0-9]+)/;
  const browseMatch = url.match(browseRegex);
  if (browseMatch && browseMatch[1]) {
    return browseMatch[1];
  }

  // Try the pattern for the new Jira interface
  const issuesRegex = /\/issues\/([A-Z0-9]+-[0-9]+)/;
  const issuesMatch = url.match(issuesRegex);
  if (issuesMatch && issuesMatch[1]) {
    return issuesMatch[1];
  }

  // If nothing matches, try to find any pattern that looks like a Jira key
  const generalRegex = /([A-Z0-9]+-[0-9]+)/;
  const generalMatch = url.match(generalRegex);
  if (generalMatch && generalMatch[1]) {
    return generalMatch[1];
  }

  return null;
}

/**
 * Extracts a project key from a Jira URL
 * Example URLs:
 * - https://your-domain.atlassian.net/browse/PROJECT-123
 * - https://your-domain.atlassian.net/jira/software/projects/PROJECT/issues
 * 
 * @param url The Jira URL
 * @returns The extracted project key or null if not found
 */
export function extractProjectKeyFromUrl(url: string): string | null {
  // Try to match project from the projects URL path
  const projectsRegex = /\/projects\/([A-Z0-9]+)/;
  const projectsMatch = url.match(projectsRegex);
  if (projectsMatch && projectsMatch[1]) {
    return projectsMatch[1];
  }

  // Try to extract from an issue key if present
  const issueKey = extractIssueKeyFromUrl(url);
  if (issueKey) {
    const parts = issueKey.split('-');
    if (parts.length > 0) {
      return parts[0];
    }
  }

  return null;
}

/**
 * Extracts a board ID from a Jira board URL
 * Example URLs:
 * - https://jira.corp.appdynamics.com/secure/RapidBoard.jspa?rapidView=2823
 * - https://your-domain.atlassian.net/jira/software/c/projects/PROJECT/boards/123
 * 
 * @param url The Jira board URL
 * @returns The extracted board ID or null if not found
 */
export function extractBoardIdFromUrl(url: string): string | null {
  // If it's already just a number, return it
  if (/^\d+$/.test(url)) {
    return url;
  }

  // Try to extract from rapidView parameter (classic Jira)
  const rapidViewRegex = /[?&]rapidView=(\d+)/;
  const rapidViewMatch = url.match(rapidViewRegex);
  if (rapidViewMatch && rapidViewMatch[1]) {
    return rapidViewMatch[1];
  }

  // Try to extract from boards path (new Jira)
  const boardsRegex = /\/boards\/(\d+)/;
  const boardsMatch = url.match(boardsRegex);
  if (boardsMatch && boardsMatch[1]) {
    return boardsMatch[1];
  }

  return null;
}

/**
 * Extracts a sprint ID from a Jira URL
 * Example URLs:
 * - https://your-domain.atlassian.net/jira/software/c/projects/PROJECT/boards/123?sprint=456
 * 
 * @param url The Jira sprint URL
 * @returns The extracted sprint ID or null if not found
 */
export function extractSprintIdFromUrl(url: string): string | null {
  // If it's already just a number, return it
  if (/^\d+$/.test(url)) {
    return url;
  }

  // Try to extract from sprint parameter
  const sprintRegex = /[?&]sprint=(\d+)/;
  const sprintMatch = url.match(sprintRegex);
  if (sprintMatch && sprintMatch[1]) {
    return sprintMatch[1];
  }

  return null;
}

/**
 * Parse any Jira URL and determine its type
 * @param url The Jira URL to parse
 * @returns Object with type and extracted ID
 */
export function parseJiraUrl(url: string): { 
  type: 'issue' | 'board' | 'sprint' | 'project' | 'unknown', 
  id: string | null,
  projectKey?: string | null,
  boardId?: string | null
} {
  const issueKey = extractIssueKeyFromUrl(url);
  if (issueKey) {
    return { 
      type: 'issue', 
      id: issueKey,
      projectKey: extractProjectKeyFromUrl(url)
    };
  }

  const boardId = extractBoardIdFromUrl(url);
  if (boardId) {
    const sprintId = extractSprintIdFromUrl(url);
    if (sprintId) {
      return { 
        type: 'sprint', 
        id: sprintId,
        boardId: boardId,
        projectKey: extractProjectKeyFromUrl(url)
      };
    }
    return { 
      type: 'board', 
      id: boardId,
      projectKey: extractProjectKeyFromUrl(url)
    };
  }

  const projectKey = extractProjectKeyFromUrl(url);
  if (projectKey) {
    return { type: 'project', id: projectKey, projectKey };
  }

  return { type: 'unknown', id: null };
} 