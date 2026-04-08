import path from 'path';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKMessage,
  SDKUserMessage,
  CanUseTool,
  PermissionResult,
  PermissionMode,
  EffortLevel,
} from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from './config.js';

// --------------- Types ---------------

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  stdout?: string;
  stderr?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
  timestamp: string;
}

const INSTANCE_STATUS = {
  PROCESSING: 'processing',
  WAITING_INPUT: 'waiting_input',
  IDLE: 'idle',
  EXITED: 'exited',
} as const;

type StreamInstanceStatus = typeof INSTANCE_STATUS[keyof typeof INSTANCE_STATUS];

export interface StreamInstance {
  id: string;
  projectPath: string;
  projectName: string;
  status: StreamInstanceStatus;
  createdAt: Date;
  lastActivity: Date;
  taskDescription: string | null;
  worktreePath: string | null;
  parentProjectPath: string | null;
  branchName: string | null;
  sessionId: string | null;
  messages: ChatMessage[];
  model: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  effort: string | null;
  permissionMode: string | null;
}

export interface StreamSpawnOptions {
  projectPath: string;
  taskDescription?: string;
  worktreePath?: string;
  parentProjectPath?: string;
  branchName?: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
}

interface PendingPermission {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
  title?: string;
  description?: string;
  resolve: (result: PermissionResult) => void;
}

interface PendingUserQuestion {
  toolUseId: string;
  questions: Array<{
    question: string;
    options?: Array<{ label: string; description?: string }>;
  }>;
  resolve: (result: PermissionResult) => void;
}

interface ProcessHandle {
  instance: StreamInstance;
  conversation: Query | null;
  abortController: AbortController | null;
  inputController: InputController | null;
  pendingPermission: PendingPermission | null;
  pendingUserQuestion: PendingUserQuestion | null;
  approvedTools: Set<string>;
}

// --------------- InputController ---------------

class InputController {
  private queue: SDKUserMessage[] = [];
  private waiting: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  private done = false;

  push(msg: SDKUserMessage): void {
    if (this.done) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: msg, done: false });
    } else {
      this.queue.push(msg);
    }
  }

  end(): void {
    this.done = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
        return new Promise<IteratorResult<SDKUserMessage>>(resolve => {
          this.waiting = resolve;
        });
      },
    };
  }
}

// --------------- StreamProcessManager ---------------

export class StreamProcessManager extends EventEmitter {
  private handles = new Map<string, ProcessHandle>();

  constructor(private config: AppConfig) {
    super();
  }

  async createInstance(options: StreamSpawnOptions): Promise<StreamInstance> {
    if (this.handles.size >= this.config.maxInstances) {
      throw new Error(`Maximum instances reached (${this.config.maxInstances})`);
    }

    const id = randomUUID();
    const projectName = options.worktreePath
      ? `${path.basename(options.projectPath)} (${options.branchName ?? path.basename(options.worktreePath)})`
      : path.basename(options.projectPath);

    const instance: StreamInstance = {
      id,
      projectPath: options.projectPath,
      projectName,
      status: INSTANCE_STATUS.WAITING_INPUT,
      createdAt: new Date(),
      lastActivity: new Date(),
      taskDescription: options.taskDescription ?? null,
      worktreePath: options.worktreePath ?? null,
      parentProjectPath: options.parentProjectPath ?? null,
      branchName: options.branchName ?? null,
      sessionId: null,
      messages: [],
      model: options.model ?? null,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      effort: options.effort ?? null,
      permissionMode: options.permissionMode ?? null,
    };

    const handle: ProcessHandle = {
      instance,
      conversation: null,
      abortController: null,
      inputController: null,
      pendingPermission: null,
      pendingUserQuestion: null,
      approvedTools: new Set(),
    };

    this.handles.set(id, handle);
    this.emit('status', id, INSTANCE_STATUS.WAITING_INPUT);

    console.log(`[stream-process] Created instance ${id} for ${options.worktreePath ?? options.projectPath}`);
    return instance;
  }

