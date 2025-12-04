# 🚀 Team Setup Guide - Jira MCP Server

## For AppDynamics Team Members

This guide helps you set up the Jira MCP Server on your local machine.

---

## ⚡ Quick Setup (5 Minutes)

### Prerequisites
- ✅ Node.js 20.17.0 or higher
- ✅ Python 3
- ✅ Cursor IDE with MCP support
- ✅ Jira account with API access
- ✅ (Optional) MySQL database access

---

## 📦 Step 1: Clone the Repository

```bash
git clone https://github.com/your-repo/Jira-Context-MCP.git
cd Jira-Context-MCP
```

---

## 🔧 Step 2: Install Dependencies

```bash
npm install
```

This installs all required packages including:
- MCP SDK
- MySQL2
- Jira API libraries

---

## 🔑 Step 3: Configure Your Credentials

### Create Your `.env` File:

```bash
cp .env.example .env
```

### Edit `.env` with YOUR credentials:

```env
# Jira Configuration (REQUIRED)
JIRA_BASE_URL=https://jira.corp.appdynamics.com
JIRA_USERNAME=your.email@appdynamics.com
JIRA_API_TOKEN=your-personal-api-token

# Database Configuration (OPTIONAL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-db-password
DB_NAME=
```

### 🔐 How to Get Your Jira API Token:

1. Go to: https://jira.corp.appdynamics.com
2. Click your profile → **Profile**
3. Go to **Security** → **API Tokens**
4. Click **Create Token**
5. Copy the token to your `.env` file

**⚠️ IMPORTANT:** Never commit your `.env` file to git!

---

## 🏗️ Step 4: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

---

## 🔌 Step 5: Configure Cursor

### Edit your Cursor MCP config:

**Mac/Linux:** `~/.cursor/mcp.json`
**Windows:** `%APPDATA%\Cursor\mcp.json`

Add this configuration (update the path to match your installation):

```json
{
  "mcpServers": {
    "jira-resolution": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Jira-Context-MCP/dist/index.js"],
      "cwd": "/ABSOLUTE/PATH/TO/Jira-Context-MCP",
      "env": {
        "JIRA_BASE_URL": "https://jira.corp.appdynamics.com",
        "JIRA_USERNAME": "your.email@appdynamics.com",
        "JIRA_API_TOKEN": "your-api-token",
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "your-db-password"
      }
    }
  }
}
```

**🔐 Security Note:** This file is local to your machine and not shared.

---

## ✅ Step 6: Restart Cursor

1. Quit Cursor completely (`Cmd+Q` on Mac)
2. Reopen Cursor
3. Go to **Settings** → **Tools & MCP**
4. You should see "jira-resolution" with 29 tools!

---

## 🧪 Step 7: Test It!

Try these commands in Cursor:

```
List all Jira projects
```

```
Show me all databases
```

```
Analyze my sprint board: https://jira.corp.appdynamics.com/secure/RapidBoard.jspa?rapidView=2823
```

If these work, you're all set! 🎉

---

## 🎯 Available Features

Once configured, you get access to **29 powerful tools**:

### 📋 Jira Tools (7)
- Get issue details
- List assigned issues
- Filter by type
- Get projects
- Analyze tickets
- Resolve vulnerabilities

### 🏃 Sprint Board Tools (6)
- Analyze sprint boards
- Get sprint status
- View sprint issues
- Check backlog
- Sprint reports

### 🗄️ Database Tools (8)
- List databases
- Query MySQL
- Search tables
- Get schemas
- Database statistics

### 📦 Library Tools (8)
- Check Maven/NPM versions
- Analyze vulnerabilities
- Dependency analysis
- Breaking change detection

---

## 🔧 Troubleshooting

### "Tool not found" or "Connection failed"

**Check:**
1. Is the path in `mcp.json` correct? (Use absolute path)
2. Did you run `npm run build`?
3. Are your credentials correct in `.env`?
4. Did you restart Cursor after configuration?

### "Only seeing 21 tools instead of 29"

**Fix:**
1. Make sure database config (`DB_HOST`, etc.) is in `mcp.json`
2. Toggle the MCP server off/on in Cursor settings
3. Restart Cursor completely

### "Jira connection failed"

**Check:**
1. Are you on VPN? (May be required for corporate Jira)
2. Is your API token correct?
3. Is the Jira URL correct?

### "Database connection failed"

**Check:**
1. Is MySQL running? (`mysql -u root -p`)
2. Are credentials correct?
3. Can you access the database locally?

---

## 📚 Documentation

Full documentation available in the repo:

- **README.md** - Overview and features
- **DEMO-SCRIPT.md** - Complete demo walkthrough
- **MYSQL-QUICK-START.md** - Database features guide
- **SPRINT-BOARD-GUIDE.md** - Sprint management guide
- **DATABASE-INTEGRATION-GUIDE.md** - Technical details

---

## 🔒 Security Best Practices

### ✅ DO:
- ✅ Use your personal Jira API token
- ✅ Keep your `.env` file local (never commit)
- ✅ Use read-only database credentials if possible
- ✅ Regenerate API tokens periodically

### ❌ DON'T:
- ❌ Share your API token with others
- ❌ Commit `.env` to git
- ❌ Use production database credentials
- ❌ Share your `mcp.json` file (has your credentials)

---

## 🆘 Getting Help

### Contact
- **Author:** Darshan Hanumanthappa
- **Email:** darshan.hanumanthappa@appdynamics.com
- **Internal Slack:** #jira-mcp-server (if available)

### Common Questions

**Q: Can I use this with ChatGPT?**
A: No, this uses MCP protocol which only works with Cursor/Claude Desktop.

**Q: Can multiple people use the same server?**
A: Yes! Deploy with `NODE_ENV=http npm start` and share the HTTP endpoint.

**Q: Do I need database access?**
A: No, database tools are optional. Jira tools work without database.

**Q: Can I customize the tools?**
A: Yes! Fork the repo and modify `src/server.ts` to add your own tools.

---

## 🎉 You're Ready!

Once setup is complete, you have:
- ✅ Direct Jira access from Cursor
- ✅ Sprint board management
- ✅ Database querying capabilities
- ✅ Vulnerability analysis
- ✅ AI-powered issue resolution

**All without leaving your IDE!** 🚀

---

## 📅 Updates

The team maintains this server. To get latest updates:

```bash
cd Jira-Context-MCP
git pull origin main
npm install
npm run build
# Restart Cursor
```

---

**Built with ❤️ for the AppDynamics Engineering Team**



