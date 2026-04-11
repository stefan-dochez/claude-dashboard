import * as pty from 'node-pty';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import type { AppConfig } from './config.js';
import { IS_WINDOWS, PATH_SEP, getExtraPaths, PTY_TERM_NAME } from './platform.js';
import { TIMEOUTS, LIMITS, PTY_DEFAULTS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('process-manager');

function resolveClaudeBinary(): string {
  const exeNames = IS_WINDOWS ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];

  // Check well-known locations directly (no shell, no output pollution)
  const candidateDirs = getExtraPaths();

  for (const dir of candidateDirs) {
    for (const exe of exeNames) {
      const candidate = path.join(dir, exe);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        log.info(`Resolved claude binary: ${candidate}`);
        return candidate;
      } catch {
        // Not found or not executable
      }
    }
  }

  // Last resort: check PATH entries
  const pathDirs = (process.env.PATH ?? '').split(PATH_SEP);
  for (const dir of pathDirs) {
    for (const exe of exeNames) {
      const candidate = path.join(dir, exe);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        log.info(`Resolved claude binary from PATH: ${candidate}`);
        return candidate;
      } catch {
        // Not found
      }
    }
  }

  log.warn('Could not resolve claude binary, falling back to "claude"');
  return 'claude';
}

function buildPtyEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  // Ensure common user binary paths are in PATH
  const extraPaths = getExtraPaths();
  const currentPath = env.PATH ?? '';
  const pathParts = currentPath.split(PATH_SEP);
  for (const p of extraPaths) {
    if (!pathParts.includes(p)) {
      pathParts.unshift(p);
    }
  }
  env.PATH = pathParts.join(PATH_SEP);

  // Remove all Claude Code env vars so spawned instances
  // don't think they're nested inside another session
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) {
      delete env[key]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
    }
  }

  return env;
}

const INSTANCE_STATUS = {
  LAUNCHING: 'launching',
  PROCESSING: 'processing',
  WAITING_INPUT: 'waiting_input',
  IDLE: 'idle',
  EXITED: 'exited',
} as const;

type InstanceStatus = typeof INSTANCE_STATUS[keyof typeof INSTANCE_STATUS];

interface Instance {
  id: string;
  projectPath: string;
  projectName: string;
  pid: number;
  status: InstanceStatus;
  createdAt: Date;
  lastActivity: Date;
  taskDescription: string | null;
  worktreePath: string | null;
  parentProjectPath: string | null;
  branchName: string | null;
  lastUserPrompt: string | null;
  firstUserPrompt: string | null;
  sessionId: string | null;
}

interface SpawnOptions {
  projectPath: string;
  taskDescription?: string;
  worktreePath?: string;
  parentProjectPath?: string;
  branchName?: string;
  resumeSessionId?: string;
}

interface PtyHandle {
  process: pty.IPty;
  buffer: string[];
  bufferSize: number;
  instance: Instance;
  inputLineBuffer: string;
}

interface InstanceContext {
  taskDescription: string | null;
  lastUserPrompt: string | null;
}

export class ProcessManager extends EventEmitter {
  private handles = new Map<string, PtyHandle>();
  private readonly claudeBinary: string;

  constructor(private config: AppConfig) {
    super();
    this.claudeBinary = resolveClaudeBinary();
  }

  async spawn(options: SpawnOptions): Promise<Instance> {
    if (this.handles.size >= this.config.maxInstances) {
      throw new Error(`Maximum instances reached (${this.config.maxInstances})`);
    }

    const id = randomUUID();
    const cwd = options.worktreePath ?? options.projectPath;
    const projectName = options.worktreePath
      ? `${path.basename(options.projectPath)} (${options.branchName ?? path.basename(options.worktreePath)})`
      : path.basename(options.projectPath);

    // Build a fresh env each time to avoid stale state after tsx watch reloads
    const env = buildPtyEnv();

    // Build CLI args: either resume an existing session or start a new one with a controlled session ID
    const args: string[] = [];
    let sessionId: string;
    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
      sessionId = options.resumeSessionId;
    } else {
      sessionId = randomUUID();
      args.push('--session-id', sessionId);
    }

    log.info(`Spawning ${this.claudeBinary} in ${cwd} (session ${sessionId}, resume=${!!options.resumeSessionId})`);

