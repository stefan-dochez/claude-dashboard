import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

export interface UpdateProgress { received: number; total: number }
export interface UpdateStatus { phase: 'downloading' | 'preparing' | 'installing' | 'error'; message?: string }

type Emit = (channel: 'update:progress' | 'update:status', payload: UpdateProgress | UpdateStatus) => void;

/**
 * Download a file over HTTPS, following redirects (GitHub asset URLs redirect
 * to a signed S3/CDN URL). Emits progress via the supplied `emit` callback.
 */
function downloadFile(url: string, destPath: string, emit: Emit): Promise<void> {
  return new Promise((resolve, reject) => {
    const go = (currentUrl: string, redirectsLeft: number) => {
      const lib = currentUrl.startsWith('https:') ? https : http;
      const req = lib.get(currentUrl, { headers: { 'User-Agent': 'claude-dashboard-updater' } }, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          res.resume();
          go(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10) || 0;
        let received = 0;
        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          emit('update:progress', { received, total });
        });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
    };
    go(url, 5);
  });
}

/**
 * macOS: write a detached shell script that waits for the current app to
 * exit, mounts the DMG, swaps the .app bundle in place, strips the
 * quarantine attribute, detaches the volume, cleans up, and relaunches.
 */
function buildMacSwapScript(opts: {
  dmgPath: string;
  appBundlePath: string;
  appName: string;
  pid: number;
  logPath: string;
}): string {
  const { dmgPath, appBundlePath, appName, pid, logPath } = opts;
  const esc = (s: string) => s.replace(/"/g, '\\"');
  // shell-quote arguments for safe expansion inside double quotes
  return `#!/bin/bash
set -u
exec >> "${esc(logPath)}" 2>&1
echo "[updater $(date)] waiting for pid ${pid} to exit"
# Wait up to 30s for the old process to exit
for i in $(seq 1 60); do
  if ! kill -0 ${pid} 2>/dev/null; then break; fi
  sleep 0.5
done
echo "[updater $(date)] mounting ${esc(dmgPath)}"
VOLUME=$(hdiutil attach "${esc(dmgPath)}" -nobrowse -noautoopen | tail -n1 | awk -F'\\t' '{print $NF}')
if [ -z "$VOLUME" ]; then
  echo "[updater $(date)] ERROR: failed to mount DMG"
  exit 1
fi
echo "[updater $(date)] mounted at $VOLUME"
SRC_APP=$(find "$VOLUME" -maxdepth 1 -name "*.app" -type d | head -n1)
if [ -z "$SRC_APP" ]; then
  echo "[updater $(date)] ERROR: no .app found in mounted volume"
  hdiutil detach "$VOLUME" -force || true
  exit 1
fi
echo "[updater $(date)] source: $SRC_APP"
echo "[updater $(date)] target: ${esc(appBundlePath)}"
# Move old .app aside before copying so we can roll back if copy fails
BACKUP="${esc(appBundlePath)}.old-$$"
mv "${esc(appBundlePath)}" "$BACKUP" || { echo "[updater] ERROR: cannot move old bundle"; hdiutil detach "$VOLUME" -force || true; exit 1; }
cp -R "$SRC_APP" "${esc(appBundlePath)}" || {
  echo "[updater] ERROR: copy failed, rolling back"
  rm -rf "${esc(appBundlePath)}" || true
  mv "$BACKUP" "${esc(appBundlePath)}" || true
  hdiutil detach "$VOLUME" -force || true
  exit 1
}
xattr -dr com.apple.quarantine "${esc(appBundlePath)}" 2>/dev/null || true
rm -rf "$BACKUP" || true
hdiutil detach "$VOLUME" -force || true
rm -f "${esc(dmgPath)}" || true
echo "[updater $(date)] relaunching ${esc(appName)}"
open -a "${esc(appName)}"
`;
}

async function applyMacUpdate(dmgPath: string, emit: Emit): Promise<void> {
  // /Applications/Claude Dashboard.app/Contents/MacOS/Claude Dashboard
  //   → dirname ×3 → /Applications/Claude Dashboard.app
  const execPath = process.execPath;
  const appBundlePath = path.dirname(path.dirname(path.dirname(execPath)));
  if (!appBundlePath.endsWith('.app')) {
    throw new Error(`Cannot determine .app bundle (execPath=${execPath})`);
  }
  // Write-access sanity check — /Applications is usually writable by admin
  // users without sudo, but fail fast with a clear message otherwise.
  try {
    fs.accessSync(path.dirname(appBundlePath), fs.constants.W_OK);
  } catch {
    throw new Error(`No write access to ${path.dirname(appBundlePath)} — install location requires admin privileges`);
  }

  const scriptPath = path.join(os.tmpdir(), `claude-dashboard-update-${Date.now()}.sh`);
  const logPath = path.join(os.homedir(), '.claude-dashboard', 'logs', 'updater.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const script = buildMacSwapScript({
    dmgPath,
    appBundlePath,
    appName: app.getName(),
    pid: process.pid,
    logPath,
  });
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  emit('update:status', { phase: 'installing', message: 'Relaunching…' });

  // Detached: survives parent exit. Logs redirected to updater.log inside the script.
  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Small delay to let the detached process actually start before we quit
  await new Promise<void>(r => setTimeout(r, 200));
  // Close windows first so renderer doesn't re-trigger anything
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  app.quit();
}

async function applyWindowsUpdate(exePath: string, emit: Emit): Promise<void> {
  emit('update:status', { phase: 'installing', message: 'Launching installer…' });
  // NSIS installer built by electron-builder accepts `/S` for silent install.
  // It waits for the existing instance to exit and relaunches itself.
  const child = spawn(exePath, ['/S'], { detached: true, stdio: 'ignore' });
  child.unref();
  await new Promise<void>(r => setTimeout(r, 200));
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  app.quit();
}

export async function installUpdate(
  assetUrl: string,
  assetName: string,
  emit: Emit,
): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), 'claude-dashboard-update');
  fs.mkdirSync(tmpDir, { recursive: true });
  const destPath = path.join(tmpDir, assetName);

  emit('update:status', { phase: 'downloading', message: `Downloading ${assetName}` });
  await downloadFile(assetUrl, destPath, emit);

  emit('update:status', { phase: 'preparing', message: 'Preparing install…' });
  if (isMac) {
    await applyMacUpdate(destPath, emit);
  } else if (isWin) {
    await applyWindowsUpdate(destPath, emit);
  } else {
    throw new Error(`In-app update not supported on ${process.platform}`);
  }
}
