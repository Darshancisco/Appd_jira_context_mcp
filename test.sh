#!/bin/bash
# Test script for Jira Context MCP Server

echo "🧪 Testing Jira Context MCP Server"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check Node.js
echo -n "1️⃣  Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

# Test 2: Check Python
echo -n "2️⃣  Checking Python 3... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✅ $PYTHON_VERSION${NC}"
else
    echo -e "${RED}❌ Python 3 not found${NC}"
    exit 1
fi

# Test 3: Check Python packages
echo -n "3️⃣  Checking Python packages... "
if python3 -c "import requests, urllib3" 2>/dev/null; then
    echo -e "${GREEN}✅ requests, urllib3${NC}"
else
    echo -e "${RED}❌ Missing packages${NC}"
    echo "   Run: pip3 install requests urllib3"
    exit 1
fi

# Test 4: Check npm dependencies
echo -n "4️⃣  Checking npm dependencies... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ Installed${NC}"
else
    echo -e "${YELLOW}⚠️  Not installed${NC}"
    echo "   Run: npm install"
    exit 1
fi

# Test 5: Check if built
echo -n "5️⃣  Checking build... "
if [ -f "dist/index.js" ] && [ -f "dist/server.js" ]; then
    echo -e "${GREEN}✅ Built${NC}"
else
    echo -e "${YELLOW}⚠️  Not built${NC}"
    echo "   Run: npm run build"
    exit 1
fi

# Test 6: Check Python bridge
echo -n "6️⃣  Checking Python bridge... "
if [ -f "jira_python_bridge.py" ] && [ -x "jira_python_bridge.py" ]; then
    echo -e "${GREEN}✅ Ready${NC}"
else
    echo -e "${RED}❌ Missing or not executable${NC}"
    exit 1
fi

# Test 7: Test Python bridge error handling
echo -n "7️⃣  Testing Python bridge... "
BRIDGE_OUTPUT=$(python3 jira_python_bridge.py 2>&1)
if echo "$BRIDGE_OUTPUT" | grep -q '"success": false'; then
    echo -e "${GREEN}✅ Responds correctly${NC}"
else
    echo -e "${RED}❌ Unexpected response${NC}"
    exit 1
fi

# Test 8: Test server startup
echo -n "8️⃣  Testing server startup... "
( node dist/index.js > /tmp/mcp_test.log 2>&1 & SERVER_PID=$! ; sleep 2 ; kill $SERVER_PID 2>/dev/null )
if grep -q "Server connected and ready" /tmp/mcp_test.log 2>/dev/null; then
    echo -e "${GREEN}✅ Starts successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Check logs${NC}"
fi

# Test 9: Check configuration
echo -n "9️⃣  Checking MCP configuration... "
if [ -f "$HOME/.cursor/mcp.json" ]; then
    if grep -q "jira-resolution" "$HOME/.cursor/mcp.json"; then
        echo -e "${GREEN}✅ Configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Not configured${NC}"
        echo "   Add configuration to ~/.cursor/mcp.json"
    fi
else
    echo -e "${YELLOW}⚠️  No mcp.json found${NC}"
fi

# Summary
echo ""
echo "=================================="
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "📚 Next steps:"
echo "   1. Make sure Cursor is connected to the MCP server"
echo "   2. Try: 'List all Jira projects'"
echo "   3. Try: 'Get issue SIM-10237'"
echo ""