    const ptyProcess = pty.spawn(this.claudeBinary, args, {
      name: PTY_TERM_NAME,
      cols: PTY_DEFAULTS.COLS,
      rows: PTY_DEFAULTS.ROWS,
      cwd,
      env,
    });

    const instance: Instance = {
      id,
      projectPath: options.projectPath,
      projectName,
      pid: ptyProcess.pid,
      status: INSTANCE_STATUS.LAUNCHING,
      createdAt: new Date(),
      lastActivity: new Date(),
      taskDescription: options.taskDescription ?? null,
      worktreePath: options.worktreePath ?? null,
      parentProjectPath: options.parentProjectPath ?? null,
      branchName: options.branchName ?? null,
      lastUserPrompt: null,
      firstUserPrompt: null,
      sessionId,
    };

    const handle: PtyHandle = {
      process: ptyProcess,
      buffer: [],
      bufferSize: 0,
      instance,
      inputLineBuffer: '',
    };

    this.handles.set(id, handle);

    ptyProcess.onData((data: string) => {
      handle.instance.lastActivity = new Date();
      this.appendBuffer(handle, data);
      this.emit('output', id, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      handle.instance.status = INSTANCE_STATUS.EXITED;
      this.emit('status', id, INSTANCE_STATUS.EXITED);
      this.emit('exited', id, exitCode);
      log.info(`Instance ${id} exited with code ${exitCode}`);
    });

    log.info(`Spawned instance ${id} (pid ${ptyProcess.pid}) for ${cwd}`);
    this.emit('status', id, INSTANCE_STATUS.LAUNCHING);

    return instance;
  }

  async kill(instanceId: string): Promise<void> {
    const handle = this.handles.get(instanceId);
    if (!handle) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Already exited, just clean up the map
    if (handle.instance.status === INSTANCE_STATUS.EXITED) {
      this.handles.delete(instanceId);
      return;
    }

    const pid = handle.instance.pid;
    log.info(`Killing instance ${instanceId} (pid ${pid})`);

    return new Promise<void>((resolve) => {
      let resolved = false;
      let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
      let giveUpTimeout: ReturnType<typeof setTimeout> | undefined; // eslint-disable-line prefer-const
      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(forceKillTimeout);
        clearTimeout(giveUpTimeout);
        this.handles.delete(instanceId);
        resolve();
      };

      // Listen for exit (only once)
      handle.process.onExit(() => done());

      if (IS_WINDOWS) {
        // On Windows, SIGTERM/SIGKILL via node-pty only kills the shell, not
        // child processes.  taskkill /F /T kills the entire process tree.
        const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
        const taskkillPath = path.join(systemRoot, 'System32', 'taskkill.exe');
        exec(`"${taskkillPath}" /F /T /PID ${pid}`, (err) => {
          if (err) {
            log.warn(`taskkill failed for pid ${pid}: ${err.message}`);
          }
        });
      } else {
        // Send SIGTERM
        try {
          handle.process.kill('SIGTERM');
        } catch {
          done();
          return;
        }

        // SIGKILL after timeout if SIGTERM didn't work
        forceKillTimeout = setTimeout(() => {
          try {
            handle.process.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }, TIMEOUTS.KILL_SIGTERM);
      }

      // Give up after timeout no matter what — clean up and move on
      giveUpTimeout = setTimeout(() => {
        log.warn(`Instance ${instanceId} did not exit in ${TIMEOUTS.KILL_GIVE_UP}ms, force cleaning up`);
        try {
          if (IS_WINDOWS) {
            const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
            exec(`"${path.join(systemRoot, 'System32', 'taskkill.exe')}" /F /T /PID ${pid}`);
          } else {
            process.kill(pid, 'SIGKILL');
          }
        } catch {
          // pid might already be gone
        }
        done();
      }, TIMEOUTS.KILL_GIVE_UP);
    });
  }

  getAll(): Instance[] {
    return Array.from(this.handles.values()).map(h => ({ ...h.instance }));
  }

  get(instanceId: string): Instance | undefined {
    const handle = this.handles.get(instanceId);
    return handle ? { ...handle.instance } : undefined;
  }

