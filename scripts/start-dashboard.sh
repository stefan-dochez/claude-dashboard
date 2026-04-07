#!/bin/bash
# Start Claude Dashboard backend + frontend
# Usage: ./scripts/start-dashboard.sh

cd "$(dirname "$0")/.." || exit 1

# Kill any existing instance on port 3200
lsof -ti:3200 2>/dev/null | xargs kill -9 2>/dev/null

# Start in background, log to ~/.claude-dashboard/
LOG_DIR="$HOME/.claude-dashboard/logs"
mkdir -p "$LOG_DIR"

npm run dev > "$LOG_DIR/dashboard.log" 2>&1 &
echo $! > "$LOG_DIR/dashboard.pid"

echo "Claude Dashboard started (PID: $(cat "$LOG_DIR/dashboard.pid"))"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3200"
echo "Logs:     $LOG_DIR/dashboard.log"
