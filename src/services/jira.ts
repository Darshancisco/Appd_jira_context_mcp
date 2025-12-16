/**
 * JIRA MCP Server - JIRA Service
 * 
 * Copyright (c) 2024 Darshan Hanumanthappa <darshan.hanumanthappa@gmail.com>
 * Licensed under the MIT License
 */

import { JiraError, JiraIssue, JiraProject, JiraProjectListResponse, JiraSearchParams, JiraSearchResponse, JiraIssueTypeResponse } from "~/types/jira";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// Calculate absolute path to Python bridge (robust regardless of cwd)
// When compiled: __dirname = /Users/.../dist/services, so go up 2 levels
const PYTHON_BRIDGE_PATH = path.join(__dirname, '..', '..', 'jira_python_bridge.py');

/**
 * JiraService - Handles all JIRA API interactions
 * 
 * This service exclusively uses the Python bridge for all JIRA API calls.
 * The Python bridge handles authentication, SSL/TLS issues, and corporate
 * network configurations that may not work with direct Node.js HTTP clients.
 */
export class JiraService {
  private readonly baseUrl: string;
  private readonly auth: {
    username: string;
    password: string;
  };
  private readonly usePythonBridge: boolean = true;

  constructor(baseUrl: string, username: string, apiToken: string) {
    // Ensure the base URL doesn't end with a trailing slash
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.auth = {
      username,
      password: apiToken,
    };
    console.error('[DEBUG] JiraService initialized - Using Python bridge for all API calls');
  }

  /**
   * Get a Jira issue with full details (including comments) using Python bridge
   */
  async getIssueWithComments(issueKey: string): Promise<any> {
    console.error(`[DEBUG] Fetching issue ${issueKey} with comments via Python bridge...`);
    console.error(`[DEBUG] Python bridge path: ${PYTHON_BRIDGE_PATH}`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      // Fetch full issue details including comments
      const python = spawn('python3', [PYTHON_BRIDGE_PATH, 'fetch', issueKey], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
          JIRA_FETCH_COMMENTS: 'true'
        }
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python bridge error: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          // Extract comments if available
          const issue = result.data;
          const comments = issue.fields?.comment?.comments || [];
          
          resolve({
            key: issue.key,
            fields: issue.fields,
            comments: comments.map((c: any) => ({
              author: c.author?.displayName || 'Unknown',
              body: c.body || '',
              created: c.created,
              updated: c.updated
            }))
          });
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get a Jira issue by key using Python bridge
   */
  private async getIssueViaPython(issueKey: string): Promise<JiraIssue> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, 'fetch', issueKey], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          // Python bridge returns the full Jira response in result.data
          resolve(result.data as JiraIssue);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get a Jira issue by key
   * Uses Python bridge for reliable authentication and corporate network compatibility
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    console.error(`[DEBUG] Fetching issue ${issueKey} via Python bridge...`);
    const response = await this.getIssueViaPython(issueKey);
    writeLogs(`jira-issue-${issueKey}.json`, response);
    return response;
  }