  write(instanceId: string, data: string): void {
    const handle = this.handles.get(instanceId);
    if (!handle || handle.instance.status === INSTANCE_STATUS.EXITED) return;
    this.trackInput(handle, data);
    handle.process.write(data);
  }

  getContext(instanceId: string): InstanceContext | undefined {
    const handle = this.handles.get(instanceId);
    if (!handle) return undefined;
    return {
      taskDescription: handle.instance.taskDescription,
      lastUserPrompt: handle.instance.lastUserPrompt,
    };
  }

  private trackInput(handle: PtyHandle, data: string): void {
    // Strip terminal escape sequences before processing
    // Removes: CSI sequences (\x1b[...X), OSC sequences (\x1b]...ST),
    // bracketed paste markers, and other ANSI escapes
    const cleaned = data.replace(/\x1b\[[0-9;?]*[a-zA-Z~]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[^[\]]/g, '');

    for (const ch of cleaned) {
      if (ch === '\r' || ch === '\n') {
        const prompt = handle.inputLineBuffer.trim();
        if (prompt.length > 0) {
          handle.instance.lastUserPrompt = prompt;
          if (!handle.instance.firstUserPrompt) {
            handle.instance.firstUserPrompt = prompt.slice(0, LIMITS.FIRST_PROMPT_LENGTH);
            this.emit('first_prompt', handle.instance.id, handle.instance.firstUserPrompt);
          }
          this.emit('context', handle.instance.id, {
            taskDescription: handle.instance.taskDescription,
            lastUserPrompt: handle.instance.lastUserPrompt,
          });
        }
        handle.inputLineBuffer = '';
      } else if (ch === '\x7f' || ch === '\b') {
        handle.inputLineBuffer = handle.inputLineBuffer.slice(0, -1);
      } else if (ch.charCodeAt(0) >= 32) {
        handle.inputLineBuffer += ch;
      }
    }
  }

  resize(instanceId: string, cols: number, rows: number): void {
    const handle = this.handles.get(instanceId);
    if (!handle || handle.instance.status === INSTANCE_STATUS.EXITED) return;
    handle.process.resize(cols, rows);
  }

  getBuffer(instanceId: string): string {
    const handle = this.handles.get(instanceId);
    if (!handle) return '';
    return handle.buffer.join('');
  }

  updateStatus(instanceId: string, status: InstanceStatus): void {
    const handle = this.handles.get(instanceId);
    if (!handle) return;
    if (handle.instance.status === status) return;
    if (handle.instance.status === INSTANCE_STATUS.EXITED) return;

    handle.instance.status = status;
    this.emit('status', instanceId, status);
  }

  getLastActivity(instanceId: string): Date | undefined {
    return this.handles.get(instanceId)?.instance.lastActivity;
  }

  private appendBuffer(handle: PtyHandle, data: string): void {
    // Store raw chunks to preserve terminal escape sequences
    handle.buffer.push(data);
    handle.bufferSize += data.length;

    // Trim buffer if over byte limit — drop oldest chunks
    while (handle.bufferSize > LIMITS.PTY_BUFFER_BYTES && handle.buffer.length > 1) {
      const removed = handle.buffer.shift()!;
      handle.bufferSize -= removed.length;
    }
  }

  async killAll(): Promise<void> {
    const ids = Array.from(this.handles.keys());
    if (ids.length === 0) return;

    log.info(`Killing all ${ids.length} instances...`);

    // Kill all with a hard ceiling
    await Promise.race([
      Promise.all(ids.map(id => this.kill(id))),
      new Promise<void>(resolve => setTimeout(() => {
        log.warn('killAll hard timeout, force cleaning remaining');
        this.forceDestroyAll();
        resolve();
      }, TIMEOUTS.KILL_ALL)),
    ]);
  }

  private forceDestroyAll(): void {
    for (const [id, handle] of this.handles) {
      try {
        if (IS_WINDOWS) {
          const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
          exec(`"${path.join(systemRoot, 'System32', 'taskkill.exe')}" /F /T /PID ${handle.instance.pid}`);
        } else {
          process.kill(handle.instance.pid, 'SIGKILL');
        }
      } catch {
        // Already gone
      }
      this.handles.delete(id);
    }
  }
}

export { INSTANCE_STATUS };
export type { Instance, InstanceStatus, SpawnOptions, InstanceContext };
