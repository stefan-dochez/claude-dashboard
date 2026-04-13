import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './config.js';
import { ProjectScanner } from './scanner.js';
import { ProcessManager } from './process-manager.js';
import { StatusMonitor } from './status-monitor.js';
import { WorktreeManager } from './worktree-manager.js';
import { StreamProcessManager } from './stream-process.js';
import { TaskStore } from './task-store.js';
import { createRoutes } from './routes.js';
import { setupSocketHandlers } from './socket.js';
import { setupStreamSocketHandlers } from './stream-socket.js';
import { IdeService } from './ide-service.js';
import { createLogger } from './logger.js';

const log = createLogger('server');

async function readVersion(): Promise<string> {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // Try ../package.json (from src/ in dev or dist/ in prod)
  const candidates = [
    path.resolve(thisDir, '..', 'package.json'),
    path.resolve(thisDir, '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(await fs.readFile(candidate, 'utf-8'));
      if (pkg.version && pkg.version !== '0.0.0') return pkg.version;
    } catch { /* try next */ }
  }
  return 'dev';
}

async function main(): Promise<void> {
  // Init services
  const configService = new ConfigService();
  const config = await configService.load();

  const PORT = parseInt(process.env.PORT ?? String(config.port), 10);

  const scanner = new ProjectScanner(configService);
  const processManager = new ProcessManager(config);
  const statusMonitor = new StatusMonitor(processManager, config);
  const worktreeManager = new WorktreeManager();
  const taskStore = new TaskStore();
  await taskStore.load();
  const streamProcess = new StreamProcessManager(config);
  const ideService = new IdeService();
  const appVersion = await readVersion();
  log.info(`Version: ${appVersion}`);

  // Express + Socket.io setup
  const app = express();
  const httpServer = createServer(app);
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    `http://localhost:${PORT}`,
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  // Routes
  const routes = createRoutes(configService, scanner, processManager, streamProcess, worktreeManager, taskStore, appVersion, ideService);
  app.use(routes);

  // In production, serve the frontend static files
  if (process.env.NODE_ENV === 'production') {
    const frontendPath = process.env.FRONTEND_PATH ?? path.resolve(__dirname, '..', '..', 'frontend', 'dist');
    app.use(express.static(frontendPath));
    // SPA fallback — serve index.html for any non-API route
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  // WebSocket
  setupSocketHandlers(io, processManager, taskStore);
  setupStreamSocketHandlers(io, streamProcess, taskStore);

  // Start status monitoring
  statusMonitor.start();

  // Initial project scan
  scanner.scan().catch(err => {
    log.warn('Initial scan failed:', err);
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      log.warn('Force exit');
      process.exit(1);
    }
    shuttingDown = true;
    log.info('Shutting down...');
    statusMonitor.stop();

    // End all active tasks in the store before killing processes
    for (const inst of processManager.getAll()) {
      await taskStore.endTask(inst.id);
    }
    for (const inst of streamProcess.getAll()) {
      await taskStore.endTask(inst.id, {
        totalCostUsd: inst.totalCostUsd,
        totalInputTokens: inst.totalInputTokens,
        totalOutputTokens: inst.totalOutputTokens,
      });
    }

    await processManager.killAll();
    await streamProcess.killAll();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(PORT, () => {
    log.info(`Claude Dashboard backend on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  log.error('Fatal error:', err);
  process.exit(1);
});
