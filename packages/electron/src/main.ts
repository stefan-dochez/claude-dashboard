import { app, BrowserWindow, shell, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';

const isDev = process.argv.includes('--dev');
const BACKEND_PORT = 3200;
const FRONTEND_PORT = 5173;
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// --------------- Logging ---------------

const logDir = path.join(os.homedir(), '.claude-dashboard', 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
const logFile = path.join(logDir, 'electron.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logStream.write(line + '\n');
  process.stdout.write(line + '\n');
}

// --------------- Backend lifecycle ---------------

function getBackendCwd(): string {
  if (isDev) {
    return path.resolve(__dirname, '..', '..', 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

function getEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const sep = isWin ? ';' : ':';
  const currentPath = env.PATH ?? '';
  const parts = currentPath.split(sep);

  if (isWin) {
    // Windows: add common Node.js install locations
    const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
    const appData = env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    const extraPaths = [
      path.join(programFiles, 'nodejs'),
      path.join(appData, 'npm'),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs'),
    ];
    for (const p of extraPaths) {
      if (!parts.includes(p)) parts.push(p);
    }
  } else {
    // macOS/Linux
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
    for (const p of extraPaths) {
      if (!parts.includes(p)) parts.unshift(p);
    }
  }

  env.PATH = parts.join(sep);
  return env;
}

function findNode(): string {
  const candidates = isWin
    ? [
        path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs', 'node.exe'),
      ]
    : [
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
      ];

  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      log(`Found node at: ${c}`);
      return c;
    } catch { /* not found */ }
  }

  // Fallback: rely on PATH
  log('Node not found at known locations, falling back to PATH');
  return isWin ? 'node.exe' : 'node';
}

function startBackend(): ChildProcess {
  const cwd = getBackendCwd();
  const baseEnv = getEnv();

  log(`Starting backend in: ${cwd}`);
  log(`isDev: ${isDev}, platform: ${process.platform}`);

  if (isDev) {
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    return spawn(npmCmd, ['run', 'dev'], {
      cwd,
      env: { ...baseEnv, NODE_ENV: 'development', PORT: String(BACKEND_PORT) },
      stdio: 'pipe',
      shell: isWin,
    });
  } else {
    const nodeBin = findNode();
    log(`Using node: ${nodeBin}`);
    return spawn(nodeBin, [path.join('dist', 'index.js')], {
      cwd,
      env: {
        ...baseEnv,
        NODE_ENV: 'production',
        PORT: String(BACKEND_PORT),
        FRONTEND_PATH: path.join(process.resourcesPath, 'frontend'),
      },
      stdio: 'pipe',
      shell: isWin,
    });
  }
}

function waitForBackend(port: number, maxAttempts = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          log(`Backend ready on port ${port} after ${attempts} attempts`);
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          reject(new Error(`Backend did not start on port ${port}`));
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          reject(new Error(`Backend did not start on port ${port}`));
        }
      });
      req.end();
    };
    check();
  });
}

function killBackend() {
  if (!backendProcess) return;
  log('Killing backend...');
  if (isWin) {
    spawn('taskkill', ['/F', '/T', '/PID', String(backendProcess.pid)], { shell: true });
  } else {
    backendProcess.kill('SIGTERM');
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }
  backendProcess = null;
}

// --------------- Window ---------------

function createWindow() {
  const iconPath = isDev
    ? path.resolve(__dirname, '..', 'assets', isMac ? 'icon.icns' : 'icon.png')
    : path.join(process.resourcesPath, 'icon', isMac ? 'icon.icns' : 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Claude Dashboard',
    icon: iconPath,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = isDev
    ? `http://localhost:${FRONTEND_PORT}`
    : `http://localhost:${BACKEND_PORT}`;

  log(`Loading: ${url}`);
  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    if (linkUrl.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(linkUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --------------- App lifecycle ---------------

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

app.whenReady().then(async () => {
  log(`App starting — version ${app.getVersion()}, platform ${process.platform}, arch ${process.arch}`);
  log(`resourcesPath: ${process.resourcesPath}`);

  const backendAlreadyRunning = await isPortInUse(BACKEND_PORT);
  log(`Backend already running: ${backendAlreadyRunning}`);

  if (!backendAlreadyRunning) {
    backendProcess = startBackend();

    backendProcess.stdout?.on('data', (data: Buffer) => {
      log(`[backend:out] ${data.toString().trim()}`);
    });
    backendProcess.stderr?.on('data', (data: Buffer) => {
      log(`[backend:err] ${data.toString().trim()}`);
    });
    backendProcess.on('error', (err) => {
      log(`[backend:error] ${err.message}`);
      dialog.showErrorBox('Backend Error', `Failed to start backend: ${err.message}\n\nCheck logs at: ${logFile}`);
    });
    backendProcess.on('exit', (code) => {
      log(`[backend:exit] code=${code}`);
      if (code !== 0 && code !== null) {
        dialog.showErrorBox('Backend Crashed', `Backend exited with code ${code}\n\nCheck logs at: ${logFile}`);
      }
    });
  }

  try {
    if (isDev) {
      await Promise.all([
        waitForBackend(BACKEND_PORT),
        waitForBackend(FRONTEND_PORT),
      ]);
    } else {
      await waitForBackend(BACKEND_PORT);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Failed to start: ${msg}`);
    dialog.showErrorBox('Startup Error', `${msg}\n\nCheck logs at: ${logFile}`);
    app.quit();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  killBackend();
  app.quit();
});

app.on('before-quit', () => {
  killBackend();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
