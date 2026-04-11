#!/usr/bin/env node
// Cross-platform postinstall: ensure node-pty prebuilt binaries are executable.
// On Unix this sets +x; on Windows it's a no-op (permissions work differently).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform === 'win32') {
  // Windows: no chmod needed — binaries are executable by default
  process.exit(0);
}

// Look for node-pty in multiple locations:
// 1. Monorepo hoisted: ../../.. (root node_modules)
// 2. Local: ../node_modules (standalone install, e.g. _pkg/)
const candidates = [
  path.resolve(__dirname, '..', '..', '..', 'node_modules', 'node-pty', 'prebuilds'),
  path.resolve(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds'),
];
const prebuildsDir = candidates.find(p => fs.existsSync(p));

try {
  if (!prebuildsDir) {
    // node-pty prebuilds not found in any known location — skip silently
    process.exit(0);
  }

  const platforms = fs.readdirSync(prebuildsDir);
  for (const platform of platforms) {
    const platformDir = path.join(prebuildsDir, platform);
    if (!fs.statSync(platformDir).isDirectory()) continue;

    for (const file of fs.readdirSync(platformDir)) {
      if (file === 'spawn-helper' || file.endsWith('.node')) {
        const filePath = path.join(platformDir, file);
        try {
          fs.chmodSync(filePath, 0o755);
        } catch {
          // Non-fatal — file may not exist for this platform
        }
      }
    }
  }
} catch {
  // Non-fatal — don't block npm install
}