  async sendMessage(
    instanceId: string,
    prompt: string,
    options?: {
      model?: string;
      permissionMode?: string;
      effort?: string;
    },
  ): Promise<void> {
    if (!prompt?.trim()) throw new Error('Prompt cannot be empty');

    const handle = this.handles.get(instanceId);
    if (!handle) throw new Error(`Instance ${instanceId} not found`);

    const instance = handle.instance;
    const cwd = instance.worktreePath ?? instance.projectPath;

    if (options?.effort) instance.effort = options.effort;
    if (options?.permissionMode) instance.permissionMode = options.permissionMode;
    if (options?.model) instance.model = options.model;

    // Store user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      timestamp: new Date().toISOString(),
    };
    instance.messages.push(userMessage);
    this.emit('message', instanceId, userMessage);

    // Update status
    instance.status = INSTANCE_STATUS.PROCESSING;
    instance.lastActivity = new Date();
    this.emit('status', instanceId, INSTANCE_STATUS.PROCESSING);

    // If live conversation exists, feed message into it
    if (handle.conversation && handle.inputController) {
      handle.inputController.push({
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
        session_id: instance.sessionId ?? '',
      });
      return;
    }

    // Start new conversation
    const abortController = new AbortController();
    const inputController = new InputController();
    handle.abortController = abortController;
    handle.inputController = inputController;

    const sdkPermissionMode = this.mapPermissionMode(
      options?.permissionMode ?? instance.permissionMode ?? 'default',
    );
    const allowedTools = [...handle.approvedTools];

    // Permission callback
    const canUseTool: CanUseTool = async (toolName, input, callbackOptions) => {
      // AskUserQuestion → emit to frontend
      if (toolName === 'AskUserQuestion') {
        const questions = (input as Record<string, unknown>).questions;
        if (questions && Array.isArray(questions)) {
          return new Promise<PermissionResult>(resolve => {
            handle.pendingUserQuestion = {
              toolUseId: callbackOptions.toolUseID,
              questions: questions as PendingUserQuestion['questions'],
              resolve,
            };
            this.emit('user_question', instanceId, {
              toolUseId: callbackOptions.toolUseID,
              questions,
            });
          });
        }
        return { behavior: 'allow' as const, updatedInput: input };
      }

      // Already approved tools
      if (handle.approvedTools.has(toolName)) {
        return { behavior: 'allow' as const, updatedInput: input };
      }

      // Request permission from frontend
      return new Promise<PermissionResult>(resolve => {
        handle.pendingPermission = {
          toolName,
          toolInput: input,
          toolUseId: callbackOptions.toolUseID,
          title: callbackOptions.title,
          description: callbackOptions.description,
          resolve,
        };

        this.emit('permission_request', instanceId, {
          toolName,
          toolInput: input,
          toolUseId: callbackOptions.toolUseID,
          title: callbackOptions.title,
          description: callbackOptions.description,
        });
      });
    };

    // Push initial message
    inputController.push({
      type: 'user',
      message: { role: 'user', content: prompt },
      parent_tool_use_id: null,
      session_id: instance.sessionId ?? '',
    });

    // Start SDK conversation
    const conversation = query({
      prompt: inputController,
      options: {
        cwd,
        abortController,
        permissionMode: sdkPermissionMode,
        allowedTools,
        canUseTool,
        includePartialMessages: true,
        effort: this.mapEffort(options?.effort ?? instance.effort),
        persistSession: true,
        model: options?.model ?? instance.model ?? undefined,
        ...(instance.sessionId ? { resume: instance.sessionId } : {}),
      },
    });
    handle.conversation = conversation;