  /**
   * Search for Jira issues using JQL via Python bridge
   */
  private async searchIssuesViaPython(params: JiraSearchParams): Promise<JiraSearchResponse> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [
        PYTHON_BRIDGE_PATH, 
        'search', 
        params.jql, 
        String(params.maxResults || 50)
      ], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data as JiraSearchResponse);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Search for Jira issues using JQL
   * Uses Python bridge for reliable authentication and corporate network compatibility
   */
  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResponse> {
    console.error(`[DEBUG] Searching issues via Python bridge...`);
    const response = await this.searchIssuesViaPython(params);
    writeLogs(`jira-search-${new Date().toISOString()}.json`, response);
    return response;
  }

  /**
   * Get issues assigned to the current user
   */
  async getAssignedIssues(projectKey?: string, maxResults: number = 50): Promise<JiraSearchResponse> {
    const jql = projectKey 
      ? `assignee = currentUser() AND project = ${projectKey} ORDER BY updated DESC` 
      : 'assignee = currentUser() ORDER BY updated DESC';
    
    return this.searchIssues({
      jql,
      maxResults,
      fields: ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'project'],
    });
  }

  /**
   * Get issues by type
   */
  async getIssuesByType(issueType: string, projectKey?: string, maxResults: number = 50): Promise<JiraSearchResponse> {
    const jql = projectKey 
      ? `issuetype = "${issueType}" AND project = ${projectKey} ORDER BY updated DESC` 
      : `issuetype = "${issueType}" ORDER BY updated DESC`;
    
    return this.searchIssues({
      jql,
      maxResults,
      fields: ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'project'],
    });
  }

  /**
   * Get list of projects via Python bridge
   */
  private async getProjectsViaPython(): Promise<JiraProject[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [
        PYTHON_BRIDGE_PATH, 
        'projects'
      ], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data as JiraProject[]);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get list of projects
   * Uses Python bridge for reliable authentication and corporate network compatibility
   */
  async getProjects(): Promise<JiraProject[]> {
    console.error(`[DEBUG] Fetching projects via Python bridge...`);
    return await this.getProjectsViaPython();
  }
  
  /**
   * Get list of issue types via Python bridge
   */
  private async getIssueTypesViaPython(): Promise<JiraIssueTypeResponse> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [
        PYTHON_BRIDGE_PATH, 
        'issuetypes'
      ], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data as JiraIssueTypeResponse);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get list of issue types
   * Uses Python bridge for reliable authentication and corporate network compatibility
   */
  async getIssueTypes(): Promise<JiraIssueTypeResponse> {
    console.error(`[DEBUG] Fetching issue types via Python bridge...`);
    return await this.getIssueTypesViaPython();
  }

  /**
   * Get list of agile boards (optionally filtered by project)
   */
  async getBoards(projectKey?: string): Promise<any> {
    console.error(`[DEBUG] Fetching boards via Python bridge...`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const args = ['boards'];
      if (projectKey) {
        args.push(projectKey);
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, ...args], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get sprints for a board
   */
  async getSprints(boardId: string, state?: 'active' | 'future' | 'closed'): Promise<any> {
    console.error(`[DEBUG] Fetching sprints for board ${boardId} via Python bridge...`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const args = ['sprints', boardId];
      if (state) {
        args.push(state);
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, ...args], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get issues in a sprint
   */
  async getSprintIssues(sprintId: string): Promise<any> {
    console.error(`[DEBUG] Fetching issues for sprint ${sprintId} via Python bridge...`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, 'sprint_issues', sprintId], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get backlog issues for a board
   */
  async getBacklog(boardId: string): Promise<any> {
    console.error(`[DEBUG] Fetching backlog for board ${boardId} via Python bridge...`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, 'backlog', boardId], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }

  /**
   * Get sprint report with metrics
   */
  async getSprintReport(boardId: string, sprintId: string): Promise<any> {
    console.error(`[DEBUG] Fetching sprint report for sprint ${sprintId} via Python bridge...`);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(PYTHON_BRIDGE_PATH)) {
        reject(new Error(`Python bridge not found at: ${PYTHON_BRIDGE_PATH}`));
        return;
      }

      const python = spawn('python3', [PYTHON_BRIDGE_PATH, 'sprint_report', boardId, sprintId], {
        env: {
          ...process.env,
          JIRA_BASE_URL: this.baseUrl,
          JIRA_USERNAME: this.auth.username,
          JIRA_API_TOKEN: this.auth.password,
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python bridge stderr:', stderr);
          reject(new Error(`Python bridge failed with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (!result.success) {
            reject(new Error(result.error || 'Python bridge returned error'));
            return;
          }

          resolve(result.data);
        } catch (error) {
          reject(new Error(`Failed to parse Python bridge response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python bridge: ${error.message}`));
      });

      setTimeout(() => {
        python.kill();
        reject(new Error('Python bridge timeout'));
      }, 30000);
    });
  }
}

function writeLogs(name: string, value: any) {
  const logsDir = "logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
} 