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
import { PrAggregator } from './pr-aggregator.js';
import { CiStatusService } from './ci-status.js';
import { UpdateChecker } from './update-checker.js';
import { PluginsManager } from './plugins-manager.js';
import { runHealthCheck } from './health.js';
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
  const prAggregator = new PrAggregator();
  const ciStatusService = new CiStatusService(prAggregator);
  const appVersion = await readVersion();
  log.info(`Version: ${appVersion}`);
  const updateChecker = new UpdateChecker(appVersion, process.env.UPDATE_REPO);
  const pluginsManager = new PluginsManager();

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
  const routes = createRoutes(configService, scanner, processManager, streamProcess, worktreeManager, taskStore, appVersion, ideService, prAggregator, ciStatusService, updateChecker, pluginsManager, io);
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
  const socketOptions = { generateTitles: config.generateTitles };
  setupSocketHandlers(io, processManager, taskStore, socketOptions);
  setupStreamSocketHandlers(io, streamProcess, taskStore, socketOptions);

  // Start status monitoring
  statusMonitor.start();

  // Initial project scan
  scanner.scan().catch(err => {
    log.warn('Initial scan failed:', err);
  });

  // Branch-refresh loop — instances can switch the checked-out branch of their
  // project/parent (e.g. `git checkout -b …` from a terminal instance), and
  // the scanner cache holds the branch seen at scan time. Re-query gitBranch
  // for every project that has at least one active instance (plus its
  // parent, in case the instance runs in a worktree pointing back to the
  // main repo), and emit `project:updated` when it actually changes.
  const collectActiveProjectPaths = (): Set<string> => {
    const paths = new Set<string>();
    for (const inst of processManager.getAll()) {
      if (inst.projectPath) paths.add(inst.projectPath);
      if (inst.parentProjectPath) paths.add(inst.parentProjectPath);
    }
    for (const inst of streamProcess.getAll()) {
      if (inst.projectPath) paths.add(inst.projectPath);
      if (inst.parentProjectPath) paths.add(inst.parentProjectPath);
    }
    return paths;
  };

  const refreshBranchesFor = async (paths: Iterable<string>): Promise<void> => {
    for (const p of paths) {
      try {
        const updated = await scanner.refreshProjectBranch(p);
        if (updated) {
          io.emit('project:updated', updated);
        }
      } catch (err) {
        log.warn(`Branch refresh failed for ${p}:`, err);
      }
    }
  };

  const BRANCH_REFRESH_INTERVAL_MS = 20_000;
  const branchRefreshTimer = setInterval(() => {
    const paths = collectActiveProjectPaths();
    if (paths.size === 0) return;
    refreshBranchesFor(paths).catch(() => { /* already logged per-path */ });
  }, BRANCH_REFRESH_INTERVAL_MS);

  const onInstanceExited = (instanceId: string): void => {
    const inst = processManager.get(instanceId) ?? streamProcess.get(instanceId);
    const paths = new Set<string>();
    if (inst?.projectPath) paths.add(inst.projectPath);
    if (inst?.parentProjectPath) paths.add(inst.parentProjectPath);
    if (paths.size === 0) return;
    refreshBranchesFor(paths).catch(() => { /* already logged per-path */ });
  };
  processManager.on('exited', onInstanceExited);
  streamProcess.on('exited', onInstanceExited);

  // Health check at startup
  runHealthCheck().catch(err => {
    log.warn('Health check failed:', err);
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
    clearInterval(branchRefreshTimer);

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
