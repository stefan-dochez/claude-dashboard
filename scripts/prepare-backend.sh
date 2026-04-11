#!/bin/bash
# Prepare backend for Electron packaging:
# Install production dependencies in a standalone folder
set -e
cd "$(dirname "$0")/../packages/backend"

# Clean previous
rm -rf _pkg
mkdir _pkg

# Copy package.json and postinstall script
cp package.json _pkg/
cp -r scripts _pkg/

# Install production deps
cd _pkg
npm install --omit=dev 2>&1 | tail -3
rm -f package-lock.json

# Fix node-pty permissions (spawn-helper must be executable)
chmod +x node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true
chmod +x node_modules/node-pty/prebuilds/*/pty.node 2>/dev/null || true

echo "Backend production deps ready in packages/backend/_pkg/node_modules/"
