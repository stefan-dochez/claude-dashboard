import type { Server, Socket } from 'socket.io';
import type { StreamProcessManager, ChatMessage, ContentBlock } from './stream-process.js';
import type { TaskStore } from './task-store.js';
import { generateSessionTitle } from './title-generator.js';

function instanceRoom(instanceId: string): string {
  return `stream:${instanceId}`;
}

export function setupStreamSocketHandlers(io: Server, streamProcess: StreamProcessManager, taskStore?: TaskStore): () => void {

  // Named handlers for cleanup
  const onMessage = (instanceId: string, message: ChatMessage) => {
    io.to(instanceRoom(instanceId)).emit('chat:message', { instanceId, message });
  };

  const onContentBlock = (instanceId: string, block: ContentBlock) => {
    io.to(instanceRoom(instanceId)).emit('chat:content_block', { instanceId, block });
  };

  const onStreamDelta = (instanceId: string, delta: { text?: string; thinking?: string }) => {
    io.to(instanceRoom(instanceId)).emit('chat:stream_delta', { instanceId, ...delta });
  };

  const onToolProgress = (instanceId: string, progress: { toolUseId: string; toolName: string; elapsedSeconds: number }) => {
    io.to(instanceRoom(instanceId)).emit('chat:tool_progress', { instanceId, ...progress });
  };

  const onPermissionRequest = (instanceId: string, data: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:permission_request', { instanceId, ...data as Record<string, unknown> });
  };

  const onUserQuestion = (instanceId: string, data: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:user_question', { instanceId, ...data as Record<string, unknown> });
  };

  const onSession = (instanceId: string, info: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:session', { instanceId, ...info as Record<string, unknown> });
    if (taskStore) {
      const rec = info as Record<string, unknown>;
      const instance = streamProcess.get(instanceId);
      if (instance) {
        const sessionId = (rec.sessionId as string) ?? null;
        const existingTask = sessionId ? taskStore.findBySessionId(sessionId) : undefined;
        taskStore.addTask({
          id: instanceId,
          projectPath: instance.projectPath,
          projectName: instance.projectName,
          worktreePath: instance.worktreePath,
          branchName: instance.branchName,
          taskDescription: instance.taskDescription,
          sessionId,
          model: (rec.model as string) ?? null,
          totalCostUsd: instance.totalCostUsd,
          totalInputTokens: instance.totalInputTokens,
          totalOutputTokens: instance.totalOutputTokens,
          mode: 'chat',
          firstPrompt: instance.firstPrompt ?? existingTask?.firstPrompt ?? null,
          title: existingTask?.title ?? null,
          createdAt: instance.createdAt.toISOString(),
          endedAt: null,
        });
      }
    }
  };

  const onError = (instanceId: string, error: string) => {
    io.to(instanceRoom(instanceId)).emit('chat:error', { instanceId, error });
  };

  const onRateLimit = (instanceId: string, info: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:rate_limit', { instanceId, ...info as Record<string, unknown> });
  };

  const onStatus = (instanceId: string, status: string) => {
    io.emit('instance:status', { instanceId, status });
  };

  const onExited = (instanceId: string, exitCode: number) => {
    io.emit('instance:exited', { instanceId, exitCode });
  };

  const onResult = (instanceId: string, result: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:result', { instanceId, ...result as Record<string, unknown> });
  };

  const onActivity = (instanceId: string, toolName: string) => {
    io.emit('instance:activity', { instanceId, toolName });
  };

  streamProcess.on('message', onMessage);
  streamProcess.on('content_block', onContentBlock);
  streamProcess.on('stream_delta', onStreamDelta);
  streamProcess.on('tool_progress', onToolProgress);
  streamProcess.on('permission_request', onPermissionRequest);
  streamProcess.on('user_question', onUserQuestion);
  streamProcess.on('session', onSession);
  streamProcess.on('error', onError);
  streamProcess.on('rate_limit', onRateLimit);
  streamProcess.on('status', onStatus);
  streamProcess.on('exited', onExited);
  streamProcess.on('result', onResult);
  streamProcess.on('activity', onActivity);

  // --- Client socket handlers ---

  io.on('connection', (socket: Socket) => {
    socket.on('instance:join', ({ instanceId }: { instanceId: string }) => {
      socket.join(instanceRoom(instanceId));
    });

    socket.on('instance:leave', ({ instanceId }: { instanceId: string }) => {
      socket.leave(instanceRoom(instanceId));
    });

    socket.on('chat:send', async ({ instanceId, prompt, model, permissionMode, effort }: {
      instanceId: string;
      prompt: string;
      model?: string;
      permissionMode?: string;
      effort?: string;
    }) => {
      try {
        const instance = streamProcess.get(instanceId);
        const isFirstPrompt = instance && !instance.firstPrompt;
        await streamProcess.sendMessage(instanceId, prompt, { model, permissionMode, effort });
        // Generate title after the first user message
        if (isFirstPrompt && taskStore) {
          generateSessionTitle(taskStore, instanceId, prompt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        socket.emit('chat:error', { instanceId, error: message });
      }
    });

    socket.on('chat:interrupt', async ({ instanceId }: { instanceId: string }) => {
      try {
        await streamProcess.interrupt(instanceId);
      } catch { /* ignore */ }
    });

    socket.on('chat:approve_tool', ({ instanceId, toolName }: { instanceId: string; toolName: string }) => {
      streamProcess.approveTool(instanceId, toolName);
    });

    socket.on('chat:resolve_permission', ({ instanceId, toolUseId, allow, message }: {
      instanceId: string;
      toolUseId: string;
      allow: boolean;
      message?: string;
    }) => {
      streamProcess.resolvePermission(instanceId, toolUseId, allow, message);
    });

    socket.on('chat:resolve_question', ({ instanceId, toolUseId, answer }: {
      instanceId: string;
      toolUseId: string;
      answer: string;
    }) => {
      streamProcess.resolveUserQuestion(instanceId, toolUseId, answer);
    });
  });

  // Return cleanup function to remove all listeners
  return () => {
    streamProcess.off('message', onMessage);
    streamProcess.off('content_block', onContentBlock);
    streamProcess.off('stream_delta', onStreamDelta);
    streamProcess.off('tool_progress', onToolProgress);
    streamProcess.off('permission_request', onPermissionRequest);
    streamProcess.off('user_question', onUserQuestion);
    streamProcess.off('session', onSession);
    streamProcess.off('error', onError);
    streamProcess.off('rate_limit', onRateLimit);
    streamProcess.off('status', onStatus);
    streamProcess.off('exited', onExited);
    streamProcess.off('result', onResult);
    streamProcess.off('activity', onActivity);
  };
}
