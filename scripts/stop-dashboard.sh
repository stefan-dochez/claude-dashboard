#!/bin/bash
# Stop Claude Dashboard
lsof -ti:3200 -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null
rm -f "$HOME/.claude-dashboard/logs/dashboard.pid"
echo "Claude Dashboard stopped"
