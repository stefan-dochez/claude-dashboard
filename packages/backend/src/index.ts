import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './config.js';
import { ProjectScanner } from './scanner.js';
import { ProcessManager } from './process-manager.js';
import { StatusMonitor } from './status-monitor.js';
import { WorktreeManager } from './worktree-manager.js';
import { createRoutes } from './routes.js';
import { setupSocketHandlers } from './socket.js';

async function main(): Promise<void> {
  // Init services
  const configService = new ConfigService();
  const config = await configService.load();

  const PORT = parseInt(process.env.PORT ?? String(config.port), 10);

  const scanner = new ProjectScanner(configService);
  const processManager = new ProcessManager(config);
  const statusMonitor = new StatusMonitor(processManager, config);
  const worktreeManager = new WorktreeManager();

  // Express + Socket.io setup
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
  }));
  app.use(express.json());

  // Routes
  const routes = createRoutes(configService, scanner, processManager, worktreeManager);
  app.use(routes);

  // WebSocket
  setupSocketHandlers(io, processManager);

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
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`[server] Claude Dashboard backend running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
