import type { Server, Socket } from 'socket.io';
import type { ProcessManager, InstanceContext } from './process-manager.js';
import type { TaskStore } from './task-store.js';
import { generateSessionTitle } from './title-generator.js';
import { createLogger } from './logger.js';

const log = createLogger('socket');

export function setupSocketHandlers(io: Server, processManager: ProcessManager, taskStore?: TaskStore): () => void {
  // Track which sockets are attached to which instances
  const attachments = new Map<string, Set<string>>(); // instanceId -> Set<socketId>

  // Named handlers so they can be removed on cleanup
  const onOutput = (instanceId: string, data: string) => {
    const sockets = attachments.get(instanceId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      io.to(socketId).emit('terminal:output', { instanceId, data });
    }
  };

  const onStatus = (instanceId: string, status: string) => {
    io.emit('instance:status', { instanceId, status });
  };

  const onExited = (instanceId: string, exitCode: number) => {
    io.emit('instance:exited', { instanceId, exitCode });
  };

  const onContext = (instanceId: string, context: InstanceContext) => {
    io.emit('instance:context', { instanceId, ...context });
  };

  const onFirstPrompt = (instanceId: string, firstPrompt: string) => {
    if (taskStore) {
      const instance = processManager.get(instanceId);
      if (instance) {
        taskStore.addTask({
          id: instanceId,
          projectPath: instance.projectPath,
          projectName: instance.projectName,
          worktreePath: instance.worktreePath,
          branchName: instance.branchName,
          taskDescription: instance.taskDescription,
          sessionId: instance.sessionId,
          model: null,
          totalCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          mode: 'terminal',
          firstPrompt,
          title: null,
          createdAt: instance.createdAt.toISOString(),
          endedAt: null,
        });
        generateSessionTitle(taskStore, instanceId, firstPrompt);
      }
    }
  };

  processManager.on('output', onOutput);
  processManager.on('status', onStatus);
  processManager.on('exited', onExited);
  processManager.on('context', onContext);
  processManager.on('first_prompt', onFirstPrompt);

  io.on('connection', (socket: Socket) => {
    log.info(`Client connected: ${socket.id}`);

    socket.on('terminal:attach', ({ instanceId }: { instanceId: string }) => {
      log.debug(`${socket.id} attaching to ${instanceId}`);

      // Capture the buffer snapshot, add to attachments, THEN send history.
      // This order ensures no output is lost between the snapshot and the
      // live forwarding.  The client gates live output behind a flag that
      // only turns on after receiving history, so any overlap is harmless.
      let buffer = '';
      try {
        buffer = processManager.getBuffer(instanceId);
      } catch (err) {
        log.error(`Error getting buffer for ${instanceId}:`, err);
      }

      // Track attachment BEFORE sending history so no output slips through
      if (!attachments.has(instanceId)) {
        attachments.set(instanceId, new Set());
      }
      attachments.get(instanceId)!.add(socket.id);

      // Now send history — client ignores live output until this arrives
      socket.emit('terminal:history', { instanceId, data: buffer });

      // Also send current context data on attach
      const context = processManager.getContext(instanceId);
      if (context) {
        socket.emit('instance:context', { instanceId, ...context });
      }
    });

    socket.on('terminal:detach', ({ instanceId }: { instanceId: string }) => {
      const wasAttached = attachments.get(instanceId)?.delete(socket.id) ?? false;
      if (wasAttached) {
        log.debug(`${socket.id} detaching from ${instanceId}`);
      }
    });

    socket.on('terminal:input', ({ instanceId, data }: { instanceId: string; data: string }) => {
      try {
        processManager.write(instanceId, data);
      } catch (err) {
        log.error(`Error writing to ${instanceId}:`, err);
      }
    });

    socket.on('terminal:resize', ({ instanceId, cols, rows }: { instanceId: string; cols: number; rows: number }) => {
      try {
        processManager.resize(instanceId, cols, rows);
      } catch (err) {
        log.error(`Error resizing ${instanceId}:`, err);
      }
    });

    socket.on('disconnect', () => {
      log.info(`Client disconnected: ${socket.id}`);
      for (const [, sockets] of attachments) {
        sockets.delete(socket.id);
      }
    });
  });

  // Return cleanup function to remove all listeners
  return () => {
    processManager.off('output', onOutput);
    processManager.off('status', onStatus);
    processManager.off('exited', onExited);
    processManager.off('context', onContext);
    processManager.off('first_prompt', onFirstPrompt);
  };
}
