# Jira Context MCP Server

A powerful Model Context Protocol (MCP) server that integrates Jira with Cursor IDE, enabling AI-powered issue management, sprint tracking, and library vulnerability analysis.

## 🚀 Features

- **Jira Integration**: Fetch issue details, manage sprints, track progress
- **Sprint Management**: View active sprints, generate reports, analyze backlog
- **Library Vulnerability Analysis**: Check Maven/NPM packages for vulnerabilities and upgrade recommendations
- **Database Integration**: Query MySQL databases directly from Cursor
- **Smart URL Parser**: Paste any Jira board/sprint URL and get instant insights

## 📋 Prerequisites

- Node.js 20.17.0 or higher
- A Jira account with API access
- Jira API token ([Generate here](https://id.atlassian.com/manage-profile/security/api-tokens))

## ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Darshancisco/Appd_jira_context_mcp.git
   cd Appd_jira_context_mcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file**:
   ```env
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_USERNAME=your-email@example.com
   JIRA_API_TOKEN=your-api-token-here
   HTTP_PORT=3000
   ```

5. **Build the project**:
   ```bash
   npm run build
   ```

## 🏃 Running the Server

Start the MCP server:

```bash
npm start
```

The server will start on `http://localhost:3000/sse`

## 🔌 Connect to Cursor IDE

### Method 1: Using Cursor Settings (Recommended)

1. Open Cursor IDE
2. Go to **Settings** → **Features** → **Model Context Protocol**
3. Add a new MCP server with:
   - **Name**: Jira Context MCP
   - **URL**: `http://localhost:3000/sse`
4. Click **Connect**

### Method 2: Using Command Palette

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type **"Connect to MCP Server"**
3. Enter: `http://localhost:3000/sse`

## 🛠️ Available Tools

Once connected, you can use these tools in Cursor:

### Jira Issue Management
- `get_issue` - Get detailed information about a Jira issue
- `get_assigned_issues` - Get issues assigned to you
- `get_issues_by_type` - Filter issues by type (Bug, Story, Epic, etc.)
- `get_projects` - List all available Jira projects
- `get_issue_types` - List all issue types

### Sprint & Board Management
- `analyze_jira_url` - Parse any Jira URL (board/sprint/issue)
- `get_boards` - List all agile boards
- `get_sprints` - Get sprints for a board
- `get_sprint_issues` - Get all issues in a sprint
- `get_backlog` - Get backlog issues
- `get_sprint_report` - Generate comprehensive sprint report

### Library Vulnerability Tools
- `check_maven_library` - Check Maven library for vulnerabilities
- `check_npm_library` - Check NPM package for vulnerabilities
- `analyze_dependencies` - Analyze project dependencies
- `recommend_upgrade` - Get smart upgrade recommendations
- `get_github_release_notes` - Fetch release notes for library upgrades
- `find_library_usage` - Find where a library is used in codebase

### Database Tools
- `list_databases` - List all MySQL databases
- `list_db_tables` - List tables in a database
- `get_table_schema` - Get table structure
- `query_database` - Execute SQL queries
- `search_table` - Search across table columns

## 💡 Example Usage

### Analyze Your Sprint Board
```
Analyze my sprint board: https://jira.corp.appdynamics.com/secure/RapidBoard.jspa?rapidView=2823
```

### Check Library Vulnerability
```
Check if org.springframework:spring-core version 5.3.0 has any vulnerabilities
```

### Get Assigned Issues
```
Show me all issues assigned to me in project ABC
```

### Sprint Report
```
Generate sprint report for board 2823
```

## 📁 Project Structure

```
.
├── src/
│   ├── index.ts              # Application entry point
│   ├── server.ts             # MCP server implementation
│   ├── cli.ts                # CLI interface
│   ├── services/             # Core services
│   │   ├── jira.ts           # Jira API integration
│   │   ├── libraryManager.ts # Library vulnerability analysis
│   │   ├── DatabaseService.ts # MySQL integration
│   │   └── ...
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Utility functions
├── dist/                     # Compiled JavaScript (generated)
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
└── .env                      # Environment variables (create this)
```

## 🔧 Development

### Run in development mode:
```bash
npm run dev
```

### Build:
```bash
npm run build
```

### Type checking:
```bash
npm run type-check
```

## 🐛 Troubleshooting

### Server won't start
- Ensure Node.js version is 20.17.0 or higher: `node --version`
- Check if port 3000 is available
- Verify `.env` file is configured correctly

### Can't connect in Cursor
- Make sure the server is running (`npm start`)
- Verify the URL is `http://localhost:3000/sse`
- Check Cursor's MCP connection settings

### Jira API errors
- Verify your API token is valid
- Ensure `JIRA_BASE_URL` matches your Jira instance
- Check your Jira account has necessary permissions

## 📄 License

MIT License

## 👤 Author

**Darshan Hanumanthappa**
- Email: darshan.hanumanthappa@gmail.com
- GitHub: [@Darshancisco](https://github.com/Darshancisco)

## 🙏 Acknowledgments

Built for AppDynamics engineering team to streamline Jira workflow integration with Cursor IDE.

