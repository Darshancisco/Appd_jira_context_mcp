#!/usr/bin/env python3
"""
Python bridge script for JIRA API calls via MCP Server
Uses environment variables for configuration (passed from Node.js)
Supports multiple JIRA API operations: fetch issues, boards, sprints, etc.
"""
import sys
import json
import os
import requests
import urllib3
from requests.auth import HTTPBasicAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Disable SSL warnings for corporate JIRA
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def get_jira_config():
    """Get JIRA configuration from environment variables"""
    base_url = os.environ.get('JIRA_BASE_URL')
    username = os.environ.get('JIRA_USERNAME')
    api_token = os.environ.get('JIRA_API_TOKEN')
    
    if not all([base_url, username, api_token]):
        raise ValueError("Missing required environment variables: JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN")
    
    return {
        'base_url': base_url.rstrip('/'),
        'username': username,
        'api_token': api_token
    }

def create_jira_session(config):
    """Create a requests session with retry logic and authentication"""
    session = requests.Session()
    session.verify = False  # Disable SSL verification for corporate JIRA
    session.auth = HTTPBasicAuth(config['username'], config['api_token'])
    
    # Setup retry strategy
    retry_strategy = Retry(
        total=3,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS", "POST"],
        backoff_factor=1
    )
    
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session

def jira_api_request(config, endpoint, method='GET', params=None, json_data=None):
    """Make a JIRA API request with proper error handling"""
    try:
        session = create_jira_session(config)
        url = f"{config['base_url']}/rest/api/2/{endpoint}"
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Jira-MCP-Python-Bridge/1.0'
        }
        
        response = session.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=30
        )
        
        response.raise_for_status()
        return {"success": True, "data": response.json()}
        
    except requests.exceptions.HTTPError as e:
        return {
            "success": False,
            "error": f"HTTP {e.response.status_code}: {e.response.text}",
            "status_code": e.response.status_code
        }
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Network or connection error"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Unexpected error in Python bridge"
        }

def fetch_issue(config, issue_key):
    """Fetch a single JIRA issue with optional comments"""
    fetch_comments = os.environ.get('JIRA_FETCH_COMMENTS', 'false').lower() == 'true'
    
    if fetch_comments:
        # Fetch with expanded fields including comments
        result = jira_api_request(config, f"issue/{issue_key}", params={'expand': 'renderedFields,names,schema,operations,editmeta,changelog,versionedRepresentations,comment'})
    else:
        result = jira_api_request(config, f"issue/{issue_key}")
    
    return result

def search_issues(config, jql, start_at=0, max_results=50):
    """Search for issues using JQL"""
    params = {
        'jql': jql,
        'startAt': start_at,
        'maxResults': max_results,
        'fields': '*all'
    }
    return jira_api_request(config, "search", params=params)

def get_boards(config, project_key=None):
    """Get agile boards"""
    endpoint = "board"
    params = {}
    if project_key:
        params['projectKeyOrId'] = project_key
    
    # Use agile API
    session = create_jira_session(config)
    url = f"{config['base_url']}/rest/agile/1.0/{endpoint}"
    
    try:
        response = session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_sprints(config, board_id, state=None):
    """Get sprints for a board"""
    endpoint = f"board/{board_id}/sprint"
    params = {}
    if state:
        params['state'] = state
    
    session = create_jira_session(config)
    url = f"{config['base_url']}/rest/agile/1.0/{endpoint}"
    
    try:
        response = session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_sprint_issues(config, sprint_id):
    """Get issues in a sprint"""
    endpoint = f"sprint/{sprint_id}/issue"
    
    session = create_jira_session(config)
    url = f"{config['base_url']}/rest/agile/1.0/{endpoint}"
    
    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_backlog(config, board_id):
    """Get backlog issues for a board"""
    endpoint = f"board/{board_id}/backlog"
    
    session = create_jira_session(config)
    url = f"{config['base_url']}/rest/agile/1.0/{endpoint}"
    
    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_sprint_report(config, board_id, sprint_id):
    """Get sprint report (uses regular API)"""
    # First get sprint details
    sprint_result = jira_api_request(config, f"sprint/{sprint_id}" if "/agile/" not in config['base_url'] else f"agile/1.0/sprint/{sprint_id}")
    if not sprint_result['success']:
        return sprint_result
    
    # Then get issues in sprint
    issues_result = get_sprint_issues(config, sprint_id)
    if not issues_result['success']:
        return issues_result
    
    return {
        "success": True,
        "data": {
            "sprint": sprint_result.get('data'),
            "issues": issues_result.get('data', {}).get('issues', [])
        }
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Command required"}), file=sys.stdout)
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        config = get_jira_config()
        
        if command == 'fetch':
            if len(sys.argv) < 3:
                result = {"success": False, "error": "Issue key required"}
            else:
                issue_key = sys.argv[2]
                result = fetch_issue(config, issue_key)
        
        elif command == 'search':
            if len(sys.argv) < 3:
                result = {"success": False, "error": "JQL query required"}
            else:
                jql = sys.argv[2]
                start_at = int(sys.argv[3]) if len(sys.argv) > 3 else 0
                max_results = int(sys.argv[4]) if len(sys.argv) > 4 else 50
                result = search_issues(config, jql, start_at, max_results)
        
        elif command == 'boards':
            project_key = sys.argv[2] if len(sys.argv) > 2 else None
            result = get_boards(config, project_key)
        
        elif command == 'sprints':
            if len(sys.argv) < 3:
                result = {"success": False, "error": "Board ID required"}
            else:
                board_id = sys.argv[2]
                state = sys.argv[3] if len(sys.argv) > 3 else None
                result = get_sprints(config, board_id, state)
        
        elif command == 'sprint_issues':
            if len(sys.argv) < 3:
                result = {"success": False, "error": "Sprint ID required"}
            else:
                sprint_id = sys.argv[2]
                result = get_sprint_issues(config, sprint_id)
        
        elif command == 'backlog':
            if len(sys.argv) < 3:
                result = {"success": False, "error": "Board ID required"}
            else:
                board_id = sys.argv[2]
                result = get_backlog(config, board_id)
        
        elif command == 'sprint_report':
            if len(sys.argv) < 4:
                result = {"success": False, "error": "Board ID and Sprint ID required"}
            else:
                board_id = sys.argv[2]
                sprint_id = sys.argv[3]
                result = get_sprint_report(config, board_id, sprint_id)
        
        else:
            result = {"success": False, "error": f"Unknown command: {command}"}
        
        print(json.dumps(result, indent=2), file=sys.stdout)
        
    except ValueError as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stdout)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Unexpected error: {str(e)}"}), file=sys.stdout)
        sys.exit(1)

if __name__ == "__main__":
    main()
