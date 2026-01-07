#!/usr/bin/env python3
"""
Python bridge script for JIRA API calls
Since Python requests work but Node.js axios doesn't, this script handles JIRA communication
"""
import sys
import json
import requests
import yaml
import urllib3
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Disable SSL warnings for corporate JIRA
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def load_config():
    """Load configuration from config.yml"""
    try:
        with open('config.yml', 'r') as file:
            return yaml.safe_load(file)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load config: {str(e)}"}))
        sys.exit(1)

def fetch_jira_ticket(ticket_id, config):
    """Fetch JIRA ticket data using Python requests with robust retry logic"""
    try:
        url = f"{config['jira_url']}/rest/api/2/issue/{ticket_id}"
        
        # Create session with retry strategy
        session = requests.Session()
        session.verify = False  # Disable SSL verification for corporate JIRA
        
        # Setup retry strategy
        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"],
            backoff_factor=1
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Multiple timeout and connection attempts
        timeouts = [10, 20, 30]
        
        for timeout in timeouts:
            try:
                print(f"Attempting JIRA request with {timeout}s timeout...", file=sys.stderr)
                
                response = session.get(
                    url,
                    headers={
                        'Authorization': f"Bearer {config['jira_token']}",
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'User-Agent': 'python-requests/2.31.0',
                        'Connection': 'close'
                    },
                    timeout=timeout,
                    stream=False
                )
                
                response.raise_for_status()
                print(f"JIRA request successful with {timeout}s timeout", file=sys.stderr)
                break
                
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                print(f"Timeout/Connection error with {timeout}s: {e}", file=sys.stderr)
                if timeout == timeouts[-1]:
                    raise
                continue
        
        data = response.json()
        fields = data.get('fields', {})
        
        # Handle description field properly (could be None or complex object)
        description = fields.get('description', '')
        if isinstance(description, dict):
            # JIRA sometimes returns description as structured content
            description = str(description)
        elif description is None:
            description = 'No description'
        
        return {
            "success": True,
            "ticket": ticket_id,
            "summary": fields.get('summary', 'No summary'),
            "description": description,
            "status": fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown',
            "assignee": fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned',
            "message": "Successfully fetched from JIRA using Python bridge"
        }
        
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        print(f"Request error: {error_msg}", file=sys.stderr)
        return {
            "success": False,
            "error": error_msg,
            "ticket": ticket_id,
            "message": "Python bridge request failed",
            "suggestion": "Check VPN connection and JIRA credentials"
        }
    except Exception as e:
        error_msg = str(e)
        print(f"Unexpected error: {error_msg}", file=sys.stderr)
        return {
            "success": False,
            "error": error_msg,
            "ticket": ticket_id,
            "message": "Unexpected error in Python bridge"
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Ticket ID required"}))
        sys.exit(1)
    
    ticket_id = sys.argv[1]
    config = load_config()
    
    result = fetch_jira_ticket(ticket_id, config)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()