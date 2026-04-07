#!/bin/bash
# Launch backend + frontend dev servers, then start Electron when ready
set -e

cd "$(dirname "$0")/.."

# Kill old processes
lsof -ti:3200 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

# Start backend + frontend in background
npm run dev &
DEV_PID=$!

# Wait for both servers
echo "Waiting for servers..."
for i in $(seq 1 30); do
  BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3200/api/health 2>/dev/null || echo "000")
  FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo "000")
  if [ "$BACKEND" = "200" ] && [ "$FRONTEND" = "200" ]; then
    echo "Servers ready"
    break
  fi
  sleep 1
done

# Build and start Electron
cd packages/electron
npx tsc
npx electron dist/main.js --dev

# When Electron closes, kill dev servers
kill $DEV_PID 2>/dev/null
lsof -ti:3200 -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
