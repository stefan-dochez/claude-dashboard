import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './config.js';
import { ProjectScanner } from './scanner.js';
import { ProcessManager } from './process-manager.js';
import { StatusMonitor } from './status-monitor.js';
import { WorktreeManager } from './worktree-manager.js';
import { StreamProcessManager } from './stream-process.js';
import { createRoutes } from './routes.js';
import { setupSocketHandlers } from './socket.js';
import { setupStreamSocketHandlers } from './stream-socket.js';

async function main(): Promise<void> {
  // Init services
  const configService = new ConfigService();
  const config = await configService.load();

  const PORT = parseInt(process.env.PORT ?? String(config.port), 10);

  const scanner = new ProjectScanner(configService);
  const processManager = new ProcessManager(config);
  const statusMonitor = new StatusMonitor(processManager, config);
  const worktreeManager = new WorktreeManager();
  const streamProcess = new StreamProcessManager(config);

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
  const routes = createRoutes(configService, scanner, processManager, streamProcess, worktreeManager);
  app.use(routes);

  // In production, serve the frontend static files
  if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
    app.use(express.static(frontendPath));
    // SPA fallback — serve index.html for any non-API route
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  // WebSocket
  setupSocketHandlers(io, processManager);
  setupStreamSocketHandlers(io, streamProcess);

  // Start status monitoring
  statusMonitor.start();

  // Initial project scan
  scanner.scan().catch(err => {
    console.log('[server] Initial scan failed:', err);
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      console.log('[server] Force exit');
      process.exit(1);
    }
    shuttingDown = true;
    console.log('[server] Shutting down...');
    statusMonitor.stop();
    await processManager.killAll();
    await streamProcess.killAll();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`[server] Claude Dashboard backend on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
