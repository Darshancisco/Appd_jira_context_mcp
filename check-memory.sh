#!/bin/bash
# check-memory.sh - Monitor MCP Server Memory Usage

echo "🔍 Checking MCP Server Memory Usage..."
echo ""

# Find the process
PID=$(ps aux | grep "node dist/index.js" | grep -v grep | awk '{print $2}')

if [ -z "$PID" ]; then
    echo "❌ MCP Server is not running"
    exit 1
fi

echo "✅ Found MCP Server (PID: $PID)"
echo ""

# Memory in KB
MEM_KB=$(ps aux | grep $PID | grep -v grep | awk '{print $6}')
MEM_MB=$((MEM_KB / 1024))

echo "📊 Current Memory Usage:"
echo "   RAM: ${MEM_MB} MB (${MEM_KB} KB)"
echo ""

# CPU usage
CPU=$(ps aux | grep $PID | grep -v grep | awk '{print $3}')
echo "⚡ CPU Usage: ${CPU}%"
echo ""

# Detailed stats (macOS)
echo "📈 Detailed Stats:"
ps -o pid,ppid,rss,vsz,pcpu,pmem,comm -p $PID

echo ""
echo "💡 Memory Breakdown:"
echo "   RSS (Resident Set Size): Physical RAM used"
echo "   VSZ (Virtual Size): Virtual memory reserved"

