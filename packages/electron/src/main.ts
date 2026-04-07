import { app, BrowserWindow, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

const isDev = process.argv.includes('--dev');
const BACKEND_PORT = 3200;
const FRONTEND_PORT = 5173;

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// --------------- Backend lifecycle ---------------

function getBackendCwd(): string {
  if (isDev) {
    return path.resolve(__dirname, '..', '..', 'backend');
  }
  // In production, backend is in resources/backend
  return path.join(process.resourcesPath, 'backend');
}

function startBackend(): ChildProcess {
  const cwd = getBackendCwd();
  const env = {
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
    PORT: String(BACKEND_PORT),
  };

  if (isDev) {
    // Dev: use tsx watch
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return spawn(npmCmd, ['run', 'dev'], { cwd, env, stdio: 'pipe' });
  } else {
    // Prod: run compiled backend
    return spawn('node', ['dist/index.js'], { cwd, env, stdio: 'pipe' });
  }
}

function waitForBackend(port: number, maxAttempts = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          reject(new Error('Backend did not start'));
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          reject(new Error('Backend did not start'));
        }
      });
      req.end();
    };
    check();
  });
}

function killBackend() {
  if (!backendProcess) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(backendProcess.pid)]);
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
    ? path.resolve(__dirname, '..', 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png')
    : path.join(process.resourcesPath, 'icon', process.platform === 'darwin' ? 'icon.icns' : 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Claude Dashboard',
    icon: iconPath,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
  } else {
    // In production, backend serves the frontend
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
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
  // Check if backend is already running (dev servers started separately)
  const backendAlreadyRunning = await isPortInUse(BACKEND_PORT);

  if (!backendAlreadyRunning) {
    // Start backend
    backendProcess = startBackend();

    backendProcess.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[backend] ${data}`);
    });
    backendProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[backend] ${data}`);
    });
  }

  // Wait for servers to be ready
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
    console.error('Failed to start servers:', err);
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
  // macOS: re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});
