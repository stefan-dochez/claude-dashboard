import type { Server, Socket } from 'socket.io';
import type { StreamProcessManager, ChatMessage, ContentBlock } from './stream-process.js';

function instanceRoom(instanceId: string): string {
  return `stream:${instanceId}`;
}

export function setupStreamSocketHandlers(io: Server, streamProcess: StreamProcessManager): void {

  // --- Instance-scoped events (only clients in the room) ---

  streamProcess.on('message', (instanceId: string, message: ChatMessage) => {
    io.to(instanceRoom(instanceId)).emit('chat:message', { instanceId, message });
  });

  streamProcess.on('content_block', (instanceId: string, block: ContentBlock) => {
    io.to(instanceRoom(instanceId)).emit('chat:content_block', { instanceId, block });
  });

  streamProcess.on('stream_delta', (instanceId: string, delta: { text?: string; thinking?: string }) => {
    io.to(instanceRoom(instanceId)).emit('chat:stream_delta', { instanceId, ...delta });
  });

  streamProcess.on('tool_progress', (instanceId: string, progress: { toolUseId: string; toolName: string; elapsedSeconds: number }) => {
    io.to(instanceRoom(instanceId)).emit('chat:tool_progress', { instanceId, ...progress });
  });

  streamProcess.on('permission_request', (instanceId: string, data: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:permission_request', { instanceId, ...data as Record<string, unknown> });
  });

  streamProcess.on('user_question', (instanceId: string, data: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:user_question', { instanceId, ...data as Record<string, unknown> });
  });

  streamProcess.on('session', (instanceId: string, info: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:session', { instanceId, ...info as Record<string, unknown> });
  });

  streamProcess.on('error', (instanceId: string, error: string) => {
    io.to(instanceRoom(instanceId)).emit('chat:error', { instanceId, error });
  });

  streamProcess.on('rate_limit', (instanceId: string, info: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:rate_limit', { instanceId, ...info as Record<string, unknown> });
  });

  // --- Broadcast events (all clients) ---

  streamProcess.on('status', (instanceId: string, status: string) => {
    io.emit('instance:status', { instanceId, status });
  });

  streamProcess.on('exited', (instanceId: string, exitCode: number) => {
    io.emit('instance:exited', { instanceId, exitCode });
  });

  streamProcess.on('result', (instanceId: string, result: unknown) => {
    io.to(instanceRoom(instanceId)).emit('chat:result', { instanceId, ...result as Record<string, unknown> });
  });

  streamProcess.on('activity', (instanceId: string, toolName: string) => {
    io.emit('instance:activity', { instanceId, toolName });
  });

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
        await streamProcess.sendMessage(instanceId, prompt, { model, permissionMode, effort });
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
}