    // Process in background
    this.processConversation(instanceId, conversation).catch(err => {
      console.log(`[stream-process] Conversation error for ${instanceId}:`, err);
    });
  }

  private async processConversation(instanceId: string, conversation: Query): Promise<void> {
    const handle = this.handles.get(instanceId);
    if (!handle) return;
    const instance = handle.instance;

    let assistantBlocks: ContentBlock[] = [];

    try {
      for await (const msg of conversation) {
        if (!this.handles.has(instanceId)) break;

        this.handleSDKMessage(instanceId, msg, assistantBlocks);

        // On 'result', flush assistant blocks
        if (msg.type === 'result') {
          if (assistantBlocks.length > 0) {
            const chatMsg: ChatMessage = {
              role: 'assistant',
              content: assistantBlocks,
              timestamp: new Date().toISOString(),
            };
            instance.messages.push(chatMsg);
            this.emit('message', instanceId, chatMsg);
            assistantBlocks = [];
          }

          // Update cost/usage
          if ('total_cost_usd' in msg) {
            instance.totalCostUsd = msg.total_cost_usd;
          }
          if ('usage' in msg && msg.usage) {
            instance.totalInputTokens = msg.usage.input_tokens;
            instance.totalOutputTokens = msg.usage.output_tokens;
          }

          this.emit('result', instanceId, {
            costUsd: 'total_cost_usd' in msg ? msg.total_cost_usd : 0,
            durationMs: msg.duration_ms,
            inputTokens: msg.usage?.input_tokens ?? 0,
            outputTokens: msg.usage?.output_tokens ?? 0,
          });

          instance.status = INSTANCE_STATUS.WAITING_INPUT;
          instance.lastActivity = new Date();
          this.emit('status', instanceId, INSTANCE_STATUS.WAITING_INPUT);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(`[stream-process] Conversation aborted for ${instanceId}`);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`[stream-process] Conversation error for ${instanceId}:`, errorMsg);
        this.emit('error', instanceId, errorMsg);
      }
    }

    // Flush remaining
    if (assistantBlocks.length > 0) {
      const chatMsg: ChatMessage = {
        role: 'assistant',
        content: assistantBlocks,
        timestamp: new Date().toISOString(),
      };
      instance.messages.push(chatMsg);
      this.emit('message', instanceId, chatMsg);
    }

    // Cleanup
    handle.conversation = null;
    handle.abortController = null;
    handle.inputController = null;

    if (instance.status !== INSTANCE_STATUS.EXITED) {
      instance.status = INSTANCE_STATUS.WAITING_INPUT;
      instance.lastActivity = new Date();
      this.emit('status', instanceId, INSTANCE_STATUS.WAITING_INPUT);
    }
  }

  private handleSDKMessage(instanceId: string, msg: SDKMessage, assistantBlocks: ContentBlock[]): void {
    const handle = this.handles.get(instanceId);
    if (!handle) return;
    const instance = handle.instance;

    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          instance.sessionId = msg.session_id;
          this.emit('session', instanceId, {
            sessionId: msg.session_id,
            model: msg.model,
            tools: msg.tools,
            mcpServers: msg.mcp_servers,
            permissionMode: msg.permissionMode,
          });
        }
        break;
      }

      case 'assistant': {
        // Process content blocks from the assistant message
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            const cb: ContentBlock = { type: 'text', text: block.text };
            assistantBlocks.push(cb);
            this.emit('content_block', instanceId, cb);
          } else if (block.type === 'thinking') {
            const cb: ContentBlock = { type: 'thinking', thinking: block.thinking };
            assistantBlocks.push(cb);
            this.emit('content_block', instanceId, cb);
          } else if (block.type === 'tool_use') {
            const cb: ContentBlock = {
              type: 'tool_use',
              name: block.name,
              input: block.input,
              tool_use_id: block.id,
            };
            assistantBlocks.push(cb);
            this.emit('content_block', instanceId, cb);
          }
        }
        break;
      }

      case 'user': {
        // Tool results come as user messages
        if ('tool_use_result' in msg && msg.tool_use_result) {
          const result = msg.tool_use_result as Record<string, unknown>;
          const cb: ContentBlock = {
            type: 'tool_result',
            tool_use_id: (result.tool_use_id as string) ?? undefined,
            content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
            is_error: (result.is_error as boolean) ?? false,
          };
          assistantBlocks.push(cb);
          this.emit('content_block', instanceId, cb);
        }
        break;
      }

      case 'stream_event': {
        // Partial streaming events
        const event = msg.event;
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            this.emit('stream_delta', instanceId, { text: delta.text });
          } else if (delta.type === 'thinking_delta') {
            this.emit('stream_delta', instanceId, { thinking: delta.thinking });
          }
        }
        break;
      }

      case 'tool_progress': {
        this.emit('tool_progress', instanceId, {
          toolUseId: msg.tool_use_id,
          toolName: msg.tool_name,
          elapsedSeconds: msg.elapsed_time_seconds,
        });
        // Emit activity hint for sidebar
        this.emit('activity', instanceId, msg.tool_name);
        break;
      }

      case 'rate_limit_event': {
        this.emit('rate_limit', instanceId, msg.rate_limit_info);
        break;
      }
    }

    instance.lastActivity = new Date();
  }

  // --------------- Permission / Question handling ---------------

  approveTool(instanceId: string, toolName: string): void {
    const handle = this.handles.get(instanceId);
    if (!handle) return;
    handle.approvedTools.add(toolName);

    if (handle.pendingPermission?.toolName === toolName) {
      const pending = handle.pendingPermission;
      handle.pendingPermission = null;
      pending.resolve({ behavior: 'allow', updatedInput: pending.toolInput });
    }
  }

  resolvePermission(instanceId: string, toolUseId: string, allow: boolean, message?: string): void {
    const handle = this.handles.get(instanceId);
    if (!handle?.pendingPermission) return;
    if (handle.pendingPermission.toolUseId !== toolUseId) return;

    const pending = handle.pendingPermission;
    handle.pendingPermission = null;

    if (allow) {
      pending.resolve({ behavior: 'allow', updatedInput: pending.toolInput });
    } else {
      pending.resolve({ behavior: 'deny', message: message ?? 'User denied this action' });
    }
  }

  resolveUserQuestion(instanceId: string, toolUseId: string, answer: string): void {
    const handle = this.handles.get(instanceId);
    if (!handle?.pendingUserQuestion) return;
    if (handle.pendingUserQuestion.toolUseId !== toolUseId) return;

    const pending = handle.pendingUserQuestion;
    handle.pendingUserQuestion = null;
    pending.resolve({ behavior: 'allow', updatedInput: { answer } });
  }

  // --------------- Interrupt ---------------

  async interrupt(instanceId: string): Promise<void> {
    const handle = this.handles.get(instanceId);
    if (!handle) return;
    if (handle.conversation) {
      try { await handle.conversation.interrupt(); } catch { /* ignore */ }
    }
    handle.instance.status = INSTANCE_STATUS.WAITING_INPUT;
    handle.instance.lastActivity = new Date();
    this.emit('status', instanceId, INSTANCE_STATUS.WAITING_INPUT);
  }

  // --------------- Lifecycle ---------------

  getAll(): StreamInstance[] {
    return Array.from(this.handles.values()).map(h => ({ ...h.instance }));
  }

  get(instanceId: string): StreamInstance | undefined {
    const handle = this.handles.get(instanceId);
    return handle ? { ...handle.instance } : undefined;
  }

  getMessages(instanceId: string): ChatMessage[] {
    const handle = this.handles.get(instanceId);
    return handle ? [...handle.instance.messages] : [];
  }

  async kill(instanceId: string): Promise<void> {
    const handle = this.handles.get(instanceId);
    if (!handle) throw new Error(`Instance ${instanceId} not found`);

    if (handle.conversation) {
      try { handle.conversation.return(undefined); } catch { /* ignore */ }
    }
    if (handle.inputController) {
      handle.inputController.end();
    }
    if (handle.pendingPermission) {
      handle.pendingPermission.resolve({ behavior: 'deny', message: 'Instance killed' });
      handle.pendingPermission = null;
    }
    if (handle.pendingUserQuestion) {
      handle.pendingUserQuestion.resolve({ behavior: 'deny', message: 'Instance killed' });
      handle.pendingUserQuestion = null;
    }

    handle.instance.status = INSTANCE_STATUS.EXITED;
    this.emit('status', instanceId, INSTANCE_STATUS.EXITED);
    this.emit('exited', instanceId, 0);
    this.handles.delete(instanceId);
  }

  async killAll(): Promise<void> {
    const ids = Array.from(this.handles.keys());
    await Promise.all(ids.map(id => this.kill(id)));
  }

  // --------------- Helpers ---------------

  private mapPermissionMode(mode: string): PermissionMode {
    switch (mode) {
      case 'plan': return 'plan';
      case 'auto-edit': return 'acceptEdits';
      case 'full-access': return 'bypassPermissions';
      default: return 'default';
    }
  }

  private mapEffort(effort: string | null): EffortLevel | undefined {
    switch (effort) {
      case 'low': return 'low';
      case 'medium': return 'medium';
      case 'high': return 'high';
      default: return undefined;
    }
  }
}

export { INSTANCE_STATUS as STREAM_INSTANCE_STATUS };
